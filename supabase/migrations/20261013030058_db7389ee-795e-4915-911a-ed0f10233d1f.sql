ALTER TABLE public.ats_settings
  ADD COLUMN IF NOT EXISTS self_schedule_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS self_schedule_hours integer NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS public_app_url text NOT NULL DEFAULT 'https://erp.blynkex.com';
ALTER TABLE public.ats_settings DROP CONSTRAINT IF EXISTS ats_settings_self_schedule_hours_check;
ALTER TABLE public.ats_settings ADD CONSTRAINT ats_settings_self_schedule_hours_check CHECK (self_schedule_hours IN (24, 48, 72, 168));
ALTER TABLE public.ats_settings DROP CONSTRAINT IF EXISTS ats_settings_public_app_url_check;
ALTER TABLE public.ats_settings ADD CONSTRAINT ats_settings_public_app_url_check CHECK (public_app_url ~ '^https://([a-z0-9-]+\.)*blynkex\.com$');

CREATE TABLE IF NOT EXISTS public.ats_slot_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  application_id uuid NOT NULL REFERENCES public.ats_applications(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES public.ats_candidates(id) ON DELETE CASCADE,
  move_interview_id uuid REFERENCES public.ats_interviews(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Interview',
  mode text NOT NULL CHECK (mode IN ('in_person', 'video', 'phone')),
  location text, meeting_url text, candidate_note text,
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 10 AND 480),
  slots timestamptz[] NOT NULL CHECK (cardinality(slots) BETWEEN 1 AND 8),
  panel uuid[] NOT NULL DEFAULT '{}',
  move_stage boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'booked', 'cancelled')),
  expires_at timestamptz NOT NULL,
  booked_start timestamptz, booked_at timestamptz,
  interview_id uuid REFERENCES public.ats_interviews(id) ON DELETE SET NULL,
  created_by uuid, created_by_name text, created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz, cancelled_by_name text
);
CREATE INDEX IF NOT EXISTS ats_slot_offers_app_idx ON public.ats_slot_offers (application_id, status);
CREATE INDEX IF NOT EXISTS ats_slot_offers_interview_idx ON public.ats_slot_offers (interview_id) WHERE interview_id IS NOT NULL;
ALTER TABLE public.ats_slot_offers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ats_slot_offers_select ON public.ats_slot_offers;
CREATE POLICY ats_slot_offers_select ON public.ats_slot_offers FOR SELECT TO authenticated
  USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
REVOKE ALL ON public.ats_slot_offers FROM anon, authenticated;
GRANT SELECT ON public.ats_slot_offers TO authenticated;
GRANT ALL ON public.ats_slot_offers TO service_role;

CREATE OR REPLACE FUNCTION public.ats_slot_free(p_offer public.ats_slot_offers, p_start timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_start > now() + interval '2 hours'
    AND NOT EXISTS (
      SELECT 1 FROM public.ats_interviews i
      WHERE i.status = 'scheduled'
        AND i.id IS DISTINCT FROM p_offer.move_interview_id
        AND i.starts_at < p_start + make_interval(mins => p_offer.duration_minutes)
        AND i.ends_at > p_start
        AND (i.candidate_id = p_offer.candidate_id
          OR EXISTS (SELECT 1 FROM public.ats_interview_panel pm
                     WHERE pm.interview_id = i.id AND pm.removed_at IS NULL AND pm.employee_id = ANY (p_offer.panel))
          OR (cardinality(p_offer.panel) = 0 AND p_offer.created_by IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM public.ats_interview_panel pm2 WHERE pm2.interview_id = i.id AND pm2.removed_at IS NULL)
              AND (i.created_by = p_offer.created_by
                   OR EXISTS (SELECT 1 FROM public.ats_slot_offers o2 WHERE o2.interview_id = i.id AND o2.created_by = p_offer.created_by)))))
$$;

