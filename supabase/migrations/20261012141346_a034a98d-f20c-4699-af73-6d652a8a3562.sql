-- ATS fixes (Batch 8), migration M10. Only objects named ats_*. No new tables or columns.
-- 1. Careers applications are never lost when the email matches one candidate and the phone another,
--    and a repeat application is recorded on the timeline instead of being dropped.
-- 2. Deleting a job keeps the timeline of candidates who were moved to another job.
-- 3. A custom stage that still holds open candidates can't be turned off (they would vanish from the board).
-- 4. Editing or deleting a note updates its entry in the activity history.
-- 5. Undo import: a candidate someone worked on keeps the application it came with; the import's own
--    resume attachments don't count as "worked on"; "kept" counts applications once. Import rows without
--    a name are skipped, as the check screen says.
-- 6. Interview invites go to work email addresses only.
-- 7. Turning candidate email back on drops automatic emails queued more than an hour earlier.
-- 8. A new careers connection key clears "last received", so the status waits for the new key.

-- 1. Careers intake
CREATE OR REPLACE FUNCTION public.ats_intake_application(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
v_ref text := nullif(btrim(p->>'external_ref'), '');
v_app uuid; v_cand uuid; v_job uuid; v_source uuid; v_res jsonb;
v_detail text; v_by_email uuid; v_by_phone uuid; v_other_ref text;
v_position text := nullif(btrim(p->>'position_text'), '');
v_letter text := nullif(btrim(p->>'cover_letter'), '');
v_applied timestamptz := coalesce(nullif(p->>'applied_at', '')::timestamptz, now());
BEGIN
IF v_ref IS NULL THEN RAISE EXCEPTION 'ATS_INTAKE_REF_REQUIRED'; END IF;
PERFORM set_config('ats.actor_name', 'Careers page', true);
SELECT a.id, a.candidate_id INTO v_app, v_cand FROM public.ats_applications a
WHERE a.applied_via = 'careers_form' AND a.external_ref = v_ref;
IF v_app IS NULL THEN
-- The same website reference already recorded as a repeat application.
SELECT e.application_id, e.candidate_id INTO v_app, v_cand FROM public.ats_events e
WHERE e.event_type = 'applied_again' AND e.data->>'external_ref' = v_ref
ORDER BY e.id LIMIT 1;
END IF;
IF v_cand IS NOT NULL THEN
RETURN jsonb_build_object('candidate_id', v_cand, 'application_id', v_app,
'reused_candidate', true, 'existing_application', true, 'duplicate', true, 'job_matched', NULL);
END IF;
v_job := public.ats_match_job(p->>'job_slug', p->>'position_text');
SELECT id INTO v_source FROM public.ats_sources WHERE code = 'careers';
BEGIN
v_res := public.ats_create_application(
coalesce(p->'candidate', '{}'::jsonb), v_job, v_source, 'careers_form', v_position, v_letter,
coalesce(p->'answers', '{}'::jsonb), NULL, v_applied, v_ref, nullif(btrim(p->>'source_detail'), ''));
EXCEPTION WHEN raise_exception THEN
IF SQLERRM <> 'ATS_AMBIGUOUS_DUPLICATE' THEN RAISE; END IF;
-- The email belongs to one candidate and the phone to another: the email wins.
GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
v_by_email := (v_detail::jsonb->>'by_email')::uuid;
v_by_phone := (v_detail::jsonb->>'by_phone')::uuid;
v_res := public.ats_create_application(
coalesce(p->'candidate', '{}'::jsonb), v_job, v_source, 'careers_form', v_position, v_letter,
coalesce(p->'answers', '{}'::jsonb), v_by_email, v_applied, v_ref, nullif(btrim(p->>'source_detail'), ''));
SELECT ref_no INTO v_other_ref FROM public.ats_candidates WHERE id = v_by_phone;
INSERT INTO public.ats_events (candidate_id, application_id, job_id, event_type, summary, data, actor_name)
VALUES (v_by_email, (v_res->>'application_id')::uuid, v_job, 'possible_duplicate',
'The phone number on this application also belongs to ' || coalesce(v_other_ref, 'another candidate')
|| '. Check whether they are the same person.',
jsonb_build_object('other_candidate_id', v_by_phone, 'other_ref', v_other_ref, 'external_ref', v_ref),
'Careers page');
END;
IF coalesce((v_res->>'existing_application')::boolean, false) THEN
INSERT INTO public.ats_events (candidate_id, application_id, job_id, event_type, summary, data, actor_name)
VALUES ((v_res->>'candidate_id')::uuid, (v_res->>'application_id')::uuid, v_job, 'applied_again',
'Applied again on the careers page' || coalesce(' for ' || v_position, ''),
jsonb_build_object('external_ref', v_ref, 'position_text', v_position, 'cover_letter', left(v_letter, 5000),
'answers', coalesce(p->'answers', '{}'::jsonb), 'applied_at', v_applied),
'Careers page');
ELSE
BEGIN
PERFORM public.ats_queue_acknowledgement((v_res->>'application_id')::uuid);
EXCEPTION WHEN others THEN
RAISE WARNING 'ATS acknowledgement not queued (%)', SQLSTATE;
END;
END IF;
RETURN v_res || jsonb_build_object('duplicate', false, 'job_matched', v_job IS NOT NULL);
END $$;

-- 2. Deleting a job: job-level history goes with it; candidates' history stays (without the job link).
CREATE OR REPLACE FUNCTION public.ats_jobs_before_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
UPDATE public.ats_events SET job_id = NULL
WHERE job_id = OLD.id AND (application_id IS NOT NULL OR candidate_id IS NOT NULL);
RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS ats_jobs_before_delete_trg ON public.ats_jobs;
CREATE TRIGGER ats_jobs_before_delete_trg BEFORE DELETE ON public.ats_jobs
FOR EACH ROW EXECUTE FUNCTION public.ats_jobs_before_delete();

-- 3. Stages: built-in stages stay on; a custom stage with open candidates can't be turned off.
CREATE OR REPLACE FUNCTION public.ats_stages_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
IF TG_OP = 'DELETE' THEN
IF OLD.is_system THEN RAISE EXCEPTION 'ATS_SYSTEM_STAGE_LOCKED' USING HINT = 'Built-in stages can be renamed but not deleted.'; END IF;
RETURN OLD;
END IF;
IF TG_OP = 'INSERT' THEN
NEW.is_system := false;
NEW.kind := 'custom';
IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
NEW.code := coalesce(public.ats_slugify(NEW.name), 'stage') || '-' || substr(md5(gen_random_uuid()::text), 1, 4);
END IF;
ELSE
NEW.code := OLD.code;
NEW.kind := OLD.kind;
NEW.is_system := OLD.is_system;
IF OLD.is_system THEN NEW.is_active := true; END IF;
IF OLD.is_active AND NOT NEW.is_active AND EXISTS (
SELECT 1 FROM public.ats_applications a WHERE a.stage_id = OLD.id AND a.status IN ('active', 'on_hold')) THEN
RAISE EXCEPTION 'ATS_STAGE_HAS_CANDIDATES' USING HINT = 'Move the candidates out of this stage before turning it off.';
END IF;
END IF;
NEW.name := btrim(NEW.name);
RETURN NEW;
END $$;

-- 4. Notes: the activity entry follows the note.
CREATE OR REPLACE FUNCTION public.ats_notes_after_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
IF TG_OP = 'UPDATE' THEN
IF NEW.body IS DISTINCT FROM OLD.body THEN
UPDATE public.ats_events SET summary = left(NEW.body, 140)
WHERE candidate_id = NEW.candidate_id AND event_type = 'note_added' AND data->>'note_id' = NEW.id::text;
END IF;
ELSE
UPDATE public.ats_events SET summary = 'Note deleted', data = data || jsonb_build_object('deleted', true)
WHERE candidate_id = OLD.candidate_id AND event_type = 'note_added' AND data->>'note_id' = OLD.id::text;
END IF;
RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS ats_notes_after_change_trg ON public.ats_notes;
CREATE TRIGGER ats_notes_after_change_trg AFTER UPDATE OR DELETE ON public.ats_notes
FOR EACH ROW EXECUTE FUNCTION public.ats_notes_after_change();

-- 5. Undo import
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
SELECT DISTINCT ir.application_id AS id, a.candidate_id,
bool_or(ir.new_candidate) OVER (PARTITION BY a.candidate_id) AS new_cand
FROM public.ats_import_rows ir
JOIN public.ats_applications a ON a.id = ir.application_id
WHERE ir.import_id = imp.id AND ir.new_application
LOOP
-- Worked on since the import: any event on this application after the import (its own resume
-- attachments excepted), or, for a candidate this import created, any event on the candidate.
IF EXISTS (SELECT 1 FROM public.ats_events e
WHERE (e.application_id = r.id OR (r.new_cand AND e.candidate_id = r.candidate_id AND e.application_id IS NULL))
AND e.created_at > v_end AND e.created_at < now()
AND NOT (e.event_type = 'file_added' AND e.data->>'source' = 'import')) THEN
n_kept := n_kept + 1;
ELSE
SELECT v_paths || coalesce(array_agg(f.storage_path), '{}') INTO v_paths
FROM public.ats_files f WHERE f.application_id = r.id AND (f.created_at <= v_end OR f.source = 'import');
DELETE FROM public.ats_files f WHERE f.application_id = r.id AND (f.created_at <= v_end OR f.source = 'import');
DELETE FROM public.ats_applications WHERE id = r.id;
n_apps := n_apps + 1;
END IF;
END LOOP;

FOR r IN
SELECT DISTINCT ir.candidate_id AS id FROM public.ats_import_rows ir
JOIN public.ats_candidates c ON c.id = ir.candidate_id
WHERE ir.import_id = imp.id AND ir.new_candidate
LOOP
IF NOT EXISTS (SELECT 1 FROM public.ats_applications a WHERE a.candidate_id = r.id) THEN
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

-- 5b. Import rows without a name are skipped (they used to be added to a matching candidate).
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

-- Rows without a name are skipped, as the check screen says, even when they match someone.
IF btrim(coalesce(v_c->>'full_name', '')) = '' THEN
v_outcome := 'skipped';
v_error := 'no_name';
ELSIF v_email IS NULL AND v_phone IS NULL THEN
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

-- 6. Interviewers: work email only (an employee's main email may be personal).
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
(SELECT lower(x.v) FROM (SELECT btrim(w.work_email) AS v) x
WHERE x.v ~ '^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$' AND length(x.v) <= 254)::text,
e.user_id,
coalesce(e.is_active, false)
FROM public.hr_employees e
LEFT JOIN LATERAL (
SELECT wi.work_email FROM public.hr_employee_work_info wi WHERE wi.employee_id = e.id
ORDER BY wi.updated_at DESC NULLS LAST LIMIT 1) w ON true
WHERE e.id = ANY (coalesce(p_ids, '{}'::uuid[]));
END $$;

-- 7. Turning candidate email back on: drop stale automatic emails (acknowledgements, reminders).
CREATE OR REPLACE FUNCTION public.ats_settings_after_mail_on()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
IF NEW.mail_enabled AND NOT coalesce(OLD.mail_enabled, false) THEN
DELETE FROM public.ats_messages m
WHERE m.direction = 'outbound' AND m.status = 'queued' AND m.is_automatic
AND m.created_at < now() - interval '1 hour';
END IF;
RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS ats_settings_after_mail_on_trg ON public.ats_settings;
CREATE TRIGGER ats_settings_after_mail_on_trg AFTER UPDATE OF mail_enabled ON public.ats_settings
FOR EACH ROW EXECUTE FUNCTION public.ats_settings_after_mail_on();

-- 8. New connection key: wait for the first application sent with it.
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
last_seen_at = NULL,
last_error = NULL, last_error_at = NULL, updated_at = now()
WHERE id = 'careers_site';
RETURN v_key;
END $$;

REVOKE ALL ON FUNCTION public.ats_jobs_before_delete(), public.ats_notes_after_change(), public.ats_settings_after_mail_on()
FROM PUBLIC, anon, authenticated;