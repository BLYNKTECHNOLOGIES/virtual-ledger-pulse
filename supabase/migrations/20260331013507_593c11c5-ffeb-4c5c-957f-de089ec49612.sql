
CREATE OR REPLACE FUNCTION public.refresh_hour_accounts(p_year integer DEFAULT NULL, p_month integer DEFAULT NULL)
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
      hour_account_second, hour_pending_second, overtime_second
    ) VALUES (
      v_rec.employee_id::UUID, LOWER(v_month_name), v_month, v_year,
      v_worked_seconds, v_pending_seconds, v_overtime_seconds
    )
    ON CONFLICT (employee_id, month_sequence, year)
    DO UPDATE SET
      hour_account_second = EXCLUDED.hour_account_second,
      hour_pending_second = EXCLUDED.hour_pending_second,
      overtime_second = EXCLUDED.overtime_second,
      updated_at = NOW();
  END LOOP;
END;
$$;
