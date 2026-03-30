-- ============================================================
-- CORRECTIVE MIGRATION: Rebuild manual purchase RPCs against
-- current live schema. Fixes schema drift causing 400 errors.
-- ============================================================

-- 1) Drop all overloads to avoid ambiguity
DROP FUNCTION IF EXISTS public.create_manual_purchase_complete_v2(text, text, date, numeric, uuid, numeric, numeric, text, text, uuid, uuid, text, text, numeric, boolean, uuid);
DROP FUNCTION IF EXISTS public.create_manual_purchase_complete_v2(text, text, date, numeric, uuid, numeric, numeric, text, text, uuid, uuid, uuid, text, text, numeric, boolean, uuid);
DROP FUNCTION IF EXISTS public.create_manual_purchase_complete_v2_rpc(text, text, date, numeric, uuid, numeric, numeric, text, text, uuid, uuid, text, text, numeric, boolean, uuid);
DROP FUNCTION IF EXISTS public.create_manual_purchase_complete_rpc(text, text, date, numeric, uuid, numeric, numeric, text, text, uuid, uuid, text, text, numeric, boolean, uuid);
DROP FUNCTION IF EXISTS public.create_manual_purchase_with_split_payments(text, text, date, numeric, uuid, numeric, numeric, text, text, uuid, text, text, numeric, boolean, uuid, jsonb);
DROP FUNCTION IF EXISTS public.create_manual_purchase_with_split_payments_rpc(text, text, date, numeric, uuid, numeric, numeric, text, text, uuid, text, text, numeric, boolean, uuid, jsonb);

