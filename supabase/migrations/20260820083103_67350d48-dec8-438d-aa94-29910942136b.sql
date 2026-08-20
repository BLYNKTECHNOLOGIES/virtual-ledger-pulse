DROP POLICY IF EXISTS auth_read_bio_photos ON public.hr_biometric_device_photos;
DROP POLICY IF EXISTS auth_read_bio_users ON public.hr_biometric_device_users;
DROP POLICY IF EXISTS auth_read_bio_tpl ON public.hr_biometric_device_templates;

CREATE POLICY hr_read_bio_photos ON public.hr_biometric_device_photos
  FOR SELECT TO authenticated
  USING (public.hr_is_hr_staff(auth.uid()) OR public.has_role(auth.uid(), 'Super Admin') OR public.has_role(auth.uid(), 'Admin'));

CREATE POLICY hr_read_bio_users ON public.hr_biometric_device_users
  FOR SELECT TO authenticated
  USING (public.hr_is_hr_staff(auth.uid()) OR public.has_role(auth.uid(), 'Super Admin') OR public.has_role(auth.uid(), 'Admin'));

CREATE POLICY hr_read_bio_tpl ON public.hr_biometric_device_templates
  FOR SELECT TO authenticated
  USING (public.hr_is_hr_staff(auth.uid()) OR public.has_role(auth.uid(), 'Super Admin') OR public.has_role(auth.uid(), 'Admin'));

REVOKE EXECUTE ON FUNCTION public.has_help_assistant_permission(uuid, app_permission) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, app_permission) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_terminal_permission(uuid, terminal_permission) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_terminal_permission(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.hr_current_employee_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.hr_doc_can_view_sensitive(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.hr_ess_current_employee_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.hr_is_hr_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.hr_is_hr_staff(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_ledger_auditor(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_manager(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mpi_can_manage(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mpi_can_view(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mpi_is_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_has_permission(uuid, app_permission) FROM anon;
REVOKE EXECUTE ON FUNCTION public.verify_terminal_access(uuid) FROM anon;