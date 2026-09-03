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
    VALUES (p_employee_id, v_comp, round(p_target * v_pct / 100.0, 2), true, false, 'legacy_local');
    v_made := v_made + 1;
  END LOOP;

  RETURN v_made;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_build_default_salary_structure(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_build_default_salary_structure(uuid, numeric) TO service_role;