# One job post, multiple shift requirements (ATS)

## The situation today
- A job links to **one** hiring requirement. When you hire someone, you already pick their shift — and the system already fills **that shift's** requirement correctly. So the morning/evening KYC hires would land on the right requirement even today.
- What doesn't follow: the job dialog lets you pick only one requirement, the job's openings count and the requirement's "jobs" list follow only that one, and the other shift's requirement shows no job.

## What I'll build

### 1. Link several requirements to one job
- New table `ats_job_requirements` (job + requirement pairs) with grants and RLS matching `ats_jobs` access, so one job can list the morning **and** evening requirements.
- The existing single link (`requisition_id`) stays and keeps working — existing jobs change nothing. Where one link exists it simply counts as the first of the set.

### 2. Job form: pick one requirement per shift
- In the job form's "Hiring requirement" section, when the job has multiple shifts you get one picker **per selected shift**, each offering the recruiting requirements for that shift's staffing line (same department/role). Picking one still auto-fills empty fields as today.
- A job with one shift behaves exactly as today.
- Openings = total still-needed across the linked requirements; you can still edit it.

### 3. Everything else follows the set of linked requirements
- **Workforce Planning**: each linked requirement's card and detail show this job; the job page's Workforce section shows each linked requirement with its own progress.
- **Automatic counting/closure**: the reconcile that closes a fulfilled job and keeps openings in sync will consider **all** linked requirements — the job closes only when every linked requirement is filled, and openings reflect the total still needed.
- **Hires**: unchanged — the hire already asks which shift and fills that shift's requirement. With the job now linked to both, the picker simply prefers the matching linked requirement.

### 4. Validation
- DB guard: a link is refused if the requirement is not recruiting, or its department/role doesn't match the job, or its staffing line doesn't cover any of the job's shifts. One requirement can't be linked twice to the same job.

## Technical details
- One migration: `ats_job_requirements` (job_id, requirement_id, unique pair, FK cascades), GRANTs (authenticated per `ats_jobs` policy, service_role), RLS via `hr_is_hr_staff`, and updates to `hr_wf_refresh_open_requirements` / `hr_wf_pick_requirement` / `hr_wf_requirement_people` to read the link set (single `requisition_id` union the new table).
- UI: JobEditor per-shift pickers; `useRequirementJobs` and `JobLineShiftNotice`/`WorkforceJobCard` read the set.
- Tests: link validation, reconcile across two requirements, hire fills the right one.
- One STATE_LOG line; rule added to `src/components/ats/AGENTS.md`.

## What you do after it ships
Open the KYC Executive job, pick the morning requirement for the morning shift and the evening requirement for the evening shift, save. One job post on the careers page; hires fill the right requirement automatically. No website-project changes needed.
