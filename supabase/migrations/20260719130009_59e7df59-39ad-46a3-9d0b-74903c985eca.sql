-- 1. Make flags nullable — NULL = "unknown, use global compliance fallback"
ALTER TABLE public.hr_employees
  ALTER COLUMN pf_enabled DROP NOT NULL,
  ALTER COLUMN pf_enabled DROP DEFAULT,
  ALTER COLUMN esi_enabled DROP NOT NULL,
  ALTER COLUMN esi_enabled DROP DEFAULT,
  ALTER COLUMN pt_enabled DROP NOT NULL,
  ALTER COLUMN pt_enabled DROP DEFAULT;

COMMENT ON COLUMN public.hr_employees.pf_enabled IS 'RazorpayX per-employee PF enrollment. NULL = unknown, engine falls back to hr_razorpay_settings.compliance_files_pf. TRUE/FALSE = verified from imported register.';
COMMENT ON COLUMN public.hr_employees.esi_enabled IS 'RazorpayX per-employee ESI enrollment. NULL = unknown, engine falls back to global compliance.';
COMMENT ON COLUMN public.hr_employees.pt_enabled IS 'RazorpayX per-employee PT enrollment. NULL = unknown, engine falls back to global compliance.';

-- 2. Reset flags for every employee EXCEPT the 6 I verified from actual payslips
UPDATE public.hr_employees
SET pf_enabled = NULL, esi_enabled = NULL, pt_enabled = NULL
WHERE badge_id NOT IN ('1','4','15','35','44','54');

-- 3. Derivation function — reads register-imported payslip history and sets flags
CREATE OR REPLACE FUNCTION public.hr_derive_statutory_enrollment_from_history(p_employee_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pf_max NUMERIC := 0;
  v_esi_max NUMERIC := 0;
  v_pt_max NUMERIC := 0;
  v_pf_bool BOOLEAN;
  v_esi_bool BOOLEAN;
  v_pt_bool BOOLEAN;
  v_basic NUMERIC;
  v_hra NUMERIC;
  v_sa NUMERIC;
  v_lta NUMERIC;
  v_regular_gross NUMERIC;
  v_custom JSONB := NULL;
  v_months_seen INT := 0;
  v_row_count INT;
BEGIN
  -- How many months of register data do we have for this employee?
  SELECT COUNT(*) INTO v_row_count
  FROM public.hr_razorpay_payslip_records
  WHERE hr_employee_id = p_employee_id
    AND (reg_basic > 0 OR reg_pf_ee > 0 OR reg_esi_ee > 0 OR reg_pt > 0);

  IF v_row_count = 0 THEN
    RETURN jsonb_build_object('status','no_data','months_seen',0);
  END IF;

  -- Enrollment: if any imported month shows a positive statutory line, the
  -- employee is enrolled. If every imported month shows zero, they're not.
  SELECT
    MAX(GREATEST(COALESCE(pf_amount,0), COALESCE(reg_pf_ee,0), COALESCE(reg_pf_er,0))),
    MAX(GREATEST(COALESCE(esi_amount,0), COALESCE(reg_esi_ee,0), COALESCE(reg_esi_er,0))),
    MAX(GREATEST(COALESCE(professional_tax,0), COALESCE(reg_pt,0)))
  INTO v_pf_max, v_esi_max, v_pt_max
  FROM public.hr_razorpay_payslip_records
  WHERE hr_employee_id = p_employee_id;

  v_pf_bool  := v_pf_max  > 0;
  v_esi_bool := v_esi_max > 0;
  v_pt_bool  := v_pt_max  > 0;

  -- Custom structure %: use the LATEST imported register row with a full basic
  -- (proxies "no LOP" — the truest picture of the underlying split).
  SELECT reg_basic, reg_hra, reg_sa, reg_lta, v_months_seen + 1
  INTO v_basic, v_hra, v_sa, v_lta, v_months_seen
  FROM public.hr_razorpay_payslip_records
  WHERE hr_employee_id = p_employee_id
    AND reg_basic > 0
    AND reg_working_days >= 28   -- rough "no significant LOP" gate
  ORDER BY period_month DESC
  LIMIT 1;

  IF v_basic IS NOT NULL AND v_basic > 0 THEN
    v_regular_gross := v_basic + COALESCE(v_hra,0) + COALESCE(v_sa,0) + COALESCE(v_lta,0);
    -- Only override if the split materially differs from 50/25/15/10 (>1.5pp on Basic)
    IF v_regular_gross > 0 AND ABS((v_basic / v_regular_gross) - 0.50) > 0.015 THEN
      v_custom := jsonb_build_object(
        'basic',   ROUND((v_basic / v_regular_gross) * 100, 2),
        'hra',     ROUND((COALESCE(v_hra,0) / v_regular_gross) * 100, 2),
        'special', ROUND((COALESCE(v_sa,0)  / v_regular_gross) * 100, 2),
        'lta',     ROUND((COALESCE(v_lta,0) / v_regular_gross) * 100, 2),
        'source', 'derived_from_register',
        'derived_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      );
    END IF;
  END IF;

  UPDATE public.hr_employees
  SET pf_enabled  = v_pf_bool,
      esi_enabled = v_esi_bool,
      pt_enabled  = v_pt_bool,
      custom_structure_pct = COALESCE(v_custom, custom_structure_pct)
  WHERE id = p_employee_id;

  RETURN jsonb_build_object(
    'status','derived',
    'months_seen', v_row_count,
    'pf_enabled', v_pf_bool,
    'esi_enabled', v_esi_bool,
    'pt_enabled', v_pt_bool,
    'custom_structure_pct', v_custom
  );
END;
$$;

-- 4. Bulk driver — run derivation for every active employee, return a report
CREATE OR REPLACE FUNCTION public.hr_derive_all_statutory_enrollments()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT := 0;
  v_no_data INT := 0;
  v_unknown_ids UUID[] := ARRAY[]::UUID[];
  emp RECORD;
  result JSONB;
BEGIN
  FOR emp IN
    SELECT id FROM public.hr_employees WHERE is_active = true
  LOOP
    result := public.hr_derive_statutory_enrollment_from_history(emp.id);
    IF result->>'status' = 'derived' THEN
      v_updated := v_updated + 1;
    ELSE
      v_no_data := v_no_data + 1;
      v_unknown_ids := array_append(v_unknown_ids, emp.id);
    END IF;
  END LOOP;
  RETURN jsonb_build_object(
    'updated_from_history', v_updated,
    'still_unknown_no_history', v_no_data,
    'unknown_employee_ids', v_unknown_ids
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_derive_statutory_enrollment_from_history(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_derive_all_statutory_enrollments() TO authenticated, service_role;

COMMENT ON FUNCTION public.hr_derive_statutory_enrollment_from_history IS 'Reads any employee''s imported RazorpayX salary-register history and sets per-employee statutory enrollment + custom structure override. Idempotent — safe to run repeatedly. Should be invoked automatically after every salary-register CSV import.';
COMMENT ON FUNCTION public.hr_derive_all_statutory_enrollments IS 'Bulk wrapper. Returns which employees were updated and which still have no register data. Wire this into the Data Health page so HR can see who is still on "unknown → global fallback".';