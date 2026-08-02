-- shift existing acknowledgements: old step 3..9 -> 4..10 (two-phase to dodge the unique index)
ALTER TABLE public.hr_payroll_cockpit_state DROP CONSTRAINT IF EXISTS hr_payroll_cockpit_state_step_no_check;
UPDATE public.hr_payroll_cockpit_state SET step_no = step_no + 100 WHERE step_no >= 3;
UPDATE public.hr_payroll_cockpit_state SET step_no = step_no - 99 WHERE step_no >= 100;
ALTER TABLE public.hr_payroll_cockpit_state
  ADD CONSTRAINT hr_payroll_cockpit_state_step_no_check CHECK (step_no BETWEEN 1 AND 10);

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
      AND t.attendance_date BETWEEN _first AND _last
  ),
  s3 AS (
    SELECT
      COUNT(*)::int AS rev_rows,
      COUNT(*) FILTER (WHERE lower(coalesce(r.status,'')) IN ('pending','scheduled','draft'))::int AS rev_pending,
      COALESCE(SUM(r.one_time_amount) FILTER (WHERE r.one_time_amount IS NOT NULL), 0)::numeric AS one_time_total
    FROM public.hr_salary_revisions r
    WHERE (r.effective_from BETWEEN _first AND _last)
       OR (r.payout_month = _first)
  ),
  s4 AS (
    SELECT COUNT(*)::int AS lop_rows,
           COUNT(*) FILTER (WHERE d.source = 'auto_lop')::int AS auto_rows,
           COUNT(*) FILTER (WHERE d.pushed_at IS NOT NULL)::int AS pushed_rows,
           COALESCE(SUM(d.lop_days) FILTER (WHERE d.source = 'auto_lop'), 0)::numeric AS auto_lop_days
    FROM public.hr_payroll_input_deductions d
    WHERE d.period_month = _first AND lower(coalesce(d.label,'')) LIKE '%lop%'
  ),
  s5 AS (
    SELECT (
      (SELECT COUNT(*) FROM public.hr_payroll_input_additions a  WHERE a.period_month = _first) +
      (SELECT COUNT(*) FROM public.hr_payroll_input_deductions d WHERE d.period_month = _first)
    )::int AS input_rows
  ),
  s5r AS (
    SELECT COUNT(*)::int AS rec_rows,
           COUNT(*) FILTER (WHERE v.status IN ('pushed','paid'))::int AS rec_pushed,
           COUNT(*) FILTER (WHERE v.status = 'failed')::int AS rec_failed,
           COALESCE(SUM(v.amount), 0)::numeric AS rec_amount
    FROM public.hr_payroll_auto_recoveries v
    WHERE v.period_month = _first
  ),
  s7 AS (
    SELECT COUNT(*)::int AS imported
    FROM public.hr_razorpay_payslip_records p
    WHERE p.period_month = _first
  ),
  s7b AS (
    SELECT COUNT(*)::int AS register_rows
    FROM public.hr_razorpay_payslip_records p
    WHERE p.period_month = _first
      AND p.reg_source_filename IS NOT NULL
  ),
  s8 AS (
    SELECT r.id, r.status, r.created_at
    FROM public.hr_shadow_payroll_runs r
    WHERE r.period_month = _first
    ORDER BY r.created_at DESC
    LIMIT 1
  ),
  s9 AS (
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
      (3::SMALLINT, 'salary_revisions', 'Salary revisions (if any) — finalise before LOP',
       'HR', FALSE,
       CASE WHEN (SELECT s.rev_pending FROM s3 s) = 0 THEN 'complete' ELSE 'incomplete' END,
       jsonb_build_object('rev_rows', (SELECT s.rev_rows FROM s3 s),
                          'rev_pending', (SELECT s.rev_pending FROM s3 s),
                          'one_time_total', (SELECT s.one_time_total FROM s3 s))),
      (4::SMALLINT, 'lop_push',         'LOP push to RazorpayX',
       'HR', FALSE,
       CASE WHEN (SELECT s.lop_rows FROM s4 s) > 0 THEN 'complete' ELSE 'incomplete' END,
       jsonb_build_object('lop_rows', (SELECT s.lop_rows FROM s4 s),
                          'auto_rows', (SELECT s.auto_rows FROM s4 s),
                          'pushed_rows', (SELECT s.pushed_rows FROM s4 s),
                          'auto_lop_days', (SELECT s.auto_lop_days FROM s4 s))),
      (5::SMALLINT, 'inputs_push',      'Inputs push (additions / deductions / recoveries / deposits)',
       'HR', FALSE,
       CASE WHEN (SELECT s.input_rows FROM s5 s) > 0 THEN 'complete' ELSE 'incomplete' END,
       jsonb_build_object('input_rows',  (SELECT s.input_rows FROM s5 s),
                          'rec_rows',    (SELECT s.rec_rows FROM s5r s),
                          'rec_pushed',  (SELECT s.rec_pushed FROM s5r s),
                          'rec_failed',  (SELECT s.rec_failed FROM s5r s),
                          'rec_amount',  (SELECT s.rec_amount FROM s5r s))),
      (6::SMALLINT, 'run_on_razorpay',  'Run payroll on RazorpayX dashboard',
       'RazorpayX operator', FALSE,
       'incomplete',
       jsonb_build_object('note', 'RazorpayX API does not expose payroll-run status; HR must acknowledge after running on dashboard.')),
      (7::SMALLINT, 'import_payslips',  'Import payslips + register CSV',
       'HR', FALSE,
       CASE WHEN (SELECT s.imported FROM s7 s) > 0 AND (SELECT s.register_rows FROM s7b s) > 0
            THEN 'complete' ELSE 'incomplete' END,
       jsonb_build_object('imported', (SELECT s.imported FROM s7 s),
                          'register_rows', (SELECT s.register_rows FROM s7b s))),
      (8::SMALLINT, 'shadow_compare',   'Shadow compare (TDS excluded, ±₹5 tolerance)',
       'HR', FALSE,
       CASE WHEN (SELECT s.id FROM s8 s) IS NOT NULL THEN 'complete' ELSE 'incomplete' END,
       jsonb_build_object('run_id', (SELECT s.id FROM s8 s),
                          'status', (SELECT s.status FROM s8 s),
                          'ran_at', (SELECT s.created_at FROM s8 s))),
      (9::SMALLINT, 'drift_review',     'Drift review (unexplained only — ±₹5 auto-tolerated)',
       'HR', FALSE,
       CASE WHEN (SELECT s.drift_open FROM s9 s) = 0 THEN 'complete' ELSE 'incomplete' END,
       jsonb_build_object('drift_open', (SELECT s.drift_open FROM s9 s))),
      (10::SMALLINT, 'close_month',     'Month closed',
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

CREATE OR REPLACE FUNCTION public.hr_close_payroll_month(_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _first DATE := date_trunc('month', _month)::date;
  _rec RECORD;
  _blockers TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NOT public.hr_payroll_cockpit_authorized(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  FOR _rec IN
    SELECT step_no, step_label, live_status, ack_status
    FROM public.hr_cockpit_month_state(_first)
    WHERE step_no <= 9
  LOOP
    IF _rec.ack_status IS DISTINCT FROM 'done'
       AND _rec.ack_status IS DISTINCT FROM 'skipped'
       AND _rec.live_status <> 'complete' THEN
      _blockers := array_append(_blockers, format('Step %s: %s', _rec.step_no, _rec.step_label));
    END IF;
  END LOOP;
  IF array_length(_blockers, 1) > 0 THEN
    RETURN jsonb_build_object('closed', false, 'blockers', to_jsonb(_blockers));
  END IF;
  PERFORM public.hr_cockpit_ack_step(_first, 10::SMALLINT, 'done', 'Month closed');
  RETURN jsonb_build_object('closed', true, 'month', _first);
END;
$function$;