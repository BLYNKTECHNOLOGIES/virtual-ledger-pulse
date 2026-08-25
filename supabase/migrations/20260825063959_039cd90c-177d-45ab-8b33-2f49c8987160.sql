CREATE OR REPLACE FUNCTION public.hr_stamp_leave_attendance(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r RECORD;
  d date;
  v_offs int[];
BEGIN
  SELECT * INTO r FROM public.hr_leave_requests WHERE id = p_request_id;
  IF r IS NULL OR r.start_date IS NULL OR r.end_date IS NULL THEN RETURN; END IF;

  v_offs := public.fn_employee_weekly_off_dows(r.employee_id, r.start_date);

  d := r.start_date;
  WHILE d <= r.end_date LOOP
    IF NOT (v_offs IS NOT NULL AND EXTRACT(DOW FROM d)::int = ANY(v_offs))
       AND NOT EXISTS (SELECT 1 FROM public.hr_holidays h WHERE h.date = d AND h.is_active = true)
    THEN
      IF r.status = 'approved' THEN
        INSERT INTO public.hr_attendance_daily
          (employee_id, attendance_date, status, punch_count, session_count, total_hours,
           net_work_minutes, engine_version, flags)
        VALUES (r.employee_id, d, 'on_leave', 0, 0, 0, 0, 'v4',
                jsonb_build_object('leave_request_id', r.id, 'auto_leave', true))
        ON CONFLICT (employee_id, attendance_date) DO UPDATE
          SET status = 'on_leave',
              flags = COALESCE(public.hr_attendance_daily.flags, '{}'::jsonb)
                      || jsonb_build_object('leave_request_id', r.id, 'auto_leave', true),
              updated_at = now()
          WHERE public.hr_attendance_daily.status IN ('no_data', 'absent');
      ELSE
        -- rejected / cancelled: undo only rows we stamped
        UPDATE public.hr_attendance_daily
           SET status = 'no_data',
               flags = (COALESCE(flags, '{}'::jsonb) - 'leave_request_id') - 'auto_leave',
               updated_at = now()
         WHERE employee_id = r.employee_id
           AND attendance_date = d
           AND status = 'on_leave'
           AND COALESCE(flags->>'leave_request_id', '') = r.id::text;
      END IF;
    END IF;
    d := d + 1;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.hr_trg_stamp_leave_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.hr_stamp_leave_attendance(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_leave_stamp_attendance ON public.hr_leave_requests;
CREATE TRIGGER trg_hr_leave_stamp_attendance
AFTER INSERT OR UPDATE OF status, start_date, end_date ON public.hr_leave_requests
FOR EACH ROW EXECUTE FUNCTION public.hr_trg_stamp_leave_attendance();

REVOKE ALL ON FUNCTION public.hr_stamp_leave_attendance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_stamp_leave_attendance(uuid) TO service_role;

DO $$
DECLARE q RECORD;
BEGIN
  FOR q IN SELECT id FROM public.hr_leave_requests WHERE status = 'approved' LOOP
    PERFORM public.hr_stamp_leave_attendance(q.id);
  END LOOP;
END $$;