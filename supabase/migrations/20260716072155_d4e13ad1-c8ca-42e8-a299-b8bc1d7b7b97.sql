
-- Phase 8: Payout & Disbursement sync

-- Settings columns (pull-only; no push envelope needed since we never write payouts)
ALTER TABLE public.hr_razorpay_settings
  ADD COLUMN IF NOT EXISTS pull_payouts_endpoint_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pull_payouts_envelope_key text,
  ADD COLUMN IF NOT EXISTS pull_payouts_envelope_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS pull_payouts_envelope_verified_by uuid,
  ADD COLUMN IF NOT EXISTS last_payouts_pull_at timestamptz;

-- Payout records mirror what Razorpay reports for a given period. One row per
-- (period, razorpay_employee_id) — Razorpay is the source of truth for status,
-- utr, and paid_at. expected_amount/variance are ERP-side derivations.
CREATE TABLE IF NOT EXISTS public.hr_razorpay_payout_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.hr_razorpay_payroll_runs(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  razorpay_employee_id text NOT NULL,
  hr_employee_id uuid REFERENCES public.hr_employees(id) ON DELETE SET NULL,
  payout_status text,                    -- e.g. paid, processing, failed, unknown
  paid_amount numeric(14,2),
  expected_amount numeric(14,2),
  variance numeric(14,2),
  utr text,
  paid_at timestamptz,
  source_payload jsonb,
  reconciled_at timestamptz,
  reconciled_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_month, razorpay_employee_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_razorpay_payout_records TO authenticated;
GRANT ALL ON public.hr_razorpay_payout_records TO service_role;

ALTER TABLE public.hr_razorpay_payout_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payout_records_manage_by_perm"
ON public.hr_razorpay_payout_records
FOR ALL TO authenticated
USING (public.user_has_permission(auth.uid(), 'hrms_razorpay_sync'::app_permission))
WITH CHECK (public.user_has_permission(auth.uid(), 'hrms_razorpay_sync'::app_permission));

CREATE INDEX IF NOT EXISTS idx_payout_records_period ON public.hr_razorpay_payout_records(period_month);
CREATE INDEX IF NOT EXISTS idx_payout_records_run ON public.hr_razorpay_payout_records(run_id);

CREATE TRIGGER trg_payout_records_updated_at
BEFORE UPDATE ON public.hr_razorpay_payout_records
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
