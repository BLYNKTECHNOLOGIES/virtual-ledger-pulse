CREATE OR REPLACE FUNCTION public.hr_open_payroll_month()
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT m::date
      FROM generate_series(date '2026-07-01', date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')::date, interval '1 month') AS m
      WHERE NOT EXISTS (
        SELECT 1 FROM public.hr_payroll_cockpit_state c
        WHERE c.period_month = m::date
          AND c.step_no = 11
          AND c.status = 'done'
      )
      ORDER BY m
      LIMIT 1
    ),
    date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')::date
  );
$$;

GRANT EXECUTE ON FUNCTION public.hr_open_payroll_month() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hr_revision_push_window(p_revision_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  open_month date := public.hr_open_payroll_month();
  eff_month date;
BEGIN
  SELECT * INTO r FROM public.hr_salary_revisions WHERE id = p_revision_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'revision not found');
  END IF;

  IF COALESCE(r.one_time_amount, 0) <> 0
     OR r.revision_type IN ('payroll_addition', 'payroll_deduction') THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'not a CTC revision',
                              'open_payroll_month', open_month);
  END IF;

  eff_month := date_trunc('month', r.effective_from)::date;

  RETURN jsonb_build_object(
    'allowed', eff_month <= open_month,
    'open_payroll_month', open_month,
    'effective_month', eff_month,
    'reason', CASE WHEN eff_month <= open_month THEN 'in scope'
                   ELSE 'effective after the payroll month currently being processed' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_revision_push_window(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hr_tg_block_duplicate_salary_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.one_time_amount, 0) <> 0
     OR NEW.revision_type IN ('payroll_addition', 'payroll_deduction', 'statutory_toggle') THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.hr_salary_revisions x
    WHERE x.employee_id = NEW.employee_id
      AND x.effective_from = NEW.effective_from
      AND x.new_total IS NOT DISTINCT FROM NEW.new_total
      AND COALESCE(x.one_time_amount, 0) = 0
      AND upper(COALESCE(x.status, '')) IN ('APPLIED', 'SCHEDULED')
      AND x.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE WARNING 'Duplicate salary revision skipped for employee % effective %', NEW.employee_id, NEW.effective_from;
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_block_duplicate_salary_revision ON public.hr_salary_revisions;
CREATE TRIGGER trg_hr_block_duplicate_salary_revision
BEFORE INSERT ON public.hr_salary_revisions
FOR EACH ROW EXECUTE FUNCTION public.hr_tg_block_duplicate_salary_revision();