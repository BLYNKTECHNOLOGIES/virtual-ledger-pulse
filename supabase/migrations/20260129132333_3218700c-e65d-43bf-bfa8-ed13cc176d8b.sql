-- Drop and recreate the function to properly handle wallet balance constraints
CREATE OR REPLACE FUNCTION public.delete_purchase_order_with_reversal(order_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  order_record RECORD;
  bank_transaction_record RECORD;
  wallet_transaction_record RECORD;
  stock_transaction_record RECORD;
  order_item_record RECORD;
  wallet_record RECORD;
  result json;
BEGIN
  -- Get the purchase order details
  SELECT * INTO order_record 
  FROM public.purchase_orders 
  WHERE id = order_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Purchase order not found');
  END IF;
  
  -- Only allow deletion of COMPLETED orders
  IF order_record.status != 'COMPLETED' THEN
    RETURN json_build_object('success', false, 'error', 'Can only delete completed purchase orders');
  END IF;
  
  BEGIN
    -- 1. Reverse bank transactions
    FOR bank_transaction_record IN 
      SELECT * FROM public.bank_transactions 
      WHERE reference_number = order_record.order_number
        OR (description LIKE '%' || order_record.order_number || '%')
    LOOP
      -- First update the bank account balance directly
      IF bank_transaction_record.transaction_type = 'EXPENSE' THEN
        -- If it was an expense, add the amount back
        UPDATE public.bank_accounts 
        SET balance = balance + bank_transaction_record.amount,
            updated_at = now()
        WHERE id = bank_transaction_record.bank_account_id;
      ELSIF bank_transaction_record.transaction_type = 'INCOME' THEN
        -- If it was income, subtract it back
        UPDATE public.bank_accounts 
        SET balance = balance - bank_transaction_record.amount,
            updated_at = now()
        WHERE id = bank_transaction_record.bank_account_id;
      END IF;
      
      -- Then delete the bank transaction
      DELETE FROM public.bank_transactions WHERE id = bank_transaction_record.id;
    END LOOP;
    
    -- 2. Reverse wallet transactions - handle balance BEFORE deleting
    FOR wallet_transaction_record IN 
      SELECT wt.*, w.balance as current_wallet_balance 
      FROM public.wallet_transactions wt
      JOIN public.wallets w ON wt.wallet_id = w.id
      WHERE wt.reference_type = 'PURCHASE_ORDER' 
        AND wt.reference_id = order_id
    LOOP
      -- Reverse the wallet balance based on transaction type
      IF wallet_transaction_record.transaction_type = 'STOCK_IN' OR 
         wallet_transaction_record.transaction_type = 'PURCHASE' OR
         wallet_transaction_record.transaction_type = 'IN' THEN
        -- If stock came IN, we need to reduce the balance (reversal)
        UPDATE public.wallets 
        SET balance = GREATEST(0, balance - wallet_transaction_record.quantity),
            updated_at = now()
        WHERE id = wallet_transaction_record.wallet_id;
      ELSIF wallet_transaction_record.transaction_type = 'STOCK_OUT' OR 
            wallet_transaction_record.transaction_type = 'SALE' OR
            wallet_transaction_record.transaction_type = 'OUT' THEN
        -- If stock went OUT, we need to add it back (reversal)
        UPDATE public.wallets 
        SET balance = balance + wallet_transaction_record.quantity,
            updated_at = now()
        WHERE id = wallet_transaction_record.wallet_id;
      END IF;
      
      -- Now delete the wallet transaction
      DELETE FROM public.wallet_transactions WHERE id = wallet_transaction_record.id;
    END LOOP;
    
    -- 3. Reverse stock transactions
    FOR stock_transaction_record IN 
      SELECT * FROM public.stock_transactions 
      WHERE reference_number = order_record.order_number
    LOOP
      -- Reverse the stock based on transaction type
      IF stock_transaction_record.transaction_type = 'PURCHASE' OR
         stock_transaction_record.transaction_type = 'IN' OR
         stock_transaction_record.transaction_type = 'STOCK_IN' THEN
        -- If stock came IN, reduce it
        UPDATE public.products 
        SET current_stock_quantity = GREATEST(0, current_stock_quantity - stock_transaction_record.quantity),
            updated_at = now()
        WHERE id = stock_transaction_record.product_id;
      ELSIF stock_transaction_record.transaction_type = 'SALE' OR
            stock_transaction_record.transaction_type = 'OUT' OR
            stock_transaction_record.transaction_type = 'STOCK_OUT' THEN
        -- If stock went OUT, add it back
        UPDATE public.products 
        SET current_stock_quantity = current_stock_quantity + stock_transaction_record.quantity,
            updated_at = now()
        WHERE id = stock_transaction_record.product_id;
      END IF;
      
      -- Delete the stock transaction
      DELETE FROM public.stock_transactions WHERE id = stock_transaction_record.id;
    END LOOP;
    
    -- 4. Handle non-USDT products - reverse stock manually if no stock transaction exists
    FOR order_item_record IN 
      SELECT poi.*, p.code, p.name 
      FROM public.purchase_order_items poi
      JOIN public.products p ON poi.product_id = p.id
      WHERE poi.purchase_order_id = order_id
        AND p.code != 'USDT'
    LOOP
      -- Check if there was a stock transaction for this item
      IF NOT EXISTS (
        SELECT 1 FROM public.stock_transactions 
        WHERE reference_number = order_record.order_number 
          AND product_id = order_item_record.product_id
      ) THEN
        -- Manually reverse the stock increase
        UPDATE public.products 
        SET current_stock_quantity = GREATEST(0, current_stock_quantity - order_item_record.quantity),
            updated_at = now()
        WHERE id = order_item_record.product_id;
      END IF;
    END LOOP;
    
    -- 5. Delete purchase order items
    DELETE FROM public.purchase_order_items WHERE purchase_order_id = order_id;
    
    -- 6. Finally delete the purchase order
    DELETE FROM public.purchase_orders WHERE id = order_id;
    
    RETURN json_build_object(
      'success', true, 
      'message', 'Purchase order and all related transactions successfully deleted'
    );
    
  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false, 
      'error', SQLERRM
    );
  END;
END;
$function$;