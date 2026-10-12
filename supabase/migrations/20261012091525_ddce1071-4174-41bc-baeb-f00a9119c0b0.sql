-- lovable-cron-fallback-reviewed: IMAP mailbox has no push/webhook; 5-min poll required, no-op while ATS mail is off
-- ATS email (Batch 4A), migration M5: settings, email templates, candidate messages, mailbox reader state,
-- helper actions and the 5-minute mail schedule. Scope: only objects named ats_* plus one pg_cron job
-- named 'ats-mail-sync-every-5-min'. Nothing outside ATS is changed; hr_mailboxes is only read.

-- 1. Settings (everything off by default)
ALTER TABLE public.ats_settings
ADD COLUMN mail_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN mail_mailbox_id uuid,
ADD COLUMN mail_backfill_days integer NOT NULL DEFAULT 30 CHECK (mail_backfill_days BETWEEN 0 AND 90),
ADD COLUMN mail_ack_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN mail_reject_default boolean NOT NULL DEFAULT false,
ADD CONSTRAINT ats_settings_mail_needs_mailbox CHECK (NOT mail_enabled OR mail_mailbox_id IS NOT NULL);

-- 2. Email templates (plain text with {{placeholders}}; the HR signature is added when sending)
CREATE TABLE public.ats_email_templates (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
code text NOT NULL UNIQUE,
name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
purpose text NOT NULL DEFAULT 'general'
CHECK (purpose IN ('general','acknowledgement','rejection','interview','offer')),
subject text NOT NULL CHECK (length(btrim(subject)) BETWEEN 1 AND 200),
body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 20000),
is_active boolean NOT NULL DEFAULT true,
is_system boolean NOT NULL DEFAULT false,
sort_order integer NOT NULL DEFAULT 500,
created_by uuid,
created_by_name text,
updated_by uuid,
updated_by_name text,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ats_email_templates_name_uq ON public.ats_email_templates (lower(btrim(name)));
INSERT INTO public.ats_email_templates (code, name, purpose, subject, body, is_system, sort_order, created_by_name, updated_by_name) VALUES
('acknowledgement', 'Application received', 'acknowledgement',
'We have received your application - {{company_name}}',
E'Dear {{first_name}},\n\nThank you for applying for {{job_title}} at {{company_name}}. We have received your application, and our HR team will review it shortly.\n\nIf your profile matches what we are looking for, we will get in touch with you about the next steps. You can reply to this email if you have any questions.\n\nWarm regards,',
true, 10, 'System', 'System'),
('rejection', 'Not moving forward', 'rejection',
'Update on your application - {{company_name}}',
E'Dear {{first_name}},\n\nThank you for your interest in {{job_title}} at {{company_name}}, and for the time you gave to our process.\n\nAfter careful consideration, we will not be moving forward with your application at this time. This was not an easy decision, and it is not a reflection of your abilities.\n\nWe will keep your details on record and may contact you if a suitable opening comes up. We wish you every success.\n\nWarm regards,',
true, 20, 'System', 'System'),
('interview-invitation', 'Interview invitation', 'interview',
'Interview invitation - {{company_name}}',
E'Dear {{first_name}},\n\nThank you for applying for {{job_title}} at {{company_name}}. We have reviewed your profile and would like to invite you for an interview.\n\nPlease reply with two or three dates and times over the next few days that suit you, and we will confirm one of them.\n\nWarm regards,',
true, 30, 'System', 'System'),
('request-documents', 'Request documents', 'general',
'Documents for your application - {{company_name}}',
E'Dear {{first_name}},\n\nThank you for applying for {{job_title}} at {{company_name}}. To take your application forward, please reply to this email with your latest resume and any other documents you would like us to consider.\n\nWarm regards,',
true, 40, 'System', 'System');

