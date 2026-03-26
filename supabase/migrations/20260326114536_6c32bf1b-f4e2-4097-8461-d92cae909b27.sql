
-- Step 1: Delete the duplicate bank transaction (second entry for order 69c4258f3eb1620001d7427e)
DELETE FROM public.bank_transactions WHERE id = '9815a1cf-5e7b-49e8-9b80-1b36309ae433';

-- Step 2: Add idempotency check to create_manual_purchase_complete_v2
CREATE OR REPLACE FUNCTION public.create_manual_purchase_complete_v2(
  p_order_number TEXT,
  p_supplier_name TEXT,
  p_order_date DATE,
  p_total_amount NUMERIC,
  p_product_id UUID,
  p_quantity NUMERIC,
  p_unit_price NUMERIC,
  p_bank_account_id UUID,
  p_description TEXT DEFAULT '',
  p_contact_number TEXT DEFAULT NULL,
  p_credit_wallet_id UUID DEFAULT NULL,
  p_tds_option TEXT DEFAULT 'none',
  p_pan_number TEXT DEFAULT NULL,
  p_fee_percentage NUMERIC DEFAULT NULL,
  p_is_off_market BOOLEAN DEFAULT FALSE,
  p_created_by UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_existing_po_id UUID;
BEGIN
  -- IDEMPOTENCY CHECK: Prevent duplicate purchase orders with the same order number
  SELECT id INTO v_existing_po_id
  FROM public.purchase_orders
  WHERE order_number = p_order_number
  LIMIT 1;

  IF v_existing_po_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'A purchase order with number ' || p_order_number || ' already exists',
      'purchase_order_id', v_existing_po_id
    );
  END IF;

  -- Look up product code for asset_code
  SELECT code INTO v_product_code FROM public.products WHERE id = p_product_id;
  IF v_product_code IS NULL THEN
    v_product_code := 'USDT';
  END IF;

  -- Determine TDS rate
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
    INSERT INTO public.wallet_transactions (
      wallet_id, transaction_type, asset_code, quantity, reference_type,
      reference_id, notes, created_by
    ) VALUES (
      p_credit_wallet_id, 'CREDIT', v_product_code, v_net_credit_quantity,
      'PURCHASE', v_purchase_order_id::TEXT,
      'Manual Purchase - ' || p_order_number || ' - ' || p_supplier_name,
      p_created_by
    );
  END IF;

  INSERT INTO public.stock_transactions (
    product_id, transaction_type, quantity, unit_price, total_amount,
    reason, reference_number, transaction_date
  ) VALUES (
    p_product_id, 'IN', v_net_credit_quantity, p_unit_price,
    v_net_credit_quantity * p_unit_price,
    'Manual Purchase - ' || p_supplier_name, p_order_number, p_order_date
  );

  RETURN jsonb_build_object(
    'success', true,
    'purchase_order_id', v_purchase_order_id,
    'net_payable_amount', v_net_payable_amount,
    'tds_amount', v_tds_amount,
    'fee_amount', v_fee_amount,
    'net_credit_quantity', v_net_credit_quantity
  );
END;
$$;
