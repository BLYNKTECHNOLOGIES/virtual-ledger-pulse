ALTER TABLE public.ats_messages
  ADD COLUMN IF NOT EXISTS intent text CHECK (intent IS NULL OR intent IN ('confirm','reschedule','availability','withdraw','documents','question','thanks','auto_reply','other')),
  ADD COLUMN IF NOT EXISTS intent_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS intent_source text CHECK (intent_source IS NULL OR intent_source IN ('rules','hr')),
  ADD COLUMN IF NOT EXISTS handled_at timestamptz,
  ADD COLUMN IF NOT EXISTS handled_by uuid,
  ADD COLUMN IF NOT EXISTS handled_by_name text,
  ADD COLUMN IF NOT EXISTS handled_action text;

CREATE TABLE IF NOT EXISTS public.ats_conversation_state (
  candidate_id uuid PRIMARY KEY REFERENCES public.ats_candidates(id) ON DELETE CASCADE,
  done_at timestamptz,
  snoozed_until timestamptz,
  follow_up_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  updated_by_name text
);
ALTER TABLE public.ats_conversation_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY ats_conversation_state_select ON public.ats_conversation_state FOR SELECT TO authenticated
  USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
GRANT SELECT ON public.ats_conversation_state TO authenticated;
GRANT ALL ON public.ats_conversation_state TO service_role;

CREATE OR REPLACE FUNCTION public.ats_messages_reopen_conversation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.direction = 'inbound' AND NOT NEW.is_automatic AND coalesce(NEW.intent, '') <> 'auto_reply' THEN
    UPDATE public.ats_conversation_state
      SET done_at = NULL, snoozed_until = NULL, follow_up_at = NULL, updated_at = now(), updated_by = NULL, updated_by_name = 'Candidate replied'
      WHERE candidate_id = NEW.candidate_id AND (done_at IS NOT NULL OR snoozed_until IS NOT NULL OR follow_up_at IS NOT NULL);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS ats_messages_reopen_conversation ON public.ats_messages;
CREATE TRIGGER ats_messages_reopen_conversation AFTER INSERT ON public.ats_messages
  FOR EACH ROW EXECUTE FUNCTION public.ats_messages_reopen_conversation();

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
    WHEN s.follow_up_at IS NOT NULL AND s.follow_up_at <= now() THEN 'follow_up'
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

CREATE OR REPLACE FUNCTION public.ats_conversations(p_view text DEFAULT 'needs_reply', p_search text DEFAULT NULL,
  p_before timestamptz DEFAULT NULL, p_limit integer DEFAULT 50)
RETURNS SETOF public.ats_conversation_list LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT l.* FROM public.ats_conversation_list l
  WHERE (p_view = 'all' OR (p_view = 'unread' AND l.unread > 0) OR l.state = p_view)
    AND (p_before IS NULL OR l.last_at < p_before)
    AND (nullif(btrim(coalesce(p_search, '')), '') IS NULL
         OR l.full_name ILIKE '%' || replace(replace(btrim(p_search), '%', '\%'), '_', '\_') || '%'
         OR l.ref_no ILIKE '%' || replace(replace(btrim(p_search), '%', '\%'), '_', '\_') || '%'
         OR l.email ILIKE '%' || replace(replace(btrim(p_search), '%', '\%'), '_', '\_') || '%'
         OR EXISTS (SELECT 1 FROM public.ats_messages x WHERE x.candidate_id = l.candidate_id
                    AND (x.subject ILIKE '%' || replace(replace(btrim(p_search), '%', '\%'), '_', '\_') || '%'
                      OR x.snippet ILIKE '%' || replace(replace(btrim(p_search), '%', '\%'), '_', '\_') || '%')))
  ORDER BY l.last_at DESC, l.candidate_id
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 100)
$$;

CREATE OR REPLACE FUNCTION public.ats_conversation_counts()
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'needs_reply', count(*) FILTER (WHERE state = 'needs_reply'),
    'follow_up', count(*) FILTER (WHERE state = 'follow_up'),
    'waiting', count(*) FILTER (WHERE state = 'waiting'),
    'snoozed', count(*) FILTER (WHERE state = 'snoozed'),
    'done', count(*) FILTER (WHERE state = 'done'),
    'unread', count(*) FILTER (WHERE unread > 0),
    'all', count(*))
  FROM public.ats_conversation_list
