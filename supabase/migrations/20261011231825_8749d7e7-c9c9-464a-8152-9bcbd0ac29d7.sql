-- ATS foundation, migration 1 of 3: schema, starting data, grants and row-level security.
-- Scope: only objects named ats_* (plus two rows in supabase_migrations.schema_migrations, see step 0).

-- 0. ATS tables were created directly in the database earlier on 2026-10-12, outside this repo's
--    migration history. They are empty. Remove them (no CASCADE, so this stops if anything else
--    depends on them) and the two history rows of those out-of-band migrations; everything is recreated below.
DROP TABLE IF EXISTS public.ats_settings, public.ats_sources, public.ats_stages, public.ats_reject_reasons,
public.ats_jobs, public.ats_candidates, public.ats_applications, public.ats_files, public.ats_notes,
public.ats_ratings, public.ats_events;
DROP SEQUENCE IF EXISTS public.ats_candidate_ref_seq, public.ats_job_code_seq;
DROP FUNCTION IF EXISTS
public.ats_stages_guard(), public.ats_sources_before_write(), public.ats_reject_reasons_before_write(),
public.ats_settings_before_update(), public.ats_jobs_before_write(), public.ats_jobs_after_write(),
public.ats_candidates_before_write(), public.ats_candidates_after_write(),
public.ats_applications_before_write(), public.ats_applications_after_write(),
public.ats_files_before_write(), public.ats_files_after_write(),
public.ats_notes_before_write(), public.ats_notes_after_insert(),
public.ats_ratings_before_write(), public.ats_ratings_after_write(),
public.ats_touch_updated_at(), public.ats_normalize_phone(text), public.ats_slugify(text), public.ats_try_numeric(text),
public.ats_text_array(jsonb), public.ats_actor_name(uuid);
DO $cleanup$
BEGIN
DELETE FROM supabase_migrations.schema_migrations
WHERE version IN ('20261011225009', '20261011225607')
AND name IN ('ats_1a_foundation_tables', 'ats_1b_foundation_triggers');
EXCEPTION WHEN insufficient_privilege OR undefined_table OR invalid_schema_name THEN
RAISE NOTICE 'ATS: history cleanup skipped (%)', SQLERRM;
END $cleanup$;

