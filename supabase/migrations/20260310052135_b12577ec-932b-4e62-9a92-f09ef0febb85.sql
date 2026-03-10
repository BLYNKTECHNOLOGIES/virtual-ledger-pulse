-- Fix create_manual_purchase_complete_v2: replace non-existent columns
CREATE OR REPLACE FUNCTION public.create_manual_purchase_complete_v2(
  p_order_number text, p_supplier_name text, p_order_date date, p_description text,
  p_total_amount numeric, p_contact_number text, p_bank_account_id uuid,
  p_product_id uuid, p_quantity numeric, p_unit_price numeric,
  p_tds_option text DEFAULT 'None', p_pan_number text DEFAULT NULL,
  p_is_off_market boolean DEFAULT false, p_fee_percentage numeric DEFAULT 0,
  p_credit_wallet_id uuid DEFAULT NULL, p_created_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_purchase_order_id UUID;
  v_bank_balance NUMERIC;
  v_tds_rate NUMERIC := 0;
  v_tds_amount NUMERIC := 0;
  v_net_payable_amount NUMERIC;
  v_fee_amount NUMERIC := 0;
  v_net_credit_quantity NUMERIC;
  v_financial_year TEXT;
  v_wallet_balance NUMERIC;
  v_wallet_balance_after_credit NUMERIC;
  v_client_id UUID;
  v_product_code TEXT;
  v_acct_type TEXT;
BEGIN
  SELECT code INTO v_product_code FROM public.products WHERE id = p_product_id;
  IF v_product_code IS NULL THEN v_product_code := 'USDT'; END IF;

  IF p_tds_option = '1%' THEN
    v_tds_rate := 1;
    IF p_pan_number IS NULL OR p_pan_number = '' THEN
      RAISE EXCEPTION 'PAN number is required for 1%% TDS';
    END IF;
  ELSIF p_tds_option = '20%' THEN
    v_tds_rate := 20;
  END IF;

  v_tds_amount := p_total_amount * (v_tds_rate / 100);
  v_net_payable_amount := p_total_amount - v_tds_amount;

  IF NOT p_is_off_market AND p_fee_percentage IS NOT NULL AND p_fee_percentage > 0 THEN
    v_fee_amount := p_quantity * (p_fee_percentage / 100);
  END IF;
  v_net_credit_quantity := p_quantity - v_fee_amount;

  SELECT ba.balance, ba.account_type INTO v_bank_balance, v_acct_type
  FROM public.bank_accounts ba
  WHERE ba.id = p_bank_account_id AND ba.status = 'ACTIVE';

  IF v_bank_balance IS NULL THEN
    RAISE EXCEPTION 'Bank account not found or inactive';
  END IF;

  IF COALESCE(v_acct_type, '') <> 'CREDIT' AND v_bank_balance < v_net_payable_amount THEN
    RAISE EXCEPTION 'Insufficient bank balance. Available: %, Required: %', v_bank_balance, v_net_payable_amount;
  END IF;

  SELECT CASE
    WHEN EXTRACT(MONTH FROM p_order_date) >= 4 THEN
      EXTRACT(YEAR FROM p_order_date)::TEXT || '-' || (EXTRACT(YEAR FROM p_order_date) + 1)::TEXT
    ELSE
      (EXTRACT(YEAR FROM p_order_date) - 1)::TEXT || '-' || EXTRACT(YEAR FROM p_order_date)::TEXT
  END INTO v_financial_year;

  IF p_pan_number IS NOT NULL AND p_pan_number != '' THEN
    SELECT id INTO v_client_id
    FROM public.clients
    WHERE LOWER(name) = LOWER(p_supplier_name)
       OR (p_contact_number IS NOT NULL AND phone = p_contact_number)
    LIMIT 1;

    IF v_client_id IS NOT NULL THEN
      UPDATE public.clients
      SET pan_card_number = p_pan_number, updated_at = NOW()
      WHERE id = v_client_id
        AND (pan_card_number IS NULL OR pan_card_number = '');
    END IF;
  END IF;

  INSERT INTO public.purchase_orders (
    order_number, supplier_name, order_date, description, total_amount, contact_number,
    status, order_status, total_paid, bank_account_id, tds_applied, pan_number,
    tds_amount, net_payable_amount, quantity, price_per_unit, is_off_market,
    fee_percentage, fee_amount, net_amount, wallet_id, created_by
  ) VALUES (
    p_order_number, p_supplier_name, p_order_date, p_description, p_total_amount,
    p_contact_number, 'COMPLETED', 'completed', v_net_payable_amount, p_bank_account_id,
    v_tds_rate > 0, CASE WHEN v_tds_rate > 0 THEN p_pan_number ELSE NULL END,
    v_tds_amount, v_net_payable_amount, p_quantity, p_unit_price, p_is_off_market,
    COALESCE(p_fee_percentage, 0), v_fee_amount, v_net_credit_quantity,
    p_credit_wallet_id, p_created_by
  ) RETURNING id INTO v_purchase_order_id;

  INSERT INTO public.purchase_order_items (
    purchase_order_id, product_id, quantity, unit_price, total_price, warehouse_id
  ) VALUES (
    v_purchase_order_id, p_product_id, p_quantity, p_unit_price, p_total_amount, p_credit_wallet_id
  );

  INSERT INTO public.bank_transactions (
    bank_account_id, transaction_type, amount, description, reference_number,
    transaction_date, category, related_account_name, created_by
  ) VALUES (
    p_bank_account_id, 'EXPENSE', v_net_payable_amount,
    'Manual Purchase - ' || p_order_number || ' - ' || p_supplier_name ||
    CASE WHEN v_tds_rate > 0 THEN ' (TDS: ' || v_tds_rate || '%)' ELSE '' END,
    p_order_number, p_order_date, 'Purchase', p_supplier_name, p_created_by
  );

  IF v_tds_rate > 0 THEN
    INSERT INTO public.tds_records (
      purchase_order_id, pan_number, total_amount, tds_rate, tds_amount,
      net_payable_amount, deduction_date, financial_year
    ) VALUES (
      v_purchase_order_id, p_pan_number, p_total_amount, v_tds_rate, v_tds_amount,
      v_net_payable_amount, p_order_date, v_financial_year
    );
  END IF;

  IF p_credit_wallet_id IS NOT NULL THEN
    SELECT w.current_balance INTO v_wallet_balance
    FROM public.wallets w WHERE w.id = p_credit_wallet_id;

    IF v_wallet_balance IS NULL THEN
      RAISE EXCEPTION 'Wallet not found';
    END IF;

    v_wallet_balance_after_credit := v_wallet_balance + v_net_credit_quantity;

    INSERT INTO public.wallet_transactions (
      wallet_id, transaction_type, amount, description, reference_id,
      reference_type, balance_before, balance_after, created_by, asset_code
    ) VALUES (
      p_credit_wallet_id, 'CREDIT', v_net_credit_quantity,
      'Manual Purchase credit - ' || p_order_number || ' - ' || p_supplier_name ||
      CASE WHEN v_fee_amount > 0 THEN ' (Fee: ' || ROUND(v_fee_amount, 4) || ')' ELSE '' END,
      v_purchase_order_id, 'PURCHASE_ORDER', v_wallet_balance,
      v_wallet_balance_after_credit, p_created_by, v_product_code
    );

    IF v_fee_amount > 0 THEN
      INSERT INTO public.wallet_transactions (
        wallet_id, transaction_type, amount, description, reference_id,
        reference_type, balance_before, balance_after, created_by, asset_code
      ) VALUES (
        p_credit_wallet_id, 'FEE', v_fee_amount,
        'Platform fee for purchase ' || p_order_number,
        v_purchase_order_id, 'PURCHASE_ORDER', v_wallet_balance_after_credit,
        v_wallet_balance_after_credit, p_created_by, v_product_code
      );
    END IF;
  ELSE
    INSERT INTO public.stock_transactions (
      product_id, transaction_type, quantity, unit_price, total_amount,
      reference_number, reason, supplier_customer_name, transaction_date
    ) VALUES (
      p_product_id, 'PURCHASE', p_quantity, p_unit_price, p_total_amount,
      p_order_number, 'Manual purchase ' || p_order_number || ' from ' || p_supplier_name,
      p_supplier_name, p_order_date
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'purchase_order_id', v_purchase_order_id,
    'message', 'Manual purchase entry completed successfully',
    'tds_amount', v_tds_amount, 'net_payable_amount', v_net_payable_amount,
    'fee_amount', v_fee_amount, 'net_credit_quantity', v_net_credit_quantity,
    'client_pan_updated', v_client_id IS NOT NULL
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- Fix create_manual_purchase_with_split_payments: replace non-existent columns
CREATE OR REPLACE FUNCTION public.create_manual_purchase_with_split_payments(
  p_order_number text, p_supplier_name text, p_order_date date, p_description text,
  p_total_amount numeric, p_contact_number text, p_product_id uuid,
  p_quantity numeric, p_unit_price numeric, p_payment_splits jsonb,
  p_tds_option text DEFAULT 'None', p_pan_number text DEFAULT NULL,
  p_is_off_market boolean DEFAULT false, p_fee_percentage numeric DEFAULT 0,
  p_credit_wallet_id uuid DEFAULT NULL, p_created_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_purchase_order_id UUID;
  v_tds_rate NUMERIC := 0;
  v_tds_amount NUMERIC := 0;
  v_net_payable_amount NUMERIC;
  v_fee_amount NUMERIC := 0;
  v_net_credit_quantity NUMERIC;
  v_financial_year TEXT;
  v_wallet_balance NUMERIC;
  v_wallet_balance_after_credit NUMERIC;
  v_client_id UUID;
  v_split JSONB;
  v_bank_id UUID;
  v_split_amount NUMERIC;
  v_bank_balance NUMERIC;
  v_total_splits NUMERIC := 0;
  v_bank_name TEXT;
  v_product_code TEXT;
  v_acct_type TEXT;
BEGIN
  SELECT code INTO v_product_code FROM public.products WHERE id = p_product_id;
  IF v_product_code IS NULL THEN v_product_code := 'USDT'; END IF;

  IF p_tds_option = '1%' THEN
    v_tds_rate := 1;
    IF p_pan_number IS NULL OR p_pan_number = '' THEN
      RAISE EXCEPTION 'PAN number is required for 1%% TDS';
    END IF;
  ELSIF p_tds_option = '20%' THEN
    v_tds_rate := 20;
  END IF;

  v_tds_amount := p_total_amount * (v_tds_rate / 100);
  v_net_payable_amount := p_total_amount - v_tds_amount;

  IF NOT p_is_off_market AND p_fee_percentage IS NOT NULL AND p_fee_percentage > 0 THEN
    v_fee_amount := p_quantity * (p_fee_percentage / 100);
  END IF;
  v_net_credit_quantity := p_quantity - v_fee_amount;

  FOR v_split IN SELECT * FROM jsonb_array_elements(p_payment_splits) LOOP
    v_total_splits := v_total_splits + (v_split->>'amount')::NUMERIC;
  END LOOP;

  IF ABS(v_total_splits - v_net_payable_amount) > 0.01 THEN
    RAISE EXCEPTION 'Split payment total (%) does not match net payable (%)',
      v_total_splits, v_net_payable_amount;
  END IF;

  FOR v_split IN SELECT * FROM jsonb_array_elements(p_payment_splits) LOOP
    v_bank_id := (v_split->>'bank_account_id')::UUID;
    v_split_amount := (v_split->>'amount')::NUMERIC;

    SELECT ba.balance, ba.account_name, ba.account_type INTO v_bank_balance, v_bank_name, v_acct_type
    FROM public.bank_accounts ba
    WHERE ba.id = v_bank_id AND ba.status = 'ACTIVE';

    IF v_bank_balance IS NULL THEN
      RAISE EXCEPTION 'Bank account not found or inactive';
    END IF;

    IF COALESCE(v_acct_type, '') <> 'CREDIT' AND v_bank_balance < v_split_amount THEN
      RAISE EXCEPTION 'Insufficient balance in %. Available: %, Required: %',
        v_bank_name, v_bank_balance, v_split_amount;
    END IF;
  END LOOP;

  SELECT CASE
    WHEN EXTRACT(MONTH FROM p_order_date) >= 4 THEN
      EXTRACT(YEAR FROM p_order_date)::TEXT || '-' || (EXTRACT(YEAR FROM p_order_date) + 1)::TEXT
    ELSE
      (EXTRACT(YEAR FROM p_order_date) - 1)::TEXT || '-' || EXTRACT(YEAR FROM p_order_date)::TEXT
  END INTO v_financial_year;

  IF p_pan_number IS NOT NULL AND p_pan_number != '' THEN
    SELECT id INTO v_client_id
    FROM public.clients
    WHERE LOWER(name) = LOWER(p_supplier_name)
       OR (p_contact_number IS NOT NULL AND phone = p_contact_number)
    LIMIT 1;

    IF v_client_id IS NOT NULL THEN
      UPDATE public.clients
      SET pan_card_number = p_pan_number, updated_at = NOW()
      WHERE id = v_client_id
        AND (pan_card_number IS NULL OR pan_card_number = '');
    END IF;
  END IF;

  INSERT INTO public.purchase_orders (
    order_number, supplier_name, order_date, description, total_amount,
    contact_number, status, order_status, total_paid, bank_account_id,
    tds_applied, pan_number, tds_amount, net_payable_amount,
    quantity, price_per_unit, is_off_market, fee_percentage, fee_amount,
    net_amount, wallet_id, created_by
  ) VALUES (
    p_order_number, p_supplier_name, p_order_date, p_description, p_total_amount,
    p_contact_number, 'COMPLETED', 'completed', v_net_payable_amount, NULL,
    v_tds_rate > 0, CASE WHEN v_tds_rate > 0 THEN p_pan_number ELSE NULL END,
    v_tds_amount, v_net_payable_amount, p_quantity, p_unit_price,
    p_is_off_market, COALESCE(p_fee_percentage, 0), v_fee_amount,
    v_net_credit_quantity, p_credit_wallet_id, p_created_by
  ) RETURNING id INTO v_purchase_order_id;

  INSERT INTO public.purchase_order_items (
    purchase_order_id, product_id, quantity, unit_price, total_price, warehouse_id
  ) VALUES (
    v_purchase_order_id, p_product_id, p_quantity, p_unit_price, p_total_amount, p_credit_wallet_id
  );

  FOR v_split IN SELECT * FROM jsonb_array_elements(p_payment_splits) LOOP
    v_bank_id := (v_split->>'bank_account_id')::UUID;
    v_split_amount := (v_split->>'amount')::NUMERIC;

    SELECT ba.account_name INTO v_bank_name
    FROM public.bank_accounts ba WHERE ba.id = v_bank_id;

    INSERT INTO public.bank_transactions (
      bank_account_id, transaction_type, amount, description,
      reference_number, transaction_date, category, related_account_name, created_by
    ) VALUES (
      v_bank_id, 'EXPENSE', v_split_amount,
      'Manual Purchase - ' || p_order_number || ' - ' || p_supplier_name ||
      CASE WHEN v_tds_rate > 0 THEN ' (TDS: ' || v_tds_rate || '%)' ELSE '' END ||
      ' [Split Payment]',
      p_order_number, p_order_date, 'Purchase', p_supplier_name, p_created_by
    );

    INSERT INTO public.purchase_order_payment_splits (
      purchase_order_id, bank_account_id, amount, created_by
    ) VALUES (
      v_purchase_order_id, v_bank_id, v_split_amount, p_created_by
    );
  END LOOP;

  IF v_tds_rate > 0 THEN
    INSERT INTO public.tds_records (
      purchase_order_id, pan_number, total_amount, tds_rate, tds_amount,
      net_payable_amount, deduction_date, financial_year
    ) VALUES (
      v_purchase_order_id, p_pan_number, p_total_amount, v_tds_rate, v_tds_amount,
      v_net_payable_amount, p_order_date, v_financial_year
    );
  END IF;

  IF p_credit_wallet_id IS NOT NULL THEN
    INSERT INTO public.wallet_transactions (
      wallet_id, transaction_type, amount, description,
      reference_id, reference_type, asset_code,
      balance_before, balance_after, created_by
    ) VALUES (
      p_credit_wallet_id, 'CREDIT', v_net_credit_quantity,
      'Manual Purchase credit - ' || p_order_number || ' - ' || p_supplier_name ||
      CASE WHEN v_fee_amount > 0 THEN ' (Fee: ' || ROUND(v_fee_amount, 4) || ')' ELSE '' END ||
      ' [Split Payment]',
      v_purchase_order_id, 'PURCHASE_ORDER', v_product_code,
      0, 0, p_created_by
    );

    IF v_fee_amount > 0 THEN
      INSERT INTO public.wallet_transactions (
        wallet_id, transaction_type, amount, description,
        reference_id, reference_type, asset_code,
        balance_before, balance_after, created_by
      ) VALUES (
        p_credit_wallet_id, 'FEE', v_fee_amount,
        'Platform fee for purchase ' || p_order_number,
        v_purchase_order_id, 'PURCHASE_ORDER', v_product_code,
        0, 0, p_created_by
      );
    END IF;
  ELSE
    INSERT INTO public.stock_transactions (
      product_id, transaction_type, quantity, unit_price, total_amount,
      reference_number, reason, supplier_customer_name, transaction_date
    ) VALUES (
      p_product_id, 'PURCHASE', p_quantity, p_unit_price, p_total_amount,
      p_order_number, 'Manual purchase ' || p_order_number || ' from ' || p_supplier_name || ' [Split Payment]',
      p_supplier_name, p_order_date
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'purchase_order_id', v_purchase_order_id,
    'message', 'Manual purchase entry with split payments completed successfully',
    'tds_amount', v_tds_amount,
    'net_payable_amount', v_net_payable_amount,
    'fee_amount', v_fee_amount,
    'net_credit_quantity', v_net_credit_quantity,
    'asset_code', v_product_code,
    'client_pan_updated', v_client_id IS NOT NULL,
    'payment_splits_count', jsonb_array_length(p_payment_splits)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$function$;