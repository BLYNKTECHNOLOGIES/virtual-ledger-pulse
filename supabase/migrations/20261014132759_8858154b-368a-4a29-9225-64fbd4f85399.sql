CREATE OR REPLACE FUNCTION public.um_sync_auth_signin() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.last_sign_in_at IS NOT NULL AND NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at THEN
 UPDATE public.users SET last_login=NEW.last_sign_in_at WHERE id=NEW.id;
 IF FOUND THEN INSERT INTO public.user_activity_log(user_id,action,description,metadata,created_at) VALUES(NEW.id,'login','User signed in',jsonb_build_object('auth_sign_in_at',NEW.last_sign_in_at,'source','supabase_auth'),NEW.last_sign_in_at) ON CONFLICT DO NOTHING; END IF;
 END IF; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.um_sync_auth_signin() FROM PUBLIC,anon,authenticated;
CREATE UNIQUE INDEX um_auth_signin_once ON public.user_activity_log(user_id,(metadata->>'auth_sign_in_at')) WHERE action='login' AND metadata ? 'auth_sign_in_at';
CREATE TRIGGER um_auth_signin AFTER UPDATE OF last_sign_in_at ON auth.users FOR EACH ROW EXECUTE FUNCTION public.um_sync_auth_signin();
CREATE OR REPLACE FUNCTION public.update_last_login(_user_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF auth.uid() IS NULL OR _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'You can only update your own sign-in' USING ERRCODE='42501'; END IF;
 UPDATE public.users u SET last_login=a.last_sign_in_at FROM auth.users a WHERE u.id=a.id AND u.id=auth.uid(); END $$;
CREATE OR REPLACE FUNCTION public.erp_heartbeat() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign-in required' USING ERRCODE='42501'; END IF;
 UPDATE public.users SET last_activity=now() WHERE id=auth.uid() AND status='ACTIVE'; END $$;
REVOKE ALL ON FUNCTION public.erp_heartbeat() FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.erp_heartbeat() TO authenticated;
CREATE OR REPLACE FUNCTION public.update_user_activity(user_uuid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF auth.uid() IS NULL OR user_uuid IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'You can only mark yourself active' USING ERRCODE='42501'; END IF; PERFORM public.erp_heartbeat(); END $$;
REVOKE ALL ON FUNCTION public.update_user_activity(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.update_user_activity(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.um_online_users() RETURNS TABLE(id uuid,username text,email text,first_name text,last_name text,last_seen timestamptz,status text,erp boolean,terminal boolean) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT (public.has_permission(auth.uid(),'user_management_view') OR public.has_permission(auth.uid(),'user_management_manage')) THEN RAISE EXCEPTION 'User Management access required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT u.id,u.username,u.email,u.first_name,u.last_name,greatest(u.last_activity,t.last_seen_at),u.status,coalesce(u.last_activity>now()-interval '2 minutes',false),coalesce(t.is_online AND t.last_seen_at>now()-interval '90 seconds',false) FROM public.users u LEFT JOIN public.terminal_user_presence t ON t.user_id=u.id WHERE u.status='ACTIVE' AND (u.last_activity>now()-interval '2 minutes' OR (t.is_online AND t.last_seen_at>now()-interval '90 seconds')) ORDER BY greatest(u.last_activity,t.last_seen_at) DESC; END $$;
REVOKE ALL ON FUNCTION public.um_online_users() FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.um_online_users() TO authenticated;
CREATE OR REPLACE FUNCTION public.um_trim_role_name() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN NEW.name=btrim(NEW.name); RETURN NEW; END $$;
CREATE TRIGGER um_trim_role_name BEFORE INSERT OR UPDATE OF name ON public.roles FOR EACH ROW EXECUTE FUNCTION public.um_trim_role_name();
ALTER TABLE public.roles DROP CONSTRAINT roles_name_key;
DROP POLICY um_delete_role_functions ON public.role_functions; DROP POLICY um_insert_role_functions ON public.role_functions; DROP POLICY um_update_role_functions ON public.role_functions;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.role_functions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.role_functions TO authenticated,service_role;
ALTER TABLE public.role_functions DROP CONSTRAINT role_functions_role_id_fkey;
CREATE OR REPLACE FUNCTION public.um_legacy_functions_readonly() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'Module functions are read-only; use permissions instead' USING ERRCODE='42501'; END $$;
CREATE TRIGGER um_legacy_functions_readonly BEFORE INSERT OR UPDATE OR DELETE ON public.role_functions FOR EACH ROW EXECUTE FUNCTION public.um_legacy_functions_readonly();
CREATE OR REPLACE FUNCTION public.um_delete_role(p_role_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v_caller uuid:=auth.uid(); v_role record; v_n integer; BEGIN
 SELECT * INTO v_role FROM public.roles WHERE id=p_role_id; IF NOT FOUND THEN RAISE EXCEPTION 'Role not found'; END IF;
 IF v_role.is_system_role OR lower(trim(v_role.name)) IN ('super admin','admin') THEN RAISE EXCEPTION 'System roles cannot be deleted'; END IF;
 IF NOT public.um_can_manage_role(v_caller,p_role_id) THEN RAISE EXCEPTION 'You can only delete roles ranked below your own'; END IF;
 SELECT count(DISTINCT uid) INTO v_n FROM(SELECT id uid FROM public.users WHERE role_id=p_role_id UNION SELECT user_id FROM public.user_roles WHERE role_id=p_role_id)s;
 IF v_n>0 THEN RAISE EXCEPTION '% % still % this role. Move them to another role first.',v_n,CASE WHEN v_n=1 THEN 'person' ELSE 'people' END,CASE WHEN v_n=1 THEN 'has' ELSE 'have' END; END IF;
 DELETE FROM public.role_permissions WHERE role_id=p_role_id; DELETE FROM public.roles WHERE id=p_role_id;
 RETURN jsonb_build_object('success',true,'name',v_role.name); END $$;
CREATE INDEX IF NOT EXISTS um_permission_history_page ON public.permission_change_log(changed_at DESC,id DESC);