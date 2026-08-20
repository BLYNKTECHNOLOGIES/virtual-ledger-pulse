-- 1. pending_registrations: hide credential material from managers
REVOKE SELECT (password_hash), UPDATE (password_hash), INSERT (password_hash) ON public.pending_registrations FROM authenticated;
REVOKE ALL ON public.pending_registrations FROM anon;

-- 2. terminal_biometric_sessions: owner-scoped access
DROP POLICY IF EXISTS terminal_select ON public.terminal_biometric_sessions;
DROP POLICY IF EXISTS terminal_write ON public.terminal_biometric_sessions;

CREATE POLICY terminal_select_own ON public.terminal_biometric_sessions
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

CREATE POLICY terminal_write_own ON public.terminal_biometric_sessions
FOR ALL TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

-- 3. no anonymous execution of SECURITY DEFINER credential function
REVOKE EXECUTE ON FUNCTION public.store_webauthn_credential(uuid, text, text, text) FROM anon, PUBLIC;

-- 4. gate role creation
CREATE OR REPLACE FUNCTION public.create_role_with_permissions(role_name text, role_description text, permissions text[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    new_role_id UUID;
    perm TEXT;
BEGIN
    IF NOT public.has_role(auth.uid(), 'Super Admin')
       AND NOT public.has_role(auth.uid(), 'Admin') THEN
      RAISE EXCEPTION 'Permission denied: Admin or Super Admin required';
    END IF;

    INSERT INTO roles (name, description, is_system_role)
    VALUES (role_name, role_description, false)
    RETURNING id INTO new_role_id;

    FOREACH perm IN ARRAY permissions
    LOOP
        INSERT INTO role_permissions (role_id, permission)
        VALUES (new_role_id, perm::app_permission);
    END LOOP;

    RETURN new_role_id;
END;
$function$;
