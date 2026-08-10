CREATE OR REPLACE FUNCTION public.hr_is_hr_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = _user_id
      AND (lower(r.name) IN ('super admin','admin','hr') OR lower(r.name) LIKE 'hr %' OR lower(r.name) LIKE '% hr')
  )
$$;

GRANT EXECUTE ON FUNCTION public.hr_is_hr_staff(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "HR manage leave requests" ON public.hr_leave_requests;
CREATE POLICY "HR manage leave requests"
ON public.hr_leave_requests FOR ALL TO authenticated
USING (public.hr_is_hr_staff(auth.uid()))
WITH CHECK (public.hr_is_hr_staff(auth.uid()));

DROP POLICY IF EXISTS "HR manage regularization" ON public.hr_attendance_regularization_requests;
CREATE POLICY "HR manage regularization"
ON public.hr_attendance_regularization_requests FOR ALL TO authenticated
USING (public.hr_is_hr_staff(auth.uid()))
WITH CHECK (public.hr_is_hr_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.hr_leave_request_field_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_me uuid;
BEGIN
  IF auth.uid() IS NULL OR public.hr_is_hr_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  v_me := public.hr_current_employee_id();

  IF v_me IS NOT NULL AND OLD.manager_id = v_me AND OLD.employee_id <> v_me THEN
    IF NEW.employee_id IS DISTINCT FROM OLD.employee_id
       OR NEW.leave_type_id IS DISTINCT FROM OLD.leave_type_id
       OR NEW.start_date IS DISTINCT FROM OLD.start_date
       OR NEW.end_date IS DISTINCT FROM OLD.end_date
       OR NEW.total_days IS DISTINCT FROM OLD.total_days
       OR NEW.is_half_day IS DISTINCT FROM OLD.is_half_day
       OR NEW.paid_days IS DISTINCT FROM OLD.paid_days
       OR NEW.unpaid_days IS DISTINCT FROM OLD.unpaid_days
       OR NEW.manager_id IS DISTINCT FROM OLD.manager_id THEN
      RAISE EXCEPTION 'A reporting manager can only record a decision on this leave request';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status NOT IN ('manager_approved','rejected') THEN
      RAISE EXCEPTION 'A reporting manager can only approve or reject this leave request';
    END IF;
    RETURN NEW;
  END IF;

  IF v_me IS NOT NULL AND OLD.employee_id = v_me THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled' THEN
      RAISE EXCEPTION 'You can only cancel your own leave request';
    END IF;
    IF NEW.employee_id IS DISTINCT FROM OLD.employee_id
       OR NEW.leave_type_id IS DISTINCT FROM OLD.leave_type_id
       OR NEW.start_date IS DISTINCT FROM OLD.start_date
       OR NEW.end_date IS DISTINCT FROM OLD.end_date
       OR NEW.total_days IS DISTINCT FROM OLD.total_days
       OR NEW.manager_id IS DISTINCT FROM OLD.manager_id
       OR NEW.manager_status IS DISTINCT FROM OLD.manager_status
       OR NEW.paid_days IS DISTINCT FROM OLD.paid_days
       OR NEW.unpaid_days IS DISTINCT FROM OLD.unpaid_days THEN
      RAISE EXCEPTION 'You can only cancel your own leave request';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Not allowed to modify this leave request';
END;
$$;

CREATE OR REPLACE FUNCTION public.hr_reg_request_field_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_me uuid;
BEGIN
  IF auth.uid() IS NULL OR public.hr_is_hr_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  v_me := public.hr_current_employee_id();

  IF v_me IS NOT NULL AND OLD.manager_id = v_me AND OLD.employee_id <> v_me THEN
    IF NEW.employee_id IS DISTINCT FROM OLD.employee_id
       OR NEW.attendance_date IS DISTINCT FROM OLD.attendance_date
       OR NEW.requested_check_in IS DISTINCT FROM OLD.requested_check_in
       OR NEW.requested_check_out IS DISTINCT FROM OLD.requested_check_out
       OR NEW.reason IS DISTINCT FROM OLD.reason
       OR NEW.reason_category IS DISTINCT FROM OLD.reason_category
       OR NEW.manager_id IS DISTINCT FROM OLD.manager_id
       OR NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'A reporting manager can only record a recommendation on this request';
    END IF;
    RETURN NEW;
  END IF;

  IF v_me IS NOT NULL AND OLD.employee_id = v_me THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled' THEN
      RAISE EXCEPTION 'You can only withdraw your own regularization request';
    END IF;
    IF NEW.attendance_date IS DISTINCT FROM OLD.attendance_date
       OR NEW.requested_check_in IS DISTINCT FROM OLD.requested_check_in
       OR NEW.requested_check_out IS DISTINCT FROM OLD.requested_check_out
       OR NEW.manager_id IS DISTINCT FROM OLD.manager_id
       OR NEW.manager_status IS DISTINCT FROM OLD.manager_status
       OR NEW.approver_id IS DISTINCT FROM OLD.approver_id THEN
      RAISE EXCEPTION 'You can only withdraw your own regularization request';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Not allowed to modify this regularization request';
END;
$$;