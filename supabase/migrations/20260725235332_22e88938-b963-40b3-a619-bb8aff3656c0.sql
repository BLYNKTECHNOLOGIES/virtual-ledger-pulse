
-- =========================================================
-- Slice 2: stale-session watchdog
-- =========================================================

CREATE TABLE IF NOT EXISTS public.hr_attendance_stale_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE REFERENCES public.hr_attendance_sessions(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  in_time timestamptz NOT NULL,
  hours_open numeric NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'resolved_set_out_time', 'resolved_confirm_long_shift', 'resolved_voided'
  )),
  resolution_note text,
  resolved_by uuid,
  resolved_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_stale_sessions_status ON public.hr_attendance_stale_sessions(status);
CREATE INDEX IF NOT EXISTS idx_hr_stale_sessions_employee ON public.hr_attendance_stale_sessions(employee_id, status);

GRANT SELECT, INSERT, UPDATE ON public.hr_attendance_stale_sessions TO authenticated;
GRANT ALL ON public.hr_attendance_stale_sessions TO service_role;

ALTER TABLE public.hr_attendance_stale_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR reads all stale sessions"
  ON public.hr_attendance_stale_sessions FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'Super Admin')
    OR public.has_role(auth.uid(), 'Admin')
    OR public.has_role(auth.uid(), 'HR Manager')
    OR public.has_role(auth.uid(), 'hr')
    OR public.has_role(auth.uid(), 'super_admin')
    OR EXISTS (
      SELECT 1 FROM public.hr_employees e
      WHERE e.id = hr_attendance_stale_sessions.employee_id
        AND e.user_id = auth.uid()
    )
  );

