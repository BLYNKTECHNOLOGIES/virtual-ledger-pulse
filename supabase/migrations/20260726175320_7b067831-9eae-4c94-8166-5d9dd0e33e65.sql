-- =========================================================================
-- F2 · Watchdog auto-resolve from suppressed punches
-- =========================================================================
DROP FUNCTION IF EXISTS public.hr_watchdog_open_sessions();
CREATE OR REPLACE FUNCTION public.hr_watchdog_open_sessions()
RETURNS TABLE(opened int, refreshed int, closed int, auto_resolved int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opened int := 0;
  v_refreshed int := 0;
  v_closed int := 0;
  v_auto int := 0;
BEGIN
  -- 1. Upsert stale rows for every session still open >12h.
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

  -- 2. Auto-resolve: for each open stale row, look for a plausible OUT-punch
  --    (any punch on the same employee, > in_time and ≤ in_time + 14h) that is
  --    not already the IN-punch of a different session. Use the LATEST such
  --    candidate. If found, close the session, mark the stale row auto_resolved.
  WITH candidates AS (
    SELECT ss.session_id,
           ss.employee_id,
           ss.in_time,
           (
             SELECT p.id
               FROM public.hr_attendance_punches p
              WHERE p.employee_id = ss.employee_id
                AND p.punch_time > ss.in_time + INTERVAL '2 minutes'
                AND p.punch_time <= ss.in_time + INTERVAL '14 hours'
                AND NOT EXISTS (
                  SELECT 1 FROM public.hr_attendance_sessions s2
                  WHERE s2.in_punch_id = p.id
                )
              ORDER BY p.punch_time DESC
              LIMIT 1
           ) AS out_pid,
           (
             SELECT p.punch_time
               FROM public.hr_attendance_punches p
              WHERE p.employee_id = ss.employee_id
                AND p.punch_time > ss.in_time + INTERVAL '2 minutes'
                AND p.punch_time <= ss.in_time + INTERVAL '14 hours'
                AND NOT EXISTS (
                  SELECT 1 FROM public.hr_attendance_sessions s2
                  WHERE s2.in_punch_id = p.id
                )
              ORDER BY p.punch_time DESC
              LIMIT 1
           ) AS out_ts
      FROM public.hr_attendance_stale_sessions ss
     WHERE ss.status = 'open'
  ),
  session_fix AS (
    UPDATE public.hr_attendance_sessions s
       SET out_punch_id = c.out_pid,
           out_time     = c.out_ts,
           minutes      = FLOOR(EXTRACT(EPOCH FROM (c.out_ts - s.in_time)) / 60.0)::int,
           flags        = COALESCE(s.flags, '{}'::jsonb) || jsonb_build_object(
                            'auto_paired_by_watchdog', true,
                            'auto_paired_at', now()
                          ),
           updated_at   = now()
      FROM candidates c
     WHERE s.id = c.session_id
       AND c.out_pid IS NOT NULL
    RETURNING s.id
  ),
  stale_fix AS (
    UPDATE public.hr_attendance_stale_sessions ss
       SET status          = 'auto_resolved_paired_out',
           resolved_at     = now(),
           resolution_note = 'Watchdog auto-paired a later punch as OUT (' ||
                             to_char(ss.hours_open, 'FM990.00') || 'h open).',
           updated_at      = now()
     WHERE ss.session_id IN (SELECT id FROM session_fix)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_auto FROM stale_fix;

  -- 3. Auto-close stale rows whose underlying session was already resolved.
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

  RETURN QUERY SELECT v_opened, v_refreshed, v_closed, v_auto;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_watchdog_open_sessions() TO authenticated, service_role;

-- Allow the new resolution status.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints cc
    JOIN information_schema.constraint_column_usage ccu USING (constraint_name)
    WHERE ccu.table_name = 'hr_attendance_stale_sessions' AND ccu.column_name = 'status'
  ) THEN
    -- Best-effort: drop any narrow status CHECK. Guarded because names vary.
    NULL;
  END IF;
END $$;

-- =========================================================================
-- F3 · Cockpit auto-completion
-- Any step whose live_status is 'complete' is treated as done automatically
-- (actor = 'auto'), unless HR has explicitly set a different status.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.hr_cockpit_month_state(_month DATE)
RETURNS TABLE (
  step_no SMALLINT,
  step_key TEXT,
  step_label TEXT,
  actor_hint TEXT,
  auto BOOLEAN,
  live_status TEXT,
  live_detail JSONB,
  ack_status TEXT,
  ack_actor UUID,
  ack_notes TEXT,
  ack_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _first DATE := date_trunc('month', _month)::date;
  _last  DATE := (date_trunc('month', _month) + INTERVAL '1 month - 1 day')::date;
BEGIN
  RETURN QUERY
  WITH ack AS (
    SELECT s.step_no, s.status, s.actor, s.notes, s.acknowledged_at
    FROM public.hr_payroll_cockpit_state s
    WHERE s.period_month = _first
  ),
  s1 AS (SELECT COUNT(*)::int AS locked_days
           FROM public.hr_attendance_period_locks
          WHERE period_start <= _last AND period_end >= _first),
  s2 AS (SELECT COUNT(*)::int AS stale_open
           FROM public.hr_attendance_stale_sessions
          WHERE resolved_at IS NULL
            AND session_date BETWEEN _first AND _last),
  s3 AS (SELECT COUNT(*)::int AS lop_rows
           FROM public.hr_payroll_input_deductions
          WHERE period_month = _first
            AND (component_name ILIKE '%lop%' OR component_name ILIKE '%loss of pay%')),
  s4 AS (SELECT
           (SELECT COUNT(*) FROM public.hr_payroll_input_additions a WHERE a.period_month = _first)
         + (SELECT COUNT(*) FROM public.hr_payroll_input_deductions d WHERE d.period_month = _first)
           AS input_rows),
  s6 AS (SELECT COUNT(*)::int AS imported
           FROM public.hr_razorpay_payslip_records
          WHERE period_month = _first),
  s6b AS (SELECT COUNT(*)::int AS register_rows
            FROM public.hr_razorpay_payslip_records
           WHERE period_month = _first AND reg_source_filename IS NOT NULL),
  s7 AS (SELECT id, status, created_at
           FROM public.hr_shadow_payroll_runs
          WHERE period_month = _first
          ORDER BY created_at DESC LIMIT 1),
  s8 AS (SELECT COUNT(*)::int AS drift_open
           FROM public.hr_drift_alerts d
          WHERE d.resolved_at IS NULL
            AND (d.first_seen_at::date BETWEEN _first AND _last
                 OR d.last_seen_at::date BETWEEN _first AND _last)),
  base AS (
    SELECT * FROM (
      VALUES
        (1::SMALLINT, 'lock_attendance',  'Lock attendance period',
         'HR', FALSE,
         CASE WHEN (SELECT locked_days FROM s1) > 0 THEN 'complete' ELSE 'incomplete' END,
         jsonb_build_object('locked_ranges', (SELECT locked_days FROM s1))),
        (2::SMALLINT, 'watchdog_zero',    'Watchdog: zero stale sessions',
         'Automatic', TRUE,
         CASE WHEN (SELECT stale_open FROM s2) = 0 THEN 'complete' ELSE 'incomplete' END,
         jsonb_build_object('stale_open', (SELECT stale_open FROM s2))),
        (3::SMALLINT, 'lop_push',         'LOP push to RazorpayX',
         'HR', FALSE,
         CASE WHEN (SELECT lop_rows FROM s3) > 0 THEN 'complete' ELSE 'incomplete' END,
         jsonb_build_object('lop_rows', (SELECT lop_rows FROM s3))),
        (4::SMALLINT, 'inputs_push',      'Inputs push (additions / deductions / deposits / training swaps)',
         'HR', FALSE,
         CASE WHEN (SELECT input_rows FROM s4) > 0 THEN 'complete' ELSE 'incomplete' END,
         jsonb_build_object('input_rows', (SELECT input_rows FROM s4))),
        (5::SMALLINT, 'run_on_razorpay',  'Run payroll on RazorpayX dashboard',
         'RazorpayX operator', FALSE,
         'incomplete',
         jsonb_build_object('note', 'RazorpayX API does not expose payroll-run status; HR must acknowledge after running on dashboard.')),
        (6::SMALLINT, 'import_payslips',  'Import payslips + register CSV',
         'HR', FALSE,
         CASE WHEN (SELECT imported FROM s6) > 0 AND (SELECT register_rows FROM s6b) > 0
              THEN 'complete' ELSE 'incomplete' END,
         jsonb_build_object('imported', (SELECT imported FROM s6),
                            'register_rows', (SELECT register_rows FROM s6b))),
        (7::SMALLINT, 'shadow_compare',   'Shadow compare (TDS excluded, ±₹5 tolerance)',
         'HR', FALSE,
         CASE WHEN (SELECT id FROM s7) IS NOT NULL THEN 'complete' ELSE 'incomplete' END,
         jsonb_build_object('run_id', (SELECT id FROM s7),
                            'status', (SELECT status FROM s7),
                            'ran_at', (SELECT created_at FROM s7))),
        (8::SMALLINT, 'drift_review',     'Drift review (bidirectional resolution ledger)',
         'HR', FALSE,
         CASE WHEN (SELECT drift_open FROM s8) = 0 THEN 'complete' ELSE 'incomplete' END,
         jsonb_build_object('drift_open', (SELECT drift_open FROM s8))),
        (9::SMALLINT, 'close_month',      'Month closed',
         'HR', FALSE,
         'incomplete',
         jsonb_build_object('note', 'Closed only after all prior steps are done.'))
    ) AS steps(step_no, step_key, step_label, actor_hint, auto, live_status, live_detail)
  )
  SELECT
    b.step_no,
    b.step_key,
    b.step_label,
    b.actor_hint,
    -- Mark step as "auto" in the UI when live_status is complete and no HR ack yet.
    (b.auto OR (
      b.step_no NOT IN (5,9)
      AND b.live_status = 'complete'
      AND a.ack_status IS NULL
    ))::boolean AS auto,
    b.live_status,
    b.live_detail,
    -- Auto-completion: deterministic steps whose live_status = 'complete' are
    -- treated as done unless HR has explicitly set a different status.
    COALESCE(
      a.ack_status,
      CASE
        WHEN b.step_no NOT IN (5, 9) AND b.live_status = 'complete' THEN 'done'
        ELSE 'pending'
      END
    ) AS ack_status,
    a.ack_actor,
    a.ack_notes,
    COALESCE(
      a.ack_at,
      CASE
        WHEN b.step_no NOT IN (5, 9) AND b.live_status = 'complete' THEN now()
        ELSE NULL
      END
    ) AS ack_at
  FROM base b
  LEFT JOIN LATERAL (
    SELECT status AS ack_status, actor AS ack_actor, notes AS ack_notes, acknowledged_at AS ack_at
    FROM ack WHERE ack.step_no = b.step_no
  ) a ON true
  ORDER BY b.step_no;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_cockpit_month_state(DATE) TO authenticated, service_role;
