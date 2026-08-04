ALTER TABLE public.hr_salary_revisions
  ADD COLUMN IF NOT EXISTS payout_paid_on date,
  ADD COLUMN IF NOT EXISTS payout_channel text,
  ADD COLUMN IF NOT EXISTS payroll_input_id uuid,
  ADD COLUMN IF NOT EXISTS payroll_input_kind text;

ALTER TABLE public.hr_salary_revisions DROP CONSTRAINT IF EXISTS hr_salary_revisions_type_check;
ALTER TABLE public.hr_salary_revisions ADD CONSTRAINT hr_salary_revisions_type_check
  CHECK (revision_type = ANY (ARRAY[
    'increment','promotion','correction','demotion',
    'bonus','performance_incentive','special_allowance','retention_bonus',
    'ad_hoc','one_time_correction','statutory_toggle',
    'payroll_addition','payroll_deduction'
  ]));

ALTER TABLE public.hr_salary_revisions DROP CONSTRAINT IF EXISTS hr_salary_revisions_input_kind_check;
ALTER TABLE public.hr_salary_revisions ADD CONSTRAINT hr_salary_revisions_input_kind_check
  CHECK (payroll_input_kind IS NULL OR payroll_input_kind = ANY (ARRAY['addition','deduction']));

CREATE OR REPLACE FUNCTION public.hr_block_backdated_payroll_input_revision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.revision_type IN ('payroll_addition','payroll_deduction') THEN
    IF NEW.payout_month IS NULL THEN
      RAISE EXCEPTION 'Payroll month is required for additions and deductions';
    END IF;
    IF date_trunc('month', NEW.payout_month::timestamp)
       < date_trunc('month', (now() AT TIME ZONE 'Asia/Kolkata')) THEN
      RAISE EXCEPTION 'Backdated payroll additions/deductions are not allowed (month %)', to_char(NEW.payout_month, 'YYYY-MM');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_block_backdated_payroll_input_revision ON public.hr_salary_revisions;
CREATE TRIGGER trg_hr_block_backdated_payroll_input_revision
  BEFORE INSERT OR UPDATE ON public.hr_salary_revisions
  FOR EACH ROW EXECUTE FUNCTION public.hr_block_backdated_payroll_input_revision();