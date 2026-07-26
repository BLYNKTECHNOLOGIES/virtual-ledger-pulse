
-- =========================================================
-- Slice 5: Notification writers
-- =========================================================

-- Helper: emit a notification row.
-- Resolves user_id from employee_id when possible (via hr_employees.user_id).
CREATE OR REPLACE FUNCTION public.hr_emit_notification(
  p_employee_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_link text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_id uuid;
BEGIN
  v_user_id := p_user_id;
  IF v_user_id IS NULL AND p_employee_id IS NOT NULL THEN
    SELECT user_id INTO v_user_id FROM public.hr_employees WHERE id = p_employee_id;
  END IF;

  -- If we still have no addressee, silently no-op rather than raising.
  IF v_user_id IS NULL AND p_employee_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.hr_notifications (user_id, employee_id, type, title, message, link, is_read)
  VALUES (v_user_id, p_employee_id, p_type, p_title, p_message, p_link, false)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_emit_notification(uuid, text, text, text, text, uuid) TO authenticated, service_role;

-- Broadcast to every HR/Super Admin user (used for events HR should see collectively).
CREATE OR REPLACE FUNCTION public.hr_broadcast_notification_to_hr(
  p_type text,
  p_title text,
  p_message text,
  p_link text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT u.id AS user_id
    FROM public.users u
    LEFT JOIN public.user_roles ur ON ur.user_id = u.id
    WHERE ur.role IN ('admin', 'super_admin')
       OR COALESCE(u.role_level, 999) <= 20
  LOOP
    PERFORM public.hr_emit_notification(NULL, p_type, p_title, p_message, p_link, r.user_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
EXCEPTION WHEN OTHERS THEN
  -- Best-effort; do not block callers on notification failures
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_broadcast_notification_to_hr(text, text, text, text) TO authenticated, service_role;

-- =========================================================
-- Trigger: leave requests
-- =========================================================
CREATE OR REPLACE FUNCTION public.hr_notify_leave_request_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_name text;
BEGIN
  SELECT COALESCE(full_name, employee_name, 'Employee') INTO v_employee_name
  FROM public.hr_employees WHERE id = NEW.employee_id;

  IF TG_OP = 'INSERT' THEN
    -- Notify HR of new request
    PERFORM public.hr_broadcast_notification_to_hr(
      'leave_request_created',
      'New leave request',
      COALESCE(v_employee_name, 'Employee') || ' submitted a leave request',
      '/hrms/leave/requests'
    );
    -- Confirm to employee
    PERFORM public.hr_emit_notification(
      NEW.employee_id,
      'leave_request_submitted',
      'Leave request submitted',
      'Your leave request was submitted and is awaiting approval.',
      '/hrms/leave/my-requests'
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'approved' THEN
      PERFORM public.hr_emit_notification(
        NEW.employee_id,
        'leave_request_approved',
        'Leave approved',
        'Your leave request was approved.',
        '/hrms/leave/my-requests'
      );
    ELSIF NEW.status = 'rejected' THEN
      PERFORM public.hr_emit_notification(
        NEW.employee_id,
        'leave_request_rejected',
        'Leave rejected',
        'Your leave request was rejected.' ||
          COALESCE(' Reason: ' || NEW.rejection_reason, ''),
        '/hrms/leave/my-requests'
      );
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the underlying write on notification failure
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_notify_leave_request_change ON public.hr_leave_requests;
CREATE TRIGGER trg_hr_notify_leave_request_change
AFTER INSERT OR UPDATE ON public.hr_leave_requests
FOR EACH ROW EXECUTE FUNCTION public.hr_notify_leave_request_change();

-- =========================================================
-- Trigger: announcements
-- =========================================================
CREATE OR REPLACE FUNCTION public.hr_notify_announcement_published()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  -- Only fire when an announcement becomes visible (created active, or flipped to active/published)
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_active, true) = false THEN RETURN NEW; END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF COALESCE(NEW.is_active, true) = false THEN RETURN NEW; END IF;
    IF OLD.is_active IS NOT DISTINCT FROM NEW.is_active
       AND OLD.title IS NOT DISTINCT FROM NEW.title THEN
      RETURN NEW;
    END IF;
  END IF;

  FOR r IN SELECT id FROM public.hr_employees WHERE COALESCE(status, 'active') = 'active' LOOP
    PERFORM public.hr_emit_notification(
      r.id,
      'announcement',
      COALESCE(NEW.title, 'New announcement'),
      LEFT(COALESCE(NEW.body, NEW.description, ''), 200),
      '/hrms/announcements'
    );
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_notify_announcement_published ON public.hr_announcements;
CREATE TRIGGER trg_hr_notify_announcement_published
AFTER INSERT OR UPDATE ON public.hr_announcements
FOR EACH ROW EXECUTE FUNCTION public.hr_notify_announcement_published();

-- =========================================================
-- Trigger: payroll run status changes (HR-facing broadcast)
-- =========================================================
CREATE OR REPLACE FUNCTION public.hr_notify_payroll_run_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.hr_broadcast_notification_to_hr(
      'payroll_run_' || NEW.status,
      'Payroll run: ' || NEW.status,
      'RazorpayX payroll run ' || COALESCE(NEW.payroll_month::text, '') || ' is now ' || NEW.status,
      '/hrms/payroll'
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_notify_payroll_run_change ON public.hr_razorpay_payroll_runs;
CREATE TRIGGER trg_hr_notify_payroll_run_change
AFTER UPDATE ON public.hr_razorpay_payroll_runs
FOR EACH ROW EXECUTE FUNCTION public.hr_notify_payroll_run_change();

-- =========================================================
-- Trigger: salary revisions (finalize / push events)
-- =========================================================
CREATE OR REPLACE FUNCTION public.hr_notify_salary_revision_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('pushed', 'verified', 'finalized', 'active') THEN
    PERFORM public.hr_emit_notification(
      NEW.employee_id,
      'salary_revision_' || NEW.status,
      'Salary revision ' || NEW.status,
      'A salary revision effective ' ||
        COALESCE(NEW.effective_from::text, '') || ' is now ' || NEW.status || '.',
      '/hrms/payroll/salary-revisions'
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_notify_salary_revision_change ON public.hr_salary_revisions;
CREATE TRIGGER trg_hr_notify_salary_revision_change
AFTER UPDATE ON public.hr_salary_revisions
FOR EACH ROW EXECUTE FUNCTION public.hr_notify_salary_revision_change();
