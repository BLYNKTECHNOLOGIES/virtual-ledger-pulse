ALTER TABLE public.hr_loan_repayments DROP CONSTRAINT IF EXISTS hr_loan_repayments_status_check;
ALTER TABLE public.hr_loan_repayments ADD CONSTRAINT hr_loan_repayments_status_check
  CHECK (status = ANY (ARRAY['scheduled','pushed','paid','failed','skipped']));

-- Closes every instalment a leaver can no longer pay from salary: everything from
-- the last-working-day month onward that is not yet collected/paid. Unpushed staged
-- payroll-input deductions for those instalments are removed so they can never be
-- pushed; already-pushed ones are kept (they exist in RazorpayX) but are flagged.
CREATE OR REPLACE FUNCTION public.hr_close_leaver_instalments(_employee_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _cut date;
  _dep int := 0; _loan int := 0; _unstaged int := 0;
BEGIN
  SELECT date_trunc('month', last_working_day)::date INTO _cut FROM hr_employees WHERE id = _employee_id;
  IF _cut IS NULL THEN RETURN jsonb_build_object('skipped','no last working day'); END IF;

  DELETE FROM hr_payroll_input_deductions d
   WHERE d.hr_employee_id = _employee_id AND d.source = 'auto_recovery' AND d.pushed_at IS NULL
     AND d.period_month >= _cut
     AND (d.recovery_ref_id IN (SELECT id FROM hr_employee_deposit_schedule WHERE employee_id=_employee_id)
       OR d.recovery_ref_id IN (SELECT id FROM hr_loan_repayments WHERE employee_id=_employee_id));
  GET DIAGNOSTICS _unstaged = ROW_COUNT;

  UPDATE hr_employee_deposit_schedule SET status='skipped', failure_reason=_reason, updated_at=now()
   WHERE employee_id=_employee_id AND period_month >= _cut AND status IN ('scheduled','failed','pushed');
  GET DIAGNOSTICS _dep = ROW_COUNT;

  UPDATE hr_loan_repayments SET status='skipped', failure_reason=_reason
   WHERE employee_id=_employee_id AND period_month >= _cut AND status IN ('scheduled','failed','pushed');
  GET DIAGNOSTICS _loan = ROW_COUNT;

  RETURN jsonb_build_object('deposit_instalments',_dep,'loan_instalments',_loan,'unstaged_deductions',_unstaged);
END $$;
REVOKE ALL ON FUNCTION public.hr_close_leaver_instalments(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.hr_close_leaver_instalments(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.hr_tg_fnf_close_instalments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid') THEN
    PERFORM public.hr_close_leaver_instalments(NEW.employee_id,
      'Closed in F&F settlement (paid ' || to_char(now() AT TIME ZONE 'Asia/Kolkata','DD-Mon-YYYY') || ') — no further salary deduction');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_hr_fnf_close_instalments ON public.hr_fnf_settlements;
CREATE TRIGGER trg_hr_fnf_close_instalments AFTER INSERT OR UPDATE OF status ON public.hr_fnf_settlements
  FOR EACH ROW EXECUTE FUNCTION public.hr_tg_fnf_close_instalments();

-- Backfill every leaver whose F&F is already paid.
SELECT public.hr_close_leaver_instalments(f.employee_id, 'Closed in F&F settlement — no further salary deduction')
  FROM hr_fnf_settlements f WHERE f.status='paid';