CREATE TABLE IF NOT EXISTS public.hr_salary_revision_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL,
  employee_id uuid,
  revision_type text,
  status text,
  one_time_amount numeric,
  payout_month date,
  effective_from date,
  revision_reason text,
  payroll_input_id uuid,
  payroll_input_kind text,
  razorpay_pushed_at timestamptz,
  razorpay_reversal_required boolean NOT NULL DEFAULT false,
  payroll_input_removed boolean NOT NULL DEFAULT false,
  snapshot jsonb NOT NULL,
  deleted_by uuid,
  delete_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.hr_salary_revision_deletions TO authenticated;
GRANT ALL ON public.hr_salary_revision_deletions TO service_role;

ALTER TABLE public.hr_salary_revision_deletions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR can view salary revision deletions"
ON public.hr_salary_revision_deletions
FOR SELECT
TO authenticated
USING (
  public.user_has_permission(auth.uid(), 'hrms_view'::app_permission)
  OR public.user_has_permission(auth.uid(), 'hrms_manage'::app_permission)
);

CREATE INDEX IF NOT EXISTS idx_hr_salary_revision_deletions_emp
  ON public.hr_salary_revision_deletions (employee_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.hr_delete_salary_revision(
  p_revision_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.hr_salary_revisions%ROWTYPE;
  v_input_pushed_at timestamptz := NULL;
  v_input_removed boolean := false;
  v_reversal boolean := false;
  v_month_processed boolean := false;
  v_is_one_time boolean;
  v_is_payroll_input boolean;
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

  -- Applied CTC / statutory changes already mutated the salary structure and
  -- were pushed as an annual CTC to RazorpayX. Deleting the row would leave the
  -- structure silently orphaned, so force a corrective revision instead.
  IF r.status = 'APPLIED' AND NOT v_is_payroll_input AND NOT v_is_one_time THEN
    RAISE EXCEPTION 'Applied CTC/statutory revisions cannot be deleted — raise a corrective revision instead.';
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

  v_reversal := (r.razorpay_pushed_at IS NOT NULL) OR (v_input_pushed_at IS NOT NULL);

  INSERT INTO public.hr_salary_revision_deletions (
    revision_id, employee_id, revision_type, status, one_time_amount, payout_month,
    effective_from, revision_reason, payroll_input_id, payroll_input_kind,
    razorpay_pushed_at, razorpay_reversal_required, payroll_input_removed,
    snapshot, deleted_by, delete_reason
  ) VALUES (
    r.id, r.employee_id, r.revision_type, r.status, r.one_time_amount, r.payout_month,
    r.effective_from, r.revision_reason, r.payroll_input_id, r.payroll_input_kind,
    COALESCE(r.razorpay_pushed_at, v_input_pushed_at), v_reversal, v_input_removed,
    to_jsonb(r), auth.uid(), NULLIF(btrim(COALESCE(p_reason, '')), '')
  );

  DELETE FROM public.hr_salary_revisions WHERE id = r.id;

  RETURN jsonb_build_object(
    'deleted', true,
    'payroll_input_removed', v_input_removed,
    'razorpay_reversal_required', v_reversal,
    'razorpay_pushed_at', COALESCE(r.razorpay_pushed_at, v_input_pushed_at),
    'payout_month', r.payout_month
  );
END;
$$;

REVOKE ALL ON FUNCTION public.hr_delete_salary_revision(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hr_delete_salary_revision(uuid, text) TO authenticated;