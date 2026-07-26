
-- =========================================================================
-- R6: Monthly Payroll Cockpit — state table + status/close RPCs
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.hr_payroll_cockpit_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month DATE NOT NULL,
  step_no SMALLINT NOT NULL CHECK (step_no BETWEEN 1 AND 9),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','skipped','blocked')),
  actor UUID REFERENCES auth.users(id),
  notes TEXT,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period_month, step_no)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_payroll_cockpit_state TO authenticated;
GRANT ALL ON public.hr_payroll_cockpit_state TO service_role;

ALTER TABLE public.hr_payroll_cockpit_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cockpit_state_hr_read" ON public.hr_payroll_cockpit_state;
CREATE POLICY "cockpit_state_hr_read" ON public.hr_payroll_cockpit_state
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'hr')
  );

DROP POLICY IF EXISTS "cockpit_state_hr_write" ON public.hr_payroll_cockpit_state;
CREATE POLICY "cockpit_state_hr_write" ON public.hr_payroll_cockpit_state
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'hr')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'hr')
  );

DROP TRIGGER IF EXISTS trg_hr_payroll_cockpit_state_updated_at ON public.hr_payroll_cockpit_state;
CREATE TRIGGER trg_hr_payroll_cockpit_state_updated_at
  BEFORE UPDATE ON public.hr_payroll_cockpit_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- Live-state RPC ----------

