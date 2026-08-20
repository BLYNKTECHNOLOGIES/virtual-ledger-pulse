DROP POLICY IF EXISTS bcal_insert ON public.banking_credential_access_log;
CREATE POLICY bcal_insert ON public.banking_credential_access_log
  FOR INSERT TO authenticated
  WITH CHECK (
    accessed_by = auth.uid()
    AND (
      public.has_permission(auth.uid(), 'compliance_manage'::app_permission)
      OR public.is_manager(auth.uid())
    )
  );