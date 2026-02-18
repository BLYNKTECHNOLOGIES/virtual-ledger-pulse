
-- Fix delete_sales_order_with_reversal to also delete terminal_sales_sync rows
-- which have a FK on sales_order_id referencing sales_orders
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
    -- Clear any stale reversal guard so retries always work
    DELETE FROM public.reversal_guards
    WHERE entity_type = 'SALES_ORDER'
      AND entity_id = p_order_id
      AND action = 'DELETE_WITH_REVERSAL';

    -- Run-once guard (fresh insert after clearing stale)
    INSERT INTO public.reversal_guards(entity_type, entity_id, action)
    VALUES ('SALES_ORDER', p_order_id, 'DELETE_WITH_REVERSAL')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_guard_inserted = ROW_COUNT;
    IF v_guard_inserted = 0 THEN
      RETURN;
    END IF;

    -- Get the order details first
    SELECT * INTO v_order FROM public.sales_orders WHERE id = p_order_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    v_client_name := v_order.client_name;

    -- 0) Delete ALL FK-dependent rows before deleting the sales order
    DELETE FROM public.payment_gateway_settlement_items WHERE sales_order_id = p_order_id;
    DELETE FROM public.client_onboarding_approvals WHERE sales_order_id = p_order_id;
    DELETE FROM public.pending_settlements WHERE sales_order_id = p_order_id;
    DELETE FROM public.wallet_fee_deductions WHERE order_id = p_order_id;

    -- 0.2) Delete terminal_sales_sync rows (FK: terminal_sales_sync_sales_order_id_fkey)
    DELETE FROM public.terminal_sales_sync WHERE sales_order_id = p_order_id;

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

        DELETE FROM public.stock_transactions
        WHERE reference_number = v_order.order_number
          AND product_id = v_order.product_id;
    END IF;

    -- 4) Delete wallet transaction(s)
    IF v_order.wallet_id IS NOT NULL THEN
        DELETE FROM public.wallet_transactions
        WHERE reference_id = p_order_id
          AND reference_type = 'SALES_ORDER';
    END IF;

    -- 5) Finally delete the sales order
    DELETE FROM public.sales_orders WHERE id = p_order_id;

    -- 6) Clean up orphan client if this was their only order
    IF v_client_name IS NOT NULL THEN
        PERFORM public.maybe_delete_orphan_client(v_client_name);
    END IF;
END;
$function$;
