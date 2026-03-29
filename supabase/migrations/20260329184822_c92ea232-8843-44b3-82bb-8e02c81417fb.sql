-- Phase 3: Backend RPC Enforcement

-- 1. Create enforcement configuration table
CREATE TABLE public.permission_enforcement_config (
  id text PRIMARY KEY DEFAULT 'default',
  mode text NOT NULL DEFAULT 'audit', -- 'audit' (log only) or 'enforce' (block)
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default config (audit mode)
INSERT INTO public.permission_enforcement_config (id, mode) VALUES ('default', 'audit');

-- Enable RLS
ALTER TABLE public.permission_enforcement_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view enforcement config"
  ON public.permission_enforcement_config FOR SELECT
  TO authenticated
  USING (public.is_manager(auth.uid()));

-- 2. Create enforcement log table
CREATE TABLE public.permission_enforcement_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  username text,
  attempted_action text NOT NULL,
  required_permission text NOT NULL,
  had_permission boolean NOT NULL DEFAULT false,
  enforcement_mode text NOT NULL, -- 'audit' or 'enforce'
  blocked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.permission_enforcement_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view enforcement logs"
  ON public.permission_enforcement_log FOR SELECT
  TO authenticated
  USING (public.is_manager(auth.uid()));

-- 3. Create require_permission function
CREATE OR REPLACE FUNCTION public.require_permission(
  _user_id uuid,
  _permission text,
  _action_name text DEFAULT 'unknown'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _has_perm boolean;
  _mode text;
  _username text;
BEGIN
  -- Check if user has the permission via user_roles -> role_permissions chain
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = _user_id
    AND rp.permission::text = _permission
  ) INTO _has_perm;

  -- Get current enforcement mode
  SELECT mode INTO _mode FROM public.permission_enforcement_config WHERE id = 'default';
  _mode := COALESCE(_mode, 'audit');

  -- Get username for logging
  SELECT username INTO _username FROM public.users WHERE id = _user_id;

  -- Log the check if permission is missing
  IF NOT _has_perm THEN
    INSERT INTO public.permission_enforcement_log 
      (user_id, username, attempted_action, required_permission, had_permission, enforcement_mode, blocked)
    VALUES 
      (_user_id, COALESCE(_username, 'unknown'), _action_name, _permission, false, _mode, _mode = 'enforce');

    -- In enforce mode, raise an exception
    IF _mode = 'enforce' THEN
      RAISE EXCEPTION 'Permission denied: % requires % permission', _action_name, _permission
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN _has_perm;
END;
$$;

-- 4. Gate critical RPCs (add permission checks at the top of each)
-- We'll wrap the existing functions with permission checks

-- Gate delete_purchase_order_with_reversal
CREATE OR REPLACE FUNCTION public.check_delete_purchase_permission(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_permission(_user_id, 'purchase_manage', 'delete_purchase_order');
  PERFORM public.require_permission(_user_id, 'erp_destructive', 'delete_purchase_order');
  RETURN true;
END;
$$;

-- Gate delete_sales_order_with_reversal
CREATE OR REPLACE FUNCTION public.check_delete_sales_permission(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_permission(_user_id, 'sales_manage', 'delete_sales_order');
  PERFORM public.require_permission(_user_id, 'erp_destructive', 'delete_sales_order');
  RETURN true;
END;
$$;

-- Gate user management
CREATE OR REPLACE FUNCTION public.check_user_management_permission(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_permission(_user_id, 'user_management_manage', 'user_management');
  RETURN true;
END;
$$;