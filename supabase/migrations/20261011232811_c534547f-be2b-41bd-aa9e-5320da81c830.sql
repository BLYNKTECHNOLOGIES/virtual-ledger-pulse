-- ATS foundation, migration 3 of 3: actions (RPCs), list views, storage policies for the private bucket ats-files.
-- Scope: only objects named ats_*, plus 4 storage policies limited to bucket ats-files (the bucket itself is created with the bucket tool).
-- Uploads are limited to resume/document/image file types by extension, because the bucket tool cannot set allowed MIME types.
CREATE OR REPLACE FUNCTION public.ats_find_duplicates(p_email text DEFAULT NULL, p_phone text DEFAULT NULL, p_exclude uuid DEFAULT NULL)
RETURNS TABLE (candidate_id uuid, ref_no text, full_name text, email text, phone text, matched_on text,
application_count bigint, last_applied_at timestamptz, last_status text)
LANGUAGE sql STABLE SET search_path = public AS $$
WITH q AS (SELECT nullif(lower(btrim(p_email)), '') AS e, public.ats_normalize_phone(p_phone) AS p)
SELECT c.id, c.ref_no, c.full_name, c.email, c.phone,
CASE WHEN c.email_norm = q.e AND c.phone_norm = q.p THEN 'email_and_phone'
WHEN c.email_norm = q.e THEN 'email' ELSE 'phone' END,
(SELECT count(*) FROM public.ats_applications a WHERE a.candidate_id = c.id),
(SELECT max(a.applied_at) FROM public.ats_applications a WHERE a.candidate_id = c.id),
(SELECT a.status FROM public.ats_applications a WHERE a.candidate_id = c.id ORDER BY a.applied_at DESC LIMIT 1)
FROM public.ats_candidates c, q
WHERE c.merged_into_id IS NULL AND c.anonymized_at IS NULL
AND (p_exclude IS NULL OR c.id <> p_exclude)
AND ((q.e IS NOT NULL AND c.email_norm = q.e) OR (q.p IS NOT NULL AND c.phone_norm = q.p))
ORDER BY (c.email_norm = q.e AND c.phone_norm = q.p) DESC NULLS LAST, c.last_activity_at DESC
LIMIT 5
$$;
CREATE OR REPLACE FUNCTION public.ats_create_application(
p_candidate jsonb,
p_job_id uuid DEFAULT NULL,
p_source_id uuid DEFAULT NULL,
p_applied_via text DEFAULT 'manual',
p_position_text text DEFAULT NULL,
p_cover_letter text DEFAULT NULL,
p_answers jsonb DEFAULT '{}'::jsonb,
p_existing_candidate_id uuid DEFAULT NULL,
p_applied_at timestamptz DEFAULT NULL,
p_external_ref text DEFAULT NULL,
p_source_detail text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
c jsonb := coalesce(p_candidate, '{}'::jsonb);
v_email text := nullif(lower(btrim(c->>'email')), '');
v_phone text := public.ats_normalize_phone(c->>'phone');
v_name text := nullif(regexp_replace(btrim(coalesce(c->>'full_name', '')), '\s+', ' ', 'g'), '');
v_exp numeric := public.ats_try_numeric(c->>'total_experience_years');
v_cur numeric := public.ats_try_numeric(c->>'current_ctc_monthly');
v_want numeric := public.ats_try_numeric(c->>'expected_ctc_monthly');
v_notice numeric := public.ats_try_numeric(c->>'notice_period_days');
v_consent boolean := coalesce(lower(c->>'consent') IN ('true', 't', '1', 'yes', 'y'), false);
v_keep boolean := coalesce(lower(c->>'keep_for_future') IN ('true', 't', '1', 'yes', 'y'), false);
v_source uuid := coalesce(p_source_id, nullif(c->>'source_id', '')::uuid);
v_detail text := coalesce(nullif(btrim(p_source_detail), ''), nullif(btrim(c->>'source_detail'), ''));
v_by_email uuid; v_by_phone uuid; v_cand uuid; v_app uuid; v_existing uuid;
v_reused boolean := false;
BEGIN
-- Out-of-range numbers from forms or imports are dropped instead of failing the whole application.
IF v_exp < 0 OR v_exp > 60 THEN v_exp := NULL; END IF;
IF v_cur < 0 OR v_cur >= 10000000000 THEN v_cur := NULL; END IF;
IF v_want < 0 OR v_want >= 10000000000 THEN v_want := NULL; END IF;
IF v_notice < 0 OR v_notice > 365 THEN v_notice := NULL; END IF;
IF p_job_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ats_jobs WHERE id = p_job_id) THEN
RAISE EXCEPTION 'ATS_JOB_NOT_FOUND';
END IF;
IF p_existing_candidate_id IS NOT NULL THEN
SELECT id INTO v_cand FROM public.ats_candidates
WHERE id = p_existing_candidate_id AND merged_into_id IS NULL AND anonymized_at IS NULL;
IF v_cand IS NULL THEN RAISE EXCEPTION 'ATS_CANDIDATE_NOT_FOUND'; END IF;
v_reused := true;
ELSE
IF v_email IS NOT NULL THEN
SELECT id INTO v_by_email FROM public.ats_candidates
WHERE email_norm = v_email AND merged_into_id IS NULL AND anonymized_at IS NULL LIMIT 1;
END IF;
IF v_phone IS NOT NULL THEN
SELECT id INTO v_by_phone FROM public.ats_candidates
WHERE phone_norm = v_phone AND merged_into_id IS NULL AND anonymized_at IS NULL LIMIT 1;
END IF;
IF v_by_email IS NOT NULL AND v_by_phone IS NOT NULL AND v_by_email <> v_by_phone THEN
RAISE EXCEPTION 'ATS_AMBIGUOUS_DUPLICATE'
USING DETAIL = json_build_object('by_email', v_by_email, 'by_phone', v_by_phone)::text,
HINT = 'The email belongs to one candidate and the phone to another.';
END IF;
v_cand := coalesce(v_by_email, v_by_phone);
v_reused := v_cand IS NOT NULL;
END IF;
IF v_cand IS NULL THEN
IF v_name IS NULL THEN RAISE EXCEPTION 'ATS_NAME_REQUIRED'; END IF;
INSERT INTO public.ats_candidates (
full_name, email, phone, alt_phone, city, state, current_company, current_title,
total_experience_years, current_ctc_monthly, expected_ctc_monthly, ctc_note, notice_period_days,
shift_preferences, skills, languages, education, linkedin_url, portfolio_url, summary, tags,
source_id, source_detail, referred_by_employee_id, keep_for_future, consent_at, consent_version)
VALUES (
v_name,
nullif(btrim(c->>'email'), ''),
nullif(btrim(c->>'phone'), ''),
nullif(btrim(c->>'alt_phone'), ''),
nullif(btrim(c->>'city'), ''),
nullif(btrim(c->>'state'), ''),
nullif(btrim(c->>'current_company'), ''),
nullif(btrim(c->>'current_title'), ''),
v_exp, v_cur, v_want,
nullif(btrim(c->>'ctc_note'), ''),
round(v_notice)::int,
public.ats_text_array(c->'shift_preferences'),
public.ats_text_array(c->'skills'),
public.ats_text_array(c->'languages'),
nullif(btrim(c->>'education'), ''),
nullif(btrim(c->>'linkedin_url'), ''),
nullif(btrim(c->>'portfolio_url'), ''),
nullif(btrim(c->>'summary'), ''),
public.ats_text_array(c->'tags'),
v_source, v_detail,
nullif(c->>'referred_by_employee_id', '')::uuid,
v_keep,
CASE WHEN v_consent THEN now() END,
nullif(btrim(c->>'consent_version'), ''))
RETURNING id INTO v_cand;
ELSE
-- Existing candidate: only fill empty fields, never overwrite what HR already has.
UPDATE public.ats_candidates x SET
email = coalesce(x.email, nullif(btrim(c->>'email'), '')),
phone = coalesce(x.phone, nullif(btrim(c->>'phone'), '')),
alt_phone = coalesce(x.alt_phone, nullif(btrim(c->>'alt_phone'), ''),
CASE WHEN x.phone_norm IS NOT NULL AND v_phone IS NOT NULL AND v_phone <> x.phone_norm
THEN nullif(btrim(c->>'phone'), '') END),
city = coalesce(x.city, nullif(btrim(c->>'city'), '')),
state = coalesce(x.state, nullif(btrim(c->>'state'), '')),
current_company = coalesce(x.current_company, nullif(btrim(c->>'current_company'), '')),
current_title = coalesce(x.current_title, nullif(btrim(c->>'current_title'), '')),
total_experience_years = coalesce(x.total_experience_years, v_exp),
current_ctc_monthly = coalesce(x.current_ctc_monthly, v_cur),
expected_ctc_monthly = coalesce(x.expected_ctc_monthly, v_want),
notice_period_days = coalesce(x.notice_period_days, round(v_notice)::int),
shift_preferences = CASE WHEN cardinality(x.shift_preferences) = 0 THEN public.ats_text_array(c->'shift_preferences') ELSE x.shift_preferences END,
skills = CASE WHEN cardinality(x.skills) = 0 THEN public.ats_text_array(c->'skills') ELSE x.skills END,
languages = CASE WHEN cardinality(x.languages) = 0 THEN public.ats_text_array(c->'languages') ELSE x.languages END,
education = coalesce(x.education, nullif(btrim(c->>'education'), '')),
linkedin_url = coalesce(x.linkedin_url, nullif(btrim(c->>'linkedin_url'), '')),
portfolio_url = coalesce(x.portfolio_url, nullif(btrim(c->>'portfolio_url'), '')),
source_id = coalesce(x.source_id, v_source),
consent_at = coalesce(x.consent_at, CASE WHEN v_consent THEN now() END),
consent_version = coalesce(x.consent_version, nullif(btrim(c->>'consent_version'), '')),
keep_for_future = x.keep_for_future OR v_keep
WHERE x.id = v_cand;
END IF;
IF p_job_id IS NOT NULL THEN
SELECT id INTO v_existing FROM public.ats_applications WHERE candidate_id = v_cand AND job_id = p_job_id;
ELSE
SELECT id INTO v_existing FROM public.ats_applications WHERE candidate_id = v_cand AND job_id IS NULL;
END IF;
IF v_existing IS NOT NULL THEN
RETURN jsonb_build_object('candidate_id', v_cand, 'application_id', v_existing,
'reused_candidate', v_reused, 'existing_application', true);
END IF;
INSERT INTO public.ats_applications (candidate_id, job_id, source_id, source_detail, applied_via, applied_at,
position_text, cover_letter, answers, external_ref)
VALUES (v_cand, p_job_id,
coalesce(v_source, (SELECT source_id FROM public.ats_candidates WHERE id = v_cand)),
v_detail,
coalesce(nullif(p_applied_via, ''), 'manual'),
coalesce(p_applied_at, now()),
nullif(btrim(p_position_text), ''),
nullif(btrim(p_cover_letter), ''),
coalesce(p_answers, '{}'::jsonb),
nullif(btrim(p_external_ref), ''))
RETURNING id INTO v_app;
RETURN jsonb_build_object('candidate_id', v_cand, 'application_id', v_app,
'reused_candidate', v_reused, 'existing_application', false);
END $$;
CREATE OR REPLACE FUNCTION public.ats_move_stage(p_application_id uuid, p_stage_id uuid, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_status text;
BEGIN
SELECT status INTO v_status FROM public.ats_applications WHERE id = p_application_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'ATS_APPLICATION_NOT_FOUND'; END IF;
IF v_status IN ('rejected', 'withdrawn') THEN
RAISE EXCEPTION 'ATS_APPLICATION_CLOSED' USING HINT = 'Reopen the application before moving it.';
END IF;
IF NOT EXISTS (SELECT 1 FROM public.ats_stages WHERE id = p_stage_id AND is_active) THEN
RAISE EXCEPTION 'ATS_STAGE_NOT_FOUND';
END IF;
PERFORM set_config('ats.transition_note', coalesce(p_note, ''), true);
UPDATE public.ats_applications
SET stage_id = p_stage_id,
reviewed_at = coalesce(reviewed_at, now())
WHERE id = p_application_id;
END $$;
CREATE OR REPLACE FUNCTION public.ats_set_status(p_application_id uuid, p_status text, p_reason_id uuid DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
IF p_status NOT IN ('active', 'on_hold', 'rejected', 'withdrawn') THEN
RAISE EXCEPTION 'ATS_BAD_STATUS' USING HINT = 'Hire a candidate by moving them to the Hired stage.';
END IF;
PERFORM set_config('ats.transition_note', coalesce(p_note, ''), true);
UPDATE public.ats_applications
SET status = p_status,
reject_reason_id = CASE WHEN p_status IN ('rejected', 'withdrawn') THEN p_reason_id END,
status_note = nullif(btrim(coalesce(p_note, '')), ''),
reviewed_at = coalesce(reviewed_at, now())
WHERE id = p_application_id;
IF NOT FOUND THEN RAISE EXCEPTION 'ATS_APPLICATION_NOT_FOUND'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.ats_mark_reviewed(p_application_id uuid)
RETURNS void LANGUAGE sql SET search_path = public AS $$
UPDATE public.ats_applications SET reviewed_at = now() WHERE id = p_application_id AND reviewed_at IS NULL;
$$;
CREATE OR REPLACE FUNCTION public.ats_overview_stats()
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
WITH s AS (SELECT coalesce((SELECT idle_alert_days FROM public.ats_settings LIMIT 1), 3) AS idle_days),
m AS (SELECT (date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata') AS month_start)
SELECT jsonb_build_object(
'open_jobs', (SELECT count(*) FROM public.ats_jobs WHERE status = 'open'),
'open_seats', (SELECT coalesce(sum(openings), 0) FROM public.ats_jobs WHERE status = 'open'),
'draft_jobs', (SELECT count(*) FROM public.ats_jobs WHERE status = 'draft'),
'paused_jobs', (SELECT count(*) FROM public.ats_jobs WHERE status = 'paused'),
'applications_7d', (SELECT count(*) FROM public.ats_applications WHERE applied_at >= now() - interval '7 days'),
'applications_30d', (SELECT count(*) FROM public.ats_applications WHERE applied_at >= now() - interval '30 days'),
'in_pipeline', (SELECT count(*) FROM public.ats_applications WHERE status IN ('active', 'on_hold')),
'unreviewed', (SELECT count(*) FROM public.ats_applications WHERE status = 'active' AND reviewed_at IS NULL),
'idle', (SELECT count(*) FROM public.ats_applications a, s
WHERE a.status = 'active' AND a.stage_entered_at < now() - make_interval(days => s.idle_days)),
'idle_days', (SELECT idle_days FROM s),
'hired_this_month', (SELECT count(*) FROM public.ats_applications a, m WHERE a.status = 'hired' AND a.hired_at >= m.month_start),
'rejected_this_month', (SELECT count(*) FROM public.ats_applications a, m
WHERE a.status = 'rejected' AND a.status_changed_at >= m.month_start),
'stage_counts', (SELECT coalesce(jsonb_agg(jsonb_build_object('stage_id', st.id, 'code', st.code, 'name', st.name,
'sort_order', st.sort_order, 'count', coalesce(x.n, 0))
ORDER BY st.sort_order), '[]'::jsonb)
FROM public.ats_stages st
LEFT JOIN (SELECT stage_id, count(*) AS n FROM public.ats_applications
WHERE status IN ('active', 'on_hold') GROUP BY stage_id) x ON x.stage_id = st.id
WHERE st.is_active),
'source_counts_30d', (SELECT coalesce(jsonb_agg(jsonb_build_object('source_id', y.source_id, 'name', coalesce(src.name, 'Unknown'),
'count', y.n) ORDER BY y.n DESC), '[]'::jsonb)
FROM (SELECT source_id, count(*) AS n FROM public.ats_applications
WHERE applied_at >= now() - interval '30 days' GROUP BY source_id) y
LEFT JOIN public.ats_sources src ON src.id = y.source_id)
)
$$;
CREATE VIEW public.ats_application_overview WITH (security_invoker = true) AS
SELECT a.id AS application_id, a.candidate_id, a.job_id, a.stage_id, a.status, a.applied_at, a.applied_via,
a.source_id, a.source_detail, a.position_text, a.stage_entered_at, a.reviewed_at, a.rating_avg, a.rating_count,
a.reject_reason_id, a.status_note, a.status_changed_at, a.hired_at, a.updated_at,
c.ref_no, c.full_name, c.email, c.phone, c.city, c.current_company, c.current_title, c.total_experience_years,
c.expected_ctc_monthly, c.notice_period_days, c.shift_preferences, c.skills, c.keep_for_future,
c.last_activity_at, c.anonymized_at,
j.title AS job_title, j.job_code, j.status AS job_status, j.department_id,
st.name AS stage_name, st.code AS stage_code, st.kind AS stage_kind, st.sort_order AS stage_order,
src.name AS source_name,
rr.label AS reject_reason_label,
(SELECT count(*) FROM public.ats_applications a2 WHERE a2.candidate_id = a.candidate_id) AS candidate_application_count,
EXISTS (SELECT 1 FROM public.ats_files f WHERE f.candidate_id = a.candidate_id AND f.kind = 'resume') AS has_resume,
floor(extract(epoch FROM (now() - a.stage_entered_at)) / 86400)::int AS days_in_stage
FROM public.ats_applications a
JOIN public.ats_candidates c ON c.id = a.candidate_id
LEFT JOIN public.ats_jobs j ON j.id = a.job_id
JOIN public.ats_stages st ON st.id = a.stage_id
LEFT JOIN public.ats_sources src ON src.id = a.source_id
LEFT JOIN public.ats_reject_reasons rr ON rr.id = a.reject_reason_id
WHERE c.merged_into_id IS NULL;
CREATE VIEW public.ats_job_summary WITH (security_invoker = true) AS
SELECT j.id AS job_id,
count(a.id) AS total_applications,
count(a.id) FILTER (WHERE a.status = 'active') AS active_count,
count(a.id) FILTER (WHERE a.status = 'on_hold') AS on_hold_count,
count(a.id) FILTER (WHERE a.status = 'rejected') AS rejected_count,
count(a.id) FILTER (WHERE a.status = 'withdrawn') AS withdrawn_count,
count(a.id) FILTER (WHERE a.status = 'hired') AS hired_count,
count(a.id) FILTER (WHERE a.status = 'active' AND a.reviewed_at IS NULL) AS unreviewed_count,
count(a.id) FILTER (WHERE a.applied_at >= now() - interval '7 days') AS new_7d,
max(a.applied_at) AS last_applied_at,
(SELECT coalesce(jsonb_object_agg(st.code, x.n), '{}'::jsonb)
FROM (SELECT a3.stage_id, count(*) AS n FROM public.ats_applications a3
WHERE a3.job_id = j.id AND a3.status IN ('active', 'on_hold') GROUP BY a3.stage_id) x
JOIN public.ats_stages st ON st.id = x.stage_id) AS stage_counts
FROM public.ats_jobs j
LEFT JOIN public.ats_applications a ON a.job_id = j.id
GROUP BY j.id;
REVOKE ALL ON TABLE public.ats_application_overview, public.ats_job_summary FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ats_application_overview, public.ats_job_summary TO authenticated;
GRANT ALL ON TABLE public.ats_application_overview, public.ats_job_summary TO service_role;
REVOKE ALL ON FUNCTION
public.ats_find_duplicates(text, text, uuid),
public.ats_create_application(jsonb, uuid, uuid, text, text, text, jsonb, uuid, timestamptz, text, text),
public.ats_move_stage(uuid, uuid, text), public.ats_set_status(uuid, text, uuid, text),
public.ats_mark_reviewed(uuid), public.ats_overview_stats()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
public.ats_find_duplicates(text, text, uuid),
public.ats_create_application(jsonb, uuid, uuid, text, text, text, jsonb, uuid, timestamptz, text, text),
public.ats_move_stage(uuid, uuid, text), public.ats_set_status(uuid, text, uuid, text),
public.ats_mark_reviewed(uuid), public.ats_overview_stats()
TO authenticated, service_role;
CREATE POLICY ats_files_bucket_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'ats-files' AND (SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_files_bucket_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ats-files' AND (SELECT public.hr_is_hr_staff((SELECT auth.uid())))
AND lower(storage.extension(name)) IN ('pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'webp'));
CREATE POLICY ats_files_bucket_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'ats-files' AND (SELECT public.hr_is_hr_staff((SELECT auth.uid()))))
WITH CHECK (bucket_id = 'ats-files' AND (SELECT public.hr_is_hr_staff((SELECT auth.uid())))
AND lower(storage.extension(name)) IN ('pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'webp'));
CREATE POLICY ats_files_bucket_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'ats-files' AND (SELECT public.hr_is_hr_staff((SELECT auth.uid()))));