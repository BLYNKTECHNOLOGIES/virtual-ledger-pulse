
-- Comprehensive fix for delete_sales_order_with_reversal
-- Ensures ALL related records are properly deleted/reversed:
-- bank_transactions, wallet_transactions (both sale + fee), stock_transactions,
-- wallet_fee_deductions, terminal_sales_sync, pending_settlements,
-- payment_gateway_settlement_items, client_onboarding_approvals,
-- sales_payment_method usage, client monthly_limit reversal

CREATE OR REPLACE FUNCTION public.delete_sales_order_with_reversal(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_order              RECORD;
    v_payment_method     RECORD;
    v_product            RECORD;
    v_client_name        TEXT;
    v_client             RECORD;
    v_guard_inserted     int := 0;
    v_bank_account_id    uuid;
BEGIN
    -- ─── Clear any stale reversal guard so retry always works ───────────────
    DELETE FROM public.reversal_guards
    WHERE entity_type = 'SALES_ORDER'
      AND entity_id   = p_order_id
      AND action      = 'DELETE_WITH_REVERSAL';

    -- Run-once guard (fresh insert after clearing stale)
    INSERT INTO public.reversal_guards(entity_type, entity_id, action)
    VALUES ('SALES_ORDER', p_order_id, 'DELETE_WITH_REVERSAL')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_guard_inserted = ROW_COUNT;
    IF v_guard_inserted = 0 THEN
        RETURN;
    END IF;

    -- ─── Load order ─────────────────────────────────────────────────────────
    SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    v_client_name := v_order.client_name;

    -- ─── STEP 0: Delete ALL FK-child rows first (prevents FK violations) ───

    -- 0a. terminal_sales_sync  (FK: terminal_sales_sync_sales_order_id_fkey)
    DELETE FROM public.terminal_sales_sync
    WHERE sales_order_id = p_order_id;

    -- 0b. payment_gateway_settlement_items
    DELETE FROM public.payment_gateway_settlement_items
    WHERE sales_order_id = p_order_id;

    -- 0c. client_onboarding_approvals
    DELETE FROM public.client_onboarding_approvals
    WHERE sales_order_id = p_order_id;

    -- 0d. pending_settlements (CASCADE delete_rule=c means SET NULL, but explicit is safer)
    DELETE FROM public.pending_settlements
    WHERE sales_order_id = p_order_id;

    -- 0e. wallet_fee_deductions (includes SALES_ORDER_FEE entries)
    DELETE FROM public.wallet_fee_deductions
    WHERE order_id   = p_order_id
       OR order_number = v_order.order_number;

    -- 0f. sales_order_items (if any)
    DELETE FROM public.sales_order_items
    WHERE sales_order_id = p_order_id;

    -- ─── STEP 1: Reverse Sales Payment Method usage & Bank Transaction ──────
    IF v_order.sales_payment_method_id IS NOT NULL THEN
        SELECT spm.bank_account_id, spm.current_usage
        INTO v_payment_method
        FROM public.sales_payment_methods spm
        WHERE spm.id = v_order.sales_payment_method_id;

        IF FOUND THEN
            -- Restore payment method daily/monthly usage counter
            UPDATE public.sales_payment_methods
            SET current_usage = GREATEST(0, COALESCE(current_usage, 0) - COALESCE(v_order.total_amount, 0)),
                updated_at    = now()
            WHERE id = v_order.sales_payment_method_id;

            v_bank_account_id := v_payment_method.bank_account_id;
        END IF;
    END IF;

    -- Delete bank transaction by order_number (balance trigger auto-reverses bank balance)
    DELETE FROM public.bank_transactions
    WHERE reference_number = v_order.order_number;

    -- Also catch any Payment Gateway Settlement bank transactions
    DELETE FROM public.bank_transactions
    WHERE reference_number = v_order.order_number
      AND category = 'Payment Gateway Settlement';

    -- ─── STEP 2: Reverse Client Monthly Usage ───────────────────────────────
    IF v_client_name IS NOT NULL THEN
        UPDATE public.clients
        SET current_month_used = GREATEST(0, COALESCE(current_month_used, 0) - COALESCE(v_order.total_amount, 0)),
            updated_at         = now()
        WHERE LOWER(TRIM(name)) = LOWER(TRIM(v_client_name));
    END IF;

    -- ─── STEP 3: Reverse Stock ───────────────────────────────────────────────
    -- Delete ALL stock transactions for this order number (restores stock via triggers or explicit update)
    DELETE FROM public.stock_transactions
    WHERE reference_number = v_order.order_number;

    -- If product is linked, explicitly add back stock quantity (triggers are insert-only)
    IF v_order.product_id IS NOT NULL THEN
        SELECT current_stock_quantity, total_sales INTO v_product
        FROM public.products
        WHERE id = v_order.product_id;

        IF FOUND THEN
            UPDATE public.products
            SET current_stock_quantity = COALESCE(current_stock_quantity, 0) + COALESCE(v_order.quantity, 0),
                total_sales            = GREATEST(0, COALESCE(total_sales, 0) - COALESCE(v_order.quantity, 0)),
                updated_at             = now()
            WHERE id = v_order.product_id;
        END IF;
    END IF;

    -- ─── STEP 4: Reverse Wallet Transactions (sale debit + fee debit) ────────
    -- Delete ALL wallet_transactions for this order (balance trigger auto-reverses wallet balance)
    DELETE FROM public.wallet_transactions
    WHERE (reference_id   = p_order_id AND reference_type IN ('SALES_ORDER', 'SALES_ORDER_FEE'))
       OR (reference_type = 'SALES_ORDER_FEE' AND description ILIKE '%' || v_order.order_number || '%');

    -- ─── STEP 5: Delete the Sales Order itself ───────────────────────────────
    DELETE FROM public.sales_orders WHERE id = p_order_id;

    -- ─── STEP 6: Orphan Client Cleanup ───────────────────────────────────────
    IF v_client_name IS NOT NULL THEN
        PERFORM public.maybe_delete_orphan_client(v_client_name);
    END IF;

EXCEPTION WHEN OTHERS THEN
    -- Clear the guard so retries are possible after unexpected errors
    DELETE FROM public.reversal_guards
    WHERE entity_type = 'SALES_ORDER'
      AND entity_id   = p_order_id
      AND action      = 'DELETE_WITH_REVERSAL';
    RAISE;
END;
$function$;
