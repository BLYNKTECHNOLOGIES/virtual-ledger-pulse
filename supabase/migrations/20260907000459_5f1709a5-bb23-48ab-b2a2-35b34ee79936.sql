-- Scheduled (future-dated) CTC changes must behave exactly like the training
-- CTC transition: stage the day-weighted part-month correction as soon as the
-- revision exists, so the payroll cockpit shows it and LOP is computed on the
-- blended base. Previously only APPLIED revisions staged anything.
CREATE OR REPLACE FUNCTION public.hr_tg_stage_ctc_adjustment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(NEW.status,'') NOT IN ('APPLIED','SCHEDULED') THEN RETURN NEW; END IF;
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

-- Restage when the schedule itself is edited (date or amounts change).
DROP TRIGGER IF EXISTS trg_stage_ctc_adjustment_edit ON public.hr_salary_revisions;
CREATE TRIGGER trg_stage_ctc_adjustment_edit
AFTER UPDATE OF effective_from, new_total, previous_total ON public.hr_salary_revisions
FOR EACH ROW
WHEN (
  NEW.effective_from IS DISTINCT FROM OLD.effective_from
  OR NEW.new_total IS DISTINCT FROM OLD.new_total
  OR NEW.previous_total IS DISTINCT FROM OLD.previous_total
)
EXECUTE FUNCTION public.hr_tg_stage_ctc_adjustment();

-- Refresh every part-month CTC correction that belongs to a payroll month.
CREATE OR REPLACE FUNCTION public.hr_stage_due_ctc_transition_adjustments(p_month date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  r record;
  out_rows jsonb := '[]'::jsonb;
  res jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.hr_is_hr_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised to stage payroll corrections';
  END IF;

  FOR r IN
    SELECT sr.id
      FROM public.hr_salary_revisions sr
     WHERE sr.status IN ('APPLIED','SCHEDULED')
       AND COALESCE(sr.revision_type,'') NOT IN ('payroll_addition','payroll_deduction')
       AND COALESCE(sr.one_time_amount,0) = 0
       AND COALESCE(sr.previous_total,0) > 0
       AND sr.new_total IS NOT NULL
       AND COALESCE(sr.previous_total,0) <> COALESCE(sr.new_total,0)
       AND sr.effective_from BETWEEN v_start AND v_end
       AND EXTRACT(DAY FROM sr.effective_from)::int > 1
     ORDER BY sr.effective_from
  LOOP
    BEGIN
      res := public.hr_stage_ctc_transition_adjustment(r.id, true);
    EXCEPTION WHEN OTHERS THEN
      res := jsonb_build_object('ok', false, 'revision_id', r.id, 'error', SQLERRM);
    END;
    out_rows := out_rows || jsonb_build_array(COALESCE(res, '{}'::jsonb));
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'period_month', v_start, 'results', out_rows);
END;
$function$;

REVOKE ALL ON FUNCTION public.hr_stage_due_ctc_transition_adjustments(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_stage_due_ctc_transition_adjustments(date) TO authenticated, service_role;