CREATE OR REPLACE FUNCTION public.ats_create_slot_offer(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_set public.ats_settings;
  v_app uuid := nullif(p->>'application_id', '')::uuid;
  v_move uuid := nullif(p->>'move_interview_id', '')::uuid;
  v_cand uuid; v_status text; v_job uuid;
  v_mode text := p->>'mode';
  v_loc text := nullif(btrim(coalesce(p->>'location', '')), '');
  v_url text := nullif(btrim(coalesce(p->>'meeting_url', '')), '');
  v_minutes integer := coalesce(nullif(p->>'duration_minutes', '')::integer, 30);
  v_title text := left(coalesce(nullif(btrim(p->>'title'), ''), 'Interview'), 200);
  v_slots timestamptz[]; v_panel uuid[]; v_n integer;
  v_token text; v_id uuid; v_exp timestamptz;
  v_name text := public.ats_actor_name(auth.uid());
BEGIN
  IF NOT coalesce(public.hr_is_hr_staff(auth.uid()), false) THEN RAISE EXCEPTION 'ATS_FORBIDDEN'; END IF;
  SELECT * INTO v_set FROM public.ats_settings WHERE id;
  IF NOT coalesce(v_set.self_schedule_enabled, false) THEN RAISE EXCEPTION 'ATS_SELF_SCHEDULE_OFF'; END IF;
  SELECT candidate_id, status, job_id INTO v_cand, v_status, v_job FROM public.ats_applications WHERE id = v_app;
  IF v_cand IS NULL THEN RAISE EXCEPTION 'ATS_APPLICATION_NOT_FOUND'; END IF;
  IF v_status NOT IN ('active', 'on_hold') THEN
    RAISE EXCEPTION 'ATS_APPLICATION_CLOSED' USING HINT = 'Reopen the application before scheduling an interview.';
  END IF;
  IF v_move IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ats_interviews
      WHERE id = v_move AND application_id = v_app AND status = 'scheduled') THEN
    RAISE EXCEPTION 'ATS_INTERVIEW_CLOSED' USING HINT = 'Only a scheduled interview can be changed.';
  END IF;
  IF v_mode IS NULL OR v_mode NOT IN ('in_person', 'video', 'phone') THEN RAISE EXCEPTION 'ATS_INTERVIEW_INVALID' USING DETAIL = 'mode'; END IF;
  IF v_minutes NOT BETWEEN 10 AND 480 THEN RAISE EXCEPTION 'ATS_INTERVIEW_INVALID' USING DETAIL = 'duration'; END IF;
  IF v_mode = 'in_person' THEN
    v_loc := coalesce(v_loc, v_set.interview_address);
    IF v_loc IS NULL THEN RAISE EXCEPTION 'ATS_INTERVIEW_INVALID' USING DETAIL = 'location'; END IF;
    v_url := NULL;
  ELSIF v_mode = 'video' THEN
    IF v_url IS NULL OR v_url !~ '^https://[^\s<>"]+$' OR length(v_url) > 500 THEN
      RAISE EXCEPTION 'ATS_INTERVIEW_INVALID' USING DETAIL = 'meeting_url';
    END IF;
    v_loc := NULL;
  ELSE
    v_loc := NULL; v_url := NULL;
  END IF;
  IF jsonb_typeof(p->'slots') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'ATS_INTERVIEW_INVALID' USING DETAIL = 'slots'; END IF;
  v_slots := ARRAY(SELECT DISTINCT x::timestamptz FROM jsonb_array_elements_text(p->'slots') AS t(x) ORDER BY 1);
  v_n := coalesce(array_length(v_slots, 1), 0);
  IF v_n < 1 OR v_n > 8 OR EXISTS (SELECT 1 FROM unnest(v_slots) AS s(t) WHERE s.t < now() + interval '2 hours' OR s.t > now() + interval '30 days') THEN
    RAISE EXCEPTION 'ATS_INTERVIEW_INVALID' USING DETAIL = 'slots';
  END IF;
  IF jsonb_typeof(coalesce(p->'panel', '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'ATS_INTERVIEW_INVALID' USING DETAIL = 'panel'; END IF;
  v_panel := ARRAY(SELECT DISTINCT x::uuid FROM jsonb_array_elements_text(coalesce(p->'panel', '[]'::jsonb)) AS t(x));
  IF coalesce(array_length(v_panel, 1), 0) > 8 THEN RAISE EXCEPTION 'ATS_INTERVIEW_INVALID' USING DETAIL = 'panel'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_panel) AS u(eid)
             WHERE NOT EXISTS (SELECT 1 FROM public.ats_employee_contacts(ARRAY[u.eid]) ec WHERE ec.is_active)) THEN
    RAISE EXCEPTION 'ATS_INTERVIEWER_NOT_FOUND';
  END IF;

  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  v_exp := now() + make_interval(hours => v_set.self_schedule_hours);
  UPDATE public.ats_slot_offers SET status = 'cancelled', cancelled_at = now(), cancelled_by_name = v_name
    WHERE application_id = v_app AND status = 'open';
  INSERT INTO public.ats_slot_offers (token_hash, application_id, candidate_id, move_interview_id, title, mode, location, meeting_url,
    candidate_note, duration_minutes, slots, panel, move_stage, expires_at, created_by, created_by_name)
  VALUES (encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_app, v_cand, v_move, v_title, v_mode, v_loc, v_url,
    left(nullif(btrim(coalesce(p->>'candidate_note', '')), ''), 1000), v_minutes, v_slots, v_panel,
    v_move IS NULL AND coalesce((p->>'move_to_interview_stage')::boolean, true), v_exp, auth.uid(), v_name)
  RETURNING id INTO v_id;
  INSERT INTO public.ats_events (candidate_id, application_id, job_id, event_type, summary, data, actor_user_id, actor_name)
  VALUES (v_cand, v_app, v_job, 'slots_offered',
    'Offered ' || v_n || CASE WHEN v_n = 1 THEN ' interview time' ELSE ' interview times' END
      || CASE WHEN v_move IS NOT NULL THEN ' (to move the interview)' ELSE '' END,
    jsonb_build_object('offer_id', v_id, 'slots', to_jsonb(v_slots), 'expires_at', v_exp, 'move_interview_id', v_move),
    auth.uid(), v_name);
  RETURN jsonb_build_object('offer_id', v_id, 'token', v_token,
    'link', v_set.public_app_url || '/interview/pick/' || v_token, 'expires_at', v_exp, 'slots', to_jsonb(v_slots));
