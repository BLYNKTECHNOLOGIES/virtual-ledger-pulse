
-- =========================================================================
-- W6 · Month-boundary auto-lock
-- =========================================================================

ALTER TABLE public.hr_attendance_period_locks
  ADD COLUMN IF NOT EXISTS is_system      BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS unlock_reason  TEXT,
  ADD COLUMN IF NOT EXISTS unlocked_by    UUID,
  ADD COLUMN IF NOT EXISTS unlocked_at    TIMESTAMPTZ;

ALTER TABLE public.hr_attendance_engine_settings
  ADD COLUMN IF NOT EXISTS auto_lock_grace_days SMALLINT NOT NULL DEFAULT 2;

-- Auto-lock RPC: system-locks any past month whose end + grace has elapsed
-- and has no overlapping lock yet. Idempotent — safe to call daily.
CREATE OR REPLACE FUNCTION public.hr_auto_lock_completed_periods()
RETURNS TABLE(locked_month DATE, period_start DATE, period_end DATE)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _grace   SMALLINT;
  _today   DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  _cutoff  DATE;
  _m       DATE;
  _ms      DATE;
  _me      DATE;
BEGIN
  SELECT auto_lock_grace_days INTO _grace
  FROM public.hr_attendance_engine_settings LIMIT 1;
  _grace := COALESCE(_grace, 2);

  -- Every month whose (end + grace) is strictly before today gets checked.
  -- Look back 6 months so a freshly enabled setting catches up any backlog.
  FOR _m IN
    SELECT (date_trunc('month', _today) - (i || ' month')::interval)::date
    FROM generate_series(1, 6) AS g(i)
  LOOP
    _ms := date_trunc('month', _m)::date;
    _me := (date_trunc('month', _m) + INTERVAL '1 month - 1 day')::date;
    _cutoff := _me + _grace;
    IF _cutoff >= _today THEN CONTINUE; END IF;

    -- Skip if any lock already overlaps this month.
    IF EXISTS (
      SELECT 1 FROM public.hr_attendance_period_locks
      WHERE (period_start, period_end + INTERVAL '1 day') OVERLAPS (_ms, _me + INTERVAL '1 day')
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.hr_attendance_period_locks
      (period_start, period_end, locked_by, locked_at, notes, is_system)
    VALUES
      (_ms, _me, NULL, now(),
       'Auto-locked by system on ' || _today::text || ' (grace ' || _grace || 'd after month end).',
       TRUE);

    locked_month := _ms;
    period_start := _ms;
    period_end   := _me;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_auto_lock_completed_periods() TO service_role;

-- Unlock RPC: Super Admin only, mandatory reason.
CREATE OR REPLACE FUNCTION public.hr_unlock_attendance_period(
  _period_start DATE,
  _period_end   DATE,
  _reason       TEXT
)
RETURNS TABLE(unlocked_ids UUID[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _ids UUID[];
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = _uid AND lower(r.name) IN ('super admin','super_admin','superadmin')
  ) THEN
    RAISE EXCEPTION 'Only Super Admin can unlock attendance periods';
  END IF;
  IF _reason IS NULL OR char_length(btrim(_reason)) < 10 THEN
    RAISE EXCEPTION 'Unlock reason must be at least 10 characters';
  END IF;

  DELETE FROM public.hr_attendance_period_locks
  WHERE period_start = _period_start
    AND period_end   = _period_end
  RETURNING id INTO _ids;

  -- Also write an audit row so the intervention strip picks it up.
  INSERT INTO public.hr_attendance_intervention_log
    (event_type, actor, notes, occurred_at)
  SELECT 'period_unlock', _uid,
         'Unlocked ' || _period_start || '→' || _period_end || ' · Reason: ' || _reason,
         now()
  WHERE EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'hr_attendance_intervention_log'
  );

  unlocked_ids := _ids;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_unlock_attendance_period(DATE, DATE, TEXT) TO authenticated;

-- =========================================================================
-- Cockpit: refresh s1 to expose whether the lock is system-created.
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
  WITH
  ack AS (
    SELECT step_no, status, actor, notes, acknowledged_at
    FROM public.hr_payroll_cockpit_state
    WHERE period_month = _first
  ),
  s1_rows AS (
    SELECT is_system, locked_at
    FROM public.hr_attendance_period_locks
    WHERE (period_start, period_end) OVERLAPS (_first, _last)
    ORDER BY locked_at DESC
  ),
  s1 AS (
    SELECT
      (SELECT COUNT(*) FROM s1_rows)::int           AS locked_days,
      (SELECT COALESCE(bool_or(is_system), FALSE) FROM s1_rows) AS has_system_lock,
      (SELECT locked_at FROM s1_rows LIMIT 1)       AS latest_locked_at
  ),
  s2 AS (
    SELECT COUNT(*)::int AS stale_open
    FROM public.hr_attendance_stale_sessions
    WHERE resolved_at IS NULL
      AND punch_in_at::date BETWEEN _first AND _last
  ),
  s3 AS (
    SELECT COUNT(*)::int AS lop_rows
    FROM public.hr_payroll_input_deductions
    WHERE period_month = _first AND lower(coalesce(reason,'')) LIKE '%lop%'
  ),
  s4 AS (
    SELECT (
      (SELECT COUNT(*) FROM public.hr_payroll_input_additions  WHERE period_month = _first) +
      (SELECT COUNT(*) FROM public.hr_payroll_input_deductions WHERE period_month = _first)
    )::int AS input_rows
  ),
  s6 AS (
    SELECT COUNT(*)::int AS imported
    FROM public.hr_razorpay_payslip_records
    WHERE period_month = _first
  ),
  s6b AS (
    SELECT COUNT(*)::int AS register_rows
    FROM public.hr_razorpay_payslip_records
    WHERE period_month = _first
      AND reg_source_filename IS NOT NULL
  ),
  s7 AS (
    SELECT id, status, created_at
    FROM public.hr_shadow_payroll_runs
    WHERE period_month = _first
    ORDER BY created_at DESC
    LIMIT 1
  ),
  s8 AS (
    SELECT COUNT(*)::int AS drift_open
    FROM public.hr_drift_alerts d
    WHERE d.resolved_at IS NULL
      AND COALESCE(d.auto_status, 'open') = 'open'
      AND (d.first_seen_at::date BETWEEN _first AND _last
           OR d.last_seen_at::date BETWEEN _first AND _last)
  )
  SELECT * FROM (
    VALUES
      (1::SMALLINT, 'lock_attendance',  'Lock attendance period',
       'Automatic (system auto-lock 2d after month end)',
       (SELECT has_system_lock FROM s1),
       CASE WHEN (SELECT locked_days FROM s1) > 0 THEN 'complete' ELSE 'incomplete' END,
       jsonb_build_object(
         'locked_ranges',    (SELECT locked_days FROM s1),
         'has_system_lock',  (SELECT has_system_lock FROM s1),
         'latest_locked_at', (SELECT latest_locked_at FROM s1)
       )),
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
      (8::SMALLINT, 'drift_review',     'Drift review (unexplained only — ±₹5 auto-tolerated)',
       'HR', FALSE,
       CASE WHEN (SELECT drift_open FROM s8) = 0 THEN 'complete' ELSE 'incomplete' END,
       jsonb_build_object('drift_open', (SELECT drift_open FROM s8))),
      (9::SMALLINT, 'close_month',      'Month closed',
       'HR', FALSE,
       'incomplete',
       jsonb_build_object('note', 'Closed only after all prior steps are done.'))
  ) AS steps(step_no, step_key, step_label, actor_hint, auto, live_status, live_detail)
  LEFT JOIN LATERAL (
    SELECT status AS ack_status, actor AS ack_actor, notes AS ack_notes, acknowledged_at AS ack_at
    FROM ack WHERE ack.step_no = steps.step_no
  ) a ON true
  ORDER BY steps.step_no;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_cockpit_month_state(DATE) TO authenticated, service_role;

-- =========================================================================
-- W7 · Payslip-import coverage receipt
-- =========================================================================

ALTER TABLE public.hr_razorpay_sync_log
  ADD COLUMN IF NOT EXISTS coverage_json JSONB;

CREATE OR REPLACE FUNCTION public.hr_payslip_import_coverage(_month DATE)
RETURNS TABLE (
  period_month     DATE,
  expected_count   INT,
  imported_count   INT,
  excluded_count   INT,
  missing_names    TEXT[],
  missing_details  JSONB
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
  WITH
  emps AS (
    SELECT
      e.id                                   AS hr_id,
      trim(e.first_name || ' ' || e.last_name) AS full_name,
      e.badge_id,
      e.is_active,
      e.last_working_day,
      w.joining_date,
      map.razorpay_employee_id
    FROM public.hr_employees e
    LEFT JOIN public.hr_employee_work_info w ON w.employee_id = e.id
    LEFT JOIN public.hr_razorpay_employee_map map ON map.hr_employee_id = e.id
  ),
  classified AS (
    SELECT
      hr_id, full_name, badge_id,
      CASE
        WHEN razorpay_employee_id IS NULL                                        THEN 'unmapped'
        WHEN joining_date IS NOT NULL AND joining_date > _last                   THEN 'joined_after_month'
        WHEN last_working_day IS NOT NULL AND last_working_day < _first          THEN 'dismissed_before_month'
        WHEN is_active = FALSE
             AND (last_working_day IS NULL OR last_working_day < _first)        THEN 'dismissed_before_month'
        ELSE 'expected'
      END AS bucket
    FROM emps
  ),
  imported AS (
    SELECT DISTINCT hr_employee_id FROM public.hr_razorpay_payslip_records
    WHERE period_month = _first AND hr_employee_id IS NOT NULL
  ),
  missing AS (
    SELECT c.hr_id, c.full_name, c.badge_id
    FROM classified c
    WHERE c.bucket = 'expected'
      AND c.hr_id NOT IN (SELECT hr_employee_id FROM imported)
  )
  SELECT
    _first AS period_month,
    (SELECT COUNT(*)::int FROM classified WHERE bucket = 'expected'),
    (SELECT COUNT(*)::int FROM imported),
    (SELECT COUNT(*)::int FROM classified WHERE bucket <> 'expected'),
    COALESCE(array_agg(full_name ORDER BY full_name) FILTER (WHERE full_name IS NOT NULL), ARRAY[]::text[]),
    COALESCE(jsonb_agg(jsonb_build_object('hr_id', hr_id, 'name', full_name, 'badge_id', badge_id) ORDER BY full_name)
             FILTER (WHERE hr_id IS NOT NULL), '[]'::jsonb)
  FROM missing;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_payslip_import_coverage(DATE) TO authenticated, service_role;

-- Last coverage snapshot view — reads from the most recent pull_payslips log row.
CREATE OR REPLACE VIEW public.hr_payslip_last_coverage_v AS
SELECT
  l.created_at   AS ran_at,
  l.coverage_json AS coverage,
  (l.coverage_json->>'period_month')::date               AS period_month,
  COALESCE((l.coverage_json->>'expected_count')::int, 0) AS expected_count,
  COALESCE((l.coverage_json->>'imported_count')::int, 0) AS imported_count,
  COALESCE((l.coverage_json->>'excluded_count')::int, 0) AS excluded_count,
  COALESCE(jsonb_array_length(l.coverage_json->'missing_names'), 0) AS missing_count
FROM public.hr_razorpay_sync_log l
WHERE l.action = 'pull_payslips'::hr_razorpay_sync_action
  AND l.coverage_json IS NOT NULL
ORDER BY l.created_at DESC
LIMIT 1;

GRANT SELECT ON public.hr_payslip_last_coverage_v TO authenticated, service_role;
