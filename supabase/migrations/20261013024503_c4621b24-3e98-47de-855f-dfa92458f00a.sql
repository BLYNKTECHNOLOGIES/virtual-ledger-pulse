CREATE OR REPLACE VIEW public.ats_conversation_list WITH (security_invoker = true) AS
WITH base AS (
  SELECT candidate_id FROM public.ats_messages
  UNION
  SELECT candidate_id FROM public.ats_conversation_state
), m AS (
  SELECT candidate_id,
    max(coalesce(received_at, sent_at, created_at)) AS last_at,
    max(received_at) FILTER (WHERE direction = 'inbound' AND NOT is_automatic AND coalesce(intent, '') <> 'auto_reply') AS last_in_at,
    max(sent_at) FILTER (WHERE direction = 'outbound' AND status = 'sent' AND NOT is_automatic) AS last_out_at,
    count(*) FILTER (WHERE direction = 'inbound' AND read_at IS NULL) AS unread
  FROM public.ats_messages GROUP BY candidate_id
), last_any AS (
  SELECT DISTINCT ON (candidate_id) candidate_id, direction AS last_direction, subject AS last_subject, snippet AS last_snippet,
         status AS last_status, purpose AS last_purpose
  FROM public.ats_messages
  ORDER BY candidate_id, coalesce(received_at, sent_at, created_at) DESC
), last_in AS (
  SELECT DISTINCT ON (candidate_id) candidate_id, id AS last_in_id, intent AS last_intent, intent_data AS last_intent_data,
         handled_at AS last_in_handled_at, handled_action AS last_in_handled_action
  FROM public.ats_messages
  WHERE direction = 'inbound' AND NOT is_automatic AND coalesce(intent, '') <> 'auto_reply'
  ORDER BY candidate_id, received_at DESC
), last_out AS (
  SELECT DISTINCT ON (candidate_id) candidate_id, purpose AS last_out_purpose
  FROM public.ats_messages
  WHERE direction = 'outbound' AND status = 'sent' AND NOT is_automatic
  ORDER BY candidate_id, sent_at DESC
)
SELECT c.id AS candidate_id, c.full_name, c.ref_no, c.email, c.phone,
  app.application_id, app.job_title, app.stage_name, app.stage_kind, app.app_status,
  coalesce(m.last_at, s.updated_at) AS last_at, m.last_in_at, m.last_out_at, coalesce(m.unread, 0)::int AS unread,
  la.last_direction, la.last_subject, la.last_snippet, la.last_status,
  li.last_in_id, li.last_intent, li.last_intent_data, li.last_in_handled_at, li.last_in_handled_action,
  s.done_at, s.snoozed_until, s.follow_up_at,
  iv.next_interview_id, iv.next_interview_at, iv.next_interview_response,
  CASE
    WHEN s.snoozed_until > now() THEN 'snoozed'
    WHEN s.done_at IS NOT NULL AND s.done_at >= coalesce(m.last_in_at, '-infinity'::timestamptz) THEN 'done'
    WHEN m.last_in_at IS NOT NULL AND m.last_in_at > coalesce(m.last_out_at, '-infinity'::timestamptz)
         AND li.last_in_handled_at IS NULL AND coalesce(li.last_intent, '') <> 'thanks' THEN 'needs_reply'
    WHEN s.follow_up_at IS NOT NULL AND s.follow_up_at <= now()
         AND s.follow_up_at > coalesce(m.last_out_at, '-infinity'::timestamptz) THEN 'follow_up'
    WHEN m.last_out_at IS NOT NULL AND m.last_out_at >= coalesce(m.last_in_at, '-infinity'::timestamptz)
         AND coalesce(lo.last_out_purpose, '') <> 'rejection' AND app.app_status IN ('active', 'on_hold') THEN 'waiting'
    ELSE 'done'
  END AS state
FROM base b
JOIN public.ats_candidates c ON c.id = b.candidate_id
LEFT JOIN m ON m.candidate_id = b.candidate_id
LEFT JOIN last_any la ON la.candidate_id = b.candidate_id
LEFT JOIN last_in li ON li.candidate_id = b.candidate_id
LEFT JOIN last_out lo ON lo.candidate_id = b.candidate_id
LEFT JOIN public.ats_conversation_state s ON s.candidate_id = b.candidate_id
LEFT JOIN LATERAL (
  SELECT a.id AS application_id, coalesce(j.title, nullif(btrim(a.position_text), ''), 'General application') AS job_title,
         st.name AS stage_name, st.kind AS stage_kind, a.status AS app_status
  FROM public.ats_applications a
  LEFT JOIN public.ats_jobs j ON j.id = a.job_id
  LEFT JOIN public.ats_stages st ON st.id = a.stage_id
  WHERE a.candidate_id = b.candidate_id
  ORDER BY (a.status IN ('active', 'on_hold')) DESC, a.applied_at DESC
  LIMIT 1) app ON true