$$;

CREATE OR REPLACE FUNCTION public.ats_set_conversation(p_candidate_id uuid, p_action text, p_until timestamptz DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text := public.ats_actor_name(auth.uid());
BEGIN
  IF NOT coalesce(public.hr_is_hr_staff(auth.uid()), false) THEN RAISE EXCEPTION 'ATS_FORBIDDEN'; END IF;
  IF p_action NOT IN ('done', 'reopen', 'snooze', 'follow_up', 'clear_follow_up') THEN RAISE EXCEPTION 'ATS_INVALID'; END IF;
  IF p_action IN ('snooze', 'follow_up') AND (p_until IS NULL OR p_until <= now()) THEN RAISE EXCEPTION 'ATS_INVALID'; END IF;
  INSERT INTO public.ats_conversation_state (candidate_id) VALUES (p_candidate_id) ON CONFLICT (candidate_id) DO NOTHING;
  UPDATE public.ats_conversation_state SET
    done_at = CASE p_action WHEN 'done' THEN now() WHEN 'reopen' THEN NULL ELSE done_at END,
    snoozed_until = CASE p_action WHEN 'snooze' THEN p_until WHEN 'reopen' THEN NULL WHEN 'done' THEN NULL ELSE snoozed_until END,
    follow_up_at = CASE p_action WHEN 'follow_up' THEN p_until WHEN 'clear_follow_up' THEN NULL WHEN 'done' THEN NULL ELSE follow_up_at END,
    updated_at = now(), updated_by = auth.uid(), updated_by_name = v_name
  WHERE candidate_id = p_candidate_id;
END $$;

CREATE OR REPLACE FUNCTION public.ats_set_message_intent(p_message_id uuid, p_intent text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT coalesce(public.hr_is_hr_staff(auth.uid()), false) THEN RAISE EXCEPTION 'ATS_FORBIDDEN'; END IF;
  UPDATE public.ats_messages SET intent = p_intent, intent_source = 'hr'
  WHERE id = p_message_id AND direction = 'inbound';
  IF NOT FOUND THEN RAISE EXCEPTION 'ATS_NOT_FOUND'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ats_mark_message_handled(p_message_id uuid, p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_action text := left(nullif(btrim(coalesce(p_action, '')), ''), 60);
BEGIN
  IF NOT coalesce(public.hr_is_hr_staff(auth.uid()), false) THEN RAISE EXCEPTION 'ATS_FORBIDDEN'; END IF;
  UPDATE public.ats_messages SET
    handled_at = CASE WHEN v_action IS NULL THEN NULL ELSE now() END,
    handled_by = CASE WHEN v_action IS NULL THEN NULL ELSE auth.uid() END,
    handled_by_name = CASE WHEN v_action IS NULL THEN NULL ELSE public.ats_actor_name(auth.uid()) END,
    handled_action = v_action
  WHERE id = p_message_id AND direction = 'inbound';
  IF NOT FOUND THEN RAISE EXCEPTION 'ATS_NOT_FOUND'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ats_set_interview_response(p_interview_id uuid, p_response text, p_message_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT coalesce(public.hr_is_hr_staff(auth.uid()), false) THEN RAISE EXCEPTION 'ATS_FORBIDDEN'; END IF;
  IF p_response NOT IN ('accepted', 'declined', 'tentative') THEN RAISE EXCEPTION 'ATS_INVALID'; END IF;
  UPDATE public.ats_interviews SET candidate_response = p_response, candidate_response_at = now()
  WHERE id = p_interview_id AND status = 'scheduled';
  IF NOT FOUND THEN RAISE EXCEPTION 'ATS_INTERVIEW_CLOSED'; END IF;
  IF p_message_id IS NOT NULL THEN
    PERFORM public.ats_mark_message_handled(p_message_id, 'interview_' || p_response);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ats_log_contact(p_candidate_id uuid, p_application_id uuid, p_channel text, p_outcome text,
  p_note text DEFAULT NULL, p_template_code text DEFAULT NULL, p_follow_up_at timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  END IF;
  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.ats_conversations(text, text, timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ats_conversation_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ats_set_conversation(uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ats_set_message_intent(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ats_mark_message_handled(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ats_set_interview_response(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ats_log_contact(uuid, uuid, text, text, text, text, timestamptz) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.ats_set_conversation(uuid, text, timestamptz), public.ats_set_message_intent(uuid, text),
  public.ats_mark_message_handled(uuid, text), public.ats_set_interview_response(uuid, text, uuid),
  public.ats_log_contact(uuid, uuid, text, text, text, text, timestamptz) FROM anon;

ALTER PUBLICATION supabase_realtime ADD TABLE public.ats_messages, public.ats_conversation_state;

SELECT cron.alter_job(job_id := 135, schedule := '*/2 * * * *');

CREATE OR REPLACE FUNCTION public.ats_mail_store_inbound(p jsonb)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
v_cid uuid := (p->>'candidate_id')::uuid;
v_app uuid := nullif(p->>'application_id', '')::uuid;
v_mid text := nullif(btrim(p->>'message_id'), '');
v_id uuid; v_file uuid; f jsonb; v_files jsonb := '[]'::jsonb; v_att jsonb;
BEGIN
IF v_cid IS NULL OR v_mid IS NULL THEN RAISE EXCEPTION 'ATS_MAIL_STORE_INVALID'; END IF;
IF NOT EXISTS (SELECT 1 FROM public.ats_candidates WHERE id = v_cid) THEN
RETURN jsonb_build_object('stored', false, 'reason', 'candidate_missing');
END IF;
IF v_app IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ats_applications WHERE id = v_app AND candidate_id = v_cid) THEN
v_app := NULL;
END IF;
IF v_app IS NULL THEN
SELECT a.id INTO v_app FROM public.ats_applications a WHERE a.candidate_id = v_cid
ORDER BY (a.status IN ('active', 'on_hold')) DESC, a.applied_at DESC LIMIT 1;
END IF;
PERFORM set_config('ats.actor_name', 'Email from candidate', true);
INSERT INTO public.ats_messages (candidate_id, application_id, direction, status, is_automatic, mailbox_id,
from_address, from_name, to_addresses, cc_addresses, subject, body_text, body_html, snippet,
message_id, in_reply_to, references_header, imap_uid, received_at, attachments, from_other_address,
intent, intent_data, intent_source, handled_action, handled_at, handled_by_name)
VALUES (v_cid, v_app, 'inbound', 'received', coalesce((p->>'is_automatic')::boolean, false),
nullif(p->>'mailbox_id', '')::uuid,
left(lower(nullif(btrim(p->>'from_address'), '')), 254), left(nullif(btrim(p->>'from_name'), ''), 200),
public.ats_text_array(p->'to_addresses'), public.ats_text_array(p->'cc_addresses'),
left(p->>'subject', 500), left(p->>'body_text', 200000), left(p->>'body_html', 1000000), p->>'snippet',
v_mid, nullif(p->>'in_reply_to', ''), left(nullif(p->>'references_header', ''), 4000),
nullif(p->>'imap_uid', '')::bigint, coalesce(nullif(p->>'received_at', '')::timestamptz, now()),
coalesce(p->'attachments', '[]'::jsonb), coalesce((p->>'from_other_address')::boolean, false),
nullif(p->>'intent', ''), coalesce(p->'intent_data', '{}'::jsonb),
CASE WHEN nullif(p->>'intent', '') IS NULL THEN NULL ELSE 'rules' END,
nullif(p->>'handled_action', ''),
CASE WHEN nullif(p->>'handled_action', '') IS NULL THEN NULL ELSE now() END,
CASE WHEN nullif(p->>'handled_action', '') IS NULL THEN NULL ELSE 'Calendar reply' END)
ON CONFLICT (message_id) WHERE message_id IS NOT NULL DO NOTHING
RETURNING id INTO v_id;
IF v_id IS NULL THEN
SELECT id INTO v_id FROM public.ats_messages WHERE message_id = v_mid;
RETURN jsonb_build_object('stored', false, 'reason', 'duplicate', 'id', v_id);
END IF;
FOR f IN SELECT value FROM jsonb_array_elements(coalesce(p->'files', '[]'::jsonb)) LOOP
INSERT INTO public.ats_files (candidate_id, application_id, kind, file_name, storage_path, mime_type, size_bytes,
sha256, source, uploaded_by_name)
VALUES (v_cid, v_app, coalesce(nullif(f->>'kind', ''), 'other'), left(f->>'file_name', 255), f->>'storage_path',
nullif(f->>'mime_type', ''), nullif(f->>'size_bytes', '')::bigint, nullif(f->>'sha256', ''), 'email',
'Email from candidate')
RETURNING id INTO v_file;
v_files := v_files || jsonb_build_array(jsonb_build_object('storage_path', f->>'storage_path', 'file_id', v_file));
END LOOP;
IF jsonb_array_length(v_files) > 0 THEN
SELECT coalesce(jsonb_agg(CASE WHEN x.f IS NULL THEN a.value ELSE a.value || jsonb_build_object('file_id', x.f) END
ORDER BY a.ord), '[]'::jsonb)
INTO v_att
FROM jsonb_array_elements(coalesce(p->'attachments', '[]'::jsonb)) WITH ORDINALITY AS a(value, ord)
LEFT JOIN LATERAL (
SELECT vf->>'file_id' AS f FROM jsonb_array_elements(v_files) vf
WHERE vf->>'storage_path' = a.value->>'storage_path' LIMIT 1) x ON true;
UPDATE public.ats_messages SET attachments = v_att WHERE id = v_id;
END IF;
RETURN jsonb_build_object('stored', true, 'id', v_id, 'application_id', v_app, 'files', jsonb_array_length(v_files));
END $function$;

CREATE OR REPLACE FUNCTION public.ats_messages_after_write()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_job uuid; v_type text; v_summary text; v_actor uuid; v_actor_name text;
v_subject text := left(coalesce(nullif(btrim(NEW.subject), ''), '(no subject)'), 120);
BEGIN
IF TG_OP = 'INSERT' AND NEW.direction = 'inbound' THEN
v_type := 'email_received';
v_summary := 'Email received: ' || v_subject;
v_actor := NULL;
v_actor_name := coalesce(nullif(btrim(NEW.from_name), ''), 'Candidate');
ELSIF NEW.direction = 'outbound' AND NEW.status IN ('sent', 'failed', 'bounced')
AND (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status) THEN
v_type := CASE NEW.status WHEN 'sent' THEN 'email_sent' WHEN 'failed' THEN 'email_failed' ELSE 'email_bounced' END;
v_summary := CASE NEW.status WHEN 'sent' THEN 'Email sent: ' WHEN 'failed' THEN 'Email not sent: ' ELSE 'Email bounced: ' END || v_subject;
v_actor := NEW.created_by;
v_actor_name := coalesce(NEW.created_by_name, CASE WHEN NEW.is_automatic THEN 'ATS (automatic)' ELSE 'System' END);
ELSE
RETURN NULL;
END IF;
SELECT job_id INTO v_job FROM public.ats_applications WHERE id = NEW.application_id;
INSERT INTO public.ats_events (candidate_id, application_id, job_id, event_type, summary, data, actor_user_id, actor_name)
VALUES (NEW.candidate_id, NEW.application_id, v_job, v_type, v_summary,
CASE WHEN v_type = 'email_received'
  THEN jsonb_build_object('message_id', NEW.id, 'purpose', NEW.purpose, 'automatic', NEW.is_automatic,
    'attachments', jsonb_array_length(NEW.attachments), 'intent', NEW.intent)
  ELSE jsonb_build_object('message_id', NEW.id, 'purpose', NEW.purpose, 'automatic', NEW.is_automatic,
    'attachments', jsonb_array_length(NEW.attachments)) END,
v_actor, v_actor_name);
UPDATE public.ats_candidates SET last_activity_at = now() WHERE id = NEW.candidate_id;
RETURN NULL;
END $function$;