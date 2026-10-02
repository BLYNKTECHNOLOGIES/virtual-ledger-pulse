ALTER TABLE public.hr_salary_revisions
  ADD COLUMN IF NOT EXISTS razorpay_push_state text,
  ADD COLUMN IF NOT EXISTS push_after_month date,
  ADD COLUMN IF NOT EXISTS push_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_push_attempt_at timestamptz;

CREATE OR REPLACE FUNCTION public.hr_ctc_push_after_month(p_eff date)
RETURNS date LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN p_eff IS NULL THEN NULL
              WHEN EXTRACT(DAY FROM p_eff)::int = 1 THEN date_trunc('month', p_eff)::date
              ELSE (date_trunc('month', p_eff) + interval '1 month')::date END;
$$;

CREATE OR REPLACE FUNCTION public.hr_is_ctc_revision_row(r public.hr_salary_revisions)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT COALESCE(r.one_time_amount,0) = 0
     AND COALESCE(r.revision_type,'') NOT IN ('payroll_addition','payroll_deduction')
     AND r.new_total IS NOT NULL AND COALESCE(r.previous_total,0) > 0
     AND r.new_total <> r.previous_total;
$$;

CREATE OR REPLACE FUNCTION public.hr_tg_classify_ctc_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_snap numeric;
BEGIN
  IF NOT public.hr_is_ctc_revision_row(NEW) THEN
    NEW.razorpay_push_state := NULL; NEW.push_after_month := NULL; RETURN NEW;
  END IF;
  NEW.push_after_month := public.hr_ctc_push_after_month(NEW.effective_from);
  IF NEW.status = 'CANCELLED' THEN
    IF COALESCE(NEW.razorpay_push_state,'') <> 'pushed' THEN NEW.razorpay_push_state := 'cancelled'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.razorpay_pushed_at IS NOT NULL OR NEW.razorpay_verified_at IS NOT NULL THEN
    NEW.razorpay_push_state := 'pushed'; RETURN NEW;
  END IF;
  IF NEW.razorpay_push_state IS NULL OR (TG_OP = 'UPDATE' AND NEW.effective_from IS DISTINCT FROM OLD.effective_from AND NEW.razorpay_push_state <> 'pushed') THEN
    SELECT round((em.last_pull_snapshot->'__salary'->>'annual_ctc')::numeric) INTO v_snap
      FROM public.hr_razorpay_employee_map em WHERE em.hr_employee_id = NEW.employee_id LIMIT 1;
    NEW.razorpay_push_state := CASE WHEN v_snap IS NOT NULL AND v_snap = round(NEW.new_total) THEN 'pushed' ELSE 'held' END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_hr_classify_ctc_push ON public.hr_salary_revisions;
CREATE TRIGGER trg_hr_classify_ctc_push BEFORE INSERT OR UPDATE ON public.hr_salary_revisions
  FOR EACH ROW EXECUTE FUNCTION public.hr_tg_classify_ctc_push();

-- RazorpayX keeps the old CTC for a mid-month effective month, so the part-month
-- arrears is final immediately (no longer provisional).
CREATE OR REPLACE FUNCTION public.hr_tg_stage_ctc_adjustment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.status,'') NOT IN ('APPLIED','SCHEDULED') THEN RETURN NEW; END IF;
  IF COALESCE(NEW.revision_type,'') IN ('payroll_addition','payroll_deduction') THEN RETURN NEW; END IF;
  IF COALESCE(NEW.one_time_amount, 0) <> 0 THEN RETURN NEW; END IF;
  IF COALESCE(NEW.previous_total,0) <= 0 OR NEW.new_total IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.previous_total,0) = COALESCE(NEW.new_total,0) THEN RETURN NEW; END IF;
  IF NEW.razorpay_pushed_at IS NOT NULL THEN RETURN NEW; END IF;
  IF EXTRACT(DAY FROM NEW.effective_from)::int = 1 THEN RETURN NEW; END IF;
  BEGIN
    PERFORM public.hr_stage_ctc_transition_adjustment(NEW.id, false);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'CTC adjustment staging failed for revision %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.hr_revision_push_window(p_revision_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; open_month date := public.hr_open_payroll_month(); v_after date;
