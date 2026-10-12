-- ATS interviews (Batch 5), migration M7: interview scheduling, interview panel and feedback, interview email
-- templates, candidate reminders, calendar replies, and calendar fields on candidate emails.
-- Scope: only objects named ats_*. hr_employees and hr_employee_work_info are only read (interviewer names and
-- email addresses, through ats_employee_contacts). Nothing outside ATS is changed.

-- 1. Settings (interview reminders are off by default)
ALTER TABLE public.ats_settings
ADD COLUMN interview_address text CHECK (interview_address IS NULL OR length(btrim(interview_address)) BETWEEN 1 AND 300),
ADD COLUMN interview_minutes integer NOT NULL DEFAULT 30 CHECK (interview_minutes BETWEEN 10 AND 480),
ADD COLUMN interview_reminder_hours integer NOT NULL DEFAULT 0 CHECK (interview_reminder_hours IN (0, 2, 24));

-- 2. Interviews (times are stored as timestamptz and shown in IST)
CREATE TABLE public.ats_interviews (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
application_id uuid NOT NULL REFERENCES public.ats_applications(id) ON DELETE CASCADE,
candidate_id uuid NOT NULL REFERENCES public.ats_candidates(id) ON DELETE CASCADE,
title text NOT NULL DEFAULT 'Interview' CHECK (length(btrim(title)) BETWEEN 1 AND 80),
mode text NOT NULL CHECK (mode IN ('in_person', 'video', 'phone')),
starts_at timestamptz NOT NULL,
ends_at timestamptz NOT NULL,
location text CHECK (location IS NULL OR length(btrim(location)) BETWEEN 1 AND 300),
meeting_url text CHECK (meeting_url IS NULL OR (length(meeting_url) <= 500 AND meeting_url ~ '^https://[^\s<>"]+$')),
candidate_note text CHECK (candidate_note IS NULL OR length(candidate_note) <= 1000),
internal_note text CHECK (internal_note IS NULL OR length(internal_note) <= 2000),
status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'no_show', 'cancelled')),
revision integer NOT NULL DEFAULT 0,
scheduled_at timestamptz NOT NULL DEFAULT now(),
candidate_response text CHECK (candidate_response IS NULL OR candidate_response IN ('accepted', 'declined', 'tentative')),
candidate_response_at timestamptz,
reminder_queued_at timestamptz,
cancel_reason text CHECK (cancel_reason IS NULL OR length(cancel_reason) <= 500),
cancelled_at timestamptz,
cancelled_by_name text,
closed_at timestamptz,
created_by uuid,
created_by_name text,
updated_by uuid,
updated_by_name text,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
CONSTRAINT ats_interviews_time CHECK (ends_at > starts_at AND ends_at - starts_at <= interval '8 hours'),
CONSTRAINT ats_interviews_place CHECK ((mode <> 'in_person' OR location IS NOT NULL) AND (mode <> 'video' OR meeting_url IS NOT NULL))
);
CREATE INDEX ats_interviews_application_idx ON public.ats_interviews (application_id, starts_at);
CREATE INDEX ats_interviews_candidate_idx ON public.ats_interviews (candidate_id);
CREATE INDEX ats_interviews_starts_idx ON public.ats_interviews (starts_at);

