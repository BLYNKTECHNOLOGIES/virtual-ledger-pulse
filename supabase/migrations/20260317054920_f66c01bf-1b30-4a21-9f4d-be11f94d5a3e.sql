
-- 1. Drop the trigger on purchase_orders that references debug_po_log
DROP TRIGGER IF EXISTS debug_po_attempt ON public.purchase_orders;

-- 2. Drop the trigger function
DROP FUNCTION IF EXISTS public.log_po_attempt() CASCADE;

-- 3. Recreate delete_purchase_order_with_reversal WITHOUT debug_po_log references
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
  supplier_name_to_check text;
BEGIN
  SELECT * INTO order_record
  FROM public.purchase_orders
  WHERE id = order_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', true, 'message', 'Order already deleted');
  END IF;

  DELETE FROM public.reversal_guards 
  WHERE entity_type = 'PURCHASE_ORDER' 
    AND entity_id = order_id 
    AND action = 'DELETE_WITH_REVERSAL';

  IF order_record.status != 'COMPLETED' THEN
    RETURN json_build_object('success', false, 'error', 'Can only delete completed purchase orders');
  END IF;

  supplier_name_to_check := order_record.supplier_name;

  DELETE FROM public.wallet_fee_deductions WHERE wallet_fee_deductions.order_id = delete_purchase_order_with_reversal.order_id AND order_type = 'PURCHASE';

  IF order_record.purchase_payment_method_id IS NOT NULL THEN
    UPDATE public.purchase_payment_methods
    SET current_usage = GREATEST(0, COALESCE(current_usage, 0) - COALESCE(order_record.total_amount, 0)),
        updated_at = now()
    WHERE id = order_record.purchase_payment_method_id;
  END IF;

  FOR bank_transaction_record IN
    SELECT bt.* FROM public.bank_transactions bt
    WHERE (bt.reference_number = order_record.order_number
           OR bt.description LIKE '%' || order_record.order_number || '%')
      AND NOT EXISTS (
        SELECT 1 FROM public.purchase_orders po
        WHERE po.order_number = order_record.order_number
          AND po.id != delete_purchase_order_with_reversal.order_id
      )
  LOOP
    DELETE FROM public.bank_transactions WHERE id = bank_transaction_record.id;
  END LOOP;

  FOR wallet_transaction_record IN
    SELECT wt.*
    FROM public.wallet_transactions wt
    WHERE wt.reference_id = delete_purchase_order_with_reversal.order_id
      AND wt.reference_type IN ('PURCHASE_ORDER', 'PURCHASE')
  LOOP
    DELETE FROM public.wallet_transactions WHERE id = wallet_transaction_record.id;
  END LOOP;

  FOR stock_transaction_record IN
    SELECT st.* FROM public.stock_transactions st
    WHERE st.reference_number = order_record.order_number
      AND NOT EXISTS (
        SELECT 1 FROM public.purchase_orders po
        WHERE po.order_number = order_record.order_number
          AND po.id != delete_purchase_order_with_reversal.order_id
      )
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

  DELETE FROM public.purchase_orders WHERE id = delete_purchase_order_with_reversal.order_id;

  INSERT INTO public.reversal_guards(entity_type, entity_id, action)
  VALUES ('PURCHASE_ORDER', delete_purchase_order_with_reversal.order_id, 'DELETE_WITH_REVERSAL')
  ON CONFLICT DO NOTHING;

  IF supplier_name_to_check IS NOT NULL THEN
    PERFORM public.maybe_delete_orphan_client(supplier_name_to_check);
  END IF;

  RETURN json_build_object('success', true, 'message', 'Purchase order deleted and reversed');

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$;
