-- =====================================================================
-- MIGRATION 1: Soft-warn audit for adjustments posted to operational wallets
-- Prevention-only. No balance changes. No RPC changes.
-- =====================================================================

-- 1. Ensure the Balance Adjustment Wallet exists.
INSERT INTO public.wallets (wallet_name, wallet_address, wallet_type, current_balance, is_active)
SELECT 'Balance Adjustment Wallet', 'INTERNAL-ADJUSTMENT-BUCKET', 'INTERNAL', 0, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.wallets WHERE LOWER(TRIM(wallet_name)) = 'balance adjustment wallet'
);

-- 2. Audit table.
CREATE TABLE IF NOT EXISTS public.adjustment_posting_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL,
  wallet_name text,
  asset_code text,
  reference_type text NOT NULL,
  transaction_type text NOT NULL,
  amount numeric NOT NULL,
  description text,
  posted_by uuid,
  posted_at timestamptz NOT NULL DEFAULT now(),
  wallet_transaction_id uuid,
  notes text DEFAULT 'Adjustment posted to operational wallet instead of Balance Adjustment Wallet'
);

ALTER TABLE public.adjustment_posting_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "adjustment_audit_admin_read" ON public.adjustment_posting_audit;
CREATE POLICY "adjustment_audit_admin_read"
  ON public.adjustment_posting_audit
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'Super Admin')
    OR public.has_role(auth.uid(), 'Admin')
  );

CREATE INDEX IF NOT EXISTS idx_adjustment_audit_wallet_time
  ON public.adjustment_posting_audit (wallet_id, posted_at DESC);

-- 3. Trigger function.
CREATE OR REPLACE FUNCTION public.fn_audit_operational_adjustment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_name text;
BEGIN
  IF NEW.reference_type NOT IN ('MANUAL_ADJUSTMENT', 'OPENING_BALANCE', 'ADJUSTMENT') THEN
    RETURN NEW;
  END IF;

  SELECT wallet_name INTO v_wallet_name FROM public.wallets WHERE id = NEW.wallet_id;

  IF LOWER(TRIM(COALESCE(v_wallet_name, ''))) = 'balance adjustment wallet' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.adjustment_posting_audit (
    wallet_id, wallet_name, asset_code, reference_type, transaction_type,
    amount, description, posted_by, wallet_transaction_id
  ) VALUES (
    NEW.wallet_id, v_wallet_name, NEW.asset_code, NEW.reference_type, NEW.transaction_type,
    NEW.amount, NEW.description, NEW.created_by, NEW.id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_operational_adjustment ON public.wallet_transactions;
CREATE TRIGGER trg_audit_operational_adjustment
  AFTER INSERT ON public.wallet_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_audit_operational_adjustment();