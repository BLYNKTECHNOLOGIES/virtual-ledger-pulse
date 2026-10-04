CREATE OR REPLACE FUNCTION public.hr_settle_fnf_via_payroll(_month date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _first date := date_trunc('month', _month)::date; _ack timestamptz; _n int;
BEGIN
  SELECT acknowledged_at INTO _ack FROM public.hr_payroll_cockpit_state
   WHERE period_month = _first AND step_no = 7 AND status = 'done';
  IF _ack IS NULL THEN RETURN 0; END IF;
  UPDATE public.hr_fnf_settlements f
     SET status = 'paid', paid_at = COALESCE(f.paid_at, _ack),
         payment_reference = COALESCE(NULLIF(trim(f.payment_reference),''), 'RazorpayX payroll ' || to_char(_first,'YYYY-MM'))
   WHERE f.status = 'approved'
     AND f.razorpay_push_status IN ('pushed','nothing_to_push')
     AND date_trunc('month', COALESCE(f.payroll_month, f.last_working_day))::date = _first;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;

CREATE OR REPLACE FUNCTION public.hr_tg_cockpit_step7_settle_fnf()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.step_no = 7 AND NEW.status = 'done' THEN
    PERFORM public.hr_settle_fnf_via_payroll(NEW.period_month);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cockpit_step7_settle_fnf ON public.hr_payroll_cockpit_state;
CREATE TRIGGER trg_cockpit_step7_settle_fnf AFTER INSERT OR UPDATE OF status ON public.hr_payroll_cockpit_state
FOR EACH ROW EXECUTE FUNCTION public.hr_tg_cockpit_step7_settle_fnf();

REVOKE ALL ON FUNCTION public.hr_settle_fnf_via_payroll(date) FROM PUBLIC, anon, authenticated;
SELECT public.hr_settle_fnf_via_payroll('2026-09-01');