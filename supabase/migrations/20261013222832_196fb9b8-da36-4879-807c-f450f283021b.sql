DO $mig$
DECLARE d text; o text;
BEGIN
  -- 2a: pending "adds headcount" requests cover nothing on the line
  d := pg_get_functiondef('public.hr_wf_line_base()'::regprocedure); o := d;
  d := replace(d, $$  FROM public.hr_hiring_requirements hr
  LEFT JOIN rp ON rp.requirement_id = hr.id
  WHERE hr.staffing_plan_id IS NOT NULL$$, $$  FROM public.hr_hiring_requirements hr
  LEFT JOIN rp ON rp.requirement_id = hr.id
  WHERE hr.staffing_plan_id IS NOT NULL
    AND NOT (hr.status = 'pending_approval' AND coalesce(hr.adds_headcount, 0) > 0)$$);
  IF d = o THEN RAISE EXCEPTION 'line_base patch did not apply'; END IF;
  EXECUTE d;

  -- 3b: reconcile takes the numbering lock before its own (numbering -> reconcile everywhere)
  d := pg_get_functiondef('public.hr_reconcile_capacity_hiring(boolean)'::regprocedure); o := d;
  d := replace(d, $$  PERFORM pg_advisory_xact_lock(hashtext('hr_reconcile_capacity_hiring'));$$,
    $$  -- Lock order: numbering first, then reconcile — the same order a requirement insert follows (number on insert, reconcile at commit).
  PERFORM pg_advisory_xact_lock(hashtext('hr_next_hiring_requirement_no'));
  PERFORM pg_advisory_xact_lock(hashtext('hr_reconcile_capacity_hiring'));$$);
  IF d = o THEN RAISE EXCEPTION 'reconcile patch did not apply'; END IF;
  EXECUTE d;

  -- 2b/2c: approval keeps the pause; cancelling an approved +N lowers the line by the unfilled part
  d := pg_get_functiondef('public.hr_requirement_transition(uuid,text,text)'::regprocedure); o := d;
  d := replace(d, $$  v_line text; v_other text; v_plan record;$$, $$  v_line text; v_other text; v_plan record; v_sig text; v_drop int;$$);
  d := replace(d, $$        UPDATE public.hr_headcount_plans
           SET required_hc = required_hc + r.adds_headcount,
               approved_hc = greatest(approved_hc, required_hc + r.adds_headcount)
         WHERE id = r.staffing_plan_id;$$, $$        v_sig := public.hr_wf_line_signature(r.staffing_plan_id);
        UPDATE public.hr_headcount_plans
           SET required_hc = required_hc + r.adds_headcount,
               approved_hc = greatest(approved_hc, required_hc + r.adds_headcount)
         WHERE id = r.staffing_plan_id;
        -- Raising the line must not clear a pause HR set on the existing need: re-sign it.
        UPDATE public.hr_headcount_plans SET auto_paused_signature = public.hr_wf_line_signature(id)
         WHERE id = r.staffing_plan_id AND auto_paused_at IS NOT NULL AND auto_paused_signature IS NOT DISTINCT FROM v_sig;$$);
  d := replace(d, $$      v_new := 'cancelled';
      UPDATE public.hr_hiring_requirements SET status = v_new, rejection_reason = NULL,
        notes = concat_ws(E'\n', nullif(notes,''), public.hr_wf_note_line('Cancelled', v_uid, v_reason)) WHERE id = p_id;$$,
   $$      v_new := 'cancelled';
      UPDATE public.hr_hiring_requirements SET status = v_new, rejection_reason = NULL,
        notes = concat_ws(E'\n', nullif(notes,''), public.hr_wf_note_line('Cancelled', v_uid, v_reason)) WHERE id = p_id;
      -- An approved "adds headcount" request raised the line; cancelling it takes back the part not yet filled.
      IF coalesce(r.adds_headcount, 0) > 0 AND r.status IN ('approved','recruitment_active','partially_fulfilled') AND r.staffing_plan_id IS NOT NULL THEN
        v_drop := least(r.adds_headcount, greatest(r.number_required - r.positions_filled, 0));
        IF v_drop > 0 THEN
          PERFORM set_config('hr.wf_change_reason', format('Cancelled %s: takes back %s unfilled added headcount — %s', r.requirement_no, v_drop, v_reason), true);
          v_sig := public.hr_wf_line_signature(r.staffing_plan_id);
          UPDATE public.hr_headcount_plans SET required_hc = greatest(required_hc - v_drop, 0)
           WHERE id = r.staffing_plan_id AND NOT follow_desks;
          UPDATE public.hr_headcount_plans SET auto_paused_signature = public.hr_wf_line_signature(id)
           WHERE id = r.staffing_plan_id AND auto_paused_at IS NOT NULL AND auto_paused_signature IS NOT DISTINCT FROM v_sig;
        END IF;
      END IF;$$);
  IF (length(d) - length(o)) < 900 THEN RAISE EXCEPTION 'transition patch did not fully apply'; END IF;
  EXECUTE d;
END $mig$;

-- 3a: overlap check (and its lock) only when overlap-relevant fields change
DROP TRIGGER IF EXISTS trg_hr_headcount_plan_no_overlap ON public.hr_headcount_plans;
CREATE CONSTRAINT TRIGGER trg_hr_headcount_plan_no_overlap
  AFTER INSERT ON public.hr_headcount_plans DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW.is_active) EXECUTE FUNCTION public.hr_wf_validate_line_overlap();
CREATE CONSTRAINT TRIGGER trg_hr_headcount_plan_no_overlap_upd
  AFTER UPDATE ON public.hr_headcount_plans DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW.is_active AND (
       NOT OLD.is_active
    OR OLD.department_id IS DISTINCT FROM NEW.department_id
    OR OLD.position_id IS DISTINCT FROM NEW.position_id
    OR OLD.eligible_position_ids IS DISTINCT FROM NEW.eligible_position_ids
    OR OLD.shift_id IS DISTINCT FROM NEW.shift_id
    OR OLD.eligible_shift_ids IS DISTINCT FROM NEW.eligible_shift_ids))
  EXECUTE FUNCTION public.hr_wf_validate_line_overlap();