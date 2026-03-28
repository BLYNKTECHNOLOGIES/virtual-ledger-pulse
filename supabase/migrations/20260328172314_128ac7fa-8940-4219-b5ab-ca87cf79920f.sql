
-- 1. Monthly hours aggregation view (compute worked_hours from check_in/check_out)
CREATE OR REPLACE VIEW public.hr_monthly_hours_summary AS
SELECT
  employee_id,
  DATE_TRUNC('month', attendance_date)::DATE AS month,
  COUNT(*) FILTER (WHERE attendance_status IN ('present', 'late', 'half_day')) AS present_days,
  COUNT(*) FILTER (WHERE attendance_status = 'absent') AS absent_days,
  COALESCE(SUM(
    CASE WHEN check_in IS NOT NULL AND check_out IS NOT NULL 
    THEN EXTRACT(EPOCH FROM (check_out - check_in)) / 3600.0
    ELSE 0 END
  ), 0)::NUMERIC(10,2) AS total_worked_hours,
  COALESCE(SUM(overtime_hours), 0) AS total_overtime_hours,
  COALESCE(SUM(late_minutes), 0) AS total_late_minutes,
  COALESCE(SUM(early_leave_minutes), 0) AS total_early_minutes,
  COUNT(*) FILTER (WHERE late_minutes > 0) AS late_count,
  COUNT(*) FILTER (WHERE early_leave_minutes > 0) AS early_out_count
FROM public.hr_attendance
GROUP BY employee_id, DATE_TRUNC('month', attendance_date);

-- 2. Fix the late/early trigger to use correct column names (check_in/check_out not check_in_time/check_out_time)
CREATE OR REPLACE FUNCTION public.auto_track_late_early()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_shift_id UUID;
  v_shift RECORD;
  v_check_in TIME;
  v_check_out TIME;
  v_grace INTEGER;
  v_late_mins INTEGER;
  v_early_mins INTEGER;
BEGIN
  SELECT shift_id INTO v_shift_id
  FROM public.hr_employee_work_info
  WHERE employee_id = NEW.employee_id::TEXT
  LIMIT 1;

  IF v_shift_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT start_time, end_time, grace_period_minutes
  INTO v_shift
  FROM public.hr_shifts
  WHERE id = v_shift_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_grace := COALESCE(v_shift.grace_period_minutes, 0);

  DELETE FROM public.hr_late_come_early_out WHERE attendance_id = NEW.id;

  IF NEW.check_in IS NOT NULL THEN
    v_check_in := NEW.check_in::TIME;
    v_late_mins := EXTRACT(EPOCH FROM (v_check_in - v_shift.start_time)) / 60;
    IF v_late_mins > v_grace THEN
      INSERT INTO public.hr_late_come_early_out
        (attendance_id, employee_id, attendance_date, type, expected_time, actual_time, difference_minutes)
      VALUES
        (NEW.id, NEW.employee_id, NEW.attendance_date, 'late_come', v_shift.start_time, v_check_in, v_late_mins::INTEGER);
      NEW.late_minutes := v_late_mins::INTEGER;
    END IF;
  END IF;

  IF NEW.check_out IS NOT NULL THEN
    v_check_out := NEW.check_out::TIME;
    v_early_mins := EXTRACT(EPOCH FROM (v_shift.end_time - v_check_out)) / 60;
    IF v_early_mins > 0 THEN
      INSERT INTO public.hr_late_come_early_out
        (attendance_id, employee_id, attendance_date, type, expected_time, actual_time, difference_minutes)
      VALUES
        (NEW.id, NEW.employee_id, NEW.attendance_date, 'early_out', v_shift.end_time, v_check_out, v_early_mins::INTEGER);
      NEW.early_leave_minutes := v_early_mins::INTEGER;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Notification preferences table
CREATE TABLE IF NOT EXISTS public.hr_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL,
  notification_type TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  channel TEXT DEFAULT 'email' CHECK (channel IN ('email', 'in_app', 'both')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, notification_type)
);

ALTER TABLE public.hr_notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth can manage notification prefs" ON public.hr_notification_preferences FOR ALL TO authenticated USING (true);

-- 4. Notification log table
CREATE TABLE IF NOT EXISTS public.hr_notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  channel TEXT DEFAULT 'in_app',
  is_read BOOLEAN DEFAULT false,
  related_entity_type TEXT,
  related_entity_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.hr_notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth can view notifications" ON public.hr_notification_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth can insert notifications" ON public.hr_notification_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth can update notifications" ON public.hr_notification_log FOR UPDATE TO authenticated USING (true);

-- 5. Seed default leave notification preferences for active employees
INSERT INTO public.hr_notification_preferences (employee_id, notification_type, is_enabled, channel)
SELECT e.id, nt.type, true, 'email'
FROM public.hr_employees e
CROSS JOIN (VALUES 
  ('leave_request_submitted'),
  ('leave_request_approved'),
  ('leave_request_rejected'),
  ('leave_balance_low')
) AS nt(type)
WHERE e.is_active = true
ON CONFLICT (employee_id, notification_type) DO NOTHING;
