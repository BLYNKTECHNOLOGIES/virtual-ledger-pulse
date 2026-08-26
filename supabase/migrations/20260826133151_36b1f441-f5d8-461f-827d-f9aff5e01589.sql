CREATE OR REPLACE FUNCTION public.hr_notify_regularization()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
                '/profile?tab=approvals&requestId=' || NEW.id::text);
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
$function$;

CREATE OR REPLACE FUNCTION public.hr_notify_leave_request_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
          '/profile?tab=approvals&leaveId=' || NEW.id::text);
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
END $function$;