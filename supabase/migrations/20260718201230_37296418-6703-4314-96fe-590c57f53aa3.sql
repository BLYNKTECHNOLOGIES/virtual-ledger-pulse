
-- R4-1: extend payslip status whitelist to include 'imported'; treat 'imported' as terminal
-- (only allowed transition FROM 'imported' is to 'cancelled').
CREATE OR REPLACE FUNCTION public.fn_validate_payslip_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status NOT IN ('generated', 'paid', 'cancelled', 'imported') THEN
    RAISE EXCEPTION 'Invalid payslip status: %. Allowed: generated, paid, cancelled, imported', NEW.status;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT (
      (OLD.status = 'generated' AND NEW.status IN ('paid', 'cancelled'))
      OR (OLD.status = 'imported' AND NEW.status = 'cancelled')
    ) THEN
      RAISE EXCEPTION 'Invalid payslip status transition: % → %. Allowed: generated→paid, generated→cancelled, imported→cancelled',
        OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- R4-2: replace the partial unique index with a FULL unique index on (employee_id, period_month)
-- so PostgREST's ON CONFLICT (employee_id, period_month) can infer it.
-- NOTE: native engine payslips MUST keep period_month NULL (reserved for imported rows).
-- Postgres treats NULLs as distinct in unique indexes, so native rows never collide here;
-- native uniqueness is preserved by the existing (payroll_run_id, employee_id) unique index.
DROP INDEX IF EXISTS public.hr_payslips_rzp_import_unique;
CREATE UNIQUE INDEX hr_payslips_emp_period_unique
  ON public.hr_payslips (employee_id, period_month);