-- 3. Candidate messages (emails sent from the ATS and candidate replies picked up from the HR mailbox)
CREATE TABLE public.ats_messages (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
candidate_id uuid NOT NULL REFERENCES public.ats_candidates(id) ON DELETE CASCADE,
application_id uuid REFERENCES public.ats_applications(id) ON DELETE SET NULL,
direction text NOT NULL CHECK (direction IN ('outbound','inbound')),
status text NOT NULL CHECK (status IN ('queued','sending','sent','failed','bounced','received')),
purpose text CHECK (purpose IS NULL OR purpose IN ('general','acknowledgement','rejection','interview','offer')),
template_code text,
is_automatic boolean NOT NULL DEFAULT false,
mailbox_id uuid,
from_address text,
from_name text,
to_addresses text[] NOT NULL DEFAULT '{}',
cc_addresses text[] NOT NULL DEFAULT '{}',
subject text CHECK (subject IS NULL OR length(subject) <= 500),
body_text text CHECK (body_text IS NULL OR length(body_text) <= 200000),
body_html text CHECK (body_html IS NULL OR length(body_html) <= 1000000),
snippet text,
message_id text,
in_reply_to text,
references_header text,
attachments jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(attachments) = 'array'),
imap_uid bigint,
error text,
attempts integer NOT NULL DEFAULT 0,
next_attempt_at timestamptz,
sent_at timestamptz,
received_at timestamptz,
read_at timestamptz,
read_by uuid,
read_by_name text,
created_by uuid,
created_by_name text,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
CONSTRAINT ats_messages_direction_status CHECK ((direction = 'inbound') = (status = 'received'))
);
CREATE INDEX ats_messages_candidate_idx ON public.ats_messages (candidate_id, created_at);
CREATE INDEX ats_messages_application_idx ON public.ats_messages (application_id);
CREATE UNIQUE INDEX ats_messages_message_id_uq ON public.ats_messages (message_id) WHERE message_id IS NOT NULL;
CREATE INDEX ats_messages_unread_idx ON public.ats_messages (received_at DESC) WHERE direction = 'inbound' AND read_at IS NULL;
CREATE INDEX ats_messages_queue_idx ON public.ats_messages (next_attempt_at) WHERE status = 'queued';

-- 4. Mailbox reader position (one row per HR mailbox; service role only)
CREATE TABLE public.ats_mail_state (
mailbox_id uuid PRIMARY KEY,
uid_validity bigint,
last_uid bigint NOT NULL DEFAULT 0,
started_at timestamptz,
last_run_at timestamptz,
last_ok_at timestamptz,
last_error text,
last_error_at timestamptz,
last_stats jsonb NOT NULL DEFAULT '{}'::jsonb,
lease_until timestamptz,
lease_owner text,
updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Business rules
CREATE OR REPLACE FUNCTION public.ats_email_templates_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
IF TG_OP = 'DELETE' THEN
IF OLD.is_system THEN
RAISE EXCEPTION 'ATS_SYSTEM_TEMPLATE_LOCKED' USING HINT = 'Built-in templates can be edited or turned off, but not deleted.';
END IF;
RETURN OLD;
END IF;
NEW.name := btrim(NEW.name);
NEW.subject := btrim(NEW.subject);
NEW.updated_at := now();
NEW.updated_by := auth.uid();
NEW.updated_by_name := public.ats_actor_name(auth.uid());
IF TG_OP = 'INSERT' THEN
NEW.is_system := false;
NEW.code := coalesce(public.ats_slugify(NEW.name), 'template') || '-' || substr(md5(gen_random_uuid()::text), 1, 4);
NEW.created_by := auth.uid();
NEW.created_by_name := public.ats_actor_name(auth.uid());
NEW.created_at := now();
ELSE
NEW.code := OLD.code;
NEW.is_system := OLD.is_system;
NEW.created_by := OLD.created_by;
NEW.created_by_name := OLD.created_by_name;
NEW.created_at := OLD.created_at;
IF OLD.is_system THEN NEW.purpose := OLD.purpose; END IF;
END IF;
RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.ats_messages_before_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
IF TG_OP = 'UPDATE' THEN
NEW.direction := OLD.direction;
NEW.message_id := OLD.message_id;
NEW.created_by := OLD.created_by;
NEW.created_by_name := OLD.created_by_name;
NEW.created_at := OLD.created_at;
END IF;
NEW.snippet := left(btrim(regexp_replace(coalesce(NEW.snippet, NEW.body_text, ''), '\s+', ' ', 'g')), 300);
NEW.updated_at := now();
RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.ats_messages_after_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
jsonb_build_object('message_id', NEW.id, 'purpose', NEW.purpose, 'automatic', NEW.is_automatic,
'attachments', jsonb_array_length(NEW.attachments)),
v_actor, v_actor_name);
UPDATE public.ats_candidates SET last_activity_at = now() WHERE id = NEW.candidate_id;
RETURN NULL;
END $$;

