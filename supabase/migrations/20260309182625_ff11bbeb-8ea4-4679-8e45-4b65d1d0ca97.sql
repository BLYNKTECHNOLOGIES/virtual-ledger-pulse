
CREATE OR REPLACE FUNCTION public.reconcile_purchase_order_edit(
  p_order_id UUID,
  p_order_number TEXT,
  p_order_date DATE,
  p_supplier_name TEXT,
  p_old_bank_account_id UUID DEFAULT NULL,
  p_new_bank_account_id UUID DEFAULT NULL,
  p_old_net_payable NUMERIC DEFAULT 0,
  p_new_net_payable NUMERIC DEFAULT 0,
  p_old_wallet_id UUID DEFAULT NULL,
  p_new_wallet_id UUID DEFAULT NULL,
  p_old_quantity NUMERIC DEFAULT 0,
  p_new_quantity NUMERIC DEFAULT 0,
  p_is_off_market BOOLEAN DEFAULT false,
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
BEGIN
  v_bank_changed := (p_old_bank_account_id IS DISTINCT FROM p_new_bank_account_id);
  v_amount_changed := (p_old_net_payable IS DISTINCT FROM p_new_net_payable);
  v_wallet_changed := (p_old_wallet_id IS DISTINCT FROM p_new_wallet_id);
  v_quantity_changed := (p_old_quantity IS DISTINCT FROM p_new_quantity);

  -- Determine if we have split payments
  v_has_splits := (p_payment_splits IS NOT NULL AND jsonb_array_length(p_payment_splits) > 0);

  -- ============ BANK TRANSACTION RECONCILIATION ============
  IF v_bank_changed OR v_amount_changed OR v_has_splits THEN
    -- Always delete old bank transactions for this order first
    DELETE FROM bank_transactions
    WHERE reference_number = p_order_number
      AND transaction_type = 'EXPENSE'
      AND category = 'Purchase';
    GET DIAGNOSTICS v_deleted_bank = ROW_COUNT;

    IF v_has_splits THEN
      -- Split payments: create one bank transaction per split
      FOR v_split IN SELECT * FROM jsonb_array_elements(p_payment_splits) LOOP
        v_bank_id := (v_split->>'bank_account_id')::UUID;
        v_split_amount := (v_split->>'amount')::NUMERIC;

        -- Validate bank balance per-split (skip CREDIT accounts)
        SELECT ba.balance, ba.account_name, ba.account_type
        INTO v_bank_balance, v_bank_name, v_acct_type
        FROM public.bank_accounts ba
        WHERE ba.id = v_bank_id AND ba.status = 'ACTIVE';

        IF v_bank_balance IS NULL THEN
          RAISE EXCEPTION 'Bank account not found or inactive';
        END IF;

        IF COALESCE(v_acct_type, '') <> 'CREDIT' AND v_bank_balance < v_split_amount THEN
          RAISE EXCEPTION 'Insufficient balance in %. Available: ₹%, Required: ₹%',
            v_bank_name, v_bank_balance, v_split_amount;
        END IF;

        INSERT INTO bank_transactions (
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
      -- Single bank: validate and insert
      SELECT ba.balance, ba.account_name, ba.account_type
      INTO v_bank_balance, v_bank_name, v_acct_type
      FROM public.bank_accounts ba
      WHERE ba.id = p_new_bank_account_id AND ba.status = 'ACTIVE';

      IF v_bank_balance IS NULL THEN
        RAISE EXCEPTION 'Bank account not found or inactive';
      END IF;

      IF COALESCE(v_acct_type, '') <> 'CREDIT' AND v_bank_balance < p_new_net_payable THEN
        RAISE EXCEPTION 'Insufficient balance in %. Available: ₹%, Required: ₹%',
          v_bank_name, v_bank_balance, p_new_net_payable;
      END IF;

      INSERT INTO bank_transactions (
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

  -- ============ WALLET TRANSACTION RECONCILIATION ============
  IF (v_wallet_changed OR v_quantity_changed) AND (p_old_wallet_id IS NOT NULL OR p_new_wallet_id IS NOT NULL) THEN
    DELETE FROM wallet_transactions
    WHERE reference_id = p_order_id
      AND reference_type IN ('PURCHASE_ORDER', 'PURCHASE_ORDER_FEE');
    GET DIAGNOSTICS v_deleted_wallet = ROW_COUNT;

    DELETE FROM wallet_fee_deductions
    WHERE order_id = p_order_id AND order_type = 'PURCHASE_ORDER';

    DELETE FROM reversal_guards
    WHERE entity_id = p_order_id AND entity_type = 'fee_deduction';

    IF NOT COALESCE(p_is_off_market, false) AND COALESCE(p_fee_percentage, 0) > 0 THEN
      v_new_fee := p_new_quantity * (p_fee_percentage / 100);
      v_new_net_qty := p_new_quantity - v_new_fee;
    ELSE
      v_new_fee := 0;
      v_new_net_qty := p_new_quantity;
    END IF;

    IF p_new_wallet_id IS NOT NULL AND p_new_quantity > 0 THEN
      INSERT INTO wallet_transactions (
        wallet_id, transaction_type, amount, reference_type, reference_id,
        description, asset_code, balance_before, balance_after
      ) VALUES (
        p_new_wallet_id, 'CREDIT', v_new_net_qty, 'PURCHASE_ORDER', p_order_id,
        p_product_code || ' purchased via buy order ' || p_order_number ||
          CASE WHEN v_new_fee > 0 THEN ' (after platform fee)' ELSE '' END,
        p_product_code, 0, 0
      );

      IF v_new_fee > 0 THEN
        INSERT INTO wallet_transactions (
          wallet_id, transaction_type, amount, reference_type, reference_id,
          description, asset_code, balance_before, balance_after
        ) VALUES (
          p_new_wallet_id, 'DEBIT', v_new_fee, 'PURCHASE_ORDER_FEE', p_order_id,
          'Platform fee for buy order ' || p_order_number,
          p_product_code, 0, 0
        );

        INSERT INTO wallet_fee_deductions (
          wallet_id, order_id, order_type, order_number, fee_amount
        ) VALUES (
          p_new_wallet_id, p_order_id, 'PURCHASE_ORDER', p_order_number, v_new_fee
        );
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'amount_changed', v_amount_changed,
    'quantity_changed', v_quantity_changed,
    'wallet_changed', v_wallet_changed,
    'deleted_bank_txs', v_deleted_bank,
    'deleted_wallet_txs', v_deleted_wallet,
    'new_fee', v_new_fee,
    'asset_code', p_product_code,
    'has_splits', v_has_splits
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
