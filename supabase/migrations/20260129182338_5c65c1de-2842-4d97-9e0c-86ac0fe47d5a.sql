-- Fix both order deletion functions to use correct column names

-- Fix delete_sales_order_with_reversal - wallet_transactions uses reference_id not reference_number
CREATE OR REPLACE FUNCTION public.delete_sales_order_with_reversal(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    v_client_name := v_order.client_name;
    
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
        
        -- Remove stock transaction (stock_transactions uses reference_number)
        DELETE FROM stock_transactions 
        WHERE reference_number = v_order.order_number 
        AND product_id = v_order.product_id;
    END IF;
    
    -- 4. Delete wallet transaction if exists (wallet_transactions uses reference_id, NOT reference_number)
    IF v_order.wallet_id IS NOT NULL THEN
        -- Delete by reference_id (the order's UUID)
        DELETE FROM wallet_transactions 
        WHERE reference_id = p_order_id
          AND reference_type = 'SALES_ORDER';
        
        -- Restore wallet balance
        UPDATE wallets 
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

-- Fix delete_purchase_order_with_reversal - wallet_transactions uses reference_id not reference_number
CREATE OR REPLACE FUNCTION public.delete_purchase_order_with_reversal(order_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_record RECORD;
  bank_transaction_record RECORD;
  wallet_transaction_record RECORD;
  stock_transaction_record RECORD;
  order_item_record RECORD;
  supplier_name_to_check text;
BEGIN
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
    -- 1) Reverse bank transactions (allow negative)
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

    -- 2) Reverse wallet transactions (wallet_transactions uses reference_id NOT reference_number)
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

    -- 3) Reverse stock transactions (stock_transactions uses reference_number - this is correct)
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

    -- 4) Reverse non-USDT product stock if no stock_tx exists (allow negative)
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

    -- 5) Delete items then order
    DELETE FROM public.purchase_order_items WHERE purchase_order_id = order_id;
    DELETE FROM public.purchase_orders WHERE id = order_id;

    -- 6) Check and delete orphan client if this was their only order
    IF supplier_name_to_check IS NOT NULL AND supplier_name_to_check != '' THEN
      PERFORM public.maybe_delete_orphan_client(supplier_name_to_check);
    END IF;

    RETURN json_build_object('success', true, 'message', 'Purchase order and all related transactions successfully deleted');

  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
  END;
END;
$$;