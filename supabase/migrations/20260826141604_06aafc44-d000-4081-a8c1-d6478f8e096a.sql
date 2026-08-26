-- 1. Table
CREATE TABLE public.hr_bank_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  requested_by uuid,
  bank_name text NOT NULL,
  account_number text NOT NULL,
  ifsc_code text NOT NULL,
  branch text,
  account_holder_name text NOT NULL,
  proof_type text,
  proof_urls text[] NOT NULL DEFAULT '{}',
  employee_note text,
  status text NOT NULL DEFAULT 'pending',
  hr_reviewed_by uuid,
  hr_reviewed_at timestamptz,
  hr_notes text,
  previous_bank jsonb,
  applied_at timestamptz,
  razorpay_status text NOT NULL DEFAULT 'not_started',
  razorpay_error text,
  razorpay_verified_at timestamptz,
  razorpay_attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_hr_bank_change_status CHECK (status IN ('pending','pending_razorpay','approved','rejected','razorpay_failed','cancelled')),
  CONSTRAINT chk_hr_bank_change_rp_status CHECK (razorpay_status IN ('not_started','pushing','verified','failed','not_linked'))
);

CREATE INDEX idx_hr_bank_change_requests_employee ON public.hr_bank_change_requests(employee_id, created_at DESC);
CREATE INDEX idx_hr_bank_change_requests_status ON public.hr_bank_change_requests(status, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.hr_bank_change_requests TO authenticated;
GRANT ALL ON public.hr_bank_change_requests TO service_role;

ALTER TABLE public.hr_bank_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees read own bank change requests"
ON public.hr_bank_change_requests FOR SELECT TO authenticated
USING (
  employee_id IN (SELECT e.id FROM public.hr_employees e WHERE e.user_id = auth.uid())
  OR public.hr_is_hr_staff(auth.uid())
  OR public.has_permission(auth.uid(), 'hrms_view')
);

CREATE POLICY "Employees create own bank change requests"
ON public.hr_bank_change_requests FOR INSERT TO authenticated
WITH CHECK (
  employee_id IN (SELECT e.id FROM public.hr_employees e WHERE e.user_id = auth.uid())
  OR public.hr_is_hr_staff(auth.uid())
  OR public.has_permission(auth.uid(), 'hrms_manage')
);

-- Employees may only cancel their own still-pending request; HR may update anything.
CREATE POLICY "Bank change request updates"
ON public.hr_bank_change_requests FOR UPDATE TO authenticated
USING (
  public.hr_is_hr_staff(auth.uid())
  OR public.has_permission(auth.uid(), 'hrms_manage')
  OR (
    status = 'pending'
    AND employee_id IN (SELECT e.id FROM public.hr_employees e WHERE e.user_id = auth.uid())
  )
)
WITH CHECK (
  public.hr_is_hr_staff(auth.uid())
  OR public.has_permission(auth.uid(), 'hrms_manage')
  OR (
    status IN ('pending','cancelled')
    AND employee_id IN (SELECT e.id FROM public.hr_employees e WHERE e.user_id = auth.uid())
  )
);

CREATE TRIGGER trg_hr_bank_change_requests_updated_at
BEFORE UPDATE ON public.hr_bank_change_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Notifications
CREATE OR REPLACE FUNCTION public.hr_notify_bank_change_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_emp_name text;
  v_emp_user uuid;
  v_link text := '/hrms/requests?type=bank_change&id=' || NEW.id::text;
BEGIN
  SELECT trim(coalesce(e.first_name,'') || ' ' || coalesce(e.last_name,'')), e.user_id
    INTO v_emp_name, v_emp_user
  FROM public.hr_employees e WHERE e.id = NEW.employee_id;
  v_emp_name := coalesce(nullif(v_emp_name,''), 'An employee');

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.hr_notifications (user_id, type, title, message, link)
    SELECT DISTINCT ur.user_id, 'bank_change_requested',
           'Bank change request received',
           v_emp_name || ' requested a salary bank account change (' || NEW.bank_name || ' ****'
             || right(NEW.account_number, 4) || ')',
           v_link
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE lower(r.name) IN ('super admin','admin','hr','hr manager')
       OR lower(r.name) LIKE 'hr %' OR lower(r.name) LIKE '% hr';

    IF v_emp_user IS NOT NULL THEN
      INSERT INTO public.hr_notifications (user_id, type, title, message, link)
      VALUES (v_emp_user, 'bank_change_submitted',
              'Bank change request submitted',
              'Your bank change request has been sent to HR for verification.',
              '/profile?tab=banking');
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND v_emp_user IS NOT NULL THEN
    IF NEW.status = 'approved' THEN
      INSERT INTO public.hr_notifications (user_id, type, title, message, link)
      VALUES (v_emp_user, 'bank_change_approved',
              'Bank change approved',
              'Your salary bank account was updated to ' || NEW.bank_name || ' ****'
                || right(NEW.account_number, 4) || ' and confirmed in the payroll system.',
              '/profile?tab=banking');
    ELSIF NEW.status = 'rejected' THEN
      INSERT INTO public.hr_notifications (user_id, type, title, message, link)
      VALUES (v_emp_user, 'bank_change_rejected',
              'Bank change rejected',
              'Your bank change request was rejected'
                || coalesce(' — ' || nullif(NEW.hr_notes,''), '') || '.',
              '/profile?tab=banking');
    ELSIF NEW.status = 'razorpay_failed' THEN
      INSERT INTO public.hr_notifications (user_id, type, title, message, link)
      VALUES (v_emp_user, 'bank_change_pending_payroll',
              'Bank change pending payroll confirmation',
              'HR approved your bank change but the payroll system has not confirmed it yet. HR is working on it.',
              '/profile?tab=banking');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_hr_notify_bank_change_request
AFTER INSERT OR UPDATE ON public.hr_bank_change_requests
FOR EACH ROW EXECUTE FUNCTION public.hr_notify_bank_change_request();

-- 3. Apply (HR approve step 1: write ERP bank details, await RazorpayX)
CREATE OR REPLACE FUNCTION public.hr_bank_change_apply(_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r public.hr_bank_change_requests;
  v_prev jsonb;
  v_exists uuid;
BEGIN
  IF NOT (public.hr_is_hr_staff(auth.uid()) OR public.has_permission(auth.uid(), 'hrms_manage')) THEN
    RAISE EXCEPTION 'Not authorised to approve bank change requests';
  END IF;

  SELECT * INTO r FROM public.hr_bank_change_requests WHERE id = _request_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF r.status NOT IN ('pending','pending_razorpay','razorpay_failed') THEN
    RAISE EXCEPTION 'Request is already %', r.status;
  END IF;

  SELECT to_jsonb(b) INTO v_prev FROM public.hr_employee_bank_details b WHERE b.employee_id = r.employee_id LIMIT 1;
  SELECT b.id INTO v_exists FROM public.hr_employee_bank_details b WHERE b.employee_id = r.employee_id LIMIT 1;

  IF v_exists IS NULL THEN
    INSERT INTO public.hr_employee_bank_details (employee_id, bank_name, account_number, ifsc_code, branch)
    VALUES (r.employee_id, r.bank_name, r.account_number, upper(r.ifsc_code), r.branch);
  ELSE
    UPDATE public.hr_employee_bank_details
       SET bank_name = r.bank_name,
           account_number = r.account_number,
           ifsc_code = upper(r.ifsc_code),
           branch = coalesce(r.branch, branch),
           updated_at = now()
     WHERE id = v_exists;
  END IF;

  UPDATE public.hr_bank_change_requests
     SET status = 'pending_razorpay',
         razorpay_status = 'pushing',
         razorpay_error = NULL,
         razorpay_attempts = razorpay_attempts + 1,
         previous_bank = coalesce(previous_bank, v_prev),
         applied_at = now(),
         hr_reviewed_by = auth.uid(),
         hr_reviewed_at = now()
   WHERE id = _request_id;

  RETURN jsonb_build_object('ok', true, 'employee_id', r.employee_id);
END;
$$;

-- 4. Finalize (only RazorpayX-verified pushes become approved)
CREATE OR REPLACE FUNCTION public.hr_bank_change_finalize(
  _request_id uuid,
  _verified boolean,
  _error text DEFAULT NULL,
  _not_linked boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.hr_is_hr_staff(auth.uid()) OR public.has_permission(auth.uid(), 'hrms_manage')) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  UPDATE public.hr_bank_change_requests
     SET status = CASE WHEN _verified THEN 'approved' ELSE 'razorpay_failed' END,
         razorpay_status = CASE WHEN _verified THEN 'verified'
                                WHEN _not_linked THEN 'not_linked'
                                ELSE 'failed' END,
         razorpay_error = CASE WHEN _verified THEN NULL ELSE _error END,
         razorpay_verified_at = CASE WHEN _verified THEN now() ELSE NULL END
   WHERE id = _request_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 5. Reject
CREATE OR REPLACE FUNCTION public.hr_bank_change_reject(_request_id uuid, _notes text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.hr_is_hr_staff(auth.uid()) OR public.has_permission(auth.uid(), 'hrms_manage')) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  UPDATE public.hr_bank_change_requests
     SET status = 'rejected', hr_notes = _notes,
         hr_reviewed_by = auth.uid(), hr_reviewed_at = now()
   WHERE id = _request_id AND status IN ('pending','pending_razorpay','razorpay_failed');
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.hr_bank_change_apply(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_bank_change_finalize(uuid, boolean, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_bank_change_reject(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hr_bank_change_apply(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_bank_change_finalize(uuid, boolean, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_bank_change_reject(uuid, text) TO authenticated;

-- 6. Storage: let an employee upload their own bank proof into their own folder
CREATE POLICY "Employee self bank proof upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'employee-documents'
  AND (storage.foldername(name))[1] = 'bank-change'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "Employee self bank proof read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'employee-documents'
  AND (storage.foldername(name))[1] = 'bank-change'
  AND (storage.foldername(name))[2] = auth.uid()::text
);