CREATE POLICY "HR writes stale sessions"
  ON public.hr_attendance_stale_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'Super Admin')
    OR public.has_role(auth.uid(), 'Admin')
    OR public.has_role(auth.uid(), 'HR Manager')
    OR public.has_role(auth.uid(), 'hr')
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "HR updates stale sessions"
  ON public.hr_attendance_stale_sessions FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'Super Admin')
    OR public.has_role(auth.uid(), 'Admin')
    OR public.has_role(auth.uid(), 'HR Manager')
    OR public.has_role(auth.uid(), 'hr')
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE OR REPLACE FUNCTION public.hr_watchdog_open_sessions()
RETURNS TABLE(opened int, refreshed int, closed int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opened int := 0;
  v_refreshed int := 0;
  v_closed int := 0;
BEGIN
  -- Upsert stale rows for every session still open >12h.
  WITH stale AS (
    SELECT s.id AS session_id,
           s.employee_id,
           s.attendance_date,
           s.in_time,
           ROUND(EXTRACT(EPOCH FROM (now() - s.in_time)) / 3600.0, 2)::numeric AS hours_open
    FROM public.hr_attendance_sessions s
    WHERE s.out_time IS NULL
      AND s.in_time < now() - INTERVAL '12 hours'
  ),
  upserted AS (
    INSERT INTO public.hr_attendance_stale_sessions
      (session_id, employee_id, attendance_date, in_time, hours_open, status, first_seen_at, last_seen_at)
    SELECT session_id, employee_id, attendance_date, in_time, hours_open, 'open', now(), now()
    FROM stale
    ON CONFLICT (session_id) DO UPDATE
      SET hours_open   = EXCLUDED.hours_open,
          last_seen_at = now(),
          updated_at   = now()
    RETURNING xmax = 0 AS inserted
  )
  SELECT
    COUNT(*) FILTER (WHERE inserted),
    COUNT(*) FILTER (WHERE NOT inserted)
  INTO v_opened, v_refreshed FROM upserted;

  -- Auto-close rows whose underlying session was resolved outside this fn
  -- (session closed by a new out-punch → out_time IS NOT NULL, or session deleted).
  WITH closed_rows AS (
    UPDATE public.hr_attendance_stale_sessions ss
       SET status = CASE WHEN ss.status = 'open' THEN 'resolved_set_out_time' ELSE ss.status END,
           resolved_at = COALESCE(ss.resolved_at, now()),
           resolution_note = COALESCE(ss.resolution_note, 'Auto-closed by watchdog (session now closed).'),
           updated_at = now()
     WHERE ss.status = 'open'
       AND NOT EXISTS (
         SELECT 1 FROM public.hr_attendance_sessions s
         WHERE s.id = ss.session_id AND s.out_time IS NULL
       )
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_closed FROM closed_rows;

  RETURN QUERY SELECT v_opened, v_refreshed, v_closed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_watchdog_open_sessions() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hr_resolve_stale_session(
  p_session_id uuid,
  p_resolution text,
  p_out_time timestamptz DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_watchdog_hours numeric := 14;
  v_capped_out timestamptz;
  v_out_punch_id uuid;
  v_wdate date;
BEGIN
  IF p_resolution NOT IN ('set_out_time','confirm_long_shift','void') THEN
    RAISE EXCEPTION 'Invalid resolution: %', p_resolution;
  END IF;

  SELECT s.*, ss.id AS stale_id
    INTO v_session
    FROM public.hr_attendance_sessions s
    LEFT JOIN public.hr_attendance_stale_sessions ss ON ss.session_id = s.id
   WHERE s.id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;
  IF v_session.out_time IS NOT NULL THEN
    RAISE EXCEPTION 'Session is already closed';
  END IF;

  SELECT COALESCE(watchdog_hours, 14) INTO v_watchdog_hours
    FROM public.hr_attendance_engine_settings LIMIT 1;

  IF p_resolution = 'set_out_time' THEN
    IF p_out_time IS NULL THEN RAISE EXCEPTION 'p_out_time is required for set_out_time'; END IF;
    IF p_out_time <= v_session.in_time THEN
      RAISE EXCEPTION 'Out-time must be after in-time (in: %, out: %)', v_session.in_time, p_out_time;
    END IF;

    -- Insert a manual out-punch. Engine rebuild will pair it with the open in.
    INSERT INTO public.hr_attendance_punches
      (employee_id, badge_id, punch_time, punch_type, device_name, effective, suppressed_reason, verified)
    SELECT v_session.employee_id, e.badge_id, p_out_time, 'out', 'hr_manual_resolution', true, NULL, true
      FROM public.hr_employees e WHERE e.id = v_session.employee_id
    RETURNING id INTO v_out_punch_id;

    v_wdate := public.hr_v4_window_date_of(v_session.in_time);
    PERFORM public.hr_v4_recompute_range(v_session.employee_id, v_wdate, v_wdate);

    UPDATE public.hr_attendance_stale_sessions
       SET status = 'resolved_set_out_time',
           resolved_at = now(),
           resolved_by = auth.uid(),
           resolution_note = COALESCE(p_note, 'HR set out-time manually'),
           updated_at = now()
     WHERE session_id = p_session_id;

  ELSIF p_resolution = 'confirm_long_shift' THEN
    -- Cap the shift at watchdog_hours + 2h to bound the working time.
    v_capped_out := v_session.in_time + (v_watchdog_hours + 2) * INTERVAL '1 hour';

    INSERT INTO public.hr_attendance_punches
      (employee_id, badge_id, punch_time, punch_type, device_name, effective, suppressed_reason, verified)
    SELECT v_session.employee_id, e.badge_id, v_capped_out, 'out', 'hr_long_shift_confirmed', true, NULL, true
      FROM public.hr_employees e WHERE e.id = v_session.employee_id
    RETURNING id INTO v_out_punch_id;

    v_wdate := public.hr_v4_window_date_of(v_session.in_time);
    PERFORM public.hr_v4_recompute_range(v_session.employee_id, v_wdate, v_wdate);

    UPDATE public.hr_attendance_stale_sessions
       SET status = 'resolved_confirm_long_shift',
           resolved_at = now(),
           resolved_by = auth.uid(),
           resolution_note = COALESCE(p_note, format('HR confirmed long shift; out capped at %s', v_capped_out)),
           updated_at = now()
     WHERE session_id = p_session_id;

  ELSIF p_resolution = 'void' THEN
    -- Delete the offending in-punch so the day rebuilds without the open session.
    DELETE FROM public.hr_attendance_punches WHERE id = v_session.in_punch_id;

    v_wdate := public.hr_v4_window_date_of(v_session.in_time);
    PERFORM public.hr_v4_recompute_range(v_session.employee_id, v_wdate, v_wdate);

    UPDATE public.hr_attendance_stale_sessions
       SET status = 'resolved_voided',
           resolved_at = now(),
           resolved_by = auth.uid(),
           resolution_note = COALESCE(p_note, 'HR voided the session (forgotten in-punch)'),
           updated_at = now()
     WHERE session_id = p_session_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'session_id', p_session_id,
    'resolution', p_resolution,
    'out_punch_id', v_out_punch_id,
    'window_date', v_wdate
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_resolve_stale_session(uuid, text, timestamptz, text) TO authenticated, service_role;

-- =========================================================
-- Slice 3 support: audit log for daily absent marker
-- =========================================================

CREATE TABLE IF NOT EXISTS public.hr_attendance_absent_marker_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  window_date date NOT NULL,
  ran_at timestamptz NOT NULL DEFAULT now(),
  marked_count int NOT NULL DEFAULT 0,
  skipped_leave int NOT NULL DEFAULT 0,
  skipped_weekly_off int NOT NULL DEFAULT 0,
  skipped_holiday boolean NOT NULL DEFAULT false,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_absent_marker_runs_date ON public.hr_attendance_absent_marker_runs(window_date DESC);

GRANT SELECT ON public.hr_attendance_absent_marker_runs TO authenticated;
GRANT ALL ON public.hr_attendance_absent_marker_runs TO service_role;

ALTER TABLE public.hr_attendance_absent_marker_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR reads absent-marker audit"
  ON public.hr_attendance_absent_marker_runs FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'Super Admin')
    OR public.has_role(auth.uid(), 'Admin')
    OR public.has_role(auth.uid(), 'HR Manager')
    OR public.has_role(auth.uid(), 'hr')
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- =========================================================
-- Slice 4: day drill-down RPC ("show the working")
-- =========================================================

CREATE OR REPLACE FUNCTION public.hr_attendance_day_detail(
  p_employee_id uuid,
  p_date date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_daily RECORD;
  v_punches jsonb;
  v_sessions jsonb;
  v_stale jsonb;
  v_reg jsonb;
  v_window_start timestamptz;
  v_window_end timestamptz;
BEGIN
  -- 05:00 IST → 05:00 IST window that owns this window-date.
  v_window_start := ((p_date::text) || ' 05:00:00 Asia/Kolkata')::timestamptz;
  v_window_end   := (((p_date + 1)::text) || ' 05:00:00 Asia/Kolkata')::timestamptz;

  SELECT * INTO v_daily
    FROM public.hr_attendance_daily
   WHERE employee_id = p_employee_id
     AND attendance_date = p_date
   LIMIT 1;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'punch_time', p.punch_time,
      'punch_type', p.punch_type,
      'device_name', p.device_name,
      'device_serial', p.device_serial,
      'effective', p.effective,
      'suppressed_reason', p.suppressed_reason,
      'raw_status', p.raw_status
    ) ORDER BY p.punch_time
  ), '[]'::jsonb) INTO v_punches
    FROM public.hr_attendance_punches p
   WHERE p.employee_id = p_employee_id
     AND p.punch_time >= v_window_start
     AND p.punch_time < v_window_end;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'session_no', s.session_no,
      'in_time', s.in_time,
      'out_time', s.out_time,
      'minutes', s.minutes,
      'flags', s.flags,
      'is_open', s.out_time IS NULL
    ) ORDER BY s.session_no
  ), '[]'::jsonb) INTO v_sessions
    FROM public.hr_attendance_sessions s
   WHERE s.employee_id = p_employee_id
     AND s.attendance_date = p_date;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', ss.id, 'session_id', ss.session_id, 'status', ss.status,
      'hours_open', ss.hours_open, 'resolved_at', ss.resolved_at,
      'resolution_note', ss.resolution_note
    )), '[]'::jsonb) INTO v_stale
    FROM public.hr_attendance_stale_sessions ss
   WHERE ss.employee_id = p_employee_id
     AND ss.attendance_date = p_date;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', r.id, 'status', r.status, 'requested_check_in', r.requested_check_in,
      'requested_check_out', r.requested_check_out, 'reason', r.reason
    )), '[]'::jsonb) INTO v_reg
    FROM public.hr_attendance_regularization_requests r
   WHERE r.employee_id = p_employee_id
     AND r.attendance_date = p_date;

  RETURN jsonb_build_object(
    'employee_id', p_employee_id,
    'window_date', p_date,
    'window_start', v_window_start,
    'window_end', v_window_end,
    'daily', CASE WHEN v_daily.id IS NULL THEN NULL ELSE jsonb_build_object(
      'status', v_daily.status,
      'first_in', v_daily.first_in,
      'last_out', v_daily.last_out,
      'total_hours', v_daily.total_hours,
      'net_work_minutes', v_daily.net_work_minutes,
      'break_minutes', v_daily.break_minutes,
      'lunch_minutes', v_daily.lunch_minutes,
      'session_count', v_daily.session_count,
      'suppressed_count', v_daily.suppressed_count,
      'is_late', v_daily.is_late,
      'late_by_minutes', v_daily.late_by_minutes,
      'early_departure', v_daily.early_departure,
      'early_by_minutes', v_daily.early_by_minutes,
      'engine_version', v_daily.engine_version,
      'flags', v_daily.flags
    ) END,
    'punches', v_punches,
    'sessions', v_sessions,
    'stale_sessions', v_stale,
    'regularizations', v_reg
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_attendance_day_detail(uuid, date) TO authenticated, service_role;
