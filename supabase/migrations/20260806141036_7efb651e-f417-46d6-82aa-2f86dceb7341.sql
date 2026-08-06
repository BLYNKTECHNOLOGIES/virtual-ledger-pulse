CREATE OR REPLACE FUNCTION public.hr_delete_salary_revision(p_revision_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.hr_salary_revisions%ROWTYPE;
  v_input_pushed_at timestamptz := NULL;
  v_input_removed boolean := false;
  v_reversal boolean := false;
  v_month_processed boolean := false;
  v_is_one_time boolean;
  v_is_payroll_input boolean;
  v_is_ctc boolean;
  v_ctc_pushed boolean := false;
  v_is_latest boolean := true;
  v_ctc_rolled_back boolean := false;
  v_snapshot jsonb;
BEGIN
  IF NOT (
    public.user_has_permission(auth.uid(), 'hrms_manage'::app_permission)
    OR public.user_has_permission(auth.uid(), 'MANAGE_HRMS'::app_permission)
  ) THEN
    RAISE EXCEPTION 'Not authorised to delete salary revision entries';
  END IF;

  SELECT * INTO r FROM public.hr_salary_revisions WHERE id = p_revision_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Revision not found';
  END IF;

  v_is_payroll_input := r.revision_type IN ('payroll_addition','payroll_deduction');
  v_is_one_time := r.revision_type IN (
    'bonus','performance_incentive','retention_bonus','special_allowance','ad_hoc','one_time_correction'
  ) OR COALESCE(r.one_time_amount, 0) > 0;
  v_is_ctc := (r.status = 'APPLIED') AND NOT v_is_payroll_input AND NOT v_is_one_time;

  -- Applied CTC / statutory changes already mutated the salary structure. They
  -- may only be deleted when nothing was ever pushed to RazorpayX AND this is
  -- the employee's latest CTC revision; the structure is then rolled back.
  IF v_is_ctc THEN
    IF r.razorpay_pushed_at IS NOT NULL OR r.razorpay_verified_at IS NOT NULL THEN
      v_ctc_pushed := true;
    ELSE
      SELECT EXISTS (
        SELECT 1
        FROM public.hr_razorpay_pushback_log l
        WHERE l.hr_employee_id = r.employee_id
          AND l.status = 'success'
          AND jsonb_typeof(COALESCE(l.response_snapshot->'verify', l.response_snapshot)->'fields') = 'array'
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(l.response_snapshot->'verify', l.response_snapshot)->'fields') f
            WHERE f->>'key' = 'annual_ctc'
              AND (f->>'match')::boolean IS TRUE
              AND (
                ABS(COALESCE(NULLIF(f->>'actual','')::numeric, NULLIF(f->>'expected','')::numeric, -1)
                    - COALESCE(r.new_total, 0)) <= 1
              )
          )
      ) INTO v_ctc_pushed;
    END IF;

    IF v_ctc_pushed THEN
      RAISE EXCEPTION 'This revision was already pushed to RazorpayX — raise a corrective revision instead.';
    END IF;

    SELECT NOT EXISTS (
      SELECT 1 FROM public.hr_salary_revisions x
      WHERE x.employee_id = r.employee_id
        AND x.id <> r.id
        AND x.status = 'APPLIED'
        AND x.revision_type NOT IN ('payroll_addition','payroll_deduction')
        AND COALESCE(x.one_time_amount, 0) = 0
        AND x.created_at > r.created_at
    ) INTO v_is_latest;

    IF NOT v_is_latest THEN
      RAISE EXCEPTION 'A newer salary revision exists for this employee — delete it first or raise a corrective revision.';
    END IF;
  END IF;

  -- Never let a deletion rewrite a payroll month that is already closed.
  IF r.register_confirmed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This entry is already confirmed against an imported salary register — it cannot be deleted.';
  END IF;

  IF COALESCE(r.payout_month, r.effective_from) IS NOT NULL THEN
    SELECT (m.processed_on IS NOT NULL) INTO v_month_processed
    FROM public.hr_payroll_month_meta m
    WHERE m.period_month = date_trunc('month', COALESCE(r.payout_month, r.effective_from))::date;
    IF COALESCE(v_month_processed, false) THEN
      RAISE EXCEPTION 'Payroll for that month is already processed — this entry cannot be deleted.';
    END IF;
  END IF;

  -- Drop the staged payroll input so the payroll engine stops seeing it.
  IF r.payroll_input_id IS NOT NULL AND r.payroll_input_kind = 'addition' THEN
    SELECT pushed_at INTO v_input_pushed_at
    FROM public.hr_payroll_input_additions WHERE id = r.payroll_input_id;
    DELETE FROM public.hr_payroll_input_additions WHERE id = r.payroll_input_id;
    v_input_removed := FOUND;
  ELSIF r.payroll_input_id IS NOT NULL AND r.payroll_input_kind = 'deduction' THEN
    SELECT pushed_at INTO v_input_pushed_at
    FROM public.hr_payroll_input_deductions WHERE id = r.payroll_input_id;
    DELETE FROM public.hr_payroll_input_deductions WHERE id = r.payroll_input_id;
    v_input_removed := FOUND;
  END IF;

  -- Roll the salary structure back to the pre-revision total.
  IF v_is_ctc AND COALESCE(r.previous_total, 0) > 0 THEN
    PERFORM public._rescale_employee_salary_structure(r.employee_id, r.previous_total);
    v_ctc_rolled_back := true;
  END IF;

  v_reversal := (r.razorpay_pushed_at IS NOT NULL) OR (v_input_pushed_at IS NOT NULL);

  v_snapshot := to_jsonb(r) || jsonb_build_object(
    'ctc_rollback', v_ctc_rolled_back,
    'rolled_back_to_total', CASE WHEN v_ctc_rolled_back THEN r.previous_total ELSE NULL END
  );

  INSERT INTO public.hr_salary_revision_deletions (
    revision_id, employee_id, revision_type, status, one_time_amount, payout_month,
    effective_from, revision_reason, payroll_input_id, payroll_input_kind,
    razorpay_pushed_at, razorpay_reversal_required, payroll_input_removed,
    snapshot, deleted_by, delete_reason
  ) VALUES (
    r.id, r.employee_id, r.revision_type, r.status, r.one_time_amount, r.payout_month,
    r.effective_from, r.revision_reason, r.payroll_input_id, r.payroll_input_kind,
    COALESCE(r.razorpay_pushed_at, v_input_pushed_at), v_reversal, v_input_removed,
    v_snapshot, auth.uid(), NULLIF(btrim(COALESCE(p_reason, '')), '')
  );

  DELETE FROM public.hr_salary_revisions WHERE id = r.id;

  RETURN jsonb_build_object(
    'deleted', true,
    'payroll_input_removed', v_input_removed,
    'razorpay_reversal_required', v_reversal,
    'razorpay_pushed_at', COALESCE(r.razorpay_pushed_at, v_input_pushed_at),
    'payout_month', r.payout_month,
    'ctc_rolled_back', v_ctc_rolled_back,
    'rolled_back_to_total', CASE WHEN v_ctc_rolled_back THEN r.previous_total ELSE NULL END
  );
END;
$function$;