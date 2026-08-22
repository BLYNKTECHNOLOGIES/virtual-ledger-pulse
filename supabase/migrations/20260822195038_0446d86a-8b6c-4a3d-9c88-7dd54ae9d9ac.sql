CREATE OR REPLACE FUNCTION public.hr_notify_regularization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_emp_name text;
  v_emp_user uuid;
  v_mgr_user uuid;
  v_link text := '/hrms/attendance/regularization';
BEGIN
  SELECT trim(coalesce(e.first_name,'') || ' ' || coalesce(e.last_name,'')), e.user_id
    INTO v_emp_name, v_emp_user
  FROM public.hr_employees e WHERE e.id = NEW.employee_id;
  v_emp_name := coalesce(nullif(v_emp_name,''), 'An employee');

  -- New request -> HR staff
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
    -- Pushed to reporting manager
    IF NEW.status = 'manager_review' AND NEW.manager_id IS NOT NULL THEN
      SELECT e.user_id INTO v_mgr_user FROM public.hr_employees e WHERE e.id = NEW.manager_id;
      IF v_mgr_user IS NOT NULL THEN
        INSERT INTO public.hr_notifications (user_id, type, title, message, link)
        VALUES (v_mgr_user, 'attendance_regularization_manager_review',
                'Regularization needs your review',
                v_emp_name || ' — attendance ' || NEW.attendance_date::text,
                '/profile?tab=approvals');
      END IF;
    END IF;

    -- Manager decided -> HR staff
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

    -- Final decision -> employee
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
$$;

DROP TRIGGER IF EXISTS trg_hr_notify_regularization ON public.hr_attendance_regularization_requests;
CREATE TRIGGER trg_hr_notify_regularization
AFTER INSERT OR UPDATE ON public.hr_attendance_regularization_requests
FOR EACH ROW EXECUTE FUNCTION public.hr_notify_regularization();