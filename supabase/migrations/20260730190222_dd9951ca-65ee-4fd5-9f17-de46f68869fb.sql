CREATE OR REPLACE FUNCTION public.hr_cockpit_month_state(_month date)
 RETURNS TABLE(step_no smallint, step_key text, step_label text, actor_hint text, auto boolean, live_status text, live_detail jsonb, ack_status text, ack_actor uuid, ack_notes text, ack_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _first DATE := date_trunc('month', _month)::date;
  _last  DATE := (date_trunc('month', _month) + INTERVAL '1 month - 1 day')::date;
BEGIN
  RETURN QUERY
  WITH
  ack AS (
    SELECT c.step_no AS a_step_no, c.status AS a_status, c.actor AS a_actor,
           c.notes AS a_notes, c.acknowledged_at AS a_at
    FROM public.hr_payroll_cockpit_state c
    WHERE c.period_month = _first
  ),
  s1_rows AS (
    SELECT l.is_system, l.locked_at
    FROM public.hr_attendance_period_locks l
    WHERE (l.period_start, l.period_end) OVERLAPS (_first, _last)
    ORDER BY l.locked_at DESC
  ),
  s1 AS (
    SELECT
      (SELECT COUNT(*) FROM s1_rows)::int           AS locked_days,
      (SELECT COALESCE(bool_or(r.is_system), FALSE) FROM s1_rows r) AS has_system_lock,
      (SELECT r.locked_at FROM s1_rows r LIMIT 1)   AS latest_locked_at
  ),
  s2 AS (
    SELECT COUNT(*)::int AS stale_open
    FROM public.hr_attendance_stale_sessions t
    WHERE t.resolved_at IS NULL
      AND t.punch_in_at::date BETWEEN _first AND _last
  ),
  s3 AS (
    SELECT COUNT(*)::int AS lop_rows
    FROM public.hr_payroll_input_deductions d
    WHERE d.period_month = _first AND lower(coalesce(d.reason,'')) LIKE '%lop%'
  ),
  s4 AS (
    SELECT (
      (SELECT COUNT(*) FROM public.hr_payroll_input_additions a  WHERE a.period_month = _first) +
      (SELECT COUNT(*) FROM public.hr_payroll_input_deductions d WHERE d.period_month = _first)
    )::int AS input_rows
  ),
  s6 AS (
    SELECT COUNT(*)::int AS imported
    FROM public.hr_razorpay_payslip_records p
    WHERE p.period_month = _first
  ),
  s6b AS (
    SELECT COUNT(*)::int AS register_rows
    FROM public.hr_razorpay_payslip_records p
    WHERE p.period_month = _first
      AND p.reg_source_filename IS NOT NULL
  ),
  s7 AS (
    SELECT r.id, r.status, r.created_at
    FROM public.hr_shadow_payroll_runs r
    WHERE r.period_month = _first
    ORDER BY r.created_at DESC
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
  SELECT steps.step_no, steps.step_key, steps.step_label, steps.actor_hint, steps.auto,
         steps.live_status, steps.live_detail,
         a.a_status, a.a_actor, a.a_notes, a.a_at
  FROM (
    VALUES
      (1::SMALLINT, 'lock_attendance',  'Lock attendance period',
       'Automatic (system auto-lock 2d after month end)',
       (SELECT s.has_system_lock FROM s1 s),
       CASE WHEN (SELECT s.locked_days FROM s1 s) > 0 THEN 'complete' ELSE 'incomplete' END,
       jsonb_build_object(
         'locked_ranges',    (SELECT s.locked_days FROM s1 s),
         'has_system_lock',  (SELECT s.has_system_lock FROM s1 s),
         'latest_locked_at', (SELECT s.latest_locked_at FROM s1 s)
       )),
      (2::SMALLINT, 'watchdog_zero',    'Watchdog: zero stale sessions',
       'Automatic', TRUE,
       CASE WHEN (SELECT s.stale_open FROM s2 s) = 0 THEN 'complete' ELSE 'incomplete' END,
       jsonb_build_object('stale_open', (SELECT s.stale_open FROM s2 s))),
      (3::SMALLINT, 'lop_push',         'LOP push to RazorpayX',
       'HR', FALSE,
       CASE WHEN (SELECT s.lop_rows FROM s3 s) > 0 THEN 'complete' ELSE 'incomplete' END,
       jsonb_build_object('lop_rows', (SELECT s.lop_rows FROM s3 s))),
      (4::SMALLINT, 'inputs_push',      'Inputs push (additions / deductions / deposits / training swaps)',
       'HR', FALSE,
       CASE WHEN (SELECT s.input_rows FROM s4 s) > 0 THEN 'complete' ELSE 'incomplete' END,
       jsonb_build_object('input_rows', (SELECT s.input_rows FROM s4 s))),
      (5::SMALLINT, 'run_on_razorpay',  'Run payroll on RazorpayX dashboard',
       'RazorpayX operator', FALSE,
       'incomplete',
       jsonb_build_object('note', 'RazorpayX API does not expose payroll-run status; HR must acknowledge after running on dashboard.')),
      (6::SMALLINT, 'import_payslips',  'Import payslips + register CSV',
       'HR', FALSE,
       CASE WHEN (SELECT s.imported FROM s6 s) > 0 AND (SELECT s.register_rows FROM s6b s) > 0
            THEN 'complete' ELSE 'incomplete' END,
       jsonb_build_object('imported', (SELECT s.imported FROM s6 s),
                          'register_rows', (SELECT s.register_rows FROM s6b s))),
      (7::SMALLINT, 'shadow_compare',   'Shadow compare (TDS excluded, ±₹5 tolerance)',
       'HR', FALSE,
       CASE WHEN (SELECT s.id FROM s7 s) IS NOT NULL THEN 'complete' ELSE 'incomplete' END,
       jsonb_build_object('run_id', (SELECT s.id FROM s7 s),
                          'status', (SELECT s.status FROM s7 s),
                          'ran_at', (SELECT s.created_at FROM s7 s))),
      (8::SMALLINT, 'drift_review',     'Drift review (unexplained only — ±₹5 auto-tolerated)',
       'HR', FALSE,
       CASE WHEN (SELECT s.drift_open FROM s8 s) = 0 THEN 'complete' ELSE 'incomplete' END,
       jsonb_build_object('drift_open', (SELECT s.drift_open FROM s8 s))),
      (9::SMALLINT, 'close_month',      'Month closed',
       'HR', FALSE,
       'incomplete',
       jsonb_build_object('note', 'Closed only after all prior steps are done.'))
  ) AS steps(step_no, step_key, step_label, actor_hint, auto, live_status, live_detail)
  LEFT JOIN LATERAL (
    SELECT ack.a_status, ack.a_actor, ack.a_notes, ack.a_at
    FROM ack WHERE ack.a_step_no = steps.step_no
  ) a ON true
  ORDER BY steps.step_no;
END;
$function$;