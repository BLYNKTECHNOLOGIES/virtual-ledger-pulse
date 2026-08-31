
-- 1) Manager-facing queues (security definer: manager sees only rows routed to them)
CREATE OR REPLACE FUNCTION public.hr_manager_regularization_queue()
RETURNS TABLE (
  id uuid, employee_id uuid, employee_name text, badge_id text,
  attendance_date date, requested_check_in timestamptz, requested_check_out timestamptz,
  reason text, reason_category text, status text, manager_status text,
  manager_remarks text, created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.employee_id,
         NULLIF(TRIM(COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')), '') AS employee_name,
         e.badge_id::text,
         r.attendance_date, r.requested_check_in, r.requested_check_out,
         r.reason, r.reason_category, r.status, r.manager_status, r.manager_remarks, r.created_at
  FROM public.hr_attendance_regularization_requests r
  LEFT JOIN public.hr_employees e ON e.id = r.employee_id
  WHERE r.manager_id IS NOT NULL
    AND r.manager_id = public.hr_current_employee_id()
    AND r.status IN ('manager_review','manager_reviewed')
  ORDER BY r.created_at DESC
$$;

REVOKE EXECUTE ON FUNCTION public.hr_manager_regularization_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_manager_regularization_queue() TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_manager_leave_queue()
RETURNS TABLE (
  id uuid, employee_id uuid, employee_name text, badge_id text,
  leave_type_name text, start_date date, end_date date, total_days numeric,
  is_half_day boolean, half_day_period text, reason text, status text,
  manager_status text, manager_remarks text, created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.employee_id,
         NULLIF(TRIM(COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')), '') AS employee_name,
         e.badge_id::text,
         lt.name::text AS leave_type_name,
         l.start_date, l.end_date, l.total_days, l.is_half_day, l.half_day_period,
         l.reason, l.status::text, l.manager_status, l.manager_remarks, l.created_at
  FROM public.hr_leave_requests l
  LEFT JOIN public.hr_employees e ON e.id = l.employee_id
  LEFT JOIN public.hr_leave_types lt ON lt.id = l.leave_type_id
  WHERE l.manager_id IS NOT NULL
    AND l.manager_id = public.hr_current_employee_id()
    AND l.status IN ('requested','manager_approved')
  ORDER BY l.created_at DESC
$$;

REVOKE EXECUTE ON FUNCTION public.hr_manager_leave_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_manager_leave_queue() TO authenticated;

-- 2) Point manager notifications at the real profile tab
CREATE OR REPLACE FUNCTION public.hr_notify_regularization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_emp_name text;
  v_emp_user uuid;
  v_mgr_user uuid;
  v_link text := '/hrms/requests?type=regularization&id=' || NEW.id::text;
BEGIN
  SELECT trim(coalesce(e.first_name,'') || ' ' || coalesce(e.last_name,'')), e.user_id
    INTO v_emp_name, v_emp_user
  FROM public.hr_employees e WHERE e.id = NEW.employee_id;
  v_emp_name := coalesce(nullif(v_emp_name,''), 'An employee');

  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    INSERT INTO public.hr_notifications (user_id, type, title, message, link)
    SELECT DISTINCT ur.user_id, 'attendance_regularization_requested',
           'Regularization request',
           v_emp_name || ' requested attendance regularization for ' || NEW.attendance_date::text,
           v_link
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE lower(r.name) IN ('super admin','admin','hr')
       OR lower(r.name) LIKE 'hr %' OR lower(r.name) LIKE '% hr';
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'manager_review' AND NEW.manager_id IS NOT NULL THEN
      SELECT e.user_id INTO v_mgr_user FROM public.hr_employees e WHERE e.id = NEW.manager_id;
      IF v_mgr_user IS NOT NULL THEN
        INSERT INTO public.hr_notifications (user_id, type, title, message, link)
        VALUES (v_mgr_user, 'attendance_regularization_manager_review',
                'Regularization needs your review',
                v_emp_name || ' — attendance ' || NEW.attendance_date::text,
                '/profile?tab=requests&regId=' || NEW.id::text);
      END IF;
    END IF;

    IF NEW.status = 'manager_reviewed' THEN
      INSERT INTO public.hr_notifications (user_id, type, title, message, link)
      SELECT DISTINCT ur.user_id, 'attendance_regularization_manager_decided',
             'Manager reviewed a regularization',
             v_emp_name || ' — manager ' || coalesce(NEW.manager_status,'reviewed') || ' for ' || NEW.attendance_date::text,
             v_link
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE lower(r.name) IN ('super admin','admin','hr')
         OR lower(r.name) LIKE 'hr %' OR lower(r.name) LIKE '% hr';
    END IF;

    IF NEW.status IN ('approved','rejected') AND v_emp_user IS NOT NULL THEN
      INSERT INTO public.hr_notifications (user_id, type, title, message, link)
      VALUES (v_emp_user, 'attendance_regularization_' || NEW.status,
              'Regularization ' || NEW.status,
              'Your request for ' || NEW.attendance_date::text || ' was ' || NEW.status
                || coalesce(' — ' || nullif(NEW.approver_notes,''), ''),
              '/profile?tab=attendance');
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.hr_notify_regularization_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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
          '/profile?tab=requests&regId=' || NEW.id::text);
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
$fn$;

CREATE OR REPLACE FUNCTION public.hr_notify_leave_request_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_employee_name text;
  v_mgr_user uuid;
  v_hr_link text := '/hrms/requests?type=leave&id=' || NEW.id::text;
BEGIN
  SELECT NULLIF(TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')), '')
    INTO v_employee_name
  FROM public.hr_employees WHERE id = NEW.employee_id;
  v_employee_name := COALESCE(v_employee_name, 'Employee');

  IF TG_OP = 'INSERT' THEN
    IF NEW.manager_id IS NOT NULL THEN
      SELECT user_id INTO v_mgr_user FROM public.hr_employees WHERE id = NEW.manager_id;
      IF v_mgr_user IS NOT NULL THEN
        PERFORM public.hr_notify(ARRAY[v_mgr_user], 'leave_approval_pending',
          'Leave approval needed',
          v_employee_name || ' requested leave ' || to_char(NEW.start_date,'DD Mon') || ' – ' || to_char(NEW.end_date,'DD Mon'),
          '/profile?tab=requests&leaveId=' || NEW.id::text);
      END IF;
    END IF;

    PERFORM public.hr_broadcast_notification_to_hr('leave_request_created', 'New leave request',
      v_employee_name || ' submitted a leave request', v_hr_link);

    PERFORM public.hr_emit_notification(NEW.employee_id, 'leave_request_submitted',
      'Leave request submitted',
      CASE WHEN NEW.manager_id IS NULL THEN 'Submitted — awaiting HR approval.'
           ELSE 'Submitted — awaiting your reporting manager.' END, '/profile');
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'manager_approved' THEN
      PERFORM public.hr_broadcast_notification_to_hr('leave_manager_approved',
        'Leave ready for HR approval',
        v_employee_name || '''s leave was approved by the reporting manager', v_hr_link);
      PERFORM public.hr_emit_notification(NEW.employee_id, 'leave_manager_approved',
        'Manager approved your leave', 'Awaiting final HR approval.', '/profile');
    ELSIF NEW.status = 'approved' THEN
      PERFORM public.hr_emit_notification(NEW.employee_id, 'leave_request_approved', 'Leave approved',
        CASE WHEN COALESCE(NEW.unpaid_days,0) > 0
             THEN format('Approved: %s paid day(s), %s day(s) as loss of pay.', NEW.paid_days, NEW.unpaid_days)
             ELSE 'Your leave request was approved.' END, '/profile');
    ELSIF NEW.status = 'rejected' THEN
      PERFORM public.hr_emit_notification(NEW.employee_id, 'leave_request_rejected', 'Leave rejected',
        'Your leave request was rejected.' || COALESCE(' Reason: ' || NEW.rejection_reason, ''), '/profile');
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$fn$;
