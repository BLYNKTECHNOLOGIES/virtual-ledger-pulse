# Passport photo as profile picture (HRMS + ERP)

Use each employee's passport photo, already collected in HRMS, as their profile picture in both HRMS and the ERP — without touching the original document record.

## How it will work

- A copy of the passport photo is placed in the same store that staff profile pictures already use, so the picture appears everywhere immediately: HRMS employee list and profile header, and in the ERP sidebar, user menu, profile page and staff lists.
- If an employee has already set their own picture in the ERP, that picture is kept. The passport photo only fills in where there is none.
- From now on it is automatic: whenever a passport photo is uploaded — by the employee during onboarding or by HR on the Documents page — it becomes that person's profile picture straight away (again, only if they have not set their own).
- The passport photo stays exactly where it is in the document list; nothing is moved or deleted.

## What I found in your data

- 9 employees have a passport photo on file today; 41 are active, so the remaining 32 will simply keep their initials until a photo is collected.
- One of the 9 (Harmeet Singh Khalsa) uploaded a PDF rather than an image, so it cannot be used as a picture — I will report it and it needs re-uploading as a JPG/PNG.
- One (Ram Mehra) has no ERP login linked, so the picture shows in HRMS only.

## Technical notes

- Bucket: reuse the existing public `avatars` bucket (5 MB limit, jpeg/png/webp). Copies land at `employees/<hr_employee_id>/photo-<ts>.<ext>`.
- Edge function `employee-photo-sync` (service role): for a given employee (or all, in backfill mode) reads the newest `hr_employee_documents` row with `document_type = 'passport_photo'`, downloads it from the private `employee-documents` bucket (handles both `employee-documents://path` refs and the legacy `/storage/v1/object/public/...` strings via the same parsing `src/lib/storedDoc.ts` uses), skips non-image mime types, uploads to `avatars`, then writes:
  - `hr_employees.profile_image_url` = public URL (always refreshed from the latest photo),
  - `users.avatar_url` = public URL only when currently null, for the linked `hr_employees.user_id`.
- Automatic trigger: an `AFTER INSERT OR UPDATE` trigger on `hr_employee_documents` for `document_type = 'passport_photo'` enqueues the sync by calling the function through `pg_net` (pattern already used elsewhere in the project — verify the helper before wiring; if unavailable, call the edge function directly from the two upload paths, `EmployeeDocumentsPanel.tsx` and `Stage3Documents.tsx`/`onboarding-invite`).
- One-off backfill run of the function in "all" mode after deploy, then verify `hr_employees.profile_image_url` and `users.avatar_url` counts by query.
- No changes needed to avatar rendering: every existing `<img src={...}>` keeps working because the URLs are public.
- Append a dated line to `docs/STATE_LOG.md`.

Note: the emailed biometric-registration work from the previous plan is partly done (database side applied); I will finish its screens and mail after this.
