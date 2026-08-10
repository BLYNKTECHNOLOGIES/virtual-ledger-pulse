CREATE OR REPLACE FUNCTION public.hr_notify_leave_request_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_employee_name text;
  v_mgr_user uuid;
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
      v_employee_name || ' submitted a leave request', '/hrms/leave/requests');

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
        v_employee_name || '''s leave was approved by the reporting manager', '/hrms/leave/requests');
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
END $$;