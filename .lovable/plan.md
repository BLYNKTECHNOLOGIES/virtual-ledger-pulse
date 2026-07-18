# RazorpayX Payroll API — Implementation Map

All Opfin calls flow through one edge function:
**`supabase/functions/razorpay-payroll-proxy/index.ts`** (aliased as `"ln"` in `supabase.functions.invoke("ln", …)`).
Line numbers below reference that file unless stated otherwise.

Legend: ✅ implemented · 🟡 wired but only via generic pass-through / probe · ❌ not implemented

---

## People (5 endpoints)

### 1. People / Create — `people/create` ✅
- **Proxy call site:** line ~4412 (`request: { type: "people", "sub-type": "add" }`) inside `push_person_apply_*`.
- Note: Opfin accepts both `create` and `add`; we standardized on `add`. Registry entry: `people_create` in the sub-type registry (~line 4488 area).
- **Callers (UI):**
  - `src/pages/hr/RazorpaySyncPage.tsx` — `push_person_apply_one` / `push_person_apply_bulk` (lines 475, 498).
  - `src/components/hrms/onboarding-pipeline/OnboardingWizard.tsx` line 346 — `action: "create_person"`.

### 2. People / Edit — `people/edit` ✅
- **Proxy:** direct call sites at lines 1681 and 1885 (bank + profile edits inside push_bank / push_person flows).
- Registry: `people_edit` (~4488 block).
- **Callers:**
  - `src/pages/hr/RazorpaySyncPage.tsx` — `push_bank_apply_one/bulk`, `push_person_apply_one/bulk`.
  - `src/lib/razorpayPushback.ts` — pushback helper used across the app.

### 3. People / View — `people/view` ✅
- **Proxy:** line 91 (single fetch) and line 4489-ish registry (`people_view`).
- **Callers:**
  - `src/pages/hr/RazorpaySyncPage.tsx`: `fetch_one` (line 349), `pull_person_full` (line 407), `probe_catalogue` (line 427).
  - `src/pages/horilla/EmployeeProfilePage.tsx` line 263 — `pull_person_full` (Payroll tab, bank pull).
  - `src/components/hrms/onboarding-pipeline/Stage5Finalization.tsx` line 170 — `pull_person_full` during finalization.

### 4. People / Set Salary — `people/set-salary` ✅
- **Proxy:** salary write path at line ~2134 (comment "sub-type set-salary") and line 2155.
- Registry: `people_set_salary`.
- **Callers:** `src/pages/hr/RazorpaySyncPage.tsx` — `push_salary_dry_run`, `push_salary_apply_one` (623), `push_salary_apply_bulk` (647), `record_salary_envelope_verified` (595).

### 5. People / Dismiss — `people/dismiss` ✅
- **Proxy:** registry `people_dismiss` at line 4489 (write, gate: salary, requireAck: true).
- **Callers:** `src/lib/razorpayPushback.ts` lines 221, 236, 253, 268 — used by `ResignationTab.tsx` (offboarding) and the auto-filter for dismissed employees during payroll import.

---

## Payroll (5 endpoints)

### 6. Payroll / View — `payroll/view-payroll` ✅
- **Proxy:** direct call at line 175 (single-employee) and line 380 (range/bulk); registry `payroll_view_payroll` line 4490.
- Also used by the daily cron `razorpay-auto-sync-payslips-daily` via internal `x-razorpay-sync-secret`.
- **Callers:**
  - `src/pages/hr/PayslipHistoryImportPage.tsx` line 61 — `import_payslip_history_range`.
  - `src/components/hrms/RazorpayPayslipsSection.tsx` — employee Payroll tab (24h refetch).
  - `src/pages/hr/RazorpaySyncPage.tsx` — range dry-run/apply (line 754+).

### 7. Payroll / Add Additions — `payroll/add-additions` 🟡
- **Proxy:** registry `payroll_add_additions` line 4491 (write, gate: payroll). Reachable via the generic `probe_endpoint` / `run_sub_type` executor.
- **Dedicated UI caller:** none yet — no HRMS button constructs a bonus/addition envelope. Runs today only through the proxy's generic executor.

