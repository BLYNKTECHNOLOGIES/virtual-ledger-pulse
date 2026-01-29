
-- Comprehensive fix: Reverse ALL dependencies when deleting sales and purchase orders
-- This includes: payment method usage, client monthly limits, wallet fee deductions,
-- bank transactions, wallet transactions, stock transactions, pending settlements

-- ============================================
-- FIX delete_sales_order_with_reversal
-- ============================================
CREATE OR REPLACE FUNCTION public.delete_sales_order_with_reversal(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_order RECORD;
    v_payment_method RECORD;
    v_product RECORD;
    v_client_name TEXT;
    v_client RECORD;
BEGIN
    -- Get the order details first
    SELECT * INTO v_order FROM sales_orders WHERE id = p_order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sales order not found';
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
            -- Update payment method usage (reverse the amount)
            UPDATE public.sales_payment_methods
            SET current_usage = GREATEST(0, COALESCE(current_usage, 0) - COALESCE(v_order.total_amount, 0)),
                updated_at = now()
            WHERE id = v_order.sales_payment_method_id;

            -- If bank account linked, remove bank transaction
            IF v_payment_method.bank_account_id IS NOT NULL THEN
                -- For INCOME transactions, reverse by subtracting from balance
                UPDATE public.bank_accounts
                SET balance = balance - COALESCE(v_order.net_amount, v_order.total_amount, 0),
                    updated_at = now()
                WHERE id = v_payment_method.bank_account_id;

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

    -- 4) Delete wallet transaction and restore wallet balance if exists
    IF v_order.wallet_id IS NOT NULL THEN
        DELETE FROM public.wallet_transactions
        WHERE reference_id = p_order_id
          AND reference_type = 'SALES_ORDER';

        -- Restore wallet balance (add back the sold quantity)
        UPDATE public.wallets
        SET current_balance = COALESCE(current_balance, 0) + COALESCE(v_order.quantity, v_order.usdt_amount, 0),
            updated_at = now()
        WHERE id = v_order.wallet_id;
    END IF;

    -- 5) Finally delete the sales order
    DELETE FROM public.sales_orders WHERE id = p_order_id;

    -- 6) Clean up orphan client if this was their only order
    IF v_client_name IS NOT NULL THEN
        PERFORM public.maybe_delete_orphan_client(v_client_name);
    END IF;
END;
$$;

-- ============================================
-- FIX delete_purchase_order_with_reversal
-- ============================================
CREATE OR REPLACE FUNCTION public.delete_purchase_order_with_reversal(order_id uuid)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  order_record RECORD;
  bank_transaction_record RECORD;
  wallet_transaction_record RECORD;
  stock_transaction_record RECORD;
  order_item_record RECORD;
  supplier_name_to_check text;
  v_client RECORD;
