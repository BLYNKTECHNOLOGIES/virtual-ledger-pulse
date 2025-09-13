-- Create function to safely delete a purchase order and reverse all transactions
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
  result json;
  errors TEXT[] := '{}';
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
      -- Delete the bank transaction (triggers will handle balance updates)
      DELETE FROM public.bank_transactions WHERE id = bank_transaction_record.id;
    END LOOP;
    
    -- 2. Reverse wallet transactions
    FOR wallet_transaction_record IN 
      SELECT * FROM public.wallet_transactions 
      WHERE reference_type = 'PURCHASE_ORDER' 
        AND reference_id = order_id
    LOOP
      -- Delete the wallet transaction (triggers will handle balance updates)
      DELETE FROM public.wallet_transactions WHERE id = wallet_transaction_record.id;
    END LOOP;
    
    -- 3. Reverse stock transactions
    FOR stock_transaction_record IN 
      SELECT * FROM public.stock_transactions 
      WHERE reference_number = order_record.order_number
    LOOP
      -- Delete the stock transaction (triggers will handle stock updates)
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
        SET current_stock_quantity = current_stock_quantity - order_item_record.quantity,
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