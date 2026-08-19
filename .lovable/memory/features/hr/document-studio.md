---
name: HR Document Studio
description: Letter template/generation system in HRMS Documents tab — print-to-PDF, BLY-000001 references, frozen issued artefacts, DOCX imports converted into the native editor
type: feature
---
Lives in the HRMS **Documents** tab: Templates / Generate / Issued / Signatories / Company library / Employee files.

Decisions (owner-confirmed):
- **PDF engine:** browser print-to-PDF only. No hosted PDF service. Issued artefact stored is the merged, print-ready **HTML** in the private `hr-doc-issued` bucket; re-print always re-opens that frozen file, never re-resolves values.
- **Reference numbers:** pattern `BLY-{SEQ:6}` → `BLY-000123`, allocated by `hr_doc_allocate_reference` (HR-staff gated, concurrency safe).
- **Uploaded DOCX letterheads:** converted into the native editor via `mammoth` on import — no DOCX-preserving lane. Minor formatting loss is reviewed at import time.
- **Salary-bearing letters:** visible/issuable by all HR staff (`hr_doc_can_view_sensitive` = `hr_is_hr_staff`).
- Issued rows are immutable snapshots (`values_snapshot`, `template_version_id`); correction path is revoke + re-issue, never edit.
- `hr_employee_documents` (employee compliance uploads) is untouched and surfaced read-only under "Employee files".