END $$;

CREATE OR REPLACE FUNCTION public.ats_cancel_slot_offer(p_offer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_o public.ats_slot_offers; v_name text := public.ats_actor_name(auth.uid());
BEGIN
  IF NOT coalesce(public.hr_is_hr_staff(auth.uid()), false) THEN RAISE EXCEPTION 'ATS_FORBIDDEN'; END IF;
  UPDATE public.ats_slot_offers SET status = 'cancelled', cancelled_at = now(), cancelled_by_name = v_name
    WHERE id = p_offer_id AND status = 'open' RETURNING * INTO v_o;
  IF v_o.id IS NULL THEN RAISE EXCEPTION 'ATS_OFFER_CLOSED'; END IF;
  INSERT INTO public.ats_events (candidate_id, application_id, job_id, event_type, summary, data, actor_user_id, actor_name)
  SELECT v_o.candidate_id, v_o.application_id, a.job_id, 'slots_offer_cancelled', 'Cancelled the pick-a-time link',
    jsonb_build_object('offer_id', v_o.id), auth.uid(), v_name
  FROM public.ats_applications a WHERE a.id = v_o.application_id;
END $$;

CREATE OR REPLACE FUNCTION public.ats_slot_offer_view(p_token_hash text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_o public.ats_slot_offers; v_set public.ats_settings; v_c public.ats_candidates;
        v_status text; v_job text; v_iv_status text; v_iv_start timestamptz;
BEGIN
  SELECT * INTO v_o FROM public.ats_slot_offers WHERE token_hash = p_token_hash;
  IF v_o.id IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT * INTO v_set FROM public.ats_settings WHERE id;
  IF NOT coalesce(v_set.self_schedule_enabled, false) THEN RETURN jsonb_build_object('status', 'disabled'); END IF;
  SELECT * INTO v_c FROM public.ats_candidates WHERE id = v_o.candidate_id;
  IF v_c.id IS NULL OR v_c.merged_into_id IS NOT NULL OR v_c.anonymized_at IS NOT NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  SELECT i.status, i.starts_at INTO v_iv_status, v_iv_start FROM public.ats_interviews i WHERE i.id = v_o.interview_id;
  v_status := CASE
    WHEN v_o.status = 'booked' THEN CASE WHEN v_iv_status = 'scheduled' THEN 'booked' ELSE 'cancelled' END
    WHEN v_o.status = 'cancelled' THEN 'cancelled'
    WHEN NOT EXISTS (SELECT 1 FROM public.ats_applications a WHERE a.id = v_o.application_id AND a.status IN ('active', 'on_hold')) THEN 'cancelled'
    WHEN v_o.expires_at <= now() THEN 'expired'
    ELSE 'open' END;
  SELECT coalesce(j.title, nullif(btrim(a.position_text), ''), 'the open role') INTO v_job
    FROM public.ats_applications a LEFT JOIN public.ats_jobs j ON j.id = a.job_id WHERE a.id = v_o.application_id;
  RETURN jsonb_build_object(
    'status', v_status,
    'first_name', public.ats_first_name(v_c.full_name),
    'job_title', v_job,
    'company_name', coalesce(nullif(btrim(v_set.company_display_name), ''), 'Blynk Virtual Technologies'),
    'title', v_o.title,
    'mode', v_o.mode,
    'place', CASE v_o.mode WHEN 'in_person' THEN v_o.location
                           WHEN 'video' THEN 'Video call - the link will be in your confirmation email'
                           ELSE 'Phone call on your registered number' END,
    'duration_minutes', v_o.duration_minutes,
    'expires_at', v_o.expires_at,
    'booked_start', CASE WHEN v_status = 'booked' THEN coalesce(v_iv_start, v_o.booked_start) END,
    'slots', CASE WHEN v_status = 'open'
                  THEN coalesce((SELECT jsonb_agg(s.t ORDER BY s.t) FROM unnest(v_o.slots) AS s(t) WHERE public.ats_slot_free(v_o, s.t)), '[]'::jsonb)
                  ELSE '[]'::jsonb END);
END $$;

CREATE OR REPLACE FUNCTION public.ats_book_slot(p_token_hash text, p_start timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_o public.ats_slot_offers; v_r jsonb; v_iv uuid; v_move boolean; v_p jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ats_book_slot'));
  SELECT * INTO v_o FROM public.ats_slot_offers WHERE token_hash = p_token_hash FOR UPDATE;
  IF v_o.id IS NULL THEN RAISE EXCEPTION 'ATS_OFFER_CLOSED'; END IF;
  IF NOT coalesce((SELECT self_schedule_enabled FROM public.ats_settings WHERE id), false) THEN RAISE EXCEPTION 'ATS_SELF_SCHEDULE_OFF'; END IF;
  IF v_o.status <> 'open' OR v_o.expires_at <= now()
     OR NOT EXISTS (SELECT 1 FROM public.ats_applications a WHERE a.id = v_o.application_id AND a.status IN ('active', 'on_hold'))
     OR EXISTS (SELECT 1 FROM public.ats_candidates c WHERE c.id = v_o.candidate_id AND (c.merged_into_id IS NOT NULL OR c.anonymized_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'ATS_OFFER_CLOSED';
  END IF;
  IF p_start IS NULL OR NOT (p_start = ANY (v_o.slots)) OR NOT public.ats_slot_free(v_o, p_start) THEN RAISE EXCEPTION 'ATS_SLOT_GONE'; END IF;

  PERFORM set_config('ats.actor_name', 'Candidate (picked a time)', true);
  v_move := v_o.move_interview_id IS NOT NULL
            AND EXISTS (SELECT 1 FROM public.ats_interviews WHERE id = v_o.move_interview_id AND status = 'scheduled');
  v_p := jsonb_build_object('application_id', v_o.application_id, 'title', v_o.title, 'mode', v_o.mode,
    'location', v_o.location, 'meeting_url', v_o.meeting_url, 'duration_minutes', v_o.duration_minutes,
    'starts_at', p_start, 'panel', to_jsonb(v_o.panel), 'move_to_interview_stage', v_o.move_stage AND NOT v_move);
  IF v_move THEN
    SELECT v_p || jsonb_build_object('id', i.id, 'candidate_note', coalesce(v_o.candidate_note, i.candidate_note), 'internal_note', i.internal_note)
      INTO v_p FROM public.ats_interviews i WHERE i.id = v_o.move_interview_id;
  ELSE
    v_p := v_p || jsonb_build_object('candidate_note', v_o.candidate_note);
  END IF;
  v_r := public.ats_save_interview_core(v_p);
  v_iv := (v_r->>'id')::uuid;
  UPDATE public.ats_interviews SET candidate_response = 'accepted', candidate_response_at = now() WHERE id = v_iv;
  UPDATE public.ats_slot_offers SET status = 'booked', booked_start = p_start, booked_at = now(), interview_id = v_iv WHERE id = v_o.id;
  RETURN jsonb_build_object('interview_id', v_iv, 'start', p_start, 'moved', v_move,
    'place', CASE v_o.mode WHEN 'in_person' THEN v_o.location
                           WHEN 'video' THEN 'Video call - the link will be in your confirmation email'
                           ELSE 'Phone call on your registered number' END,
    'notify_panel', cardinality(v_o.panel) > 0 OR jsonb_array_length(coalesce(v_r->'removed', '[]'::jsonb)) > 0);
END $$;

REVOKE EXECUTE ON FUNCTION public.ats_slot_free(public.ats_slot_offers, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ats_slot_offer_view(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ats_book_slot(text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ats_create_slot_offer(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ats_cancel_slot_offer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ats_slot_free(public.ats_slot_offers, timestamptz), public.ats_slot_offer_view(text),
  public.ats_book_slot(text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.ats_create_slot_offer(jsonb), public.ats_cancel_slot_offer(uuid) TO authenticated, service_role;