# ATS rules

- ATS visual primitives stay in AtsUi.tsx and compose existing controls, isolating presentation from data contracts.
- Candidate-visible job notes retain the existing benefits storage/feed key, because renaming the presentation must not break external careers consumers.
- Job list controls and clipboard conversion share jobTextFormatting: inert HTML becomes plain-text headings/paragraphs/list markers, and only unstructured points are auto-bulleted, so existing careers-feed consumers need no new data contract.
- ATS conversation data access lives in src/lib/ats/conversations.ts and the single realtime channel in src/hooks/ats/useAtsMailRealtime.ts (mounted once in AtsWorkspace), so screens share one query-key family and one subscription.
- The hire → onboarding hand-off is the DB trigger hr_ats_hire_handoff (one draft per application, no email); ATS screens only display its result, so the hire never creates records twice.
- Per-job careers application forms are defined and validated only by supabase/functions/_shared/ats-form.ts (re-exported by src/lib/ats/forms.ts); ats_jobs.application_form null means the legacy default, so the feed, intake and job editor can never disagree.
- A job's requirements are the set ats_job_requirement_ids(job): requisition_id (primary) plus ats_job_requirements rows; reconcile closes a job only when every linked requirement is fulfilled and sums openings across them, and the hire hand-off prefers the linked requirement whose line covers the hired shift — never read requisition_id alone for workforce math.
- Hidden requirement counts and the expanded selectable list share shift eligibility; active-link cache keys include the edited job exclusion, so counts and options cannot disagree across job forms.
- A job and its requirement links are saved only through the ats_save_job RPC (one transaction), because separate requests left published jobs without links and created duplicate postings on retry.
- An application counts toward exactly one requirement of its job (hr_wf_application_requirement: the linked requirement whose line covers its single preferred shift, else the main link), because counting it on every link multiplied pipeline totals.
