
ALTER TABLE public.hr_employees
  ADD COLUMN IF NOT EXISTS legacy_badge_id text;

CREATE TABLE IF NOT EXISTS public.hr_biometric_pin_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_employee_id uuid REFERENCES public.hr_employees(id) ON DELETE SET NULL,
  device_serial text NOT NULL,
  old_pin text NOT NULL,
  new_pin text NOT NULL,
  reason text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_biometric_pin_history TO authenticated;
GRANT ALL ON public.hr_biometric_pin_history TO service_role;
ALTER TABLE public.hr_biometric_pin_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR admins manage pin history"
  ON public.hr_biometric_pin_history
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));
CREATE INDEX IF NOT EXISTS idx_hr_biometric_pin_history_device_old_pin ON public.hr_biometric_pin_history (device_serial, old_pin);
CREATE INDEX IF NOT EXISTS idx_hr_biometric_pin_history_emp ON public.hr_biometric_pin_history (hr_employee_id);

CREATE TABLE IF NOT EXISTS public.hr_employee_id_rekey_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_employee_id uuid REFERENCES public.hr_employees(id) ON DELETE SET NULL,
  employee_display_name text,
  old_badge_id text,
  new_badge_id text,
  razorpay_employee_id text,
  devices_updated jsonb NOT NULL DEFAULT '[]'::jsonb,
  templates_replayed jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  error_detail text,
  initiated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  initiated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_employee_id_rekey_log TO authenticated;
GRANT ALL ON public.hr_employee_id_rekey_log TO service_role;
ALTER TABLE public.hr_employee_id_rekey_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR admins manage rekey log"
  ON public.hr_employee_id_rekey_log
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));

CREATE OR REPLACE FUNCTION public.hr_next_razorpay_employee_id()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  max_rzp integer := 0;
  max_badge integer := 0;
BEGIN
  SELECT COALESCE(MAX((razorpay_employee_id)::int), 0) INTO max_rzp
  FROM public.hr_razorpay_employee_map
  WHERE razorpay_employee_id ~ '^[0-9]+$';

  SELECT COALESCE(MAX((badge_id)::int), 0) INTO max_badge
  FROM public.hr_employees
  WHERE badge_id ~ '^[0-9]+$';

  RETURN (GREATEST(max_rzp, max_badge) + 1)::text;
END;
$$;
GRANT EXECUTE ON FUNCTION public.hr_next_razorpay_employee_id() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hr_resolve_employee_by_pin(
  _device_serial text,
  _pin text,
  _punch_time timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp uuid;
BEGIN
  SELECT id INTO emp FROM public.hr_employees WHERE badge_id = _pin LIMIT 1;
  IF emp IS NOT NULL THEN
    RETURN emp;
  END IF;

  SELECT hr_employee_id INTO emp
    FROM public.hr_biometric_pin_history
    WHERE device_serial = _device_serial
      AND old_pin = _pin
      AND changed_at >= _punch_time
    ORDER BY changed_at ASC
    LIMIT 1;

  RETURN emp;
END;
$$;
GRANT EXECUTE ON FUNCTION public.hr_resolve_employee_by_pin(text, text, timestamptz) TO authenticated, service_role;
