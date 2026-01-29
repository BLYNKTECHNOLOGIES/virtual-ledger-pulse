
-- Helper function to check if a client should be deleted (no remaining orders)
CREATE OR REPLACE FUNCTION public.maybe_delete_orphan_client(client_name_param text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  client_record RECORD;
  sales_count integer;
  purchase_count integer;
BEGIN
  -- Find the client by name
  SELECT * INTO client_record
  FROM public.clients
  WHERE LOWER(TRIM(name)) = LOWER(TRIM(client_name_param));

  IF NOT FOUND THEN
    RETURN; -- No client found, nothing to do
  END IF;

  -- Count remaining sales orders for this client
  SELECT COUNT(*) INTO sales_count
  FROM public.sales_orders
  WHERE LOWER(TRIM(COALESCE(client_name, customer_name, ''))) = LOWER(TRIM(client_name_param));

  -- Count remaining purchase orders for this client
  SELECT COUNT(*) INTO purchase_count
  FROM public.purchase_orders
  WHERE LOWER(TRIM(supplier_name)) = LOWER(TRIM(client_name_param));

  -- If no orders remain, delete the client
  IF sales_count = 0 AND purchase_count = 0 THEN
    DELETE FROM public.clients WHERE id = client_record.id;
  END IF;
END;
$$;

-- Update the purchase order delete function to also cleanup orphan clients
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

    -- 2) Reverse wallet transactions (wallets.current_balance, allow negative)
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

    -- 3) Reverse stock transactions (allow negative)
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
$function$;

-- Create a trigger function to cleanup orphan clients after sales order deletion
CREATE OR REPLACE FUNCTION public.cleanup_orphan_client_on_sales_order_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  client_name_to_check text;
BEGIN
  -- Get the client name from the deleted sales order
  client_name_to_check := COALESCE(OLD.client_name, OLD.customer_name);
  
  -- Check and delete orphan client if this was their only order
  IF client_name_to_check IS NOT NULL AND client_name_to_check != '' THEN
    PERFORM public.maybe_delete_orphan_client(client_name_to_check);
  END IF;
  
  RETURN OLD;
END;
$$;

-- Create trigger for sales order deletion (runs AFTER delete)
DROP TRIGGER IF EXISTS trigger_cleanup_orphan_client_on_sales_order_delete ON public.sales_orders;
CREATE TRIGGER trigger_cleanup_orphan_client_on_sales_order_delete
  AFTER DELETE ON public.sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_orphan_client_on_sales_order_delete();
