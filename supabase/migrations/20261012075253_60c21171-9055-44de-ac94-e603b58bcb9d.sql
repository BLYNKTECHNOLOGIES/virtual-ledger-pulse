-- ATS careers bridge (HRMS side): connection key store, job matching, intake action, idempotency, careers link setting.
-- Scope: only objects named ats_*.

-- 1. Connection to the careers website. Only a SHA-256 hash of the shared key is stored; the key is shown once when generated.
CREATE TABLE public.ats_integrations (
id text PRIMARY KEY CHECK (id IN ('careers_site')),
key_hash text,
key_preview text,
key_created_at timestamptz,
key_created_by uuid,
key_created_by_name text,
allowed_resume_host text NOT NULL DEFAULT 'tqnpnyyqlifzlcmklcmw.supabase.co',
last_seen_at timestamptz,
last_error text,
last_error_at timestamptz,
updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.ats_integrations (id) VALUES ('careers_site');
ALTER TABLE public.ats_integrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ats_integrations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.ats_integrations TO service_role;
CREATE POLICY ats_integrations_no_client_access ON public.ats_integrations FOR ALL TO authenticated
USING (false) WITH CHECK (false);

-- 2. Public careers link used by the ATS screens.
ALTER TABLE public.ats_settings ADD COLUMN careers_base_url text NOT NULL DEFAULT 'https://blynkex.com/careers'
CHECK (careers_base_url ~ '^https://[^[:space:]]+$');

-- 3. One ATS application per website application (idempotent intake).
CREATE UNIQUE INDEX ats_applications_careers_ref_uq ON public.ats_applications (external_ref)
WHERE applied_via = 'careers_form' AND external_ref IS NOT NULL;

-- 4. Job matching: exact slug of an open job, else the typed position equals an open job's title or alternative title.
CREATE OR REPLACE FUNCTION public.ats_norm_title(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
SELECT nullif(btrim(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', ' ', 'g')), '')
$$;
CREATE OR REPLACE FUNCTION public.ats_match_job(p_slug text DEFAULT NULL, p_position text DEFAULT NULL)
RETURNS uuid LANGUAGE sql STABLE SET search_path = public AS $$
WITH s AS (SELECT nullif(lower(btrim(p_slug)), '') AS slug, public.ats_norm_title(p_position) AS pos)
SELECT coalesce(
(SELECT j.id FROM public.ats_jobs j, s WHERE s.slug IS NOT NULL AND j.slug = s.slug AND j.status = 'open' LIMIT 1),
(SELECT j.id FROM public.ats_jobs j, s
WHERE s.pos IS NOT NULL AND j.status = 'open'
AND (public.ats_norm_title(j.title) = s.pos
OR EXISTS (SELECT 1 FROM unnest(j.aliases) AS a(t) WHERE public.ats_norm_title(a.t) = s.pos))
ORDER BY j.is_published DESC, j.opened_at DESC NULLS LAST
LIMIT 1))
$$;

-- 5. Intake used only by the ats-intake edge function (service role).
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
RETURN v_res || jsonb_build_object('duplicate', false, 'job_matched', v_job IS NOT NULL);
END $$;

-- 6. Generate a new connection key (HR admins only). Returns the key once; only its hash is kept.
CREATE OR REPLACE FUNCTION public.ats_rotate_intake_key()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_key text;
BEGIN
IF NOT coalesce(public.hr_is_hr_admin(), false) THEN
RAISE EXCEPTION 'ATS_ADMIN_ONLY' USING HINT = 'Only HR admins can generate the connection key.';
END IF;
v_key := 'atsk_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
UPDATE public.ats_integrations
SET key_hash = encode(sha256(convert_to(v_key, 'UTF8')), 'hex'),
key_preview = right(v_key, 4),
key_created_at = now(),
key_created_by = auth.uid(),
key_created_by_name = public.ats_actor_name(auth.uid()),
last_error = NULL, last_error_at = NULL, updated_at = now()
WHERE id = 'careers_site';
RETURN v_key;
END $$;

-- 7. Connection status for the Settings screen (HR staff); never exposes the key or its hash.
CREATE OR REPLACE FUNCTION public.ats_integration_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT CASE WHEN NOT coalesce(public.hr_is_hr_staff(auth.uid()), false) THEN NULL ELSE (
SELECT jsonb_build_object(
'has_key', i.key_hash IS NOT NULL,
'key_preview', i.key_preview,
'key_created_at', i.key_created_at,
'key_created_by_name', i.key_created_by_name,
'last_seen_at', i.last_seen_at,
'last_error', i.last_error,
'last_error_at', i.last_error_at,
'received_total', (SELECT count(*) FROM public.ats_applications a WHERE a.applied_via = 'careers_form'),
'received_7d', (SELECT count(*) FROM public.ats_applications a WHERE a.applied_via = 'careers_form' AND a.created_at >= now() - interval '7 days'),
'unmatched_active', (SELECT count(*) FROM public.ats_applications a WHERE a.applied_via = 'careers_form' AND a.job_id IS NULL AND a.status IN ('active', 'on_hold')),
'last_received_at', (SELECT max(a.created_at) FROM public.ats_applications a WHERE a.applied_via = 'careers_form'))
FROM public.ats_integrations i WHERE i.id = 'careers_site') END
$$;

REVOKE ALL ON FUNCTION public.ats_norm_title(text), public.ats_match_job(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ats_norm_title(text), public.ats_match_job(text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ats_intake_application(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ats_intake_application(jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.ats_rotate_intake_key(), public.ats_integration_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ats_rotate_intake_key(), public.ats_integration_status() TO authenticated, service_role;