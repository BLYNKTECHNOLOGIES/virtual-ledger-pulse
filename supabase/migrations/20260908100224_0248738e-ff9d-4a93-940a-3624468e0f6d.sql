
-- 1) Automation state (single row)
CREATE TABLE public.hr_attendance_automation_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  state text NOT NULL DEFAULT 'running' CHECK (state IN ('running','paused_auto','paused_manual')),
  paused_since timestamptz,
  paused_reason text,
  paused_by uuid,
  resumed_at timestamptz,
  resumed_by uuid,
  auto_pause_threshold_minutes integer NOT NULL DEFAULT 120,
  settle_minutes integer NOT NULL DEFAULT 20,
  stale_pause_warn_days integer NOT NULL DEFAULT 3,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.hr_attendance_automation_state TO authenticated;
GRANT ALL ON public.hr_attendance_automation_state TO service_role;
ALTER TABLE public.hr_attendance_automation_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR staff can view attendance automation state"
ON public.hr_attendance_automation_state FOR SELECT TO authenticated
USING (public.hr_is_hr_staff(auth.uid()));

-- 2) Outage log
CREATE TABLE public.hr_attendance_outages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  detected_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  trigger text NOT NULL DEFAULT 'auto' CHECK (trigger IN ('auto','manual')),
  reason text,
  opened_by uuid,
  closed_by uuid,
  silent_devices jsonb NOT NULL DEFAULT '[]'::jsonb,
  from_date date,
  to_date date,
  recovery_status text NOT NULL DEFAULT 'pending'
    CHECK (recovery_status IN ('pending','running','done','failed','skipped')),
  recovery_started_at timestamptz,
  recovery_finished_at timestamptz,
  recovery_result jsonb,
  mail_release_status text NOT NULL DEFAULT 'pending'
    CHECK (mail_release_status IN ('pending','running','done','failed','skipped')),
  mail_release_result jsonb,
  recovery_lease_until timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.hr_attendance_outages TO authenticated;
GRANT ALL ON public.hr_attendance_outages TO service_role;
ALTER TABLE public.hr_attendance_outages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR staff can view attendance outages"
ON public.hr_attendance_outages FOR SELECT TO authenticated
USING (public.hr_is_hr_staff(auth.uid()));

CREATE UNIQUE INDEX hr_attendance_outages_one_open
  ON public.hr_attendance_outages ((ended_at IS NULL)) WHERE ended_at IS NULL;
CREATE INDEX hr_attendance_outages_started_idx
  ON public.hr_attendance_outages (started_at DESC);

CREATE TRIGGER trg_hr_attendance_automation_state_updated
BEFORE UPDATE ON public.hr_attendance_automation_state
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_hr_attendance_outages_updated
BEFORE UPDATE ON public.hr_attendance_outages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.hr_attendance_automation_state (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

-- 3) Read helper: is attendance automation paused?
CREATE OR REPLACE FUNCTION public.hr_attendance_is_paused()
RETURNS TABLE (paused boolean, state text, reason text, outage_id uuid, paused_since timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.state <> 'running',
    s.state,
    s.paused_reason,
    (SELECT o.id FROM public.hr_attendance_outages o WHERE o.ended_at IS NULL ORDER BY o.started_at DESC LIMIT 1),
    s.paused_since
  FROM public.hr_attendance_automation_state s
  WHERE s.id
$$;

GRANT EXECUTE ON FUNCTION public.hr_attendance_is_paused() TO authenticated, service_role;

-- 4) HR-facing pause / resume
CREATE OR REPLACE FUNCTION public.hr_attendance_pause(p_reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_outage uuid;
BEGIN
  IF NOT public.hr_is_hr_staff(v_uid) THEN
    RAISE EXCEPTION 'Not authorised to pause attendance automation';
  END IF;

  UPDATE public.hr_attendance_automation_state
     SET state = 'paused_manual',
         paused_since = COALESCE(paused_since, now()),
         paused_reason = COALESCE(NULLIF(p_reason, ''), 'Paused by HR'),
         paused_by = v_uid,
         resumed_at = NULL,
         resumed_by = NULL
   WHERE id;

  SELECT id INTO v_outage FROM public.hr_attendance_outages
   WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1;

  IF v_outage IS NULL THEN
    INSERT INTO public.hr_attendance_outages (trigger, reason, opened_by, from_date)
    VALUES ('manual', COALESCE(NULLIF(p_reason, ''), 'Paused by HR'), v_uid,
            (now() AT TIME ZONE 'Asia/Kolkata')::date)
    RETURNING id INTO v_outage;
  END IF;

  RETURN v_outage;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_attendance_pause(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_attendance_resume(p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_outage uuid;
BEGIN
  IF NOT public.hr_is_hr_staff(v_uid) THEN
    RAISE EXCEPTION 'Not authorised to resume attendance automation';
  END IF;

  UPDATE public.hr_attendance_automation_state
     SET state = 'running',
         paused_since = NULL,
         paused_reason = NULL,
         resumed_at = now(),
         resumed_by = v_uid
   WHERE id;

  UPDATE public.hr_attendance_outages
     SET ended_at = now(),
         closed_by = v_uid,
         to_date = (now() AT TIME ZONE 'Asia/Kolkata')::date,
         notes = COALESCE(NULLIF(p_note, ''), notes)
   WHERE ended_at IS NULL
  RETURNING id INTO v_outage;

  RETURN v_outage;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_attendance_resume(text) TO authenticated;
