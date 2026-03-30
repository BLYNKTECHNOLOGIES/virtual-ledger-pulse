-- Fix trigger function: align action values with terminal_permission_change_log_action_check constraint
-- 'granted' -> 'grant', 'revoked' -> 'revoke'

CREATE OR REPLACE FUNCTION public.log_terminal_permission_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role_name text;
  v_action text;
  v_permission text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'grant';
    v_permission := NEW.permission::text;
    SELECT name INTO v_role_name FROM public.p2p_terminal_roles WHERE id = NEW.role_id;
    
    INSERT INTO public.terminal_permission_change_log (
      role_id, role_name, permission, action, changed_by
    ) VALUES (
      NEW.role_id, COALESCE(v_role_name, 'unknown'), v_permission, v_action, auth.uid()
    );
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'revoke';
    v_permission := OLD.permission::text;
    SELECT name INTO v_role_name FROM public.p2p_terminal_roles WHERE id = OLD.role_id;
    
    INSERT INTO public.terminal_permission_change_log (
      role_id, role_name, permission, action, changed_by
    ) VALUES (
      OLD.role_id, COALESCE(v_role_name, 'unknown'), v_permission, v_action, auth.uid()
    );
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;