CREATE TRIGGER ats_email_templates_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON public.ats_email_templates
FOR EACH ROW EXECUTE FUNCTION public.ats_email_templates_guard();
CREATE TRIGGER ats_messages_before_trg BEFORE INSERT OR UPDATE ON public.ats_messages
FOR EACH ROW EXECUTE FUNCTION public.ats_messages_before_write();
CREATE TRIGGER ats_messages_after_trg AFTER INSERT OR UPDATE ON public.ats_messages
FOR EACH ROW EXECUTE FUNCTION public.ats_messages_after_write();

-- 6. Actions
-- 6a. Email screen status for HR staff (never exposes credentials or secret names)
CREATE OR REPLACE FUNCTION public.ats_mail_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
'queued', (SELECT count(*) FROM public.ats_messages m WHERE m.status = 'queued'))
FROM public.ats_settings s WHERE s.id) END
$$;

-- 6b. Fill a template for one application (or a candidate without an application)
CREATE OR REPLACE FUNCTION public.ats_render_template(p_template_id uuid, p_application_id uuid DEFAULT NULL, p_candidate_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
t public.ats_email_templates;
v_cid uuid := p_candidate_id;
v_job text; v_name text; v_ref text; v_subject text; v_body text; k text; v text;
BEGIN
SELECT * INTO t FROM public.ats_email_templates WHERE id = p_template_id;
IF NOT FOUND THEN RAISE EXCEPTION 'ATS_TEMPLATE_NOT_FOUND'; END IF;
IF p_application_id IS NOT NULL THEN
SELECT a.candidate_id, coalesce(j.title, nullif(btrim(a.position_text), '')) INTO v_cid, v_job
FROM public.ats_applications a LEFT JOIN public.ats_jobs j ON j.id = a.job_id
WHERE a.id = p_application_id;
IF NOT FOUND THEN RAISE EXCEPTION 'ATS_APPLICATION_NOT_FOUND'; END IF;
END IF;
IF v_cid IS NULL THEN RAISE EXCEPTION 'ATS_CANDIDATE_REQUIRED'; END IF;
SELECT c.full_name, c.ref_no INTO v_name, v_ref FROM public.ats_candidates c WHERE c.id = v_cid;
IF NOT FOUND THEN RAISE EXCEPTION 'ATS_CANDIDATE_NOT_FOUND'; END IF;
v_subject := t.subject;
v_body := t.body;
FOR k, v IN SELECT e.key, e.value FROM jsonb_each_text(jsonb_build_object(
'first_name', split_part(btrim(v_name), ' ', 1),
'full_name', btrim(v_name),
'job_title', coalesce(v_job, 'the open role'),
'company_name', 'Blynk Virtual Technologies',
'ref_no', v_ref)) AS e LOOP
v_subject := regexp_replace(v_subject, '\{\{\s*' || k || '\s*\}\}', replace(coalesce(v, ''), '\', '\\'), 'g');
v_body := regexp_replace(v_body, '\{\{\s*' || k || '\s*\}\}', replace(coalesce(v, ''), '\', '\\'), 'g');
END LOOP;
RETURN jsonb_build_object('subject', v_subject, 'body', v_body, 'template_code', t.code, 'purpose', t.purpose,
'candidate_id', v_cid, 'application_id', p_application_id);
END $$;

-- 6c. Read state (HR staff)
CREATE OR REPLACE FUNCTION public.ats_mark_messages_read(p_candidate_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
IF NOT coalesce(public.hr_is_hr_staff(auth.uid()), false) THEN RAISE EXCEPTION 'ATS_FORBIDDEN'; END IF;
UPDATE public.ats_messages
SET read_at = now(), read_by = auth.uid(), read_by_name = public.ats_actor_name(auth.uid())
WHERE candidate_id = p_candidate_id AND direction = 'inbound' AND read_at IS NULL;
GET DIAGNOSTICS n = ROW_COUNT;
RETURN n;
END $$;
CREATE OR REPLACE FUNCTION public.ats_mark_message_unread(p_message_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
IF NOT coalesce(public.hr_is_hr_staff(auth.uid()), false) THEN RAISE EXCEPTION 'ATS_FORBIDDEN'; END IF;
UPDATE public.ats_messages SET read_at = NULL, read_by = NULL, read_by_name = NULL
WHERE id = p_message_id AND direction = 'inbound';
RETURN FOUND;
END $$;

-- 6d. Mailbox reader lease (service role): one reader per mailbox at a time
CREATE OR REPLACE FUNCTION public.ats_mail_claim(p_mailbox_id uuid, p_owner text, p_seconds integer DEFAULT 150)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r public.ats_mail_state;
BEGIN
INSERT INTO public.ats_mail_state (mailbox_id) VALUES (p_mailbox_id) ON CONFLICT (mailbox_id) DO NOTHING;
UPDATE public.ats_mail_state
SET lease_until = now() + make_interval(secs => greatest(30, least(coalesce(p_seconds, 150), 600))),
lease_owner = p_owner, last_run_at = now(), updated_at = now()
WHERE mailbox_id = p_mailbox_id AND (lease_until IS NULL OR lease_until < now())
RETURNING * INTO r;
IF NOT FOUND THEN RETURN NULL; END IF;
RETURN to_jsonb(r);
END $$;

-- 6e. Store one candidate email picked up from the mailbox, with its saved attachments (service role)
CREATE OR REPLACE FUNCTION public.ats_mail_store_inbound(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
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
message_id, in_reply_to, references_header, imap_uid, received_at, attachments)
VALUES (v_cid, v_app, 'inbound', 'received', coalesce((p->>'is_automatic')::boolean, false),
nullif(p->>'mailbox_id', '')::uuid,
left(lower(nullif(btrim(p->>'from_address'), '')), 254), left(nullif(btrim(p->>'from_name'), ''), 200),
public.ats_text_array(p->'to_addresses'), public.ats_text_array(p->'cc_addresses'),
left(p->>'subject', 500), left(p->>'body_text', 200000), left(p->>'body_html', 1000000), p->>'snippet',
v_mid, nullif(p->>'in_reply_to', ''), left(nullif(p->>'references_header', ''), 4000),
nullif(p->>'imap_uid', '')::bigint, coalesce(nullif(p->>'received_at', '')::timestamptz, now()),
coalesce(p->'attachments', '[]'::jsonb))
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
END $$;

-- 7. Access: HR staff read; templates editable by HR staff (built-in ones cannot be deleted);
--    messages are written only by the email functions; HR admins may delete a wrongly matched message.
ALTER TABLE public.ats_email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ats_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ats_mail_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ats_email_templates, public.ats_messages, public.ats_mail_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ats_email_templates TO authenticated;
GRANT SELECT, DELETE ON public.ats_messages TO authenticated;
GRANT ALL ON TABLE public.ats_email_templates, public.ats_messages, public.ats_mail_state TO service_role;
CREATE POLICY ats_email_templates_select ON public.ats_email_templates FOR SELECT TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_email_templates_insert ON public.ats_email_templates FOR INSERT TO authenticated
WITH CHECK ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_email_templates_update ON public.ats_email_templates FOR UPDATE TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid())))) WITH CHECK ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_email_templates_delete ON public.ats_email_templates FOR DELETE TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))) AND NOT is_system);
CREATE POLICY ats_messages_select ON public.ats_messages FOR SELECT TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_messages_delete ON public.ats_messages FOR DELETE TO authenticated
USING ((SELECT public.hr_is_hr_admin()));
CREATE POLICY ats_mail_state_no_client_access ON public.ats_mail_state FOR ALL TO authenticated
USING (false) WITH CHECK (false);
REVOKE ALL ON FUNCTION public.ats_email_templates_guard(), public.ats_messages_before_write(),
public.ats_messages_after_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ats_mail_status(), public.ats_render_template(uuid, uuid, uuid),
public.ats_mark_messages_read(uuid), public.ats_mark_message_unread(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ats_mail_status(), public.ats_render_template(uuid, uuid, uuid),
public.ats_mark_messages_read(uuid), public.ats_mark_message_unread(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ats_mail_claim(uuid, text, integer), public.ats_mail_store_inbound(jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ats_mail_claim(uuid, text, integer), public.ats_mail_store_inbound(jsonb) TO service_role;

-- 8. Every 5 minutes, only while ATS email is turned on: pick up new candidate emails from the HR mailbox.
--    Same call pattern as the existing HR scheduled jobs (x-scheduler-secret from app_scheduler_secrets).
SELECT cron.schedule('ats-mail-sync-every-5-min', '*/5 * * * *', $job$
SELECT net.http_post(
url := 'https://vagiqbespusdxsbqpvbo.supabase.co/functions/v1/ats-mail-sync',
headers := jsonb_build_object('Content-Type', 'application/json',
'x-scheduler-secret', (SELECT secret_value FROM public.app_scheduler_secrets WHERE name = 'internal_cron')),
body := jsonb_build_object('source', 'cron'),
timeout_milliseconds := 120000)
WHERE EXISTS (SELECT 1 FROM public.ats_settings WHERE mail_enabled)
$job$);