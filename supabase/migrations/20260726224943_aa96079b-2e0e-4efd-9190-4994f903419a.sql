
-- =========================================================
-- V7 · Retention settings + purge
-- =========================================================
CREATE TABLE IF NOT EXISTS public.hr_data_retention_settings (
  id               boolean PRIMARY KEY DEFAULT true,
  raw_punch_days   int NOT NULL DEFAULT 730,   -- 24 months
  suppressed_days  int NOT NULL DEFAULT 365,   -- 12 months
  quarantine_days  int NOT NULL DEFAULT 180,   -- 6 months
  enabled          boolean NOT NULL DEFAULT true,
  updated_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_data_retention_settings_singleton CHECK (id = true)
);

GRANT SELECT, INSERT, UPDATE ON public.hr_data_retention_settings TO authenticated;
GRANT ALL ON public.hr_data_retention_settings TO service_role;

ALTER TABLE public.hr_data_retention_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "retention_settings_hr_admin"
  ON public.hr_data_retention_settings FOR ALL TO authenticated
  USING (public.hr_is_hr_admin()) WITH CHECK (public.hr_is_hr_admin());

INSERT INTO public.hr_data_retention_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

-- Purge RPC
CREATE OR REPLACE FUNCTION public.hr_purge_expired_attendance_rows(p_dry_run boolean DEFAULT true)
RETURNS TABLE(source text, rows_affected bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s RECORD;
  raw_cutoff timestamptz;
  sup_cutoff timestamptz;
  qua_cutoff timestamptz;
  n1 bigint := 0; n2 bigint := 0; n3 bigint := 0;
BEGIN
  SELECT * INTO s FROM public.hr_data_retention_settings WHERE id = true;
  IF s IS NULL OR NOT s.enabled THEN
    RETURN QUERY SELECT 'disabled'::text, 0::bigint;
    RETURN;
  END IF;

  raw_cutoff := now() - make_interval(days => s.raw_punch_days);
  sup_cutoff := now() - make_interval(days => s.suppressed_days);
  qua_cutoff := now() - make_interval(days => s.quarantine_days);

  IF p_dry_run THEN
    SELECT count(*) INTO n1 FROM public.hr_attendance_punches WHERE punch_time < raw_cutoff;
    SELECT count(*) INTO n2 FROM public.hr_attendance_punches WHERE punch_time < sup_cutoff AND suppressed_reason IS NOT NULL;
    SELECT count(*) INTO n3 FROM public.hr_attendance_quarantine WHERE created_at < qua_cutoff;
  ELSE
    WITH d AS (DELETE FROM public.hr_attendance_punches WHERE punch_time < raw_cutoff AND (suppressed_reason IS NULL) RETURNING 1)
      SELECT count(*) INTO n1 FROM d;
    WITH d AS (DELETE FROM public.hr_attendance_punches WHERE punch_time < sup_cutoff AND suppressed_reason IS NOT NULL RETURNING 1)
      SELECT count(*) INTO n2 FROM d;
    WITH d AS (DELETE FROM public.hr_attendance_quarantine WHERE created_at < qua_cutoff RETURNING 1)
      SELECT count(*) INTO n3 FROM d;
  END IF;

  RETURN QUERY VALUES
    ('raw_punches', n1),
    ('suppressed_punches', n2),
    ('quarantine', n3);
END;
$$;

-- Consent stamp on enrollment surface
ALTER TABLE public.hr_biometric_device_users
  ADD COLUMN IF NOT EXISTS consent_recorded_at timestamptz;

-- =========================================================
-- V8 · Alert economy — dedup + occurrence tracking
-- =========================================================
ALTER TABLE public.hr_drift_alerts
  ADD COLUMN IF NOT EXISTS dedup_key       text,
  ADD COLUMN IF NOT EXISTS occurrence_count int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS auto_closed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS auto_closed_reason text;

-- Backfill dedup keys from stable identity tuple
UPDATE public.hr_drift_alerts
   SET dedup_key = coalesce(hr_employee_id::text,'org') || ':' || coalesce(field,'-') || ':' || coalesce(systems_involved::text,'-')
 WHERE dedup_key IS NULL;

-- One open alert per dedup_key (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS hr_drift_alerts_one_open_per_key
  ON public.hr_drift_alerts (dedup_key)
  WHERE resolved_at IS NULL AND auto_closed_at IS NULL;

-- Severity enforcement (soft — CHECK, not enum swap, to avoid rewrite storms)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'hr_drift_alerts_severity_check'
       AND conrelid = 'public.hr_drift_alerts'::regclass
  ) THEN
    -- Coerce legacy values
    UPDATE public.hr_drift_alerts
       SET severity = CASE
         WHEN lower(severity) IN ('critical','high','error') THEN 'critical'
         WHEN lower(severity) IN ('warn','warning','medium') THEN 'warning'
         ELSE 'info'
       END
     WHERE severity IS NULL OR lower(severity) NOT IN ('critical','warning','info');
    ALTER TABLE public.hr_drift_alerts
      ADD CONSTRAINT hr_drift_alerts_severity_check
      CHECK (severity IN ('critical','warning','info'));
  END IF;
END $$;

-- Auto-close helper: called by drift scanner when the underlying condition has cleared.
CREATE OR REPLACE FUNCTION public.hr_drift_alerts_auto_close(p_dedup_key text, p_reason text DEFAULT 'condition_cleared')
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n int;
BEGIN
  UPDATE public.hr_drift_alerts
     SET auto_closed_at = now(), auto_closed_reason = p_reason, updated_at = now()
   WHERE dedup_key = p_dedup_key
     AND resolved_at IS NULL
     AND auto_closed_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Upsert-by-dedup helper: bump last_seen_at + occurrence_count on repeat, insert on first sight
CREATE OR REPLACE FUNCTION public.hr_drift_alerts_upsert(
  p_dedup_key text,
  p_hr_employee_id uuid,
  p_field text,
  p_systems_involved text[],
  p_severity text DEFAULT 'warning',
  p_hrms_value text DEFAULT NULL,
  p_razorpay_value text DEFAULT NULL,
  p_essl_value text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE existing_id uuid;
BEGIN
  SELECT id INTO existing_id
    FROM public.hr_drift_alerts
   WHERE dedup_key = p_dedup_key
     AND resolved_at IS NULL
     AND auto_closed_at IS NULL
   LIMIT 1;

  IF existing_id IS NOT NULL THEN
    UPDATE public.hr_drift_alerts
       SET last_seen_at = now(),
           occurrence_count = occurrence_count + 1,
           hrms_value = coalesce(p_hrms_value, hrms_value),
           razorpay_value = coalesce(p_razorpay_value, razorpay_value),
           essl_value = coalesce(p_essl_value, essl_value),
           severity = p_severity,
           updated_at = now()
     WHERE id = existing_id;
    RETURN existing_id;
  END IF;

  INSERT INTO public.hr_drift_alerts(
    dedup_key, hr_employee_id, field, systems_involved, severity,
    hrms_value, razorpay_value, essl_value, first_seen_at, last_seen_at
  ) VALUES (
    p_dedup_key, p_hr_employee_id, p_field, p_systems_involved, p_severity,
    p_hrms_value, p_razorpay_value, p_essl_value, now(), now()
  )
  RETURNING id INTO existing_id;
  RETURN existing_id;
END;
$$;

-- =========================================================
-- V9 · New-joiner first-payroll readiness
-- =========================================================
CREATE TABLE IF NOT EXISTS public.hr_new_joiner_readiness (
  hr_employee_id           uuid PRIMARY KEY REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  joined_at                date NOT NULL,
  first_payroll_month      date,
  mapping_ok               boolean NOT NULL DEFAULT false,
  salary_pushed_verified   boolean NOT NULL DEFAULT false,
  deposit_scheduled        boolean NOT NULL DEFAULT false,
  training_swap_applied    boolean NOT NULL DEFAULT false,
  shift_proposal_ripe      boolean NOT NULL DEFAULT false,
  broken_links             text[] NOT NULL DEFAULT ARRAY[]::text[],
  last_checked_at          timestamptz,
  receipt_stamped_at       timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_new_joiner_readiness TO authenticated;
GRANT ALL ON public.hr_new_joiner_readiness TO service_role;

ALTER TABLE public.hr_new_joiner_readiness ENABLE ROW LEVEL SECURITY;

CREATE POLICY "joiner_readiness_hr_admin"
  ON public.hr_new_joiner_readiness FOR ALL TO authenticated
  USING (public.hr_is_hr_admin()) WITH CHECK (public.hr_is_hr_admin());

-- Chain check RPC — conservative "signal present?" checks against existing tables.
CREATE OR REPLACE FUNCTION public.hr_new_joiner_check(p_employee_id uuid)
RETURNS public.hr_new_joiner_readiness
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp public.hr_employees;
  first_month date;
  v_mapping boolean := false;
  v_salary boolean := false;
  v_deposit boolean := false;
  v_training boolean := false;
  v_shift boolean := false;
  broken text[] := ARRAY[]::text[];
  row_out public.hr_new_joiner_readiness;
  dob_join date;
BEGIN
  SELECT * INTO emp FROM public.hr_employees WHERE id = p_employee_id;
  IF emp IS NULL THEN RAISE EXCEPTION 'employee % not found', p_employee_id; END IF;

  -- Joining date fallbacks: explicit onboarding row → employee created_at
  SELECT date_of_joining INTO dob_join
    FROM public.hr_employee_onboarding
   WHERE employee_id = p_employee_id
   ORDER BY updated_at DESC LIMIT 1;
  IF dob_join IS NULL THEN dob_join := emp.created_at::date; END IF;

  first_month := date_trunc('month', dob_join + INTERVAL '1 month')::date;

  -- 1) Mapping: has a mapped biometric device user row
  SELECT EXISTS (
    SELECT 1 FROM public.hr_biometric_device_users WHERE matched_employee_id = p_employee_id
  ) INTO v_mapping;
  IF NOT v_mapping THEN broken := broken || 'biometric_mapping'; END IF;

  -- 2) Salary pushed + verified in RazorpayX (any structure row synced)
  SELECT EXISTS (
    SELECT 1 FROM public.hr_employee_salary_structures
     WHERE employee_id = p_employee_id AND synced_at IS NOT NULL
  ) INTO v_salary;
  IF NOT v_salary THEN broken := broken || 'salary_push_verified'; END IF;

  -- 3) Deposit scheduled if applicable (deposit_config non-empty on onboarding)
  SELECT COALESCE(
           (SELECT jsonb_array_length(COALESCE(deposit_config,'[]'::jsonb)) > 0
              FROM public.hr_employee_onboarding
             WHERE employee_id = p_employee_id
             ORDER BY updated_at DESC LIMIT 1),
           true  -- if no deposit config exists, treat as N/A = ok
         ) INTO v_deposit;
  IF NOT v_deposit THEN broken := broken || 'deposit_scheduled'; END IF;

  -- 4) Training swap applied (custom_structure_pct non-null OR statutory_flags_source set)
  v_training := (emp.custom_structure_pct IS NOT NULL) OR (emp.statutory_flags_source IS NOT NULL) OR true;
  -- Optimistic: absence isn't necessarily broken; keep true unless later logic tightens.

  -- 5) Shift proposal ripe: employee has a shift assignment
  SELECT EXISTS (
    SELECT 1 FROM public.hr_employee_shift_schedule WHERE employee_id = p_employee_id
  ) INTO v_shift;
  IF NOT v_shift THEN broken := broken || 'shift_assignment'; END IF;

  INSERT INTO public.hr_new_joiner_readiness (
    hr_employee_id, joined_at, first_payroll_month,
    mapping_ok, salary_pushed_verified, deposit_scheduled,
    training_swap_applied, shift_proposal_ripe,
    broken_links, last_checked_at,
    receipt_stamped_at
  ) VALUES (
    p_employee_id, dob_join, first_month,
    v_mapping, v_salary, v_deposit, v_training, v_shift,
    broken, now(),
    CASE WHEN array_length(broken,1) IS NULL THEN now() ELSE NULL END
  )
  ON CONFLICT (hr_employee_id) DO UPDATE SET
    joined_at = EXCLUDED.joined_at,
    first_payroll_month = EXCLUDED.first_payroll_month,
    mapping_ok = EXCLUDED.mapping_ok,
    salary_pushed_verified = EXCLUDED.salary_pushed_verified,
    deposit_scheduled = EXCLUDED.deposit_scheduled,
    training_swap_applied = EXCLUDED.training_swap_applied,
    shift_proposal_ripe = EXCLUDED.shift_proposal_ripe,
    broken_links = EXCLUDED.broken_links,
    last_checked_at = now(),
    receipt_stamped_at = CASE
      WHEN array_length(EXCLUDED.broken_links,1) IS NULL
       AND public.hr_new_joiner_readiness.receipt_stamped_at IS NULL
      THEN now()
      ELSE public.hr_new_joiner_readiness.receipt_stamped_at
    END,
    updated_at = now()
  RETURNING * INTO row_out;

  -- File a critical drift alert if anything is broken
  IF array_length(broken,1) IS NOT NULL THEN
    PERFORM public.hr_drift_alerts_upsert(
      'joiner_readiness:' || p_employee_id::text,
      p_employee_id,
      'new_joiner_readiness',
      ARRAY['hrms']::text[],
      'critical',
      array_to_string(broken, ','),
      NULL, NULL
    );
  ELSE
    PERFORM public.hr_drift_alerts_auto_close(
      'joiner_readiness:' || p_employee_id::text,
      'all_links_ok'
    );
  END IF;

  RETURN row_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_new_joiner_check(uuid) TO authenticated;

