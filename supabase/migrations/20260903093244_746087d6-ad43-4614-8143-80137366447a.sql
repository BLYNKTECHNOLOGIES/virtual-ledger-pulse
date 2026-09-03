-- 1) Renumber acknowledgement rows: steps >= 3 shift by +1
ALTER TABLE public.hr_payroll_cockpit_state DROP CONSTRAINT IF EXISTS hr_payroll_cockpit_state_step_no_check;
UPDATE public.hr_payroll_cockpit_state SET step_no = step_no + 100 WHERE step_no >= 3;
UPDATE public.hr_payroll_cockpit_state SET step_no = step_no - 99 WHERE step_no >= 100;
ALTER TABLE public.hr_payroll_cockpit_state
  ADD CONSTRAINT hr_payroll_cockpit_state_step_no_check CHECK (step_no BETWEEN 1 AND 11);

-- 2) Rebuild the cockpit state function with the new step 3
CREATE OR REPLACE FUNCTION public.hr_cockpit_month_state(_month date)
 RETURNS TABLE(step_no smallint, step_key text, step_label text, actor_hint text, auto boolean, live_status text, live_detail jsonb, ack_status text, ack_actor uuid, ack_notes text, ack_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
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
  -- Separations & F&F for this payroll cycle. A settlement belongs to the
  -- cycle it is tagged for; untagged legacy rows fall back to the month of
  -- their last working day.
  sfnf AS (
    SELECT f.id, f.employee_id, lower(COALESCE(f.status,'')) AS st,
           lower(COALESCE(f.razorpay_push_status,'')) AS push
    FROM public.hr_fnf_settlements f
    WHERE lower(COALESCE(f.status,'')) <> 'cancelled'
      AND date_trunc('month', COALESCE(f.payroll_month, f.last_working_day))::date = _first
  ),
  sfnf_agg AS (
    SELECT COUNT(*)::int AS fnf_total,
           COUNT(*) FILTER (WHERE x.st IN ('draft','calculated','pending_approval'))::int AS fnf_open,
           COUNT(*) FILTER (WHERE x.st = 'approved' AND x.push NOT IN ('pushed','nothing_to_push'))::int AS fnf_approved_unpushed,
           COUNT(*) FILTER (WHERE x.st = 'paid')::int AS fnf_paid
    FROM sfnf x
  ),
  sexits AS (
    SELECT e.id
    FROM public.hr_employees e
    WHERE e.resignation_status IS NOT NULL
      AND lower(COALESCE(e.resignation_status,'')) <> 'cancelled'
      AND date_trunc('month', COALESCE(e.last_working_day, e.notice_period_end_date, e.resignation_date))::date = _first
  ),
  sexits_agg AS (
    SELECT (SELECT COUNT(*) FROM sexits)::int AS exits_in_month,
           (SELECT COUNT(*) FROM sexits x
             WHERE NOT EXISTS (
               SELECT 1 FROM public.hr_fnf_settlements f
               WHERE f.employee_id = x.id
                 AND lower(COALESCE(f.status,'')) <> 'cancelled'
             ))::int AS exits_without_fnf
  ),
  s3_rows AS (
    SELECT r.*,
           (COALESCE(r.one_time_amount, 0) > 0
            OR r.revision_type IN ('bonus','performance_incentive','retention_bonus','special_allowance','ad_hoc')) AS is_one_time
    FROM public.hr_salary_revisions r
    WHERE upper(COALESCE(r.status, '')) <> 'CANCELLED'
      AND (
        (COALESCE(r.one_time_amount, 0) > 0 AND r.payout_month = _first)
        OR (COALESCE(r.one_time_amount, 0) = 0 AND r.effective_from BETWEEN _first AND _last)
      )
  ),
  s3 AS (
    SELECT
      COUNT(*)::int AS rev_rows,
      COUNT(*) FILTER (WHERE lower(COALESCE(x.status,'')) IN ('pending','scheduled','draft'))::int AS rev_pending,
      COUNT(*) FILTER (
        WHERE lower(COALESCE(x.status,'')) NOT IN ('pending','scheduled','draft')
          AND (
            (x.is_one_time AND (x.razorpay_pushed_at IS NULL OR x.razorpay_push_error IS NOT NULL))
            OR (NOT x.is_one_time AND NOT EXISTS (
                  SELECT 1 FROM public.hr_razorpay_pushback_log g
                  WHERE g.hr_employee_id = x.employee_id
                    AND g.kind = 'salary'
                    AND g.status = 'success'
                    AND g.created_at >= x.created_at
               ))
          )
      )::int AS rev_unsynced,
      COALESCE(SUM(x.one_time_amount) FILTER (WHERE x.one_time_amount IS NOT NULL), 0)::numeric AS one_time_total
    FROM s3_rows x
  ),
  s4 AS (
    SELECT COUNT(*)::int AS lop_rows,
           COUNT(*) FILTER (WHERE d.source = 'auto_lop')::int AS auto_rows,
           COUNT(*) FILTER (WHERE d.pushed_at IS NOT NULL)::int AS pushed_rows,
           COUNT(*) FILTER (WHERE d.readback_verified_at IS NOT NULL)::int AS verified_rows,
           COALESCE(SUM(d.lop_days) FILTER (WHERE d.source = 'auto_lop'), 0)::numeric AS auto_lop_days
    FROM public.hr_payroll_input_deductions d
    WHERE d.period_month = _first
      AND (
        d.source = 'auto_lop'
        OR lower(coalesce(d.label,'')) LIKE '%lop%'
        OR lower(coalesce(d.label,'')) LIKE '%loss of pay%'
      )
  ),
  s4z AS (
    SELECT COALESCE(SUM(l.lop_days), 0)::numeric AS expected_lop_days
    FROM public.hr_lop_days(
      COALESCE((SELECT array_agg(m.hr_employee_id)
                FROM public.hr_razorpay_employee_map m
                JOIN public.hr_employees e ON e.id = m.hr_employee_id
                WHERE m.hr_employee_id IS NOT NULL
                  AND m.razorpay_employee_id IS NOT NULL
                  AND COALESCE(e.is_active, true)), ARRAY[]::uuid[]),
      _first
    ) l
  ),
  s5 AS (
    SELECT (
      (SELECT COUNT(*) FROM public.hr_payroll_input_additions a  WHERE a.period_month = _first) +
      (SELECT COUNT(*) FROM public.hr_payroll_input_deductions d WHERE d.period_month = _first)
    )::int AS input_rows,
    (
      (SELECT COUNT(*) FROM public.hr_payroll_input_additions a  WHERE a.period_month = _first AND a.readback_verified_at IS NOT NULL) +
      (SELECT COUNT(*) FROM public.hr_payroll_input_deductions d WHERE d.period_month = _first AND d.readback_verified_at IS NOT NULL)
    )::int AS input_verified
  ),
  s5r AS (
    SELECT COUNT(*) FILTER (WHERE lower(coalesce(v.status,'')) NOT IN ('skipped','cancelled'))::int AS rec_rows,
           COUNT(*) FILTER (WHERE lower(coalesce(v.status,'')) IN ('pushed','paid'))::int AS rec_pushed,
           COUNT(*) FILTER (WHERE lower(coalesce(v.status,'')) IN ('scheduled','pending'))::int AS rec_pending,
           COUNT(*) FILTER (WHERE lower(coalesce(v.status,'')) IN ('failed','error'))::int AS rec_failed,
           COALESCE(SUM(v.amount) FILTER (WHERE lower(coalesce(v.status,'')) NOT IN ('skipped','cancelled')), 0)::numeric AS rec_amount
    FROM public.hr_payroll_auto_recoveries v
    WHERE v.period_month = _first
  ),
  s7 AS (
    SELECT COUNT(*)::int AS imported,
           COUNT(*) FILTER (WHERE p.pdf_storage_path IS NOT NULL)::int AS with_pdf,
           COUNT(*) FILTER (WHERE COALESCE(p.do_not_pay, false) = false AND COALESCE(p.reg_has_left, false) = false)::int AS payable
    FROM public.hr_razorpay_payslip_records p
    WHERE p.period_month = _first
  ),
  s7b AS (
    SELECT COUNT(*)::int AS register_rows
    FROM public.hr_razorpay_payslip_records p
    WHERE p.period_month = _first
      AND p.reg_source_filename IS NOT NULL
  ),
  s7c AS (
    SELECT COUNT(DISTINCT l.metadata->>'employee_id')::int AS emails_sent
    FROM public.hr_email_send_log l
    WHERE l.template_name = 'payslip_monthly'
      AND l.metadata->>'period_month' = _first::text
      AND COALESCE(l.status, '') NOT IN ('failed', 'error')
  ),
  s7d AS (
    SELECT m.processed_on FROM public.hr_payroll_month_meta m WHERE m.period_month = _first
  ),
  s8 AS (
    SELECT r.id, r.status, r.created_at
    FROM public.hr_shadow_payroll_runs r
    WHERE r.period_month = _first
    ORDER BY r.created_at DESC
    LIMIT 1
  ),
  s8ok AS (
    SELECT r.id, r.status, r.created_at
    FROM public.hr_shadow_payroll_runs r
    WHERE r.period_month = _first
      AND lower(coalesce(r.status,'')) IN ('computed','complete','completed','success')
    ORDER BY r.created_at DESC
    LIMIT 1
  ),
  s9 AS (
    SELECT COUNT(*)::int AS drift_open
    FROM public.hr_drift_alerts d
    WHERE d.resolved_at IS NULL
      AND COALESCE(d.auto_status, 'open') = 'open'
      AND d.first_seen_at::date <= _last
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
      (3::SMALLINT, 'separations_fnf', 'Separations & Full & Final for this cycle',
       'HR', FALSE,
       CASE WHEN (SELECT g.fnf_open FROM sfnf_agg g) = 0
                 AND (SELECT x.exits_without_fnf FROM sexits_agg x) = 0
            THEN 'complete' ELSE 'incomplete' END,
       jsonb_build_object('fnf_total', (SELECT g.fnf_total FROM sfnf_agg g),
                          'fnf_open', (SELECT g.fnf_open FROM sfnf_agg g),
                          'fnf_approved_unpushed', (SELECT g.fnf_approved_unpushed FROM sfnf_agg g),
                          'fnf_paid', (SELECT g.fnf_paid FROM sfnf_agg g),
                          'exits_in_month', (SELECT x.exits_in_month FROM sexits_agg x),
                          'exits_without_fnf', (SELECT x.exits_without_fnf FROM sexits_agg x))),
      (4::SMALLINT, 'salary_revisions', 'Salary revisions (if any) — finalise before LOP',
       'HR', FALSE,
       CASE WHEN (SELECT s.rev_pending FROM s3 s) = 0
                 AND (SELECT s.rev_unsynced FROM s3 s) = 0
            THEN 'complete' ELSE 'incomplete' END,
       jsonb_build_object('rev_rows', (SELECT s.rev_rows FROM s3 s),
                          'rev_pending', (SELECT s.rev_pending FROM s3 s),
                          'rev_unsynced', (SELECT s.rev_unsynced FROM s3 s),
                          'one_time_total', (SELECT s.one_time_total FROM s3 s))),
      (5::SMALLINT, 'lop_push',         'LOP push to RazorpayX',
       'HR', FALSE,
       CASE WHEN (SELECT s.lop_rows FROM s4 s) > 0
                 AND (SELECT s.verified_rows FROM s4 s) = (SELECT s.lop_rows FROM s4 s)
            THEN 'complete'
            WHEN (SELECT s.lop_rows FROM s4 s) = 0
                 AND (SELECT z.expected_lop_days FROM s4z z) = 0
            THEN 'complete'
            ELSE 'incomplete' END,
       jsonb_build_object('lop_rows', (SELECT s.lop_rows FROM s4 s),
                          'auto_rows', (SELECT s.auto_rows FROM s4 s),
                          'pushed_rows', (SELECT s.pushed_rows FROM s4 s),
                          'verified_rows', (SELECT s.verified_rows FROM s4 s),
                          'auto_lop_days', (SELECT s.auto_lop_days FROM s4 s),
                          'expected_lop_days', (SELECT z.expected_lop_days FROM s4z z))),
      (6::SMALLINT, 'inputs_push',      'Inputs push (additions / deductions / recoveries / deposits)',
       'HR', FALSE,
       CASE WHEN (SELECT s.input_rows FROM s5 s) > 0
                 AND (SELECT s.input_verified FROM s5 s) = (SELECT s.input_rows FROM s5 s)
                 AND (SELECT s.rec_failed FROM s5r s) = 0
                 AND (SELECT s.rec_pending FROM s5r s) = 0
            THEN 'complete' ELSE 'incomplete' END,
       jsonb_build_object('input_rows',  (SELECT s.input_rows FROM s5 s),
                          'input_verified', (SELECT s.input_verified FROM s5 s),
                          'rec_rows',    (SELECT s.rec_rows FROM s5r s),
                          'rec_pushed',  (SELECT s.rec_pushed FROM s5r s),
                          'rec_pending', (SELECT s.rec_pending FROM s5r s),
                          'rec_failed',  (SELECT s.rec_failed FROM s5r s),
                          'rec_amount',  (SELECT s.rec_amount FROM s5r s))),
      (7::SMALLINT, 'run_on_razorpay',  'Run payroll on RazorpayX dashboard',
       'RazorpayX operator', FALSE,
       'incomplete',
       jsonb_build_object('note', 'RazorpayX API does not expose payroll-run status; HR must acknowledge after running on dashboard.',
                          'processed_on', (SELECT s.processed_on FROM s7d s))),
      (8::SMALLINT, 'import_payslips',  'Import payslips + register CSV, then email payslips',
       'HR', FALSE,
       CASE WHEN (SELECT s.imported FROM s7 s) > 0
                 AND (SELECT s.register_rows FROM s7b s) > 0
                 AND (SELECT c.emails_sent FROM s7c c) >= (SELECT s.payable FROM s7 s)
                 AND (SELECT c.emails_sent FROM s7c c) > 0
            THEN 'complete' ELSE 'incomplete' END,
       jsonb_build_object('imported', (SELECT s.imported FROM s7 s),
                          'register_rows', (SELECT s.register_rows FROM s7b s),
                          'with_pdf', (SELECT s.with_pdf FROM s7 s),
                          'payable', (SELECT s.payable FROM s7 s),
                          'emails_sent', (SELECT s.emails_sent FROM s7c s),
                          'processed_on', (SELECT s.processed_on FROM s7d s))),
      (9::SMALLINT, 'shadow_compare',   'Shadow compare (TDS excluded, ±₹5 tolerance)',
       'HR', FALSE,
       CASE WHEN (SELECT s.id FROM s8ok s) IS NOT NULL THEN 'complete' ELSE 'incomplete' END,
       jsonb_build_object('run_id', (SELECT s.id FROM s8 s),
                          'status', (SELECT s.status FROM s8 s),
                          'ran_at', (SELECT s.created_at FROM s8 s),
                          'usable_run_id', (SELECT s.id FROM s8ok s))),
      (10::SMALLINT, 'drift_review',     'Drift review (unexplained only — ±₹5 auto-tolerated)',
       'HR', FALSE,
       CASE WHEN (SELECT s.drift_open FROM s9 s) = 0 THEN 'complete' ELSE 'incomplete' END,
       jsonb_build_object('drift_open', (SELECT s.drift_open FROM s9 s))),
      (11::SMALLINT, 'close_month',     'Month closed',
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

-- 3) Close-month now spans 10 preceding steps and acknowledges step 11
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
  _compoff INTEGER := 0;
BEGIN
  IF NOT public.hr_payroll_cockpit_authorized(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  FOR _rec IN
    SELECT step_no, step_label, live_status, ack_status
    FROM public.hr_cockpit_month_state(_first)
    WHERE step_no <= 10
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

  SELECT public.hr_compoff_close_month(_first) INTO _compoff;

  PERFORM public.hr_cockpit_ack_step(_first, 11::SMALLINT, 'done', 'Month closed');
  RETURN jsonb_build_object('closed', true, 'month', _first, 'compoff_credits_settled', _compoff);
END;
$function$;