CREATE OR REPLACE FUNCTION public.ats_email_key(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT CASE
    WHEN p IS NULL OR position('@' IN p) = 0 THEN NULL
    ELSE (
      SELECT CASE WHEN d IN ('gmail.com', 'googlemail.com')
                  THEN replace(split_part(l, '+', 1), '.', '') || '@gmail.com'
                  ELSE split_part(l, '+', 1) || '@' || d END
      FROM (SELECT split_part(lower(btrim(p)), '@', 1) AS l, split_part(lower(btrim(p)), '@', 2) AS d) x)
  END
$$;
ALTER TABLE public.ats_candidates
  ADD COLUMN IF NOT EXISTS email_key text GENERATED ALWAYS AS (public.ats_email_key(email)) STORED;
CREATE INDEX IF NOT EXISTS ats_candidates_email_key_idx ON public.ats_candidates (email_key)
  WHERE email_key IS NOT NULL AND merged_into_id IS NULL AND anonymized_at IS NULL;

ALTER TABLE public.ats_messages ADD COLUMN IF NOT EXISTS from_other_address boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.ats_mail_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id uuid,
  imap_uid bigint,
  uid_validity bigint,
  from_address text,
  subject text,
  received_at timestamptz,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz,
  dismissed_by_name text,
  UNIQUE (mailbox_id, uid_validity, imap_uid)
);
GRANT SELECT, UPDATE ON public.ats_mail_issues TO authenticated;
GRANT ALL ON public.ats_mail_issues TO service_role;
ALTER TABLE public.ats_mail_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY ats_mail_issues_select ON public.ats_mail_issues FOR SELECT TO authenticated
  USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_mail_issues_update ON public.ats_mail_issues FOR UPDATE TO authenticated
  USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid())))) WITH CHECK ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));

CREATE OR REPLACE FUNCTION public.ats_queue_interview_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
s public.ats_settings; t public.ats_email_templates; v_from text; v_from_name text; r record; v_txt jsonb;
v_id uuid; v_parent text; v_refs text; n integer := 0;
BEGIN
SELECT * INTO s FROM public.ats_settings WHERE id;
IF NOT FOUND OR NOT s.mail_enabled OR s.mail_mailbox_id IS NULL OR s.interview_reminder_hours = 0 THEN RETURN 0; END IF;
SELECT * INTO t FROM public.ats_email_templates WHERE code = 'interview-reminder' AND is_active;
IF NOT FOUND THEN RETURN 0; END IF;
SELECT lower(btrim(from_address)), from_name INTO v_from, v_from_name
FROM public.hr_mailboxes WHERE id = s.mail_mailbox_id AND is_active;
IF v_from IS NULL OR position('@' IN v_from) = 0 THEN RETURN 0; END IF;
FOR r IN
SELECT i.id, i.application_id, i.candidate_id, i.revision, c.email_norm
FROM public.ats_interviews i
JOIN public.ats_applications a ON a.id = i.application_id
JOIN public.ats_candidates c ON c.id = i.candidate_id
WHERE i.status = 'scheduled' AND i.reminder_queued_at IS NULL
AND i.starts_at > now() + interval '30 minutes'
AND i.starts_at <= now() + make_interval(hours => s.interview_reminder_hours)
AND i.scheduled_at <= i.starts_at - make_interval(hours => s.interview_reminder_hours)
AND i.candidate_response IS DISTINCT FROM 'declined'
AND a.status IN ('active', 'on_hold')
AND c.email_norm IS NOT NULL AND c.merged_into_id IS NULL AND c.anonymized_at IS NULL
AND EXISTS (SELECT 1 FROM public.ats_messages m WHERE m.interview_id = i.id AND m.direction = 'outbound' AND m.status = 'sent' AND m.calendar_ics IS NOT NULL AND m.calendar_revision = i.revision)
ORDER BY i.starts_at
LIMIT 50
LOOP
v_txt := public.ats_render_interview_text(r.id, t.subject, t.body);
SELECT m.message_id, m.references_header INTO v_parent, v_refs FROM public.ats_messages m
WHERE m.interview_id = r.id AND m.direction = 'outbound' AND m.status = 'sent' AND m.message_id IS NOT NULL
ORDER BY m.created_at DESC LIMIT 1;
v_id := gen_random_uuid();
INSERT INTO public.ats_messages (id, candidate_id, application_id, interview_id, direction, status, purpose,
template_code, is_automatic, mailbox_id, from_address, from_name, to_addresses, subject, body_text, message_id,
in_reply_to, references_header, attempts, next_attempt_at, created_by_name, calendar_revision)
VALUES (v_id, r.candidate_id, r.application_id, r.id, 'outbound', 'queued', 'interview', t.code, true,
s.mail_mailbox_id, v_from, v_from_name, ARRAY[r.email_norm], v_txt->>'subject', v_txt->>'body',
'<ats.' || v_id::text || '@' || split_part(v_from, '@', 2) || '>',
v_parent, CASE WHEN v_parent IS NULL THEN NULL ELSE btrim(coalesce(v_refs, '') || ' ' || v_parent) END,
0, now(), 'ATS (automatic)', r.revision);
UPDATE public.ats_interviews SET reminder_queued_at = now() WHERE id = r.id;
n := n + 1;
END LOOP;
RETURN n;
END $function$;

