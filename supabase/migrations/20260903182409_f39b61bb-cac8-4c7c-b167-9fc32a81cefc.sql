-- Build the org default salary breakup for an employee who has none.
CREATE OR REPLACE FUNCTION public.hr_build_default_salary_structure(p_employee_id uuid, p_target numeric)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_enabled boolean;
  v_defs jsonb;
  v_item jsonb;
  v_code text;
  v_pct numeric;
  v_comp uuid;
  v_made integer := 0;
BEGIN
  IF p_target IS NULL OR p_target <= 0 THEN RETURN 0; END IF;

  SELECT use_xpayroll_default_structure, default_structure_components
    INTO v_enabled, v_defs
  FROM public.hr_razorpay_settings LIMIT 1;

  IF NOT COALESCE(v_enabled, false) OR v_defs IS NULL THEN RETURN 0; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_defs) LOOP
    IF COALESCE(v_item->>'mode', 'percentage') <> 'percentage' THEN CONTINUE; END IF;
    v_pct := COALESCE((v_item->>'value')::numeric, 0);
    IF v_pct <= 0 THEN CONTINUE; END IF;

    v_code := CASE lower(COALESCE(v_item->>'key', ''))
      WHEN 'basic'   THEN 'BASIC'
      WHEN 'da'      THEN 'DA'
      WHEN 'hra'     THEN 'HRA'
      WHEN 'special' THEN 'SPECIAL_ALLOWANCE'
      WHEN 'lta'     THEN 'LTA'
      ELSE NULL END;
    IF v_code IS NULL THEN CONTINUE; END IF;

    SELECT id INTO v_comp FROM public.hr_salary_components WHERE code = v_code LIMIT 1;
    IF v_comp IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.hr_employee_salary_structures
      (employee_id, component_id, amount, is_active, is_percentage, source)
    VALUES (p_employee_id, v_comp, round(p_target * v_pct / 100.0, 2), true, false, 'hrms_default_structure');
    v_made := v_made + 1;
  END LOOP;

  RETURN v_made;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_build_default_salary_structure(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_build_default_salary_structure(uuid, numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.reconcile_employee_salary_structure_to_total(p_employee_id uuid, p_expected_total numeric DEFAULT NULL::numeric)
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
  v_built integer := 0;
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

  -- An employee onboarded with a CTC but no breakup rows used to hard-fail here,
  -- which blocked the RazorpayX salary push entirely. Build the org default
  -- breakup instead (Basic/HRA/Special/LTA percentages from payroll settings).
  IF v_components = 0 THEN
    v_built := public.hr_build_default_salary_structure(p_employee_id, v_target);
    IF v_built = 0 THEN
      RAISE EXCEPTION 'Employee has no active salary components and no default structure is configured. Build the salary structure before pushing.';
    END IF;
    SELECT COALESCE(sum(amount), 0), count(*)
      INTO v_before, v_components
    FROM public.hr_employee_salary_structures
    WHERE employee_id = p_employee_id
      AND is_active = true;
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
    'built_default', v_built > 0,
    'changed', abs(COALESCE(v_before, 0) - v_target) > 1
  );
END;
$function$;