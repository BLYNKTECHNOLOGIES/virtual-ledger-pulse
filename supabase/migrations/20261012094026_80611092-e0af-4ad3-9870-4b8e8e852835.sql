-- ATS email (Batch 4B), migration M6: automatic acknowledgement for careers-page applications.
-- Scope: only objects named ats_*. The acknowledgement is queued here and sent by ats-mail-sync.

-- 1. Queue the "Application received" email for one new careers-page application (service role).
--    Only when ATS email and acknowledgements are on, the application came from the careers page in the
--    last 24 hours (so imported or late-synced old applications never get one), the candidate has an email
--    address, the built-in acknowledgement template is active, and no acknowledgement exists yet.
CREATE OR REPLACE FUNCTION public.ats_queue_acknowledgement(p_application_id uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
s public.ats_settings;
v_cand uuid; v_via text; v_applied timestamptz; v_email text; v_merged uuid; v_anon timestamptz;
v_tpl uuid; v_code text; v_from text; v_from_name text; v_rendered jsonb;
v_id uuid := gen_random_uuid();
BEGIN
SELECT * INTO s FROM public.ats_settings WHERE id;
IF NOT FOUND OR NOT s.mail_enabled OR NOT s.mail_ack_enabled OR s.mail_mailbox_id IS NULL THEN RETURN NULL; END IF;
SELECT a.candidate_id, a.applied_via, a.applied_at, c.email_norm, c.merged_into_id, c.anonymized_at
INTO v_cand, v_via, v_applied, v_email, v_merged, v_anon
FROM public.ats_applications a JOIN public.ats_candidates c ON c.id = a.candidate_id
WHERE a.id = p_application_id;
IF NOT FOUND OR v_via <> 'careers_form' OR v_applied < now() - interval '24 hours'
OR v_email IS NULL OR v_merged IS NOT NULL OR v_anon IS NOT NULL THEN
RETURN NULL;
END IF;
IF EXISTS (SELECT 1 FROM public.ats_messages WHERE application_id = p_application_id AND purpose = 'acknowledgement') THEN
RETURN NULL;
END IF;
SELECT id, code INTO v_tpl, v_code FROM public.ats_email_templates WHERE code = 'acknowledgement' AND is_active;
IF NOT FOUND THEN RETURN NULL; END IF;
SELECT lower(btrim(from_address)), from_name INTO v_from, v_from_name
FROM public.hr_mailboxes WHERE id = s.mail_mailbox_id AND is_active;
IF v_from IS NULL OR position('@' IN v_from) = 0 THEN RETURN NULL; END IF;
v_rendered := public.ats_render_template(v_tpl, p_application_id);
INSERT INTO public.ats_messages (id, candidate_id, application_id, direction, status, purpose, template_code, is_automatic,
mailbox_id, from_address, from_name, to_addresses, subject, body_text, message_id, attempts, next_attempt_at, created_by_name)
VALUES (v_id, v_cand, p_application_id, 'outbound', 'queued', 'acknowledgement', v_code, true,
s.mail_mailbox_id, v_from, v_from_name, ARRAY[v_email], v_rendered->>'subject', v_rendered->>'body',
'<ats.' || v_id::text || '@' || split_part(v_from, '@', 2) || '>', 0, now(), 'ATS (automatic)');
RETURN v_id;
END $$;

-- 2. Careers intake (from M4, unchanged) plus: queue the acknowledgement for a brand-new application.
--    A problem with the acknowledgement never blocks the intake.
CREATE OR REPLACE FUNCTION public.ats_intake_application(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
v_ref text := nullif(btrim(p->>'external_ref'), '');
v_app uuid; v_cand uuid; v_job uuid; v_source uuid; v_res jsonb;
BEGIN
IF v_ref IS NULL THEN RAISE EXCEPTION 'ATS_INTAKE_REF_REQUIRED'; END IF;
PERFORM set_config('ats.actor_name', 'Careers page', true);
SELECT a.id, a.candidate_id INTO v_app, v_cand FROM public.ats_applications a
WHERE a.applied_via = 'careers_form' AND a.external_ref = v_ref;
IF v_app IS NOT NULL THEN
RETURN jsonb_build_object('candidate_id', v_cand, 'application_id', v_app,
'reused_candidate', true, 'existing_application', true, 'duplicate', true, 'job_matched', NULL);
END IF;
v_job := public.ats_match_job(p->>'job_slug', p->>'position_text');
SELECT id INTO v_source FROM public.ats_sources WHERE code = 'careers';
v_res := public.ats_create_application(
coalesce(p->'candidate', '{}'::jsonb), v_job, v_source, 'careers_form',
nullif(btrim(p->>'position_text'), ''), nullif(btrim(p->>'cover_letter'), ''),
coalesce(p->'answers', '{}'::jsonb), NULL,
coalesce(nullif(p->>'applied_at', '')::timestamptz, now()),
v_ref, nullif(btrim(p->>'source_detail'), ''));
IF NOT coalesce((v_res->>'existing_application')::boolean, false) THEN
BEGIN
PERFORM public.ats_queue_acknowledgement((v_res->>'application_id')::uuid);
EXCEPTION WHEN others THEN
RAISE WARNING 'ATS acknowledgement not queued (%)', SQLSTATE;
END;
END IF;
RETURN v_res || jsonb_build_object('duplicate', false, 'job_matched', v_job IS NOT NULL);
END $$;

REVOKE ALL ON FUNCTION public.ats_queue_acknowledgement(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ats_queue_acknowledgement(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.ats_intake_application(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ats_intake_application(jsonb) TO service_role;