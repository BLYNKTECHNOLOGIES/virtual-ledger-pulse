ALTER TABLE public.ats_email_templates
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'whatsapp')),
  ADD COLUMN IF NOT EXISTS quick_reply boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_subject text,
  ADD COLUMN IF NOT EXISTS default_body text;
DROP INDEX IF EXISTS public.ats_email_templates_name_uq;
CREATE UNIQUE INDEX ats_email_templates_name_uq ON public.ats_email_templates (channel, lower(btrim(name)));

ALTER TABLE public.ats_settings
  ADD COLUMN IF NOT EXISTS company_display_name text NOT NULL DEFAULT 'Blynk Virtual Technologies'
    CHECK (length(btrim(company_display_name)) BETWEEN 1 AND 120),
  ADD COLUMN IF NOT EXISTS hr_contact_phone text
    CHECK (hr_contact_phone IS NULL OR hr_contact_phone ~ '^[0-9+() -]{6,20}$');

CREATE OR REPLACE FUNCTION public.ats_name_case(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE WHEN p IS NULL THEN NULL
              WHEN p = upper(p) OR p = lower(p) THEN initcap(p)
              ELSE p END
$$;

CREATE OR REPLACE FUNCTION public.ats_first_name(p_full_name text)
RETURNS text LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE t text[]; i int := 1; n int;
BEGIN
  t := regexp_split_to_array(btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g')), ' ');
  n := coalesce(array_length(t, 1), 0);
  IF n = 0 OR t[1] = '' THEN RETURN 'Candidate'; END IF;
  WHILE i < n AND (lower(rtrim(t[i], '.')) IN ('mr','mrs','ms','miss','dr','shri','shree','sri','smt','kumari','km','er','prof','md','mohd','mo')
                   OR t[i] ~* '^([a-z]\.?){1,3}$') LOOP
    i := i + 1;
  END LOOP;
  RETURN public.ats_name_case(t[i]);
END $$;

CREATE OR REPLACE FUNCTION public.ats_template_values(p_application_id uuid DEFAULT NULL, p_candidate_id uuid DEFAULT NULL, p_interview_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  s public.ats_settings;
  i public.ats_interviews;
  v_app uuid := p_application_id;
  v_cid uuid := p_candidate_id;
  v_name text; v_ref text; v_phone text; v_job text; v_job_loc text; v_stage text; v_applied timestamptz;
  v_local timestamp;
  v jsonb;
BEGIN
  SELECT * INTO s FROM public.ats_settings WHERE id;
  IF p_interview_id IS NOT NULL THEN
    SELECT * INTO i FROM public.ats_interviews WHERE id = p_interview_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'ATS_INTERVIEW_NOT_FOUND'; END IF;
    v_app := i.application_id;
  END IF;
  IF v_app IS NOT NULL THEN
    SELECT a.candidate_id, coalesce(j.title, nullif(btrim(a.position_text), '')), nullif(btrim(j.location), ''), st.name, a.applied_at
      INTO v_cid, v_job, v_job_loc, v_stage, v_applied
    FROM public.ats_applications a
    LEFT JOIN public.ats_jobs j ON j.id = a.job_id
    LEFT JOIN public.ats_stages st ON st.id = a.stage_id
    WHERE a.id = v_app;
    IF NOT FOUND THEN RAISE EXCEPTION 'ATS_APPLICATION_NOT_FOUND'; END IF;
  END IF;
  IF v_cid IS NULL THEN RAISE EXCEPTION 'ATS_CANDIDATE_REQUIRED'; END IF;
  SELECT c.full_name, c.ref_no, c.phone INTO v_name, v_ref, v_phone FROM public.ats_candidates c WHERE c.id = v_cid;
  IF NOT FOUND THEN RAISE EXCEPTION 'ATS_CANDIDATE_NOT_FOUND'; END IF;

  v := jsonb_build_object(
    'first_name', public.ats_first_name(v_name),
    'full_name', (SELECT string_agg(public.ats_name_case(w), ' ') FROM unnest(regexp_split_to_array(btrim(regexp_replace(coalesce(v_name, ''), '\s+', ' ', 'g')), ' ')) w),
    'job_title', coalesce(v_job, 'a role'),
    'company_name', coalesce(nullif(btrim(s.company_display_name), ''), 'Blynk Virtual Technologies'),
    'ref_no', coalesce(v_ref, ''),
    'applied_date', CASE WHEN v_applied IS NULL THEN '' ELSE to_char(v_applied AT TIME ZONE 'Asia/Kolkata', 'FMDD FMMonth YYYY') END,
    'stage_name', coalesce(v_stage, ''),
    'job_location', coalesce(v_job_loc, nullif(btrim(s.default_location), ''), ''),
    'office_address', coalesce(btrim(s.interview_address), ''),
    'hr_phone', coalesce(btrim(s.hr_contact_phone), ''),
    'careers_link', coalesce(s.careers_base_url, ''));

  IF p_interview_id IS NOT NULL THEN
    v_local := i.starts_at AT TIME ZONE 'Asia/Kolkata';
    v := v || jsonb_build_object(
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
  END IF;
  RETURN v;
END $$;
GRANT EXECUTE ON FUNCTION public.ats_template_values(uuid, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.ats_template_placeholders()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['first_name','full_name','job_title','company_name','ref_no','applied_date','stage_name','job_location',
               'office_address','hr_phone','careers_link',
               'interview_title','interview_date','interview_time','interview_duration','interview_mode','interview_where','interview_note']
$$;

CREATE OR REPLACE FUNCTION public.ats_fill_placeholders(p_text text, p_values jsonb, p_is_body boolean)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE k text; val text; r text := coalesce(p_text, '');
BEGIN
  FOR k, val IN SELECT e.key, e.value FROM jsonb_each_text(p_values) e LOOP
    r := regexp_replace(r, '\{\{\s*' || k || '\s*\}\}', replace(coalesce(val, ''), '\', '\\'), 'g');
  END LOOP;
  IF p_is_body THEN
    r := regexp_replace(replace(r, E'\r\n', E'\n'), '[ \t]+\n', E'\n', 'g');
    r := btrim(regexp_replace(r, '\n{3,}', E'\n\n', 'g'), E' \n');
  ELSE
    r := btrim(regexp_replace(r, '\s+', ' ', 'g'));
  END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.ats_render_template(p_template_id uuid, p_application_id uuid DEFAULT NULL, p_candidate_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE t public.ats_email_templates; v jsonb; v_cid uuid;
BEGIN
  SELECT * INTO t FROM public.ats_email_templates WHERE id = p_template_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ATS_TEMPLATE_NOT_FOUND'; END IF;
  v := public.ats_template_values(p_application_id, p_candidate_id, NULL);
  IF p_application_id IS NOT NULL THEN SELECT candidate_id INTO v_cid FROM public.ats_applications WHERE id = p_application_id; ELSE v_cid := p_candidate_id; END IF;
  RETURN jsonb_build_object('subject', public.ats_fill_placeholders(t.subject, v, false),
    'body', public.ats_fill_placeholders(t.body, v, true), 'template_code', t.code, 'purpose', t.purpose,
    'candidate_id', v_cid, 'application_id', p_application_id);
END $$;

CREATE OR REPLACE FUNCTION public.ats_render_interview_text(p_interview_id uuid, p_subject text, p_body text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  v := public.ats_template_values(NULL, NULL, p_interview_id);
  RETURN jsonb_build_object('subject', public.ats_fill_placeholders(p_subject, v, false), 'body', public.ats_fill_placeholders(p_body, v, true));
END $$;

CREATE OR REPLACE FUNCTION public.ats_email_templates_guard()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE v_unknown text; v_has_iv boolean;
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
  IF coalesce(current_setting('ats.seed', true), '') <> 'on' THEN
    NEW.is_system := false;
    NEW.code := coalesce(public.ats_slugify(NEW.name), 'template') || '-' || substr(md5(gen_random_uuid()::text), 1, 4);
  END IF;
  NEW.created_by := auth.uid();
  NEW.created_by_name := public.ats_actor_name(auth.uid());
  NEW.created_at := now();
ELSE
  NEW.code := OLD.code;
  NEW.is_system := OLD.is_system;
  NEW.created_by := OLD.created_by;
  NEW.created_by_name := OLD.created_by_name;
  NEW.created_at := OLD.created_at;
  IF OLD.is_system THEN
    NEW.purpose := OLD.purpose;
    NEW.channel := OLD.channel;
    IF OLD.code IN ('interview-scheduled','interview-rescheduled','interview-cancelled') AND NEW.is_active = false THEN
      RAISE EXCEPTION 'ATS_TEMPLATE_REQUIRED';
    END IF;
  END IF;
END IF;
SELECT string_agg(DISTINCT k, ', '), bool_or(k LIKE 'interview\_%')
  INTO v_unknown, v_has_iv
FROM (SELECT m[1] AS k FROM regexp_matches(coalesce(NEW.subject,'') || E'\n' || coalesce(NEW.body,''), '\{\{\s*([\w.]+)\s*\}\}', 'g') m) x
WHERE NOT (k = ANY (public.ats_template_placeholders()));
IF v_unknown IS NOT NULL THEN
  RAISE EXCEPTION 'ATS_TEMPLATE_UNKNOWN_PLACEHOLDER' USING HINT = 'Unknown: ' || v_unknown;
END IF;
IF NEW.purpose <> 'interview' AND EXISTS (
  SELECT 1 FROM regexp_matches(coalesce(NEW.subject,'') || E'\n' || coalesce(NEW.body,''), '\{\{\s*(interview_\w+)\s*\}\}', 'g')) THEN
  RAISE EXCEPTION 'ATS_TEMPLATE_INTERVIEW_FIELDS';
END IF;
RETURN NEW;
END $function$;

UPDATE public.ats_email_templates SET name = 'Ask for interview times' WHERE code = 'interview-invitation' AND name = 'Interview invitation';
UPDATE public.ats_email_templates
  SET body = replace(body, 'We will keep your details on record and may contact you if a suitable opening comes up.',
                           'If a suitable opening comes up in the coming months, we may get in touch with you again.')
  WHERE code = 'rejection' AND body LIKE '%We will keep your details on record%';
UPDATE public.ats_email_templates SET default_subject = subject, default_body = body WHERE is_system AND default_body IS NULL;

SET LOCAL ats.seed = 'on';
INSERT INTO public.ats_email_templates (code, name, purpose, channel, quick_reply, sort_order, subject, body, default_subject, default_body, is_system, is_active)
SELECT code, name, purpose, channel, qr, so, subj, bod, subj, bod, true, true FROM (VALUES
 ('follow-up','Following up','general','email',true,41,'Following up on your application - {{company_name}}',
  E'Dear {{first_name}},\n\nI am following up on my earlier email about your application for {{job_title}} at {{company_name}}.\n\nCould you please reply when you have a moment, so that we can take your application forward?\n\nWarm regards,'),
 ('documents-received','Documents received','general','email',true,42,'Documents received - {{company_name}}',
  E'Dear {{first_name}},\n\nThank you for sending your documents. We have received them and will get back to you about the next steps.\n\nWarm regards,'),
 ('thanks-for-reply','Thanks, we''ll get back','general','email',true,43,'Your application - {{company_name}}',
  E'Dear {{first_name}},\n\nThank you for your reply. We will get back to you shortly.\n\nWarm regards,'),
 ('shortlisted','Shortlisted','general','email',false,44,'Your application for {{job_title}} - {{company_name}}',
  E'Dear {{first_name}},\n\nGood news: your application for {{job_title}} at {{company_name}} has been shortlisted.\n\nWe will contact you shortly to arrange the next round. If you have any questions, just reply to this email.\n\nWarm regards,'),
 ('tried-to-call','Tried to call you','general','email',true,45,'We tried to call you - {{company_name}}',
  E'Dear {{first_name}},\n\nWe tried to call you about your application for {{job_title}}, but could not reach you.\n\nPlease reply to this email with a good time to call you.\n\nWarm regards,'),
 ('office-directions','Office address','general','email',true,46,'Our office address - {{company_name}}',
  E'Dear {{first_name}},\n\nHere is our office address:\n\n{{office_address}}\n\nWarm regards,'),
 ('interview-confirmed','Interview confirmed','interview','email',true,35,'Interview confirmed - {{company_name}}',
  E'Dear {{first_name}},\n\nThank you for confirming. We look forward to meeting you.\n\nDate: {{interview_date}}\nTime: {{interview_time}}\n{{interview_where}}\n\n{{interview_note}}\n\nWarm regards,'),
 ('wa-interview-details','Interview details','interview','whatsapp',false,60,'Interview details',
  E'Hello {{first_name}}, this is HR from {{company_name}}.\nYour interview for {{job_title}} is on {{interview_date}} at {{interview_time}}.\n{{interview_where}}\nPlease reply to confirm. Thank you!'),
 ('wa-interview-reminder','Interview reminder','interview','whatsapp',false,61,'Interview reminder',
  E'Hello {{first_name}}, a reminder from {{company_name}}: your interview is on {{interview_date}} at {{interview_time}}.\n{{interview_where}}\nSee you there!'),
 ('wa-interview-reminder-hi','Interview reminder (Hinglish)','interview','whatsapp',false,62,'Interview reminder (Hinglish)',
  E'Namaste {{first_name}}, {{company_name}} se HR bol rahe hain. Aapka interview {{interview_date}} ko {{interview_time}} par hai.\n{{interview_where}}\nKripya confirm karein. Dhanyavaad!'),
 ('wa-tried-to-call','Tried to call you','general','whatsapp',false,63,'Tried to call you',
  'Hello {{first_name}}, this is HR from {{company_name}}. We tried to call you about your application for {{job_title}}. Please tell us a good time to call. Thank you!'),
 ('wa-documents','Documents reminder','general','whatsapp',false,64,'Documents reminder',
  'Hello {{first_name}}, this is HR from {{company_name}}. Please send your latest resume and documents for your application for {{job_title}}. You can reply here or to our email. Thank you!'),
 ('wa-directions','Office address','general','whatsapp',false,65,'Office address',
  E'Hello {{first_name}}, our office address is:\n{{office_address}}\n– HR, {{company_name}}'),
 ('wa-not-moving-forward','Not moving forward','rejection','whatsapp',false,66,'Not moving forward',
  'Hello {{first_name}}, thank you for your interest in {{job_title}} at {{company_name}}. We will not be moving forward with your application at this time. We wish you all the best. – HR, {{company_name}}')
) AS x(code, name, purpose, channel, qr, so, subj, bod)
ON CONFLICT (code) DO NOTHING;
RESET ats.seed;