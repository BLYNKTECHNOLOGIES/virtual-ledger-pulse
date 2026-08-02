ALTER TABLE public.hr_employees DROP CONSTRAINT IF EXISTS hr_employees_statutory_flags_source_check;
ALTER TABLE public.hr_employees ADD CONSTRAINT hr_employees_statutory_flags_source_check
  CHECK (statutory_flags_source IS NULL OR statutory_flags_source = ANY (ARRAY['payslip_verified','register_derived','assumed_from_global','hrms_profile']));

CREATE TABLE IF NOT EXISTS public.hr_employee_statutory_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  effective_from date NOT NULL,
  pf_enabled boolean NOT NULL DEFAULT false,
  pf_wage_basis text NOT NULL DEFAULT 'capped',
  vpf_mode text NOT NULL DEFAULT 'none',
  vpf_value numeric NOT NULL DEFAULT 0,
  esi_enabled boolean NOT NULL DEFAULT false,
  pt_enabled boolean NOT NULL DEFAULT true,
  uan text,
  esic_number text,
  reason text,
  source text NOT NULL DEFAULT 'hrms_profile',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_esp_basis_chk CHECK (pf_wage_basis IN ('capped','actual')),
  CONSTRAINT hr_esp_vpf_mode_chk CHECK (vpf_mode IN ('none','percent','fixed')),
  CONSTRAINT hr_esp_vpf_value_chk CHECK (vpf_value >= 0),
  CONSTRAINT hr_esp_unique UNIQUE (hr_employee_id, effective_from)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_employee_statutory_profiles TO authenticated;
GRANT ALL ON public.hr_employee_statutory_profiles TO service_role;

ALTER TABLE public.hr_employee_statutory_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_statutory_profiles"
  ON public.hr_employee_statutory_profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_manage_statutory_profiles"
  ON public.hr_employee_statutory_profiles FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_hr_esp_emp_eff
  ON public.hr_employee_statutory_profiles (hr_employee_id, effective_from DESC);

-- normalise effective_from to the first of the month + updated_at maintenance
CREATE OR REPLACE FUNCTION public.hr_esp_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.effective_from := date_trunc('month', NEW.effective_from)::date;
  NEW.updated_at := now();
  IF NEW.vpf_mode = 'none' THEN NEW.vpf_value := 0; END IF;
  IF NOT NEW.pf_enabled THEN
    NEW.vpf_mode := 'none';
    NEW.vpf_value := 0;
    NEW.pf_wage_basis := 'capped';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_esp_normalize ON public.hr_employee_statutory_profiles;
CREATE TRIGGER trg_hr_esp_normalize
BEFORE INSERT OR UPDATE ON public.hr_employee_statutory_profiles
FOR EACH ROW EXECUTE FUNCTION public.hr_esp_normalize();

-- Resolver: active profile for an employee in a given month
CREATE OR REPLACE FUNCTION public.hr_statutory_profile(p_employee uuid, p_month date)
RETURNS TABLE (
  hr_employee_id uuid,
  effective_from date,
  pf_enabled boolean,
  pf_wage_basis text,
  vpf_mode text,
  vpf_value numeric,
  esi_enabled boolean,
  pt_enabled boolean,
  uan text,
  esic_number text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p.hr_employee_id, p.effective_from, p.pf_enabled, p.pf_wage_basis,
         p.vpf_mode, p.vpf_value, p.esi_enabled, p.pt_enabled, p.uan, p.esic_number
  FROM public.hr_employee_statutory_profiles p
  WHERE p.hr_employee_id = p_employee
    AND p.effective_from <= date_trunc('month', COALESCE(p_month, CURRENT_DATE))::date
  ORDER BY p.effective_from DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.hr_statutory_profile(uuid, date) TO authenticated, service_role;

-- Keep hr_employees flag cache in sync with the currently-active profile row
CREATE OR REPLACE FUNCTION public.hr_esp_sync_employee_cache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp uuid := COALESCE(NEW.hr_employee_id, OLD.hr_employee_id);
  v_row record;
BEGIN
  SELECT * INTO v_row FROM public.hr_statutory_profile(v_emp, CURRENT_DATE);
  IF FOUND THEN
    UPDATE public.hr_employees
       SET pf_enabled = v_row.pf_enabled,
           esi_enabled = v_row.esi_enabled,
           pt_enabled = v_row.pt_enabled,
           statutory_flags_source = 'hrms_profile'
     WHERE id = v_emp;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_esp_sync_cache ON public.hr_employee_statutory_profiles;
CREATE TRIGGER trg_hr_esp_sync_cache
AFTER INSERT OR UPDATE OR DELETE ON public.hr_employee_statutory_profiles
FOR EACH ROW EXECUTE FUNCTION public.hr_esp_sync_employee_cache();

-- Seed: one baseline profile per employee that has none yet
INSERT INTO public.hr_employee_statutory_profiles
  (hr_employee_id, effective_from, pf_enabled, esi_enabled, pt_enabled, reason, source)
SELECT e.id,
       date_trunc('month', CURRENT_DATE)::date,
       COALESCE(e.pf_enabled, (SELECT COALESCE(s.compliance_files_pf, false) FROM public.hr_razorpay_settings s LIMIT 1), false),
       COALESCE(e.esi_enabled, (SELECT COALESCE(s.compliance_files_esi, false) FROM public.hr_razorpay_settings s LIMIT 1), false),
       COALESCE(e.pt_enabled, (SELECT COALESCE(s.compliance_files_pt, true) FROM public.hr_razorpay_settings s LIMIT 1), true),
       'Initial baseline seeded from existing flags / org compliance toggles',
       'seed'
FROM public.hr_employees e
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_employee_statutory_profiles p WHERE p.hr_employee_id = e.id
);