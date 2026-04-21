
-- ============================================================================
-- LAYER 1: CACHE LOCK TRIGGERS + ONE-TIME BACKFILL
-- ============================================================================

-- Helper: bank-accounts also need a generic "Balance Adjustment" bank exclusion check
-- (wallets adjustment bucket id = 1ef0342f-b0ee-41c5-b3c1-8f589696ad0b)

-- 1A. Per-asset wallet calculated balance function (Layer 2 prerequisite)
CREATE OR REPLACE FUNCTION public.get_wallet_calculated_balances_per_asset()
RETURNS TABLE(wallet_id uuid, wallet_name text, asset_code text, calculated_balance numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT w.id, w.wallet_name, wt.asset_code,
    COALESCE(SUM(
      CASE 
        WHEN wt.transaction_type IN ('CREDIT', 'TRANSFER_IN') THEN wt.amount
        WHEN wt.transaction_type IN ('DEBIT', 'TRANSFER_OUT', 'FEE') THEN -wt.amount
        ELSE 0 
      END
    ), 0) as calculated_balance
  FROM wallets w
  JOIN wallet_transactions wt ON wt.wallet_id = w.id
  WHERE wt.asset_code IS NOT NULL
  GROUP BY w.id, w.wallet_name, wt.asset_code;
$$;

-- 1B. Bank cache lock trigger
-- Any UPDATE that tries to set bank_accounts.balance to a value other than the
-- calculated SUM(bank_transactions) is silently corrected and audited.
CREATE OR REPLACE FUNCTION public.enforce_bank_balance_from_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_calc numeric;
BEGIN
  -- Only act when balance column is being changed
  IF NEW.balance IS DISTINCT FROM OLD.balance THEN
    SELECT COALESCE(calculated_balance, 0) INTO v_calc
    FROM public.get_bank_calculated_balances()
    WHERE bank_account_id = NEW.id;
    v_calc := COALESCE(v_calc, 0);

    IF ROUND(NEW.balance::numeric, 2) <> ROUND(v_calc::numeric, 2) THEN
      -- Audit the override
      INSERT INTO public.adjustment_posting_audit (
        wallet_id, wallet_name, transaction_type, reference_type,
        amount, asset_code, description, notes
      ) VALUES (
        NEW.id, NEW.account_name, 'CACHE_LOCK_CORRECTION', 'BANK_BALANCE_LOCK',
        v_calc - NEW.balance, 'INR',
        'Bank balance cache lock auto-correction',
        format('Attempted write %s, forced to ledger sum %s', NEW.balance, v_calc)
      );
      NEW.balance := v_calc;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_bank_balance_from_ledger ON public.bank_accounts;
CREATE TRIGGER trg_enforce_bank_balance_from_ledger
BEFORE UPDATE OF balance ON public.bank_accounts
FOR EACH ROW
EXECUTE FUNCTION public.enforce_bank_balance_from_ledger();

-- 1C. Wallet asset balance cache lock
CREATE OR REPLACE FUNCTION public.enforce_wallet_asset_balance_from_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_calc numeric;
  v_wallet_name text;
BEGIN
  IF NEW.balance IS DISTINCT FROM OLD.balance THEN
    SELECT calculated_balance INTO v_calc
    FROM public.get_wallet_calculated_balances_per_asset()
    WHERE wallet_id = NEW.wallet_id AND asset_code = NEW.asset_code;
    v_calc := COALESCE(v_calc, 0);

    IF ROUND(NEW.balance::numeric, 8) <> ROUND(v_calc::numeric, 8) THEN
      SELECT wallet_name INTO v_wallet_name FROM wallets WHERE id = NEW.wallet_id;
      INSERT INTO public.adjustment_posting_audit (
        wallet_id, wallet_name, transaction_type, reference_type,
        amount, asset_code, description, notes
      ) VALUES (
        NEW.wallet_id, v_wallet_name, 'CACHE_LOCK_CORRECTION', 'WALLET_ASSET_LOCK',
        v_calc - NEW.balance, NEW.asset_code,
        'Wallet asset balance cache lock auto-correction',
        format('Asset %s: attempted write %s, forced to ledger sum %s', NEW.asset_code, NEW.balance, v_calc)
      );
      NEW.balance := v_calc;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_wallet_asset_balance_from_ledger ON public.wallet_asset_balances;
CREATE TRIGGER trg_enforce_wallet_asset_balance_from_ledger
BEFORE UPDATE OF balance ON public.wallet_asset_balances
FOR EACH ROW
EXECUTE FUNCTION public.enforce_wallet_asset_balance_from_ledger();

-- 1D. wallets.current_balance cache lock (uses USDT-only summary RPC)
CREATE OR REPLACE FUNCTION public.enforce_wallet_summary_balance_from_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_calc numeric;
BEGIN
  IF NEW.current_balance IS DISTINCT FROM OLD.current_balance THEN
    SELECT calculated_balance INTO v_calc
    FROM public.get_wallet_calculated_balances()
    WHERE wallet_id = NEW.id;
    v_calc := COALESCE(v_calc, 0);

    IF ROUND(NEW.current_balance::numeric, 2) <> ROUND(v_calc::numeric, 2) THEN
      INSERT INTO public.adjustment_posting_audit (
        wallet_id, wallet_name, transaction_type, reference_type,
        amount, asset_code, description, notes
      ) VALUES (
        NEW.id, NEW.wallet_name, 'CACHE_LOCK_CORRECTION', 'WALLET_SUMMARY_LOCK',
        v_calc - NEW.current_balance, 'USDT',
        'Wallet summary cache lock auto-correction',
        format('Attempted write %s, forced to ledger sum %s', NEW.current_balance, v_calc)
      );
      NEW.current_balance := v_calc;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_wallet_summary_balance_from_ledger ON public.wallets;
CREATE TRIGGER trg_enforce_wallet_summary_balance_from_ledger
BEFORE UPDATE OF current_balance ON public.wallets
FOR EACH ROW
EXECUTE FUNCTION public.enforce_wallet_summary_balance_from_ledger();

-- ============================================================================
-- 1E. ONE-TIME BACKFILL — re-derive bank_accounts.balance from ledger SUM
-- The cache lock trigger above will perform the audit insert + correction
-- when we trigger the UPDATE.
-- ============================================================================
DO $$
DECLARE
  r record;
  v_calc numeric;
BEGIN
  FOR r IN SELECT id, balance, account_name FROM bank_accounts LOOP
    SELECT COALESCE(calculated_balance, 0) INTO v_calc
    FROM public.get_bank_calculated_balances()
    WHERE bank_account_id = r.id;
    v_calc := COALESCE(v_calc, 0);
    IF ROUND(r.balance::numeric, 2) <> ROUND(v_calc::numeric, 2) THEN
      -- Touch the row; the BEFORE UPDATE trigger forces correction + audit
      UPDATE bank_accounts SET balance = v_calc WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- LAYER 2: ALERTS TABLE EXTENSIONS
-- ============================================================================

ALTER TABLE public.erp_drift_alerts
  ADD COLUMN IF NOT EXISTS asset_code text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'INTERNAL_SNAPSHOT',
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_erp_drift_alerts_open
  ON public.erp_drift_alerts (entity_type, entity_id, asset_code)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_erp_drift_alerts_source
  ON public.erp_drift_alerts (source, created_at DESC);

-- RLS: read-only for authenticated; writes via service role only.
ALTER TABLE public.erp_drift_alerts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='erp_drift_alerts'
      AND policyname='drift_alerts_read_authenticated'
  ) THEN
    CREATE POLICY drift_alerts_read_authenticated
      ON public.erp_drift_alerts FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;
