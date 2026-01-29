-- Fix: wallets table uses current_balance (not balance)
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
      -- IMPORTANT: we do NOT update wallets.total_received/total_sent here; those are handled by wallet_transaction triggers.
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

    RETURN json_build_object('success', true, 'message', 'Purchase order and all related transactions successfully deleted');

  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
  END;
END;
$function$;