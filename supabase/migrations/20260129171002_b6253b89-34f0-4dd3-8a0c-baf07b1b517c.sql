-- Create a function to delete sales order with proper cascading
CREATE OR REPLACE FUNCTION public.delete_sales_order_with_reversal(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_payment_method RECORD;
    v_product RECORD;
    v_client_name TEXT;
BEGIN
    -- Get the order details first
    SELECT * INTO v_order FROM sales_orders WHERE id = p_order_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sales order not found';
    END IF;
    
    -- Store client name for orphan cleanup
    v_client_name := COALESCE(v_order.client_name, v_order.customer_name);
    
    -- 1. Delete related client_onboarding_approvals
    DELETE FROM client_onboarding_approvals WHERE sales_order_id = p_order_id;
    
    -- 2. Revert bank transaction if payment method exists
    IF v_order.sales_payment_method_id IS NOT NULL THEN
        SELECT bank_account_id, current_usage INTO v_payment_method 
        FROM sales_payment_methods 
        WHERE id = v_order.sales_payment_method_id;
        
        IF FOUND AND v_payment_method.bank_account_id IS NOT NULL THEN
            -- Remove the bank transaction
            DELETE FROM bank_transactions 
            WHERE reference_number = v_order.order_number 
            AND bank_account_id = v_payment_method.bank_account_id;
            
            -- Update payment method usage
            UPDATE sales_payment_methods 
            SET current_usage = GREATEST(0, COALESCE(current_usage, 0) - COALESCE(v_order.total_amount, 0)),
                updated_at = now()
            WHERE id = v_order.sales_payment_method_id;
        END IF;
    END IF;
    
    -- 3. Revert product stock if product is linked
    IF v_order.product_id IS NOT NULL THEN
        SELECT current_stock_quantity, total_sales INTO v_product 
        FROM products 
        WHERE id = v_order.product_id;
        
        IF FOUND THEN
            UPDATE products 
            SET current_stock_quantity = COALESCE(current_stock_quantity, 0) + COALESCE(v_order.quantity, 0),
                total_sales = GREATEST(0, COALESCE(total_sales, 0) - COALESCE(v_order.quantity, 0)),
                updated_at = now()
            WHERE id = v_order.product_id;
        END IF;
        
        -- Remove stock transaction
        DELETE FROM stock_transactions 
        WHERE reference_number = v_order.order_number 
        AND product_id = v_order.product_id;
    END IF;
    
    -- 4. Delete wallet transaction if exists
    IF v_order.wallet_id IS NOT NULL THEN
        DELETE FROM wallet_transactions 
        WHERE reference_number = v_order.order_number;
        
        -- Restore wallet balance
        UPDATE crypto_wallets 
        SET current_balance = COALESCE(current_balance, 0) + COALESCE(v_order.quantity, 0),
            updated_at = now()
        WHERE id = v_order.wallet_id;
    END IF;
    
    -- 5. Finally delete the sales order
    DELETE FROM sales_orders WHERE id = p_order_id;
    
    -- 6. Clean up orphan client if this was their only order
    IF v_client_name IS NOT NULL THEN
        PERFORM maybe_delete_orphan_client(v_client_name);
    END IF;
END;
$$;