-- ============================================================
-- 2) CORE FUNCTION: create_manual_purchase_complete_v2
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_manual_purchase_complete_v2(
  p_order_number TEXT,
  p_supplier_name TEXT,
  p_order_date DATE,
  p_total_amount NUMERIC,
  p_product_id UUID,
  p_quantity NUMERIC,
  p_unit_price NUMERIC,
  p_description TEXT DEFAULT NULL,
  p_contact_number TEXT DEFAULT NULL,
  p_bank_account_id UUID DEFAULT NULL,
  p_credit_wallet_id UUID DEFAULT NULL,
  p_tds_option TEXT DEFAULT 'none',
  p_pan_number TEXT DEFAULT NULL,
  p_fee_percentage NUMERIC DEFAULT 0,
  p_is_off_market BOOLEAN DEFAULT FALSE,
  p_created_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
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
  v_client_id UUID;
  v_product_code TEXT;
  v_acct_type TEXT;
  v_existing_po_id UUID;
  v_market_rate NUMERIC;
  v_pos RECORD;
  v_new_qty NUMERIC;
  v_new_pool NUMERIC;
BEGIN
  -- Idempotency
  SELECT id INTO v_existing_po_id FROM public.purchase_orders WHERE order_number = p_order_number LIMIT 1;
  IF v_existing_po_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'A purchase order with number ' || p_order_number || ' already exists', 'purchase_order_id', v_existing_po_id);
  END IF;

  SELECT code INTO v_product_code FROM public.products WHERE id = p_product_id;
  IF v_product_code IS NULL THEN v_product_code := 'USDT'; END IF;

  IF p_tds_option = '1%' THEN
    v_tds_rate := 1;
    IF p_pan_number IS NULL OR p_pan_number = '' THEN RAISE EXCEPTION 'PAN number is required for 1%% TDS'; END IF;
  ELSIF p_tds_option = '20%' THEN
    v_tds_rate := 20;
  END IF;

  v_tds_amount := p_total_amount * (v_tds_rate / 100);
  v_net_payable_amount := p_total_amount - v_tds_amount;

  IF NOT p_is_off_market AND p_fee_percentage IS NOT NULL AND p_fee_percentage > 0 THEN
    v_fee_amount := p_quantity * (p_fee_percentage / 100);
  END IF;
  v_net_credit_quantity := p_quantity - v_fee_amount;

  SELECT ba.balance, ba.account_type INTO v_bank_balance, v_acct_type FROM public.bank_accounts ba WHERE ba.id = p_bank_account_id AND ba.status = 'ACTIVE';
  IF v_bank_balance IS NULL THEN RAISE EXCEPTION 'Bank account not found or inactive'; END IF;
  IF COALESCE(v_acct_type, '') <> 'CREDIT' AND v_bank_balance < v_net_payable_amount THEN
    RAISE EXCEPTION 'Insufficient bank balance. Available: %, Required: %', v_bank_balance, v_net_payable_amount;
  END IF;

  SELECT CASE WHEN EXTRACT(MONTH FROM p_order_date) >= 4 THEN EXTRACT(YEAR FROM p_order_date)::TEXT || '-' || (EXTRACT(YEAR FROM p_order_date) + 1)::TEXT ELSE (EXTRACT(YEAR FROM p_order_date) - 1)::TEXT || '-' || EXTRACT(YEAR FROM p_order_date)::TEXT END INTO v_financial_year;

  IF p_pan_number IS NOT NULL AND p_pan_number != '' THEN
    SELECT id INTO v_client_id FROM public.clients WHERE LOWER(name) = LOWER(p_supplier_name) OR (p_contact_number IS NOT NULL AND phone = p_contact_number) LIMIT 1;
    IF v_client_id IS NOT NULL THEN
      UPDATE public.clients SET pan_card_number = p_pan_number, updated_at = NOW() WHERE id = v_client_id AND (pan_card_number IS NULL OR pan_card_number = '');
    END IF;
  END IF;

  v_market_rate := CASE WHEN p_quantity > 0 THEN p_unit_price ELSE 0 END;

  INSERT INTO public.purchase_orders (order_number, supplier_name, order_date, description, total_amount, contact_number, status, total_paid, bank_account_id, tds_applied, pan_number, tds_amount, net_payable_amount, quantity, price_per_unit, is_off_market, fee_percentage, fee_amount, net_amount, wallet_id, created_by, market_rate_usdt)
  VALUES (p_order_number, p_supplier_name, p_order_date, p_description, p_total_amount, p_contact_number, 'COMPLETED', v_net_payable_amount, p_bank_account_id, v_tds_rate > 0, CASE WHEN v_tds_rate > 0 THEN p_pan_number ELSE NULL END, v_tds_amount, v_net_payable_amount, p_quantity, p_unit_price, p_is_off_market, COALESCE(p_fee_percentage, 0), v_fee_amount, v_net_credit_quantity, p_credit_wallet_id, p_created_by, v_market_rate)
  RETURNING id INTO v_purchase_order_id;

  INSERT INTO public.purchase_order_items (purchase_order_id, product_id, quantity, unit_price, total_price, warehouse_id)
  VALUES (v_purchase_order_id, p_product_id, p_quantity, p_unit_price, p_total_amount, p_credit_wallet_id);

  INSERT INTO public.bank_transactions (bank_account_id, transaction_type, amount, description, reference_number, transaction_date, category, related_account_name, created_by)
  VALUES (p_bank_account_id, 'EXPENSE', v_net_payable_amount, 'Manual Purchase - ' || p_order_number || ' - ' || p_supplier_name || CASE WHEN v_tds_rate > 0 THEN ' (TDS: ' || v_tds_rate || '%)' ELSE '' END, p_order_number, p_order_date, 'Purchase', p_supplier_name, p_created_by);

  IF v_tds_rate > 0 THEN
    INSERT INTO public.tds_records (purchase_order_id, pan_number, total_amount, tds_rate, tds_amount, net_payable_amount, deduction_date, financial_year)
    VALUES (v_purchase_order_id, p_pan_number, p_total_amount, v_tds_rate, v_tds_amount, v_net_payable_amount, p_order_date, v_financial_year);
  END IF;

  INSERT INTO public.stock_transactions (product_id, transaction_type, quantity, unit_price, total_amount, reference_number, supplier_customer_name, transaction_date, reason, created_by)
  VALUES (p_product_id, 'IN', v_net_credit_quantity, p_unit_price, v_net_credit_quantity * p_unit_price, p_order_number, p_supplier_name, p_order_date, 'Manual Purchase - ' || p_supplier_name, p_created_by);

  IF p_credit_wallet_id IS NOT NULL THEN
    INSERT INTO public.wallet_transactions (wallet_id, transaction_type, amount, description, reference_id, reference_type, asset_code, balance_before, balance_after, created_by)
    VALUES (p_credit_wallet_id, 'CREDIT', v_net_credit_quantity, 'Manual Purchase - ' || p_order_number || ' (' || p_supplier_name || ')', v_purchase_order_id, 'PURCHASE_ORDER', v_product_code, 0, 0, p_created_by);

    IF v_fee_amount > 0 THEN
      INSERT INTO public.wallet_transactions (wallet_id, transaction_type, amount, description, reference_id, reference_type, asset_code, balance_before, balance_after, created_by)
      VALUES (p_credit_wallet_id, 'FEE', v_fee_amount, 'Platform fee for purchase ' || p_order_number, v_purchase_order_id, 'PURCHASE_ORDER', v_product_code, 0, 0, p_created_by);
    END IF;

    IF v_market_rate > 0 AND v_net_credit_quantity > 0 THEN
      SELECT * INTO v_pos FROM public.wallet_asset_positions WHERE wallet_id = p_credit_wallet_id AND asset_code = v_product_code FOR UPDATE;
      IF v_pos IS NULL THEN
        INSERT INTO public.wallet_asset_positions (wallet_id, asset_code, qty_on_hand, cost_pool_usdt, avg_cost_usdt) VALUES (p_credit_wallet_id, v_product_code, v_net_credit_quantity, v_net_credit_quantity * v_market_rate, v_market_rate);
      ELSE
        v_new_qty := GREATEST(v_pos.qty_on_hand, 0) + v_net_credit_quantity;
        v_new_pool := GREATEST(v_pos.cost_pool_usdt, 0) + (v_net_credit_quantity * v_market_rate);
        UPDATE public.wallet_asset_positions SET qty_on_hand = v_new_qty, cost_pool_usdt = v_new_pool, avg_cost_usdt = CASE WHEN v_new_qty > 0 THEN v_new_pool / v_new_qty ELSE 0 END, updated_at = NOW() WHERE wallet_id = p_credit_wallet_id AND asset_code = v_product_code;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.purchase_order_payment_splits (purchase_order_id, bank_account_id, amount, created_by)
  VALUES (v_purchase_order_id, p_bank_account_id, v_net_payable_amount, p_created_by);

  RETURN jsonb_build_object('success', true, 'purchase_order_id', v_purchase_order_id, 'tds_amount', v_tds_amount, 'net_payable_amount', v_net_payable_amount, 'fee_amount', v_fee_amount, 'net_credit_quantity', v_net_credit_quantity);
