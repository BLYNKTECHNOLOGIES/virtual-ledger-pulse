
-- 1. Probation policy (single row)
CREATE TABLE IF NOT EXISTS public.hr_probation_policy (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  default_probation_months integer NOT NULL DEFAULT 6,
  block_sick_leave boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.hr_probation_policy TO authenticated;
GRANT ALL ON public.hr_probation_policy TO service_role;
ALTER TABLE public.hr_probation_policy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "probation policy readable" ON public.hr_probation_policy;
CREATE POLICY "probation policy readable" ON public.hr_probation_policy
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.hr_probation_policy (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- 2. Canonical probation resolution
CREATE OR REPLACE FUNCTION public.hr_probation_end_date(p_employee_id uuid)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    wi.probation_end_date,
    (SELECT o.probation_end_date FROM public.hr_employee_onboarding o
      WHERE o.probation_end_date IS NOT NULL
        AND (o.employee_id::text = e.badge_id::text OR lower(o.email) = lower(e.email))
      ORDER BY o.created_at DESC LIMIT 1),
    (COALESCE(wi.joining_date, e.created_at::date)
       + (COALESCE((SELECT pp.default_probation_months FROM public.hr_probation_policy pp WHERE pp.id), 6) || ' months')::interval)::date
  )
  FROM public.hr_employees e
  LEFT JOIN public.hr_employee_work_info wi ON wi.employee_id = e.id
  WHERE e.id = p_employee_id;
$$;

CREATE OR REPLACE FUNCTION public.hr_is_on_probation(p_employee_id uuid, p_on date DEFAULT CURRENT_DATE)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_confirmed boolean;
  v_end date;
BEGIN
  SELECT wi.is_confirmed INTO v_confirmed
  FROM public.hr_employees e
  LEFT JOIN public.hr_employee_work_info wi ON wi.employee_id = e.id
  WHERE e.id = p_employee_id;

  IF COALESCE(v_confirmed, false) THEN RETURN false; END IF;

  v_end := public.hr_probation_end_date(p_employee_id);
  IF v_end IS NULL THEN RETURN false; END IF;
  RETURN p_on <= v_end;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_probation_end_date(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_is_on_probation(uuid, date) TO authenticated;

-- 3. Universal guard: no Sick Leave allocation rows for employees on probation
CREATE OR REPLACE FUNCTION public.fn_block_sick_leave_on_probation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_code text;
  v_ref date;
BEGIN
  IF NOT COALESCE((SELECT block_sick_leave FROM public.hr_probation_policy WHERE id), true) THEN
    RETURN NEW;
  END IF;

  SELECT code INTO v_code FROM public.hr_leave_types WHERE id = NEW.leave_type_id;
  IF v_code IS DISTINCT FROM 'SL' THEN RETURN NEW; END IF;

  IF COALESCE(NEW.allocated_days, 0) <= 0 AND COALESCE(NEW.available_days, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- reference date: end of the allocation period (annual bucket => year end)
  v_ref := CASE WHEN COALESCE(NEW.quarter, 0) BETWEEN 1 AND 4
                THEN (make_date(NEW.year, (NEW.quarter - 1) * 3 + 1, 1) + interval '3 months - 1 day')::date
                ELSE make_date(NEW.year, 12, 31) END;

  IF public.hr_is_on_probation(NEW.employee_id, LEAST(v_ref, CURRENT_DATE)) THEN
    RAISE EXCEPTION 'Sick Leave cannot be allocated while the employee is on probation (probation ends %)',
      public.hr_probation_end_date(NEW.employee_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_sick_leave_on_probation ON public.hr_leave_allocations;
CREATE TRIGGER trg_block_sick_leave_on_probation
BEFORE INSERT OR UPDATE ON public.hr_leave_allocations
FOR EACH ROW EXECUTE FUNCTION public.fn_block_sick_leave_on_probation();

-- 4. Accrual engine: SL accrues only after probation ends (pro-rated)
CREATE OR REPLACE FUNCTION public.run_leave_accrual(p_accrual_date date DEFAULT CURRENT_DATE)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan RECORD; v_emp RECORD;
  v_accrued_count INTEGER := 0;
  v_year INTEGER := EXTRACT(YEAR FROM p_accrual_date);
  v_quarter INTEGER := EXTRACT(QUARTER FROM p_accrual_date);
  v_bucket_quarter INTEGER;
  v_should_run BOOLEAN; v_existing INTEGER;
  v_period_start date; v_period_end date;
  v_period_days integer; v_days_covered integer;
  v_accrual numeric; v_join_date date;
  v_is_sl boolean; v_block_sl boolean;
  v_eff_start date; v_prob_end date;
BEGIN
  v_block_sl := COALESCE((SELECT block_sick_leave FROM public.hr_probation_policy WHERE id), true);

  FOR v_plan IN
    SELECT ap.*, lt.name AS leave_type_name, lt.code AS leave_type_code
    FROM public.hr_leave_accrual_plans ap
    JOIN public.hr_leave_types lt ON lt.id = ap.leave_type_id
    WHERE ap.is_active = true AND ap.effective_from <= p_accrual_date
  LOOP
    v_is_sl := (v_plan.leave_type_code = 'SL') AND v_block_sl;
    v_should_run := false;
    IF v_plan.accrual_period = 'monthly' THEN
      SELECT COUNT(*) INTO v_existing FROM public.hr_leave_accrual_log
       WHERE accrual_plan_id = v_plan.id
         AND EXTRACT(YEAR FROM accrual_date) = v_year
         AND EXTRACT(MONTH FROM accrual_date) = EXTRACT(MONTH FROM p_accrual_date);
      v_should_run := (v_existing = 0);
      v_bucket_quarter := 0;
      v_period_start := date_trunc('month', p_accrual_date)::date;
      v_period_end   := (date_trunc('month', p_accrual_date) + interval '1 month - 1 day')::date;
    ELSIF v_plan.accrual_period = 'quarterly' THEN
      SELECT COUNT(*) INTO v_existing FROM public.hr_leave_accrual_log
       WHERE accrual_plan_id = v_plan.id AND year = v_year AND quarter = v_quarter;
      v_should_run := (v_existing = 0);
      v_bucket_quarter := v_quarter;
      v_period_start := make_date(v_year, (v_quarter-1)*3 + 1, 1);
      v_period_end   := (make_date(v_year, (v_quarter-1)*3 + 1, 1) + interval '3 months - 1 day')::date;
    ELSIF v_plan.accrual_period = 'yearly' THEN
      SELECT COUNT(*) INTO v_existing FROM public.hr_leave_accrual_log
       WHERE accrual_plan_id = v_plan.id AND year = v_year;
      v_should_run := (v_existing = 0);
      v_bucket_quarter := 0;
      v_period_start := make_date(v_year, 1, 1);
      v_period_end   := make_date(v_year, 12, 31);
    END IF;
    IF NOT v_should_run THEN CONTINUE; END IF;
    v_period_days := (v_period_end - v_period_start) + 1;

    FOR v_emp IN
      SELECT e.id AS employee_id, wi.joining_date
        FROM public.hr_employees e
        LEFT JOIN public.hr_employee_work_info wi ON wi.employee_id = e.id
       WHERE e.is_active = true
         AND (v_plan.applicable_to = 'all'
              OR (v_plan.applicable_to = 'department' AND wi.department_id = v_plan.department_id)
              OR (v_plan.applicable_to = 'position'   AND wi.job_position_id = v_plan.position_id))
    LOOP
      v_join_date := v_emp.joining_date;
      v_eff_start := v_period_start;

      IF v_join_date IS NOT NULL AND v_join_date > v_eff_start THEN
        v_eff_start := v_join_date;
      END IF;

      -- Company policy: Sick Leave is not credited during probation
      IF v_is_sl THEN
        IF public.hr_is_on_probation(v_emp.employee_id, v_period_end) THEN
          CONTINUE;
        END IF;
        v_prob_end := public.hr_probation_end_date(v_emp.employee_id);
        IF v_prob_end IS NOT NULL AND (v_prob_end + 1) > v_eff_start THEN
          v_eff_start := v_prob_end + 1;
        END IF;
      END IF;

      IF v_eff_start > v_period_end THEN CONTINUE; END IF;

      IF v_eff_start > v_period_start THEN
        v_days_covered := (v_period_end - v_eff_start) + 1;
        v_accrual := round((v_plan.accrual_amount::numeric * v_days_covered) / v_period_days::numeric, 2);
      ELSE
        v_accrual := v_plan.accrual_amount;
      END IF;
      IF v_accrual <= 0 THEN CONTINUE; END IF;

      INSERT INTO public.hr_leave_allocations (employee_id, leave_type_id, year, quarter, allocated_days, available_days, used_days)
      VALUES (v_emp.employee_id, v_plan.leave_type_id, v_year, v_bucket_quarter, v_accrual, v_accrual, 0)
      ON CONFLICT (employee_id, leave_type_id, year, quarter) DO UPDATE SET
        allocated_days = LEAST(hr_leave_allocations.allocated_days + v_accrual, COALESCE(v_plan.max_accrual, 999)),
        available_days = LEAST(COALESCE(hr_leave_allocations.available_days,0) + v_accrual, COALESCE(v_plan.max_accrual, 999)),
        updated_at = NOW();

      INSERT INTO public.hr_leave_accrual_log (accrual_plan_id, employee_id, accrued_days, accrual_date, year, quarter)
      VALUES (v_plan.id, v_emp.employee_id, v_accrual, p_accrual_date, v_year, v_bucket_quarter);
      v_accrued_count := v_accrued_count + 1;
    END LOOP;
    UPDATE public.hr_leave_accrual_plans SET last_accrual_date = p_accrual_date, updated_at = NOW() WHERE id = v_plan.id;
  END LOOP;
  RETURN v_accrued_count;
END; $function$;

-- 5. Allocation-request approval: block SL credit during probation
CREATE OR REPLACE FUNCTION public.hr_credit_leave_allocation_on_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _year int;
  _quarter int;
  _code text;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    SELECT code INTO _code FROM public.hr_leave_types WHERE id = NEW.leave_type_id;
    IF _code = 'SL'
       AND COALESCE((SELECT block_sick_leave FROM public.hr_probation_policy WHERE id), true)
       AND public.hr_is_on_probation(NEW.employee_id, CURRENT_DATE) THEN
      RAISE EXCEPTION 'Sick Leave cannot be allocated: employee is on probation until %',
        public.hr_probation_end_date(NEW.employee_id);
    END IF;

    _year := EXTRACT(YEAR FROM COALESCE(NEW.approved_at, now()))::int;
    _quarter := EXTRACT(QUARTER FROM COALESCE(NEW.approved_at, now()))::int;

    INSERT INTO public.hr_leave_allocations
      (employee_id, leave_type_id, year, quarter, allocated_days, used_days, carry_forward_days)
    VALUES
      (NEW.employee_id, NEW.leave_type_id, _year, _quarter, NEW.requested_days, 0, 0)
    ON CONFLICT (employee_id, leave_type_id, year, quarter)
    DO UPDATE SET allocated_days = public.hr_leave_allocations.allocated_days + EXCLUDED.allocated_days,
                  updated_at = now();
  END IF;
  RETURN NEW;
END;
$function$;

-- 6. Year-end reset: do not seed SL for employees still on probation
CREATE OR REPLACE FUNCTION public.execute_leave_reset(p_year integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer)
 RETURNS TABLE(employee_id uuid, leave_type text, action text, old_balance numeric, new_balance numeric, carried_forward numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  alloc RECORD;
  v_cf NUMERIC;
  v_new_allocated NUMERIC;
  v_expire_date DATE;
  v_block_sl BOOLEAN;
BEGIN
  v_block_sl := COALESCE((SELECT block_sick_leave FROM public.hr_probation_policy WHERE id), true);

  FOR alloc IN 
    SELECT a.*, lt2.name AS lt_name, lt2.code AS lt_code, lt2.max_days_per_year, lt2.carry_forward AS cf_enabled,
           lt2.max_carry_forward_days, lt2.carryforward_type, lt2.carryforward_expire_in,
           lt2.carryforward_expire_period, lt2.reset_based, lt2.reset_month, lt2.reset_day
    FROM hr_leave_allocations a
    JOIN hr_leave_types lt2 ON lt2.id = a.leave_type_id
    WHERE a.year = p_year AND lt2.is_active = true
  LOOP
    IF v_block_sl AND alloc.lt_code = 'SL'
       AND public.hr_is_on_probation(alloc.employee_id, make_date(p_year + 1, 12, 31)) THEN
      CONTINUE;
    END IF;

    v_cf := 0;
    v_expire_date := NULL;
    
    IF alloc.cf_enabled AND alloc.available_days > 0 THEN
      CASE alloc.carryforward_type
        WHEN 'carryforward' THEN
          v_cf := LEAST(alloc.available_days, COALESCE(alloc.max_carry_forward_days, alloc.available_days));
        WHEN 'carryforward_with_expiry' THEN
          v_cf := LEAST(alloc.available_days, COALESCE(alloc.max_carry_forward_days, alloc.available_days));
          v_expire_date := CASE alloc.carryforward_expire_period
            WHEN 'months' THEN (DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '1 year')::DATE + (COALESCE(alloc.carryforward_expire_in, 3) * INTERVAL '1 month')::INTERVAL
            WHEN 'days' THEN (DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '1 year')::DATE + (COALESCE(alloc.carryforward_expire_in, 90) * INTERVAL '1 day')::INTERVAL
            ELSE (DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '1 year' + INTERVAL '3 months')::DATE
          END;
        ELSE
          v_cf := 0;
      END CASE;
    END IF;

    v_new_allocated := COALESCE(alloc.max_days_per_year, 0);

    INSERT INTO hr_leave_allocations (employee_id, leave_type_id, year, quarter, allocated_days, used_days, carry_forward_days, available_days, expired_date)
    VALUES (alloc.employee_id, alloc.leave_type_id, p_year + 1, 1, v_new_allocated, 0, v_cf, v_new_allocated + v_cf, v_expire_date)
    ON CONFLICT (employee_id, leave_type_id, year, quarter)
    DO UPDATE SET 
      allocated_days = v_new_allocated,
      carry_forward_days = v_cf,
      available_days = v_new_allocated + v_cf,
      expired_date = v_expire_date,
      updated_at = now();

    employee_id := alloc.employee_id;
    leave_type := alloc.lt_name;
    action := CASE WHEN v_cf > 0 THEN 'reset_with_carryforward' ELSE 'reset' END;
    old_balance := alloc.available_days;
    new_balance := v_new_allocated + v_cf;
    carried_forward := v_cf;
    RETURN NEXT;
  END LOOP;
END;
$function$;
