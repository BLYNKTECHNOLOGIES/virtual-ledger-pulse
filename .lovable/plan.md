# Salary Revision — Full Implementation

## Problem
`SalaryRevisionsPage` is read-only. The only path to change salary today is the Employee Profile → Work Info form, which:
- Edits only `basic_salary` (not `total_salary`)
- Has no reason, effective-date, or type inputs
- Auto-inserts every save as `'correction'` via the `fn_salary_revision_on_change` trigger (which is why your list is full of `₹0 · correction` rows)
- Doesn't recompute percentage/formula-based salary structure components

## What we're building

### 1. UI — "Revise Salary" on Salary Revisions page
Add a primary **"Revise Salary"** button to `SalaryRevisionsPage.tsx` opening a dialog with:
- **Employee** (searchable Select, active employees only) — shows current CTC / basic inline
- **Revision type** — Increment / Hike, Promotion, Correction, Demotion / Decrease
- **New total salary (CTC)** — number input with % delta vs current shown live
- **New basic salary** — number input; auto-suggested from the employee's salary structure template (BASIC component %) but editable
- **Effective from** — date picker (shadcn), defaults to today; may be future-dated
- **Reason / notes** — textarea (mandatory for Promotion & Demotion)
- **Live preview** — uses `computeFullBreakdown` from `src/lib/hrms/salaryComputation.ts` to show earnings, deductions, and net so the HR user sees the full recomputed structure before saving
- **Approved by** — auto-filled from current user

Also add a **"Revise" button** on each row of `EmployeeProfilePage` (Work Info section) that opens the same dialog pre-selected — so it's reachable from both places.

### 2. Behavior — scheduling by effective date
Two cases:

**A. Effective date ≤ today (immediate):**
- Update `hr_employees.basic_salary` and `total_salary` now
- Trigger auto-inserts the `hr_salary_revisions` row — but we set a Postgres session var `app.revision_type`, `app.revision_reason`, `app.approved_by`, `app.effective_from` before the UPDATE via a new RPC so the existing trigger tags the row correctly (the trigger at `20260328194737_...sql:169` already reads `app.revision_type`; we extend it to read the other three)

**B. Effective date > today (scheduled):**
- Insert a `hr_salary_revisions` row directly with `status = 'SCHEDULED'`, target amounts, but DO NOT touch `hr_employees` yet
- New daily cron edge function `apply-scheduled-salary-revisions` runs at 00:15 IST → for every SCHEDULED row where `effective_from <= CURRENT_DATE`, applies the change to `hr_employees` (which triggers the audit row auto-tag as APPLIED) and marks the scheduled row as `APPLIED`

### 3. Schema changes (migration)
On `hr_salary_revisions`:
- Add `status text NOT NULL DEFAULT 'APPLIED'` — values: `SCHEDULED | APPLIED | CANCELLED`
- Add `revision_reason` already exists; ensure `approved_by` and `effective_from` are populated by trigger
- Add unique partial index preventing two SCHEDULED revisions for same employee/effective date
- Widen `revision_type` CHECK: `('increment','promotion','correction','demotion')`

Extend `fn_salary_revision_on_change` trigger to also read `app.revision_reason`, `app.approved_by`, `app.effective_from` from session vars.

New SECURITY DEFINER RPC `apply_salary_revision(p_employee_id, p_new_basic, p_new_total, p_type, p_reason, p_effective_from, p_approved_by)`:
- If effective_from > today → INSERT SCHEDULED row, return
- Else → set session vars, UPDATE `hr_employees`, trigger writes history row
- Permission-gated: caller must have `hrms_manage` (or Super Admin)

RLS: keep existing read policy; add INSERT/UPDATE policies scoped to `hrms_manage`.

### 4. Cancel scheduled revisions
Scheduled rows on the list show an amber **"SCHEDULED · Effective DD MMM"** badge with a Cancel button (marks status = `CANCELLED`, hidden from applied history filter).

### 5. Cleanup — the ₹0 corrections
One-off migration marks all pre-existing rows where `previous_total = new_total` and `previous_basic = new_basic` as `status = 'NOOP'` (hidden from list by default, viewable via filter). The auto-trigger already guards with `IS DISTINCT FROM`, so future no-op rows shouldn't be created — but the historical ones are already in your list.

### 6. Filters on the list
Add tabs above the search: **All · Applied · Scheduled · Cancelled**. Default = Applied.

---

## Technical touch points

**Files to add:**
- `src/components/hrms/ReviseSalaryDialog.tsx` — the dialog
- `supabase/functions/apply-scheduled-salary-revisions/index.ts` — daily cron

**Files to modify:**
- `src/pages/horilla/SalaryRevisionsPage.tsx` — button, filter tabs, cancel action, status badges
- `src/pages/horilla/EmployeeProfilePage.tsx` — replace inline basic-salary edit with a "Revise Salary" button opening the dialog (keeps single source of truth for salary changes; other Work Info fields still editable)

**Migrations:**
1. Add columns (`status`), CHECK on `revision_type`, extend trigger to read the extra session vars, create `apply_salary_revision` RPC, RLS policies
2. Mark historical no-op rows as `NOOP`
3. Cron job for `apply-scheduled-salary-revisions`

**Computation reuse:** `computeFullBreakdown` from `src/lib/hrms/salaryComputation.ts` for live preview — already the payroll source of truth, so what you see in the dialog matches what payroll will actually pay.

## Out of scope
- Bulk / mass revisions (org-wide hike)
- Employee-facing revision letter PDF
- Multi-approver workflow (you chose "Apply immediately")

Both can be layered on later without schema changes.
