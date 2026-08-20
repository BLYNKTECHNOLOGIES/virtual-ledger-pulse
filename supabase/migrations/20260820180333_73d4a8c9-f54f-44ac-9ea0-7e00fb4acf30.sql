CREATE OR REPLACE FUNCTION public.can_access_banking_credentials(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    public.has_role(_user_id, 'super admin')
    OR public.has_permission(_user_id, 'compliance_manage'::app_permission)
  )
$$;