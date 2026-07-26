
-- ============================================================
-- Wave 3 · Foundation: round-trip receipt plumbing
-- ============================================================

-- W1: attendance push read-back receipts
ALTER TABLE public.hr_razorpay_payroll_runs
  ADD COLUMN IF NOT EXISTS attendance_readback_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attendance_readback_diff JSONB;

-- W2: inputs push read-back receipts
ALTER TABLE public.hr_payroll_input_additions
  ADD COLUMN IF NOT EXISTS readback_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS readback_diff JSONB;

ALTER TABLE public.hr_payroll_input_deductions
  ADD COLUMN IF NOT EXISTS readback_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS readback_diff JSONB;

-- W3: device-user reconciliation log (one row per device per run)
CREATE TABLE IF NOT EXISTS public.hr_device_roster_reconciliation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  device_serial TEXT NOT NULL,
  device_name TEXT,
  triggered_from TEXT,
  device_user_count INT NOT NULL DEFAULT 0,
  hrms_user_count INT NOT NULL DEFAULT 0,
  active_employee_count INT NOT NULL DEFAULT 0,
  ghost_on_device INT NOT NULL DEFAULT 0,
  missing_on_device INT NOT NULL DEFAULT 0,
  dismissed_still_enrolled INT NOT NULL DEFAULT 0,
  pin_mismatch INT NOT NULL DEFAULT 0,
  auto_fixed INT NOT NULL DEFAULT 0,
  unsafe_flagged INT NOT NULL DEFAULT 0,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.hr_device_roster_reconciliation_log TO authenticated;
GRANT ALL ON public.hr_device_roster_reconciliation_log TO service_role;

ALTER TABLE public.hr_device_roster_reconciliation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_device_roster_reconciliation_log"
  ON public.hr_device_roster_reconciliation_log
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_hr_device_roster_reconciliation_log_ran_at
  ON public.hr_device_roster_reconciliation_log (ran_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_device_roster_reconciliation_log_serial_ran
  ON public.hr_device_roster_reconciliation_log (device_serial, ran_at DESC);

-- Convenience view for the System Pulse tile (latest run per device).
CREATE OR REPLACE VIEW public.hr_device_roster_reconciliation_latest_v AS
SELECT DISTINCT ON (device_serial)
  device_serial,
  device_name,
  ran_at,
  ghost_on_device,
  missing_on_device,
  dismissed_still_enrolled,
  pin_mismatch,
  auto_fixed,
  unsafe_flagged,
  (ghost_on_device + missing_on_device + dismissed_still_enrolled + pin_mismatch) AS total_discrepancies
FROM public.hr_device_roster_reconciliation_log
ORDER BY device_serial, ran_at DESC;

GRANT SELECT ON public.hr_device_roster_reconciliation_latest_v TO authenticated, service_role;
