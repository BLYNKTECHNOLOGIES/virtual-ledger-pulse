
-- ==============================================
-- Inter-Product Conversion Module
-- ==============================================

-- 1. Add new permission enum values
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'stock_conversion_create';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'stock_conversion_approve';

-- 2. Create erp_product_conversions table
CREATE TABLE public.erp_product_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_no TEXT,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id),
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  asset_code TEXT NOT NULL,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  price_usd NUMERIC NOT NULL CHECK (price_usd > 0),
  gross_usd_value NUMERIC NOT NULL,
  fee_percentage NUMERIC DEFAULT 0,
  fee_amount NUMERIC DEFAULT 0,
  fee_asset TEXT,
  net_asset_change NUMERIC NOT NULL,
  net_usdt_change NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by UUID REFERENCES public.users(id),
  approved_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES public.users(id),
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.erp_product_conversions ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated reads (app uses custom auth, RLS is permissive)
CREATE POLICY "Allow all read access on erp_product_conversions"
  ON public.erp_product_conversions FOR SELECT USING (true);

CREATE POLICY "Allow all insert access on erp_product_conversions"
  ON public.erp_product_conversions FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow all update access on erp_product_conversions"
  ON public.erp_product_conversions FOR UPDATE USING (true);

-- Indexes
CREATE INDEX idx_erp_conversions_status ON public.erp_product_conversions(status);
CREATE INDEX idx_erp_conversions_wallet ON public.erp_product_conversions(wallet_id);
CREATE INDEX idx_erp_conversions_created ON public.erp_product_conversions(created_at DESC);

-- 3. Auto-generate reference_no trigger
CREATE OR REPLACE FUNCTION public.generate_conversion_reference_no()
RETURNS TRIGGER AS $$
DECLARE
  v_date_str TEXT;
  v_seq INT;
