-- Allow reading terminal user role assignments (non-sensitive data: user_id, role_id mapping)
CREATE POLICY "Allow reading terminal user role assignments"
  ON public.p2p_terminal_user_roles
  FOR SELECT
  USING (true);

-- Also check p2p_terminal_roles and p2p_terminal_role_permissions
DO $$
BEGIN
  -- Allow reading terminal roles
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'p2p_terminal_roles' AND cmd = 'SELECT') THEN
    EXECUTE 'CREATE POLICY "Allow reading terminal roles" ON public.p2p_terminal_roles FOR SELECT USING (true)';
  END IF;
  
  -- Allow reading terminal role permissions
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'p2p_terminal_role_permissions' AND cmd = 'SELECT') THEN
    EXECUTE 'CREATE POLICY "Allow reading terminal role permissions" ON public.p2p_terminal_role_permissions FOR SELECT USING (true)';
  END IF;
END $$;