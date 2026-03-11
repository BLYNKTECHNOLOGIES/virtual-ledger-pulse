-- Fix wallet reversal integrity for purchase edit/delete flows and wallet summary updates

CREATE OR REPLACE FUNCTION public.update_wallet_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_asset TEXT;
  v_wallet_id UUID;
  v_amount NUMERIC;
  v_tx_type TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_asset := COALESCE(NEW.asset_code, 'USDT');
    v_wallet_id := NEW.wallet_id;
    v_amount := NEW.amount;
    v_tx_type := NEW.transaction_type;

    IF v_tx_type IN ('CREDIT', 'TRANSFER_IN') THEN
      IF v_asset = 'USDT' THEN
        UPDATE wallets
        SET current_balance = current_balance + v_amount,
            total_received = total_received + v_amount,
            updated_at = now()
        WHERE id = v_wallet_id;
      END IF;

      INSERT INTO wallet_asset_balances (wallet_id, asset_code, balance, total_received, total_sent)
      VALUES (v_wallet_id, v_asset, v_amount, v_amount, 0)
      ON CONFLICT (wallet_id, asset_code) DO UPDATE SET
        balance = wallet_asset_balances.balance + EXCLUDED.balance,
        total_received = wallet_asset_balances.total_received + EXCLUDED.total_received,
        updated_at = now();

    ELSIF v_tx_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN
      IF v_asset = 'USDT' THEN
        UPDATE wallets
        SET current_balance = current_balance - v_amount,
            total_sent = total_sent + v_amount,
            updated_at = now()
        WHERE id = v_wallet_id;
      END IF;

      INSERT INTO wallet_asset_balances (wallet_id, asset_code, balance, total_received, total_sent)
      VALUES (v_wallet_id, v_asset, -v_amount, 0, v_amount)
      ON CONFLICT (wallet_id, asset_code) DO UPDATE SET
        balance = wallet_asset_balances.balance + EXCLUDED.balance,
        total_sent = wallet_asset_balances.total_sent + EXCLUDED.total_sent,
        updated_at = now();
    END IF;

    RETURN NEW;
  END IF;

  -- DELETE: reverse prior effect to keep balances in sync
  IF TG_OP = 'DELETE' THEN
    v_asset := COALESCE(OLD.asset_code, 'USDT');
    v_wallet_id := OLD.wallet_id;
    v_amount := OLD.amount;
    v_tx_type := OLD.transaction_type;

    IF v_tx_type IN ('CREDIT', 'TRANSFER_IN') THEN
      IF v_asset = 'USDT' THEN
        UPDATE wallets
        SET current_balance = current_balance - v_amount,
            total_received = GREATEST(0, total_received - v_amount),
            updated_at = now()
        WHERE id = v_wallet_id;
      END IF;

      INSERT INTO wallet_asset_balances (wallet_id, asset_code, balance, total_received, total_sent)
      VALUES (v_wallet_id, v_asset, -v_amount, -v_amount, 0)
      ON CONFLICT (wallet_id, asset_code) DO UPDATE SET
        balance = wallet_asset_balances.balance + EXCLUDED.balance,
        total_received = GREATEST(0, wallet_asset_balances.total_received + EXCLUDED.total_received),
        updated_at = now();

    ELSIF v_tx_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN
      IF v_asset = 'USDT' THEN
        UPDATE wallets
        SET current_balance = current_balance + v_amount,
            total_sent = GREATEST(0, total_sent - v_amount),
            updated_at = now()
        WHERE id = v_wallet_id;
      END IF;

      INSERT INTO wallet_asset_balances (wallet_id, asset_code, balance, total_received, total_sent)
      VALUES (v_wallet_id, v_asset, v_amount, 0, -v_amount)
      ON CONFLICT (wallet_id, asset_code) DO UPDATE SET
        balance = wallet_asset_balances.balance + EXCLUDED.balance,
        total_sent = GREATEST(0, wallet_asset_balances.total_sent + EXCLUDED.total_sent),
        updated_at = now();
    END IF;

    RETURN OLD;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reconcile_purchase_order_edit(
  p_order_id uuid,
  p_order_number text,
  p_order_date date,
  p_supplier_name text,
  p_old_bank_account_id uuid DEFAULT NULL,
  p_new_bank_account_id uuid DEFAULT NULL,
  p_old_net_payable numeric DEFAULT 0,
  p_new_net_payable numeric DEFAULT 0,
  p_old_wallet_id uuid DEFAULT NULL,
  p_new_wallet_id uuid DEFAULT NULL,
  p_old_quantity numeric DEFAULT 0,
  p_new_quantity numeric DEFAULT 0,
  p_is_off_market boolean DEFAULT false,
  p_fee_percentage numeric DEFAULT 0,
  p_product_code text DEFAULT 'USDT',
  p_payment_splits jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bank_changed BOOLEAN;
  v_amount_changed BOOLEAN;
  v_wallet_changed BOOLEAN;
  v_quantity_changed BOOLEAN;
  v_deleted_bank INT := 0;
  v_deleted_wallet INT := 0;
  v_old_fee NUMERIC := 0;
  v_new_fee NUMERIC := 0;
  v_new_net_qty NUMERIC;
  v_split JSONB;
  v_bank_id UUID;
  v_split_amount NUMERIC;
  v_bank_balance NUMERIC;
  v_bank_name TEXT;
  v_acct_type TEXT;
  v_has_splits BOOLEAN;
  v_existing_order_number TEXT;
BEGIN
  SELECT po.order_number
  INTO v_existing_order_number
  FROM public.purchase_orders po
  WHERE po.id = p_order_id;

  v_existing_order_number := COALESCE(v_existing_order_number, p_order_number);

  v_bank_changed := (p_old_bank_account_id IS DISTINCT FROM p_new_bank_account_id);
  v_amount_changed := (p_old_net_payable IS DISTINCT FROM p_new_net_payable);
  v_wallet_changed := (p_old_wallet_id IS DISTINCT FROM p_new_wallet_id);
  v_quantity_changed := (p_old_quantity IS DISTINCT FROM p_new_quantity);

  v_has_splits := (p_payment_splits IS NOT NULL AND jsonb_array_length(p_payment_splits) > 0);

  DELETE FROM public.purchase_order_payment_splits
  WHERE purchase_order_id = p_order_id;

  IF v_has_splits THEN
    FOR v_split IN SELECT * FROM jsonb_array_elements(p_payment_splits) LOOP
      v_bank_id := (v_split->>'bank_account_id')::UUID;
      v_split_amount := (v_split->>'amount')::NUMERIC;

      INSERT INTO public.purchase_order_payment_splits (purchase_order_id, bank_account_id, amount)
      VALUES (p_order_id, v_bank_id, v_split_amount);
    END LOOP;
  END IF;

  IF v_bank_changed OR v_amount_changed OR v_has_splits THEN
    DELETE FROM public.bank_transactions
    WHERE reference_number IN (v_existing_order_number, p_order_number)
      AND transaction_type = 'EXPENSE'
      AND category = 'Purchase';
    GET DIAGNOSTICS v_deleted_bank = ROW_COUNT;

    IF v_has_splits THEN
      FOR v_split IN SELECT * FROM jsonb_array_elements(p_payment_splits) LOOP
        v_bank_id := (v_split->>'bank_account_id')::UUID;
        v_split_amount := (v_split->>'amount')::NUMERIC;

        SELECT ba.balance, ba.account_name, ba.account_type
        INTO v_bank_balance, v_bank_name, v_acct_type
        FROM public.bank_accounts ba
        WHERE ba.id = v_bank_id AND ba.status = 'ACTIVE';

        IF v_bank_balance IS NULL THEN
          RAISE EXCEPTION 'Bank account not found or inactive';
        END IF;

        IF UPPER(TRIM(COALESCE(v_acct_type, ''))) <> 'CREDIT' AND v_bank_balance < v_split_amount THEN
          RAISE EXCEPTION 'Insufficient balance in %. Available: Rs%, Required: Rs%',
            v_bank_name, v_bank_balance, v_split_amount;
        END IF;

        INSERT INTO public.bank_transactions (
          bank_account_id, transaction_type, amount, transaction_date,
          category, description, reference_number, related_account_name
        ) VALUES (
          v_bank_id, 'EXPENSE', v_split_amount,
          COALESCE(p_order_date, CURRENT_DATE), 'Purchase',
          'Stock Purchase - ' || COALESCE(p_supplier_name, '') || ' - Order #' || p_order_number || ' [Split Payment]',
          p_order_number, p_supplier_name
        );
      END LOOP;
    ELSIF p_new_bank_account_id IS NOT NULL THEN
      SELECT ba.balance, ba.account_name, ba.account_type
      INTO v_bank_balance, v_bank_name, v_acct_type
      FROM public.bank_accounts ba
      WHERE ba.id = p_new_bank_account_id AND ba.status = 'ACTIVE';

      IF v_bank_balance IS NULL THEN
        RAISE EXCEPTION 'Bank account not found or inactive';
      END IF;

      IF UPPER(TRIM(COALESCE(v_acct_type, ''))) <> 'CREDIT' AND v_bank_balance < p_new_net_payable THEN
        RAISE EXCEPTION 'Insufficient balance in %. Available: Rs%, Required: Rs%',
          v_bank_name, v_bank_balance, p_new_net_payable;
      END IF;

      INSERT INTO public.bank_transactions (
        bank_account_id, transaction_type, amount, transaction_date,
        category, description, reference_number, related_account_name
      ) VALUES (
        p_new_bank_account_id, 'EXPENSE', p_new_net_payable,
        COALESCE(p_order_date, CURRENT_DATE), 'Purchase',
        'Stock Purchase - ' || COALESCE(p_supplier_name, '') || ' - Order #' || p_order_number,
        p_order_number, p_supplier_name
      );
    END IF;
  END IF;

  IF v_wallet_changed OR v_quantity_changed OR v_amount_changed THEN
    -- Reverse all prior wallet postings for this order (legacy + current reference types)
    DELETE FROM public.wallet_transactions
    WHERE reference_id = p_order_id
      AND reference_type IN ('PURCHASE', 'PURCHASE_ORDER');
    GET DIAGNOSTICS v_deleted_wallet = ROW_COUNT;

    IF p_new_wallet_id IS NOT NULL AND p_new_quantity > 0 THEN
      IF p_is_off_market THEN
        v_old_fee := COALESCE(p_old_quantity * (p_fee_percentage / 100), 0);
        v_new_fee := COALESCE(p_new_quantity * (p_fee_percentage / 100), 0);
        v_new_net_qty := p_new_quantity - v_new_fee;
      ELSE
        v_new_net_qty := p_new_quantity;
      END IF;

      INSERT INTO public.wallet_transactions (
        wallet_id, asset_code, transaction_type, amount,
        reference_id, reference_type, description
      ) VALUES (
        p_new_wallet_id,
        COALESCE(p_product_code, 'USDT'),
        'CREDIT',
        v_new_net_qty,
        p_order_id,
        'PURCHASE_ORDER',
        'Purchase from ' || COALESCE(p_supplier_name, 'Unknown') || ' (edited) - #' || p_order_number
      );
    END IF;
  END IF;

  IF v_quantity_changed OR v_amount_changed THEN
    DELETE FROM public.stock_transactions
    WHERE reference_number IN (v_existing_order_number, p_order_number);

    IF p_new_quantity > 0 THEN
      INSERT INTO public.stock_transactions (
        product_id, transaction_type, quantity, unit_price,
        total_amount, reason, reference_number, supplier_customer_name, transaction_date
      ) VALUES (
        (SELECT id FROM public.products WHERE code = p_product_code LIMIT 1),
        'PURCHASE', p_new_quantity,
        CASE WHEN p_new_quantity > 0 THEN p_new_net_payable / p_new_quantity ELSE 0 END,
        p_new_net_payable,
        'Purchase from ' || COALESCE(p_supplier_name, 'Unknown') || ' (edited)',
        p_order_number,
        p_supplier_name,
        COALESCE(p_order_date, CURRENT_DATE)
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_bank_txns', v_deleted_bank,
    'deleted_wallet_txns', v_deleted_wallet,
    'has_splits', v_has_splits,
    'old_order_number_reversed', v_existing_order_number
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_purchase_order_with_reversal(order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  order_record RECORD;
  bank_transaction_record RECORD;
  wallet_transaction_record RECORD;
  stock_transaction_record RECORD;
  supplier_name_to_check text;
BEGIN
  INSERT INTO public.debug_po_log(operation, payload)
  VALUES ('DELETE_PURCHASE_START', json_build_object('order_id', order_id)::text);

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
    SELECT * FROM public.bank_transactions
    WHERE reference_number = order_record.order_number
       OR description LIKE '%' || order_record.order_number || '%'
  LOOP
    DELETE FROM public.bank_transactions WHERE id = bank_transaction_record.id;
  END LOOP;

  -- Fix: reverse both legacy and newer purchase reference types
  FOR wallet_transaction_record IN
    SELECT wt.*
    FROM public.wallet_transactions wt
    WHERE wt.reference_id = delete_purchase_order_with_reversal.order_id
      AND wt.reference_type IN ('PURCHASE_ORDER', 'PURCHASE')
  LOOP
    DELETE FROM public.wallet_transactions WHERE id = wallet_transaction_record.id;
  END LOOP;

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

-- One-time data repair: fix edited order wallet posting and resync wallet summaries
DO $$
DECLARE
  v_wallet_id UUID;
  v_qty NUMERIC;
  v_asset TEXT;
  v_supplier TEXT;
  v_order_number TEXT;
  v_wallet RECORD;
BEGIN
  -- Repair known edited order where old wallet credit was not reversed
  SELECT
    COALESCE(po.wallet_id, poi.warehouse_id, wt.wallet_id),
    COALESCE(poi.quantity, po.quantity, 0),
    COALESCE(pr.code, 'USDT'),
    po.supplier_name,
    po.order_number
  INTO v_wallet_id, v_qty, v_asset, v_supplier, v_order_number
  FROM public.purchase_orders po
  LEFT JOIN LATERAL (
    SELECT * FROM public.purchase_order_items
    WHERE purchase_order_id = po.id
    ORDER BY created_at DESC
    LIMIT 1
  ) poi ON true
  LEFT JOIN public.products pr ON pr.id = poi.product_id
  LEFT JOIN LATERAL (
    SELECT wallet_id FROM public.wallet_transactions
    WHERE reference_id = po.id
      AND reference_type IN ('PURCHASE', 'PURCHASE_ORDER')
      AND transaction_type = 'CREDIT'
    ORDER BY created_at DESC
    LIMIT 1
  ) wt ON true
  WHERE po.id = '17a586ba-1487-4749-b06b-b35fb9e70453';

  IF FOUND THEN
    DELETE FROM public.wallet_transactions
    WHERE reference_id = '17a586ba-1487-4749-b06b-b35fb9e70453'
      AND reference_type IN ('PURCHASE', 'PURCHASE_ORDER');

    IF v_wallet_id IS NOT NULL AND COALESCE(v_qty, 0) > 0 THEN
      INSERT INTO public.wallet_transactions (
        wallet_id, transaction_type, amount, reference_type, reference_id, description, asset_code
      ) VALUES (
        v_wallet_id,
        'CREDIT',
        v_qty,
        'PURCHASE_ORDER',
        '17a586ba-1487-4749-b06b-b35fb9e70453',
        'Purchase corrected after edit - ' || COALESCE(v_order_number, 'UNKNOWN') || ' - ' || COALESCE(v_supplier, 'Unknown'),
        COALESCE(v_asset, 'USDT')
      );

      UPDATE public.purchase_orders
      SET wallet_id = v_wallet_id
      WHERE id = '17a586ba-1487-4749-b06b-b35fb9e70453';

      UPDATE public.purchase_order_items
      SET warehouse_id = v_wallet_id
      WHERE purchase_order_id = '17a586ba-1487-4749-b06b-b35fb9e70453';
    END IF;
  END IF;

  -- Resync all wallet summary balances from ledger to remove historical drift
  FOR v_wallet IN SELECT id FROM public.wallets LOOP
    PERFORM public.recalculate_wallet_balance(v_wallet.id);
  END LOOP;
END $$;