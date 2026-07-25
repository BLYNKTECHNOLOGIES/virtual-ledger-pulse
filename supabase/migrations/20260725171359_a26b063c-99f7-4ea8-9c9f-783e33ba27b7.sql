CREATE OR REPLACE FUNCTION public.reconcile_employee_salary_structure_to_total(
  p_employee_id uuid,
  p_expected_total numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := current_setting('role', true);
  v_allowed boolean := false;
  v_employee_total numeric;
  v_before numeric;
  v_after numeric;
  v_components integer;
  v_target numeric;
BEGIN
  IF p_employee_id IS NULL THEN
    RAISE EXCEPTION 'Employee id is required';
  END IF;

  IF v_role IN ('service_role', 'postgres', 'supabase_admin') OR current_user IN ('postgres', 'supabase_admin') THEN
    v_allowed := true;
  ELSIF v_uid IS NOT NULL THEN
    SELECT public.user_has_permission(v_uid, 'hrms_manage'::app_permission)
        OR EXISTS(
          SELECT 1
          FROM public.user_roles ur
          JOIN public.roles r ON r.id = ur.role_id
          WHERE ur.user_id = v_uid AND lower(r.name) = 'super admin'
        )
      INTO v_allowed;
  END IF;

  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'Permission denied: HRMS manage required';
  END IF;

  SELECT total_salary INTO v_employee_total
  FROM public.hr_employees
  WHERE id = p_employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  v_target := COALESCE(p_expected_total, v_employee_total);

  IF v_target IS NULL OR v_target < 0 THEN
    RAISE EXCEPTION 'Target CTC must be a non-negative number';
  END IF;

  IF p_expected_total IS NOT NULL AND abs(COALESCE(v_employee_total, 0) - p_expected_total) > 1 THEN
    RAISE EXCEPTION 'Expected CTC % does not match HRMS employee CTC %', p_expected_total, v_employee_total;
  END IF;

  SELECT COALESCE(sum(amount), 0), count(*)
    INTO v_before, v_components
  FROM public.hr_employee_salary_structures
  WHERE employee_id = p_employee_id
    AND is_active = true;

  IF v_components = 0 THEN
    RAISE EXCEPTION 'Employee has no active salary components. Import/build salary structure before pushing.';
  END IF;

  IF abs(COALESCE(v_before, 0) - v_target) > 1 THEN
    PERFORM public._rescale_employee_salary_structure(p_employee_id, v_target);
  END IF;

  SELECT COALESCE(sum(amount), 0)
    INTO v_after
  FROM public.hr_employee_salary_structures
  WHERE employee_id = p_employee_id
    AND is_active = true;

  RETURN jsonb_build_object(
    'employee_id', p_employee_id,
    'target_total', v_target,
    'before_total', v_before,
    'after_total', v_after,
    'components', v_components,
    'changed', abs(COALESCE(v_before, 0) - v_target) > 1
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.reconcile_employee_salary_structure_to_total(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_employee_salary_structure_to_total(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_employee_salary_structure_to_total(uuid, numeric) TO service_role;

SELECT public.reconcile_employee_salary_structure_to_total(
  '885608b3-95a6-46c9-9fe3-6b32480a0977'::uuid,
  912000
);