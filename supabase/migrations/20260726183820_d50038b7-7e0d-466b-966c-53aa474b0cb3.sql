-- F8: Drift auto-triage
ALTER TABLE public.hr_drift_alerts
  ADD COLUMN IF NOT EXISTS auto_status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS auto_reason text,
  ADD COLUMN IF NOT EXISTS delta_amount numeric,
  ADD COLUMN IF NOT EXISTS tolerance_used numeric,
  ADD COLUMN IF NOT EXISTS auto_classified_at timestamptz;

ALTER TABLE public.hr_drift_alerts
  DROP CONSTRAINT IF EXISTS hr_drift_alerts_auto_status_chk;
ALTER TABLE public.hr_drift_alerts
  ADD CONSTRAINT hr_drift_alerts_auto_status_chk
  CHECK (auto_status IN ('open','auto_dismissed','auto_labeled'));

CREATE INDEX IF NOT EXISTS idx_hr_drift_unexplained
  ON public.hr_drift_alerts (last_seen_at DESC)
  WHERE resolved_at IS NULL AND auto_status = 'open';

CREATE OR REPLACE FUNCTION public.hr_classify_drift_row(
  _field text,
  _hrms text,
  _razorpay text,
  _employee_id uuid
)
RETURNS TABLE (auto_status text, auto_reason text, delta_amount numeric, tolerance_used numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hrms_n numeric;
  v_rzp_n numeric;
  v_delta numeric;
  v_tol numeric := 5;
  v_is_numeric boolean := false;
  v_tds_gated boolean := false;
  v_recent_revision boolean := false;
  v_lop_pending boolean := false;
  v_lower text := lower(coalesce(_field, ''));
BEGIN
  BEGIN
    v_hrms_n := NULLIF(regexp_replace(coalesce(_hrms,''), '[^0-9\.\-]', '', 'g'), '')::numeric;
    v_rzp_n  := NULLIF(regexp_replace(coalesce(_razorpay,''), '[^0-9\.\-]', '', 'g'), '')::numeric;
    IF v_hrms_n IS NOT NULL AND v_rzp_n IS NOT NULL THEN
      v_is_numeric := true;
      v_delta := abs(v_hrms_n - v_rzp_n);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_is_numeric := false;
  END;

  IF v_is_numeric AND (
       v_lower LIKE '%salary%' OR v_lower LIKE '%ctc%' OR v_lower LIKE '%basic%'
    OR v_lower LIKE '%hra%' OR v_lower LIKE '%allowance%' OR v_lower LIKE '%gross%'
    OR v_lower LIKE '%component%' OR v_lower LIKE '%amount%'
  ) THEN
    IF v_delta <= v_tol THEN
      RETURN QUERY SELECT 'auto_dismissed'::text, 'within_tolerance'::text, v_delta, v_tol;
      RETURN;
    END IF;
  END IF;

  IF v_lower LIKE '%tds%' OR v_lower LIKE '%tax%' OR v_lower LIKE '%regime%' THEN
    SELECT NOT coalesce(push_statutory_endpoint_verified, false) INTO v_tds_gated
    FROM public.hr_razorpay_settings ORDER BY updated_at DESC NULLS LAST LIMIT 1;
    IF v_tds_gated THEN
      RETURN QUERY SELECT 'auto_labeled'::text, 'tds_gated'::text, v_delta, NULL::numeric;
      RETURN;
    END IF;
  END IF;

  IF v_lower LIKE '%salary%' OR v_lower LIKE '%ctc%' OR v_lower LIKE '%basic%'
     OR v_lower LIKE '%structure%' OR v_lower LIKE '%component%' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.hr_salary_revisions
      WHERE employee_id = _employee_id
        AND (razorpay_pushed_at >= date_trunc('month', now())
             OR effective_from >= date_trunc('month', now())::date)
    ) INTO v_recent_revision;
    IF v_recent_revision THEN
      RETURN QUERY SELECT 'auto_labeled'::text, 'mid_month_revision'::text, v_delta, NULL::numeric;
      RETURN;
    END IF;
  END IF;

  IF v_lower LIKE '%lop%' OR v_lower LIKE '%loss_of_pay%' OR v_lower LIKE '%absent%' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.hr_attendance_stale_sessions
      WHERE employee_id = _employee_id AND status IN ('open','pending')
    ) OR EXISTS (
      SELECT 1 FROM public.hr_attendance_regularization_requests
      WHERE employee_id = _employee_id AND status = 'pending'
    ) INTO v_lop_pending;
    IF v_lop_pending THEN
      RETURN QUERY SELECT 'auto_labeled'::text, 'lop_pre_close'::text, v_delta, NULL::numeric;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT 'open'::text, NULL::text, v_delta, NULL::numeric;
