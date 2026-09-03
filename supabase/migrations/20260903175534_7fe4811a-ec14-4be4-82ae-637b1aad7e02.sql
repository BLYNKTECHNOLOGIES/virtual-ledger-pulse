-- 1. Neutral-named calculator (delegates to the existing, unchanged math)
CREATE OR REPLACE FUNCTION public.hr_ctc_transition_adjustment(p_revision_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.hr_training_ctc_adjustment(p_revision_id);
$function$;

GRANT EXECUTE ON FUNCTION public.hr_ctc_transition_adjustment(uuid) TO authenticated, service_role;

-- 2. Neutral staging routine, usable for every CTC revision
CREATE OR REPLACE FUNCTION public.hr_stage_ctc_transition_adjustment(p_revision_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  calc jsonb; v_kind text; v_amount numeric; v_period date; v_emp uuid; v_rp text; v_label text;
  v_reason text; v_source text;
BEGIN
  calc := public.hr_training_ctc_adjustment(p_revision_id);
  IF NOT COALESCE((calc->>'ok')::boolean, false) THEN RETURN calc; END IF;
  v_kind := calc->>'kind';
  IF v_kind = 'none' THEN RETURN calc || jsonb_build_object('staged', false); END IF;

  v_amount := (calc->>'amount')::numeric;
  v_period := (calc->>'period_month')::date;
  v_emp := (calc->>'employee_id')::uuid;

  SELECT sr.revision_reason INTO v_reason
  FROM public.hr_salary_revisions sr WHERE sr.id = p_revision_id;

  IF v_reason = 'training_completion' THEN
    v_source := 'training_ctc_adjustment';
    v_label := format('Training CTC adjustment (eff %s)', calc->'derivation'->>'effective_from');
  ELSE
    v_source := 'ctc_transition_adjustment';
    v_label := format('CTC change adjustment (eff %s)', calc->'derivation'->>'effective_from');
  END IF;

  SELECT em.razorpay_employee_id INTO v_rp
  FROM public.hr_razorpay_employee_map em WHERE em.hr_employee_id = v_emp LIMIT 1;

  IF v_rp IS NULL THEN
    RETURN calc || jsonb_build_object(
      'staged', false,
      'error', 'Employee is not mapped to RazorpayX — the mid-month correction could not be staged.');
  END IF;

  IF v_kind = 'deduction' THEN
    INSERT INTO public.hr_payroll_input_deductions
      (hr_employee_id, razorpay_employee_id, period_month, label, amount, source, source_revision_id)
    VALUES (v_emp, v_rp, v_period, v_label, v_amount, v_source, p_revision_id)
    ON CONFLICT (hr_employee_id, period_month, source_revision_id) DO NOTHING;
  ELSE
    INSERT INTO public.hr_payroll_input_additions
      (hr_employee_id, razorpay_employee_id, period_month, label, amount, addition_type, taxable, source, source_revision_id)
    VALUES (v_emp, v_rp, v_period, v_label, v_amount, 1, true, v_source, p_revision_id)
    ON CONFLICT (hr_employee_id, period_month, source_revision_id) DO NOTHING;
  END IF;

  RETURN calc || jsonb_build_object('staged', true, 'label', v_label, 'source', v_source);
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_stage_ctc_transition_adjustment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_stage_ctc_transition_adjustment(uuid) TO authenticated, service_role;

-- keep the old staging name working, now routed through the neutral one
CREATE OR REPLACE FUNCTION public.hr_stage_training_ctc_adjustment(p_revision_id uuid)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.hr_stage_ctc_transition_adjustment(p_revision_id);
$function$;

REVOKE ALL ON FUNCTION public.hr_stage_training_ctc_adjustment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_stage_training_ctc_adjustment(uuid) TO service_role;

-- 3. Remove un-pushed staged corrections when a revision is cancelled or deleted
CREATE OR REPLACE FUNCTION public.hr_cleanup_ctc_transition_adjustment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_id := OLD.id;
  ELSIF NEW.status = 'CANCELLED' AND COALESCE(OLD.status, '') <> 'CANCELLED' THEN
    v_id := NEW.id;
  ELSE
    RETURN NEW;
  END IF;

  DELETE FROM public.hr_payroll_input_deductions
  WHERE source_revision_id = v_id
    AND source IN ('training_ctc_adjustment', 'ctc_transition_adjustment')
    AND pushed_at IS NULL;

  DELETE FROM public.hr_payroll_input_additions
  WHERE source_revision_id = v_id
    AND source IN ('training_ctc_adjustment', 'ctc_transition_adjustment')
    AND pushed_at IS NULL;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_hr_cleanup_ctc_transition_adjustment_del ON public.hr_salary_revisions;
CREATE TRIGGER trg_hr_cleanup_ctc_transition_adjustment_del
BEFORE DELETE ON public.hr_salary_revisions
FOR EACH ROW EXECUTE FUNCTION public.hr_cleanup_ctc_transition_adjustment();

DROP TRIGGER IF EXISTS trg_hr_cleanup_ctc_transition_adjustment_upd ON public.hr_salary_revisions;
CREATE TRIGGER trg_hr_cleanup_ctc_transition_adjustment_upd
AFTER UPDATE OF status ON public.hr_salary_revisions
FOR EACH ROW EXECUTE FUNCTION public.hr_cleanup_ctc_transition_adjustment();