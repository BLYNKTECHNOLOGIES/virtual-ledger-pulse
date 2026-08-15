CREATE TABLE IF NOT EXISTS public.hr_leave_worked_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  leave_request_id uuid,
  leave_type_id uuid,
  days_restored numeric NOT NULL DEFAULT 1,
  net_work_minutes integer,
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, attendance_date)
);

GRANT SELECT ON public.hr_leave_worked_days TO authenticated;
GRANT ALL ON public.hr_leave_worked_days TO service_role;

ALTER TABLE public.hr_leave_worked_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "HR staff and owner can view worked leave days" ON public.hr_leave_worked_days;
CREATE POLICY "HR staff and owner can view worked leave days"
ON public.hr_leave_worked_days FOR SELECT TO authenticated
USING (
  public.hr_is_hr_staff(auth.uid())
  OR employee_id IN (SELECT e.id FROM public.hr_employees e WHERE e.user_id = auth.uid())
);

CREATE OR REPLACE FUNCTION public.hr_reconcile_worked_leave_days(
  p_from date,
  p_to date,
  p_employee_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_count int := 0;
BEGIN
  FOR r IN
    SELECT lr.employee_id, d.attendance_date, lr.id AS leave_request_id, lr.leave_type_id,
           CASE WHEN COALESCE(lr.is_half_day, false) THEN 0.5 ELSE 1 END AS days_restored,
           COALESCE(d.net_work_minutes, 0) AS net_work_minutes
      FROM public.hr_attendance_daily d
      JOIN public.hr_leave_requests lr
        ON lr.employee_id = d.employee_id
       AND LOWER(lr.status) = 'approved'
       AND d.attendance_date BETWEEN lr.start_date AND lr.end_date
     WHERE d.attendance_date BETWEEN p_from AND p_to
       AND (p_employee_id IS NULL OR d.employee_id = p_employee_id)
       AND (COALESCE(d.net_work_minutes, 0) > 0 OR COALESCE(d.punch_count, 0) > 0)
       AND NOT EXISTS (
             SELECT 1 FROM public.hr_leave_worked_days w
              WHERE w.employee_id = d.employee_id AND w.attendance_date = d.attendance_date)
     ORDER BY d.attendance_date
  LOOP
    INSERT INTO public.hr_leave_worked_days
          (employee_id, attendance_date, leave_request_id, leave_type_id, days_restored, net_work_minutes)
    VALUES (r.employee_id, r.attendance_date, r.leave_request_id, r.leave_type_id, r.days_restored, r.net_work_minutes)
    ON CONFLICT (employee_id, attendance_date) DO NOTHING;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    -- Restore the leave balance: the day was actually worked, so it is not consumed
    IF r.leave_type_id IS NOT NULL THEN
      PERFORM public.hr_move_leave_balance(
        r.employee_id, r.leave_type_id, r.attendance_date, r.attendance_date, r.days_restored, 1);
    END IF;

    -- Attendance stays 'present' (punch driven); tag the override for audit / UI
    UPDATE public.hr_attendance_daily
       SET flags = COALESCE(flags, '{}'::jsonb)
                   || jsonb_build_object('worked_on_approved_leave', true,
                                         'leave_request_id', r.leave_request_id),
           updated_at = now()
     WHERE employee_id = r.employee_id
       AND attendance_date = r.attendance_date;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $function$;

GRANT EXECUTE ON FUNCTION public.hr_reconcile_worked_leave_days(date, date, uuid) TO authenticated, service_role;

-- LOP engine: a leave day that was actually worked must not be counted as leave
DO $do$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_lop_days_window';

  d := replace(d,
    'JOIN cal c ON c.emp_id = lv.emp_id AND c.dt = d::date AND c.is_working = true
    WHERE lv.is_paid IS NOT NULL',
    'JOIN cal c ON c.emp_id = lv.emp_id AND c.dt = d::date AND c.is_working = true
    WHERE lv.is_paid IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.hr_leave_worked_days w
                       WHERE w.employee_id = lv.emp_id AND w.attendance_date = d::date)');

  EXECUTE d;
END $do$;

SELECT cron.schedule(
  'hr-reconcile-worked-leave-days-daily',
  '50 19 * * *',
  $$SELECT public.hr_reconcile_worked_leave_days((now() AT TIME ZONE 'Asia/Kolkata')::date - 40, (now() AT TIME ZONE 'Asia/Kolkata')::date);$$
);