
-- ============================================================
-- Phase 10 — Payroll Ledger Reconciliation
-- ============================================================

-- 1) Matches: link payout rows to bank_transactions ---------------------------
CREATE TABLE IF NOT EXISTS public.hr_razorpay_ledger_matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_month DATE NOT NULL,
  payout_record_id UUID NOT NULL REFERENCES public.hr_razorpay_payout_records(id) ON DELETE CASCADE,
  bank_transaction_id UUID REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  match_method TEXT NOT NULL CHECK (match_method IN ('auto_utr','auto_amount','manual','waived')),
  matched_amount NUMERIC(18,2),
  variance NUMERIC(18,2),
  note TEXT,
  matched_by UUID,
  matched_by_name TEXT,
  matched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_razorpay_ledger_matches_payout_unique UNIQUE (payout_record_id)
);

CREATE INDEX IF NOT EXISTS idx_ledger_matches_period   ON public.hr_razorpay_ledger_matches(period_month);
CREATE INDEX IF NOT EXISTS idx_ledger_matches_bank_txn ON public.hr_razorpay_ledger_matches(bank_transaction_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_razorpay_ledger_matches TO authenticated;
GRANT ALL ON public.hr_razorpay_ledger_matches TO service_role;

ALTER TABLE public.hr_razorpay_ledger_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hrms_razorpay_sync reads ledger matches"
  ON public.hr_razorpay_ledger_matches FOR SELECT TO authenticated
  USING (public.user_has_permission(auth.uid(), 'hrms_razorpay_sync'));

CREATE POLICY "hrms_razorpay_sync inserts ledger matches"
  ON public.hr_razorpay_ledger_matches FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission(auth.uid(), 'hrms_razorpay_sync'));

CREATE POLICY "hrms_razorpay_sync updates ledger matches"
  ON public.hr_razorpay_ledger_matches FOR UPDATE TO authenticated
  USING (public.user_has_permission(auth.uid(), 'hrms_razorpay_sync'))
  WITH CHECK (public.user_has_permission(auth.uid(), 'hrms_razorpay_sync'));

CREATE POLICY "hrms_razorpay_sync deletes ledger matches"
  ON public.hr_razorpay_ledger_matches FOR DELETE TO authenticated
  USING (public.user_has_permission(auth.uid(), 'hrms_razorpay_sync'));

-- 2) Period sign-off tracker --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_razorpay_ledger_periods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_month DATE NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','reviewed','signed_off','reopened')),
  total_paid NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_matched NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_unmatched NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_waived NUMERIC(18,2) NOT NULL DEFAULT 0,
  reviewed_by UUID,
  reviewed_by_name TEXT,
  reviewed_at TIMESTAMPTZ,
  signed_off_by UUID,
  signed_off_by_name TEXT,
  signed_off_at TIMESTAMPTZ,
  reopen_reason TEXT,
  reopened_by UUID,
  reopened_by_name TEXT,
  reopened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_razorpay_ledger_periods TO authenticated;
GRANT ALL ON public.hr_razorpay_ledger_periods TO service_role;

ALTER TABLE public.hr_razorpay_ledger_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hrms_razorpay_sync reads ledger periods"
  ON public.hr_razorpay_ledger_periods FOR SELECT TO authenticated
  USING (public.user_has_permission(auth.uid(), 'hrms_razorpay_sync'));

CREATE POLICY "hrms_razorpay_sync inserts ledger periods"
  ON public.hr_razorpay_ledger_periods FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission(auth.uid(), 'hrms_razorpay_sync'));

CREATE POLICY "hrms_razorpay_sync updates ledger periods"
  ON public.hr_razorpay_ledger_periods FOR UPDATE TO authenticated
  USING (public.user_has_permission(auth.uid(), 'hrms_razorpay_sync'))
  WITH CHECK (public.user_has_permission(auth.uid(), 'hrms_razorpay_sync'));

-- 3) Touch-updated-at trigger -------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_razorpay_ledger_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_hr_razorpay_ledger_matches ON public.hr_razorpay_ledger_matches;
CREATE TRIGGER trg_touch_hr_razorpay_ledger_matches
BEFORE UPDATE ON public.hr_razorpay_ledger_matches
FOR EACH ROW EXECUTE FUNCTION public.hr_razorpay_ledger_touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_hr_razorpay_ledger_periods ON public.hr_razorpay_ledger_periods;
CREATE TRIGGER trg_touch_hr_razorpay_ledger_periods
BEFORE UPDATE ON public.hr_razorpay_ledger_periods
FOR EACH ROW EXECUTE FUNCTION public.hr_razorpay_ledger_touch_updated_at();

-- 4) Settings flag ------------------------------------------------------------
ALTER TABLE public.hr_razorpay_settings
  ADD COLUMN IF NOT EXISTS ledger_recon_signoff_locked BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.hr_razorpay_settings.ledger_recon_signoff_locked IS
  'When true (default), signed-off ledger periods reject all match/unmatch writes at the edge function.';

-- 5) Cross-phase guard: block Phase 8 payout re-pull clobber on signed-off periods
CREATE OR REPLACE FUNCTION public.hr_razorpay_block_payout_when_signed_off()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  locked_status TEXT;
BEGIN
  SELECT status INTO locked_status
    FROM public.hr_razorpay_ledger_periods
    WHERE period_month = COALESCE(NEW.period_month, OLD.period_month);

  IF locked_status = 'signed_off' THEN
    RAISE EXCEPTION 'Payout record for period % is locked by a signed-off ledger period. Reopen the ledger period first.',
      COALESCE(NEW.period_month, OLD.period_month)
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_payout_updates_when_signed_off ON public.hr_razorpay_payout_records;
CREATE TRIGGER trg_block_payout_updates_when_signed_off
BEFORE INSERT OR UPDATE ON public.hr_razorpay_payout_records
FOR EACH ROW EXECUTE FUNCTION public.hr_razorpay_block_payout_when_signed_off();

-- 6) Same guard for Phase 9 payslips
CREATE OR REPLACE FUNCTION public.hr_razorpay_block_payslip_when_signed_off()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  locked_status TEXT;
BEGIN
  SELECT status INTO locked_status
    FROM public.hr_razorpay_ledger_periods
    WHERE period_month = COALESCE(NEW.period_month, OLD.period_month);

  IF locked_status = 'signed_off' THEN
    RAISE EXCEPTION 'Payslip record for period % is locked by a signed-off ledger period. Reopen the ledger period first.',
      COALESCE(NEW.period_month, OLD.period_month)
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_payslip_updates_when_signed_off ON public.hr_razorpay_payslip_records;
CREATE TRIGGER trg_block_payslip_updates_when_signed_off
BEFORE INSERT OR UPDATE ON public.hr_razorpay_payslip_records
FOR EACH ROW EXECUTE FUNCTION public.hr_razorpay_block_payslip_when_signed_off();
