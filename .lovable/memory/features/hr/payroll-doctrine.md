---
name: Payroll doctrine — RazorpayX is authority
description: RazorpayX is the primary payroll computation authority; HRMS is a faithful image (feeder of inputs, mirror of outputs). Every payroll figure carries a source tag; salary structures are a read-cache.
type: constraint
---
RazorpayX is the payroll authority. HRMS never computes payroll for payout-facing surfaces.
`fn_generate_payroll` is retired (raises). Only local math allowed is clearly-labeled `local_estimate` on advisory surfaces.

Every payroll figure in UI must render with `<SourceTag>` from `src/components/hr/payroll/SourceTag.tsx`:
- `razorpay` (executed API response)
- `register_csv` (monthly Salary Register CSV — only source for PF/ESI/PT/TDS component splits and employer contributions)
- `dashboard_only` (visible on dashboard, not in API — pair with `<DashboardLink />`; never invent splits)
- `local_estimate` (HRMS-computed, advisory only)

`hr_employee_salary_structures` is a read-cache: authenticated INSERT/UPDATE/DELETE blocked by RLS; only `service_role` (razorpay-payroll-proxy push→refetch) may mutate. Any structure edit must POST to RazorpayX → refetch → upsert with `source='razorpay_pushed'`, `synced_at=now()`.

Primary payroll alarm is `hr_razorpay_payroll_freshness` (last pull per employee/period + CSV state), NOT math-vs-math drift. Drift comparisons kept but labeled advisory.

Attendance engine v4 remains local — RazorpayX has no attendance computer.
Full doctrine: `docs/PAYROLL_DOCTRINE.md`.