CREATE OR REPLACE FUNCTION public.hr_cockpit_month_state(_month DATE)
RETURNS TABLE (
  step_no SMALLINT,
  step_key TEXT,
  step_label TEXT,
  actor_hint TEXT,
  auto BOOLEAN,
  live_status TEXT,      -- 'complete' | 'incomplete'
  live_detail JSONB,     -- counts/signals
  ack_status TEXT,       -- pending|done|skipped|blocked
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
  s1 AS ( -- attendance period lock
    SELECT COUNT(*)::int AS locked_days
    FROM public.hr_attendance_period_locks
    WHERE period_start <= _last AND period_end >= _first
  ),
  s2 AS ( -- watchdog / stale sessions
    SELECT COUNT(*)::int AS stale_open
    FROM public.hr_attendance_stale_sessions
    WHERE resolved_at IS NULL
      AND session_date BETWEEN _first AND _last
  ),
  s3 AS ( -- LOP staged via payroll inputs (deductions tagged LOP)
    SELECT COUNT(*)::int AS lop_rows
    FROM public.hr_payroll_input_deductions
    WHERE period_month = _first
      AND (component_name ILIKE '%lop%' OR component_name ILIKE '%loss of pay%')
  ),
  s4 AS ( -- generic inputs staged (additions + non-LOP deductions + one-offs)
    SELECT
      (SELECT COUNT(*) FROM public.hr_payroll_input_additions a WHERE a.period_month = _first)
    + (SELECT COUNT(*) FROM public.hr_payroll_input_deductions d WHERE d.period_month = _first) AS input_rows
  ),
  s6 AS ( -- payslips imported
    SELECT COUNT(*)::int AS imported
    FROM public.hr_razorpay_payslip_records
    WHERE period_month = _first
  ),
  s6b AS ( -- salary register uploaded
    SELECT COUNT(*)::int AS register_rows
    FROM public.hr_razorpay_payslip_records
    WHERE period_month = _first
      AND reg_source_filename IS NOT NULL
  ),
  s7 AS ( -- shadow run
    SELECT id, status, created_at
    FROM public.hr_shadow_payroll_runs
    WHERE period_month = _first
    ORDER BY created_at DESC
    LIMIT 1
  ),
  s8 AS ( -- drift open for the month
    SELECT COUNT(*)::int AS drift_open
    FROM public.hr_drift_alerts d
    WHERE d.resolved_at IS NULL
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
       'incomplete', -- always needs HR acknowledgement (API cannot confirm)
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
  LEFT JOIN LATERAL (
    SELECT status AS ack_status, actor AS ack_actor, notes AS ack_notes, acknowledged_at AS ack_at
    FROM ack WHERE ack.step_no = steps.step_no
  ) a ON true
  ORDER BY step_no;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_cockpit_month_state(DATE) TO authenticated, service_role;

-- ---------- Acknowledge / close helpers ----------

CREATE OR REPLACE FUNCTION public.hr_cockpit_ack_step(
  _month DATE, _step_no SMALLINT, _status TEXT, _notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _first DATE := date_trunc('month', _month)::date;
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin')
       OR public.has_role(auth.uid(),'hr')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _status NOT IN ('pending','done','skipped','blocked') THEN
    RAISE EXCEPTION 'Invalid status: %', _status;
  END IF;
  INSERT INTO public.hr_payroll_cockpit_state (period_month, step_no, status, actor, notes, acknowledged_at)
  VALUES (_first, _step_no, _status, auth.uid(), _notes, CASE WHEN _status='done' THEN now() ELSE NULL END)
  ON CONFLICT (period_month, step_no)
  DO UPDATE SET status = EXCLUDED.status,
                actor = auth.uid(),
                notes = EXCLUDED.notes,
                acknowledged_at = CASE WHEN EXCLUDED.status='done' THEN now() ELSE NULL END,
                updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_cockpit_ack_step(DATE, SMALLINT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_close_payroll_month(_month DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _first DATE := date_trunc('month', _month)::date;
  _rec RECORD;
  _blockers TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NOT (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'admin')
       OR public.has_role(auth.uid(),'hr')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  FOR _rec IN
    SELECT step_no, step_label, live_status, ack_status
    FROM public.hr_cockpit_month_state(_first)
    WHERE step_no <= 8
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
  PERFORM public.hr_cockpit_ack_step(_first, 9::SMALLINT, 'done', 'Month closed');
  RETURN jsonb_build_object('closed', true, 'month', _first);
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_close_payroll_month(DATE) TO authenticated;

-- =========================================================================
-- R8: System Pulse — one-shot health aggregation RPC
-- =========================================================================

CREATE OR REPLACE FUNCTION public.hr_system_pulse()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, cron, extensions
AS $$
DECLARE
  _cron JSONB;
  _email JSONB;
  _devices JSONB;
  _drift JSONB;
  _stale JSONB;
  _sandbox JSONB;
  _rz JSONB;
BEGIN
  -- Cron heartbeats: last run per job (best-effort — cron.job_run_details exists on Supabase)
  BEGIN
    SELECT jsonb_agg(row_to_json(x)) INTO _cron FROM (
      SELECT j.jobname, j.schedule, j.active,
             r.status AS last_status,
             r.start_time AS last_run_at,
             EXTRACT(EPOCH FROM (now() - r.start_time))::int AS seconds_since
      FROM cron.job j
      LEFT JOIN LATERAL (
        SELECT status, start_time
        FROM cron.job_run_details d
        WHERE d.jobid = j.jobid
        ORDER BY d.start_time DESC NULLS LAST
        LIMIT 1
      ) r ON true
      WHERE j.jobname LIKE 'hr-%' OR j.jobname LIKE 'razorpay-%' OR j.jobname LIKE 'auto-%' OR j.jobname LIKE 'dispatch-%' OR j.jobname LIKE 'biometric-%'
      ORDER BY j.jobname
    ) x;
  EXCEPTION WHEN OTHERS THEN _cron := '[]'::jsonb;
  END;

  -- Email dispatcher backlog
  SELECT jsonb_build_object(
    'pending', COUNT(*) FILTER (WHERE status = 'pending'),
    'failed_24h', COUNT(*) FILTER (WHERE status = 'failed' AND created_at > now() - INTERVAL '24 hours'),
    'sent_24h', COUNT(*) FILTER (WHERE status = 'sent' AND created_at > now() - INTERVAL '24 hours'),
    'oldest_pending_age_min', COALESCE(EXTRACT(EPOCH FROM (now() - MIN(created_at) FILTER (WHERE status = 'pending')))/60, 0)::int
  ) INTO _email
  FROM public.hr_email_send_log
  WHERE created_at > now() - INTERVAL '7 days';

  -- Biometric device command queue
  SELECT jsonb_build_object(
    'pending', COUNT(*) FILTER (WHERE status IN ('pending','queued')),
    'oldest_pending_age_min', COALESCE(EXTRACT(EPOCH FROM (now() - MIN(created_at) FILTER (WHERE status IN ('pending','queued'))))/60, 0)::int,
    'failed_24h', COUNT(*) FILTER (WHERE status = 'failed' AND created_at > now() - INTERVAL '24 hours')
  ) INTO _devices
  FROM public.hr_biometric_device_commands;

  -- Drift alerts
  SELECT jsonb_build_object(
    'open', COUNT(*) FILTER (WHERE resolved_at IS NULL),
    'critical_open', COUNT(*) FILTER (WHERE resolved_at IS NULL AND severity = 'critical')
  ) INTO _drift
  FROM public.hr_drift_alerts;

  -- Stale attendance sessions
  SELECT jsonb_build_object(
    'open', COUNT(*) FILTER (WHERE resolved_at IS NULL),
    'oldest_age_hours', COALESCE(EXTRACT(EPOCH FROM (now() - MIN(created_at) FILTER (WHERE resolved_at IS NULL)))/3600, 0)::int
  ) INTO _stale
  FROM public.hr_attendance_stale_sessions;

  -- Sandbox window
  BEGIN
    SELECT jsonb_build_object(
      'enabled', COALESCE(sandbox_mode, false),
      'expires_at', sandbox_expires_at
    ) INTO _sandbox
    FROM public.hr_razorpay_settings LIMIT 1;
  EXCEPTION WHEN OTHERS THEN _sandbox := jsonb_build_object('enabled', false);
  END;

  -- RazorpayX freshness
  BEGIN
    SELECT to_jsonb(f) INTO _rz FROM public.hr_razorpay_payroll_freshness f LIMIT 1;
  EXCEPTION WHEN OTHERS THEN _rz := '{}'::jsonb;
  END;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'cron', COALESCE(_cron, '[]'::jsonb),
    'email', COALESCE(_email, '{}'::jsonb),
    'devices', COALESCE(_devices, '{}'::jsonb),
    'drift', COALESCE(_drift, '{}'::jsonb),
    'stale_sessions', COALESCE(_stale, '{}'::jsonb),
    'sandbox', COALESCE(_sandbox, '{}'::jsonb),
    'razorpay_freshness', COALESCE(_rz, '{}'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_system_pulse() TO authenticated, service_role;
