# Optional pre-joining onboarding through the existing candidate link

## 1. Recommendation and feasibility

Extend the candidate self-service link already used by HR; do not build another candidate portal or require an ERP login. HR optionally attaches a pre-joining package to an onboarding draft. One welcome email includes the offer and the same link. The candidate downloads the offer, uploads the signed copy and joining documents once, and confirms the offered joining date. HR reviews everything before actual joining.

This is feasible with the existing form, HR email service and private document storage. It needs new review, document-version, joining-date and readiness controls—not merely extra upload fields. No certified eSign service is needed: you chose **upload signed offer**. This records a signed-document submission; it does not certify the signature or verify identity automatically.

**Optional means optional for HR to enable per candidate.** Disabled records continue through the existing HR-led process. Enabled records must satisfy their published package before being called ready. A documented switch back to the standard process is allowed; it must retain submitted files and history, not erase evidence or silently treat missing documents as approved.

## 2. What exists, and what needs attention

| Existing capability | What the extension needs |
|---|---|
| Stage 1 generates/emails a login-free link; drafts autosave | Reuse it for a versioned pre-joining package |
| Personal, address, statutory and bank details; document uploads | Add signed offer, separate address proof where needed, E2 and PCC-application proof |
| Candidate files populate Stage 3 | Reuse the same stored files; separate uploaded/received from HR-verified |
| Submission immediately imports answers and marks supplied document entries received | Enabled flow must stage answers for explicit HR review; uploading must not equal approval |
| Submitted links lock further editing | Allow controlled corrections and a read-only status/document view |
| Stage 4 collects signed NDA, handbook acknowledgement and job contract | Reuse relevant documents; map offer/E2 explicitly rather than assume they replace those requirements |
| Stage 5 creates/updates employee records and activates after its setup steps | Never invoke it to collect pre-joining information or mark someone ready |

The current card says answers await HR acceptance, but the actual submission imports them immediately. Reimport can overwrite corresponding HR-managed corrections. This must be handled explicitly for enabled records, not carried into the new review design.

Annexure C and E2 are ready according to HR, but their actual approved files were not supplied here. No matching Annexure C/E2 code reference was found. Review those files and their relationship to existing offer/contract templates before implementation.

## 3. Joining batches: your rule

- Monthly batch dates: **1st, 7th, 14th and 21st**.
- If a nominal batch date is Sunday, shift it to Monday, the next calendar date.
- Choose the nearest upcoming adjusted date based on the email-send date in **IST**, including the next month/year when necessary.
- Proposed same-day default: use the next date strictly after the send date, so a late email does not expect joining that same day. This is an explicit assumption for your approval, not an existing rule.
- No automatic Saturday or holiday adjustment: you specified Sunday only.
- Examples under that default: send 17 Oct 2026 → 21 Oct; send 21 Oct → 2 Nov (1 Nov is Sunday); send 31 Dec → 1 Jan 2027.

Show HR the calculated date before issuing the offer. The offer/Annexure C, email, form and HR draft must all use that same saved date. Sending validates it is still the correct upcoming batch; it must not silently send an old PDF with a different date. Use the successful first dispatch date as the scheduling reference; retries/resends of the same package do not move joining.

Once sent, freeze the offer version/date. A reschedule selects another valid batch and issues an explicit revision, preserving the earlier offer and acceptance. Require fresh signed acceptance and joining confirmation for the revised offer; retain unaffected approved identity/bank documents. Candidate requests a change; HR approves and reissues—candidate cannot edit the official date. Readiness after the date passes does not silently reschedule or activate employment.

Joining batch is separate from morning/evening work shift, training dates and hiring-requirement links. **No leave, encashment or appraisal policy changes are included.**

## 4. Proposed end-to-end experience

### HR prepares and sends

1. Use the existing onboarding draft, keeping its ATS/hiring-requirement link.
2. Enable optional pre-joining. HR sets designation, its department, shift, compensation and other employer-owned details.
3. Calculate the batch date, prepare/attach the approved offer with Annexure C, E2 and applicable existing documents. Preview the exact candidate-facing package.
4. Review required versus optional uploads. Publish a fixed package version and send one branded welcome email from the HR mailbox, with the offer attachment and existing self-service link. E2 and other reference documents remain available inside the form.
5. Record dispatch success/failure, package version and date. Failed email delivery is not “candidate informed.”

