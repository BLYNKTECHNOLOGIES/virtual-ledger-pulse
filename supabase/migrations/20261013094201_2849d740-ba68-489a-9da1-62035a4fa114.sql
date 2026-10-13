CREATE TABLE public.hr_erp_access_revocations (user_id uuid PRIMARY KEY, employee_id uuid NOT NULL, requested_at timestamptz NOT NULL DEFAULT now(), requested_by uuid, completed_at timestamptz, attempts integer NOT NULL DEFAULT 0, last_error text, updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.hr_erp_access_revocations TO service_role;
ALTER TABLE public.hr_erp_access_revocations ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.hr_queue_erp_revocation(p_employee_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.hr_employees; v_uid uuid; v_actor uuid:=auth.uid(); v_super boolean:=false; v_today date:=(now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
  v_super:=public.has_role(v_actor,'Super Admin');
  IF v_actor IS NULL OR NOT public.hr_is_hr_staff(v_actor) OR NOT (v_super OR public.user_has_permission(v_actor,'erp_destructive'::public.app_permission)) THEN RAISE EXCEPTION 'Forbidden: HR staff with ERP destructive permission required'; END IF;
 END IF;
 SELECT * INTO e FROM public.hr_employees WHERE id=p_employee_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Employee not found'; END IF;
 IF e.last_working_day IS NOT NULL AND e.last_working_day >= v_today THEN RAISE EXCEPTION 'Access remains available through the last working day'; END IF;
 IF e.is_active AND e.resignation_status IS DISTINCT FROM 'completed' AND NOT (e.resignation_status='notice_period' AND e.last_working_day < v_today) THEN RAISE EXCEPTION 'Employee has not been separated or made inactive'; END IF;
 v_uid:=e.user_id;
 IF v_uid IS NULL AND e.badge_id IS NOT NULL THEN SELECT id INTO v_uid FROM public.users WHERE badge_id=e.badge_id; END IF;
 IF v_uid IS NULL AND e.email IS NOT NULL THEN SELECT id INTO v_uid FROM public.users WHERE lower(email)=lower(e.email); END IF;
 IF v_uid IS NULL THEN RETURN NULL; END IF;
 IF v_actor=v_uid THEN RAISE EXCEPTION 'You cannot delete your own account'; END IF;
 IF v_actor IS NOT NULL AND NOT v_super AND public.has_role(v_uid,'Super Admin') THEN RAISE EXCEPTION 'Only Super Admin can delete a Super Admin user'; END IF;
 IF EXISTS(SELECT 1 FROM public.hr_employees WHERE user_id=v_uid AND id<>e.id AND is_active) THEN RAISE EXCEPTION 'ERP account is linked to another active employee'; END IF;
 INSERT INTO public.hr_erp_access_revocations(user_id,employee_id,requested_by) VALUES(v_uid,e.id,v_actor) ON CONFLICT(user_id) DO NOTHING;
 UPDATE public.users SET status='INACTIVE',force_logout_at=now(),updated_at=now() WHERE id=v_uid;
 RETURN v_uid;
END; $$;
REVOKE ALL ON FUNCTION public.hr_queue_erp_revocation(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.hr_queue_erp_revocation(uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.hr_cleanup_revoked_erp(p_user_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN RAISE EXCEPTION 'Server only'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.hr_erp_access_revocations WHERE user_id=p_user_id AND completed_at IS NULL) THEN RAISE EXCEPTION 'No pending revocation'; END IF;
 -- Explicitly unlink, never delete employee records, including the legacy Auth FK.
 UPDATE public.hr_employees SET user_id=NULL WHERE user_id=p_user_id;
 UPDATE public.employees SET user_id=NULL WHERE user_id=p_user_id;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_user_id) OR EXISTS(SELECT 1 FROM public.users WHERE id=p_user_id AND username='deleted_'||replace(p_user_id::text,'-','') AND status='INACTIVE' AND role_id IS NULL) THEN
  PERFORM public.terminal_revoke_all_access(p_user_id);
  RETURN jsonb_build_object('success',true,'mode','already_removed');
 END IF;
 result:=public.delete_user_with_cleanup(p_user_id);
 IF NOT COALESCE((result->>'success')::boolean,false) THEN RAISE EXCEPTION '%',COALESCE(result->>'error','ERP cleanup failed'); END IF;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.hr_cleanup_revoked_erp(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hr_cleanup_revoked_erp(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.hr_queue_inactive_erp_access() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF OLD.is_active AND NOT NEW.is_active AND (NEW.last_working_day IS NULL OR NEW.last_working_day < (now() AT TIME ZONE 'Asia/Kolkata')::date) THEN
  PERFORM public.hr_queue_erp_revocation(NEW.id);
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.hr_queue_inactive_erp_access() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_hr_queue_inactive_erp_access AFTER UPDATE OF is_active ON public.hr_employees FOR EACH ROW EXECUTE FUNCTION public.hr_queue_inactive_erp_access();
CREATE OR REPLACE FUNCTION public.process_scheduled_account_deletions() RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e record; v_uid uuid; v_count integer:=0; v_errors text[]:='{}'; v_today date:=(now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN RAISE EXCEPTION 'Server only'; END IF;
 FOR e IN SELECT id,last_working_day FROM public.hr_employees WHERE (NOT is_active OR (resignation_status IN ('notice_period','completed') AND last_working_day<v_today)) AND (last_working_day IS NULL OR last_working_day<v_today) LOOP
  BEGIN
   v_uid:=public.hr_queue_erp_revocation(e.id);
   IF v_uid IS NOT NULL THEN v_count:=v_count+1; END IF;
   UPDATE public.hr_employees SET is_active=false,resignation_status=CASE WHEN resignation_status IN ('notice_period','completed') THEN 'completed' ELSE resignation_status END WHERE id=e.id AND is_active;
  EXCEPTION WHEN OTHERS THEN v_errors:=array_append(v_errors,e.id::text||': '||SQLERRM);
  END;
 END LOOP;
 RETURN json_build_object('queued_count',v_count,'errors',v_errors);
END; $$;
REVOKE ALL ON FUNCTION public.process_scheduled_account_deletions() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_scheduled_account_deletions() TO service_role;