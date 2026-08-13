# Add ERP account health to the Data Health page

Today Data Health only compares HRMS ↔ RazorpayX ↔ eSSL. ERP login accounts (`users`) are never checked, so an ERP login can exist with no employee behind it, or hold a stale email/phone/name versus HRMS, and nothing surfaces it.

## What the user sees

A new "ERP accounts" section on the Data Health page, in the same compact card style as the rest of the page, with a headline count and grouped rows:

- **ERP user without badge ID** — a login that isn't anchored to any HRMS employee. Sub-labelled either "matches an HRMS employee by email — badge ID missing" (fixable in one click) or "no HRMS employee at all — should not have ERP access".
- **Badge ID points to no HRMS employee** — orphan badge on the login.
- **Data mismatch vs HRMS** — for badge-linked logins, per-field rows for email, phone, name (compared case/space/punctuation-insensitively, same normalisation used elsewhere).
- **Active ERP login for an inactive employee** — login still usable after separation.
- **Active employee with no ERP account** — the reverse gap, counted so ERP provisioning gaps are visible.

Each row shows the person, badge ID, ERP value vs HRMS value, and links to the employee profile / User Management. Row actions:

- **Link badge ID** — writes the HRMS badge ID onto the matched ERP login (email match only).
- **Adopt HRMS value** — copies HRMS email/phone/name onto the ERP login.
- **Deactivate ERP login** — for active logins of inactive employees (reuses the existing deactivation helper, which also force-logs-out).
- **Exempt this account** — for genuine non-person logins (system/shared mailbox accounts), so they stop appearing. Exemptions are stored and listed, never silently dropped.

Nothing is auto-fixed; every change is an explicit click.

## Current state (verified)

- 37 ERP logins: 28 have no badge ID; of those, 20 match an HRMS employee by email (fixable link), the rest have no HRMS match.
- 1 login carries a badge ID with no matching HRMS employee.
- Among badge-linked logins: 3 email mismatches, 2 phone mismatches, 0 name mismatches.
- 2 active ERP logins belong to inactive employees.
- 12 of 35 active employees have no ERP login by badge or email.

## Technical notes

- New read-only SQL view `public.hr_erp_account_health_v` (plus a small exemption table `hr_erp_account_exemptions` with badge/user id + reason + who) computing one row per issue: `issue_type`, `user_id`, `hr_employee_id`, `field`, `erp_value`, `hrms_value`, `severity`. Matching order: badge ID (upper/trim) → email (lower/trim). Grants + RLS scoped to HR staff via `public.hr_is_hr_staff(auth.uid())`, plus `service_role`.
- New component `src/components/hrms/health/ErpAccountHealthPanel.tsx` (react-query, 60s staleTime) rendered inside `DataHealthPage.tsx` next to the existing panels; a summary tile joins the existing tile row.
- Fix actions are direct `users` updates from the panel (badge_id / email / phone / first_name+last_name) and `deactivateErpAccount` from `src/lib/erpAccountDeactivation.ts`; all confirmations use `AlertDialog`.
- No change to `hr_drift_alerts` or `hr-drift-scan` — ERP checks are computed live from the DB, so they need no scan run and can't leave stale alerts behind.
