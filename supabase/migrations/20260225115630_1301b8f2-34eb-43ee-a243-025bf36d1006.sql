-- Create Super Admin role with hierarchy level -1
INSERT INTO public.p2p_terminal_roles (name, description, hierarchy_level, is_default)
VALUES ('Super Admin', 'Full control over all users and roles', -1, false)
ON CONFLICT (name) DO NOTHING;

-- Get the Super Admin role ID
DO $$
DECLARE
  super_admin_role_id uuid;
  target_user_id uuid;
BEGIN
  SELECT id INTO super_admin_role_id FROM public.p2p_terminal_roles WHERE name = 'Super Admin';
  SELECT id INTO target_user_id FROM public.users WHERE username = 'ShubhamSingh';

  IF super_admin_role_id IS NOT NULL AND target_user_id IS NOT NULL THEN
    -- Remove existing terminal roles for Shubham Singh
    DELETE FROM public.p2p_terminal_user_roles WHERE user_id = target_user_id;
    
    -- Assign Super Admin role
    INSERT INTO public.p2p_terminal_user_roles (user_id, role_id, assigned_by)
    VALUES (target_user_id, super_admin_role_id, target_user_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
  END IF;
END $$;