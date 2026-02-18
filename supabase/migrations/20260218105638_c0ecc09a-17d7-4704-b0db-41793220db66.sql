
-- Fix: sales_orders.terminal_sync_id FK references terminal_sales_sync.id
-- Must NULL it out on sales_orders BEFORE deleting terminal_sales_sync rows

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
    v_guard_inserted     int := 0;
BEGIN
    -- ─── Clear any stale reversal guard so retry always works ───────────────
    DELETE FROM public.reversal_guards
    WHERE entity_type = 'SALES_ORDER'
      AND entity_id   = p_order_id
      AND action      = 'DELETE_WITH_REVERSAL';

    -- Run-once guard
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

    -- ─── STEP 0: Break circular FK references BEFORE deleting child rows ────

    -- 0a. NULL out sales_orders.terminal_sync_id first
    --     (sales_orders -> terminal_sales_sync circular FK)
    UPDATE public.sales_orders
    SET terminal_sync_id = NULL
    WHERE id = p_order_id;

    -- ─── STEP 1: Delete ALL FK-child rows ───────────────────────────────────

    -- 1a. terminal_sales_sync (FK: terminal_sales_sync_sales_order_id_fkey)
    DELETE FROM public.terminal_sales_sync
    WHERE sales_order_id = p_order_id;

    -- 1b. payment_gateway_settlement_items
    DELETE FROM public.payment_gateway_settlement_items
    WHERE sales_order_id = p_order_id;

    -- 1c. client_onboarding_approvals
    DELETE FROM public.client_onboarding_approvals
    WHERE sales_order_id = p_order_id;

    -- 1d. pending_settlements
    DELETE FROM public.pending_settlements
    WHERE sales_order_id = p_order_id;

    -- 1e. wallet_fee_deductions (both by order_id and order_number)
    DELETE FROM public.wallet_fee_deductions
    WHERE order_id     = p_order_id
       OR order_number = v_order.order_number;

    -- 1f. sales_order_items
    DELETE FROM public.sales_order_items
    WHERE sales_order_id = p_order_id;

    -- ─── STEP 2: Reverse Sales Payment Method usage & Bank Transactions ─────
    IF v_order.sales_payment_method_id IS NOT NULL THEN
        SELECT bank_account_id, current_usage
        INTO v_payment_method
        FROM public.sales_payment_methods
        WHERE id = v_order.sales_payment_method_id;

        IF FOUND THEN
            -- Restore payment method usage counter
            UPDATE public.sales_payment_methods
            SET current_usage = GREATEST(0, COALESCE(current_usage, 0) - COALESCE(v_order.total_amount, 0)),
                updated_at    = now()
            WHERE id = v_order.sales_payment_method_id;
        END IF;
    END IF;

    -- Delete bank transactions (balance trigger auto-reverses bank balance)
    DELETE FROM public.bank_transactions
    WHERE reference_number = v_order.order_number;

    -- ─── STEP 3: Reverse Client Monthly Usage ───────────────────────────────
    IF v_client_name IS NOT NULL THEN
        UPDATE public.clients
        SET current_month_used = GREATEST(0, COALESCE(current_month_used, 0) - COALESCE(v_order.total_amount, 0)),
            updated_at         = now()
        WHERE LOWER(TRIM(name)) = LOWER(TRIM(v_client_name));
    END IF;

    -- ─── STEP 4: Reverse Stock ───────────────────────────────────────────────
    -- Delete stock transactions first
    DELETE FROM public.stock_transactions
    WHERE reference_number = v_order.order_number;

    -- Explicitly add back product stock quantity (stock triggers are insert-only)
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

    -- ─── STEP 5: Reverse Wallet Transactions (sale + fee) ────────────────────
    -- Delete ALL wallet_transactions for this order (balance trigger auto-reverses wallet)
    DELETE FROM public.wallet_transactions
    WHERE reference_id = p_order_id
      AND reference_type IN ('SALES_ORDER', 'SALES_ORDER_FEE');

    -- Also catch fee transactions linked by order_number in description
    DELETE FROM public.wallet_transactions
    WHERE reference_type = 'SALES_ORDER_FEE'
      AND description ILIKE '%' || v_order.order_number || '%';

    -- ─── STEP 6: Delete the Sales Order itself ───────────────────────────────
    DELETE FROM public.sales_orders WHERE id = p_order_id;

    -- ─── STEP 7: Orphan Client Cleanup ───────────────────────────────────────
    IF v_client_name IS NOT NULL THEN
        PERFORM public.maybe_delete_orphan_client(v_client_name);
    END IF;

EXCEPTION WHEN OTHERS THEN
    -- Clear guard on unexpected errors so retries work
    DELETE FROM public.reversal_guards
    WHERE entity_type = 'SALES_ORDER'
      AND entity_id   = p_order_id
      AND action      = 'DELETE_WITH_REVERSAL';
    RAISE;
END;
$function$;
