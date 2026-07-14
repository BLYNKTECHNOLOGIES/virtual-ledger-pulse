CREATE OR REPLACE FUNCTION public.can_delete_erp_user(p_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller_id uuid := auth.uid();
  _caller_can_full_delete boolean := false;
  _caller_can_hr_delete boolean := false;
  _target_is_protected boolean := false;
  _target_exists boolean := false;
BEGIN
  IF _caller_id IS NULL THEN
    RETURN json_build_object('allowed', false, 'error', 'You must be logged in to delete users');
  END IF;

  IF _caller_id = p_user_id THEN
    RETURN json_build_object('allowed', false, 'error', 'You cannot delete your own account');
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) INTO _target_exists;
  IF NOT _target_exists THEN
    RETURN json_build_object('allowed', false, 'error', 'User not found');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id
      AND lower(r.name) IN ('admin', 'super admin', 'super_admin')
  ) INTO _target_is_protected;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = _caller_id
      AND lower(r.name) IN ('admin', 'super admin', 'super_admin')
  ) INTO _caller_can_full_delete;

  IF NOT _caller_can_full_delete THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role_id = ur.role_id
      WHERE ur.user_id = _caller_id
        AND rp.permission = 'user_management_manage'
    ) INTO _caller_can_full_delete;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    WHERE ur.user_id = _caller_id
      AND rp.permission = 'user_management_hr_manage'
  ) INTO _caller_can_hr_delete;

  IF NOT _caller_can_full_delete AND NOT _caller_can_hr_delete THEN
    RETURN json_build_object('allowed', false, 'error', 'You do not have permission to delete users');
  END IF;

  IF _target_is_protected AND NOT _caller_can_full_delete THEN
    RETURN json_build_object('allowed', false, 'error', 'HR user management cannot delete Admin or Super Admin accounts');
  END IF;

  RETURN json_build_object('allowed', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.can_delete_erp_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_delete_erp_user(uuid) TO service_role;