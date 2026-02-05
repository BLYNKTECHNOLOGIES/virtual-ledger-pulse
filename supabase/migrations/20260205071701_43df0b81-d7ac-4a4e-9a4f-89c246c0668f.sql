-- 1) Guard table to ensure reversal RPCs run at most once per entity/action
CREATE TABLE IF NOT EXISTS public.reversal_guards (
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_type, entity_id, action)
);

-- Lock down direct access; reversal RPCs run as SECURITY DEFINER
ALTER TABLE public.reversal_guards ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'reversal_guards'
      AND policyname = 'No direct access to reversal guards'
  ) THEN
    CREATE POLICY "No direct access to reversal guards"
    ON public.reversal_guards
    FOR ALL
    USING (false)
    WITH CHECK (false);
  END IF;
END $$;

-- 2) Make sales reversal idempotent + remove manual bank/wallet balance edits (triggers already do this)
CREATE OR REPLACE FUNCTION public.delete_sales_order_with_reversal(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_order RECORD;
    v_payment_method RECORD;
    v_product RECORD;
    v_client_name TEXT;
    v_client RECORD;
    v_guard_inserted int := 0;
BEGIN
    -- Run-once guard
    INSERT INTO public.reversal_guards(entity_type, entity_id, action)
    VALUES ('SALES_ORDER', p_order_id, 'DELETE_WITH_REVERSAL')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_guard_inserted = ROW_COUNT;
    IF v_guard_inserted = 0 THEN
      -- Already reversed/deleted once; do nothing
      RETURN;
    END IF;

    -- Get the order details first
    SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id;

    IF NOT FOUND THEN
        -- If the order is already gone, nothing to do
        RETURN;
    END IF;

    -- Store client name for orphan cleanup and limit reversal
    v_client_name := v_order.client_name;

    -- 0) Delete settlement-related dependent rows FIRST (these have FK to sales_orders)
    DELETE FROM public.payment_gateway_settlement_items WHERE sales_order_id = p_order_id;
    DELETE FROM public.client_onboarding_approvals WHERE sales_order_id = p_order_id;
    DELETE FROM public.pending_settlements WHERE sales_order_id = p_order_id;

    -- 0.1) Delete wallet fee deductions for this order
    DELETE FROM public.wallet_fee_deductions WHERE order_id = p_order_id;

    -- 1) Revert sales payment method usage if payment method exists
    IF v_order.sales_payment_method_id IS NOT NULL THEN
        SELECT bank_account_id, current_usage INTO v_payment_method
        FROM public.sales_payment_methods
        WHERE id = v_order.sales_payment_method_id;

        IF FOUND THEN
            UPDATE public.sales_payment_methods
            SET current_usage = GREATEST(0, COALESCE(current_usage, 0) - COALESCE(v_order.total_amount, 0)),
                updated_at = now()
            WHERE id = v_order.sales_payment_method_id;

            -- IMPORTANT: Do NOT manually update bank_accounts here.
            -- Bank balances are maintained by trigger_update_bank_account_balance on bank_transactions.
            IF v_payment_method.bank_account_id IS NOT NULL THEN
                DELETE FROM public.bank_transactions
                WHERE reference_number = v_order.order_number
                  AND bank_account_id = v_payment_method.bank_account_id;
            END IF;
        END IF;
    END IF;

    -- 1.1) Also delete any Payment Gateway Settlement bank transactions
    DELETE FROM public.bank_transactions
    WHERE reference_number = v_order.order_number
      AND category = 'Payment Gateway Settlement';

    -- 2) Revert client monthly limit usage if client exists
    IF v_client_name IS NOT NULL THEN
        SELECT * INTO v_client FROM public.clients WHERE name = v_client_name;
        IF FOUND THEN
            UPDATE public.clients
            SET current_month_used = GREATEST(0, COALESCE(current_month_used, 0) - COALESCE(v_order.total_amount, 0)),
                updated_at = now()
            WHERE name = v_client_name;
        END IF;
    END IF;

    -- 3) Revert product stock if product is linked
    IF v_order.product_id IS NOT NULL THEN
        SELECT current_stock_quantity, total_sales INTO v_product
        FROM public.products
        WHERE id = v_order.product_id;

        IF FOUND THEN
            UPDATE public.products
            SET current_stock_quantity = COALESCE(current_stock_quantity, 0) + COALESCE(v_order.quantity, 0),
                total_sales = GREATEST(0, COALESCE(total_sales, 0) - COALESCE(v_order.quantity, 0)),
                updated_at = now()
            WHERE id = v_order.product_id;
        END IF;

        -- Remove stock transaction
        DELETE FROM public.stock_transactions
        WHERE reference_number = v_order.order_number
          AND product_id = v_order.product_id;
    END IF;

    -- 4) Delete wallet transaction(s). IMPORTANT: Do NOT manually update wallets here.
    -- Wallet balances are maintained by update_wallet_balance_trigger on wallet_transactions.
    IF v_order.wallet_id IS NOT NULL THEN
        DELETE FROM public.wallet_transactions
        WHERE reference_id = p_order_id
          AND reference_type = 'SALES_ORDER';
    END IF;

    -- 5) Finally delete the sales order (this may trigger cleanup triggers)
    DELETE FROM public.sales_orders WHERE id = p_order_id;

    -- 6) Clean up orphan client if this was their only order
    IF v_client_name IS NOT NULL THEN
        PERFORM public.maybe_delete_orphan_client(v_client_name);
    END IF;
