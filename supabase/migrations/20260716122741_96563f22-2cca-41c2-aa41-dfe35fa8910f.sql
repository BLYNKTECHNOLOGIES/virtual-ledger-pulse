
-- 1. Self-heal: create onboarding rows for inactive employees missing one
CREATE OR REPLACE FUNCTION public.ensure_onboarding_for_orphans()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  INSERT INTO public.hr_employee_onboarding
    (employee_id, first_name, last_name, email, phone, status, current_stage, essl_badge_id, created_at, updated_at)
  SELECT
    e.id, e.first_name, COALESCE(e.last_name, ''), e.email, e.phone,
    'stage_1', 1, e.badge_id, now(), now()
  FROM public.hr_employees e
  LEFT JOIN public.hr_employee_onboarding o ON o.employee_id = e.id
  WHERE e.is_active = false AND o.id IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_onboarding_for_orphans() TO authenticated;

-- 2. Auto-create onboarding row on inactive-employee INSERT (import path)
CREATE OR REPLACE FUNCTION public.trg_auto_onboarding_for_draft()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active = false THEN
    INSERT INTO public.hr_employee_onboarding
      (employee_id, first_name, last_name, email, phone, status, current_stage, essl_badge_id)
    VALUES
      (NEW.id, NEW.first_name, COALESCE(NEW.last_name, ''), NEW.email, NEW.phone, 'stage_1', 1, NEW.badge_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_onboarding_for_draft ON public.hr_employees;
CREATE TRIGGER trg_auto_onboarding_for_draft
AFTER INSERT ON public.hr_employees
FOR EACH ROW
EXECUTE FUNCTION public.trg_auto_onboarding_for_draft();

-- 3. Completeness view for pipeline checklist
CREATE OR REPLACE VIEW public.hr_employee_completeness
WITH (security_invoker = on) AS
SELECT
  e.id AS employee_id,
  EXISTS (SELECT 1 FROM public.hr_employee_bank_details b WHERE b.employee_id = e.id AND b.account_number IS NOT NULL AND b.account_number <> '') AS has_bank,
  EXISTS (SELECT 1 FROM public.hr_employee_salary_structures s WHERE s.employee_id = e.id) AS has_salary,
  EXISTS (SELECT 1 FROM public.hr_employee_work_info w WHERE w.employee_id = e.id AND w.joining_date IS NOT NULL) AS has_doj,
  EXISTS (SELECT 1 FROM public.hr_employee_work_info w WHERE w.employee_id = e.id AND (w.department_id IS NOT NULL OR w.job_position_id IS NOT NULL)) AS has_designation
FROM public.hr_employees e;

GRANT SELECT ON public.hr_employee_completeness TO authenticated;

-- 4. Mark Razorpay map row as 'pending' when identity fields edited on ERP side
CREATE OR REPLACE FUNCTION public.trg_flag_razorpay_pending_on_identity_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (COALESCE(NEW.first_name,'') IS DISTINCT FROM COALESCE(OLD.first_name,''))
     OR (COALESCE(NEW.last_name,'')  IS DISTINCT FROM COALESCE(OLD.last_name,''))
     OR (COALESCE(NEW.email,'')      IS DISTINCT FROM COALESCE(OLD.email,''))
     OR (COALESCE(NEW.phone,'')      IS DISTINCT FROM COALESCE(OLD.phone,''))
     OR (COALESCE(NEW.pan_number,'') IS DISTINCT FROM COALESCE(OLD.pan_number,''))
     OR (COALESCE(NEW.dob::text,'')  IS DISTINCT FROM COALESCE(OLD.dob::text,''))
     OR (COALESCE(NEW.gender,'')     IS DISTINCT FROM COALESCE(OLD.gender,''))
  THEN
    UPDATE public.hr_razorpay_employee_map
      SET sync_status = 'pending',
          last_error  = 'ERP identity fields edited — awaiting push to Razorpay',
          updated_at  = now()
    WHERE employee_id = NEW.id AND sync_status <> 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_flag_razorpay_pending_on_identity_edit ON public.hr_employees;
CREATE TRIGGER trg_flag_razorpay_pending_on_identity_edit
AFTER UPDATE ON public.hr_employees
FOR EACH ROW
EXECUTE FUNCTION public.trg_flag_razorpay_pending_on_identity_edit();

-- 5. One-time heal existing orphans
SELECT public.ensure_onboarding_for_orphans();
