-- 1. Leave requests: remove blanket access, add scoped HR access
DROP POLICY IF EXISTS "authenticated_all_hr_leave_requests" ON public.hr_leave_requests;

CREATE POLICY "HR manage leave requests"
ON public.hr_leave_requests FOR ALL TO authenticated
USING (has_role(auth.uid(), 'super admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr'))
WITH CHECK (has_role(auth.uid(), 'super admin') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr'));

-- 2a. Field guard: leave requests
CREATE OR REPLACE FUNCTION public.hr_leave_request_field_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid;
BEGIN
  -- Server-side / service_role writes and HR roles are unrestricted
  IF auth.uid() IS NULL
     OR has_role(auth.uid(), 'super admin')
     OR has_role(auth.uid(), 'admin')
     OR has_role(auth.uid(), 'hr') THEN
    RETURN NEW;
  END IF;

  v_me := public.hr_current_employee_id();

  -- Reporting manager: decision fields only
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

  -- Employee (own row): cancel only
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

DROP TRIGGER IF EXISTS trg_hr_leave_field_guard ON public.hr_leave_requests;
CREATE TRIGGER trg_hr_leave_field_guard
BEFORE UPDATE ON public.hr_leave_requests
FOR EACH ROW EXECUTE FUNCTION public.hr_leave_request_field_guard();

-- 2b. Field guard: regularization requests
CREATE OR REPLACE FUNCTION public.hr_reg_request_field_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid;
BEGIN
  IF auth.uid() IS NULL
     OR has_role(auth.uid(), 'super admin')
     OR has_role(auth.uid(), 'admin')
     OR has_role(auth.uid(), 'hr') THEN
    RETURN NEW;
  END IF;

  v_me := public.hr_current_employee_id();

  -- Reporting manager: recommendation only
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

  -- Employee (own row): withdraw only
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

DROP TRIGGER IF EXISTS trg_hr_reg_field_guard ON public.hr_attendance_regularization_requests;
CREATE TRIGGER trg_hr_reg_field_guard
BEFORE UPDATE ON public.hr_attendance_regularization_requests
FOR EACH ROW EXECUTE FUNCTION public.hr_reg_request_field_guard();

-- 3. No duplicate open regularizations per employee per date
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_reg_open_per_employee_date
ON public.hr_attendance_regularization_requests (employee_id, attendance_date)
WHERE status IN ('pending','manager_review','manager_reviewed','approved');

-- 4. Remove the duplicate leave decision notification (dead /employee/leaves link)
DROP TRIGGER IF EXISTS trg_hr_notify_leave_decision ON public.hr_leave_requests;

-- 5. In-app notifications for regularization stages
CREATE OR REPLACE FUNCTION public.hr_notify_regularization_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_mgr_user uuid;
BEGIN
  SELECT NULLIF(TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')), '')
    INTO v_name FROM public.hr_employees WHERE id = NEW.employee_id;
  v_name := COALESCE(v_name, 'Employee');

  IF TG_OP = 'INSERT' THEN
    PERFORM public.hr_broadcast_notification_to_hr('regularization_created',
      'New regularization request',
      v_name || ' raised a regularization for ' || to_char(NEW.attendance_date,'DD Mon'),
      '/hrms/attendance/regularization');
    PERFORM public.hr_emit_notification(NEW.employee_id, 'regularization_submitted',
      'Regularization submitted', 'Submitted — awaiting HR review.', '/profile');
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'manager_review' AND NEW.manager_id IS NOT NULL THEN
      SELECT user_id INTO v_mgr_user FROM public.hr_employees WHERE id = NEW.manager_id;
      IF v_mgr_user IS NOT NULL THEN
        PERFORM public.hr_notify(ARRAY[v_mgr_user], 'regularization_approval_pending',
          'Regularization review needed',
          v_name || ' — ' || to_char(NEW.attendance_date,'DD Mon') || ' attendance correction',
          '/profile?tab=approvals');
      END IF;
      PERFORM public.hr_emit_notification(NEW.employee_id, 'regularization_pushed',
        'Regularization forwarded', 'HR forwarded your request to your reporting manager.', '/profile');
    ELSIF NEW.status = 'manager_reviewed' THEN
      PERFORM public.hr_broadcast_notification_to_hr('regularization_manager_reviewed',
        'Regularization reviewed by manager',
        v_name || ' — manager ' || COALESCE(NEW.manager_status,'reviewed') || '; awaiting HR decision',
        '/hrms/attendance/regularization');
    ELSIF NEW.status = 'approved' THEN
      PERFORM public.hr_emit_notification(NEW.employee_id, 'regularization_approved',
        'Regularization approved',
        'Your attendance for ' || to_char(NEW.attendance_date,'DD Mon YYYY') || ' was corrected.', '/profile');
    ELSIF NEW.status = 'rejected' THEN
      PERFORM public.hr_emit_notification(NEW.employee_id, 'regularization_rejected',
        'Regularization rejected',
        COALESCE(NULLIF(NEW.approver_notes,''), 'Your regularization request was rejected.'), '/profile');
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_notify_regularization_change ON public.hr_attendance_regularization_requests;
CREATE TRIGGER trg_hr_notify_regularization_change
AFTER INSERT OR UPDATE ON public.hr_attendance_regularization_requests
FOR EACH ROW EXECUTE FUNCTION public.hr_notify_regularization_change();

-- 6. Employee may withdraw while undecided
DROP POLICY IF EXISTS "Employee cancel own pending" ON public.hr_attendance_regularization_requests;
CREATE POLICY "Employee cancel own undecided"
ON public.hr_attendance_regularization_requests FOR UPDATE TO authenticated
USING (
  employee_id IN (SELECT id FROM public.hr_employees WHERE user_id = auth.uid())
  AND status IN ('pending','manager_review','manager_reviewed')
)
WITH CHECK (
  employee_id IN (SELECT id FROM public.hr_employees WHERE user_id = auth.uid())
  AND status IN ('pending','manager_review','manager_reviewed','cancelled')
);