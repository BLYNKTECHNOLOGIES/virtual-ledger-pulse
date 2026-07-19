
-- =====================================================================
-- Salary-structure PARITY: observed pull + drift detection
-- =====================================================================

-- Compute an "observed" RazorpayX-shape breakdown for an employee from
-- the latest hr_razorpay_payslip_records row (CSV-enriched values win;
-- fallback to API-only mirror where available). Stashes onto the most
-- recent hr_employee_salary_structure_assignments row's
-- expanded_breakdown -> observed and returns the observed JSON.
CREATE OR REPLACE FUNCTION public.hr_pull_observed_salary(p_hr_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_observed jsonb;
  v_assignment_id uuid;
  v_current jsonb;
  v_source text;
BEGIN
  IF p_hr_employee_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Prefer rows enriched by the Salary Register CSV; else most recent row.
  SELECT *
    INTO v_row
  FROM public.hr_razorpay_payslip_records
  WHERE hr_employee_id = p_hr_employee_id
  ORDER BY
    (CASE WHEN reg_source_uploaded_at IS NOT NULL THEN 0 ELSE 1 END),
    period_month DESC NULLS LAST,
    updated_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_source := CASE
    WHEN v_row.reg_source_uploaded_at IS NOT NULL THEN 'register_csv'
    ELSE 'razorpay_api'
  END;

  -- Build RazorpayX-shape observed breakdown. NULLs stay NULL so the UI
  -- can distinguish "not observed" from "observed as zero".
  v_observed := jsonb_build_object(
    'source', v_source,
    'period_month', v_row.period_month,
    'basic',              NULLIF(v_row.reg_basic, 0),
    'da',                 NULLIF(v_row.reg_da, 0),
    'hra',                NULLIF(v_row.reg_hra, 0),
    'special-allowance',  NULLIF(v_row.reg_sa, 0),
    'lta',                NULLIF(v_row.reg_lta, 0),
    'employer-pf',        COALESCE(NULLIF(v_row.reg_pf_er, 0),  NULLIF(v_row.reg_employer_pf_contr, 0)),
    'employer-esi',       COALESCE(NULLIF(v_row.reg_esi_er, 0), NULLIF(v_row.reg_employer_esi_contr, 0)),
    'gross',              COALESCE(NULLIF(v_row.reg_gross_salary, 0), NULLIF(v_row.gross_earnings, 0)),
    'net_pay',            COALESCE(NULLIF(v_row.reg_net_pay, 0),      NULLIF(v_row.net_pay, 0)),
    'deductions',         jsonb_build_object(
                            'pf_employee',      NULLIF(v_row.reg_pf_ee, 0),
                            'esi_employee',     NULLIF(v_row.reg_esi_ee, 0),
                            'professional_tax', COALESCE(NULLIF(v_row.reg_pt, 0),  NULLIF(v_row.professional_tax, 0)),
                            'tds',              COALESCE(NULLIF(v_row.reg_tds, 0), NULLIF(v_row.tds_amount, 0))
                          ),
    'observed_at', now()
  );

  -- Attach onto the most recent assignment row for this employee.
  SELECT id, expanded_breakdown
    INTO v_assignment_id, v_current
  FROM public.hr_employee_salary_structure_assignments
  WHERE employee_id = p_hr_employee_id
  ORDER BY pushed_at DESC NULLS LAST, created_at DESC
  LIMIT 1;

  IF v_assignment_id IS NOT NULL THEN
    UPDATE public.hr_employee_salary_structure_assignments
       SET expanded_breakdown = COALESCE(v_current, '{}'::jsonb) || jsonb_build_object('observed', v_observed)
     WHERE id = v_assignment_id;
  END IF;

  RETURN v_observed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_pull_observed_salary(uuid) TO authenticated, service_role;


-- Return per-component drift plus a rollup for the latest assignment.
CREATE OR REPLACE FUNCTION public.hr_compute_salary_structure_drift(p_hr_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_intent jsonb;
  v_observed jsonb;
  v_items jsonb := '[]'::jsonb;
  v_drift_count int := 0;
  v_key text;
  v_intent_v numeric;
  v_observed_v numeric;
  v_delta numeric;
  v_tol numeric := 1; -- ₹1 tolerance to ignore rounding
  v_keys text[] := ARRAY['basic','da','hra','special-allowance','lta','employer-pf','employer-esi'];
BEGIN
  IF p_hr_employee_id IS NULL THEN
    RETURN jsonb_build_object('status','no_employee');
  END IF;

  SELECT id, expanded_breakdown, template_name, annual_ctc, pushed_at
    INTO v_row
  FROM public.hr_employee_salary_structure_assignments
  WHERE employee_id = p_hr_employee_id
  ORDER BY pushed_at DESC NULLS LAST, created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','no_assignment');
  END IF;

  v_intent := v_row.expanded_breakdown;
  v_observed := v_intent -> 'observed';

  IF v_observed IS NULL THEN
    RETURN jsonb_build_object(
      'status','no_observed',
      'assignment_id', v_row.id,
      'template_name', v_row.template_name,
      'annual_ctc', v_row.annual_ctc,
      'pushed_at', v_row.pushed_at
    );
  END IF;

  FOREACH v_key IN ARRAY v_keys LOOP
    v_intent_v := NULLIF((v_intent ->> v_key), '')::numeric;
    v_observed_v := NULLIF((v_observed ->> v_key), '')::numeric;

    -- Skip components not present on either side.
    IF v_intent_v IS NULL AND v_observed_v IS NULL THEN
      CONTINUE;
    END IF;

    v_delta := COALESCE(v_observed_v, 0) - COALESCE(v_intent_v, 0);

    IF abs(v_delta) > v_tol THEN
      v_drift_count := v_drift_count + 1;
    END IF;

    v_items := v_items || jsonb_build_object(
      'component', v_key,
      'intent', v_intent_v,
      'observed', v_observed_v,
      'delta', v_delta,
      'drift', abs(v_delta) > v_tol
    );
  END LOOP;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_drift_count = 0 THEN 'in_sync' ELSE 'drift' END,
    'assignment_id', v_row.id,
    'template_name', v_row.template_name,
    'annual_ctc', v_row.annual_ctc,
    'pushed_at', v_row.pushed_at,
    'observed_source', v_observed ->> 'source',
    'observed_period', v_observed ->> 'period_month',
    'observed_at', v_observed ->> 'observed_at',
    'drift_count', v_drift_count,
    'items', v_items
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_compute_salary_structure_drift(uuid) TO authenticated, service_role;


-- Trigger: whenever a payslip mirror row is inserted/updated (either by
-- RazorpayX proxy pull or by CSV register import), refresh the observed
-- breakdown on the latest assignment for that employee.
CREATE OR REPLACE FUNCTION public.hr_tg_refresh_observed_salary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.hr_employee_id IS NOT NULL THEN
    PERFORM public.hr_pull_observed_salary(NEW.hr_employee_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_refresh_observed_salary ON public.hr_razorpay_payslip_records;
CREATE TRIGGER trg_hr_refresh_observed_salary
AFTER INSERT OR UPDATE ON public.hr_razorpay_payslip_records
FOR EACH ROW EXECUTE FUNCTION public.hr_tg_refresh_observed_salary();
