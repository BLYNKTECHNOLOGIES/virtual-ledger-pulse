ALTER TABLE public.ats_applications ADD COLUMN IF NOT EXISTS preferred_shifts text[];
CREATE INDEX IF NOT EXISTS ats_applications_preferred_shifts_gin ON public.ats_applications USING gin (preferred_shifts);
CREATE OR REPLACE VIEW public.ats_application_overview WITH (security_invoker = true) AS
SELECT a.id AS application_id, a.candidate_id, a.job_id, a.stage_id, a.status, a.applied_at, a.applied_via, a.source_id, a.source_detail, a.position_text, a.stage_entered_at, a.reviewed_at, a.rating_avg, a.rating_count, a.reject_reason_id, a.status_note, a.status_changed_at, a.hired_at, a.updated_at,
 c.ref_no, c.full_name, c.email, c.phone, c.city, c.current_company, c.current_title, c.total_experience_years, c.expected_ctc_monthly, c.notice_period_days, c.shift_preferences, c.skills, c.keep_for_future, c.last_activity_at, c.anonymized_at,
 j.title AS job_title, j.job_code, j.status AS job_status, j.department_id,
 st.name AS stage_name, st.code AS stage_code, st.kind AS stage_kind, st.sort_order AS stage_order,
 src.name AS source_name, rr.label AS reject_reason_label,
 (SELECT count(*) FROM ats_applications a2 WHERE a2.candidate_id = a.candidate_id) AS candidate_application_count,
 (EXISTS (SELECT 1 FROM ats_files f WHERE f.candidate_id = a.candidate_id AND f.kind = 'resume')) AS has_resume,
 (floor(EXTRACT(epoch FROM (now() - a.stage_entered_at)) / 86400::numeric))::integer AS days_in_stage,
 a.preferred_shifts
FROM ats_applications a
JOIN ats_candidates c ON c.id = a.candidate_id
LEFT JOIN ats_jobs j ON j.id = a.job_id
JOIN ats_stages st ON st.id = a.stage_id
LEFT JOIN ats_sources src ON src.id = a.source_id
LEFT JOIN ats_reject_reasons rr ON rr.id = a.reject_reason_id
WHERE c.merged_into_id IS NULL;