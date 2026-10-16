# ATS rules

- ATS visual primitives stay in AtsUi.tsx and compose existing controls, isolating presentation from data contracts.
- Candidate-visible job notes retain the existing benefits storage/feed key, because renaming the presentation must not break external careers consumers.
- Job list controls and multi-line paste formatting share jobTextFormatting and store literal bullet/number markers in existing plain-text fields, because HRMS and external careers-feed consumers must preserve formatting without a new data contract.
- ATS conversation data access lives in src/lib/ats/conversations.ts and the single realtime channel in src/hooks/ats/useAtsMailRealtime.ts (mounted once in AtsWorkspace), so screens share one query-key family and one subscription.
- The hire → onboarding hand-off is the DB trigger hr_ats_hire_handoff (one draft per application, no email); ATS screens only display its result, so the hire never creates records twice.
- Per-job careers application forms are defined and validated only by supabase/functions/_shared/ats-form.ts (re-exported by src/lib/ats/forms.ts); ats_jobs.application_form null means the legacy default, so the feed, intake and job editor can never disagree.
- A job's requirements are the set ats_job_requirement_ids(job): requisition_id (primary) plus ats_job_requirements rows; reconcile closes a job only when every linked requirement is fulfilled and sums openings across them, and the hire hand-off prefers the linked requirement whose line covers the hired shift — never read requisition_id alone for workforce math.