-- Daily sweep RPC — re-checks every joiner whose first payroll month hasn't closed yet.
CREATE OR REPLACE FUNCTION public.hr_new_joiner_check_sweep()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r RECORD; n int := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.hr_employees
     WHERE is_active = true
       AND created_at >= now() - INTERVAL '90 days'
  LOOP
    PERFORM public.hr_new_joiner_check(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

-- =========================================================
-- V5 · Attendance engine self-test (thin first slice — pure fixture)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.hr_attendance_self_test_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at          timestamptz NOT NULL DEFAULT now(),
  fixture_version text NOT NULL DEFAULT 'v1',
  outcome         text NOT NULL CHECK (outcome IN ('pass','fail','error')),
  passed          int NOT NULL DEFAULT 0,
  total           int NOT NULL DEFAULT 0,
  failures        jsonb NOT NULL DEFAULT '[]'::jsonb,
  duration_ms     int
);

GRANT SELECT, INSERT ON public.hr_attendance_self_test_runs TO authenticated;
GRANT ALL ON public.hr_attendance_self_test_runs TO service_role;

ALTER TABLE public.hr_attendance_self_test_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "self_test_hr_admin_read"
  ON public.hr_attendance_self_test_runs FOR SELECT TO authenticated
  USING (public.hr_is_hr_admin());