END;
$$;

CREATE OR REPLACE FUNCTION public.hr_drift_alerts_classify_trg()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  IF NEW.resolved_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO r FROM public.hr_classify_drift_row(NEW.field, NEW.hrms_value, NEW.razorpay_value, NEW.hr_employee_id);
  NEW.auto_status := r.auto_status;
  NEW.auto_reason := r.auto_reason;
  NEW.delta_amount := r.delta_amount;
  NEW.tolerance_used := r.tolerance_used;
  NEW.auto_classified_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_drift_alerts_classify ON public.hr_drift_alerts;
CREATE TRIGGER trg_hr_drift_alerts_classify
  BEFORE INSERT OR UPDATE OF hrms_value, razorpay_value, field
  ON public.hr_drift_alerts
  FOR EACH ROW EXECUTE FUNCTION public.hr_drift_alerts_classify_trg();

-- Backfill
UPDATE public.hr_drift_alerts
SET hrms_value = hrms_value
WHERE resolved_at IS NULL;

CREATE OR REPLACE FUNCTION public.hr_open_unexplained_drift_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int FROM public.hr_drift_alerts
  WHERE resolved_at IS NULL AND auto_status = 'open';
$$;

GRANT EXECUTE ON FUNCTION public.hr_open_unexplained_drift_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_classify_drift_row(text,text,text,uuid) TO authenticated;

-- F9a: dispatcher self-healing columns
ALTER TABLE public.hr_email_send_log
  ADD COLUMN IF NOT EXISTS attempt_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS dead_letter boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS retry_payload jsonb;

CREATE INDEX IF NOT EXISTS idx_hr_email_send_log_retry
  ON public.hr_email_send_log (next_retry_at)
  WHERE status = 'pending' AND dead_letter = false;

-- F9b: ghost-email residuals view
CREATE OR REPLACE VIEW public.hr_ghost_email_residual_v AS
WITH latest AS (
  SELECT DISTINCT ON (hr_employee_id)
    hr_employee_id, action, http_status, error_text, field_diff_summary, created_at
  FROM public.hr_razorpay_sync_log
  WHERE action = 'create_person'
  ORDER BY hr_employee_id, created_at DESC
)
SELECT l.*
FROM latest l
WHERE l.error_text ILIKE '%RAZORPAY_EMAIL_EXISTS%'
   OR l.error_text ILIKE '%RAZORPAY_ALIAS_MAPPING_FAILED%'
   OR l.error_text ILIKE '%ghost%email%';

GRANT SELECT ON public.hr_ghost_email_residual_v TO authenticated;

-- F10: absent-marker health view
CREATE OR REPLACE VIEW public.hr_absent_marker_last_run_v AS
SELECT
  (SELECT max(ran_at) FROM public.hr_attendance_absent_marker_runs) AS last_run_at,
  (SELECT window_date FROM public.hr_attendance_absent_marker_runs ORDER BY ran_at DESC LIMIT 1) AS last_window_date,
  (SELECT marked_count FROM public.hr_attendance_absent_marker_runs ORDER BY ran_at DESC LIMIT 1) AS last_marked_count,
  (SELECT notes FROM public.hr_attendance_absent_marker_runs ORDER BY ran_at DESC LIMIT 1) AS last_notes,
  (SELECT count(*) FROM public.hr_attendance_absent_marker_runs WHERE ran_at >= now() - interval '24 hours') AS runs_last_24h;

GRANT SELECT ON public.hr_absent_marker_last_run_v TO authenticated;