CREATE OR REPLACE FUNCTION public.ats_mail_store_inbound(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
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
message_id, in_reply_to, references_header, imap_uid, received_at, attachments, from_other_address)
VALUES (v_cid, v_app, 'inbound', 'received', coalesce((p->>'is_automatic')::boolean, false),
nullif(p->>'mailbox_id', '')::uuid,
left(lower(nullif(btrim(p->>'from_address'), '')), 254), left(nullif(btrim(p->>'from_name'), ''), 200),
public.ats_text_array(p->'to_addresses'), public.ats_text_array(p->'cc_addresses'),
left(p->>'subject', 500), left(p->>'body_text', 200000), left(p->>'body_html', 1000000), p->>'snippet',
v_mid, nullif(p->>'in_reply_to', ''), left(nullif(p->>'references_header', ''), 4000),
nullif(p->>'imap_uid', '')::bigint, coalesce(nullif(p->>'received_at', '')::timestamptz, now()),
coalesce(p->'attachments', '[]'::jsonb), coalesce((p->>'from_other_address')::boolean, false))
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

CREATE OR REPLACE FUNCTION public.ats_mail_status()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
SELECT CASE WHEN NOT coalesce(public.hr_is_hr_staff(auth.uid()), false) THEN NULL ELSE (
SELECT jsonb_build_object(
'enabled', s.mail_enabled,
'mailbox_id', s.mail_mailbox_id,
'backfill_days', s.mail_backfill_days,
'ack_enabled', s.mail_ack_enabled,
'reject_default', s.mail_reject_default,
'mailboxes', coalesce((
SELECT jsonb_agg(jsonb_build_object('id', m.id, 'label', m.label, 'from_address', m.from_address,
'from_name', m.from_name, 'can_receive', (m.imap_enabled AND m.imap_host IS NOT NULL)) ORDER BY m.created_at)
FROM public.hr_mailboxes m WHERE m.is_active), '[]'::jsonb),
'sync', (SELECT jsonb_build_object('started_at', st.started_at, 'last_run_at', st.last_run_at,
'last_ok_at', st.last_ok_at, 'last_error', st.last_error, 'last_error_at', st.last_error_at,
'last_stats', st.last_stats)
FROM public.ats_mail_state st WHERE st.mailbox_id = s.mail_mailbox_id),
'unread', (SELECT count(*) FROM public.ats_messages m WHERE m.direction = 'inbound' AND m.read_at IS NULL),
'failed_7d', (SELECT count(*) FROM public.ats_messages m WHERE m.direction = 'outbound'
AND m.status IN ('failed', 'bounced') AND m.created_at >= now() - interval '7 days'),
'failed_30d', (SELECT count(*) FROM public.ats_messages m WHERE m.direction = 'outbound'
AND m.status IN ('failed', 'bounced') AND m.created_at >= now() - interval '30 days'),
'received_24h', (SELECT count(*) FROM public.ats_messages m WHERE m.direction = 'inbound'
AND m.received_at >= now() - interval '24 hours'),
'sent_24h', (SELECT count(*) FROM public.ats_messages m WHERE m.direction = 'outbound'
AND m.status = 'sent' AND coalesce(m.sent_at, m.created_at) >= now() - interval '24 hours'),
'issues', (SELECT count(*) FROM public.ats_mail_issues i WHERE i.dismissed_at IS NULL),
'queued', (SELECT count(*) FROM public.ats_messages m WHERE m.status = 'queued'))
FROM public.ats_settings s WHERE s.id) END
$function$;