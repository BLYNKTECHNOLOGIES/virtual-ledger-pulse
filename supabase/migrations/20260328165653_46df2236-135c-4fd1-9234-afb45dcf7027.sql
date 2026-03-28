
-- 1. Create hr_hour_accounts table (mirrors Horilla's AttendanceOverTime)
CREATE TABLE IF NOT EXISTS public.hr_hour_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  month_sequence SMALLINT NOT NULL DEFAULT 0,
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  worked_hours TEXT DEFAULT '00:00',
  pending_hours TEXT DEFAULT '00:00',
  overtime TEXT DEFAULT '00:00',
  hour_account_second INTEGER DEFAULT 0,
  hour_pending_second INTEGER DEFAULT 0,
  overtime_second INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, month_sequence, year)
);

ALTER TABLE public.hr_hour_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage hour accounts" ON public.hr_hour_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Enhance hr_leave_types with Horilla-compatible fields
ALTER TABLE public.hr_leave_types
  ADD COLUMN IF NOT EXISTS reset BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS reset_based TEXT,
  ADD COLUMN IF NOT EXISTS reset_month TEXT,
  ADD COLUMN IF NOT EXISTS reset_day TEXT,
  ADD COLUMN IF NOT EXISTS is_encashable BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS exclude_company_leave BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS exclude_holiday BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_compensatory_leave BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS carryforward_type TEXT DEFAULT 'carryforward',
  ADD COLUMN IF NOT EXISTS carryforward_expire_in INTEGER,
  ADD COLUMN IF NOT EXISTS carryforward_expire_period TEXT,
  ADD COLUMN IF NOT EXISTS require_attachment BOOLEAN DEFAULT false;

-- 3. Add available_days to hr_leave_allocations for explicit balance tracking
ALTER TABLE public.hr_leave_allocations
  ADD COLUMN IF NOT EXISTS available_days NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reset_date DATE,
  ADD COLUMN IF NOT EXISTS expired_date DATE;

-- 4. DB trigger: auto-deduct leave balance on approval, auto-restore on cancellation
CREATE OR REPLACE FUNCTION public.handle_leave_balance_on_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_days NUMERIC;
  v_alloc_id UUID;
  v_current_used NUMERIC;
  v_current_available NUMERIC;
  v_year INTEGER;
  v_quarter INTEGER;
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  v_total_days := COALESCE(NEW.total_days, 0);
  IF v_total_days <= 0 THEN
    RETURN NEW;
  END IF;

  v_year := EXTRACT(YEAR FROM NEW.start_date);
  v_quarter := CEIL(EXTRACT(MONTH FROM NEW.start_date) / 3.0);

  SELECT id, used_days, available_days INTO v_alloc_id, v_current_used, v_current_available
  FROM public.hr_leave_allocations
  WHERE employee_id = NEW.employee_id
    AND leave_type_id = NEW.leave_type_id
    AND year = v_year
    AND quarter = v_quarter
  LIMIT 1;

  IF v_alloc_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('approved', 'Approved') AND OLD.status NOT IN ('approved', 'Approved') THEN
    UPDATE public.hr_leave_allocations
    SET used_days = COALESCE(used_days, 0) + v_total_days,
        available_days = GREATEST(0, COALESCE(available_days, 0) - v_total_days),
        updated_at = NOW()
    WHERE id = v_alloc_id;
  END IF;

  IF NEW.status IN ('cancelled', 'Cancelled') AND OLD.status IN ('approved', 'Approved') THEN
    UPDATE public.hr_leave_allocations
    SET used_days = GREATEST(0, COALESCE(used_days, 0) - v_total_days),
        available_days = COALESCE(available_days, 0) + v_total_days,
        updated_at = NOW()
    WHERE id = v_alloc_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leave_balance_on_status_change ON public.hr_leave_requests;

CREATE TRIGGER trg_leave_balance_on_status_change
  BEFORE UPDATE ON public.hr_leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_leave_balance_on_status_change();

