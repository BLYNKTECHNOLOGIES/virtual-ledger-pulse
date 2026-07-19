# Payroll doctrine v2 — build shadow engine, drop legacy, wire drift resolution

Locking the three answers into a coherent build. Sequenced so each stage is safe to ship on its own.

## Stage 1 — Retire the legacy engine cleanly

Purpose: eliminate the "two engines, unclear source" confusion before the new one goes in.

- Drop `public.fn_generate_payroll` and `public.apply_due_scheduled_salary_revisions` (the last remaining local-compute callers) via migration.
- Delete `supabase/functions/apply-scheduled-salary-revisions/index.ts` and remove its cron entry.
- Remove any HRMS UI that still points at legacy runs (`hr_payroll_runs`, "Generate Payroll" buttons) — keep the tables read-only for history until the new engine has ≥1 month of data, then archive.
- Anything reading `hr_payslips` gets a "legacy" badge; new authoritative payslips are Razorpay-imported (`hr_razorpay_payslip_records`) already.

## Stage 2 — Shadow engine ("Payroll Calculation (Building)")

Purpose: fully-built independent calculator, RazorpayX-settings-driven, output isolated for A/B against Razorpay.

New schema (fully separate namespace — no other module reads it):
- `hr_shadow_payroll_runs` — one row per (period_month, run_no)
- `hr_shadow_payroll_lines` — one per employee per run with computed CTC → gross → statutory → net breakdown
- `hr_shadow_component_breakdown` — Basic/HRA/Special/LTA/OT/LOP/Bonus per line
- All tables marked `shadow_only=true`; RLS grants read to HR/Admin only.

Calculator (`compute-shadow-payroll` edge function):
- Reads employee monthly gross + `hr_razorpay_settings` (compliance + leave/attendance + default structure mirror + bonus catalogue).
- CTC split follows the Razorpay Default Structure mirror (Basic 50%, HRA 25%, Special 15%, LTA 10%) when `use_xpayroll_default_structure=true`; otherwise reads whatever custom structure the mirror stored for that employee.
- Statutory deductions computed dynamically (matching Razorpay behavior — no hardcoded slabs in the structure UI):
  - **EPF**: 12% of PF wage base per `pfWageBase()` helper, respecting `pf_wages_basic_only` and `pf_wage_cap_15000` toggles. Employer share follows `pf_include_employer_in_ctc` / `pf_include_admin_edli_in_ctc`.
  - **ESI**: eligibility gate on regular-wage-only gross ≤ ₹21,000/mo; 0.75% employee + 3.25% employer on full gross including additions (per `esi_include_additions_in_wages`). Half-year contribution period respected.
  - **PT**: state-slab lookup (`hr_pt_slabs`) on `v_stat_base`.
  - **TDS**: YTD projection true-up per selected regime (`hr_filing_statuses`), New vs Old.
- LOP: `lopPerDayBasis()` × unpaid days (from v4 attendance daily rollup).
- Additions/one-offs consumed from `hr_payroll_input_additions` / `hr_payroll_input_deductions` (bonus subtype tags flow through).
- Output tagged `shadow_only`. Never referenced by profile pages, payslip PDFs, employee CTC surfaces, or Razorpay push flows.

UI: `/hrms/payroll/shadow-calculator` (new tab, sidebar entry under Payroll with "Building" pill)
- Period selector + "Run shadow calculation" button.
- Table: Employee | Shadow Gross | Razorpay Gross | Shadow Net | Razorpay Net | Δ Statutory | Actions.
- Row expand → component-by-component diff (Basic/HRA/…/PF/ESI/PT/TDS/LOP) with side-by-side numbers.
- Big banner: "Advisory only — do not use for payout." across the whole page.

## Stage 3 — Drift ledger on Data Health (bidirectional resolve)

Purpose: every mismatch between HRMS and Razorpay gets a human resolution recorded.