BEGIN
  v_date_str := to_char(NEW.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD');
  
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(reference_no FROM '-(\d+)$') AS INT)
  ), 0) + 1
  INTO v_seq
  FROM public.erp_product_conversions
  WHERE reference_no LIKE 'CONV-' || v_date_str || '-%'
    AND id != NEW.id;

  NEW.reference_no := 'CONV-' || v_date_str || '-' || LPAD(v_seq::TEXT, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_conversion_reference_no
  BEFORE INSERT ON public.erp_product_conversions
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_conversion_reference_no();

-- 4. Approve RPC (SECURITY DEFINER, atomic)
CREATE OR REPLACE FUNCTION public.approve_product_conversion(
  p_conversion_id UUID,
  p_approved_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv RECORD;
  v_usdt_balance NUMERIC;
  v_asset_balance NUMERIC;
  v_guard_key TEXT;
BEGIN
  -- Idempotent guard
  v_guard_key := 'ERP_CONVERSION_APPROVE_' || p_conversion_id::TEXT;
  
  INSERT INTO reversal_guards (entity_type, entity_id, action)
  VALUES ('ERP_CONVERSION', p_conversion_id::TEXT, 'approve')
  ON CONFLICT DO NOTHING;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Conversion already processed (idempotent guard).');
  END IF;

  -- Lock and fetch conversion
  SELECT * INTO v_conv
  FROM erp_product_conversions
  WHERE id = p_conversion_id
  FOR UPDATE;

  IF v_conv IS NULL THEN
    DELETE FROM reversal_guards WHERE entity_type = 'ERP_CONVERSION' AND entity_id = p_conversion_id::TEXT AND action = 'approve';
    RETURN jsonb_build_object('success', false, 'error', 'Conversion not found.');
  END IF;

  IF v_conv.status != 'PENDING_APPROVAL' THEN
    DELETE FROM reversal_guards WHERE entity_type = 'ERP_CONVERSION' AND entity_id = p_conversion_id::TEXT AND action = 'approve';
    RETURN jsonb_build_object('success', false, 'error', 'Conversion is not pending approval. Current status: ' || v_conv.status);
  END IF;

  -- Maker-checker: creator cannot approve own conversion
  IF v_conv.created_by = p_approved_by THEN
    DELETE FROM reversal_guards WHERE entity_type = 'ERP_CONVERSION' AND entity_id = p_conversion_id::TEXT AND action = 'approve';
    RETURN jsonb_build_object('success', false, 'error', 'Creator cannot approve their own conversion.');
  END IF;

  -- BUY: check USDT balance
  IF v_conv.side = 'BUY' THEN
    SELECT COALESCE(balance, 0) INTO v_usdt_balance
    FROM wallet_asset_balances
    WHERE wallet_id = v_conv.wallet_id AND asset_code = 'USDT';

    IF v_usdt_balance < v_conv.gross_usd_value THEN
      DELETE FROM reversal_guards WHERE entity_type = 'ERP_CONVERSION' AND entity_id = p_conversion_id::TEXT AND action = 'approve';
      RETURN jsonb_build_object('success', false, 'error', 
        'Insufficient USDT balance. Required: ' || v_conv.gross_usd_value || ', Available: ' || v_usdt_balance);
    END IF;

    -- 1. DEBIT USDT by gross_usd_value
    INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, asset_code, balance_before, balance_after, description, reference_id, reference_type, created_by)
    VALUES (v_conv.wallet_id, 'DEBIT', v_conv.gross_usd_value, 'USDT', 0, 0, 
      'Conversion ' || v_conv.reference_no || ': Buy ' || v_conv.asset_code || ' - USDT debit',
      p_conversion_id::TEXT, 'ERP_CONVERSION', p_approved_by);

    -- 2. CREDIT asset by quantity (gross)
    INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, asset_code, balance_before, balance_after, description, reference_id, reference_type, created_by)
    VALUES (v_conv.wallet_id, 'CREDIT', v_conv.quantity, v_conv.asset_code, 0, 0,
      'Conversion ' || v_conv.reference_no || ': Buy ' || v_conv.asset_code || ' - asset credit',
      p_conversion_id::TEXT, 'ERP_CONVERSION', p_approved_by);

    -- 3. If fee > 0, DEBIT asset by fee_amount
    IF v_conv.fee_amount > 0 THEN
      INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, asset_code, balance_before, balance_after, description, reference_id, reference_type, created_by)
      VALUES (v_conv.wallet_id, 'DEBIT', v_conv.fee_amount, v_conv.asset_code, 0, 0,
        'Conversion ' || v_conv.reference_no || ': Buy ' || v_conv.asset_code || ' - fee debit',
        p_conversion_id::TEXT, 'ERP_CONVERSION', p_approved_by);
    END IF;

  -- SELL: check asset balance
  ELSIF v_conv.side = 'SELL' THEN
    SELECT COALESCE(balance, 0) INTO v_asset_balance
    FROM wallet_asset_balances
    WHERE wallet_id = v_conv.wallet_id AND asset_code = v_conv.asset_code;

    IF v_asset_balance < v_conv.quantity THEN
      DELETE FROM reversal_guards WHERE entity_type = 'ERP_CONVERSION' AND entity_id = p_conversion_id::TEXT AND action = 'approve';
      RETURN jsonb_build_object('success', false, 'error', 
        'Insufficient ' || v_conv.asset_code || ' balance. Required: ' || v_conv.quantity || ', Available: ' || v_asset_balance);
    END IF;

    -- 1. DEBIT asset by quantity
    INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, asset_code, balance_before, balance_after, description, reference_id, reference_type, created_by)
    VALUES (v_conv.wallet_id, 'DEBIT', v_conv.quantity, v_conv.asset_code, 0, 0,
      'Conversion ' || v_conv.reference_no || ': Sell ' || v_conv.asset_code || ' - asset debit',
      p_conversion_id::TEXT, 'ERP_CONVERSION', p_approved_by);

    -- 2. CREDIT USDT by gross_usd_value
    INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, asset_code, balance_before, balance_after, description, reference_id, reference_type, created_by)
    VALUES (v_conv.wallet_id, 'CREDIT', v_conv.gross_usd_value, 'USDT', 0, 0,
      'Conversion ' || v_conv.reference_no || ': Sell ' || v_conv.asset_code || ' - USDT credit',
      p_conversion_id::TEXT, 'ERP_CONVERSION', p_approved_by);

    -- 3. If fee > 0, DEBIT USDT by fee_amount
    IF v_conv.fee_amount > 0 THEN
      INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, asset_code, balance_before, balance_after, description, reference_id, reference_type, created_by)
      VALUES (v_conv.wallet_id, 'DEBIT', v_conv.fee_amount, 'USDT', 0, 0,
        'Conversion ' || v_conv.reference_no || ': Sell ' || v_conv.asset_code || ' - fee debit',
        p_conversion_id::TEXT, 'ERP_CONVERSION', p_approved_by);
    END IF;
  END IF;

  -- Update conversion status
  UPDATE erp_product_conversions
  SET status = 'APPROVED',
      approved_by = p_approved_by,
      approved_at = now()
  WHERE id = p_conversion_id;

  -- Log to audit trail
  INSERT INTO system_action_logs (user_id, action_type, entity_type, entity_id, module, recorded_at, metadata)
  VALUES (p_approved_by, 'stock.conversion_approved', 'erp_conversion', p_conversion_id::TEXT, 'stock', now(), 
    jsonb_build_object('reference_no', v_conv.reference_no, 'side', v_conv.side, 'asset_code', v_conv.asset_code, 'quantity', v_conv.quantity))
  ON CONFLICT (entity_id, action_type) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'reference_no', v_conv.reference_no);
END;
$$;

-- 5. Reject RPC
CREATE OR REPLACE FUNCTION public.reject_product_conversion(
  p_conversion_id UUID,
  p_rejected_by UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv RECORD;
BEGIN
  SELECT * INTO v_conv
  FROM erp_product_conversions
  WHERE id = p_conversion_id
  FOR UPDATE;

  IF v_conv IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Conversion not found.');
  END IF;

  IF v_conv.status != 'PENDING_APPROVAL' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Conversion is not pending approval.');
  END IF;

  UPDATE erp_product_conversions
  SET status = 'REJECTED',
      rejected_by = p_rejected_by,
      rejected_at = now(),
      rejection_reason = p_reason
  WHERE id = p_conversion_id;

  -- Log to audit trail
  INSERT INTO system_action_logs (user_id, action_type, entity_type, entity_id, module, recorded_at, metadata)
  VALUES (p_rejected_by, 'stock.conversion_rejected', 'erp_conversion', p_conversion_id::TEXT, 'stock', now(),
    jsonb_build_object('reference_no', v_conv.reference_no, 'reason', p_reason))
  ON CONFLICT (entity_id, action_type) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'reference_no', v_conv.reference_no);
END;
$$;
