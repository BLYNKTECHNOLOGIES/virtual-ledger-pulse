ALTER TABLE public.hr_drift_alerts
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid,
  ADD COLUMN IF NOT EXISTS acknowledged_note text,
  ADD COLUMN IF NOT EXISTS ack_hrms_value text,
  ADD COLUMN IF NOT EXISTS ack_razorpay_value text,
  ADD COLUMN IF NOT EXISTS ack_essl_value text;

CREATE OR REPLACE VIEW public.hr_drift_open AS
SELECT id,
    hr_employee_id,
    field,
    systems_involved,
    hrms_value,
    razorpay_value,
    essl_value,
    severity,
    first_seen_at,
    last_seen_at,
    resolved_at,
    resolved_by,
    resolution_note,
    created_at,
    updated_at,
    resolution_direction,
    acknowledged_at,
    acknowledged_note
FROM public.hr_drift_alerts
WHERE resolved_at IS NULL
  AND acknowledged_at IS NULL;

CREATE OR REPLACE VIEW public.hr_drift_acknowledged AS
SELECT id,
    hr_employee_id,
    field,
    systems_involved,
    hrms_value,
    razorpay_value,
    essl_value,
    severity,
    first_seen_at,
    last_seen_at,
    acknowledged_at,
    acknowledged_by,
    acknowledged_note
FROM public.hr_drift_alerts
WHERE resolved_at IS NULL
  AND acknowledged_at IS NOT NULL;

GRANT SELECT ON public.hr_drift_acknowledged TO authenticated;
GRANT ALL ON public.hr_drift_acknowledged TO service_role;