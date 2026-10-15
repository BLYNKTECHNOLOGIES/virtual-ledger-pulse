CREATE OR REPLACE FUNCTION public.cbt_can_manage(_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    public.has_permission(_user_id,'hrms_quiz_manage') OR public.has_permission(_user_id,'hrms_quiz_admin')
    OR public.has_permission(_user_id,'super_admin_access'))
$$;