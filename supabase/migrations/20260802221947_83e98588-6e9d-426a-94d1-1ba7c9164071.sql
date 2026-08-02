ALTER TABLE public.hr_employee_deposit_schedule DROP CONSTRAINT IF EXISTS hr_employee_deposit_schedule_status_check;
ALTER TABLE public.hr_employee_deposit_schedule ADD CONSTRAINT hr_employee_deposit_schedule_status_check
  CHECK (status = ANY (ARRAY['scheduled'::text,'pushed'::text,'collected'::text,'skipped'::text,'failed'::text]));