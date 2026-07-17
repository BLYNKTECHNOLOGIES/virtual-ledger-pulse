
-- 1. Pushback audit log
CREATE TABLE IF NOT EXISTS public.hr_razorpay_pushback_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hr_employee_id uuid REFERENCES public.hr_employees(id) ON DELETE SET NULL,
  razorpay_employee_id text,
  kind text NOT NULL,              -- identity | bank | salary | dismissal | create | employment
  action text NOT NULL,            -- proxy action string
  status text NOT NULL,            -- success | failure | skipped
  request_snapshot jsonb,
  response_snapshot jsonb,
  error_message text,
  triggered_by uuid,
  triggered_from text,             -- ui surface (e.g. 'edit_employee_dialog')
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hr_rzp_pushback_emp ON public.hr_razorpay_pushback_log (hr_employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_rzp_pushback_status ON public.hr_razorpay_pushback_log (status, created_at DESC);

GRANT SELECT, INSERT ON public.hr_razorpay_pushback_log TO authenticated;
GRANT ALL ON public.hr_razorpay_pushback_log TO service_role;
ALTER TABLE public.hr_razorpay_pushback_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR staff can read pushback log"
  ON public.hr_razorpay_pushback_log FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "Authenticated can insert pushback log"
  ON public.hr_razorpay_pushback_log FOR INSERT
  TO authenticated WITH CHECK (true);

-- 2. Drift alerts (3-way HRMS/Razorpay/eSSL)
CREATE TABLE IF NOT EXISTS public.hr_drift_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hr_employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  field text NOT NULL,             -- full_name, dob, dept, bank_account, ctc, ...
  systems_involved text[] NOT NULL DEFAULT '{}', -- subset of {hrms, razorpay, essl}
  hrms_value text,
  razorpay_value text,
  essl_value text,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hr_employee_id, field)
);
CREATE INDEX IF NOT EXISTS idx_hr_drift_open ON public.hr_drift_alerts (hr_employee_id) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hr_drift_severity ON public.hr_drift_alerts (severity, last_seen_at DESC) WHERE resolved_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_drift_alerts TO authenticated;
GRANT ALL ON public.hr_drift_alerts TO service_role;
ALTER TABLE public.hr_drift_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR staff can read drift"
  ON public.hr_drift_alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "HR staff can write drift"
  ON public.hr_drift_alerts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "HR staff can update drift"
  ON public.hr_drift_alerts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "HR staff can delete drift"
  ON public.hr_drift_alerts FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_hr_drift_alerts_updated_at
  BEFORE UPDATE ON public.hr_drift_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Convenience view — open drifts only
CREATE OR REPLACE VIEW public.hr_drift_open
WITH (security_invoker=on) AS
SELECT d.*,
       e.first_name || ' ' || COALESCE(e.last_name,'') AS employee_name,
       e.badge_id,
       e.is_active
FROM public.hr_drift_alerts d
JOIN public.hr_employees e ON e.id = d.hr_employee_id
WHERE d.resolved_at IS NULL;

GRANT SELECT ON public.hr_drift_open TO authenticated;
GRANT ALL ON public.hr_drift_open TO service_role;

-- 4. Per-user push default toggle
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS razorpay_push_default boolean NOT NULL DEFAULT true;
