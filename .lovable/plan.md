# HR Document Studio — proposed architecture (no build yet)

Everything below lives inside the HRMS **Documents** tab (`/hrms/documents`), rebuilt as a 5-sub-tab workspace. No page, route or module outside it changes except the items in "Permission requests".

## 1. What the tab becomes

| Sub-tab | Purpose |
|---|---|
| Templates | Create (editor) or upload templates, map variables, version them |
| Generate | Pick template + employee → fill gaps → preview (watermarked) → issue |
| Issued | Register of issued letters: status, reference no., download, revoke/reissue, audit |
| Signatories | Signature/seal registry, who may apply which signature |
| Company Library | The current `documents` table (policies/templates library) — unchanged, just relocated as a sub-tab |

Employee compliance files (`hr_employee_documents`) are **not** touched: that data belongs to the Employee Documents page and the employee profile, both of which stay exactly as they are. Inside the new tab it is surfaced read-only as an "Employee files" lookup so it stays reachable. Nothing is deleted or migrated.

## 2. Rendering decision (the key call)

Two lanes, one issued artifact:

- **Native lane (recommended default).** Templates authored in a rich editor are stored as canonical **HTML + a page-setup JSON** (A4, margins, header/footer, page-number token). Rendering merges values into that HTML and produces a **PDF** through a Chromium print step, which gives exact A4, real page breaks, page numbers, and a `break-inside: avoid` signature block that can never be orphaned.
- **Upload lane.** Accepted: **.docx only** (plus .html). PDF uploads are rejected as templates — a PDF has no reliable text-run model to merge into, and forcing it produces broken letters. On upload we parse the DOCX XML directly (merging split runs so placeholders broken across formatting are still found), and offer two modes:
  - *Preserve mode*: keep the DOCX as-is, fill placeholders in its XML, issue **DOCX + PDF**. Pixel-perfect letterhead, but PDF conversion needs LibreOffice, which Supabase edge functions do not have (see open question Q1).
  - *Convert mode*: DOCX → canonical HTML on import, shown side-by-side with a fidelity warning and a mandatory HR "looks right" confirmation before the template can be used.

Anything unparseable (malformed braces, unsupported constructs) is listed explicitly and blocks issuing — never a silent broken document.

## 3. Placeholder syntax

- Canonical: `{field_key}`; case-insensitive, spaces tolerated (`{ Employee Name }` → `employee_name`).
- Literal brace: `{{` and `}}` escape to `{` / `}`.
- Repeat instances: a numeric suffix creates a distinct slot — `{sign1}`, `{sign2}`, `{date1}`, `{date2}` — each mapped independently (GM vs HR signatures on one letter).
- Same key repeated without suffix = mapped once, filled everywhere.
- Unclosed/unknown braces are collected into an "unparseable" list on the mapping screen.

## 4. Data model (all new tables, nothing altered)

- `hr_doc_field_catalog` — curated fields: key, label, group (employee/employment/salary/company/signatory/system), data type, formatter, `is_sensitive`, required, default, resolver id. Includes derived fields: full name, formatted dates, tenure between two dates, amount in words (Indian), salutation/pronouns by gender, company legal details.
- `hr_doc_templates` — name, category (relieving/experience/appointment/appraisal/custom), lane (native/docx), current version, access level.
- `hr_doc_template_versions` — immutable: content (HTML or stored DOCX path), page setup, placeholder→field mapping, checksum, created_by. Editing always creates a new version.
- `hr_doc_signatories` — name, designation, signature image path, optional seal, active flag.
- `hr_doc_signatory_permissions` — which role/user may apply which signatory.
- `hr_documents_issued` — template_version_id, employee_id, **reference_no**, status, rendered file path, `values_snapshot` jsonb (exact values used), signatory ids, issued_by/at, revoked_by/at/reason, superseded_by.
- `hr_doc_reference_sequences` — pattern + counter, allocated via a Postgres sequence / `UPDATE ... RETURNING` so concurrent issues can never collide.
- `hr_doc_audit_log` — template created/edited, generated, previewed, downloaded, emailed, revoked; actor + timestamp.
- Private buckets: **`hr-doc-templates`**, **`hr-doc-signatures`**, **`hr-doc-issued`**. Signed URLs only. Existing public buckets are never used for salary-bearing letters.

