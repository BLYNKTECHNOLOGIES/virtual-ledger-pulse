
-- P0/P1: Shadow payroll engine hardening
-- 1. Skip surfacing + TDS scope reduction on runs
ALTER TABLE public.hr_shadow_payroll_runs
  ADD COLUMN IF NOT EXISTS skipped_lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS include_tds_in_drift boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.hr_shadow_payroll_runs.skipped_lines IS
  'Array of {employee_id, reason, detail} entries recorded when the engine could not compute a line for that employee. Reasons: no_salary_assignment | zero_ctc | fetch_error.';
COMMENT ON COLUMN public.hr_shadow_payroll_runs.include_tds_in_drift IS
  'When false (default) the drift comparator ignores TDS deltas. Flip per-run once the FY26-27 TDS module is trusted.';

-- 2. Provenance on statutory flags
ALTER TABLE public.hr_employees
  ADD COLUMN IF NOT EXISTS statutory_flags_source text
    CHECK (statutory_flags_source IN ('payslip_verified','register_derived','assumed_from_global') OR statutory_flags_source IS NULL);

COMMENT ON COLUMN public.hr_employees.statutory_flags_source IS
  'How pf_enabled/esi_enabled/pt_enabled were determined: payslip_verified (>=1 real Razorpay payslip showing the deduction line), register_derived (inferred from imported salary-register CSV history), assumed_from_global (still on hr_razorpay_settings fallback).';

-- 3. Have the derivation RPC stamp the provenance
CREATE OR REPLACE FUNCTION public.hr_derive_statutory_enrollment_from_history(p_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pf_bool boolean;
  v_esi_bool boolean;
  v_pt_bool boolean;
  v_row_count int;
  v_basic numeric;
  v_hra numeric;
  v_sa numeric;
  v_lta numeric;
  v_regular_gross numeric;
  v_custom jsonb;
  v_verified boolean := false;
BEGIN
  SELECT
    COUNT(*),
    BOOL_OR(COALESCE(pf_amount,0) > 0),
    BOOL_OR(COALESCE(esi_amount,0) > 0),
    BOOL_OR(COALESCE(professional_tax,0) > 0)
  INTO v_row_count, v_pf_bool, v_esi_bool, v_pt_bool
  FROM public.hr_razorpay_payslip_records
  WHERE hr_employee_id = p_employee_id;

  IF v_row_count = 0 THEN
    RETURN jsonb_build_object('status','no_history');
  END IF;

  -- If ANY imported row shows the statutory line, treat it as payslip_verified.
  v_verified := (v_pf_bool OR v_esi_bool OR v_pt_bool);

  SELECT reg_basic, reg_hra, reg_special_allowance, reg_lta
  INTO v_basic, v_hra, v_sa, v_lta
  FROM public.hr_razorpay_payslip_records
  WHERE hr_employee_id = p_employee_id
    AND reg_basic > 0
    AND reg_working_days >= 28
  ORDER BY period_month DESC
  LIMIT 1;

  IF v_basic IS NOT NULL AND v_basic > 0 THEN
    v_regular_gross := v_basic + COALESCE(v_hra,0) + COALESCE(v_sa,0) + COALESCE(v_lta,0);
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
      custom_structure_pct = COALESCE(v_custom, custom_structure_pct),
      statutory_flags_source = CASE WHEN v_verified THEN 'payslip_verified' ELSE 'register_derived' END
  WHERE id = p_employee_id;

  RETURN jsonb_build_object(
    'status','derived',
    'months_seen', v_row_count,
    'pf_enabled', v_pf_bool,
    'esi_enabled', v_esi_bool,
    'pt_enabled', v_pt_bool,
    'source', CASE WHEN v_verified THEN 'payslip_verified' ELSE 'register_derived' END,
    'custom_structure_pct', v_custom
  );
END;
$$;

-- Backfill provenance for rows already touched by the derivation RPC or the reset script.
-- Anything currently non-null on any of the three flags but sitting on the global fallback
-- pattern is safest to tag as assumed_from_global until re-derived.
UPDATE public.hr_employees
SET statutory_flags_source = 'assumed_from_global'
WHERE statutory_flags_source IS NULL
  AND (pf_enabled IS NOT NULL OR esi_enabled IS NOT NULL OR pt_enabled IS NOT NULL);