- Extend `hr_drift_alerts` with `resolution_direction` (`hrms_wins` | `razorpay_wins`), `resolved_at`, `resolved_by`, `resolution_note`.
- New "Resolve" action per row on `DataHealthPage.tsx` (already the drift hub) with two clearly-labeled buttons:
  - **"Razorpay is correct → update HRMS"** — patches the local field, writes an audit entry.
  - **"HRMS is correct → push to Razorpay"** — calls the appropriate razorpay-payroll-proxy verb (`push-employee-field`, `push-structure`, `push-attendance`), refetches, closes alert.
- Add drift detectors for the fields not currently monitored: bank details, PAN, DOB, filing status, salary structure components, monthly gross, weekly-off pattern, LOP days.
- Sidebar Data Health tile shows unresolved count; row filters by field/employee/period.
- Statutory-filing rollup already there — leave it, just gets the same resolve action.

## Stage 4 — Structure management via HRMS (deferred detail)

Waiting for the sample payslips you mentioned — they'll show me exactly which statutory rows are on the Razorpay-generated payslip so I can confirm my dynamic PF/ESI/PT/TDS logic matches. Once received:
- Per-employee structure editor in `EmployeeProfilePage` (Basic/HRA/Special/LTA % or fixed) that POSTs to Razorpay `custom-structure` via proxy → refetch → mirror upsert. The Razorpay default template stays as the fallback preview when no custom structure is set.
- Structure edits are RLS-guarded (service_role only in DB, edge function does the push+refetch) — HR can't silently override the mirror.
- Bulk CSV importer: extend `SalaryRegisterImportPage.tsx` to also parse the "structure" columns (Basic/HRA/…) from the Razorpay salary register and update the mirror for every listed employee. Same import flow, extra column pass.

## Stage 5 — Employee profile: payroll history reflection

Purpose: make Razorpay-imported history the single visible source in every profile.

- `EmployeeProfilePage → Payroll` tab already lists `hr_razorpay_payslip_records` — audit that every month with a Razorpay record shows: month, gross, net, PF/ESI/PT/TDS (register CSV values when available with source tag), Razorpay dashboard link.
- Bulk historical fetch: one-click "Backfill from Razorpay" button that runs `discover_and_seed_runs` + `import-payslip-history` for the selected employee across all available months.
- After the CSV structure importer (Stage 4) lands, the profile also shows the current structure with source tag (`register_csv` vs `razorpay_pushed`).

## Stage 6 — Extend HRMS-driven operations (ongoing)

Add each API-supported operation as its own small PR, not one big batch:
- eSSL: bulk enroll, fingerprint template pull, per-device user list diff report (device commands infrastructure already exists).
- Razorpay: push additions/deductions, push filing-status changes, trigger payroll run, dismiss employee, update bank account. Each becomes an HRMS button that calls proxy → refetches → mirror. Dashboard-only actions (payroll execute button, TDS certificate download) stay as deep links.

## Technical notes

Files created/edited (Stage 1–3, immediate):
- Migration: drop legacy fn + apply_due_scheduled_salary_revisions; add shadow tables; extend `hr_drift_alerts` columns.
- `supabase/functions/compute-shadow-payroll/index.ts` — new.
- `supabase/functions/apply-scheduled-salary-revisions/` — delete + cron entry removed.
- `src/pages/hr/ShadowPayrollPage.tsx` — new.
- `src/pages/horilla/DataHealthPage.tsx` — add resolve dialog, direction buttons, expanded field coverage.
- `src/components/hrms/HorillaSidebar.tsx` — add "Payroll Calculation (Building)" entry.
- `src/lib/hrms/statutoryCalculator.ts` — new: shared PF/ESI/PT/TDS helpers used only by the shadow engine.

Non-negotiables carried forward:
- `<SourceTag>` on every payroll figure. Shadow numbers tagged `shadow_only` (new tag variant).
- Razorpay stays the authority. Zero reads from shadow output outside the shadow tab.
- Attendance engine v4 remains local and unchanged — it's the input feed, not a payroll authority.

## Open item

Awaiting the sample payslips you offered — those unlock Stage 4 (structure editor) and let me validate the Stage 2 statutory math against a real Razorpay output before shipping the shadow engine to HR.

Approve and I'll start with Stage 1 (kill legacy) and Stage 2 (shadow engine + UI) in the same batch, then Stage 3 (drift resolve). Stages 4–5 land after you share the payslip samples.