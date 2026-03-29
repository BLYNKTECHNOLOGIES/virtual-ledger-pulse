
-- GAP 1: Audit trigger for terminal permission changes
-- Creates a trigger that logs every permission grant/revocation to terminal_permission_change_log

CREATE OR REPLACE FUNCTION public.log_terminal_permission_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_name text;
  v_action text;
  v_permission text;
BEGIN
  -- Determine action and get the relevant row data
  IF TG_OP = 'INSERT' THEN
    v_action := 'granted';
    v_permission := NEW.permission::text;
    SELECT name INTO v_role_name FROM public.p2p_terminal_roles WHERE id = NEW.role_id;
    
    INSERT INTO public.terminal_permission_change_log (
      role_id, role_name, permission, action, changed_by
    ) VALUES (
      NEW.role_id, COALESCE(v_role_name, 'unknown'), v_permission, v_action, auth.uid()
    );
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'revoked';
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

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trg_log_terminal_permission_change ON public.p2p_terminal_role_permissions;

-- Create trigger on INSERT and DELETE
CREATE TRIGGER trg_log_terminal_permission_change
  AFTER INSERT OR DELETE ON public.p2p_terminal_role_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.log_terminal_permission_change();
