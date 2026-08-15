DROP POLICY IF EXISTS terminal_select ON public.terminal_bypass_codes;
CREATE POLICY terminal_select ON public.terminal_bypass_codes
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR public.has_terminal_permission((SELECT auth.uid()), 'terminal_users_bypass_code'::terminal_permission)
);