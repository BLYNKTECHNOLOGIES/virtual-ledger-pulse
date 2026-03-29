-- Phase 2: Permission Change Audit Trail

-- 1. Create permission_change_log table
CREATE TABLE public.permission_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid REFERENCES public.roles(id) ON DELETE SET NULL,
  role_name text NOT NULL,
  change_type text NOT NULL, -- 'permission_granted', 'permission_revoked', 'function_granted', 'function_revoked'
  permission text, -- for permission changes
  function_key text, -- for function changes
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.permission_change_log ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read (admins will filter in UI)
CREATE POLICY "Authenticated users can view permission change logs"
  ON public.permission_change_log FOR SELECT
  TO authenticated
  USING (public.is_manager(auth.uid()));

-- 2. Trigger function for role_permissions changes
CREATE OR REPLACE FUNCTION public.log_permission_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role_name text;
  _action text;
  _permission text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT name INTO _role_name FROM public.roles WHERE id = NEW.role_id;
    _action := 'permission_granted';
    _permission := NEW.permission::text;
    
    INSERT INTO public.permission_change_log (role_id, role_name, change_type, permission, changed_by)
    VALUES (NEW.role_id, COALESCE(_role_name, 'Unknown'), _action, _permission, auth.uid());
    
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT name INTO _role_name FROM public.roles WHERE id = OLD.role_id;
    _action := 'permission_revoked';
    _permission := OLD.permission::text;
    
    INSERT INTO public.permission_change_log (role_id, role_name, change_type, permission, changed_by)
    VALUES (OLD.role_id, COALESCE(_role_name, 'Unknown'), _action, _permission, auth.uid());
    
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- 3. Trigger function for role_functions changes
CREATE OR REPLACE FUNCTION public.log_function_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role_name text;
  _function_key text;
  _action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT name INTO _role_name FROM public.roles WHERE id = NEW.role_id;
    SELECT function_key INTO _function_key FROM public.system_functions WHERE id = NEW.function_id;
    _action := 'function_granted';
    
    INSERT INTO public.permission_change_log (role_id, role_name, change_type, function_key, changed_by)
    VALUES (NEW.role_id, COALESCE(_role_name, 'Unknown'), _action, COALESCE(_function_key, 'Unknown'), auth.uid());
    
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT name INTO _role_name FROM public.roles WHERE id = OLD.role_id;
    SELECT function_key INTO _function_key FROM public.system_functions WHERE id = OLD.function_id;
    _action := 'function_revoked';
    
    INSERT INTO public.permission_change_log (role_id, role_name, change_type, function_key, changed_by)
    VALUES (OLD.role_id, COALESCE(_role_name, 'Unknown'), _action, COALESCE(_function_key, 'Unknown'), auth.uid());
    
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- 4. Attach triggers
CREATE TRIGGER trg_log_permission_change
  AFTER INSERT OR DELETE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.log_permission_change();

CREATE TRIGGER trg_log_function_change
  AFTER INSERT OR DELETE ON public.role_functions
  FOR EACH ROW EXECUTE FUNCTION public.log_function_change();