END;
$function$;

-- 3) Make purchase reversal idempotent + remove manual bank/wallet balance edits (triggers already do this)
CREATE OR REPLACE FUNCTION public.delete_purchase_order_with_reversal(order_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  order_record RECORD;
  bank_transaction_record RECORD;
  wallet_transaction_record RECORD;
  stock_transaction_record RECORD;
  supplier_name_to_check text;
  v_guard_inserted int := 0;
BEGIN
  -- Run-once guard
  INSERT INTO public.reversal_guards(entity_type, entity_id, action)
  VALUES ('PURCHASE_ORDER', order_id, 'DELETE_WITH_REVERSAL')
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_guard_inserted = ROW_COUNT;
  IF v_guard_inserted = 0 THEN
    RETURN json_build_object('success', true, 'message', 'Already reversed');
  END IF;

  INSERT INTO public.debug_po_log(operation, payload)
  VALUES ('DELETE_PURCHASE_START', json_build_object('order_id', order_id)::text);

  SELECT * INTO order_record
  FROM public.purchase_orders
  WHERE id = order_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', true, 'message', 'Order already deleted');
  END IF;

  IF order_record.status != 'COMPLETED' THEN
    RETURN json_build_object('success', false, 'error', 'Can only delete completed purchase orders');
  END IF;

  supplier_name_to_check := order_record.supplier_name;

  BEGIN
    -- 0) Delete wallet fee deductions for this order FIRST
    DELETE FROM public.wallet_fee_deductions WHERE order_id = order_id AND order_type = 'PURCHASE';

    -- 1) Reverse purchase payment method usage if exists
    IF order_record.purchase_payment_method_id IS NOT NULL THEN
      UPDATE public.purchase_payment_methods
      SET current_usage = GREATEST(0, COALESCE(current_usage, 0) - COALESCE(order_record.total_amount, 0)),
          updated_at = now()
      WHERE id = order_record.purchase_payment_method_id;
    END IF;

    -- 2) Reverse bank transactions: IMPORTANT do NOT manually update bank_accounts.
    -- Bank balances are maintained by trigger_update_bank_account_balance on bank_transactions.
    FOR bank_transaction_record IN
      SELECT * FROM public.bank_transactions
      WHERE reference_number = order_record.order_number
         OR description LIKE '%' || order_record.order_number || '%'
    LOOP
      DELETE FROM public.bank_transactions WHERE id = bank_transaction_record.id;
    END LOOP;

    -- 3) Reverse wallet transactions: IMPORTANT do NOT manually update wallets.
    -- Wallet balances are maintained by update_wallet_balance_trigger on wallet_transactions.
    FOR wallet_transaction_record IN
      SELECT wt.*
      FROM public.wallet_transactions wt
      WHERE wt.reference_type = 'PURCHASE_ORDER'
        AND wt.reference_id = order_id
    LOOP
      DELETE FROM public.wallet_transactions WHERE id = wallet_transaction_record.id;
    END LOOP;

    -- 4) Reverse stock transactions (stock_transactions uses reference_number).
    -- We keep explicit product updates here because stock update trigger is insert-only.
    FOR stock_transaction_record IN
      SELECT * FROM public.stock_transactions
      WHERE reference_number = order_record.order_number
    LOOP
      IF stock_transaction_record.transaction_type IN ('PURCHASE','IN','STOCK_IN') THEN
        UPDATE public.products
        SET current_stock_quantity = COALESCE(current_stock_quantity, 0) - COALESCE(stock_transaction_record.quantity, 0),
            updated_at = now()
        WHERE id = stock_transaction_record.product_id;
      ELSIF stock_transaction_record.transaction_type IN ('SALE','OUT','STOCK_OUT') THEN
        UPDATE public.products
        SET current_stock_quantity = COALESCE(current_stock_quantity, 0) + COALESCE(stock_transaction_record.quantity, 0),
            updated_at = now()
        WHERE id = stock_transaction_record.product_id;
      END IF;

      DELETE FROM public.stock_transactions WHERE id = stock_transaction_record.id;
    END LOOP;

    -- 5) Finally delete the purchase order
    DELETE FROM public.purchase_orders WHERE id = order_id;

    -- 6) Orphan cleanup
    IF supplier_name_to_check IS NOT NULL THEN
      PERFORM public.maybe_delete_orphan_client(supplier_name_to_check);
    END IF;

    RETURN json_build_object('success', true, 'message', 'Purchase order deleted and reversed');

  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
  END;
END;
$function$;