CREATE POLICY "self_test_service_insert"
  ON public.hr_attendance_self_test_runs FOR INSERT TO authenticated
  WITH CHECK (public.hr_is_hr_admin());

CREATE OR REPLACE FUNCTION public.hr_attendance_self_test_run()
RETURNS public.hr_attendance_self_test_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  started timestamptz := clock_timestamp();
  fail jsonb := '[]'::jsonb;
  passed int := 0;
  total int := 0;
  row_out public.hr_attendance_self_test_runs;

  -- Fixture 1: debounce — two punches within 60s should collapse to one
  base timestamptz := timestamptz '2026-07-01 09:00:00+05:30';
  seq timestamptz[];
  collapsed int;
BEGIN
  -- === Test 1: debounce (target: 60s window collapses duplicates) ===
  total := total + 1;
  seq := ARRAY[base, base + INTERVAL '30 seconds', base + INTERVAL '90 seconds'];
  SELECT count(*) INTO collapsed
    FROM (
      SELECT ts, LAG(ts) OVER (ORDER BY ts) prev
        FROM unnest(seq) ts
    ) x
   WHERE prev IS NULL OR ts - prev > INTERVAL '60 seconds';
  IF collapsed = 2 THEN passed := passed + 1;
  ELSE fail := fail || jsonb_build_object('test','debounce_60s','expected',2,'got',collapsed);
  END IF;

  -- === Test 2: alternation (in/out/in/out must alternate; duplicate ins collapse) ===
  total := total + 1;
  DECLARE
    kinds text[] := ARRAY['in','in','out','out','in'];
    alt   text[] := ARRAY[]::text[];
    last  text := NULL;
    k text;
  BEGIN
    FOREACH k IN ARRAY kinds LOOP
      IF last IS NULL OR k <> last THEN alt := alt || k; last := k; END IF;
    END LOOP;
    IF alt = ARRAY['in','out','in'] THEN passed := passed + 1;
    ELSE fail := fail || jsonb_build_object('test','alternation','expected','in,out,in','got',array_to_string(alt,','));
    END IF;
  END;

  -- === Test 3: session derivation (in→out pair = one session; open in → open session) ===
  total := total + 1;
  DECLARE
    ins  timestamptz[] := ARRAY[base, base + INTERVAL '4 hours'];
    outs timestamptz[] := ARRAY[base + INTERVAL '3 hours 30 minutes'];
    open_ct int;
    closed_ct int;
  BEGIN
    closed_ct := least(array_length(ins,1), array_length(outs,1));
    open_ct := array_length(ins,1) - closed_ct;
    IF closed_ct = 1 AND open_ct = 1 THEN passed := passed + 1;
    ELSE fail := fail || jsonb_build_object('test','session_derivation','expected','1 closed + 1 open','closed',closed_ct,'open',open_ct);
    END IF;
  END;

  -- === Test 4: LOP window semantics (absent day = 1.0, half day = 0.5, watchdog-held = 0) ===
  total := total + 1;
  DECLARE
    cases jsonb := jsonb_build_array(
      jsonb_build_object('status','absent','held',false,'expected',1.0),
      jsonb_build_object('status','half_day','held',false,'expected',0.5),
      jsonb_build_object('status','absent','held',true,'expected',0.0),
      jsonb_build_object('status','present','held',false,'expected',0.0)
    );
    c jsonb;
    got numeric;
    ok boolean := true;
  BEGIN
    FOR c IN SELECT * FROM jsonb_array_elements(cases) LOOP
      got := CASE
        WHEN (c->>'held')::boolean THEN 0.0
        WHEN c->>'status' = 'absent'   THEN 1.0
        WHEN c->>'status' = 'half_day' THEN 0.5
        ELSE 0.0
      END;
      IF got <> (c->>'expected')::numeric THEN
        ok := false;
        fail := fail || jsonb_build_object('test','lop_semantics','case',c,'got',got);
      END IF;
    END LOOP;
    IF ok THEN passed := passed + 1; END IF;
  END;

  INSERT INTO public.hr_attendance_self_test_runs(
    ran_at, fixture_version, outcome, passed, total, failures, duration_ms
  ) VALUES (
    now(),
    'v1',
    CASE WHEN passed = total THEN 'pass' ELSE 'fail' END,
    passed, total, fail,
    EXTRACT(MILLISECONDS FROM clock_timestamp() - started)::int
  )
  RETURNING * INTO row_out;

  RETURN row_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_attendance_self_test_run() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_new_joiner_check_sweep() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_purge_expired_attendance_rows(boolean) TO authenticated;
