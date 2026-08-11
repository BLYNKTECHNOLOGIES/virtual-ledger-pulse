# Separation page: HR Manager sees an empty employee list

## What is actually wrong

This is not a UI bug and not specific to the Separation page. The `hr_employees` table has exactly two read rules:

- Employees can read **their own record** (`user_id = auth.uid()`).
- "HR admins" can read everything — but that rule checks `has_role(auth.uid(), 'hr')`.

There is no role literally named `hr` in this system. The roles table contains **`HR Manager`** (alongside Super Admin, Admin, COO, Finance, etc.). So the HR-admin rule never matches, and an HR Manager falls through to the employee-self rule — they see exactly one row, their own. You see the full list because you are Super Admin, which the same rule does match.

This is the exact failure mode already recorded in project memory (`HR role matching`): never gate on `has_role(uid,'hr')`; use the helper `public.hr_is_hr_staff(uid)`, which exists in the database and resolves the real role name.

## Scope: this is not one policy

The same wrong literal appears in **18 policies across 15 tables**, so HR Managers are silently locked out of far more than Separation:

```text
hr_employees                      hr_payslips
hr_penalties                      hr_payroll_cockpit_state
hr_payroll_input_additions        hr_payroll_input_deductions
hr_attendance_period_locks        hr_attendance_stale_sessions
hr_attendance_absent_marker_runs  hr_biometric_device_users
hr_biometric_pin_history          hr_employee_id_rekey_log
hr_esi_contribution_periods       hr_pt_slabs
hr_razorpay_contractor_payments
```

Fixing only `hr_employees` would make the Separation dropdown populate and leave a dozen other HR screens quietly half-broken. Per the data-integrity standard for this project, the fix should address the category, not the one reported instance.

A further three tables (`hr_employee_documents`, `hr_fnf_settlements`, `hr_email_send_log`, `hr_salary_revisions`) reference `'hr'` in a different shape and will be re-read individually before being touched — they are included only if they carry the same defect.

## The fix

One migration that rewrites every affected policy to call `public.hr_is_hr_staff(auth.uid())` in place of `has_role(auth.uid(), 'hr')`, preserving each policy's existing Super Admin / Admin branches and its command scope (SELECT vs ALL vs INSERT/UPDATE) exactly as-is. No policy is widened beyond what its name already promises; the `hr` branch simply starts matching the role it was always meant to match.

Employee self-service rules (`user_id = auth.uid()`) are left untouched, so nothing an ordinary employee can see changes.

## Verification before I report back

1. Re-query `pg_policies` and confirm zero policies still contain the `'hr'` literal.
2. Run a read of `hr_employees` under an actual HR Manager account and confirm the full roster returns rather than a single row.
3. Load `/hrms/separation` and confirm the Initiate Resignation dropdown populates for that account.

## Technical notes

- No frontend changes. `ResignationTab.tsx` queries `hr_employees` correctly; it was being handed one row by the database.
- No schema changes, no new tables, therefore no new GRANTs required — the affected tables are already reachable by `authenticated`.
- `public.hr_is_hr_staff` already exists and is used elsewhere; no new function is introduced.
