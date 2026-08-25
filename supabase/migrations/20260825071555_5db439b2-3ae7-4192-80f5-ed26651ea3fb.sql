-- 1. password_reset_requests: replace blanket authenticated ALL policy
DROP POLICY IF EXISTS authenticated_all_password_reset ON public.password_reset_requests;

CREATE POLICY "pwd_reset_select_own_or_admin"
ON public.password_reset_requests FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'Super Admin')
  OR public.has_role(auth.uid(), 'Admin')
);

CREATE POLICY "pwd_reset_insert_own"
ON public.password_reset_requests FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "pwd_reset_admin_update"
ON public.password_reset_requests FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'Super Admin') OR public.has_role(auth.uid(), 'Admin'))
WITH CHECK (public.has_role(auth.uid(), 'Super Admin') OR public.has_role(auth.uid(), 'Admin'));

CREATE POLICY "pwd_reset_admin_delete"
ON public.password_reset_requests FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'Super Admin') OR public.has_role(auth.uid(), 'Admin'));

-- 2. system_settings: read for all staff, writes for admins / terminal settings managers
DROP POLICY IF EXISTS authenticated_all_system_settings ON public.system_settings;

CREATE POLICY "system_settings_read"
ON public.system_settings FOR SELECT TO authenticated
USING (true);

CREATE POLICY "system_settings_write_admin"
ON public.system_settings FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'Super Admin')
  OR public.has_role(auth.uid(), 'Admin')
  OR public.has_terminal_permission(auth.uid(), 'terminal_settings_manage')
)
WITH CHECK (
  public.has_role(auth.uid(), 'Super Admin')
  OR public.has_role(auth.uid(), 'Admin')
  OR public.has_terminal_permission(auth.uid(), 'terminal_settings_manage')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.password_reset_requests TO authenticated;
GRANT ALL ON public.password_reset_requests TO service_role;

-- 3. Trigger function must not be executable by anonymous callers
REVOKE EXECUTE ON FUNCTION public.hr_trg_stamp_leave_attendance() FROM PUBLIC, anon;