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
    WHEN s.done_at IS NOT NULL
         AND s.done_at >= greatest(coalesce(m.last_in_at, '-infinity'::timestamptz), coalesce(m.last_out_at, '-infinity'::timestamptz)) THEN 'done'
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

CREATE OR REPLACE FUNCTION public.ats_set_conversation(p_candidate_id uuid, p_action text, p_until timestamp with time zone DEFAULT NULL::timestamp with time zone)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_name text := public.ats_actor_name(auth.uid());
BEGIN
  IF NOT coalesce(public.hr_is_hr_staff(auth.uid()), false) THEN RAISE EXCEPTION 'ATS_FORBIDDEN'; END IF;
  IF p_action NOT IN ('done', 'reopen', 'snooze', 'follow_up', 'clear_follow_up') THEN RAISE EXCEPTION 'ATS_INVALID'; END IF;
  IF p_action IN ('snooze', 'follow_up') AND (p_until IS NULL OR p_until <= now()) THEN RAISE EXCEPTION 'ATS_INVALID'; END IF;
  INSERT INTO public.ats_conversation_state (candidate_id) VALUES (p_candidate_id) ON CONFLICT (candidate_id) DO NOTHING;
  UPDATE public.ats_conversation_state SET
    done_at = CASE p_action WHEN 'done' THEN now() WHEN 'reopen' THEN NULL WHEN 'follow_up' THEN NULL ELSE done_at END,
    snoozed_until = CASE p_action WHEN 'snooze' THEN p_until WHEN 'reopen' THEN NULL WHEN 'done' THEN NULL ELSE snoozed_until END,
    follow_up_at = CASE p_action WHEN 'follow_up' THEN p_until WHEN 'clear_follow_up' THEN NULL WHEN 'done' THEN NULL ELSE follow_up_at END,
    updated_at = now(), updated_by = auth.uid(), updated_by_name = v_name
  WHERE candidate_id = p_candidate_id;
END $function$;

CREATE OR REPLACE FUNCTION public.ats_interviews_close_offers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text; v_o record;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  v_name := public.ats_actor_name(auth.uid());
  FOR v_o IN
    UPDATE public.ats_slot_offers o SET status = 'cancelled', cancelled_at = now(), cancelled_by_name = v_name
    WHERE o.status = 'open' AND (
      (TG_OP = 'INSERT' AND o.application_id = NEW.application_id AND o.move_interview_id IS NULL)
      OR (TG_OP = 'UPDATE' AND o.move_interview_id = NEW.id AND (NEW.status <> 'scheduled' OR NEW.revision <> OLD.revision)))
    RETURNING o.id, o.candidate_id, o.application_id
  LOOP
    INSERT INTO public.ats_events (candidate_id, application_id, job_id, event_type, summary, data, actor_user_id, actor_name)
    SELECT v_o.candidate_id, v_o.application_id, a.job_id, 'slots_offer_cancelled',
      CASE WHEN TG_OP = 'INSERT' THEN 'Pick-a-time link turned off: interview scheduled by HR'
           ELSE 'Pick-a-time link turned off: interview changed by HR' END,
      jsonb_build_object('offer_id', v_o.id, 'interview_id', NEW.id), auth.uid(), v_name
    FROM public.ats_applications a WHERE a.id = v_o.application_id;
  END LOOP;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS ats_interviews_close_offers ON public.ats_interviews;
CREATE TRIGGER ats_interviews_close_offers AFTER INSERT OR UPDATE ON public.ats_interviews
  FOR EACH ROW EXECUTE FUNCTION public.ats_interviews_close_offers();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ats_slot_offers') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ats_slot_offers;
  END IF;
END $$;