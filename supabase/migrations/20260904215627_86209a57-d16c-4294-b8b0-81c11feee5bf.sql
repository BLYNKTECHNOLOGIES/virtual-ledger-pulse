CREATE OR REPLACE FUNCTION public.hr_ctc_revision_is_live(p_revision_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.hr_salary_revisions sr
    LEFT JOIN public.hr_razorpay_employee_map em ON em.hr_employee_id = sr.employee_id
    LEFT JOIN public.hr_employees e ON e.id = sr.employee_id
    WHERE sr.id = p_revision_id
      AND sr.new_total IS NOT NULL
      AND (
        sr.razorpay_pushed_at IS NOT NULL
        OR sr.razorpay_verified_at IS NOT NULL
        OR round(COALESCE((em.last_pull_snapshot->'__salary'->>'annual_ctc')::numeric, -1))
             = round(sr.new_total)
        OR round(COALESCE(e.total_salary, -1)) = round(sr.new_total)
      )
  );
$function$;

GRANT EXECUTE ON FUNCTION public.hr_ctc_revision_is_live(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hr_stage_ctc_transition_adjustment(p_revision_id uuid, p_provisional boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  calc jsonb; v_kind text; v_amount numeric; v_period date; v_emp uuid; v_rp text; v_label text;
  v_reason text; v_source text; v_training boolean; v_eff date; v_existing_pushed timestamptz;
  v_prov boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.hr_is_hr_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised to stage payroll corrections';
  END IF;

  calc := public.hr_training_ctc_adjustment(p_revision_id);
  IF NOT COALESCE((calc->>'ok')::boolean, false) THEN RETURN calc; END IF;
  v_kind := calc->>'kind';

  SELECT sr.revision_reason, sr.effective_from INTO v_reason, v_eff
  FROM public.hr_salary_revisions sr WHERE sr.id = p_revision_id;
  v_training := (v_reason = 'training_completion');
  v_source := CASE WHEN v_training THEN 'training_ctc_adjustment' ELSE 'ctc_transition_adjustment' END;

  -- Provisional only while the new CTC is NOT yet live in RazorpayX. A CTC that
  -- was adopted/pulled (never pushed from HRMS) is just as live as a pushed one.
  v_prov := p_provisional AND NOT public.hr_ctc_revision_is_live(p_revision_id);

  IF v_kind = 'none' THEN
    DELETE FROM public.hr_payroll_input_deductions
      WHERE source_revision_id = p_revision_id AND pushed_at IS NULL AND provisional;
    DELETE FROM public.hr_payroll_input_additions
      WHERE source_revision_id = p_revision_id AND pushed_at IS NULL AND provisional;
    RETURN calc || jsonb_build_object('staged', false, 'provisional', v_prov);
  END IF;

  v_amount := (calc->>'amount')::numeric;
  v_period := (calc->>'period_month')::date;
  v_emp := (calc->>'employee_id')::uuid;
  v_label := public.hr_ctc_adjustment_label(v_kind, v_training, v_eff);

  SELECT em.razorpay_employee_id INTO v_rp
  FROM public.hr_razorpay_employee_map em WHERE em.hr_employee_id = v_emp LIMIT 1;

  IF v_rp IS NULL THEN
    RETURN calc || jsonb_build_object(
      'staged', false,
      'error', 'Employee is not mapped to RazorpayX - the mid-month correction could not be staged.');
  END IF;

  IF v_kind = 'deduction' THEN
    DELETE FROM public.hr_payroll_input_additions
      WHERE source_revision_id = p_revision_id AND pushed_at IS NULL;
  ELSE
    DELETE FROM public.hr_payroll_input_deductions
      WHERE source_revision_id = p_revision_id AND pushed_at IS NULL;
  END IF;

  IF v_kind = 'deduction' THEN
    SELECT pushed_at INTO v_existing_pushed FROM public.hr_payroll_input_deductions
      WHERE source_revision_id = p_revision_id LIMIT 1;
    IF v_existing_pushed IS NOT NULL THEN
      RETURN calc || jsonb_build_object('staged', false, 'already_pushed', true);
    END IF;

    INSERT INTO public.hr_payroll_input_deductions
      (hr_employee_id, razorpay_employee_id, period_month, label, amount, source,
       source_revision_id, provisional, finalized_at)
    VALUES (v_emp, v_rp, v_period, v_label, v_amount, v_source,
            p_revision_id, v_prov, CASE WHEN v_prov THEN NULL ELSE now() END)
    ON CONFLICT (hr_employee_id, period_month, source_revision_id)
      WHERE source_revision_id IS NOT NULL
    DO UPDATE SET
      amount = EXCLUDED.amount,
      label = EXCLUDED.label,
      period_month = EXCLUDED.period_month,
      provisional = CASE WHEN v_prov THEN public.hr_payroll_input_deductions.provisional ELSE false END,
      finalized_at = CASE WHEN v_prov THEN public.hr_payroll_input_deductions.finalized_at ELSE now() END,
      updated_at = now()
    WHERE public.hr_payroll_input_deductions.pushed_at IS NULL;
  ELSE
    SELECT pushed_at INTO v_existing_pushed FROM public.hr_payroll_input_additions
      WHERE source_revision_id = p_revision_id LIMIT 1;
    IF v_existing_pushed IS NOT NULL THEN
      RETURN calc || jsonb_build_object('staged', false, 'already_pushed', true);
    END IF;

    INSERT INTO public.hr_payroll_input_additions
      (hr_employee_id, razorpay_employee_id, period_month, label, amount, addition_type, taxable,
       source, source_revision_id, provisional, finalized_at)
    VALUES (v_emp, v_rp, v_period, v_label, v_amount, 1, true, v_source,
            p_revision_id, v_prov, CASE WHEN v_prov THEN NULL ELSE now() END)
    ON CONFLICT (hr_employee_id, period_month, source_revision_id)
      WHERE source_revision_id IS NOT NULL
    DO UPDATE SET
      amount = EXCLUDED.amount,
      label = EXCLUDED.label,
      period_month = EXCLUDED.period_month,
      provisional = CASE WHEN v_prov THEN public.hr_payroll_input_additions.provisional ELSE false END,
      finalized_at = CASE WHEN v_prov THEN public.hr_payroll_input_additions.finalized_at ELSE now() END,
      updated_at = now()
    WHERE public.hr_payroll_input_additions.pushed_at IS NULL;
  END IF;

  RETURN calc || jsonb_build_object(
    'staged', true, 'label', v_label, 'source', v_source, 'provisional', v_prov);
END;
$function$;

-- Re-evaluate currently staged, unpushed provisional lines under the new rule.
UPDATE public.hr_payroll_input_deductions d
   SET provisional = false, finalized_at = now(), updated_at = now()
 WHERE d.pushed_at IS NULL AND d.provisional
   AND d.source IN ('training_ctc_adjustment','ctc_transition_adjustment')
   AND d.source_revision_id IS NOT NULL
   AND public.hr_ctc_revision_is_live(d.source_revision_id);

UPDATE public.hr_payroll_input_additions a
   SET provisional = false, finalized_at = now(), updated_at = now()
 WHERE a.pushed_at IS NULL AND a.provisional
   AND a.source IN ('training_ctc_adjustment','ctc_transition_adjustment')
   AND a.source_revision_id IS NOT NULL
   AND public.hr_ctc_revision_is_live(a.source_revision_id);