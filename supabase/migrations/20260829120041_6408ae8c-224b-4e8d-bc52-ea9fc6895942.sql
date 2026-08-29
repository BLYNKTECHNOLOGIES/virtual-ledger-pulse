
CREATE OR REPLACE FUNCTION public.hr_notify_leave_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_emp_name text;
  v_emp_user uuid;
  v_mgr_user uuid;
  v_range text;
  v_mgr_link text := '/profile?tab=requests&leaveId=' || NEW.id::text;
  v_hr_link  text := '/hrms/requests?type=leave&id=' || NEW.id::text;
BEGIN
  SELECT trim(coalesce(e.first_name,'') || ' ' || coalesce(e.last_name,'')), e.user_id
    INTO v_emp_name, v_emp_user
  FROM public.hr_employees e WHERE e.id = NEW.employee_id;
  v_emp_name := coalesce(nullif(v_emp_name,''), 'An employee');

  IF NEW.manager_id IS NOT NULL THEN
    SELECT e.user_id INTO v_mgr_user FROM public.hr_employees e WHERE e.id = NEW.manager_id;
  END IF;

  v_range := CASE WHEN NEW.start_date = NEW.end_date
    THEN to_char(NEW.start_date, 'DD Mon YYYY')
    ELSE to_char(NEW.start_date, 'DD Mon') || ' - ' || to_char(NEW.end_date, 'DD Mon YYYY') END;

  IF TG_OP = 'INSERT' THEN
    IF v_mgr_user IS NOT NULL THEN
      INSERT INTO public.hr_notifications (user_id, employee_id, type, title, message, link)
      VALUES (v_mgr_user, NEW.employee_id, 'leave_requested',
              'Leave request awaiting your approval',
              v_emp_name || ' applied for leave (' || v_range || ', ' || NEW.total_days || ' day(s)). Your approval is required.',
              v_mgr_link);
    END IF;

    INSERT INTO public.hr_notifications (user_id, employee_id, type, title, message, link)
    SELECT DISTINCT ur.user_id, NEW.employee_id, 'leave_requested_hr',
           'New leave request',
           v_emp_name || ' applied for leave (' || v_range || ').',
           v_hr_link
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE lower(r.name) IN ('super admin','admin','hr','hr manager')
       OR lower(r.name) LIKE 'hr %' OR lower(r.name) LIKE '% hr';

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'manager_approved' THEN
      INSERT INTO public.hr_notifications (user_id, employee_id, type, title, message, link)
      SELECT DISTINCT ur.user_id, NEW.employee_id, 'leave_manager_approved',
             'Leave approved by reporting manager',
             v_emp_name || '''s leave (' || v_range || ') was approved by the reporting manager and needs HR approval.',
             v_hr_link
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      WHERE lower(r.name) IN ('super admin','admin','hr','hr manager')
         OR lower(r.name) LIKE 'hr %' OR lower(r.name) LIKE '% hr';
    ELSIF NEW.status = 'approved' AND v_emp_user IS NOT NULL THEN
      INSERT INTO public.hr_notifications (user_id, employee_id, type, title, message, link)
      VALUES (v_emp_user, NEW.employee_id, 'leave_approved',
              'Your leave request is approved',
              'Your leave for ' || v_range || ' has been approved.',
              '/profile?tab=leaves');
    ELSIF NEW.status = 'rejected' AND v_emp_user IS NOT NULL THEN
      INSERT INTO public.hr_notifications (user_id, employee_id, type, title, message, link)
      VALUES (v_emp_user, NEW.employee_id, 'leave_rejected',
              'Your leave request was not approved',
              'Your leave for ' || v_range || ' was rejected'
                || coalesce(' - ' || nullif(NEW.rejection_reason,''), '') || '.',
              '/profile?tab=leaves');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_notify_leave_request ON public.hr_leave_requests;
CREATE TRIGGER trg_hr_notify_leave_request
AFTER INSERT OR UPDATE ON public.hr_leave_requests
FOR EACH ROW EXECUTE FUNCTION public.hr_notify_leave_request();

REVOKE ALL ON FUNCTION public.hr_notify_leave_request() FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.hr_notify_regularization_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_emp_name text;
  v_emp_user uuid;
  v_mgr_user uuid;
BEGIN
  SELECT trim(coalesce(e.first_name,'') || ' ' || coalesce(e.last_name,'')), e.user_id
    INTO v_emp_name, v_emp_user
  FROM public.hr_employees e WHERE e.id = NEW.employee_id;
  v_emp_name := coalesce(nullif(v_emp_name,''), 'An employee');

  IF NEW.manager_id IS NOT NULL THEN
    SELECT e.user_id INTO v_mgr_user FROM public.hr_employees e WHERE e.id = NEW.manager_id;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.pushed_to_manager_at IS NOT NULL
     AND OLD.pushed_to_manager_at IS NULL
     AND v_mgr_user IS NOT NULL THEN
    INSERT INTO public.hr_notifications (user_id, employee_id, type, title, message, link)
    VALUES (v_mgr_user, NEW.employee_id, 'attendance_reg_pushed',
            'Attendance regularization needs your confirmation',
            v_emp_name || ' raised an attendance regularization for '
              || to_char(NEW.attendance_date, 'DD Mon YYYY') || '. HR has forwarded it to you.',
            '/profile?tab=requests&regId=' || NEW.id::text);
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND v_emp_user IS NOT NULL THEN
    IF NEW.status = 'approved' THEN
      INSERT INTO public.hr_notifications (user_id, employee_id, type, title, message, link)
      VALUES (v_emp_user, NEW.employee_id, 'attendance_reg_approved',
              'Attendance regularization approved',
              'Your regularization for ' || to_char(NEW.attendance_date, 'DD Mon YYYY') || ' was approved.',
              '/profile?tab=attendance');
    ELSIF NEW.status = 'rejected' THEN
      INSERT INTO public.hr_notifications (user_id, employee_id, type, title, message, link)
      VALUES (v_emp_user, NEW.employee_id, 'attendance_reg_rejected',
              'Attendance regularization not approved',
              'Your regularization for ' || to_char(NEW.attendance_date, 'DD Mon YYYY') || ' was rejected'
                || coalesce(' - ' || nullif(NEW.approver_notes,''), '') || '.',
              '/profile?tab=attendance');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_notify_regularization_request ON public.hr_attendance_regularization_requests;
CREATE TRIGGER trg_hr_notify_regularization_request
AFTER UPDATE ON public.hr_attendance_regularization_requests
FOR EACH ROW EXECUTE FUNCTION public.hr_notify_regularization_request();

REVOKE ALL ON FUNCTION public.hr_notify_regularization_request() FROM PUBLIC, anon;
