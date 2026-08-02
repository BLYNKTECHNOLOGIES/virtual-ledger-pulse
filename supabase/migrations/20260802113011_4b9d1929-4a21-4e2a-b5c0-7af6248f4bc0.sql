-- 1. Sync trigger now also mirrors UAN / ESIC numbers into the employee record
CREATE OR REPLACE FUNCTION public.hr_esp_sync_employee_cache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_emp uuid := COALESCE(NEW.hr_employee_id, OLD.hr_employee_id);
  v_row record;
BEGIN
  SELECT * INTO v_row FROM public.hr_statutory_profile(v_emp, CURRENT_DATE);
  IF FOUND THEN
    UPDATE public.hr_employees
       SET pf_enabled = v_row.pf_enabled,
           esi_enabled = v_row.esi_enabled,
           pt_enabled  = v_row.pt_enabled,
           uan_number  = COALESCE(v_row.uan, uan_number),
           esi_number  = COALESCE(v_row.esic_number, esi_number),
           statutory_flags_source = 'hrms_profile'
     WHERE id = v_emp;
  END IF;
  RETURN NULL;
END;
$function$;

-- 2. Effective-dated apply: write the row AND carry it forward over later rows
CREATE OR REPLACE FUNCTION public.hr_apply_statutory_change(
  p_employee uuid,
  p_effective_from date,
  p_pf_enabled boolean,
  p_pf_wage_basis text,
  p_vpf_mode text,
  p_vpf_value numeric,
  p_esi_enabled boolean,
  p_pt_enabled boolean,
  p_uan text,
  p_esic_number text,
  p_reason text
)
RETURNS TABLE(profile_id uuid, forward_rows_updated integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_month date := date_trunc('month', COALESCE(p_effective_from, CURRENT_DATE))::date;
  v_id uuid;
  v_fwd integer := 0;
BEGIN
  IF p_employee IS NULL THEN
    RAISE EXCEPTION 'Employee is required';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required for every statutory change';
  END IF;

  INSERT INTO public.hr_employee_statutory_profiles AS t (
    hr_employee_id, effective_from, pf_enabled, pf_wage_basis, vpf_mode, vpf_value,
    esi_enabled, pt_enabled, uan, esic_number, reason, source, created_by
  ) VALUES (
    p_employee, v_month, COALESCE(p_pf_enabled, true), COALESCE(p_pf_wage_basis, 'capped'),
    COALESCE(p_vpf_mode, 'none'), COALESCE(p_vpf_value, 0), COALESCE(p_esi_enabled, true),
    COALESCE(p_pt_enabled, false), NULLIF(btrim(COALESCE(p_uan, '')), ''),
    NULLIF(btrim(COALESCE(p_esic_number, '')), ''), btrim(p_reason), 'hrms_profile', auth.uid()
  )
  ON CONFLICT (hr_employee_id, effective_from) DO UPDATE
    SET pf_enabled = EXCLUDED.pf_enabled,
        pf_wage_basis = EXCLUDED.pf_wage_basis,
        vpf_mode = EXCLUDED.vpf_mode,
        vpf_value = EXCLUDED.vpf_value,
        esi_enabled = EXCLUDED.esi_enabled,
        pt_enabled = EXCLUDED.pt_enabled,
        uan = EXCLUDED.uan,
        esic_number = EXCLUDED.esic_number,
        reason = EXCLUDED.reason,
        source = EXCLUDED.source,
        created_by = EXCLUDED.created_by
  RETURNING t.id INTO v_id;

  -- Carry forward: later months inherit this change so it is not shadowed
  UPDATE public.hr_employee_statutory_profiles p
     SET pf_enabled = COALESCE(p_pf_enabled, true),
         pf_wage_basis = COALESCE(p_pf_wage_basis, 'capped'),
         vpf_mode = COALESCE(p_vpf_mode, 'none'),
         vpf_value = COALESCE(p_vpf_value, 0),
         esi_enabled = COALESCE(p_esi_enabled, true),
         pt_enabled = COALESCE(p_pt_enabled, false),
         uan = NULLIF(btrim(COALESCE(p_uan, '')), ''),
         esic_number = NULLIF(btrim(COALESCE(p_esic_number, '')), ''),
         reason = btrim(p_reason) || ' (carried forward)',
         source = 'hrms_profile'
   WHERE p.hr_employee_id = p_employee
     AND p.effective_from > v_month;
  GET DIAGNOSTICS v_fwd = ROW_COUNT;

  RETURN QUERY SELECT v_id, v_fwd;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.hr_apply_statutory_change(uuid, date, boolean, text, text, numeric, boolean, boolean, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_apply_statutory_change(uuid, date, boolean, text, text, numeric, boolean, boolean, text, text, text) TO service_role;