BEGIN
  SELECT * INTO r FROM public.hr_salary_revisions WHERE id = p_revision_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('allowed', false, 'error', 'revision not found'); END IF;
  IF COALESCE(r.one_time_amount, 0) <> 0 OR r.revision_type IN ('payroll_addition', 'payroll_deduction') THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'not a CTC revision', 'open_payroll_month', open_month);
  END IF;
  v_after := public.hr_ctc_push_after_month(r.effective_from);
  RETURN jsonb_build_object(
    'allowed', open_month >= v_after,
    'open_payroll_month', open_month,
    'effective_month', date_trunc('month', r.effective_from)::date,
    'push_after_month', v_after,
    'reason', CASE WHEN open_month >= v_after THEN 'in scope'
                   ELSE 'RazorpayX keeps the old CTC until this change''s payroll month closes' END);
END $$;

-- Latest applied CTC revision per employee that is held and now due.
CREATE OR REPLACE FUNCTION public.hr_ctc_revisions_due_for_push(p_revision_id uuid DEFAULT NULL)
RETURNS TABLE(revision_id uuid, employee_id uuid, razorpay_employee_id text, new_total numeric, push_after_month date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH latest AS (
    SELECT DISTINCT ON (sr.employee_id) sr.*
    FROM public.hr_salary_revisions sr
    WHERE sr.status = 'APPLIED' AND sr.razorpay_push_state IS NOT NULL
      AND sr.razorpay_push_state NOT IN ('cancelled','superseded')
    ORDER BY sr.employee_id, sr.effective_from DESC, sr.created_at DESC
  )
  SELECT l.id, l.employee_id, em.razorpay_employee_id, l.new_total, l.push_after_month
  FROM latest l
  JOIN public.hr_employees e ON e.id = l.employee_id AND e.is_active
  JOIN public.hr_razorpay_employee_map em ON em.hr_employee_id = l.employee_id
  WHERE l.razorpay_push_state IN ('held','queued','failed')
    AND public.hr_open_payroll_month() >= l.push_after_month
    AND round(e.total_salary) = round(l.new_total)
    AND (p_revision_id IS NULL OR l.id = p_revision_id);
$$;
REVOKE ALL ON FUNCTION public.hr_ctc_revisions_due_for_push(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_ctc_revisions_due_for_push(uuid) TO service_role;

-- Is this employee's ERP CTC still held back from RazorpayX? (proxy guard)
CREATE OR REPLACE FUNCTION public.hr_ctc_push_held(p_employee_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT jsonb_build_object('held', true, 'revision_id', sr.id, 'push_after_month', sr.push_after_month)
    FROM public.hr_salary_revisions sr
    WHERE sr.employee_id = p_employee_id AND sr.status = 'APPLIED'
      AND sr.razorpay_push_state IN ('held','queued','failed')
      AND public.hr_open_payroll_month() < sr.push_after_month
    ORDER BY sr.effective_from DESC LIMIT 1), jsonb_build_object('held', false));
$$;
GRANT EXECUTE ON FUNCTION public.hr_ctc_push_held(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hr_call_push_held_ctc()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_secret text; v_request_id bigint;
BEGIN
  SELECT secret_value INTO v_secret FROM public.app_scheduler_secrets WHERE name = 'internal_cron';
  IF v_secret IS NULL OR length(v_secret) = 0 THEN RAISE EXCEPTION 'internal_cron scheduler secret is not configured'; END IF;
  SELECT net.http_post(
    url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/hr-push-held-ctc',
    headers := jsonb_build_object('Content-Type','application/json','x-scheduler-secret', v_secret),
    body := '{"scheduled":true}'::jsonb, timeout_milliseconds := 300000) INTO v_request_id;
  RETURN v_request_id;
END $$;
REVOKE ALL ON FUNCTION public.hr_call_push_held_ctc() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hr_call_push_held_ctc() TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.hr_tg_cockpit_close_push_ctc()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.step_no = 11 AND NEW.status = 'done'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'done') THEN
    BEGIN PERFORM public.hr_call_push_held_ctc();
    EXCEPTION WHEN OTHERS THEN RAISE WARNING 'auto CTC push dispatch failed: %', SQLERRM; END;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_hr_cockpit_close_push_ctc ON public.hr_payroll_cockpit_state;
CREATE TRIGGER trg_hr_cockpit_close_push_ctc AFTER INSERT OR UPDATE ON public.hr_payroll_cockpit_state
  FOR EACH ROW EXECUTE FUNCTION public.hr_tg_cockpit_close_push_ctc();

SELECT cron.schedule('hr-push-held-ctc-daily', '30 1 * * *', $$SELECT public.hr_call_push_held_ctc();$$);