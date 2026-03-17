
CREATE OR REPLACE FUNCTION public.reconcile_purchase_order_edit(
  p_order_id UUID,
  p_order_number TEXT,
  p_order_date DATE DEFAULT NULL,
  p_supplier_name TEXT DEFAULT NULL,
  p_old_bank_account_id UUID DEFAULT NULL,
  p_new_bank_account_id UUID DEFAULT NULL,
  p_old_net_payable NUMERIC DEFAULT 0,
  p_new_net_payable NUMERIC DEFAULT 0,
  p_old_wallet_id UUID DEFAULT NULL,
  p_new_wallet_id UUID DEFAULT NULL,
  p_old_quantity NUMERIC DEFAULT 0,
  p_new_quantity NUMERIC DEFAULT 0,
  p_is_off_market BOOLEAN DEFAULT FALSE,
  p_fee_percentage NUMERIC DEFAULT 0,
  p_product_code TEXT DEFAULT 'USDT',
  p_payment_splits JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      -- FIX: Apply fee deduction for ALL orders that have a fee_percentage > 0
      -- (not just off-market). This ensures P2P BUY commission is correctly subtracted.
      IF COALESCE(p_fee_percentage, 0) > 0 THEN
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
$$;
