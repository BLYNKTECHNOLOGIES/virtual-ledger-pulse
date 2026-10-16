# Per-job application form builder (ATS → careers page)

## What you get
In the job form (New job / Edit job) a new **Application form** section where HR decides, per job, what the careers-page form asks:

1. **Standard fields**: each one set to **Required / Optional / Hidden**:
   Phone, Email, Total experience, Current CTC, Expected CTC, Notice period, Current location, Skills, LinkedIn, Cover letter, Resume upload.
   - Name is always required. You need at least one way to contact the candidate (phone or email), so the form won't let you hide both.
   - Shift preference stays automatic: it is required whenever the job offers more than one shift.
2. **Custom questions**: add, reorder, edit or remove questions for this job only. Each question has:
   - Type: short text, long text, number, yes/no, single choice, multiple choice, date, link
   - Required on/off, help text, options (for choice types), max length or min/max for numbers
   - **Knockout rule** (optional): for example "Are you willing to work night shifts? → No" flags the application as *Not a fit* for HR review. It never auto-rejects the candidate and never sends an email.
3. **Form templates**: "Save as template" / "Start from template" (for example *Operations default*, *KYC role*). A template is copied into the job. Editing the template later never changes jobs that were already posted.
4. **Preview**: a live preview of what the candidate will see.
5. **Safe defaults**: existing jobs and any new job without changes keep exactly today's form, so nothing breaks on the website.
6. **Changes after applications arrive**: you can still edit the form. Old applications keep the questions and answers they were submitted with. A notice warns you that past applicants answered an older version.

## Where answers show up
- The candidate's Application/Review panel shows each custom question with the candidate's answer, labelled with the question text as it was when they applied. Knockout flags show as a badge.
- The Candidates list gets a "Not a fit" filter. The Excel export includes the custom answers.

## Server-side enforcement (cannot be bypassed by the website)
- The careers job feed publishes each job's form definition.
- The application intake checks every submission against that job's form:
  - required fields must be present
  - hidden fields are ignored
  - answers must match the question type and options
  - unknown questions are dropped
- When a submission fails these checks, the intake returns a clear error code the website can show to the candidate.

## Technical details
- DB (one migration):
  - `ats_jobs.application_form jsonb` (null = legacy default), validated by a trigger: allowed keys, types, and at least one of phone or email required or optional.
  - New table `ats_form_templates` (name, form jsonb, timestamps), with grants and RLS for HR staff via `hr_is_hr_staff`.
  - `ats_applications.form_snapshot jsonb` (form version used) and `knockout_flags text[]`.
- `ats-public-jobs`: adds `application_form` to each job, resolved to the full effective form (legacy default when null) so the website always gets a complete definition. `form_version` is a hash, so the website cache knows when the form changed.
- `ats-intake`:
  - validates against the effective form
  - stores custom answers under `answers.custom[question_id]`
  - writes `form_snapshot` and knockout flags
  - error codes: `invalid: required:<key>`, `invalid: answer:<id>`
- UI: new `ApplicationFormEditor` inside JobEditor, built from the existing AtsUi primitives. Templates live in `src/lib/ats/forms.ts`. Tests cover required/hidden/knockout validation.
- Records the rule in `src/components/ats/AGENTS.md` and adds one STATE_LOG line.

## Prompt for the website project (delivered after deployment)
I'll give you a ready-to-paste prompt. It tells the website to:
- build the apply form from each job's `application_form` instead of fixed fields
- render each question type and honour Required/Hidden
- send custom answers as `answers: { [question_id]: value }`
- show the server's error codes to the candidate
- fall back to the current form when `application_form` is missing
