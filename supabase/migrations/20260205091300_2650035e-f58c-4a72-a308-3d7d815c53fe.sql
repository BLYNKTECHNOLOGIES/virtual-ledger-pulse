-- Drop and recreate the function with proper logic to handle stale guards
DROP FUNCTION IF EXISTS public.delete_purchase_order_with_reversal(uuid);

CREATE OR REPLACE FUNCTION public.delete_purchase_order_with_reversal(order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_record RECORD;
  bank_transaction_record RECORD;
  wallet_transaction_record RECORD;
  stock_transaction_record RECORD;
  supplier_name_to_check text;
BEGIN
  INSERT INTO public.debug_po_log(operation, payload)
  VALUES ('DELETE_PURCHASE_START', json_build_object('order_id', order_id)::text);

  -- First check if order exists
  SELECT * INTO order_record
  FROM public.purchase_orders
  WHERE id = order_id;

  IF NOT FOUND THEN
    -- Order doesn't exist - it was already deleted
    RETURN json_build_object('success', true, 'message', 'Order already deleted');
  END IF;

  -- Order exists - clean up any stale reversal guard that might block us
  DELETE FROM public.reversal_guards 
  WHERE entity_type = 'PURCHASE_ORDER' 
    AND entity_id = order_id 
    AND action = 'DELETE_WITH_REVERSAL';

  IF order_record.status != 'COMPLETED' THEN
    RETURN json_build_object('success', false, 'error', 'Can only delete completed purchase orders');
  END IF;

  supplier_name_to_check := order_record.supplier_name;

  -- 0) Delete wallet fee deductions for this order FIRST
  DELETE FROM public.wallet_fee_deductions WHERE wallet_fee_deductions.order_id = delete_purchase_order_with_reversal.order_id AND order_type = 'PURCHASE';

  -- 1) Reverse purchase payment method usage if exists
  IF order_record.purchase_payment_method_id IS NOT NULL THEN
    UPDATE public.purchase_payment_methods
    SET current_usage = GREATEST(0, COALESCE(current_usage, 0) - COALESCE(order_record.total_amount, 0)),
        updated_at = now()
    WHERE id = order_record.purchase_payment_method_id;
  END IF;

  -- 2) Reverse bank transactions by deleting them (triggers handle balance updates)
  FOR bank_transaction_record IN
    SELECT * FROM public.bank_transactions
    WHERE reference_number = order_record.order_number
       OR description LIKE '%' || order_record.order_number || '%'
  LOOP
    DELETE FROM public.bank_transactions WHERE id = bank_transaction_record.id;
  END LOOP;

  -- 3) Reverse wallet transactions by deleting them (triggers handle balance updates)
  FOR wallet_transaction_record IN
    SELECT wt.*
    FROM public.wallet_transactions wt
    WHERE wt.reference_type = 'PURCHASE_ORDER'
      AND wt.reference_id = delete_purchase_order_with_reversal.order_id
  LOOP
    DELETE FROM public.wallet_transactions WHERE id = wallet_transaction_record.id;
  END LOOP;

  -- 4) Reverse stock transactions
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

  -- 5) Delete the purchase order
  DELETE FROM public.purchase_orders WHERE id = delete_purchase_order_with_reversal.order_id;

  -- 6) Insert the guard AFTER successful deletion
  INSERT INTO public.reversal_guards(entity_type, entity_id, action)
  VALUES ('PURCHASE_ORDER', delete_purchase_order_with_reversal.order_id, 'DELETE_WITH_REVERSAL')
  ON CONFLICT DO NOTHING;

  -- 7) Orphan cleanup
  IF supplier_name_to_check IS NOT NULL THEN
    PERFORM public.maybe_delete_orphan_client(supplier_name_to_check);
  END IF;

  RETURN json_build_object('success', true, 'message', 'Purchase order deleted and reversed');

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Clean up all stale reversal guards for orders that still exist
DELETE FROM public.reversal_guards rg
WHERE rg.entity_type = 'PURCHASE_ORDER'
AND rg.action = 'DELETE_WITH_REVERSAL'
AND EXISTS (
  SELECT 1 FROM public.purchase_orders po WHERE po.id = rg.entity_id
);