### Candidate uses one link

The form contains four sections: **Offer & joining date; Personal & bank details; Joining documents; Confirmation**.

- Download the exact offer/Annexure C and declaration E2.
- Upload the signed offer, fill details and upload identity, address, bank proof, signed E2 and PCC-application proof. Reuse current photo/education/experience requirements where applicable.
- One file may satisfy multiple checklist items if HR explicitly maps it (for example Aadhaar as identity and address evidence). No repeated upload solely because the same file appears in another stage.
- Save and return. See upload progress, saved state and outstanding items.
- Confirm intention to join on the offered date; submit. This is not confirmation that the candidate has actually joined.
- Receive a submission receipt. The page shows review status and requested corrections, not unrestricted access to editable personal data after submission.
- Offer decline/withdrawal and reschedule request remain explicit outcomes, with HR notified.

**PCC application proof is not a completed PCC.** Review the application receipt as that specific requirement; do not label the candidate police-cleared. Obtaining/reviewing a final PCC later would be a separate requirement if HR chooses one.

### HR reviews and completes joining

- Review each document and submitted field against the existing draft: approve, request correction or reject, with reviewer/time/reason.
- Approved values merge without silently overwriting newer HR edits. Conflicts require an explicit choice. Repeating approval must not duplicate files or reset previous decisions.
- Return only the requested fields/documents for correction through the same link. Keep earlier versions and unaffected approvals.
- Mark **Ready to join** only when the current offer's signed copy, required evidence, candidate confirmation and HR approval are all complete.
- On/after the agreed date, HR records actual joining and proceeds through existing Stage 5 reconciliation and setup. No automatic joining from the calendar, email open, signature upload or readiness.

## 5. Status and exception handling

Keep pre-joining status separate from the existing onboarding stage/status. Track offer outcome, submission review, readiness and actual joining independently.

```text
Package draft → Sent → Candidate submission → HR review
                           ↑                    │
                           └── Corrections ─────┘
                                                ↓
                                         Ready to join
                                                ↓
                                      HR confirms arrival
                                                ↓
                                       Existing finalization
```

Also handle expired/revoked links, offer decline, withdrawal, reschedule, HR rejection and no-show. Opening an email/link is not acceptance. Expiry is not rejection. Readiness is not employment.

For enabled records, access lasts through the joining/review window rather than assuming the current fixed 14-day invitation is enough. Exact expiry/reminder intervals stay configurable and require review. Rotating a compromised/expired link preserves the package, uploads and approval history while revoking the old link. After joining, candidate-link access closes; employee documents remain in the existing employee profile.

## 6. Effects on the current flow and safeguards

| Area | Treatment |
|---|---|
| Stage 1 | Optional package controls beside the current invite; ordinary invitations still work |
| Stage 2 / Organization | HR owns CTC/designation/shift. Department follows designation; DS1/DS2/DSX guards remain |
| Stage 3 / Stage 4 | Show existing uploads and new review decisions; no duplicate collection or automatic checkbox approval |
| Stage 5 | Enabled records get a server-enforced readiness/actual-joining gate before side effects, while retaining RazorpayX reconciliation and designation checks |
| Employee/ERP/biometrics | Sending, submission and readiness never create/activate an employee, issue credentials or enroll a device |
| RazorpayX | Existing supported registration/reconciliation remains. The ERP link cannot replace RazorpayX's required self-registration unless the official API explicitly supports it |
| Attendance/payroll/leave | No pre-joining attendance, accrual, salary or policy calculations; actual setup remains on joining |
| ATS / Workforce | Preserve identity, requirement and shift links; do not create another candidate/onboarding or fulfill a vacancy on acceptance |
| Workforce joining figures | Current logic already treats an open draft with a joining date as “joining.” Keep that forecast meaning; add separate readiness visibility rather than quietly redefine staffing totals |
| Existing records | Default disabled; no automatic historical backfill, re-review, new signing request or paid-month rewrite |