### 8. Payroll / Add Deductions — `payroll/add-deduction` 🟡
- **Proxy:** registry `payroll_add_deduction` line 4492.
- **Dedicated UI caller:** none. Same status as Additions — generic executor only. Our own LOP/loan deductions are computed inside `fn_generate_payroll`, not pushed to Opfin.

### 9. Payroll / Reset — `payroll/reset-modifications` 🟡
- **Proxy:** registry `payroll_reset_modifications` line 4493.
- **Dedicated UI caller:** none — reachable only through the generic executor.

### 10. Payroll / Pause-Resume — `payroll/do-not-pay` 🟡
- **Proxy:** registry `payroll_do_not_pay` line 4494.
- **Dedicated UI caller:** none — reachable only through the generic executor.

---

## Contractor Payments (4 endpoints)

### 11. Contractor / Create Payment — `contractor-payment/create` 🟡
- **Proxy:** registry `contractor_payment_create` line 4495 (write, gate: payouts).
- **Dedicated UI caller:** none. The HRMS treats everyone as `type: employee`; no contractor payout screen exists.

### 12. Contractor / Delete Payment — `contractor-payment/delete` 🟡
- **Proxy:** registry `contractor_payment_delete` line 4496.
- **UI caller:** none.

### 13. Contractor / View Pending — `contractor-payment/list-pending` 🟡
- **Proxy:** registry `contractor_payment_list` line 4497 (read).
- **UI caller:** none. Only the generic probe hits it.

### 14. Contractor / Check Status — `contractor-payment/get-status` 🟡
- **Proxy:** registry `contractor_payment_status` line 4498.
- **UI caller:** none.

---

## Attendance (3 endpoints)

### 15. Attendance / Modify-Add (POST) — `attendance/modify` ✅
- **Proxy:** direct call block around line 2629 (`sub-type "modify"`, urlPath `att`, bodyType `attendance`). Also mentioned at line 2227 comment.
- **Callers:** `src/pages/hr/RazorpaySyncPage.tsx` — `push_attendance_dry_run` (663), `push_attendance_apply_one` (710), `push_attendance_apply_bulk` (737), `record_attendance_envelope_verified` (683).

### 16. Attendance / Fetch — `attendance/fetch` 🟡
- **Proxy:** registry `attendance_fetch` line 4500 (read, no gate). Reachable via generic executor and `probe_catalogue`.
- **Dedicated UI caller:** none — we own attendance locally (v4 engine on `hr_attendance_daily`), so we push to Opfin rather than fetch from it.

### 17. Attendance / Edit (PATCH) — `attendance/modify` (PATCH) ❌
- **Not implemented.** Our proxy only issues POST to `/att` with sub-type `modify` (line 2629 block). The PATCH variant is not wired anywhere. Since Opfin's POST `modify` is upsert-shaped and covers our push path, this hasn't been needed — call it out if you want a true partial-edit path.

---

## Advance Salary (1 endpoint)

### 18. Advance Salary / Create — `advance-salary/create` 🟡
- **Proxy:** registry `advance_salary_create` line 4499 (write, gate: payouts, urlPath `advanceSalary`, bodyType `advance-salary`).
- **Dedicated UI caller:** none. Advances are tracked internally via `hr_loans` and processed in `fn_generate_payroll`; no button today pushes an advance to Opfin.

---

## Summary

| Category | Implemented (dedicated flow) | Registered only (generic executor) | Not implemented |
|---|---|---|---|
| People | Create, Edit, View, Set Salary, Dismiss (5/5) | — | — |
| Payroll | View (1/5) | Add Additions, Add Deductions, Reset, Do-Not-Pay (4) | — |
| Contractor Payments | 0/4 | All 4 | — |
| Attendance | Modify (POST), (Fetch registered) (1/3) | Fetch | PATCH Edit |
| Advance Salary | 0/1 | Create | — |

If you want, next step can be:
1. Build dedicated HRMS UIs for the 🟡 items you actually plan to use (most commonly: Payroll Additions/Deductions and Advance Salary), or
2. Add the PATCH `attendance/modify` variant to the proxy.

Tell me which to prioritize and I'll plan the build.
