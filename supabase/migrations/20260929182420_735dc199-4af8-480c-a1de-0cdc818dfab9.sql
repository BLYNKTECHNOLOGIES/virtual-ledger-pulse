CREATE OR REPLACE FUNCTION public.hr_settle_recoveries_on_payroll_processed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.processed_on IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.processed_on IS NULL) THEN
    PERFORM public.hr_settle_loan_period(NEW.period_month);
    PERFORM public.hr_settle_deposit_period(NEW.period_month);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_hr_settle_recoveries_on_processed ON public.hr_payroll_month_meta;
CREATE TRIGGER trg_hr_settle_recoveries_on_processed
AFTER INSERT OR UPDATE OF processed_on ON public.hr_payroll_month_meta
FOR EACH ROW EXECUTE FUNCTION public.hr_settle_recoveries_on_payroll_processed();

DO $$
DECLARE m record;
BEGIN
  FOR m IN SELECT period_month FROM public.hr_payroll_month_meta
           WHERE processed_on IS NOT NULL ORDER BY period_month LOOP
    PERFORM public.hr_settle_loan_period(m.period_month);
    PERFORM public.hr_settle_deposit_period(m.period_month);
  END LOOP;
END $$;