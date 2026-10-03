CREATE TABLE public.hr_recovery_waivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_kind text NOT NULL CHECK (source_kind IN ('ctc_revision')),
  ref_id uuid NOT NULL,
  reason text NOT NULL,
  waived_by uuid,
  waived_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_kind, ref_id)
);
GRANT SELECT ON public.hr_recovery_waivers TO authenticated;
GRANT ALL ON public.hr_recovery_waivers TO service_role;
ALTER TABLE public.hr_recovery_waivers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "HR staff read recovery waivers" ON public.hr_recovery_waivers
  FOR SELECT TO authenticated USING (public.hr_is_hr_staff(auth.uid()));

-- Block re-creation of a cancelled part-month CTC line from any path.
CREATE OR REPLACE FUNCTION public.hr_block_waived_recovery_lines()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.source IN ('ctc_transition_adjustment','training_ctc_adjustment')
     AND NEW.source_revision_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.hr_recovery_waivers w
                 WHERE w.source_kind = 'ctc_revision' AND w.ref_id = NEW.source_revision_id) THEN
    RETURN NULL; -- silently skip: HR cancelled it permanently
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_block_waived_additions BEFORE INSERT ON public.hr_payroll_input_additions
  FOR EACH ROW EXECUTE FUNCTION public.hr_block_waived_recovery_lines();
CREATE TRIGGER trg_block_waived_deductions BEFORE INSERT ON public.hr_payroll_input_deductions
  FOR EACH ROW EXECUTE FUNCTION public.hr_block_waived_recovery_lines();

-- p_kind: 'loan' | 'deposit' (p_ref = installment id) or 'ctc_revision' (p_ref = revision id)
-- p_scope: 'this' | 'all_future'
CREATE OR REPLACE FUNCTION public.hr_cancel_recovery(p_kind text, p_ref uuid, p_scope text, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_parent uuid; v_period date; v_ids uuid[]; v_removed int := 0; v_msg text;
BEGIN
  IF NOT public.hr_is_hr_staff(auth.uid()) THEN RAISE EXCEPTION 'Only HR staff can cancel recoveries'; END IF;
  IF COALESCE(btrim(p_reason),'') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF p_scope NOT IN ('this','all_future') THEN RAISE EXCEPTION 'Invalid scope'; END IF;
  v_msg := 'Cancelled by HR: ' || btrim(p_reason);

  IF p_kind = 'loan' THEN
    SELECT loan_id, period_month INTO v_parent, v_period FROM hr_loan_repayments WHERE id = p_ref;
    IF v_parent IS NULL THEN RAISE EXCEPTION 'Instalment not found'; END IF;
    SELECT array_agg(id) INTO v_ids FROM hr_loan_repayments
     WHERE status IN ('scheduled','failed')
       AND (id = p_ref OR (p_scope = 'all_future' AND loan_id = v_parent AND period_month >= v_period));
    IF v_ids IS NULL THEN RAISE EXCEPTION 'Nothing left to cancel — already pushed or settled'; END IF;
    UPDATE hr_loan_repayments SET status = 'skipped', failure_reason = v_msg WHERE id = ANY(v_ids);
  ELSIF p_kind = 'deposit' THEN
    SELECT deposit_id, period_month INTO v_parent, v_period FROM hr_employee_deposit_schedule WHERE id = p_ref;
    IF v_parent IS NULL THEN RAISE EXCEPTION 'Instalment not found'; END IF;
    SELECT array_agg(id) INTO v_ids FROM hr_employee_deposit_schedule
     WHERE status IN ('scheduled','failed')
       AND (id = p_ref OR (p_scope = 'all_future' AND deposit_id = v_parent AND period_month >= v_period));
    IF v_ids IS NULL THEN RAISE EXCEPTION 'Nothing left to cancel — already pushed or collected'; END IF;
    UPDATE hr_employee_deposit_schedule SET status = 'skipped', failure_reason = v_msg WHERE id = ANY(v_ids);
  ELSIF p_kind = 'ctc_revision' THEN
    INSERT INTO hr_recovery_waivers(source_kind, ref_id, reason, waived_by)
    VALUES ('ctc_revision', p_ref, btrim(p_reason), auth.uid())
    ON CONFLICT (source_kind, ref_id) DO NOTHING;
    WITH a AS (DELETE FROM hr_payroll_input_additions WHERE source_revision_id = p_ref
                 AND source IN ('ctc_transition_adjustment','training_ctc_adjustment') AND pushed_at IS NULL RETURNING 1),
         d AS (DELETE FROM hr_payroll_input_deductions WHERE source_revision_id = p_ref
                 AND source IN ('ctc_transition_adjustment','training_ctc_adjustment') AND pushed_at IS NULL RETURNING 1)
    SELECT (SELECT count(*) FROM a)+(SELECT count(*) FROM d) INTO v_removed;
    RETURN jsonb_build_object('ok', true, 'removed_lines', v_removed);
  ELSE
    RAISE EXCEPTION 'Unknown recovery kind';
  END IF;

  DELETE FROM hr_payroll_input_deductions
   WHERE source = 'auto_recovery' AND recovery_kind = p_kind
     AND recovery_ref_id = ANY(v_ids) AND pushed_at IS NULL;
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'cancelled_installments', array_length(v_ids,1), 'removed_lines', v_removed);
END $$;
REVOKE ALL ON FUNCTION public.hr_cancel_recovery(text,uuid,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.hr_cancel_recovery(text,uuid,text,text) TO authenticated;