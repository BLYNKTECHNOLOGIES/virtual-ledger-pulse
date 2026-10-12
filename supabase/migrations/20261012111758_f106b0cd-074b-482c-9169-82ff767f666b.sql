-- ATS imports (Batch 6), migration M8: import candidates from job-portal files (Excel or CSV exported from
-- Indeed, Naukri, Apna, WorkIndia, LinkedIn and others) and from a folder of resumes; keep a record of what each
-- import created; let an HR admin undo a recent import.
-- Scope: only objects named ats_*. Each row goes through the existing ats_create_application, so duplicates (same
-- email or phone) and the "only fill empty fields" rule work exactly as for a candidate added by hand. Imported
-- applications never get an automatic email.

-- 1. Helpers
-- 1a. Text to timestamptz, or NULL when it can't be read
CREATE OR REPLACE FUNCTION public.ats_try_timestamptz(p text)
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN
IF p IS NULL OR btrim(p) = '' THEN RETURN NULL; END IF;
RETURN btrim(p)::timestamptz;
EXCEPTION WHEN others THEN
RETURN NULL;
END $$;

-- 1b. Extra columns from an import file, kept on the application: at most 40, short keys and values, no blanks
CREATE OR REPLACE FUNCTION public.ats_import_answers(p jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
SELECT coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
FROM (
SELECT left(btrim(e.key), 100) AS k, left(btrim(e.value), 1000) AS v
FROM jsonb_each_text(CASE WHEN jsonb_typeof(p) = 'object' THEN p ELSE '{}'::jsonb END) AS e(key, value)
WHERE btrim(e.key) <> '' AND btrim(coalesce(e.value, '')) <> ''
ORDER BY e.key
LIMIT 40) x
$$;

-- 1c. The candidate fields an import may set (anything else in the row is ignored)
CREATE OR REPLACE FUNCTION public.ats_import_candidate(p jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
FROM jsonb_each(CASE WHEN jsonb_typeof(p) = 'object' THEN p ELSE '{}'::jsonb END) AS e(key, value)
WHERE e.key IN ('full_name', 'email', 'phone', 'alt_phone', 'city', 'state', 'current_company', 'current_title',
'total_experience_years', 'current_ctc_monthly', 'expected_ctc_monthly', 'ctc_note', 'notice_period_days',
'skills', 'languages', 'education', 'linkedin_url', 'portfolio_url', 'summary')
AND (jsonb_typeof(e.value) <> 'string' OR btrim(e.value #>> '{}') <> '')
$$;

-- 2. Imports and their rows
CREATE TABLE public.ats_imports (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
kind text NOT NULL CHECK (kind IN ('file', 'resumes')),
source_id uuid REFERENCES public.ats_sources(id) ON DELETE SET NULL,
job_mode text NOT NULL DEFAULT 'one' CHECK (job_mode IN ('one', 'match', 'general')),
job_id uuid REFERENCES public.ats_jobs(id) ON DELETE SET NULL,
file_name text CHECK (file_name IS NULL OR length(file_name) <= 255),
mapping jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(mapping) = 'object' AND length(mapping::text) <= 20000),
status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'undone')),
total_rows integer NOT NULL DEFAULT 0 CHECK (total_rows BETWEEN 0 AND 5000),
created_count integer NOT NULL DEFAULT 0,
added_count integer NOT NULL DEFAULT 0,
existing_count integer NOT NULL DEFAULT 0,
skipped_count integer NOT NULL DEFAULT 0,
error_count integer NOT NULL DEFAULT 0,
created_by uuid,
created_by_name text,
created_at timestamptz NOT NULL DEFAULT now(),
finished_at timestamptz,
undone_at timestamptz,
undone_by_name text,
undo_kept integer
);
CREATE INDEX ats_imports_created_idx ON public.ats_imports (created_at DESC);

-- One row per line of the file (or per resume): what happened to it.
--   created  = new candidate and new application      added    = existing candidate, new application
--   existing = this person had already applied          skipped  = no name, or no email and no phone
--   error    = could not be imported (see error)
CREATE TABLE public.ats_import_rows (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
import_id uuid NOT NULL REFERENCES public.ats_imports(id) ON DELETE CASCADE,
row_no integer NOT NULL CHECK (row_no BETWEEN 1 AND 100000),
outcome text NOT NULL CHECK (outcome IN ('created', 'added', 'existing', 'skipped', 'error')),
error text CHECK (error IS NULL OR length(error) <= 60),
candidate_id uuid REFERENCES public.ats_candidates(id) ON DELETE SET NULL,
application_id uuid REFERENCES public.ats_applications(id) ON DELETE SET NULL,
new_candidate boolean NOT NULL DEFAULT false,
new_application boolean NOT NULL DEFAULT false,
created_at timestamptz NOT NULL DEFAULT now(),
CONSTRAINT ats_import_rows_row_uq UNIQUE (import_id, row_no)
);
CREATE INDEX ats_import_rows_candidate_idx ON public.ats_import_rows (candidate_id);
CREATE INDEX ats_import_rows_application_idx ON public.ats_import_rows (application_id);

-- 3. Actions (HR staff)
-- 3a. Before importing: who in the file is already in the ATS, and who already applied for the target job.
--     p: { job_mode: "one" | "match" | "general", job_id?, rows: [{ row_no, email, phone, position_text }] } (max 1000)
CREATE OR REPLACE FUNCTION public.ats_import_check(p jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
v_mode text := coalesce(nullif(p->>'job_mode', ''), 'one');
v_job uuid := nullif(p->>'job_id', '')::uuid;
v_out jsonb;
BEGIN
IF NOT coalesce(public.hr_is_hr_staff(auth.uid()), false) THEN RAISE EXCEPTION 'ATS_FORBIDDEN'; END IF;
IF jsonb_typeof(p->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'rows') > 1000 THEN
RAISE EXCEPTION 'ATS_IMPORT_INVALID' USING DETAIL = 'rows';
END IF;
IF v_mode NOT IN ('one', 'match', 'general') THEN RAISE EXCEPTION 'ATS_IMPORT_INVALID' USING DETAIL = 'job_mode'; END IF;
WITH r AS (
SELECT (x->>'row_no')::integer AS row_no,
nullif(lower(btrim(x->>'email')), '') AS e,
public.ats_normalize_phone(x->>'phone') AS ph,
CASE v_mode WHEN 'one' THEN v_job WHEN 'match' THEN public.ats_match_job(NULL, x->>'position_text') END AS job
FROM jsonb_array_elements(p->'rows') AS t(x)),
m AS (
SELECT r.*,
(SELECT c.id FROM public.ats_candidates c WHERE r.e IS NOT NULL AND c.email_norm = r.e
AND c.merged_into_id IS NULL AND c.anonymized_at IS NULL LIMIT 1) AS by_e,
(SELECT c.id FROM public.ats_candidates c WHERE r.ph IS NOT NULL AND c.phone_norm = r.ph
AND c.merged_into_id IS NULL AND c.anonymized_at IS NULL LIMIT 1) AS by_p
FROM r)
SELECT coalesce(jsonb_agg(jsonb_build_object(
'row_no', m.row_no,
'candidate_id', coalesce(m.by_e, m.by_p),
'full_name', c.full_name,
'ref_no', c.ref_no,
'conflict', m.by_e IS NOT NULL AND m.by_p IS NOT NULL AND m.by_e <> m.by_p,
'job_id', m.job,
'applied', coalesce(m.by_e, m.by_p) IS NOT NULL AND EXISTS (
SELECT 1 FROM public.ats_applications a
WHERE a.candidate_id = coalesce(m.by_e, m.by_p) AND a.job_id IS NOT DISTINCT FROM m.job))
ORDER BY m.row_no), '[]'::jsonb)
INTO v_out
FROM m LEFT JOIN public.ats_candidates c ON c.id = coalesce(m.by_e, m.by_p);
RETURN v_out;
END $$;

-- 3b. Start an import.
--     p: { kind: "file" | "resumes", source_id?, job_mode, job_id? (needed for "one"), file_name?, mapping?, total_rows }
CREATE OR REPLACE FUNCTION public.ats_import_begin(p jsonb)
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
v_kind text := p->>'kind';
v_mode text := coalesce(nullif(p->>'job_mode', ''), 'one');
v_job uuid := nullif(p->>'job_id', '')::uuid;
v_source uuid := nullif(p->>'source_id', '')::uuid;
v_total integer := coalesce(nullif(p->>'total_rows', '')::integer, 0);
v_id uuid;
BEGIN
IF NOT coalesce(public.hr_is_hr_staff(auth.uid()), false) THEN RAISE EXCEPTION 'ATS_FORBIDDEN'; END IF;
IF v_kind IS NULL OR v_kind NOT IN ('file', 'resumes') THEN RAISE EXCEPTION 'ATS_IMPORT_INVALID' USING DETAIL = 'kind'; END IF;
IF v_mode NOT IN ('one', 'match', 'general') THEN RAISE EXCEPTION 'ATS_IMPORT_INVALID' USING DETAIL = 'job_mode'; END IF;
IF v_mode = 'one' THEN
IF v_job IS NULL OR NOT EXISTS (SELECT 1 FROM public.ats_jobs WHERE id = v_job) THEN RAISE EXCEPTION 'ATS_JOB_NOT_FOUND'; END IF;
ELSE
v_job := NULL;
END IF;
IF v_source IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ats_sources WHERE id = v_source) THEN
RAISE EXCEPTION 'ATS_IMPORT_INVALID' USING DETAIL = 'source';
END IF;
IF v_total < 1 OR v_total > 5000 THEN RAISE EXCEPTION 'ATS_IMPORT_INVALID' USING DETAIL = 'total_rows'; END IF;
INSERT INTO public.ats_imports (kind, source_id, job_mode, job_id, file_name, mapping, total_rows, created_by, created_by_name)
VALUES (v_kind, v_source, v_mode, v_job, left(nullif(btrim(p->>'file_name'), ''), 255),
CASE WHEN jsonb_typeof(p->'mapping') = 'object' AND length((p->'mapping')::text) <= 20000 THEN p->'mapping' ELSE '{}'::jsonb END,
v_total, auth.uid(), public.ats_actor_name(auth.uid()))
RETURNING id INTO v_id;
RETURN v_id;
END $$;

-- 3c. Import up to 200 rows of a running import. Sending a row again (for example after a network error) returns
--     what happened the first time instead of importing it twice.
--     p_rows: [{ row_no, candidate: { full_name, email, phone, … }, position_text?, applied_at?, external_ref?, answers? }]
CREATE OR REPLACE FUNCTION public.ats_import_add_rows(p_import_id uuid, p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
imp public.ats_imports;
r jsonb;
v_no integer;
v_c jsonb;
v_email text;
v_phone text;
v_job uuid;
v_at timestamptz;
v_res jsonb;
v_prev public.ats_import_rows;
v_outcome text; v_error text; v_cand uuid; v_app uuid; v_newc boolean; v_newa boolean;
v_detail text;
v_out jsonb := '[]'::jsonb;
n_created integer := 0; n_added integer := 0; n_existing integer := 0; n_skipped integer := 0; n_error integer := 0;
BEGIN
IF NOT coalesce(public.hr_is_hr_staff(auth.uid()), false) THEN RAISE EXCEPTION 'ATS_FORBIDDEN'; END IF;
SELECT * INTO imp FROM public.ats_imports WHERE id = p_import_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'ATS_IMPORT_NOT_FOUND'; END IF;
IF imp.status <> 'running' THEN RAISE EXCEPTION 'ATS_IMPORT_CLOSED'; END IF;
IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) > 200 THEN
RAISE EXCEPTION 'ATS_IMPORT_INVALID' USING DETAIL = 'rows';
END IF;
IF imp.job_mode = 'one' AND imp.job_id IS NULL THEN RAISE EXCEPTION 'ATS_JOB_NOT_FOUND'; END IF;
v_detail := left('Imported from ' || coalesce(imp.file_name, CASE imp.kind WHEN 'resumes' THEN 'resumes' ELSE 'a file' END), 120);

FOR r IN SELECT x FROM jsonb_array_elements(p_rows) AS t(x) LOOP
v_no := (r->>'row_no')::integer;
IF v_no IS NULL OR v_no < 1 OR v_no > 100000 THEN RAISE EXCEPTION 'ATS_IMPORT_INVALID' USING DETAIL = 'row_no'; END IF;

SELECT * INTO v_prev FROM public.ats_import_rows WHERE import_id = imp.id AND row_no = v_no;
IF FOUND THEN
v_out := v_out || jsonb_build_array(jsonb_build_object('row_no', v_no, 'outcome', v_prev.outcome, 'error', v_prev.error,
'candidate_id', v_prev.candidate_id, 'application_id', v_prev.application_id, 'repeat', true));
CONTINUE;
END IF;

v_outcome := NULL; v_error := NULL; v_cand := NULL; v_app := NULL; v_newc := false; v_newa := false;
v_c := public.ats_import_candidate(r->'candidate');
-- An unusable email or phone ("N/A", "-") is dropped instead of being saved and used to match people.
v_email := nullif(lower(btrim(v_c->>'email')), '');
IF v_email IS NOT NULL AND (v_email !~ '^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$' OR length(v_email) > 254) THEN
v_email := NULL;
END IF;
v_c := CASE WHEN v_email IS NULL THEN v_c - 'email' ELSE jsonb_set(v_c, '{email}', to_jsonb(v_email)) END;
v_phone := public.ats_normalize_phone(v_c->>'phone');
IF v_phone IS NULL OR length(v_c->>'phone') > 32 THEN v_phone := NULL; v_c := v_c - 'phone'; END IF;
IF public.ats_normalize_phone(v_c->>'alt_phone') IS NULL OR length(v_c->>'alt_phone') > 32 THEN v_c := v_c - 'alt_phone'; END IF;
IF length(btrim(coalesce(v_c->>'full_name', ''))) > 120 THEN
v_c := jsonb_set(v_c, '{full_name}', to_jsonb(left(btrim(v_c->>'full_name'), 120)));
END IF;

IF v_email IS NULL AND v_phone IS NULL THEN
v_outcome := 'skipped';
v_error := 'no_contact';
ELSE
v_job := CASE imp.job_mode WHEN 'one' THEN imp.job_id WHEN 'match' THEN public.ats_match_job(NULL, r->>'position_text') END;
v_at := public.ats_try_timestamptz(r->>'applied_at');
IF v_at IS NOT NULL AND (v_at > now() OR v_at < now() - interval '5 years') THEN v_at := NULL; END IF;
BEGIN
v_res := public.ats_create_application(v_c, v_job, imp.source_id, 'import',
left(nullif(btrim(r->>'position_text'), ''), 200), NULL, public.ats_import_answers(r->'answers'), NULL,
v_at, left(nullif(btrim(r->>'external_ref'), ''), 120), v_detail);
v_cand := (v_res->>'candidate_id')::uuid;
v_app := (v_res->>'application_id')::uuid;
v_newc := NOT coalesce((v_res->>'reused_candidate')::boolean, false);
v_newa := NOT coalesce((v_res->>'existing_application')::boolean, false);
v_outcome := CASE WHEN v_newc THEN 'created' WHEN v_newa THEN 'added' ELSE 'existing' END;
EXCEPTION WHEN others THEN
v_outcome := CASE WHEN SQLERRM LIKE '%ATS_NAME_REQUIRED%' THEN 'skipped' ELSE 'error' END;
v_error := CASE
WHEN SQLERRM LIKE '%ATS_NAME_REQUIRED%' THEN 'no_name'
WHEN SQLERRM LIKE '%ATS_AMBIGUOUS_DUPLICATE%' THEN 'ambiguous'
WHEN SQLERRM LIKE '%ATS_JOB_NOT_FOUND%' THEN 'job_not_found'
WHEN SQLSTATE = '23505' THEN 'duplicate'
WHEN SQLSTATE IN ('23514', '22001', '22003', '22007', '22008', '22P02') THEN 'invalid'
WHEN SQLSTATE = '42501' THEN 'forbidden'
ELSE 'failed' END;
END;
END IF;

INSERT INTO public.ats_import_rows (import_id, row_no, outcome, error, candidate_id, application_id, new_candidate, new_application)
VALUES (imp.id, v_no, v_outcome, v_error, v_cand, v_app, v_newc, v_newa);
CASE v_outcome
WHEN 'created' THEN n_created := n_created + 1;
WHEN 'added' THEN n_added := n_added + 1;
WHEN 'existing' THEN n_existing := n_existing + 1;
WHEN 'skipped' THEN n_skipped := n_skipped + 1;
ELSE n_error := n_error + 1;
END CASE;
v_out := v_out || jsonb_build_array(jsonb_build_object('row_no', v_no, 'outcome', v_outcome, 'error', v_error,
'candidate_id', v_cand, 'application_id', v_app));
END LOOP;

UPDATE public.ats_imports SET
created_count = created_count + n_created, added_count = added_count + n_added, existing_count = existing_count + n_existing,
skipped_count = skipped_count + n_skipped, error_count = error_count + n_error
WHERE id = imp.id;
RETURN jsonb_build_object('results', v_out);
END $$;

-- 3d. Finish an import (the counts are already kept up to date)
CREATE OR REPLACE FUNCTION public.ats_import_finish(p_import_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE imp public.ats_imports;
BEGIN
IF NOT coalesce(public.hr_is_hr_staff(auth.uid()), false) THEN RAISE EXCEPTION 'ATS_FORBIDDEN'; END IF;
UPDATE public.ats_imports SET status = 'done', finished_at = now()
WHERE id = p_import_id AND status = 'running'
RETURNING * INTO imp;
IF NOT FOUND THEN
SELECT * INTO imp FROM public.ats_imports WHERE id = p_import_id;
IF NOT FOUND THEN RAISE EXCEPTION 'ATS_IMPORT_NOT_FOUND'; END IF;
END IF;
RETURN jsonb_build_object('id', imp.id, 'status', imp.status, 'created', imp.created_count, 'added', imp.added_count,
'existing', imp.existing_count, 'skipped', imp.skipped_count, 'errors', imp.error_count);
END $$;

-- 3e. Undo a recent import (HR admins, within 7 days). Removes the applications it created and the candidates it
--     created, except anything someone has worked on since the import (moved, rejected, noted, rated, emailed,
--     interviewed, edited, given another application). Opening a candidate does not count as work.
--     Returns the stored files to remove from the ats-files bucket.
CREATE OR REPLACE FUNCTION public.ats_import_undo(p_import_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
imp public.ats_imports;
v_end timestamptz;
r record;
v_paths text[] := '{}';
n_apps integer := 0; n_cands integer := 0; n_kept integer := 0;
BEGIN
IF NOT coalesce(public.hr_is_hr_admin(), false) THEN RAISE EXCEPTION 'ATS_UNDO_ADMIN_ONLY'; END IF;
SELECT * INTO imp FROM public.ats_imports WHERE id = p_import_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'ATS_IMPORT_NOT_FOUND'; END IF;
IF imp.status = 'undone' THEN RAISE EXCEPTION 'ATS_IMPORT_CLOSED'; END IF;
IF imp.created_at < now() - interval '7 days' THEN RAISE EXCEPTION 'ATS_IMPORT_TOO_OLD'; END IF;
-- The import "window": anything recorded up to the end of the import was done by the import itself.
v_end := coalesce(imp.finished_at, (SELECT max(created_at) FROM public.ats_import_rows WHERE import_id = imp.id), imp.created_at);

FOR r IN
SELECT DISTINCT ir.application_id AS id FROM public.ats_import_rows ir
JOIN public.ats_applications a ON a.id = ir.application_id
WHERE ir.import_id = imp.id AND ir.new_application
LOOP
IF EXISTS (SELECT 1 FROM public.ats_events e WHERE e.application_id = r.id
AND e.created_at > v_end AND e.created_at < now() AND e.event_type <> 'reviewed') THEN
n_kept := n_kept + 1;
ELSE
SELECT v_paths || coalesce(array_agg(f.storage_path), '{}') INTO v_paths
FROM public.ats_files f WHERE f.application_id = r.id AND f.created_at <= v_end;
DELETE FROM public.ats_files f WHERE f.application_id = r.id AND f.created_at <= v_end;
DELETE FROM public.ats_applications WHERE id = r.id;
n_apps := n_apps + 1;
END IF;
END LOOP;

FOR r IN
SELECT DISTINCT ir.candidate_id AS id FROM public.ats_import_rows ir
JOIN public.ats_candidates c ON c.id = ir.candidate_id
WHERE ir.import_id = imp.id AND ir.new_candidate
LOOP
IF EXISTS (SELECT 1 FROM public.ats_applications a WHERE a.candidate_id = r.id)
OR EXISTS (SELECT 1 FROM public.ats_events e WHERE e.candidate_id = r.id
AND e.created_at > v_end AND e.created_at < now() AND e.event_type <> 'reviewed') THEN
n_kept := n_kept + 1;
ELSE
SELECT v_paths || coalesce(array_agg(f.storage_path), '{}') INTO v_paths
FROM public.ats_files f WHERE f.candidate_id = r.id;
DELETE FROM public.ats_candidates WHERE id = r.id;
n_cands := n_cands + 1;
END IF;
END LOOP;

UPDATE public.ats_imports SET status = 'undone', undone_at = now(), undone_by_name = public.ats_actor_name(auth.uid()),
undo_kept = n_kept, finished_at = coalesce(finished_at, v_end)
WHERE id = imp.id;
RETURN jsonb_build_object('deleted_applications', n_apps, 'deleted_candidates', n_cands, 'kept', n_kept,
'storage_paths', to_jsonb(v_paths));
END $$;

-- 4. Access: HR staff see imports and run them through the actions above; nobody deletes import records.
ALTER TABLE public.ats_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ats_import_rows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ats_imports, public.ats_import_rows FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ats_imports TO authenticated;
GRANT SELECT, INSERT ON public.ats_import_rows TO authenticated;
GRANT ALL ON TABLE public.ats_imports, public.ats_import_rows TO service_role;
CREATE POLICY ats_imports_select ON public.ats_imports FOR SELECT TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_imports_insert ON public.ats_imports FOR INSERT TO authenticated
WITH CHECK ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_imports_update ON public.ats_imports FOR UPDATE TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid())))) WITH CHECK ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_import_rows_select ON public.ats_import_rows FOR SELECT TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_import_rows_insert ON public.ats_import_rows FOR INSERT TO authenticated
WITH CHECK ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
REVOKE ALL ON FUNCTION public.ats_try_timestamptz(text), public.ats_import_answers(jsonb), public.ats_import_candidate(jsonb),
public.ats_import_check(jsonb), public.ats_import_begin(jsonb), public.ats_import_add_rows(uuid, jsonb),
public.ats_import_finish(uuid), public.ats_import_undo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ats_try_timestamptz(text), public.ats_import_answers(jsonb), public.ats_import_candidate(jsonb),
public.ats_import_check(jsonb), public.ats_import_begin(jsonb), public.ats_import_add_rows(uuid, jsonb),
public.ats_import_finish(uuid), public.ats_import_undo(uuid) TO authenticated, service_role;