-- ATS reports (Batch 7), migration M9: one read-only report for HR staff. No tables, no writes, no triggers.
-- Scope: only objects named ats_*. SECURITY INVOKER, so every row it reads passes the ats_* row-level security.
-- p: { from?: "YYYY-MM-DD", to?: "YYYY-MM-DD" (IST, inclusive; default the last 30 days), job_id?: uuid | "general",
--      source_id?: uuid }
-- Applications are counted by the date they applied ("cohort"); hires, interviews and team activity by the date they
-- happened. "Waiting now" is the pipeline as it stands today.
CREATE OR REPLACE FUNCTION public.ats_report(p jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
v_from date;
v_to date;
v_job_all boolean;
v_job_general boolean;
v_job uuid;
v_source uuid;
v_start timestamptz;
v_end timestamptz;
v_interview_order integer;
v_idle integer;
v_bucket text;
v_out jsonb;
BEGIN
IF NOT coalesce(public.hr_is_hr_staff(auth.uid()), false) THEN RAISE EXCEPTION 'ATS_FORBIDDEN'; END IF;
BEGIN
v_from := coalesce(nullif(p->>'from', '')::date, v_today - 29);
v_to := coalesce(nullif(p->>'to', '')::date, v_today);
v_source := nullif(p->>'source_id', '')::uuid;
v_job_general := coalesce(p->>'job_id', '') = 'general';
v_job_all := coalesce(p->>'job_id', '') = '';
v_job := CASE WHEN v_job_all OR v_job_general THEN NULL ELSE (p->>'job_id')::uuid END;
EXCEPTION WHEN others THEN
RAISE EXCEPTION 'ATS_REPORT_INVALID';
END;
IF v_to < v_from OR v_to - v_from > 731 THEN RAISE EXCEPTION 'ATS_REPORT_INVALID' USING DETAIL = 'range'; END IF;
v_start := v_from::timestamp AT TIME ZONE 'Asia/Kolkata';
v_end := (v_to + 1)::timestamp AT TIME ZONE 'Asia/Kolkata';
v_bucket := CASE WHEN v_to - v_from <= 120 THEN 'week' ELSE 'month' END;
SELECT min(sort_order) INTO v_interview_order FROM public.ats_stages WHERE kind = 'interview';
SELECT coalesce(max(idle_alert_days), 3) INTO v_idle FROM public.ats_settings;

WITH
-- Applications that match the job and source filters (any date).
scope AS (
SELECT a.* FROM public.ats_applications a
WHERE (v_job_all OR (v_job_general AND a.job_id IS NULL) OR a.job_id = v_job)
AND (v_source IS NULL OR a.source_id = v_source)),
-- The cohort: applied in the period.
apps AS (
SELECT * FROM scope WHERE applied_at >= v_start AND applied_at < v_end),
-- The furthest stage each application has reached (current stage, and every stage it moved from or to).
reached AS (
SELECT a.id, greatest(
(SELECT s.sort_order FROM public.ats_stages s WHERE s.id = a.stage_id),
(SELECT max(s.sort_order) FROM public.ats_events e
JOIN public.ats_stages s ON s.id::text IN (e.data->>'to_stage_id', e.data->>'from_stage_id')
WHERE e.application_id = a.id AND e.event_type = 'stage_changed')) AS max_order
FROM apps a),
cohort AS (
SELECT a.*, r.max_order,
(v_interview_order IS NOT NULL AND r.max_order >= v_interview_order) AS reached_interview,
extract(epoch FROM (a.hired_at - a.applied_at)) / 86400.0 AS days_to_hire,
extract(epoch FROM (a.reviewed_at - a.created_at)) / 3600.0 AS hours_to_review
FROM apps a JOIN reached r ON r.id = a.id),
summary AS (
SELECT jsonb_build_object(
'applications', count(*),
'reviewed', count(*) FILTER (WHERE reviewed_at IS NOT NULL),
'reached_interview', count(*) FILTER (WHERE reached_interview),
'hired', count(*) FILTER (WHERE status = 'hired'),
'rejected', count(*) FILTER (WHERE status = 'rejected'),
'withdrawn', count(*) FILTER (WHERE status = 'withdrawn'),
'open', count(*) FILTER (WHERE status IN ('active', 'on_hold')),
'median_days_to_hire', round((percentile_cont(0.5) WITHIN GROUP (ORDER BY days_to_hire)
FILTER (WHERE status = 'hired' AND days_to_hire >= 0))::numeric, 1),
'median_hours_to_review', round((percentile_cont(0.5) WITHIN GROUP (ORDER BY hours_to_review)
FILTER (WHERE hours_to_review >= 0))::numeric, 1),
'hires_in_period', (SELECT count(*) FROM scope WHERE hired_at >= v_start AND hired_at < v_end)) AS j
FROM cohort),
funnel AS (
SELECT coalesce(jsonb_agg(jsonb_build_object(
'stage_id', s.id, 'code', s.code, 'name', s.name, 'kind', s.kind, 'sort_order', s.sort_order,
'reached', (SELECT count(*) FROM cohort c WHERE c.max_order >= s.sort_order))
ORDER BY s.sort_order, s.name), '[]'::jsonb) AS j
FROM public.ats_stages s
WHERE s.is_active OR EXISTS (SELECT 1 FROM cohort c WHERE c.stage_id = s.id)),
sources AS (
SELECT coalesce(jsonb_agg(jsonb_build_object(
'source_id', x.source_id, 'name', coalesce(src.name, 'Not recorded'), 'applications', x.applications,
'reviewed', x.reviewed, 'reached_interview', x.reached_interview, 'hired', x.hired, 'rejected', x.rejected)
ORDER BY x.applications DESC, coalesce(src.name, 'zzz')), '[]'::jsonb) AS j
FROM (SELECT source_id, count(*) AS applications, count(*) FILTER (WHERE reviewed_at IS NOT NULL) AS reviewed,
count(*) FILTER (WHERE reached_interview) AS reached_interview, count(*) FILTER (WHERE status = 'hired') AS hired,
count(*) FILTER (WHERE status = 'rejected') AS rejected
FROM cohort GROUP BY source_id) x
LEFT JOIN public.ats_sources src ON src.id = x.source_id),
jobs AS (
SELECT coalesce(jsonb_agg(jsonb_build_object(
'job_id', x.job_id, 'title', CASE WHEN x.job_id IS NULL THEN 'General applications' ELSE coalesce(j.title, 'Job removed') END,
'applications', x.applications, 'reached_interview', x.reached_interview, 'hired', x.hired,
'median_days_to_hire', x.median_days_to_hire)
ORDER BY x.applications DESC, j.title), '[]'::jsonb) AS j
FROM (SELECT job_id, count(*) AS applications, count(*) FILTER (WHERE reached_interview) AS reached_interview,
count(*) FILTER (WHERE status = 'hired') AS hired,
round((percentile_cont(0.5) WITHIN GROUP (ORDER BY days_to_hire) FILTER (WHERE status = 'hired' AND days_to_hire >= 0))::numeric, 1)
AS median_days_to_hire
FROM cohort GROUP BY job_id) x
LEFT JOIN public.ats_jobs j ON j.id = x.job_id),
reasons AS (
SELECT coalesce(jsonb_agg(jsonb_build_object(
'reason_id', x.reject_reason_id, 'label', coalesce(r.label, 'No reason recorded'), 'status', x.status, 'count', x.n)
ORDER BY x.n DESC, r.label), '[]'::jsonb) AS j
FROM (SELECT reject_reason_id, status, count(*) AS n FROM cohort WHERE status IN ('rejected', 'withdrawn')
GROUP BY reject_reason_id, status) x
LEFT JOIN public.ats_reject_reasons r ON r.id = x.reject_reason_id),
ivs AS (
SELECT i.*,
EXISTS (SELECT 1 FROM public.ats_interview_panel pn WHERE pn.interview_id = i.id AND pn.removed_at IS NULL
AND pn.feedback_at IS NULL) AS feedback_missing
FROM public.ats_interviews i JOIN scope a ON a.id = i.application_id
WHERE i.starts_at >= v_start AND i.starts_at < v_end),
interviews AS (
SELECT jsonb_build_object(
'total', count(*) FILTER (WHERE status <> 'cancelled'),
'upcoming', count(*) FILTER (WHERE status = 'scheduled' AND ends_at >= now()),
'awaiting_update', count(*) FILTER (WHERE status = 'scheduled' AND ends_at < now()),
'completed', count(*) FILTER (WHERE status = 'completed'),
'no_show', count(*) FILTER (WHERE status = 'no_show'),
'cancelled', count(*) FILTER (WHERE status = 'cancelled'),
'feedback_missing', count(*) FILTER (WHERE status = 'completed' AND feedback_missing),
'by_mode', jsonb_build_object(
'in_person', count(*) FILTER (WHERE status <> 'cancelled' AND mode = 'in_person'),
'video', count(*) FILTER (WHERE status <> 'cancelled' AND mode = 'video'),
'phone', count(*) FILTER (WHERE status <> 'cancelled' AND mode = 'phone'))) AS j
FROM ivs),
waiting AS (
SELECT coalesce(jsonb_agg(jsonb_build_object(
'stage_id', s.id, 'name', s.name, 'kind', s.kind, 'sort_order', s.sort_order,
'open', x.open, 'on_hold', x.on_hold, 'median_days', x.median_days, 'over_idle', x.over_idle)
ORDER BY s.sort_order, s.name), '[]'::jsonb) AS j
FROM public.ats_stages s
JOIN (SELECT stage_id, count(*) AS open, count(*) FILTER (WHERE status = 'on_hold') AS on_hold,
round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (now() - stage_entered_at)) / 86400.0))::numeric, 1)
AS median_days,
count(*) FILTER (WHERE status = 'active' AND stage_entered_at < now() - make_interval(days => v_idle)) AS over_idle
FROM scope WHERE status IN ('active', 'on_hold') GROUP BY stage_id) x ON x.stage_id = s.id),
buckets AS (
SELECT b::date AS b FROM generate_series(date_trunc(v_bucket, v_from::timestamp), v_to::timestamp,
CASE v_bucket WHEN 'week' THEN interval '1 week' ELSE interval '1 month' END) AS g(b)),
trend AS (
SELECT coalesce(jsonb_agg(jsonb_build_object(
'bucket', bk.b, 'applications',
(SELECT count(*) FROM apps a WHERE date_trunc(v_bucket, a.applied_at AT TIME ZONE 'Asia/Kolkata')::date = bk.b),
'hires',
(SELECT count(*) FROM scope a WHERE a.hired_at >= v_start AND a.hired_at < v_end
AND date_trunc(v_bucket, a.hired_at AT TIME ZONE 'Asia/Kolkata')::date = bk.b))
ORDER BY bk.b), '[]'::jsonb) AS j
FROM buckets bk),
team AS (
SELECT coalesce(jsonb_agg(jsonb_build_object(
'user_id', x.actor_user_id, 'name', x.name, 'moved', x.moved, 'rejected', x.rejected,
'hired', x.hired, 'notes', x.notes, 'emails_sent', x.emails_sent, 'interviews_scheduled', x.interviews_scheduled)
ORDER BY (x.moved + x.rejected + x.hired + x.notes + x.emails_sent + x.interviews_scheduled) DESC, x.name),
'[]'::jsonb) AS j
FROM (SELECT e.actor_user_id, max(e.actor_name) AS name,
count(*) FILTER (WHERE e.event_type = 'stage_changed') AS moved,
count(*) FILTER (WHERE e.event_type = 'status_changed' AND e.data->>'to' = 'rejected') AS rejected,
count(*) FILTER (WHERE e.event_type = 'status_changed' AND e.data->>'to' = 'hired') AS hired,
count(*) FILTER (WHERE e.event_type = 'note_added') AS notes,
count(*) FILTER (WHERE e.event_type = 'email_sent') AS emails_sent,
count(*) FILTER (WHERE e.event_type = 'interview_scheduled') AS interviews_scheduled
FROM public.ats_events e
LEFT JOIN scope a ON a.id = e.application_id
WHERE e.created_at >= v_start AND e.created_at < v_end AND e.actor_user_id IS NOT NULL
AND ((v_job_all AND v_source IS NULL) OR a.id IS NOT NULL)
GROUP BY e.actor_user_id) x
WHERE (x.moved + x.rejected + x.hired + x.notes + x.emails_sent + x.interviews_scheduled) > 0)
SELECT jsonb_build_object(
'range', jsonb_build_object('from', v_from, 'to', v_to, 'bucket', v_bucket, 'time_zone', 'Asia/Kolkata'),
'generated_at', now(),
'idle_days', v_idle,
'summary', (SELECT j FROM summary),
'funnel', (SELECT j FROM funnel),
'sources', (SELECT j FROM sources),
'jobs', (SELECT j FROM jobs),
'reasons', (SELECT j FROM reasons),
'interviews', (SELECT j FROM interviews),
'waiting', (SELECT j FROM waiting),
'trend', (SELECT j FROM trend),
'team', (SELECT j FROM team))
INTO v_out;
RETURN v_out;
END $$;

REVOKE ALL ON FUNCTION public.ats_report(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ats_report(jsonb) TO authenticated, service_role;