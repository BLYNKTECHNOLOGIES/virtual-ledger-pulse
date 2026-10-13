-- 1. Onboarding document sync: both file shapes, never overwrite HR edits
CREATE OR REPLACE FUNCTION public.hr_onboarding_doc_files(p_onboarding_id uuid, p_docs jsonb, p_offer jsonb)
RETURNS TABLE(source_ref text, document_type text, document_name text, file_url text)
LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $$
DECLARE k text; v jsonb; f jsonb; v_url text;
BEGIN
  FOR k, v IN
    SELECT * FROM jsonb_each(CASE WHEN jsonb_typeof(p_docs)='object' THEN p_docs ELSE '{}'::jsonb END)
    UNION ALL
    SELECT * FROM jsonb_each(CASE WHEN jsonb_typeof(p_offer)='object' THEN p_offer ELSE '{}'::jsonb END)
  LOOP
    IF jsonb_typeof(v) <> 'object' THEN CONTINUE; END IF;
    v_url := COALESCE(NULLIF(v->>'file_url',''), NULLIF(v->>'url',''));
    IF v_url IS NOT NULL THEN
      source_ref := 'onboarding:' || p_onboarding_id::text || ':' || k;
      document_type := k;
      document_name := COALESCE(NULLIF(v->>'file_name',''), NULLIF(v->>'name',''), replace(initcap(replace(k,'_',' ')),'  ',' '));
      file_url := v_url;
      RETURN NEXT;
    END IF;
    IF jsonb_typeof(v->'extra_files') = 'array' THEN
      FOR f IN SELECT * FROM jsonb_array_elements(v->'extra_files') LOOP
        IF jsonb_typeof(f) <> 'object' THEN CONTINUE; END IF;
        v_url := COALESCE(NULLIF(f->>'file_url',''), NULLIF(f->>'url',''));
        CONTINUE WHEN v_url IS NULL;
        source_ref := 'onboarding:' || p_onboarding_id::text || ':' || k || ':' || md5(v_url);
        document_type := k;
        document_name := COALESCE(NULLIF(f->>'file_name',''), NULLIF(f->>'name',''), initcap(replace(k,'_',' ')));
        file_url := v_url;
        RETURN NEXT;
      END LOOP;
    END IF;
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.hr_onboarding_doc_files(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_onboarding_doc_files(uuid, jsonb, jsonb) TO service_role;

DROP FUNCTION IF EXISTS public.hr_sync_onboarding_documents(uuid);
CREATE OR REPLACE FUNCTION public.hr_sync_onboarding_documents(p_onboarding_id uuid, p_old_docs jsonb DEFAULT NULL, p_old_offer jsonb DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  r_onb record; r record; o record; v_count int := 0; v_rows int;
BEGIN
  SELECT * INTO r_onb FROM public.hr_employee_onboarding WHERE id = p_onboarding_id;
  IF NOT FOUND OR r_onb.employee_id IS NULL THEN RETURN 0; END IF;

  FOR r IN SELECT DISTINCT ON (x.source_ref) x.* FROM public.hr_onboarding_doc_files(p_onboarding_id, r_onb.documents, r_onb.offer_policy_documents) x LOOP
    INSERT INTO public.hr_employee_documents
      (employee_id, document_type, document_name, file_url, uploaded_by, source, source_ref, notes)
    VALUES (r_onb.employee_id, r.document_type, r.document_name, r.file_url, 'Onboarding submission', 'onboarding', r.source_ref, 'Collected during onboarding')
    ON CONFLICT (employee_id, source_ref) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN v_count := v_count + 1; CONTINUE; END IF;

    -- Existing row: follow the onboarding change only while the employee
    -- document still holds exactly what the onboarding record gave it last time.
    IF p_old_docs IS NULL AND p_old_offer IS NULL THEN CONTINUE; END IF;
    SELECT * INTO o FROM public.hr_onboarding_doc_files(p_onboarding_id, p_old_docs, p_old_offer) y
      WHERE y.source_ref = r.source_ref LIMIT 1;
    IF NOT FOUND THEN CONTINUE; END IF;
    IF o.file_url = r.file_url AND o.document_name = r.document_name THEN CONTINUE; END IF;
    UPDATE public.hr_employee_documents d
       SET file_url = r.file_url, document_name = r.document_name
     WHERE d.employee_id = r_onb.employee_id AND d.source_ref = r.source_ref
       AND d.file_url = o.file_url AND d.document_name = o.document_name;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_count := v_count + v_rows;
  END LOOP;
  RETURN v_count;
END $$;
REVOKE EXECUTE ON FUNCTION public.hr_sync_onboarding_documents(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_sync_onboarding_documents(uuid, jsonb, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.hr_onboarding_documents_sync_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.employee_id IS NOT NULL THEN
    IF TG_OP = 'UPDATE' AND OLD.employee_id IS NOT DISTINCT FROM NEW.employee_id THEN
      PERFORM public.hr_sync_onboarding_documents(NEW.id, COALESCE(OLD.documents,'{}'::jsonb), COALESCE(OLD.offer_policy_documents,'{}'::jsonb));
    ELSE
      PERFORM public.hr_sync_onboarding_documents(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- 2. Leave notices: one trigger, one notice per person per event
DROP TRIGGER IF EXISTS trg_hr_notify_leave_request_change ON public.hr_leave_requests;

CREATE OR REPLACE FUNCTION public.hr_notify_leave_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_emp_name text; v_emp_user uuid; v_mgr_user uuid; v_range text; v_days text;
  v_mgr_link text := '/profile?tab=requests&leaveId=' || NEW.id::text;
  v_hr_link  text := '/hrms/requests?type=leave&id=' || NEW.id::text;
BEGIN
  BEGIN
    SELECT trim(coalesce(e.first_name,'') || ' ' || coalesce(e.last_name,'')), e.user_id
      INTO v_emp_name, v_emp_user FROM public.hr_employees e WHERE e.id = NEW.employee_id;
    v_emp_name := coalesce(nullif(v_emp_name,''), 'An employee');
    IF NEW.manager_id IS NOT NULL THEN
      SELECT e.user_id INTO v_mgr_user FROM public.hr_employees e WHERE e.id = NEW.manager_id;
    END IF;
    v_range := CASE WHEN NEW.start_date = NEW.end_date THEN to_char(NEW.start_date, 'DD Mon YYYY')
      ELSE to_char(NEW.start_date, 'DD Mon') || ' - ' || to_char(NEW.end_date, 'DD Mon YYYY') END;
    v_days := trim(trailing '.' from trim(trailing '0' from NEW.total_days::numeric::text)) || CASE WHEN NEW.total_days = 1 THEN ' day' ELSE ' days' END;

    IF TG_OP = 'INSERT' THEN
      IF v_mgr_user IS NOT NULL THEN
        INSERT INTO public.hr_notifications (user_id, employee_id, type, title, message, link)
        VALUES (v_mgr_user, NEW.employee_id, 'leave_requested', 'Leave request awaiting your approval',
                v_emp_name || ' applied for leave (' || v_range || ', ' || v_days || '). Your approval is required.', v_mgr_link);
      END IF;
      INSERT INTO public.hr_notifications (user_id, employee_id, type, title, message, link)
      SELECT u.id, NEW.employee_id, 'leave_requested_hr', 'New leave request',
             v_emp_name || ' applied for leave (' || v_range || ', ' || v_days || ').', v_hr_link
      FROM public.users u
      WHERE public.hr_is_hr_staff(u.id) AND u.id IS DISTINCT FROM v_mgr_user AND u.id IS DISTINCT FROM v_emp_user;
      IF v_emp_user IS NOT NULL THEN
        INSERT INTO public.hr_notifications (user_id, employee_id, type, title, message, link)
        VALUES (v_emp_user, NEW.employee_id, 'leave_request_submitted', 'Leave request submitted',
                'Your leave for ' || v_range || ' (' || v_days || ') was submitted — awaiting '
                  || CASE WHEN v_mgr_user IS NULL THEN 'HR approval.' ELSE 'your reporting manager.' END, '/profile?tab=leaves');
      END IF;
    ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status = 'manager_approved' THEN
        INSERT INTO public.hr_notifications (user_id, employee_id, type, title, message, link)
        SELECT u.id, NEW.employee_id, 'leave_manager_approved', 'Leave needs HR approval',
               v_emp_name || '''s leave (' || v_range || ') was approved by the reporting manager and needs HR approval.', v_hr_link
        FROM public.users u WHERE public.hr_is_hr_staff(u.id) AND u.id IS DISTINCT FROM v_emp_user;
        IF v_emp_user IS NOT NULL THEN
          INSERT INTO public.hr_notifications (user_id, employee_id, type, title, message, link)
          VALUES (v_emp_user, NEW.employee_id, 'leave_manager_approved_self', 'Manager approved your leave',
                  'Your leave for ' || v_range || ' was approved by your reporting manager — awaiting final HR approval.', '/profile?tab=leaves');
        END IF;
      ELSIF NEW.status = 'approved' AND v_emp_user IS NOT NULL THEN
        INSERT INTO public.hr_notifications (user_id, employee_id, type, title, message, link)
        VALUES (v_emp_user, NEW.employee_id, 'leave_approved', 'Your leave request is approved',
                'Your leave for ' || v_range || ' has been approved'
                || CASE WHEN COALESCE(NEW.unpaid_days,0) > 0
                     THEN format(': %s paid day(s), %s day(s) as loss of pay.', NEW.paid_days, NEW.unpaid_days) ELSE '.' END,
                '/profile?tab=leaves');
      ELSIF NEW.status = 'rejected' AND v_emp_user IS NOT NULL THEN
        INSERT INTO public.hr_notifications (user_id, employee_id, type, title, message, link)
        VALUES (v_emp_user, NEW.employee_id, 'leave_rejected', 'Your leave request was not approved',
                'Your leave for ' || v_range || ' was rejected' || coalesce(' - Reason: ' || nullif(NEW.rejection_reason,''), '') || '.',
                '/profile?tab=leaves');
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'hr_notify_leave_request failed for %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END $$;

-- 3. HR Logs type filter
CREATE OR REPLACE FUNCTION public.hr_notification_type_counts()
RETURNS TABLE(type text, n bigint) LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$ SELECT type, count(*) FROM public.hr_notifications GROUP BY type ORDER BY type $$;
REVOKE EXECUTE ON FUNCTION public.hr_notification_type_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_notification_type_counts() TO authenticated, service_role;