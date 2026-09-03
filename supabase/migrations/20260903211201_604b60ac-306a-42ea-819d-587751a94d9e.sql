-- 1. Provisional marker on both payroll input tables
ALTER TABLE public.hr_payroll_input_additions
  ADD COLUMN IF NOT EXISTS provisional boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz;

ALTER TABLE public.hr_payroll_input_deductions
  ADD COLUMN IF NOT EXISTS provisional boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz;

COMMENT ON COLUMN public.hr_payroll_input_additions.provisional IS
  'TRUE = staged from an APPLIED-but-not-yet-pushed CTC revision. Visible for review, never pushed to RazorpayX until finalised.';
COMMENT ON COLUMN public.hr_payroll_input_deductions.provisional IS
  'TRUE = staged from an APPLIED-but-not-yet-pushed CTC revision. Visible for review, never pushed to RazorpayX until finalised.';

-- 2. Compliant, payslip-ready labels for part-month CTC transitions
CREATE OR REPLACE FUNCTION public.hr_ctc_adjustment_label(
  p_kind text, p_is_training boolean, p_effective date
) RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN p_kind = 'deduction' THEN 'Salary Recovery' ELSE 'Salary Arrears' END
      || ' - Part-Month '
      || CASE WHEN p_is_training THEN 'Post-Training CTC Revision' ELSE 'CTC Revision' END
      || ' (w.e.f. ' || to_char(p_effective, 'DD Mon YYYY') || ')';
$$;

-- 3. Staging: idempotent upsert that can run provisionally (on apply) or
--    finally (after a verified RazorpayX CTC push).
CREATE OR REPLACE FUNCTION public.hr_stage_ctc_transition_adjustment(
  p_revision_id uuid,
  p_provisional boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  calc jsonb; v_kind text; v_amount numeric; v_period date; v_emp uuid; v_rp text; v_label text;
  v_reason text; v_source text; v_training boolean; v_eff date; v_existing_pushed timestamptz;
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

  -- Nothing owed (e.g. effective on the 1st) -> clear any stale provisional row.
  IF v_kind = 'none' THEN
    DELETE FROM public.hr_payroll_input_deductions
      WHERE source_revision_id = p_revision_id AND pushed_at IS NULL AND provisional;
    DELETE FROM public.hr_payroll_input_additions
      WHERE source_revision_id = p_revision_id AND pushed_at IS NULL AND provisional;
    RETURN calc || jsonb_build_object('staged', false, 'provisional', p_provisional);
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

  -- The sign can flip between provisional and final (LOP changes); drop the
  -- opposite-side row when it is still unpushed so we never double-count.
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
            p_revision_id, p_provisional, CASE WHEN p_provisional THEN NULL ELSE now() END)
    ON CONFLICT (hr_employee_id, period_month, source_revision_id)
      WHERE source_revision_id IS NOT NULL
    DO UPDATE SET
      amount = EXCLUDED.amount,
      label = EXCLUDED.label,
      period_month = EXCLUDED.period_month,
      provisional = CASE WHEN p_provisional THEN public.hr_payroll_input_deductions.provisional ELSE false END,
      finalized_at = CASE WHEN p_provisional THEN public.hr_payroll_input_deductions.finalized_at ELSE now() END,
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
            p_revision_id, p_provisional, CASE WHEN p_provisional THEN NULL ELSE now() END)
    ON CONFLICT (hr_employee_id, period_month, source_revision_id)
      WHERE source_revision_id IS NOT NULL
    DO UPDATE SET
      amount = EXCLUDED.amount,
      label = EXCLUDED.label,
      period_month = EXCLUDED.period_month,
      provisional = CASE WHEN p_provisional THEN public.hr_payroll_input_additions.provisional ELSE false END,
      finalized_at = CASE WHEN p_provisional THEN public.hr_payroll_input_additions.finalized_at ELSE now() END,
      updated_at = now()
    WHERE public.hr_payroll_input_additions.pushed_at IS NULL;
  END IF;

  RETURN calc || jsonb_build_object(
    'staged', true, 'label', v_label, 'source', v_source, 'provisional', p_provisional);
END;
$function$;

-- 4. Promotion helper used right after a verified RazorpayX CTC push.
CREATE OR REPLACE FUNCTION public.hr_finalize_ctc_transition_adjustment(p_revision_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.hr_stage_ctc_transition_adjustment(p_revision_id, false);
$$;

-- 5. Stage provisionally the moment a CTC revision reaches APPLIED.
CREATE OR REPLACE FUNCTION public.hr_tg_stage_ctc_adjustment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status <> 'APPLIED' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.revision_type,'') IN ('payroll_addition','payroll_deduction') THEN RETURN NEW; END IF;
  IF COALESCE(NEW.one_time_amount, 0) <> 0 THEN RETURN NEW; END IF;
  IF COALESCE(NEW.previous_total,0) <= 0 OR NEW.new_total IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.previous_total,0) = COALESCE(NEW.new_total,0) THEN RETURN NEW; END IF;
  IF NEW.razorpay_pushed_at IS NOT NULL THEN RETURN NEW; END IF;
  -- Effective on the 1st -> the whole month is already at the new CTC.
  IF EXTRACT(DAY FROM NEW.effective_from)::int = 1 THEN RETURN NEW; END IF;

  BEGIN
    PERFORM public.hr_stage_ctc_transition_adjustment(NEW.id, true);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'provisional CTC adjustment staging failed for revision %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_stage_ctc_adjustment_ins ON public.hr_salary_revisions;
CREATE TRIGGER trg_stage_ctc_adjustment_ins
AFTER INSERT ON public.hr_salary_revisions
FOR EACH ROW EXECUTE FUNCTION public.hr_tg_stage_ctc_adjustment();

DROP TRIGGER IF EXISTS trg_stage_ctc_adjustment_upd ON public.hr_salary_revisions;
CREATE TRIGGER trg_stage_ctc_adjustment_upd
AFTER UPDATE OF status ON public.hr_salary_revisions
FOR EACH ROW WHEN (NEW.status = 'APPLIED' AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.hr_tg_stage_ctc_adjustment();

GRANT EXECUTE ON FUNCTION public.hr_ctc_adjustment_label(text, boolean, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_finalize_ctc_transition_adjustment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_stage_ctc_transition_adjustment(uuid, boolean) TO authenticated;