
-- ============================================================
-- M5: Add resignation/termination dates to hr_employees
-- ============================================================
ALTER TABLE public.hr_employees 
  ADD COLUMN IF NOT EXISTS resignation_date DATE,
  ADD COLUMN IF NOT EXISTS termination_date DATE,
  ADD COLUMN IF NOT EXISTS last_working_day DATE,
  ADD COLUMN IF NOT EXISTS separation_reason TEXT;

-- ============================================================
-- M6: Shift rotation & weekly-off management
-- ============================================================
CREATE TABLE IF NOT EXISTS public.hr_employee_shift_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  shift_id UUID NOT NULL REFERENCES public.hr_shifts(id),
  effective_from DATE NOT NULL,
  effective_to DATE,
  is_current BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_shift_schedule_emp ON public.hr_employee_shift_schedule(employee_id, is_current);
ALTER TABLE public.hr_employee_shift_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth can manage shift schedules" ON public.hr_employee_shift_schedule FOR ALL TO authenticated USING (true);

-- Weekly off patterns
CREATE TABLE IF NOT EXISTS public.hr_weekly_off_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  weekly_offs INTEGER[] NOT NULL DEFAULT '{0}', -- 0=Sun, 1=Mon, ... 6=Sat
  is_alternating BOOLEAN DEFAULT false,
  alternate_week_offs INTEGER[],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.hr_weekly_off_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth can manage weekly offs" ON public.hr_weekly_off_patterns FOR ALL TO authenticated USING (true);

-- Link employees to weekly-off patterns
CREATE TABLE IF NOT EXISTS public.hr_employee_weekly_off (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  pattern_id UUID NOT NULL REFERENCES public.hr_weekly_off_patterns(id),
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  is_current BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, is_current) 
);

ALTER TABLE public.hr_employee_weekly_off ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth can manage employee weekly offs" ON public.hr_employee_weekly_off FOR ALL TO authenticated USING (true);

-- Seed default weekly-off pattern (Sunday off)
INSERT INTO public.hr_weekly_off_patterns (name, description, weekly_offs, is_alternating)
VALUES ('Standard - Sunday Off', 'Default pattern: Sunday is weekly off', '{0}', false)
ON CONFLICT DO NOTHING;

-- ============================================================
-- M2: Year-end leave reset & carryforward function
-- ============================================================
CREATE OR REPLACE FUNCTION public.execute_leave_reset(p_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER)
RETURNS TABLE(employee_id UUID, leave_type TEXT, action TEXT, old_balance NUMERIC, new_balance NUMERIC, carried_forward NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  alloc RECORD;
  lt RECORD;
  v_cf NUMERIC;
  v_new_allocated NUMERIC;
  v_expire_date DATE;
BEGIN
  FOR alloc IN 
    SELECT a.*, lt2.name AS lt_name, lt2.max_days_per_year, lt2.carry_forward AS cf_enabled,
           lt2.max_carry_forward_days, lt2.carryforward_type, lt2.carryforward_expire_in,
           lt2.carryforward_expire_period, lt2.reset_based, lt2.reset_month, lt2.reset_day
    FROM hr_leave_allocations a
    JOIN hr_leave_types lt2 ON lt2.id = a.leave_type_id
    WHERE a.year = p_year AND lt2.is_active = true
  LOOP
    v_cf := 0;
    v_expire_date := NULL;
    
    -- Calculate carryforward
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

    -- Insert new year allocation
    INSERT INTO hr_leave_allocations (employee_id, leave_type_id, year, allocated_days, used_days, carry_forward_days, available_days, expired_date)
    VALUES (alloc.employee_id, alloc.leave_type_id, p_year + 1, v_new_allocated, 0, v_cf, v_new_allocated + v_cf, v_expire_date)
    ON CONFLICT (employee_id, leave_type_id, year) 
      WHERE year = p_year + 1
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
$$;

-- Add unique constraint for the ON CONFLICT clause
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_leave_alloc_emp_type_year') THEN
    ALTER TABLE public.hr_leave_allocations ADD CONSTRAINT uq_leave_alloc_emp_type_year UNIQUE (employee_id, leave_type_id, year);
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ============================================================
-- M3: Auto penalty generation function
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_generate_penalties(p_month TEXT DEFAULT TO_CHAR(CURRENT_DATE - INTERVAL '1 month', 'YYYY-MM'))
RETURNS TABLE(emp_id UUID, emp_name TEXT, late_count BIGINT, rule_applied TEXT, penalty_type TEXT, penalty_value NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp RECORD;
  rule RECORD;
  v_existing INTEGER;
BEGIN
  FOR emp IN
    SELECT le.employee_id, COUNT(*) AS cnt,
           e.first_name || ' ' || e.last_name AS full_name
    FROM hr_late_come_early_out le
    JOIN hr_employees e ON e.id = le.employee_id
    WHERE le.type = 'late_come'
      AND TO_CHAR(le.attendance_date, 'YYYY-MM') = p_month
    GROUP BY le.employee_id, e.first_name, e.last_name
  LOOP
    -- Check if penalty already generated for this employee/month
    SELECT COUNT(*) INTO v_existing 
    FROM hr_penalties 
    WHERE employee_id = emp.employee_id 
      AND penalty_month = p_month 
      AND rule_id IS NOT NULL;
    
    IF v_existing > 0 THEN CONTINUE; END IF;

    -- Find matching rule
    FOR rule IN
      SELECT * FROM hr_penalty_rules 
      WHERE is_active = true AND rule_type = 'late_slab'
        AND emp.cnt >= late_count_min
        AND (late_count_max IS NULL OR emp.cnt <= late_count_max)
      ORDER BY late_count_min DESC
      LIMIT 1
    LOOP
      INSERT INTO hr_penalties (employee_id, penalty_month, penalty_type, penalty_reason, 
        penalty_amount, penalty_days, late_count, rule_id, notes)
      VALUES (
        emp.employee_id, p_month, rule.penalty_type,
        'Auto-generated: ' || emp.cnt || ' late marks in ' || p_month,
        CASE WHEN rule.penalty_type = 'amount' THEN rule.penalty_value ELSE 0 END,
        CASE WHEN rule.penalty_type = 'days' THEN rule.penalty_value ELSE 0 END,
        emp.cnt::INTEGER, rule.id,
        'System auto-generated based on rule: ' || rule.rule_name
      );

      emp_id := emp.employee_id;
      emp_name := emp.full_name;
      late_count := emp.cnt;
      rule_applied := rule.rule_name;
      penalty_type := rule.penalty_type;
      penalty_value := rule.penalty_value;
      RETURN NEXT;
    END LOOP;
  END LOOP;
END;
$$;