BEGIN
  INSERT INTO public.debug_po_log(operation, payload)
  VALUES ('DELETE_PURCHASE_START', json_build_object('order_id', order_id)::text);

  SELECT * INTO order_record
  FROM public.purchase_orders
  WHERE id = order_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Purchase order not found');
  END IF;

  IF order_record.status != 'COMPLETED' THEN
    RETURN json_build_object('success', false, 'error', 'Can only delete completed purchase orders');
  END IF;

  -- Store supplier name before deletion for orphan client check
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

    -- 2) Reverse bank transactions (allow negative)
    FOR bank_transaction_record IN
      SELECT * FROM public.bank_transactions
      WHERE reference_number = order_record.order_number
         OR description LIKE '%' || order_record.order_number || '%'
    LOOP
      IF bank_transaction_record.transaction_type = 'EXPENSE' THEN
        UPDATE public.bank_accounts
        SET balance = balance + bank_transaction_record.amount,
            updated_at = now()
        WHERE id = bank_transaction_record.bank_account_id;
      ELSIF bank_transaction_record.transaction_type = 'INCOME' THEN
        UPDATE public.bank_accounts
        SET balance = balance - bank_transaction_record.amount,
            updated_at = now()
        WHERE id = bank_transaction_record.bank_account_id;
      END IF;

      DELETE FROM public.bank_transactions WHERE id = bank_transaction_record.id;
    END LOOP;

    -- 3) Reverse wallet transactions (wallet_transactions uses reference_id NOT reference_number)
    FOR wallet_transaction_record IN
      SELECT wt.*
      FROM public.wallet_transactions wt
      WHERE wt.reference_type = 'PURCHASE_ORDER'
        AND wt.reference_id = order_id
    LOOP
      IF wallet_transaction_record.transaction_type IN ('STOCK_IN','PURCHASE','IN','CREDIT') THEN
        UPDATE public.wallets
        SET current_balance = current_balance - wallet_transaction_record.amount,
            updated_at = now()
        WHERE id = wallet_transaction_record.wallet_id;
      ELSIF wallet_transaction_record.transaction_type IN ('STOCK_OUT','SALE','OUT','DEBIT') THEN
        UPDATE public.wallets
        SET current_balance = current_balance + wallet_transaction_record.amount,
            updated_at = now()
        WHERE id = wallet_transaction_record.wallet_id;
      END IF;

      DELETE FROM public.wallet_transactions WHERE id = wallet_transaction_record.id;
    END LOOP;

    -- 4) Reverse stock transactions (stock_transactions uses reference_number)
    FOR stock_transaction_record IN
      SELECT * FROM public.stock_transactions
      WHERE reference_number = order_record.order_number
    LOOP
      IF stock_transaction_record.transaction_type IN ('PURCHASE','IN','STOCK_IN') THEN
        UPDATE public.products
        SET current_stock_quantity = current_stock_quantity - stock_transaction_record.quantity,
            updated_at = now()
        WHERE id = stock_transaction_record.product_id;
      ELSIF stock_transaction_record.transaction_type IN ('SALE','OUT','STOCK_OUT') THEN
        UPDATE public.products
        SET current_stock_quantity = current_stock_quantity + stock_transaction_record.quantity,
            updated_at = now()
        WHERE id = stock_transaction_record.product_id;
      END IF;

      DELETE FROM public.stock_transactions WHERE id = stock_transaction_record.id;
    END LOOP;

    -- 5) Reverse non-USDT product stock if no stock_tx exists (allow negative)
    FOR order_item_record IN
      SELECT poi.*, p.code
      FROM public.purchase_order_items poi
      JOIN public.products p ON poi.product_id = p.id
      WHERE poi.purchase_order_id = order_id
        AND p.code != 'USDT'
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM public.stock_transactions
        WHERE reference_number = order_record.order_number
          AND product_id = order_item_record.product_id
      ) THEN
        UPDATE public.products
        SET current_stock_quantity = current_stock_quantity - order_item_record.quantity,
            updated_at = now()
        WHERE id = order_item_record.product_id;
      END IF;
    END LOOP;

    -- 6) Reverse client (seller) monthly limit usage if supplier exists as a client
    IF supplier_name_to_check IS NOT NULL THEN
      SELECT * INTO v_client FROM public.clients WHERE name = supplier_name_to_check;
      
      IF FOUND THEN
        UPDATE public.clients
        SET current_month_used = GREATEST(0, COALESCE(current_month_used, 0) - COALESCE(order_record.total_amount, 0)),
            updated_at = now()
        WHERE name = supplier_name_to_check;
      END IF;
    END IF;

    -- 7) Delete items then order
    DELETE FROM public.purchase_order_items WHERE purchase_order_id = order_id;
    DELETE FROM public.purchase_orders WHERE id = order_id;

    -- 8) Check and delete orphan client if this was their only order
    IF supplier_name_to_check IS NOT NULL AND supplier_name_to_check != '' THEN
      PERFORM public.maybe_delete_orphan_client(supplier_name_to_check);
    END IF;

    INSERT INTO public.debug_po_log(operation, payload)
    VALUES ('DELETE_PURCHASE_SUCCESS', json_build_object('order_id', order_id)::text);

    RETURN json_build_object('success', true, 'message', 'Purchase order and all related transactions successfully deleted');

  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.debug_po_log(operation, payload)
    VALUES ('DELETE_PURCHASE_ERROR', json_build_object('order_id', order_id, 'error', SQLERRM)::text);

    RETURN json_build_object('success', false, 'error', SQLERRM);
  END;
END;
$$;