END;
$$;

-- ============================================================
-- 3) CORE FUNCTION: create_manual_purchase_with_split_payments
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_manual_purchase_with_split_payments(
  p_order_number TEXT, p_supplier_name TEXT, p_order_date DATE, p_total_amount NUMERIC,
  p_product_id UUID, p_quantity NUMERIC, p_unit_price NUMERIC,
  p_description TEXT DEFAULT NULL, p_contact_number TEXT DEFAULT NULL,
  p_credit_wallet_id UUID DEFAULT NULL, p_tds_option TEXT DEFAULT 'none',
  p_pan_number TEXT DEFAULT NULL, p_fee_percentage NUMERIC DEFAULT 0,
  p_is_off_market BOOLEAN DEFAULT FALSE, p_created_by UUID DEFAULT NULL,
  p_payment_splits JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_purchase_order_id UUID; v_tds_rate NUMERIC := 0; v_tds_amount NUMERIC := 0;
  v_net_payable_amount NUMERIC; v_fee_amount NUMERIC := 0; v_net_credit_quantity NUMERIC;
  v_financial_year TEXT; v_client_id UUID; v_split JSONB; v_bank_id UUID;
  v_split_amount NUMERIC; v_bank_balance NUMERIC; v_total_splits NUMERIC := 0;
  v_bank_name TEXT; v_product_code TEXT; v_acct_type TEXT; v_market_rate NUMERIC;
  v_pos RECORD; v_new_qty NUMERIC; v_new_pool NUMERIC;
BEGIN
  SELECT code INTO v_product_code FROM public.products WHERE id = p_product_id;
  IF v_product_code IS NULL THEN v_product_code := 'USDT'; END IF;

  IF p_tds_option = '1%' THEN
    v_tds_rate := 1;
    IF p_pan_number IS NULL OR p_pan_number = '' THEN RAISE EXCEPTION 'PAN number is required for 1%% TDS'; END IF;
  ELSIF p_tds_option = '20%' THEN v_tds_rate := 20; END IF;

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
    RAISE EXCEPTION 'Split payment total (%) does not match net payable (%)', v_total_splits, v_net_payable_amount;
  END IF;

  FOR v_split IN SELECT * FROM jsonb_array_elements(p_payment_splits) LOOP
    v_bank_id := (v_split->>'bank_account_id')::UUID;
    v_split_amount := (v_split->>'amount')::NUMERIC;
    SELECT ba.balance, ba.account_name, ba.account_type INTO v_bank_balance, v_bank_name, v_acct_type FROM public.bank_accounts ba WHERE ba.id = v_bank_id AND ba.status = 'ACTIVE';
    IF v_bank_balance IS NULL THEN RAISE EXCEPTION 'Bank account not found or inactive'; END IF;
    IF COALESCE(v_acct_type, '') <> 'CREDIT' AND v_bank_balance < v_split_amount THEN
      RAISE EXCEPTION 'Insufficient balance in %. Available: %, Required: %', v_bank_name, v_bank_balance, v_split_amount;
    END IF;
  END LOOP;

  SELECT CASE WHEN EXTRACT(MONTH FROM p_order_date) >= 4 THEN EXTRACT(YEAR FROM p_order_date)::TEXT || '-' || (EXTRACT(YEAR FROM p_order_date) + 1)::TEXT ELSE (EXTRACT(YEAR FROM p_order_date) - 1)::TEXT || '-' || EXTRACT(YEAR FROM p_order_date)::TEXT END INTO v_financial_year;

  IF p_pan_number IS NOT NULL AND p_pan_number != '' THEN
    SELECT id INTO v_client_id FROM public.clients WHERE LOWER(name) = LOWER(p_supplier_name) OR (p_contact_number IS NOT NULL AND phone = p_contact_number) LIMIT 1;
    IF v_client_id IS NOT NULL THEN
      UPDATE public.clients SET pan_card_number = p_pan_number, updated_at = NOW() WHERE id = v_client_id AND (pan_card_number IS NULL OR pan_card_number = '');
    END IF;
  END IF;

  v_market_rate := CASE WHEN p_quantity > 0 THEN p_unit_price ELSE 0 END;

  INSERT INTO public.purchase_orders (order_number, supplier_name, order_date, description, total_amount, contact_number, status, total_paid, bank_account_id, tds_applied, pan_number, tds_amount, net_payable_amount, quantity, price_per_unit, is_off_market, fee_percentage, fee_amount, net_amount, wallet_id, created_by, market_rate_usdt)
  VALUES (p_order_number, p_supplier_name, p_order_date, p_description, p_total_amount, p_contact_number, 'COMPLETED', v_net_payable_amount, NULL, v_tds_rate > 0, CASE WHEN v_tds_rate > 0 THEN p_pan_number ELSE NULL END, v_tds_amount, v_net_payable_amount, p_quantity, p_unit_price, p_is_off_market, COALESCE(p_fee_percentage, 0), v_fee_amount, v_net_credit_quantity, p_credit_wallet_id, p_created_by, v_market_rate)
  RETURNING id INTO v_purchase_order_id;

  INSERT INTO public.purchase_order_items (purchase_order_id, product_id, quantity, unit_price, total_price, warehouse_id)
  VALUES (v_purchase_order_id, p_product_id, p_quantity, p_unit_price, p_total_amount, p_credit_wallet_id);

  FOR v_split IN SELECT * FROM jsonb_array_elements(p_payment_splits) LOOP
    v_bank_id := (v_split->>'bank_account_id')::UUID;
    v_split_amount := (v_split->>'amount')::NUMERIC;
    SELECT ba.account_name INTO v_bank_name FROM public.bank_accounts ba WHERE ba.id = v_bank_id;
    INSERT INTO public.bank_transactions (bank_account_id, transaction_type, amount, description, reference_number, transaction_date, category, related_account_name, created_by)
    VALUES (v_bank_id, 'EXPENSE', v_split_amount, 'Manual Purchase - ' || p_order_number || ' - ' || p_supplier_name || CASE WHEN v_tds_rate > 0 THEN ' (TDS: ' || v_tds_rate || '%)' ELSE '' END || ' [Split Payment]', p_order_number, p_order_date, 'Purchase', p_supplier_name, p_created_by);
    INSERT INTO public.purchase_order_payment_splits (purchase_order_id, bank_account_id, amount, created_by)
    VALUES (v_purchase_order_id, v_bank_id, v_split_amount, p_created_by);
  END LOOP;

  IF v_tds_rate > 0 THEN
    INSERT INTO public.tds_records (purchase_order_id, pan_number, total_amount, tds_rate, tds_amount, net_payable_amount, deduction_date, financial_year)
    VALUES (v_purchase_order_id, p_pan_number, p_total_amount, v_tds_rate, v_tds_amount, v_net_payable_amount, p_order_date, v_financial_year);
  END IF;

  INSERT INTO public.stock_transactions (product_id, transaction_type, quantity, unit_price, total_amount, reference_number, supplier_customer_name, transaction_date, reason, created_by)
  VALUES (p_product_id, 'IN', v_net_credit_quantity, p_unit_price, v_net_credit_quantity * p_unit_price, p_order_number, p_supplier_name, p_order_date, 'Manual Purchase [Split Payment] - ' || p_supplier_name, p_created_by);

  IF p_credit_wallet_id IS NOT NULL THEN
    INSERT INTO public.wallet_transactions (wallet_id, transaction_type, amount, description, reference_id, reference_type, asset_code, balance_before, balance_after, created_by)
    VALUES (p_credit_wallet_id, 'CREDIT', v_net_credit_quantity, 'Manual Purchase credit - ' || p_order_number || ' - ' || p_supplier_name || CASE WHEN v_fee_amount > 0 THEN ' (Fee: ' || ROUND(v_fee_amount, 4) || ')' ELSE '' END || ' [Split Payment]', v_purchase_order_id, 'PURCHASE_ORDER', v_product_code, 0, 0, p_created_by);
    IF v_fee_amount > 0 THEN
      INSERT INTO public.wallet_transactions (wallet_id, transaction_type, amount, description, reference_id, reference_type, asset_code, balance_before, balance_after, created_by)
      VALUES (p_credit_wallet_id, 'FEE', v_fee_amount, 'Platform fee for purchase ' || p_order_number, v_purchase_order_id, 'PURCHASE_ORDER', v_product_code, 0, 0, p_created_by);
    END IF;
    IF v_market_rate > 0 AND v_net_credit_quantity > 0 THEN
      SELECT * INTO v_pos FROM public.wallet_asset_positions WHERE wallet_id = p_credit_wallet_id AND asset_code = v_product_code FOR UPDATE;
      IF v_pos IS NULL THEN
        INSERT INTO public.wallet_asset_positions (wallet_id, asset_code, qty_on_hand, cost_pool_usdt, avg_cost_usdt) VALUES (p_credit_wallet_id, v_product_code, v_net_credit_quantity, v_net_credit_quantity * v_market_rate, v_market_rate);
      ELSE
        v_new_qty := GREATEST(v_pos.qty_on_hand, 0) + v_net_credit_quantity;
        v_new_pool := GREATEST(v_pos.cost_pool_usdt, 0) + (v_net_credit_quantity * v_market_rate);
        UPDATE public.wallet_asset_positions SET qty_on_hand = v_new_qty, cost_pool_usdt = v_new_pool, avg_cost_usdt = CASE WHEN v_new_qty > 0 THEN v_new_pool / v_new_qty ELSE 0 END, updated_at = NOW() WHERE wallet_id = p_credit_wallet_id AND asset_code = v_product_code;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'purchase_order_id', v_purchase_order_id, 'message', 'Manual purchase entry with split payments completed successfully', 'tds_amount', v_tds_amount, 'net_payable_amount', v_net_payable_amount, 'fee_amount', v_fee_amount, 'net_credit_quantity', v_net_credit_quantity, 'asset_code', v_product_code, 'client_pan_updated', v_client_id IS NOT NULL, 'payment_splits_count', jsonb_array_length(p_payment_splits));
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================
-- 4) RPC WRAPPERS with permission checks
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_manual_purchase_complete_v2_rpc(
  p_order_number TEXT, p_supplier_name TEXT, p_order_date DATE, p_total_amount NUMERIC,
  p_product_id UUID, p_quantity NUMERIC, p_unit_price NUMERIC,
  p_description TEXT DEFAULT NULL, p_contact_number TEXT DEFAULT NULL,
  p_bank_account_id UUID DEFAULT NULL, p_credit_wallet_id UUID DEFAULT NULL,
  p_tds_option TEXT DEFAULT 'none', p_pan_number TEXT DEFAULT NULL,
  p_fee_percentage NUMERIC DEFAULT 0, p_is_off_market BOOLEAN DEFAULT FALSE,
  p_created_by UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE v_result JSONB;
BEGIN
  PERFORM public.require_permission(auth.uid(), 'purchase_manage', 'create_purchase_order');
  SELECT public.create_manual_purchase_complete_v2(p_order_number := p_order_number, p_supplier_name := p_supplier_name, p_order_date := p_order_date, p_total_amount := p_total_amount, p_product_id := p_product_id, p_quantity := p_quantity, p_unit_price := p_unit_price, p_description := p_description, p_contact_number := p_contact_number, p_bank_account_id := p_bank_account_id, p_credit_wallet_id := p_credit_wallet_id, p_tds_option := p_tds_option, p_pan_number := p_pan_number, p_fee_percentage := p_fee_percentage, p_is_off_market := p_is_off_market, p_created_by := p_created_by) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_manual_purchase_complete_rpc(
  p_order_number TEXT, p_supplier_name TEXT, p_order_date DATE, p_total_amount NUMERIC,
  p_product_id UUID, p_quantity NUMERIC, p_unit_price NUMERIC,
  p_description TEXT DEFAULT NULL, p_contact_number TEXT DEFAULT NULL,
  p_bank_account_id UUID DEFAULT NULL, p_credit_wallet_id UUID DEFAULT NULL,
  p_tds_option TEXT DEFAULT 'none', p_pan_number TEXT DEFAULT NULL,
  p_fee_percentage NUMERIC DEFAULT 0, p_is_off_market BOOLEAN DEFAULT FALSE,
  p_created_by UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE v_result JSONB;
BEGIN
  PERFORM public.require_permission(auth.uid(), 'purchase_manage', 'create_purchase_order');
  SELECT public.create_manual_purchase_complete_v2(p_order_number := p_order_number, p_supplier_name := p_supplier_name, p_order_date := p_order_date, p_total_amount := p_total_amount, p_product_id := p_product_id, p_quantity := p_quantity, p_unit_price := p_unit_price, p_description := p_description, p_contact_number := p_contact_number, p_bank_account_id := p_bank_account_id, p_credit_wallet_id := p_credit_wallet_id, p_tds_option := p_tds_option, p_pan_number := p_pan_number, p_fee_percentage := p_fee_percentage, p_is_off_market := p_is_off_market, p_created_by := p_created_by) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_manual_purchase_with_split_payments_rpc(
  p_order_number TEXT, p_supplier_name TEXT, p_order_date DATE, p_total_amount NUMERIC,
  p_product_id UUID, p_quantity NUMERIC, p_unit_price NUMERIC,
  p_description TEXT DEFAULT NULL, p_contact_number TEXT DEFAULT NULL,
  p_credit_wallet_id UUID DEFAULT NULL, p_tds_option TEXT DEFAULT 'none',
  p_pan_number TEXT DEFAULT NULL, p_fee_percentage NUMERIC DEFAULT 0,
  p_is_off_market BOOLEAN DEFAULT FALSE, p_created_by UUID DEFAULT NULL,
  p_payment_splits JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE v_result JSONB;
BEGIN
  PERFORM public.require_permission(auth.uid(), 'purchase_manage', 'create_purchase_order');
  SELECT public.create_manual_purchase_with_split_payments(p_order_number := p_order_number, p_supplier_name := p_supplier_name, p_order_date := p_order_date, p_total_amount := p_total_amount, p_product_id := p_product_id, p_quantity := p_quantity, p_unit_price := p_unit_price, p_description := p_description, p_contact_number := p_contact_number, p_credit_wallet_id := p_credit_wallet_id, p_tds_option := p_tds_option, p_pan_number := p_pan_number, p_fee_percentage := p_fee_percentage, p_is_off_market := p_is_off_market, p_created_by := p_created_by, p_payment_splits := p_payment_splits) INTO v_result;
  RETURN v_result;
END;
$$;