Cancellation before activation withdraws/revokes the package and clears readiness, retaining evidence. It must not call employee offboarding or delete payroll/history. If an external registration already exists, show HR its status and require deliberate supported cleanup; do not assume cancellation reverses it automatically.

## 7. Development required — technical design

- **Data:** Extend the existing onboarding record with optional-mode linkage; add versioned package/document manifest, submission versions, item-level HR review and append-only events. Reuse invite identity and private storage. Exact table names/schema follow live-schema review; migrations include explicit grants and scoped RLS.
- **Actions:** Extend the existing invite service for package reads, signed downloads/uploads, signed-offer submission, confirmation, controlled corrections and receipts. Add authenticated HR publish/revise/review/withdraw/readiness actions. Validate every state transition server-side and make submissions/reviews retry-safe.
- **Joining rule:** One shared tested IST batch-date calculator used for preview and authoritative sending; persist the chosen date/version. Detect stale offers and scheduling changes.
- **Screens:** Extend the existing candidate form and HR invite/review panels; show upcoming batch and readiness in the onboarding list, with missing-item filters. Keep candidate-facing content outside HR/admin screens.
- **Documents:** Connect the approved templates/current document email path; preserve the exact issued PDF, checksum and signature-upload version. Store once and link into onboarding and the employee document repository on finalization.
- **Email:** Branded welcome/offer, submission receipt, correction request, revised offer and readiness messages; delivery tracking and duplicate-send protection. Automated reminders are a later phase, with reviewed cadence.
- **Joining gate:** Check readiness before existing finalization starts. Existing finalization spans local writes and external actions, so audit retry/partial-success handling without pretending one database transaction can roll back an external service. No broad payroll/provisioning rewrite in this scope.

## 8. Security and evidence

The live invite table is HR-scoped and document storage is private. However, the onboarding table currently has a broad authenticated-user policy. Sensitive review data must not rely solely on hiding HR screens. Map existing legitimate access and enforce HR-scoped authorization for the new flow without breaking dependent operations.

Use unguessable, revocable scoped links; protect tokens in mail logs/telemetry, use no-referrer handling and short-lived signed file access. Consider email verification before sensitive document access/changes; no candidate ERP account is required. Enforce upload size/type/path ownership and validate required files actually exist. Assess malicious-file handling before rollout. Do not expose service credentials or permanent public URLs.

Record candidate submission time, exact offer/version, uploaded signature evidence, HR decision and date changes. Keep earlier evidence private and immutable; minimize personal data in logs. Define retention with HR/legal. Do not delete submitted evidence when links expire. Signature authenticity/legal sufficiency needs HR/legal review; a file upload is not a certified signature service.

## 9. Delivery sequence and verification

1. **Contract/template review:** obtain Annexure C, E2 and offer files; confirm mappings and the strictly-future batch assumption. Inventory current finalization/access gates.
2. **Optional foundation:** package versions, joining-date rule, permissions and disabled-by-default mode; verify unchanged standard onboarding.
3. **Single-link package:** downloads, signed-offer/document uploads, saved drafts, submission and receipts.
4. **HR review:** corrections, conflict-safe approved merge, readiness and versioned rescheduling.
5. **Joining handoff:** actual-arrival gate, existing finalization/document reuse, upcoming-batch readiness view.
6. **Pilot then rollout:** test one approved non-production candidate end-to-end; then enable deliberately for selected new candidates. Add reminders only after reviewing the pilot.

Tests cover all four batch dates, Sunday adjustment, month/year boundaries and IST send dates; stale/resend handling; optional-off regression; signed-offer version changes; missing/unverified E2/PCC blocking readiness; correction preserving other approvals/files; revoked-link denial; cross-candidate file denial; duplicate submit/review; no pre-joining provisioning/activation; actual-arrival handoff and retry/read-back after failures. Verify phone and desktop upload/review flows and current staffing totals before/after.

## Approval boundary

This is a plan only. No screens, database rules, emails or external services have been changed. Implementation needs your approval and the actual approved offer/Annexure C/E2 files. Leave, encashment and appraisal changes are excluded entirely. We will reuse the ERP form, but cannot promise to eliminate any separate RazorpayX-required registration without API validation.