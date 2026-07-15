
DO $$ BEGIN
  CREATE TYPE public.hr_razorpay_sync_status AS ENUM ('imported','matched_existing','in_sync','drift','error','incomplete');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.hr_razorpay_sync_action AS ENUM ('validate_creds','introspect_envelope','pull_import','dry_run','push_create','push_update','drift_check');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.hr_razorpay_employee_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  razorpay_employee_id TEXT NOT NULL,
  sync_status public.hr_razorpay_sync_status NOT NULL DEFAULT 'imported',
  is_pilot_verified BOOLEAN NOT NULL DEFAULT false,
  last_synced_at TIMESTAMPTZ,
  last_payload_hash TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_razorpay_map_hr_emp_uniq UNIQUE (hr_employee_id),
  CONSTRAINT hr_razorpay_map_rzp_emp_uniq UNIQUE (razorpay_employee_id)
);
GRANT SELECT ON public.hr_razorpay_employee_map TO authenticated;
GRANT ALL ON public.hr_razorpay_employee_map TO service_role;
ALTER TABLE public.hr_razorpay_employee_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "razorpay_map_read" ON public.hr_razorpay_employee_map FOR SELECT TO authenticated
  USING (
    public.user_has_permission(auth.uid(), 'hrms_razorpay_sync'::public.app_permission)
    OR public.has_role(auth.uid(), 'Super Admin'::text)
  );

CREATE TABLE public.hr_razorpay_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action public.hr_razorpay_sync_action NOT NULL,
  http_status INTEGER,
  payload_hash TEXT,
  field_diff_summary JSONB,
  error_text TEXT,
  hr_employee_id UUID REFERENCES public.hr_employees(id) ON DELETE SET NULL,
  razorpay_employee_id TEXT,
  actor_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.hr_razorpay_sync_log TO authenticated;
GRANT ALL ON public.hr_razorpay_sync_log TO service_role;
ALTER TABLE public.hr_razorpay_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "razorpay_log_read" ON public.hr_razorpay_sync_log FOR SELECT TO authenticated
  USING (
    public.user_has_permission(auth.uid(), 'hrms_razorpay_sync'::public.app_permission)
    OR public.has_role(auth.uid(), 'Super Admin'::text)
  );

CREATE TABLE public.hr_razorpay_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_singleton BOOLEAN NOT NULL DEFAULT true,
  base_url TEXT NOT NULL DEFAULT 'https://payroll.razorpay.com/v1',
  bulk_sync_unlocked BOOLEAN NOT NULL DEFAULT false,
  last_creds_validated_at TIMESTAMPTZ,
  last_import_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_razorpay_settings_singleton UNIQUE (is_singleton)
);
INSERT INTO public.hr_razorpay_settings (is_singleton) VALUES (true) ON CONFLICT DO NOTHING;
GRANT SELECT ON public.hr_razorpay_settings TO authenticated;
GRANT ALL ON public.hr_razorpay_settings TO service_role;
ALTER TABLE public.hr_razorpay_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "razorpay_settings_read" ON public.hr_razorpay_settings FOR SELECT TO authenticated
  USING (
    public.user_has_permission(auth.uid(), 'hrms_razorpay_sync'::public.app_permission)
    OR public.has_role(auth.uid(), 'Super Admin'::text)
  );

CREATE TRIGGER trg_hr_razorpay_map_updated_at BEFORE UPDATE ON public.hr_razorpay_employee_map
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_hr_razorpay_settings_updated_at BEFORE UPDATE ON public.hr_razorpay_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.system_functions (function_key, function_name, description, module)
VALUES ('hrms_razorpay_sync', 'Razorpay Payroll Sync', 'Access RazorpayX payroll import/sync tools in HRMS', 'hrms')
ON CONFLICT (function_key) DO NOTHING;