-- 1. Helper functions
CREATE OR REPLACE FUNCTION public.ats_normalize_phone(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
SELECT CASE
WHEN d IS NULL OR length(d) < 8 THEN NULL
WHEN length(d) = 12 AND left(d, 2) = '91' THEN right(d, 10)
WHEN length(d) = 11 AND left(d, 1) = '0' THEN right(d, 10)
ELSE d
END
FROM (SELECT nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '') AS d) s
$$;
CREATE OR REPLACE FUNCTION public.ats_slugify(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
SELECT nullif(btrim(left(btrim(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '-', 'g'), '-'), 60), '-'), '')
$$;
CREATE OR REPLACE FUNCTION public.ats_try_numeric(p text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
IF p IS NULL OR btrim(p) = '' THEN RETURN NULL; END IF;
RETURN replace(btrim(p), ',', '')::numeric;
EXCEPTION WHEN others THEN
RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.ats_text_array(p jsonb)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
SELECT CASE WHEN jsonb_typeof(p) = 'array'
THEN coalesce(ARRAY(SELECT btrim(x) FROM jsonb_array_elements_text(p) AS t(x) WHERE btrim(x) <> ''), '{}'::text[])
ELSE '{}'::text[] END
$$;
CREATE OR REPLACE FUNCTION public.ats_actor_name(p_uid uuid DEFAULT auth.uid())
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
SELECT CASE
WHEN p_uid IS NULL THEN coalesce(nullif(current_setting('ats.actor_name', true), ''), 'System')
WHEN auth.uid() IS NOT NULL AND p_uid <> auth.uid() AND NOT coalesce(public.hr_is_hr_staff(auth.uid()), false) THEN 'Unknown user'
ELSE coalesce(
(SELECT coalesce(nullif(btrim(concat_ws(' ', u.first_name, u.last_name)), ''), u.username, u.email)
FROM public.users u WHERE u.id = p_uid),
'Unknown user')
END
$$;
CREATE OR REPLACE FUNCTION public.ats_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
NEW.updated_at := now();
RETURN NEW;
END $$;

-- 2. Counters, tables and indexes
CREATE SEQUENCE IF NOT EXISTS public.ats_candidate_ref_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS public.ats_job_code_seq START 1;
CREATE TABLE public.ats_settings (
id boolean PRIMARY KEY DEFAULT true CHECK (id),
default_location text NOT NULL DEFAULT 'Bhopal, Madhya Pradesh',
idle_alert_days integer NOT NULL DEFAULT 3 CHECK (idle_alert_days BETWEEN 1 AND 60),
retention_months integer NOT NULL DEFAULT 12 CHECK (retention_months BETWEEN 1 AND 60),
updated_at timestamptz NOT NULL DEFAULT now(),
updated_by uuid,
updated_by_name text
);
CREATE TABLE public.ats_sources (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
code text NOT NULL UNIQUE,
name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
kind text NOT NULL DEFAULT 'job_board'
CHECK (kind IN ('careers_page','job_board','email','referral','walk_in','agency','social','import','other')),
is_active boolean NOT NULL DEFAULT true,
sort_order integer NOT NULL DEFAULT 500,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ats_sources_name_uq ON public.ats_sources (lower(name));
CREATE TABLE public.ats_stages (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
code text NOT NULL UNIQUE,
name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 40),
kind text NOT NULL DEFAULT 'custom'
CHECK (kind IN ('new','screening','assessment','interview','offer','hired','custom')),
sort_order integer NOT NULL DEFAULT 45,
is_active boolean NOT NULL DEFAULT true,
is_system boolean NOT NULL DEFAULT false,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ats_reject_reasons (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
code text NOT NULL UNIQUE,
label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 80),
applies_to text NOT NULL DEFAULT 'rejected' CHECK (applies_to IN ('rejected','withdrawn')),
is_active boolean NOT NULL DEFAULT true,
sort_order integer NOT NULL DEFAULT 500,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ats_jobs (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
job_code text NOT NULL UNIQUE DEFAULT ('JOB-' || lpad(nextval('public.ats_job_code_seq')::text, 4, '0')),
title text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 120),
slug text NOT NULL UNIQUE,
department_id uuid REFERENCES public.departments(id) ON UPDATE CASCADE ON DELETE SET NULL,
position_id uuid REFERENCES public.positions(id) ON UPDATE CASCADE ON DELETE SET NULL,
requisition_id uuid REFERENCES public.hr_hiring_requirements(id) ON UPDATE CASCADE ON DELETE SET NULL,
shift_ids uuid[] NOT NULL DEFAULT '{}',
employment_type text NOT NULL DEFAULT 'full_time'
CHECK (employment_type IN ('full_time','part_time','contract','internship','trainee')),
location text,
openings integer NOT NULL DEFAULT 1 CHECK (openings BETWEEN 1 AND 500),
salary_min numeric(12,2) CHECK (salary_min IS NULL OR salary_min >= 0),
salary_max numeric(12,2) CHECK (salary_max IS NULL OR salary_max >= 0),
salary_period text NOT NULL DEFAULT 'monthly' CHECK (salary_period IN ('monthly','annual')),
show_salary boolean NOT NULL DEFAULT false,
experience_min_years numeric(4,1) CHECK (experience_min_years IS NULL OR experience_min_years BETWEEN 0 AND 50),
experience_max_years numeric(4,1) CHECK (experience_max_years IS NULL OR experience_max_years BETWEEN 0 AND 50),
summary text,
description text,
requirements text,
benefits text,
status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','paused','closed')),
is_published boolean NOT NULL DEFAULT false,
aliases text[] NOT NULL DEFAULT '{}',
hiring_manager_employee_id uuid REFERENCES public.hr_employees(id) ON UPDATE CASCADE ON DELETE SET NULL,
owner_user_id uuid,
owner_name text,
target_close_date date,
opened_at timestamptz,
closed_at timestamptz,
closed_reason text,
created_by uuid,
created_by_name text,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
CONSTRAINT ats_jobs_salary_range CHECK (salary_min IS NULL OR salary_max IS NULL OR salary_max >= salary_min),
CONSTRAINT ats_jobs_experience_range CHECK (experience_min_years IS NULL OR experience_max_years IS NULL OR experience_max_years >= experience_min_years),
CONSTRAINT ats_jobs_publish_requires_open CHECK (is_published = false OR status = 'open')
);
CREATE INDEX ats_jobs_status_idx ON public.ats_jobs (status);
CREATE INDEX ats_jobs_department_idx ON public.ats_jobs (department_id);
CREATE INDEX ats_jobs_position_idx ON public.ats_jobs (position_id);
CREATE INDEX ats_jobs_requisition_idx ON public.ats_jobs (requisition_id);
CREATE INDEX ats_jobs_manager_idx ON public.ats_jobs (hiring_manager_employee_id);
CREATE TABLE public.ats_candidates (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
ref_no text NOT NULL UNIQUE DEFAULT ('BX-' || nextval('public.ats_candidate_ref_seq')::text),
full_name text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 1 AND 120),
email text CHECK (email IS NULL OR length(email) <= 254),
email_norm text GENERATED ALWAYS AS (nullif(lower(btrim(email)), '')) STORED,
phone text CHECK (phone IS NULL OR length(phone) <= 32),
phone_norm text GENERATED ALWAYS AS (public.ats_normalize_phone(phone)) STORED,
alt_phone text,
city text,
state text,
current_company text,
current_title text,
total_experience_years numeric(4,1) CHECK (total_experience_years IS NULL OR total_experience_years BETWEEN 0 AND 60),
current_ctc_monthly numeric(12,2) CHECK (current_ctc_monthly IS NULL OR current_ctc_monthly >= 0),
expected_ctc_monthly numeric(12,2) CHECK (expected_ctc_monthly IS NULL OR expected_ctc_monthly >= 0),
ctc_note text,
notice_period_days integer CHECK (notice_period_days IS NULL OR notice_period_days BETWEEN 0 AND 365),
shift_preferences text[] NOT NULL DEFAULT '{}',
skills text[] NOT NULL DEFAULT '{}',
languages text[] NOT NULL DEFAULT '{}',
education text,
linkedin_url text,
portfolio_url text,
summary text,
tags text[] NOT NULL DEFAULT '{}',
source_id uuid REFERENCES public.ats_sources(id) ON DELETE SET NULL,
source_detail text,
referred_by_employee_id uuid REFERENCES public.hr_employees(id) ON UPDATE CASCADE ON DELETE SET NULL,
keep_for_future boolean NOT NULL DEFAULT false,
consent_at timestamptz,
consent_version text,
owner_user_id uuid,
owner_name text,
merged_into_id uuid REFERENCES public.ats_candidates(id) ON DELETE SET NULL,
anonymized_at timestamptz,
last_activity_at timestamptz NOT NULL DEFAULT now(),
created_by uuid,
created_by_name text,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
search_text text GENERATED ALWAYS AS (
lower(coalesce(full_name, '') || ' ' || coalesce(email, '') || ' ' || coalesce(phone, '') || ' ' ||
coalesce(ref_no, '') || ' ' || coalesce(current_company, '') || ' ' || coalesce(current_title, '') || ' ' ||
coalesce(city, ''))
) STORED
);
CREATE UNIQUE INDEX ats_candidates_email_uq ON public.ats_candidates (email_norm)
WHERE email_norm IS NOT NULL AND merged_into_id IS NULL AND anonymized_at IS NULL;
CREATE UNIQUE INDEX ats_candidates_phone_uq ON public.ats_candidates (phone_norm)
WHERE phone_norm IS NOT NULL AND merged_into_id IS NULL AND anonymized_at IS NULL;
CREATE INDEX ats_candidates_search_trgm ON public.ats_candidates USING gin (search_text gin_trgm_ops);
CREATE INDEX ats_candidates_activity_idx ON public.ats_candidates (last_activity_at DESC);
CREATE INDEX ats_candidates_created_idx ON public.ats_candidates (created_at DESC);
CREATE INDEX ats_candidates_source_idx ON public.ats_candidates (source_id);
CREATE INDEX ats_candidates_referrer_idx ON public.ats_candidates (referred_by_employee_id);
CREATE INDEX ats_candidates_merged_idx ON public.ats_candidates (merged_into_id);
CREATE TABLE public.ats_applications (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
candidate_id uuid NOT NULL REFERENCES public.ats_candidates(id) ON DELETE CASCADE,
job_id uuid REFERENCES public.ats_jobs(id) ON DELETE RESTRICT,
stage_id uuid NOT NULL REFERENCES public.ats_stages(id) ON DELETE RESTRICT,
status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_hold','rejected','withdrawn','hired')),
source_id uuid REFERENCES public.ats_sources(id) ON DELETE SET NULL,
source_detail text,
applied_via text NOT NULL DEFAULT 'manual'
CHECK (applied_via IN ('careers_form','email','import','manual','referral','walk_in')),
applied_at timestamptz NOT NULL DEFAULT now(),
position_text text,
cover_letter text,
answers jsonb NOT NULL DEFAULT '{}'::jsonb,
external_ref text,
reject_reason_id uuid REFERENCES public.ats_reject_reasons(id) ON DELETE SET NULL,
status_note text,
status_changed_at timestamptz,
status_changed_by uuid,
status_changed_by_name text,
stage_entered_at timestamptz NOT NULL DEFAULT now(),
reviewed_at timestamptz,
rating_avg numeric(3,2),
rating_count integer NOT NULL DEFAULT 0,
hired_at timestamptz,
owner_user_id uuid,
owner_name text,
created_by uuid,
created_by_name text,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ats_applications_candidate_job_uq ON public.ats_applications (candidate_id, job_id) WHERE job_id IS NOT NULL;
CREATE UNIQUE INDEX ats_applications_candidate_general_uq ON public.ats_applications (candidate_id) WHERE job_id IS NULL;
CREATE INDEX ats_applications_job_stage_idx ON public.ats_applications (job_id, stage_id, status);
CREATE INDEX ats_applications_status_review_idx ON public.ats_applications (status, reviewed_at);
CREATE INDEX ats_applications_applied_idx ON public.ats_applications (applied_at DESC);
CREATE INDEX ats_applications_source_idx ON public.ats_applications (source_id);
CREATE INDEX ats_applications_stage_idx ON public.ats_applications (stage_id);
CREATE INDEX ats_applications_reason_idx ON public.ats_applications (reject_reason_id);
CREATE INDEX ats_applications_candidate_idx ON public.ats_applications (candidate_id, applied_at DESC);
CREATE TABLE public.ats_files (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
candidate_id uuid NOT NULL REFERENCES public.ats_candidates(id) ON DELETE CASCADE,
application_id uuid REFERENCES public.ats_applications(id) ON DELETE SET NULL,
kind text NOT NULL DEFAULT 'resume'
CHECK (kind IN ('resume','cover_letter','photo','certificate','id_proof','other')),
file_name text NOT NULL CHECK (length(btrim(file_name)) BETWEEN 1 AND 255),
storage_path text NOT NULL UNIQUE,
mime_type text,
size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
sha256 text,
is_primary boolean NOT NULL DEFAULT false,
preview_path text,
extracted_text text,
source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','careers_form','email','import')),
uploaded_by uuid,
uploaded_by_name text,
created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ats_files_one_primary_resume ON public.ats_files (candidate_id) WHERE is_primary AND kind = 'resume';
CREATE INDEX ats_files_candidate_idx ON public.ats_files (candidate_id, created_at DESC);
CREATE INDEX ats_files_application_idx ON public.ats_files (application_id);
CREATE INDEX ats_files_sha_idx ON public.ats_files (candidate_id, sha256);
CREATE TABLE public.ats_notes (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
candidate_id uuid NOT NULL REFERENCES public.ats_candidates(id) ON DELETE CASCADE,
application_id uuid REFERENCES public.ats_applications(id) ON DELETE SET NULL,
body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 5000),
author_user_id uuid DEFAULT auth.uid(),
author_name text,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ats_notes_candidate_idx ON public.ats_notes (candidate_id, created_at DESC);
CREATE INDEX ats_notes_application_idx ON public.ats_notes (application_id);
CREATE TABLE public.ats_ratings (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
application_id uuid NOT NULL REFERENCES public.ats_applications(id) ON DELETE CASCADE,
rater_user_id uuid NOT NULL DEFAULT auth.uid(),
rater_name text,
score integer NOT NULL CHECK (score BETWEEN 1 AND 5),
comment text CHECK (comment IS NULL OR length(comment) <= 2000),
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
CONSTRAINT ats_ratings_one_per_rater UNIQUE (application_id, rater_user_id)
);
CREATE TABLE public.ats_events (
id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
candidate_id uuid REFERENCES public.ats_candidates(id) ON DELETE CASCADE,
application_id uuid REFERENCES public.ats_applications(id) ON DELETE CASCADE,
job_id uuid REFERENCES public.ats_jobs(id) ON DELETE CASCADE,
event_type text NOT NULL,
summary text,
data jsonb NOT NULL DEFAULT '{}'::jsonb,
actor_user_id uuid,
actor_name text,
created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ats_events_candidate_idx ON public.ats_events (candidate_id, created_at DESC);
CREATE INDEX ats_events_application_idx ON public.ats_events (application_id, created_at DESC);
CREATE INDEX ats_events_job_idx ON public.ats_events (job_id, created_at DESC);

-- 3. Starting data
INSERT INTO public.ats_settings (id) VALUES (true);
INSERT INTO public.ats_stages (code, name, kind, sort_order, is_system) VALUES
('new', 'New', 'new', 10, true),
('screening', 'Screening', 'screening', 20, true),
('assessment', 'Assessment', 'assessment', 30, true),
('interview', 'Interview', 'interview', 40, true),
('offer', 'Offer', 'offer', 50, true),
('hired', 'Hired', 'hired', 60, true);
INSERT INTO public.ats_sources (code, name, kind, sort_order) VALUES
('careers', 'Careers page', 'careers_page', 10),
('linkedin', 'LinkedIn', 'job_board', 20),
('indeed', 'Indeed', 'job_board', 30),
('naukri', 'Naukri', 'job_board', 40),
('apna', 'Apna', 'job_board', 50),
('workindia', 'WorkIndia', 'job_board', 60),
('internshala', 'Internshala', 'job_board', 70),
('foundit', 'Foundit', 'job_board', 80),
('shine', 'Shine', 'job_board', 90),
('referral', 'Employee referral', 'referral', 100),
('walk-in', 'Walk-in', 'walk_in', 110),
('email', 'Direct email', 'email', 120),
('whatsapp', 'WhatsApp', 'social', 130),
('agency', 'Agency', 'agency', 140),
('other', 'Other', 'other', 999);
INSERT INTO public.ats_reject_reasons (code, label, applies_to, sort_order) VALUES
('not-qualified', 'Does not meet requirements', 'rejected', 10),
('experience-mismatch', 'Experience mismatch', 'rejected', 20),
('salary-mismatch', 'Salary expectation too high', 'rejected', 30),
('shift-unavailable', 'Not available for the required shift','rejected', 40),
('location', 'Location or commute', 'rejected', 50),
('communication', 'Communication skills', 'rejected', 60),
('failed-assessment', 'Did not clear the assessment', 'rejected', 70),
('failed-interview', 'Did not clear the interview', 'rejected', 80),
('no-show', 'Did not attend', 'rejected', 90),
('not-reachable', 'Not reachable', 'rejected', 100),
('duplicate', 'Duplicate application', 'rejected', 110),
('position-filled', 'Position already filled', 'rejected', 120),
('background-check', 'Background verification failed', 'rejected', 130),
('other-rejected', 'Other', 'rejected', 999),
('accepted-other-offer', 'Accepted another offer', 'withdrawn', 10),
('not-interested', 'No longer interested', 'withdrawn', 20),
('compensation', 'Compensation not acceptable', 'withdrawn', 30),
('personal', 'Relocation or personal reasons', 'withdrawn', 40),
('other-withdrawn', 'Other', 'withdrawn', 999);

-- 4. Access: row-level security, grants, policies (HR staff only; deletes of people restricted to HR admins)
ALTER TABLE public.ats_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ats_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ats_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ats_reject_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ats_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ats_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ats_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ats_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ats_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ats_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ats_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ats_settings, public.ats_sources, public.ats_stages, public.ats_reject_reasons,
public.ats_jobs, public.ats_candidates, public.ats_applications, public.ats_files, public.ats_notes,
public.ats_ratings, public.ats_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.ats_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ats_sources, public.ats_stages, public.ats_reject_reasons,
public.ats_jobs, public.ats_candidates, public.ats_applications, public.ats_files, public.ats_notes,
public.ats_ratings TO authenticated;
GRANT SELECT ON public.ats_events TO authenticated;
GRANT ALL ON TABLE public.ats_settings, public.ats_sources, public.ats_stages, public.ats_reject_reasons,
public.ats_jobs, public.ats_candidates, public.ats_applications, public.ats_files, public.ats_notes,
public.ats_ratings, public.ats_events TO service_role;
REVOKE ALL ON SEQUENCE public.ats_candidate_ref_seq, public.ats_job_code_seq, public.ats_events_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.ats_candidate_ref_seq, public.ats_job_code_seq TO authenticated, service_role;
GRANT ALL ON SEQUENCE public.ats_events_id_seq TO service_role;
CREATE POLICY ats_settings_select ON public.ats_settings FOR SELECT TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_settings_update ON public.ats_settings FOR UPDATE TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid())))) WITH CHECK ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_sources_select ON public.ats_sources FOR SELECT TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_sources_insert ON public.ats_sources FOR INSERT TO authenticated
WITH CHECK ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_sources_update ON public.ats_sources FOR UPDATE TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid())))) WITH CHECK ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_reject_reasons_select ON public.ats_reject_reasons FOR SELECT TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_reject_reasons_insert ON public.ats_reject_reasons FOR INSERT TO authenticated
WITH CHECK ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_reject_reasons_update ON public.ats_reject_reasons FOR UPDATE TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid())))) WITH CHECK ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_stages_select ON public.ats_stages FOR SELECT TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_stages_insert ON public.ats_stages FOR INSERT TO authenticated
WITH CHECK ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_stages_update ON public.ats_stages FOR UPDATE TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid())))) WITH CHECK ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_stages_delete ON public.ats_stages FOR DELETE TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))) AND NOT is_system);
CREATE POLICY ats_jobs_select ON public.ats_jobs FOR SELECT TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_jobs_insert ON public.ats_jobs FOR INSERT TO authenticated
WITH CHECK ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_jobs_update ON public.ats_jobs FOR UPDATE TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid())))) WITH CHECK ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_jobs_delete ON public.ats_jobs FOR DELETE TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_candidates_select ON public.ats_candidates FOR SELECT TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_candidates_insert ON public.ats_candidates FOR INSERT TO authenticated
WITH CHECK ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_candidates_update ON public.ats_candidates FOR UPDATE TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid())))) WITH CHECK ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_candidates_delete ON public.ats_candidates FOR DELETE TO authenticated
USING ((SELECT public.hr_is_hr_admin()));
CREATE POLICY ats_applications_select ON public.ats_applications FOR SELECT TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_applications_insert ON public.ats_applications FOR INSERT TO authenticated
WITH CHECK ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_applications_update ON public.ats_applications FOR UPDATE TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid())))) WITH CHECK ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_applications_delete ON public.ats_applications FOR DELETE TO authenticated
USING ((SELECT public.hr_is_hr_admin()));
CREATE POLICY ats_files_select ON public.ats_files FOR SELECT TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_files_insert ON public.ats_files FOR INSERT TO authenticated
WITH CHECK ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_files_update ON public.ats_files FOR UPDATE TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid())))) WITH CHECK ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_files_delete ON public.ats_files FOR DELETE TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_notes_select ON public.ats_notes FOR SELECT TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_notes_insert ON public.ats_notes FOR INSERT TO authenticated
WITH CHECK ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))) AND author_user_id = (SELECT auth.uid()));
CREATE POLICY ats_notes_update ON public.ats_notes FOR UPDATE TO authenticated
USING (author_user_id = (SELECT auth.uid())) WITH CHECK (author_user_id = (SELECT auth.uid()));
CREATE POLICY ats_notes_delete ON public.ats_notes FOR DELETE TO authenticated
USING (author_user_id = (SELECT auth.uid()) OR (SELECT public.hr_is_hr_admin()));
CREATE POLICY ats_ratings_select ON public.ats_ratings FOR SELECT TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
CREATE POLICY ats_ratings_insert ON public.ats_ratings FOR INSERT TO authenticated
WITH CHECK ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))) AND rater_user_id = (SELECT auth.uid()));
CREATE POLICY ats_ratings_update ON public.ats_ratings FOR UPDATE TO authenticated
USING (rater_user_id = (SELECT auth.uid())) WITH CHECK (rater_user_id = (SELECT auth.uid()));
CREATE POLICY ats_ratings_delete ON public.ats_ratings FOR DELETE TO authenticated
USING (rater_user_id = (SELECT auth.uid()));
CREATE POLICY ats_events_select ON public.ats_events FOR SELECT TO authenticated
USING ((SELECT public.hr_is_hr_staff((SELECT auth.uid()))));
REVOKE ALL ON FUNCTION
public.ats_normalize_phone(text), public.ats_slugify(text), public.ats_try_numeric(text),
public.ats_text_array(jsonb), public.ats_actor_name(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
public.ats_normalize_phone(text), public.ats_slugify(text), public.ats_try_numeric(text),
public.ats_text_array(jsonb), public.ats_actor_name(uuid)
TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ats_touch_updated_at() FROM PUBLIC, anon, authenticated;