Field catalog: I recommend a **separate catalog** rather than reusing `hr_mail_templates`. That table is just `name/subject/body_html` with no variable catalog at all, so there is nothing to reuse; instead the new catalog will be exposed so the mailer can adopt it later. Tell me if you want the mailer switched over in the same build.

## 5. Integrity, lifecycle, access

- Issued = frozen: rendered file + `values_snapshot` + template version pinned. Later data or template changes cannot alter an issued letter.
- Status: `draft → pending_approval (optional per template) → issued → delivered → revoked | superseded`. Revoke requires a reason; reissue creates a new reference no. linked to the old one.
- Preview renders with a diagonal **DRAFT — NOT VALID** watermark, and previews are never stored in the issued bucket.
- RLS: HR staff via `public.hr_is_hr_staff()`; templates/letters carrying salary fields gated behind an additional permission; every read of an issued file goes through a logged signed-URL request.
- Signature application is permission-checked and logged per use.

## 6. Included extras

- **Bulk generation** (e.g. appraisal letters for N employees) with a per-row result table: issued / missing-field / failed, and a CSV of failures.
- **Verification**: each letter carries its reference no. plus a QR to a public read-only verify route that returns only "genuine / revoked", employee name, letter type and issue date — no salary, no personal data.
- **Write-back**: a value typed into a missing field is written back to the employee record only after an explicit "also save to employee record" confirmation, and it is audited.

## 7. Offer letters (`hr_offer_letters`)

Left untouched. Design accommodates them by making the generator source-agnostic: the resolver layer takes a *subject* (employee_id today, candidate_id later) and a resolver set. Adding an "offer letter" category later means adding a candidate resolver set and one template — no schema change to the issued table.

## 8. Duplication flags

- `documents` table = company file library. Kept, not duplicated — becomes the Company Library sub-tab.
- `hr_employee_documents` = employee compliance uploads. Kept, read-only inside the new tab.
- The one-off relieving-letter script produced earlier becomes the first native template; the script is retired.

## 9. Permission requests (outside the Documents tab)

1. **Three new private storage buckets** + RLS policies on `storage.objects` (unavoidable; nothing existing is modified).
2. **A public verify route** (`/verify/:ref`) if you want third-party verification — it is a new page outside the tab.
3. **An "Issue letter" entry point on the Separation checklist** — optional, off by default; say the word and I add it, otherwise separation stays untouched.
4. **A rendering worker** (edge function, possibly with an external HTML→PDF service) — see Q1.

## 10. Phase plan

1. **P1 Foundation** — schema, buckets, RLS, field catalog with resolvers, audit log. No UI change yet.
2. **P2 Native templates** — editor with A4 page setup, `{}` detection with inline "which field is this?" prompt, versioning.
3. **P3 Rendering + generate** — resolver → merge → watermarked preview → issue with reference no., snapshot freeze, issued register + download.
4. **P4 Upload lane** — DOCX ingest, run-merge placeholder extraction, mapping screen, fidelity review.
5. **P5 Signatories** — registry, typed signature variables, permissions, per-use logging.
6. **P6 Lifecycle & scale** — approval step, revoke/reissue, bulk generation, QR verification, email delivery via the HR mailbox.

## 11. Open questions

1. **PDF engine.** Edge functions cannot run LibreOffice or Chromium. Options: (a) client-side print-to-PDF in the browser — free, good fidelity for the native lane, weaker for DOCX; (b) a hosted HTML→PDF/DOCX→PDF API (paid, needs a key); (c) DOCX-only output for the upload lane. Which do you want?
2. Should uploaded DOCX letterheads be **preserved as DOCX** (pixel-perfect, PDF depends on Q1) or **converted to the editor** (fully controllable, minor fidelity loss)?
3. Reference-number pattern? e.g. `BLYNK/REL/2026-27/0007` — per letter type, per financial year?
4. Is an **approval step** required before issuing, and if so who approves (any HR, or Super Admin only)?
5. Who may issue letters containing **salary figures** — all HR staff, or a named subset?
6. Company legal details for the catalog (registered name, CIN/GST, registered address) — where do I read them from, or do you want a small settings block inside the Documents tab?
7. Should letters be **emailed to the employee** from `hr@blynkex.com` on issue, or download-only for now?
8. Should the HR mailbox templates adopt this field catalog now, or later?
9. Do you want the **QR verification** route at all (it is public by design)?