-- 5. Function to compute/refresh hour accounts from hr_attendance_daily
CREATE OR REPLACE FUNCTION public.refresh_hour_accounts(p_year INTEGER DEFAULT NULL, p_month INTEGER DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INTEGER := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER);
  v_month INTEGER := COALESCE(p_month, EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER);
  v_month_name TEXT;
  v_rec RECORD;
  v_shift_duration_seconds INTEGER;
  v_working_days INTEGER;
  v_required_seconds INTEGER;
  v_worked_seconds INTEGER;
  v_overtime_seconds INTEGER;
  v_pending_seconds INTEGER;
BEGIN
  v_month_name := TO_CHAR(TO_DATE(v_month::TEXT, 'MM'), 'FMMonth');

  FOR v_rec IN
    SELECT DISTINCT employee_id FROM hr_attendance_daily
    WHERE EXTRACT(YEAR FROM attendance_date) = v_year
      AND EXTRACT(MONTH FROM attendance_date) = v_month
  LOOP
    SELECT COALESCE(SUM(COALESCE(total_hours, 0) * 3600), 0)::INTEGER,
           COUNT(*)
    INTO v_worked_seconds, v_working_days
    FROM hr_attendance_daily
    WHERE employee_id = v_rec.employee_id
      AND EXTRACT(YEAR FROM attendance_date) = v_year
      AND EXTRACT(MONTH FROM attendance_date) = v_month
      AND status IN ('present', 'late');

    SELECT COALESCE(s.duration_hours * 3600, 8 * 3600)::INTEGER
    INTO v_shift_duration_seconds
    FROM hr_employee_work_info wi
    JOIN hr_shifts s ON s.id = wi.shift_id
    WHERE wi.employee_id = v_rec.employee_id
    LIMIT 1;

    IF v_shift_duration_seconds IS NULL THEN
      v_shift_duration_seconds := 8 * 3600;
    END IF;

    v_required_seconds := v_working_days * v_shift_duration_seconds;
    v_overtime_seconds := GREATEST(0, v_worked_seconds - v_required_seconds);
    v_pending_seconds := GREATEST(0, v_required_seconds - v_worked_seconds);

    INSERT INTO hr_hour_accounts (
      employee_id, month, month_sequence, year,
      worked_hours, pending_hours, overtime,
      hour_account_second, hour_pending_second, overtime_second
    ) VALUES (
      v_rec.employee_id::UUID, LOWER(v_month_name), v_month, v_year,
      TO_CHAR((v_worked_seconds / 3600)::INTEGER, 'FM00') || ':' || TO_CHAR(((v_worked_seconds % 3600) / 60)::INTEGER, 'FM00'),
      TO_CHAR((v_pending_seconds / 3600)::INTEGER, 'FM00') || ':' || TO_CHAR(((v_pending_seconds % 3600) / 60)::INTEGER, 'FM00'),
      TO_CHAR((v_overtime_seconds / 3600)::INTEGER, 'FM00') || ':' || TO_CHAR(((v_overtime_seconds % 3600) / 60)::INTEGER, 'FM00'),
      v_worked_seconds, v_pending_seconds, v_overtime_seconds
    )
    ON CONFLICT (employee_id, month_sequence, year)
    DO UPDATE SET
      worked_hours = EXCLUDED.worked_hours,
      pending_hours = EXCLUDED.pending_hours,
      overtime = EXCLUDED.overtime,
      hour_account_second = EXCLUDED.hour_account_second,
      hour_pending_second = EXCLUDED.hour_pending_second,
      overtime_second = EXCLUDED.overtime_second,
      updated_at = NOW();
  END LOOP;
END;
$$;

-- 6. Backfill available_days for existing allocations
UPDATE public.hr_leave_allocations
SET available_days = GREATEST(0, allocated_days - used_days)
WHERE available_days = 0 AND allocated_days > 0;
