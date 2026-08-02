ALTER TABLE public.hr_employee_statutory_profiles ALTER COLUMN pt_enabled SET DEFAULT false;

CREATE OR REPLACE FUNCTION public.hr_seed_default_statutory_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_monthly numeric;
  v_esi boolean;
BEGIN
  IF COALESCE(NEW.is_active, false) IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM public.hr_employee_statutory_profiles WHERE hr_employee_id = NEW.id) THEN
    RETURN NULL;
  END IF;

  v_monthly := COALESCE(NEW.total_salary, 0) / 12.0;
  v_esi := (v_monthly > 0 AND v_monthly <= 21000);

  INSERT INTO public.hr_employee_statutory_profiles
    (hr_employee_id, effective_from, pf_enabled, pf_wage_basis, vpf_mode, vpf_value,
     esi_enabled, pt_enabled, reason, source)
  VALUES
    (NEW.id, date_trunc('month', CURRENT_DATE)::date, true, 'capped', 'none', 0,
     v_esi, false, 'Default enrolment on employee creation (PT off by default)', 'hrms_profile')
  ON CONFLICT (hr_employee_id, effective_from) DO NOTHING;

  RETURN NULL;
END;
$function$;

UPDATE public.hr_employee_statutory_profiles SET pt_enabled = false WHERE pt_enabled IS DISTINCT FROM false;

UPDATE public.hr_employees SET pt_enabled = false WHERE pt_enabled IS DISTINCT FROM false;