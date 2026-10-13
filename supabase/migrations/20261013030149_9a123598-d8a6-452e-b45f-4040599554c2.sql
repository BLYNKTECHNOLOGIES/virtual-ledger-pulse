CREATE OR REPLACE FUNCTION public.ats_email_templates_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
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
WHERE NOT (k = ANY (public.ats_template_placeholders()))
  AND NOT (k IN ('slot_link', 'slot_list') AND NEW.code IN ('interview-pick-a-slot', 'wa-pick-a-slot'));
IF v_unknown IS NOT NULL THEN
  RAISE EXCEPTION 'ATS_TEMPLATE_UNKNOWN_PLACEHOLDER' USING HINT = 'Unknown: ' || v_unknown;
END IF;
IF NEW.purpose <> 'interview' AND EXISTS (
  SELECT 1 FROM regexp_matches(coalesce(NEW.subject,'') || E'\n' || coalesce(NEW.body,''), '\{\{\s*(interview_\w+)\s*\}\}', 'g')) THEN
  RAISE EXCEPTION 'ATS_TEMPLATE_INTERVIEW_FIELDS';
END IF;
RETURN NEW;
END $function$;

SET LOCAL ats.seed = 'on';
INSERT INTO public.ats_email_templates (code, name, purpose, channel, quick_reply, sort_order, subject, body, default_subject, default_body, is_system, is_active)
SELECT code, name, purpose, channel, qr, so, subj, bod, subj, bod, true, true FROM (VALUES
 ('interview-pick-a-slot','Pick an interview time','interview','email',false,36,'Choose your interview time - {{company_name}}',
  E'Dear {{first_name}},\n\nThank you for applying for {{job_title}} at {{company_name}}. Please choose a time for your interview using this link:\n\n{{slot_link}}\n\nTimes available:\n{{slot_list}}\n\nThe link works until the times are taken or it expires. If none of these times suit you, just reply to this email.\n\nWarm regards,'),
 ('wa-pick-a-slot','Pick an interview time','interview','whatsapp',false,67,'Pick an interview time',
  'Hello {{first_name}}, this is HR from {{company_name}}. Please choose a time for your interview for {{job_title}} here: {{slot_link}}')
) AS x(code, name, purpose, channel, qr, so, subj, bod)
ON CONFLICT (code) DO NOTHING;
RESET ats.seed;