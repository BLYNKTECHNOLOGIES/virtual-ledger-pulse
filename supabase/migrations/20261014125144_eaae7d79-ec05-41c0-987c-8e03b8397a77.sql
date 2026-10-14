
ALTER TABLE public.hr_erp_access_revocations ALTER COLUMN employee_id DROP NOT NULL;
ALTER TABLE public.hr_erp_access_revocations
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS target_name text,
  ADD COLUMN IF NOT EXISTS target_username text,
  ADD COLUMN IF NOT EXISTS target_email text,
  ADD COLUMN IF NOT EXISTS requested_by_name text,
  ADD COLUMN IF NOT EXISTS registration_id uuid;
ALTER TABLE public.hr_erp_access_revocations DROP CONSTRAINT IF EXISTS hr_erp_access_revocations_source_chk;
ALTER TABLE public.hr_erp_access_revocations ADD CONSTRAINT hr_erp_access_revocations_source_chk
  CHECK (source IS NULL OR source IN ('user_management','hrms_deactivate','offboarding','signup_rejection'));

-- One record for every removal path: snapshot who was removed and by whom at queue time.
CREATE OR REPLACE FUNCTION public.hr_erp_revocation_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u record;
BEGIN
  SELECT username, email, NULLIF(trim(concat_ws(' ', first_name, last_name)), '') AS nm INTO u FROM public.users WHERE id = NEW.user_id;
  NEW.target_name := COALESCE(NEW.target_name, u.nm, u.username);
  NEW.target_username := COALESCE(NEW.target_username, u.username);
  NEW.target_email := COALESCE(NEW.target_email, u.email);
  IF NEW.requested_by IS NOT NULL AND NEW.requested_by_name IS NULL THEN
    SELECT COALESCE(NULLIF(trim(concat_ws(' ', first_name, last_name)), ''), username) INTO NEW.requested_by_name FROM public.users WHERE id = NEW.requested_by;
  END IF;
  NEW.source := COALESCE(NEW.source, CASE WHEN NEW.requested_by IS NULL THEN 'offboarding' ELSE 'hrms_deactivate' END);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_hr_erp_revocation_snapshot ON public.hr_erp_access_revocations;
CREATE TRIGGER trg_hr_erp_revocation_snapshot BEFORE INSERT ON public.hr_erp_access_revocations
  FOR EACH ROW EXECUTE FUNCTION public.hr_erp_revocation_snapshot();
REVOKE ALL ON FUNCTION public.hr_erp_revocation_snapshot() FROM PUBLIC, anon, authenticated;

-- Read-only lifecycle view for User Management (HRMS state + removal records).
CREATE OR REPLACE FUNCTION public.um_lifecycle()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid := auth.uid(); v_people jsonb; v_removals jsonb;
BEGIN
  IF v IS NULL OR NOT (public.um_is_super_admin(v)
     OR public.has_permission(v, 'user_management_view'::app_permission)
     OR public.has_permission(v, 'user_management_manage'::app_permission)
     OR public.has_permission(v, 'user_management_hr_manage'::app_permission)) THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(jsonb_object_agg(x.uid, x.info), '{}'::jsonb) INTO v_people FROM (
    SELECT DISTINCT ON (u.id) u.id AS uid, jsonb_build_object(
      'employee_id', e.id,
      'is_active', e.is_active,
      'resignation_status', e.resignation_status,
      'last_working_day', e.last_working_day,
      'department', d.name,
      'position', p.title) AS info
    FROM public.users u
    JOIN public.hr_employees e ON e.user_id = u.id OR (e.user_id IS NULL AND e.badge_id IS NOT NULL AND e.badge_id = u.badge_id)
    LEFT JOIN public.hr_employee_work_info w ON w.employee_id = e.id
    LEFT JOIN public.departments d ON d.id = w.department_id
    LEFT JOIN public.positions p ON p.id = w.job_position_id
    WHERE u.username NOT LIKE 'deleted_%'
    ORDER BY u.id, (e.user_id = u.id) DESC NULLS LAST, e.is_active DESC
  ) x;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id', r.user_id, 'employee_id', r.employee_id, 'registration_id', r.registration_id,
    'source', r.source, 'reason', r.reason, 'target_name', r.target_name, 'target_username', r.target_username,
    'target_email', r.target_email, 'requested_by_name', r.requested_by_name, 'requested_at', r.requested_at,
    'completed_at', r.completed_at, 'attempts', r.attempts, 'last_error', r.last_error) ORDER BY r.requested_at DESC), '[]'::jsonb)
  INTO v_removals FROM public.hr_erp_access_revocations r;
  RETURN jsonb_build_object(
    'can_retry', public.um_is_super_admin(v) OR public.user_has_permission(v, 'erp_destructive'::app_permission),
    'people', v_people,
    'removals', v_removals);
END $$;
REVOKE ALL ON FUNCTION public.um_lifecycle() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.um_lifecycle() TO authenticated;