-- 3. Interview panel: one row per interviewer, with their calendar invite outcome and their feedback
CREATE TABLE public.ats_interview_panel (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
interview_id uuid NOT NULL REFERENCES public.ats_interviews(id) ON DELETE CASCADE,
employee_id uuid REFERENCES public.hr_employees(id) ON UPDATE CASCADE ON DELETE SET NULL,
user_id uuid,
name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
email text CHECK (email IS NULL OR length(email) <= 254),
removed_at timestamptz,
invite_status text CHECK (invite_status IS NULL OR invite_status IN ('sent', 'failed', 'no_email')),
invite_error text,
invited_revision integer,
invited_at timestamptz,
cancel_sent_at timestamptz,
recommendation text CHECK (recommendation IS NULL OR recommendation IN ('strong_yes', 'yes', 'no', 'strong_no')),
score smallint CHECK (score IS NULL OR score BETWEEN 1 AND 5),
feedback text CHECK (feedback IS NULL OR length(feedback) <= 5000),
feedback_at timestamptz,
feedback_by uuid,
feedback_by_name text,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ats_interview_panel_member_uq ON public.ats_interview_panel (interview_id, employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX ats_interview_panel_employee_idx ON public.ats_interview_panel (employee_id);
CREATE INDEX ats_interview_panel_user_idx ON public.ats_interview_panel (user_id);

-- 4. Candidate emails about an interview carry the calendar invite that was sent with them
ALTER TABLE public.ats_messages
ADD COLUMN interview_id uuid REFERENCES public.ats_interviews(id) ON DELETE SET NULL,
ADD COLUMN calendar_ics text CHECK (calendar_ics IS NULL OR length(calendar_ics) <= 20000),
ADD COLUMN calendar_revision integer;
CREATE INDEX ats_messages_interview_idx ON public.ats_messages (interview_id) WHERE interview_id IS NOT NULL;

-- 5. Built-in interview templates. Extra placeholders, filled from the interview: {{interview_title}},
--    {{interview_date}}, {{interview_time}}, {{interview_duration}}, {{interview_mode}}, {{interview_where}},
--    {{interview_note}}. The template guard is paused only for this insert so the built-in codes are kept.
ALTER TABLE public.ats_email_templates DISABLE TRIGGER ats_email_templates_guard_trg;
INSERT INTO public.ats_email_templates (code, name, purpose, subject, body, is_system, sort_order, created_by_name, updated_by_name) VALUES
('interview-scheduled', 'Interview scheduled', 'interview',
'Interview for {{job_title}} - {{company_name}}',
E'Dear {{first_name}},\n\nThank you for applying for {{job_title}} at {{company_name}}. We would like to invite you for an interview.\n\nDate: {{interview_date}}\nTime: {{interview_time}} ({{interview_duration}})\n{{interview_where}}\n\n{{interview_note}}\n\nA calendar invite is attached. Please reply to this email to confirm, or let us know if you need a different time.\n\nWarm regards,',
true, 31, 'System', 'System'),
('interview-rescheduled', 'Interview rescheduled', 'interview',
'Interview rescheduled - {{company_name}}',
E'Dear {{first_name}},\n\nYour interview for {{job_title}} at {{company_name}} has a new time.\n\nDate: {{interview_date}}\nTime: {{interview_time}} ({{interview_duration}})\n{{interview_where}}\n\n{{interview_note}}\n\nAn updated calendar invite is attached. Please reply to this email to confirm, or let us know if the new time does not work for you.\n\nWarm regards,',
true, 32, 'System', 'System'),
('interview-cancelled', 'Interview cancelled', 'interview',
'Interview cancelled - {{company_name}}',
E'Dear {{first_name}},\n\nWe have had to cancel your interview for {{job_title}} at {{company_name}}, which was planned for {{interview_date}} at {{interview_time}}.\n\nWe are sorry for the inconvenience. We will get in touch with you about the next steps.\n\nWarm regards,',
true, 33, 'System', 'System'),
('interview-reminder', 'Interview reminder', 'interview',
'Reminder: interview on {{interview_date}} - {{company_name}}',
E'Dear {{first_name}},\n\nThis is a reminder of your interview for {{job_title}} at {{company_name}}.\n\nDate: {{interview_date}}\nTime: {{interview_time}} ({{interview_duration}})\n{{interview_where}}\n\n{{interview_note}}\n\nIf you can no longer make it, please reply to this email so we can find another time.\n\nWarm regards,',
true, 34, 'System', 'System')
ON CONFLICT DO NOTHING;
ALTER TABLE public.ats_email_templates ENABLE TRIGGER ats_email_templates_guard_trg;

-- 6. Helpers
-- 6a. "30 minutes", "1 hour", "1 hour 30 minutes"
CREATE OR REPLACE FUNCTION public.ats_duration_text(p_minutes integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
SELECT CASE
WHEN p_minutes IS NULL THEN NULL
WHEN p_minutes < 60 THEN p_minutes || ' minutes'
WHEN p_minutes % 60 = 0 THEN (p_minutes / 60) || CASE WHEN p_minutes = 60 THEN ' hour' ELSE ' hours' END
ELSE (p_minutes / 60) || CASE WHEN p_minutes < 120 THEN ' hour ' ELSE ' hours ' END || (p_minutes % 60) || ' minutes'
END
$$;

-- 6b. Interviewer names and email addresses for the interview panel (HR staff; read-only on HR tables)
CREATE OR REPLACE FUNCTION public.ats_employee_contacts(p_ids uuid[])
RETURNS TABLE (employee_id uuid, name text, email text, user_id uuid, is_active boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
IF auth.uid() IS NOT NULL AND NOT coalesce(public.hr_is_hr_staff(auth.uid()), false) THEN
RAISE EXCEPTION 'ATS_FORBIDDEN';
END IF;
RETURN QUERY
SELECT e.id,
coalesce(nullif(btrim(concat_ws(' ', e.first_name, e.last_name)), ''), 'Unnamed')::text,
(SELECT lower(x.v) FROM (SELECT btrim(coalesce(nullif(btrim(w.work_email), ''), e.email)) AS v) x
WHERE x.v ~ '^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$' AND length(x.v) <= 254)::text,
e.user_id,
coalesce(e.is_active, false)
FROM public.hr_employees e
LEFT JOIN LATERAL (
SELECT wi.work_email FROM public.hr_employee_work_info wi WHERE wi.employee_id = e.id
ORDER BY wi.updated_at DESC NULLS LAST LIMIT 1) w ON true
WHERE e.id = ANY (coalesce(p_ids, '{}'::uuid[]));
END $$;

-- 6c. Fill a subject and body for one interview: the standard placeholders plus the interview ones
CREATE OR REPLACE FUNCTION public.ats_render_interview_text(p_interview_id uuid, p_subject text, p_body text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
i public.ats_interviews;
v_name text; v_ref text; v_phone text; v_job text; v_local timestamp; v_vals jsonb; k text; v text;
v_subject text := coalesce(p_subject, '');
v_body text := coalesce(p_body, '');
BEGIN
SELECT * INTO i FROM public.ats_interviews WHERE id = p_interview_id;
IF NOT FOUND THEN RAISE EXCEPTION 'ATS_INTERVIEW_NOT_FOUND'; END IF;
SELECT c.full_name, c.ref_no, c.phone, coalesce(j.title, nullif(btrim(a.position_text), ''))
INTO v_name, v_ref, v_phone, v_job
FROM public.ats_applications a
JOIN public.ats_candidates c ON c.id = a.candidate_id
LEFT JOIN public.ats_jobs j ON j.id = a.job_id
WHERE a.id = i.application_id;
v_local := i.starts_at AT TIME ZONE 'Asia/Kolkata';
v_vals := jsonb_build_object(
'first_name', split_part(btrim(coalesce(v_name, '')), ' ', 1),
'full_name', btrim(coalesce(v_name, '')),
'job_title', coalesce(v_job, 'the open role'),
'company_name', 'Blynk Virtual Technologies',
'ref_no', v_ref,
'interview_title', i.title,
'interview_date', to_char(v_local, 'FMDay, FMDD FMMonth YYYY'),
'interview_time', to_char(v_local, 'FMHH12:MI AM') || ' IST',
'interview_duration', public.ats_duration_text(round(extract(epoch FROM (i.ends_at - i.starts_at)) / 60)::integer),
'interview_mode', CASE i.mode WHEN 'in_person' THEN 'In person' WHEN 'video' THEN 'Video call' ELSE 'Phone call' END,
'interview_where', CASE i.mode
WHEN 'in_person' THEN 'Venue: ' || i.location
WHEN 'video' THEN 'Video call: ' || i.meeting_url
ELSE 'Phone call: we will call you on ' || coalesce(nullif(btrim(v_phone), ''), 'the number you shared with us') END,
'interview_note', coalesce(btrim(i.candidate_note), ''));
FOR k, v IN SELECT e.key, e.value FROM jsonb_each_text(v_vals) AS e LOOP
v_subject := regexp_replace(v_subject, '\{\{\s*' || k || '\s*\}\}', replace(coalesce(v, ''), '\', '\\'), 'g');
v_body := regexp_replace(v_body, '\{\{\s*' || k || '\s*\}\}', replace(coalesce(v, ''), '\', '\\'), 'g');
END LOOP;
v_body := regexp_replace(replace(v_body, E'\r\n', E'\n'), '[ \t]+\n', E'\n', 'g');
v_body := btrim(regexp_replace(v_body, '\n{3,}', E'\n\n', 'g'), E' \n');
RETURN jsonb_build_object('subject', btrim(regexp_replace(v_subject, '\s+', ' ', 'g')), 'body', v_body);
END $$;

-- 7. Business rules
CREATE OR REPLACE FUNCTION public.ats_interviews_before_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_cand uuid;
BEGIN
IF TG_OP = 'UPDATE' THEN
NEW.application_id := OLD.application_id;
END IF;
SELECT candidate_id INTO v_cand FROM public.ats_applications WHERE id = NEW.application_id;
IF v_cand IS NULL THEN RAISE EXCEPTION 'ATS_APPLICATION_NOT_FOUND'; END IF;
NEW.candidate_id := v_cand;
NEW.title := btrim(NEW.title);
NEW.location := nullif(btrim(coalesce(NEW.location, '')), '');
NEW.meeting_url := nullif(btrim(coalesce(NEW.meeting_url, '')), '');
NEW.candidate_note := nullif(btrim(coalesce(NEW.candidate_note, '')), '');
NEW.internal_note := nullif(btrim(coalesce(NEW.internal_note, '')), '');
NEW.updated_at := now();
NEW.updated_by := auth.uid();
NEW.updated_by_name := public.ats_actor_name(auth.uid());
IF TG_OP = 'INSERT' THEN
NEW.status := 'scheduled';
NEW.revision := 0;
NEW.scheduled_at := now();
NEW.candidate_response := NULL;
NEW.candidate_response_at := NULL;
NEW.reminder_queued_at := NULL;
NEW.cancel_reason := NULL;
NEW.cancelled_at := NULL;
NEW.cancelled_by_name := NULL;
NEW.closed_at := NULL;
NEW.created_by := auth.uid();
NEW.created_by_name := NEW.updated_by_name;
NEW.created_at := now();
RETURN NEW;
END IF;
NEW.created_by := OLD.created_by;
NEW.created_by_name := OLD.created_by_name;
NEW.created_at := OLD.created_at;
IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
RAISE EXCEPTION 'ATS_INTERVIEW_CLOSED' USING HINT = 'A cancelled interview cannot be reopened. Schedule a new one.';
END IF;
IF (NEW.starts_at, NEW.ends_at, NEW.mode, NEW.location, NEW.meeting_url)
IS DISTINCT FROM (OLD.starts_at, OLD.ends_at, OLD.mode, OLD.location, OLD.meeting_url) THEN
IF OLD.status <> 'scheduled' OR NEW.status <> 'scheduled' THEN
RAISE EXCEPTION 'ATS_INTERVIEW_CLOSED' USING HINT = 'Only a scheduled interview can be moved.';
END IF;
-- New time or place: a new version of the invite, a new answer and a new reminder are needed.
NEW.revision := OLD.revision + 1;
NEW.scheduled_at := now();
NEW.candidate_response := NULL;
NEW.candidate_response_at := NULL;
NEW.reminder_queued_at := NULL;
ELSIF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
NEW.revision := OLD.revision + 1;
NEW.scheduled_at := OLD.scheduled_at;
ELSE
NEW.revision := OLD.revision;
NEW.scheduled_at := OLD.scheduled_at;
END IF;
IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
NEW.cancel_reason := nullif(btrim(coalesce(NEW.cancel_reason, '')), '');
NEW.cancelled_at := now();
NEW.cancelled_by_name := NEW.updated_by_name;
ELSIF NEW.status = 'cancelled' THEN
NEW.cancel_reason := OLD.cancel_reason;
NEW.cancelled_at := OLD.cancelled_at;
NEW.cancelled_by_name := OLD.cancelled_by_name;
ELSE
NEW.cancel_reason := NULL;
NEW.cancelled_at := NULL;
NEW.cancelled_by_name := NULL;
END IF;
IF NEW.status IN ('completed', 'no_show') THEN
NEW.closed_at := CASE WHEN OLD.status IN ('completed', 'no_show') THEN OLD.closed_at ELSE now() END;
ELSE
NEW.closed_at := NULL;
END IF;
RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.ats_interviews_after_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_job uuid; v_when text; v_type text; v_summary text; v_actor_name text;
BEGIN
SELECT job_id INTO v_job FROM public.ats_applications WHERE id = NEW.application_id;
v_when := to_char(NEW.starts_at AT TIME ZONE 'Asia/Kolkata', 'FMDD Mon YYYY, FMHH12:MI AM') || ' IST';
v_actor_name := public.ats_actor_name(auth.uid());
IF TG_OP = 'INSERT' THEN
v_type := 'interview_scheduled';
v_summary := NEW.title || ' scheduled for ' || v_when;
ELSIF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
v_type := 'interview_cancelled';
v_summary := NEW.title || ' on ' || v_when || ' cancelled' || coalesce(' - ' || NEW.cancel_reason, '');
ELSIF NEW.revision <> OLD.revision THEN
v_type := 'interview_rescheduled';
v_summary := NEW.title || ' moved to ' || v_when;
ELSIF NEW.status <> OLD.status THEN
v_type := CASE NEW.status WHEN 'completed' THEN 'interview_completed' WHEN 'no_show' THEN 'interview_no_show'
ELSE 'interview_reopened' END;
v_summary := CASE NEW.status WHEN 'completed' THEN NEW.title || ' on ' || v_when || ' completed'
WHEN 'no_show' THEN 'Did not attend ' || NEW.title || ' on ' || v_when
ELSE NEW.title || ' on ' || v_when || ' marked as scheduled again' END;
ELSIF NEW.candidate_response IS DISTINCT FROM OLD.candidate_response AND NEW.candidate_response IS NOT NULL THEN
v_type := 'interview_response';
v_summary := CASE NEW.candidate_response WHEN 'accepted' THEN 'Accepted the invite for '
WHEN 'declined' THEN 'Declined the invite for ' ELSE 'Answered "maybe" to the invite for ' END
|| NEW.title || ' on ' || v_when;
v_actor_name := 'Candidate';
END IF;
IF v_type IS NOT NULL THEN
INSERT INTO public.ats_events (candidate_id, application_id, job_id, event_type, summary, data, actor_user_id, actor_name)
VALUES (NEW.candidate_id, NEW.application_id, v_job, v_type, v_summary,
jsonb_build_object('interview_id', NEW.id, 'starts_at', NEW.starts_at, 'mode', NEW.mode, 'revision', NEW.revision,
'status', NEW.status, 'response', NEW.candidate_response),
CASE WHEN v_type = 'interview_response' THEN NULL ELSE auth.uid() END, v_actor_name);
UPDATE public.ats_candidates SET last_activity_at = now() WHERE id = NEW.candidate_id;
END IF;
IF TG_OP = 'UPDATE' AND NEW.revision <> OLD.revision THEN
-- A reminder written for the old time must not go out (it was never sent, so it is removed).
DELETE FROM public.ats_messages WHERE interview_id = NEW.id AND status = 'queued';
END IF;
RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.ats_interview_panel_before_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
NEW.updated_at := now();
NEW.name := btrim(NEW.name);
NEW.feedback := nullif(btrim(coalesce(NEW.feedback, '')), '');
IF TG_OP = 'INSERT' THEN
NEW.created_at := now();
ELSE
NEW.interview_id := OLD.interview_id;
NEW.employee_id := OLD.employee_id;
NEW.created_at := OLD.created_at;
END IF;
IF (TG_OP = 'INSERT' AND (NEW.recommendation IS NOT NULL OR NEW.score IS NOT NULL OR NEW.feedback IS NOT NULL))
OR (TG_OP = 'UPDATE' AND (NEW.recommendation, NEW.score, NEW.feedback) IS DISTINCT FROM (OLD.recommendation, OLD.score, OLD.feedback)) THEN
IF NEW.recommendation IS NULL AND NEW.score IS NULL AND NEW.feedback IS NULL THEN
NEW.feedback_at := NULL;
NEW.feedback_by := NULL;
NEW.feedback_by_name := NULL;
ELSE
NEW.feedback_at := now();
NEW.feedback_by := auth.uid();
NEW.feedback_by_name := public.ats_actor_name(auth.uid());
END IF;
ELSIF TG_OP = 'UPDATE' THEN
NEW.feedback_at := OLD.feedback_at;
NEW.feedback_by := OLD.feedback_by;
NEW.feedback_by_name := OLD.feedback_by_name;
ELSE
NEW.feedback_at := NULL;
NEW.feedback_by := NULL;
NEW.feedback_by_name := NULL;
END IF;
RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.ats_interview_panel_after_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i public.ats_interviews; v_job uuid; v_rec text;
BEGIN
IF NEW.feedback_at IS NULL OR (TG_OP = 'UPDATE' AND NEW.feedback_at IS NOT DISTINCT FROM OLD.feedback_at) THEN
RETURN NULL;
END IF;
SELECT * INTO i FROM public.ats_interviews WHERE id = NEW.interview_id;
SELECT job_id INTO v_job FROM public.ats_applications WHERE id = i.application_id;
v_rec := CASE NEW.recommendation WHEN 'strong_yes' THEN 'Strong yes' WHEN 'yes' THEN 'Yes'
WHEN 'no' THEN 'No' WHEN 'strong_no' THEN 'Strong no' END;
INSERT INTO public.ats_events (candidate_id, application_id, job_id, event_type, summary, data, actor_user_id, actor_name)
VALUES (i.candidate_id, i.application_id, v_job, 'interview_feedback',
'Feedback from ' || NEW.name || ' on ' || i.title || coalesce(': ' || v_rec, '')
|| coalesce(' (' || NEW.score || ' of 5)', ''),
jsonb_build_object('interview_id', i.id, 'panel_id', NEW.id, 'recommendation', NEW.recommendation, 'score', NEW.score),
NEW.feedback_by, NEW.feedback_by_name);
UPDATE public.ats_candidates SET last_activity_at = now() WHERE id = i.candidate_id;
RETURN NULL;
END $$;

CREATE TRIGGER ats_interviews_before_trg BEFORE INSERT OR UPDATE ON public.ats_interviews
FOR EACH ROW EXECUTE FUNCTION public.ats_interviews_before_write();
CREATE TRIGGER ats_interviews_after_trg AFTER INSERT OR UPDATE ON public.ats_interviews
FOR EACH ROW EXECUTE FUNCTION public.ats_interviews_after_write();
CREATE TRIGGER ats_interview_panel_before_trg BEFORE INSERT OR UPDATE ON public.ats_interview_panel
FOR EACH ROW EXECUTE FUNCTION public.ats_interview_panel_before_write();
CREATE TRIGGER ats_interview_panel_after_trg AFTER INSERT OR UPDATE ON public.ats_interview_panel
FOR EACH ROW EXECUTE FUNCTION public.ats_interview_panel_after_write();

-- 8. Actions (HR staff)
-- 8a. Schedule a new interview or change a scheduled one, with its panel.
--     p: { id?, application_id, title?, mode, starts_at, duration_minutes, location?, meeting_url?,
--          candidate_note?, internal_note?, panel: [employee ids], move_to_interview_stage? }
CREATE OR REPLACE FUNCTION public.ats_save_interview(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
v_id uuid := nullif(p->>'id', '')::uuid;
v_app uuid := nullif(p->>'application_id', '')::uuid;
v_mode text := p->>'mode';
v_start timestamptz := nullif(p->>'starts_at', '')::timestamptz;
v_minutes integer := coalesce(nullif(p->>'duration_minutes', '')::integer, 30);
v_title text := coalesce(nullif(btrim(p->>'title'), ''), 'Interview');
v_loc text := nullif(btrim(coalesce(p->>'location', '')), '');
v_url text := nullif(btrim(coalesce(p->>'meeting_url', '')), '');
v_panel uuid[];
v_old public.ats_interviews;
v_new public.ats_interviews;
v_app_status text; v_cur_order integer; v_stage uuid; v_stage_order integer;
v_added uuid[] := '{}'; v_removed uuid[] := '{}'; v_row uuid; v_found integer;
v_stage_moved boolean := false;
c record;
BEGIN
IF NOT coalesce(public.hr_is_hr_staff(auth.uid()), false) THEN RAISE EXCEPTION 'ATS_FORBIDDEN'; END IF;
IF jsonb_typeof(coalesce(p->'panel', '[]'::jsonb)) <> 'array' THEN
RAISE EXCEPTION 'ATS_INTERVIEW_INVALID' USING DETAIL = 'panel';
END IF;
v_panel := ARRAY(SELECT DISTINCT x::uuid FROM jsonb_array_elements_text(coalesce(p->'panel', '[]'::jsonb)) AS t(x));
IF coalesce(array_length(v_panel, 1), 0) > 8 THEN RAISE EXCEPTION 'ATS_INTERVIEW_INVALID' USING DETAIL = 'panel'; END IF;
IF v_mode IS NULL OR v_mode NOT IN ('in_person', 'video', 'phone') THEN
RAISE EXCEPTION 'ATS_INTERVIEW_INVALID' USING DETAIL = 'mode';
END IF;
IF v_start IS NULL THEN RAISE EXCEPTION 'ATS_INTERVIEW_INVALID' USING DETAIL = 'starts_at'; END IF;
IF v_minutes NOT BETWEEN 10 AND 480 THEN RAISE EXCEPTION 'ATS_INTERVIEW_INVALID' USING DETAIL = 'duration'; END IF;
IF v_start < now() - interval '30 days' OR v_start > now() + interval '365 days' THEN
RAISE EXCEPTION 'ATS_INTERVIEW_TIME' USING HINT = 'Pick a time within the next year (or the last 30 days to record a past interview).';
END IF;
IF v_mode = 'in_person' THEN
v_loc := coalesce(v_loc, (SELECT interview_address FROM public.ats_settings WHERE id));
IF v_loc IS NULL THEN RAISE EXCEPTION 'ATS_INTERVIEW_INVALID' USING DETAIL = 'location'; END IF;
v_url := NULL;
ELSIF v_mode = 'video' THEN
IF v_url IS NULL OR v_url !~ '^https://[^\s<>"]+$' OR length(v_url) > 500 THEN
RAISE EXCEPTION 'ATS_INTERVIEW_INVALID' USING DETAIL = 'meeting_url';
END IF;
v_loc := NULL;
ELSE
v_loc := NULL;
v_url := NULL;
END IF;

IF v_id IS NULL THEN
SELECT status INTO v_app_status FROM public.ats_applications WHERE id = v_app;
IF NOT FOUND THEN RAISE EXCEPTION 'ATS_APPLICATION_NOT_FOUND'; END IF;
IF v_app_status NOT IN ('active', 'on_hold') THEN
RAISE EXCEPTION 'ATS_APPLICATION_CLOSED' USING HINT = 'Reopen the application before scheduling an interview.';
END IF;
INSERT INTO public.ats_interviews (application_id, candidate_id, title, mode, starts_at, ends_at, location, meeting_url,
candidate_note, internal_note)
VALUES (v_app, NULL, v_title, v_mode, v_start, v_start + make_interval(mins => v_minutes), v_loc, v_url,
left(p->>'candidate_note', 1000), left(p->>'internal_note', 2000))
RETURNING * INTO v_new;
ELSE
SELECT * INTO v_old FROM public.ats_interviews WHERE id = v_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'ATS_INTERVIEW_NOT_FOUND'; END IF;
IF v_old.status <> 'scheduled' THEN
RAISE EXCEPTION 'ATS_INTERVIEW_CLOSED' USING HINT = 'Only a scheduled interview can be changed.';
END IF;
v_app := v_old.application_id;
SELECT status INTO v_app_status FROM public.ats_applications WHERE id = v_app;
UPDATE public.ats_interviews
SET title = v_title, mode = v_mode, starts_at = v_start, ends_at = v_start + make_interval(mins => v_minutes),
location = v_loc, meeting_url = v_url, candidate_note = left(p->>'candidate_note', 1000),
internal_note = left(p->>'internal_note', 2000)
WHERE id = v_id
RETURNING * INTO v_new;
END IF;

-- Panel: everyone in the list stays or is added (a removed member comes back with a fresh invite);
-- members no longer in the list are marked removed so their calendar invite can be cancelled.
-- New members must be active employees; members already on this panel may stay even if no longer active.
SELECT count(*) INTO v_found FROM unnest(v_panel) AS u(eid)
WHERE NOT EXISTS (SELECT 1 FROM public.ats_employee_contacts(ARRAY[u.eid]) ec WHERE ec.is_active)
AND NOT EXISTS (SELECT 1 FROM public.ats_interview_panel pm
WHERE pm.interview_id = v_new.id AND pm.employee_id = u.eid AND pm.removed_at IS NULL);
IF v_found > 0 THEN RAISE EXCEPTION 'ATS_INTERVIEWER_NOT_FOUND'; END IF;
FOR v_row IN
UPDATE public.ats_interview_panel SET removed_at = now()
WHERE interview_id = v_new.id AND removed_at IS NULL AND (employee_id IS NULL OR NOT (employee_id = ANY (v_panel)))
RETURNING id
LOOP
v_removed := v_removed || v_row;
END LOOP;
FOR c IN SELECT * FROM public.ats_employee_contacts(v_panel) LOOP
v_row := NULL;
INSERT INTO public.ats_interview_panel (interview_id, employee_id, user_id, name, email)
VALUES (v_new.id, c.employee_id, c.user_id, c.name, c.email)
ON CONFLICT (interview_id, employee_id) WHERE employee_id IS NOT NULL DO UPDATE
SET removed_at = NULL, user_id = EXCLUDED.user_id, name = EXCLUDED.name, email = EXCLUDED.email,
invite_status = NULL, invite_error = NULL, invited_revision = NULL, invited_at = NULL, cancel_sent_at = NULL
WHERE public.ats_interview_panel.removed_at IS NOT NULL
RETURNING id INTO v_row;
IF v_row IS NOT NULL THEN v_added := v_added || v_row; END IF;
END LOOP;

IF coalesce((p->>'move_to_interview_stage')::boolean, false) AND v_app_status IN ('active', 'on_hold') THEN
SELECT s.id, s.sort_order INTO v_stage, v_stage_order FROM public.ats_stages s
WHERE s.kind = 'interview' AND s.is_active ORDER BY s.sort_order LIMIT 1;
SELECT s.sort_order INTO v_cur_order FROM public.ats_applications a JOIN public.ats_stages s ON s.id = a.stage_id
WHERE a.id = v_app;
IF v_stage IS NOT NULL AND coalesce(v_cur_order, 0) < v_stage_order THEN
PERFORM public.ats_move_stage(v_app, v_stage, NULL);
v_stage_moved := true;
END IF;
END IF;

RETURN jsonb_build_object('id', v_new.id, 'application_id', v_new.application_id, 'candidate_id', v_new.candidate_id,
'revision', v_new.revision, 'status', v_new.status,
'time_changed', v_old.id IS NULL OR v_new.revision <> v_old.revision,
'added', to_jsonb(v_added), 'removed', to_jsonb(v_removed), 'stage_moved', v_stage_moved);
END $$;

-- 8b. Cancel a scheduled interview
CREATE OR REPLACE FUNCTION public.ats_cancel_interview(p_interview_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v public.ats_interviews;
BEGIN
IF NOT coalesce(public.hr_is_hr_staff(auth.uid()), false) THEN RAISE EXCEPTION 'ATS_FORBIDDEN'; END IF;
UPDATE public.ats_interviews SET status = 'cancelled', cancel_reason = left(nullif(btrim(coalesce(p_reason, '')), ''), 500)
WHERE id = p_interview_id AND status = 'scheduled'
RETURNING * INTO v;
IF NOT FOUND THEN
IF EXISTS (SELECT 1 FROM public.ats_interviews WHERE id = p_interview_id) THEN
RAISE EXCEPTION 'ATS_INTERVIEW_CLOSED' USING HINT = 'Only a scheduled interview can be cancelled.';
END IF;
RAISE EXCEPTION 'ATS_INTERVIEW_NOT_FOUND';
END IF;
RETURN jsonb_build_object('id', v.id, 'revision', v.revision, 'status', v.status);
END $$;

-- 8c. Mark an interview as completed or not attended, or undo that
CREATE OR REPLACE FUNCTION public.ats_set_interview_status(p_interview_id uuid, p_status text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v public.ats_interviews;
BEGIN
IF NOT coalesce(public.hr_is_hr_staff(auth.uid()), false) THEN RAISE EXCEPTION 'ATS_FORBIDDEN'; END IF;
IF p_status IS NULL OR p_status NOT IN ('completed', 'no_show', 'scheduled') THEN
RAISE EXCEPTION 'ATS_INTERVIEW_INVALID' USING DETAIL = 'status';
END IF;
UPDATE public.ats_interviews SET status = p_status
WHERE id = p_interview_id
AND ((p_status IN ('completed', 'no_show') AND status = 'scheduled')
OR (p_status = 'scheduled' AND status IN ('completed', 'no_show')))
RETURNING * INTO v;
IF NOT FOUND THEN
IF EXISTS (SELECT 1 FROM public.ats_interviews WHERE id = p_interview_id) THEN
RAISE EXCEPTION 'ATS_INTERVIEW_CLOSED';
END IF;
RAISE EXCEPTION 'ATS_INTERVIEW_NOT_FOUND';
END IF;
RETURN jsonb_build_object('id', v.id, 'status', v.status, 'revision', v.revision);
END $$;

-- 8d. Save (or clear) one interviewer's feedback. HR staff may enter it on the interviewer's behalf.
CREATE OR REPLACE FUNCTION public.ats_save_interview_feedback(p_panel_id uuid, p_recommendation text, p_score integer,
p_feedback text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v public.ats_interview_panel;
BEGIN
IF NOT coalesce(public.hr_is_hr_staff(auth.uid()), false) THEN RAISE EXCEPTION 'ATS_FORBIDDEN'; END IF;
IF p_recommendation IS NOT NULL AND p_recommendation NOT IN ('strong_yes', 'yes', 'no', 'strong_no') THEN
RAISE EXCEPTION 'ATS_INTERVIEW_INVALID' USING DETAIL = 'recommendation';
END IF;
IF p_score IS NOT NULL AND p_score NOT BETWEEN 1 AND 5 THEN
RAISE EXCEPTION 'ATS_INTERVIEW_INVALID' USING DETAIL = 'score';
END IF;
UPDATE public.ats_interview_panel pm
SET recommendation = p_recommendation, score = p_score, feedback = left(p_feedback, 5000)
WHERE pm.id = p_panel_id AND pm.removed_at IS NULL
AND EXISTS (SELECT 1 FROM public.ats_interviews i WHERE i.id = pm.interview_id AND i.status <> 'cancelled')
RETURNING * INTO v;
IF NOT FOUND THEN RAISE EXCEPTION 'ATS_INTERVIEW_NOT_FOUND'; END IF;
RETURN jsonb_build_object('id', v.id, 'feedback_at', v.feedback_at);
END $$;

-- 9. Service role: candidate replies to the calendar invite, and reminders
-- 9a. "Accepted / Declined / Maybe" from the candidate's calendar (read by ats-mail-sync)
CREATE OR REPLACE FUNCTION public.ats_interview_rsvp(p_interview_id uuid, p_attendee text, p_partstat text)
RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
v_resp text := CASE upper(btrim(coalesce(p_partstat, ''))) WHEN 'ACCEPTED' THEN 'accepted'
WHEN 'DECLINED' THEN 'declined' WHEN 'TENTATIVE' THEN 'tentative' END;
BEGIN
IF v_resp IS NULL OR p_interview_id IS NULL THEN RETURN false; END IF;
PERFORM set_config('ats.actor_name', 'Candidate', true);
UPDATE public.ats_interviews i SET candidate_response = v_resp, candidate_response_at = now()
FROM public.ats_candidates c
WHERE i.id = p_interview_id AND c.id = i.candidate_id AND i.status = 'scheduled'
AND c.email_norm = lower(btrim(p_attendee)) AND i.candidate_response IS DISTINCT FROM v_resp;
RETURN FOUND;
END $$;

-- 9b. Queue the "Interview reminder" email for interviews that start within the reminder window.
--     Only while ATS email is on and reminders are set; only when the interview was set up before the window
--     opened (otherwise the invitation itself is recent); never for declined invites or closed applications.
CREATE OR REPLACE FUNCTION public.ats_queue_interview_reminders()
RETURNS integer LANGUAGE plpgsql SET search_path = public AS $$
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
SELECT i.id, i.application_id, i.candidate_id, c.email_norm
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
in_reply_to, references_header, attempts, next_attempt_at, created_by_name)
VALUES (v_id, r.candidate_id, r.application_id, r.id, 'outbound', 'queued', 'interview', t.code, true,
s.mail_mailbox_id, v_from, v_from_name, ARRAY[r.email_norm], v_txt->>'subject', v_txt->>'body',
'<ats.' || v_id::text || '@' || split_part(v_from, '@', 2) || '>',
v_parent, CASE WHEN v_parent IS NULL THEN NULL ELSE btrim(coalesce(v_refs, '') || ' ' || v_parent) END,
0, now(), 'ATS (automatic)');
UPDATE public.ats_interviews SET reminder_queued_at = now() WHERE id = r.id;
n := n + 1;
END LOOP;
RETURN n;
END $$;

-- 10. Access: HR staff read and write interviews and panels (through the actions above; business rules are
--     enforced by the triggers either way); only HR admins can delete an interview (cancel is the normal way).
ALTER TABLE public.ats_interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ats_interview_panel ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ats_interviews, public.ats_interview_panel FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ats_interviews TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ats_interview_panel TO authenticated;
GRANT ALL ON TABLE public.ats_interviews, public.ats_interview_panel TO service_role;
CREATE POLICY ats_interviews_select ON public.ats_interviews FOR SELECT TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_interviews_insert ON public.ats_interviews FOR INSERT TO authenticated
WITH CHECK ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_interviews_update ON public.ats_interviews FOR UPDATE TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid())))) WITH CHECK ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_interviews_delete ON public.ats_interviews FOR DELETE TO authenticated
USING ((SELECT public.hr_is_hr_admin()));
CREATE POLICY ats_interview_panel_select ON public.ats_interview_panel FOR SELECT TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_interview_panel_insert ON public.ats_interview_panel FOR INSERT TO authenticated
WITH CHECK ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_interview_panel_update ON public.ats_interview_panel FOR UPDATE TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid())))) WITH CHECK ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
REVOKE ALL ON FUNCTION public.ats_interviews_before_write(), public.ats_interviews_after_write(),
public.ats_interview_panel_before_write(), public.ats_interview_panel_after_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ats_duration_text(integer), public.ats_employee_contacts(uuid[]),
public.ats_render_interview_text(uuid, text, text), public.ats_save_interview(jsonb),
public.ats_cancel_interview(uuid, text), public.ats_set_interview_status(uuid, text),
public.ats_save_interview_feedback(uuid, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ats_duration_text(integer), public.ats_employee_contacts(uuid[]),
public.ats_render_interview_text(uuid, text, text), public.ats_save_interview(jsonb),
public.ats_cancel_interview(uuid, text), public.ats_set_interview_status(uuid, text),
public.ats_save_interview_feedback(uuid, text, integer, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ats_interview_rsvp(uuid, text, text), public.ats_queue_interview_reminders()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ats_interview_rsvp(uuid, text, text), public.ats_queue_interview_reminders() TO service_role;