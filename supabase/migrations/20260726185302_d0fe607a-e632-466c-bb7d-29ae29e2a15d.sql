-- Update s8 in hr_cockpit_month_state to only count unexplained drift
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
  s1 AS (
    SELECT COUNT(*)::int AS locked_days
    FROM public.hr_attendance_period_locks
    WHERE (period_start, period_end) OVERLAPS (_first, _last)
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
  s8 AS ( -- UNEXPLAINED drift only (F8 triage)
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