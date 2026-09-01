
CREATE OR REPLACE FUNCTION public.fn_block_sick_leave_on_probation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ref date;
  v_as_of date;
BEGIN
  IF NOT COALESCE((SELECT block_sick_leave FROM public.hr_probation_policy WHERE id), true) THEN
    RETURN NEW;
  END IF;

  IF NOT public.hr_is_sick_leave_type(NEW.leave_type_id) THEN RETURN NEW; END IF;

  IF COALESCE(NEW.allocated_days, 0) <= 0 AND COALESCE(NEW.available_days, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  v_as_of := COALESCE(NULLIF(current_setting('hr.accrual_as_of', true), '')::date, CURRENT_DATE);

  v_ref := CASE WHEN COALESCE(NEW.quarter, 0) BETWEEN 1 AND 4
                THEN (make_date(NEW.year, (NEW.quarter - 1) * 3 + 1, 1) + interval '3 months - 1 day')::date
                ELSE make_date(NEW.year, 12, 31) END;

  IF public.hr_is_on_probation(NEW.employee_id, LEAST(v_ref, v_as_of)) THEN
    RAISE EXCEPTION 'Sick / Medical Leave cannot be allocated while the employee is on probation (probation ends %)',
      public.hr_probation_end_date(NEW.employee_id);
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.run_leave_accrual(p_accrual_date date DEFAULT CURRENT_DATE)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_plan RECORD;
  v_emp RECORD;
  v_count int := 0;
  v_year int := EXTRACT(YEAR FROM p_accrual_date)::int;
  v_month int := EXTRACT(MONTH FROM p_accrual_date)::int;
  v_quarter int := EXTRACT(QUARTER FROM p_accrual_date)::int;
  v_bucket int;
  v_block_sl boolean;
  v_is_sl boolean;
  v_start date;
  v_last date;
  v_due boolean;
  v_amount numeric;
  v_cap numeric;
  v_prev_avail numeric;
  v_exists int;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('run_leave_accrual')) THEN
    RETURN 0;
  END IF;

  PERFORM set_config('hr.accrual_as_of', p_accrual_date::text, true);

  v_block_sl := COALESCE((SELECT block_sick_leave FROM public.hr_probation_policy WHERE id), true);

  FOR v_plan IN
    SELECT ap.*, lt.code AS lt_code, lt.name AS lt_name,
           public.hr_is_sick_leave_code(lt.code, lt.name) AS lt_is_sick
      FROM public.hr_leave_accrual_plans ap
      JOIN public.hr_leave_types lt ON lt.id = ap.leave_type_id
     WHERE ap.is_active = true
       AND ap.effective_from <= p_accrual_date
       AND COALESCE(lt.is_active, true) = true
  LOOP
    v_is_sl := v_plan.lt_is_sick AND v_block_sl;
    v_bucket := 0;

    IF EXTRACT(DAY FROM p_accrual_date)::int < v_plan.accrual_day THEN
      CONTINUE;
    END IF;

    IF v_plan.cycle_basis = 'calendar' THEN
      IF v_plan.accrual_period = 'quarterly' THEN
        v_bucket := v_quarter;
        IF v_month NOT IN (1,4,7,10) THEN CONTINUE; END IF;
      ELSIF v_plan.accrual_period = 'yearly' THEN
        IF v_month <> 1 THEN CONTINUE; END IF;
      ELSIF v_plan.accrual_period <> 'monthly' THEN
        CONTINUE;
      END IF;
    END IF;

    FOR v_emp IN
      SELECT e.id AS employee_id,
             COALESCE(wi.joining_date, e.created_at::date) AS joining_date
        FROM public.hr_employees e
        LEFT JOIN public.hr_employee_work_info wi ON wi.employee_id = e.id
       WHERE e.is_active = true
         AND (v_plan.applicable_to = 'all'
              OR (v_plan.applicable_to = 'department' AND wi.department_id = v_plan.department_id)
              OR (v_plan.applicable_to = 'position'   AND wi.job_position_id = v_plan.position_id))
    LOOP
      IF v_plan.start_trigger = 'probation_end' THEN
        v_start := public.hr_probation_end_date(v_emp.employee_id);
        IF v_start IS NULL THEN CONTINUE; END IF;
        v_start := v_start + 1;
      ELSE
        v_start := v_emp.joining_date;
      END IF;
      IF v_start IS NULL OR v_start > p_accrual_date THEN CONTINUE; END IF;

      IF v_is_sl AND public.hr_is_on_probation(v_emp.employee_id, p_accrual_date) THEN
        CONTINUE;
      END IF;

      SELECT MAX(accrual_date) INTO v_last
        FROM public.hr_leave_accrual_log
       WHERE accrual_plan_id = v_plan.id AND employee_id = v_emp.employee_id;

      IF v_plan.cycle_basis = 'anniversary' THEN
        v_due := (v_last IS NULL)
                 OR (v_last + (CASE v_plan.accrual_period
                                 WHEN 'monthly' THEN interval '1 month'
                                 WHEN 'quarterly' THEN interval '3 months'
                                 ELSE interval '12 months' END))::date <= p_accrual_date;
      ELSE
        IF v_plan.accrual_period = 'monthly' THEN
          SELECT COUNT(*) INTO v_exists FROM public.hr_leave_accrual_log
           WHERE accrual_plan_id = v_plan.id AND employee_id = v_emp.employee_id
             AND EXTRACT(YEAR FROM accrual_date)::int = v_year
             AND EXTRACT(MONTH FROM accrual_date)::int = v_month;
        ELSIF v_plan.accrual_period = 'quarterly' THEN
          SELECT COUNT(*) INTO v_exists FROM public.hr_leave_accrual_log
           WHERE accrual_plan_id = v_plan.id AND employee_id = v_emp.employee_id
             AND year = v_year AND quarter = v_quarter;
        ELSE
          SELECT COUNT(*) INTO v_exists FROM public.hr_leave_accrual_log
           WHERE accrual_plan_id = v_plan.id AND employee_id = v_emp.employee_id
             AND year = v_year;
        END IF;
        v_due := (v_exists = 0);
      END IF;

      IF NOT v_due THEN CONTINUE; END IF;

      v_amount := v_plan.accrual_amount;
      IF v_amount IS NULL OR v_amount <= 0 THEN CONTINUE; END IF;
      v_cap := v_plan.max_accrual;

      SELECT COUNT(*) INTO v_exists FROM public.hr_leave_allocations
       WHERE employee_id = v_emp.employee_id AND leave_type_id = v_plan.leave_type_id
         AND year = v_year AND quarter = v_bucket;
      IF v_exists = 0 THEN
        SELECT COALESCE(SUM(GREATEST(COALESCE(available_days, allocated_days - COALESCE(used_days,0)), 0)), 0)
          INTO v_prev_avail
          FROM public.hr_leave_allocations
         WHERE employee_id = v_emp.employee_id AND leave_type_id = v_plan.leave_type_id
           AND year = v_year - 1;
        IF v_prev_avail > 0 THEN
          INSERT INTO public.hr_leave_allocations
            (employee_id, leave_type_id, year, quarter, allocated_days, available_days, used_days, carry_forward_days)
          VALUES (v_emp.employee_id, v_plan.leave_type_id, v_year, v_bucket, v_prev_avail, v_prev_avail, 0, v_prev_avail)
          ON CONFLICT (employee_id, leave_type_id, year, quarter) DO NOTHING;
        END IF;
      END IF;

      INSERT INTO public.hr_leave_allocations
        (employee_id, leave_type_id, year, quarter, allocated_days, available_days, used_days)
      VALUES (v_emp.employee_id, v_plan.leave_type_id, v_year, v_bucket, v_amount, v_amount, 0)
      ON CONFLICT (employee_id, leave_type_id, year, quarter) DO UPDATE SET
        allocated_days = CASE WHEN v_cap IS NULL
                              THEN public.hr_leave_allocations.allocated_days + v_amount
                              ELSE LEAST(public.hr_leave_allocations.allocated_days + v_amount, v_cap) END,
        available_days = CASE WHEN v_cap IS NULL
                              THEN COALESCE(public.hr_leave_allocations.available_days, 0) + v_amount
                              ELSE LEAST(COALESCE(public.hr_leave_allocations.available_days, 0) + v_amount, v_cap) END,
        updated_at = now();

      INSERT INTO public.hr_leave_accrual_log
        (accrual_plan_id, employee_id, accrued_days, accrual_date, year, quarter)
      VALUES (v_plan.id, v_emp.employee_id, v_amount, p_accrual_date, v_year, v_bucket);

      v_count := v_count + 1;
    END LOOP;

    UPDATE public.hr_leave_accrual_plans
       SET last_accrual_date = p_accrual_date, updated_at = now()
     WHERE id = v_plan.id;
  END LOOP;

  RETURN v_count;
END;
$function$;