LEFT JOIN LATERAL (
  SELECT i.id AS next_interview_id, i.starts_at AS next_interview_at, i.candidate_response AS next_interview_response
  FROM public.ats_interviews i
  WHERE i.candidate_id = b.candidate_id AND i.status = 'scheduled' AND i.ends_at > now()
  ORDER BY i.starts_at
  LIMIT 1) iv ON true
WHERE c.merged_into_id IS NULL AND c.anonymized_at IS NULL;
GRANT SELECT ON public.ats_conversation_list TO authenticated;

CREATE OR REPLACE FUNCTION public.ats_messages_reopen_conversation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.direction = 'inbound' AND NOT NEW.is_automatic AND coalesce(NEW.intent, '') <> 'auto_reply' THEN
    UPDATE public.ats_conversation_state
      SET done_at = NULL, snoozed_until = NULL, follow_up_at = NULL, updated_at = now(), updated_by = NULL, updated_by_name = 'Candidate replied'
      WHERE candidate_id = NEW.candidate_id
        AND (done_at IS NOT NULL OR snoozed_until IS NOT NULL OR follow_up_at IS NOT NULL)
        AND (coalesce(NEW.received_at, now()) > updated_at OR coalesce(NEW.received_at, now()) > now() - interval '2 days');
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.ats_log_contact(p_candidate_id uuid, p_application_id uuid, p_channel text, p_outcome text,
  p_note text DEFAULT NULL::text, p_template_code text DEFAULT NULL::text, p_follow_up_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_id uuid; v_job uuid; v_summary text; v_name text := public.ats_actor_name(auth.uid());
BEGIN
  IF NOT coalesce(public.hr_is_hr_staff(auth.uid()), false) THEN RAISE EXCEPTION 'ATS_FORBIDDEN'; END IF;
  IF p_channel NOT IN ('call', 'whatsapp') THEN RAISE EXCEPTION 'ATS_INVALID'; END IF;
  IF p_channel = 'call' AND p_outcome NOT IN ('connected', 'no_answer', 'busy', 'switched_off', 'wrong_number', 'call_back') THEN RAISE EXCEPTION 'ATS_INVALID'; END IF;
  IF p_channel = 'whatsapp' AND p_outcome NOT IN ('opened') THEN RAISE EXCEPTION 'ATS_INVALID'; END IF;
  IF p_application_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ats_applications WHERE id = p_application_id AND candidate_id = p_candidate_id) THEN
    p_application_id := NULL;
  END IF;
  SELECT job_id INTO v_job FROM public.ats_applications WHERE id = p_application_id;
  v_summary := CASE WHEN p_channel = 'whatsapp' THEN 'WhatsApp opened' || coalesce(': ' || (SELECT name FROM public.ats_email_templates WHERE code = p_template_code), '')
    ELSE 'Call: ' || CASE p_outcome WHEN 'connected' THEN 'spoke to the candidate' WHEN 'no_answer' THEN 'no answer' WHEN 'busy' THEN 'busy'
      WHEN 'switched_off' THEN 'phone switched off' WHEN 'wrong_number' THEN 'wrong number' ELSE 'asked to call back' END END;
  INSERT INTO public.ats_events (candidate_id, application_id, job_id, event_type, summary, data, actor_user_id, actor_name)
  VALUES (p_candidate_id, p_application_id, v_job, CASE p_channel WHEN 'call' THEN 'call_logged' ELSE 'whatsapp_opened' END, v_summary,
    jsonb_build_object('channel', p_channel, 'outcome', p_outcome, 'note', left(nullif(btrim(coalesce(p_note, '')), ''), 1000),
      'template_code', p_template_code, 'follow_up_at', p_follow_up_at),
    auth.uid(), v_name)
  RETURNING id INTO v_id;
  UPDATE public.ats_candidates SET last_activity_at = now() WHERE id = p_candidate_id;
  IF p_follow_up_at IS NOT NULL AND p_follow_up_at > now() THEN
    PERFORM public.ats_set_conversation(p_candidate_id, 'follow_up', p_follow_up_at);
  ELSE
    UPDATE public.ats_conversation_state
      SET follow_up_at = NULL, updated_at = now(), updated_by = auth.uid(), updated_by_name = v_name
      WHERE candidate_id = p_candidate_id AND follow_up_at IS NOT NULL AND follow_up_at <= now();
  END IF;
  RETURN v_id;
END $function$;