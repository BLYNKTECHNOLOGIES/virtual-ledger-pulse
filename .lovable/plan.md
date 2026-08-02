# Statutory Enrollment & Voluntary PF (VPF) — HRMS + RazorpayX

## What exists today (verified)

- `hr_employees` already has `pf_enabled`, `esi_enabled`, `pt_enabled`, `statutory_flags_source` — but of 37 active employees, 33 are NULL for all three (only 3 PF-true, 1 ESI-true). The flags are effectively unused.
- **There is no UI anywhere to set them.** Code comments point at `/hrms/payroll/compliance-settings`, but no such route exists in `App.tsx`.
- The shadow payroll engine already reads the flags (`statutoryCalculator.ts`: `enrollment?.pf_enabled ?? global toggle`), falling back to the org-level `hr_razorpay_settings.compliance_files_pf/_esi/_pt`.
- The Razorpay proxy has `push_statutory_apply_one` which pushes `pf-enabled` / `esi-enabled` / `professional-tax-enabled`, but it is **blocked** until an operator records a verified envelope key (`STATUTORY_ENVELOPE_UNVERIFIED`).
- **No VPF field exists anywhere** — not in employees, structures, shadow lines, payslips, or the register import.

## Decisions locked

- VPF entered as **either a percentage of PF wages or a fixed monthly ₹**.
- PF wage base is **capped at ₹15,000 by default**; an uncapped ("actual Basic") option exists per employee, and any salary revision that pushes Basic above ₹15,000 **auto-reverts that employee to capped** (logged, with an HR-visible note).
- All statutory settings are **effective-dated with full history** — a change applies from a chosen payroll month; closed/past months keep their old settings.
- **CTC stays fixed.** Enrolling or de-enrolling moves money *inside* the CTC (employer PF/ESI carved out of, not added to, CTC) — consistent with the all-inclusive CTC rule already implemented in the shadow engine.

## What gets built

### 1. Effective-dated statutory profile per employee

New table `hr_employee_statutory_profiles` holding, per employee and effective month:

- PF enrolled (yes/no), PF wage basis (capped ₹15,000 / actual Basic)
- VPF mode (none / percent / fixed) + value
- ESI enrolled (yes/no) — with the ₹21,000 gross eligibility still enforced automatically
- PT enrolled (yes/no)
- UAN / ESIC number carried alongside, reason for change, who changed it, when

The current `hr_employees.pf_enabled/esi_enabled/pt_enabled` columns become a **derived cache of today's active row**, kept in sync by a trigger, so all existing readers (shadow engine, Razorpay push, drift scans, F&F) keep working unchanged.

A one-time backfill seeds every active employee from what RazorpayX/the salary register actually shows for them (PF/ESI amounts present in the latest imported register month ⇒ enrolled), rather than guessing — anyone with no evidence is seeded from the org-level toggles and flagged for HR review.

### 2. Statutory Settings page — `/hrms/payroll/statutory-settings`

- One row per employee: name, ID, Basic, PF chip, PF base chip (capped/actual), VPF chip, ESI chip (with "gross above ₹21,000 — auto-ineligible" state), PT chip, UAN/ESIC presence.
- Inline edit dialog per employee: enrol toggles, PF base choice, VPF mode + value, effective month, mandatory reason.
- **Bulk actions**: select many employees → enrol/de-enrol PF, ESI or PT from a chosen month.
- Filters: not enrolled in PF, ESI-eligible but not enrolled, VPF active, missing UAN/ESIC, out of sync with RazorpayX.
- History drawer per employee showing every past change with dates and actor.
- Mobile-first layout using the existing HRMS `ResponsiveList` primitives.
- Gated behind the existing HR/payroll permission, same as other payroll pages.

### 3. Payroll maths

`statutoryCalculator.ts` and `compute-shadow-payroll`:

- PF wage base = `min(Basic, 15000)` or actual Basic per the employee's basis; existing DA/basic-only org rules preserved.
- VPF = percent × PF wage base, or the fixed amount — **employee-side deduction only, no employer match, no EDLI/admin on VPF**. It reduces net pay and never changes CTC or gross.
- ESI stays gated by both enrollment and the ₹21,000 regular-gross ceiling; **mid-year ESI contribution-period rule** honoured via the existing `hr_esi_contribution_periods` table (an employee crossing ₹21,000 mid-period continues contributing until the period ends).
- De-enrolled employees produce zero PF/ESI/PT lines and, because CTC is fixed, the freed employer share flows to take-home — the CTC-inclusive carve-out logic already added is reused so gross never exceeds CTC.
- LOP interaction: PF/ESI/VPF are computed on post-LOP wages, matching the register.
- New joiners / leavers: statutory applies only to the months inside their employment span (already clamped by `hr_lop_days`).

### 4. RazorpayX handling — honest about API limits

- PF/ESI/PT toggles: reuse `push_statutory_apply_one`, extended to bulk ("push all changed"), still behind the operator-verified envelope gate. If the envelope isn't verified, the UI shows a clear "Razorpay write path locked — verify envelope first" banner instead of silently failing.
- **VPF: RazorpayX Payroll's public API publishes no documented VPF field.** It will be marked *Out of RazorpayX API Scope* in the UI: HRMS stores and computes it, the page shows a "set manually in the RazorpayX dashboard" task with a Mark-as-done acknowledgement, and a drift alert stays open until acknowledged. No fabricated success, no invented endpoint.
- **Verification back:** after each push, re-read the employee from Razorpay and compare — mismatch raises a Data Health drift alert (same `pushWithVerification` pattern already used).
- **Reverse drift:** the register/payslip import compares imported PF/ESI/PT/VPF amounts against the HRMS profile; if Razorpay deducted PF for someone HRMS says is not enrolled (or vice-versa), a drift alert is raised on `/hrms/data-health` with employee name and ID.

### 5. Salary revision interlock

- `ReviseSalaryDialog` shows the statutory impact preview: new Basic, new PF wage base, PF/ESI/VPF change, net effect — before confirming.
- If the revision pushes Basic above ₹15,000 while the employee is on "actual Basic", the profile **auto-switches to capped** from the revision's effective month, with a logged reason and a note in the revision record.
- If a revision pushes regular gross above ₹21,000, ESI is auto-ended at the correct contribution-period boundary rather than immediately.

### 6. Visibility & guardrails

- Employee self-service (ERP profile → Salary & PF): read-only display of PF enrolment, PF base, VPF amount and ESI status. No edit.
- Payslip/`hr_payslips_v`: VPF surfaced as its own deduction line so imported and shadow payslips reconcile.
- Closed payroll months are locked — statutory edits cannot be back-dated into a locked month.
- Every change written to the HR audit log; Data Health gains three checks: missing UAN for PF-enrolled, missing ESIC number for ESI-enrolled, and HRMS-vs-Razorpay statutory mismatch.

## Technical notes

- New table + trigger-maintained cache columns via one migration; `statutory_flags_source` set to `hrms_profile` for managed rows.
- Resolver function `hr_statutory_profile(employee, month)` used by both SQL (LOP/payslip views) and the edge function so there is exactly one source of truth.
- `compute-shadow-payroll` and `statutoryCalculator.ts` gain a VPF and PF-basis input; existing signatures stay backward-compatible.
- `razorpay-payroll-proxy`: extend `push_statutory_apply_one` with a bulk variant and add read-back verification; no new Razorpay endpoints are invented.
- Re-run the August 2026 shadow payroll after the change and verify totals, zero negatives, and per-employee PF/ESI/VPF against the imported register before declaring it done.
- Append a dated line to `docs/STATE_LOG.md` when the profiles are backfilled.
