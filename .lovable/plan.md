
## Critical finding first — RazorpayX does NOT have a template CRUD API

Before designing anything, this must be clear because it changes the shape of "Full CRUD":

- The RazorpayX Payroll public API (`documenter.getpostman.com/view/11662503/Tzm5HckE`) has **no `salary-structure` resource** and **no `structure_id`**. The Postman collection only exposes: People, Payroll, Contractor Payments, Attendance, Advance Salary.
- The **only** salary-write is `POST /api/people` with `request.sub-type: "set-salary"`. Payload is **either** `{annual-ctc: 600000}` (RazorpayX auto-splits) **or** `{custom-salary-structure: true, salary-structure: {basic, da, hra, special-allowance, lta, employer-pf, employer-esi, custom-allowances[], deductions[]}}` applied inline to **one employee at a time**.
- The **"Multiple Salary Structure" feature** (create named templates, assign from dropdown) documented at `razorpay.com/docs/payroll/multiple-salary-structure/` is **dashboard-only** — it has no API surface. There is no create-template, list-template, or assign-by-id endpoint.
- There is also **no read endpoint** for a currently-assigned structure. Our proxy already back-derives annual CTC by reading `payroll:view-payroll` monthly gross × 12 (`supabase/functions/razorpay-payroll-proxy/index.ts:110-223`) — this loses the component split.

So true "Full CRUD" against RazorpayX is not possible. What we can do is own templates **locally** and push them out as per-employee inline `set-salary` payloads. This is exactly how RazorpayX's own dashboard "assign structure" button works under the hood.

## What we already have

- `hr_salary_structure_templates` + `hr_salary_structure_template_items` tables — components list (verified via schema).
- Proxy `push_salary_apply_one` / `push_salary_apply_bulk` actions in `supabase/functions/razorpay-payroll-proxy/index.ts:2017-2260` already build the exact `{custom-salary-structure:true, salary-structure:{...}}` envelope RazorpayX wants. We just don't drive them from a template.
- The onboarding Stage 2 template selector was just removed (this turn).

## The plan — local-template model with RazorpayX push

### 1. Redesign the templates schema for the RazorpayX component vocabulary

Extend `hr_salary_structure_templates` + `hr_salary_structure_template_items` (via migration) to match what `set-salary` accepts:

- Rows-per-component with a fixed component-code enum: `basic`, `da`, `hra`, `special_allowance`, `lta`, `employer_pf`, `employer_esi`, plus `custom_allowance` and `deduction` (many rows allowed).
- Per-item fields: `component_code`, `label` (for custom rows), `calc_mode` (`percent_of_ctc` | `percent_of_basic` | `flat_monthly`), `value`, `taxable` (`yes | no | flexi`, for custom_allowance only), `residual` (bool — exactly one row per template flagged residual, auto-balances to make sum = CTC).
- Template-level fields: `name` (org-unique), `is_active`, `notes`, `applies_to_pt_state` (informational — PT is dashboard-only in RazorpayX).
- Assignment table `hr_employee_salary_structure_assignments`: `employee_id`, `template_id`, `annual_ctc`, `pushed_at`, `pushed_by`, `razorpay_ack` (jsonb), `expanded_breakdown` (jsonb — the exact amounts we sent). Insert-only (append) so we can see history.
- RLS: HR-admin CRUD on templates; assignments readable by the assigned employee + HR-admin.

### 2. HRMS UI — Full CRUD for local templates

New page `/hrms/payroll/salary-structures` (`src/pages/horilla/SalaryStructuresPage.tsx`):

- List all templates with employee-count badge.
- Create/Edit dialog: template name, component builder (add/remove rows, pick component code, calc mode, value, taxable/residual flags), live preview panel that expands the template against a "sample CTC" input and shows the monthly breakdown that will be sent to RazorpayX (Basic / HRA / Special / PF / ESI / custom rows / deductions / total = CTC/12).
- Validation: exactly one residual row; component_code uniqueness for reserved codes; sum-preview must equal CTC (else block save).
- Delete: soft-disable (mirror of RazorpayX dashboard rule "can't disable if still assigned"); if assigned to employees, offer "disable" only.
- "Duplicate" action for common variants (Under 21k / 21k–30k / Over 30k / Freelance).

### 3. Assignment — the actual "push to RazorpayX"

Two touchpoints:

- **Onboarding Stage 2** — bring back a much smaller selector: `Salary Structure Template` (local) beside `CTC (Annual)`. Preview panel same as template editor.
- **Employee Profile → Compensation card** — "Change Structure" action, same picker + preview + reason field.

On confirm:
1. Call proxy `push_salary_apply_one` with `{employee_id, annual_ctc, template_id}`.
2. Proxy expands the template into the RazorpayX-shape `salary-structure` object (basic/da/hra/special-allowance/lta/employer-pf/employer-esi/custom-allowances[]/deductions[] as flat monthly amounts) and POSTs `people:set-salary` with `custom-salary-structure=true`.
3. On 2xx, write a row into `hr_employee_salary_structure_assignments` with the exact expanded breakdown + Razorpay ack.
4. Also cache the breakdown into the existing `hr_employee_salary_structures` (already flagged as read-cache per the doctrine) with `source_tag = 'hrms_push'`.

Bulk assignment stays gated by the existing pilot/unlock rails in the proxy (unchanged).

### 4. Guardrails aligned with the doctrine

- Banner on the new page: "Templates live in HRMS. RazorpayX is still the payroll authority — templates take effect only on future payroll cycles, and structure edits do not retroactively touch already-locked payslips."
- After every push, mark the freshness view (`hr_razorpay_payroll_freshness`) so drift alerts fire if RazorpayX later reports different component values back via `view-payroll`.
- Any executed / locked run for the current month → block push, show "unlock in RazorpayX first" message.
- Statutory splits (PF admin, ESI eligibility, PT) are **not** in the push payload — RazorpayX computes those. We only send the earnings-side components and any `employer-pf` / `employer-esi` explicit amounts if the template has them.

### 5. Backfill path

One-off script action on the templates page: **"Pull current amounts from RazorpayX"** — for each employee that has a template locally assigned, hit `payroll:view-payroll` for the latest executed month, store the observed monthly gross into `expanded_breakdown.observed`, and flag mismatch chips (`hrms_intent` vs `razorpay_observed`) on the assignment history.

## Technical notes

### Endpoint map used
| Purpose | Method | Path | Sub-type | Notes |
|---|---|---|---|---|
| Push structure to one employee | POST | `/api/people` | `set-salary` | Only write path RazorpayX exposes |
| Read observed monthly gross (drift) | POST | `/api/payroll` | `view-payroll` | No component split |
| Employee create/edit (existing) | POST | `/api/people` | `create` / `edit` | Edit explicitly excludes salary |

No new secrets. No new proxy connections. All work is in: the migration, the new page, the onboarding stage 2, and one new proxy action `push_salary_apply_from_template` (thin wrapper over the existing `push_salary_apply_one` that first expands the template).

### Files to touch
- `supabase/migrations/…` new tables + assignment table + enum for component codes.
- `supabase/functions/razorpay-payroll-proxy/index.ts` — add `list_local_templates_expand` (server-side expand helper) and `push_salary_apply_from_template` action; reuse existing set-salary poster.
- `src/pages/horilla/SalaryStructuresPage.tsx` (new).
- `src/components/hrms/salary/StructureBuilder.tsx`, `StructurePreview.tsx` (new).
- `src/components/hrms/onboarding-pipeline/Stage2SalaryConfig.tsx` — re-add a slim template picker.
- `src/components/hrms/EmployeeSalaryStructure.tsx` — "Change Structure" action.
- Sidebar entry under HRMS → Payroll → Salary Structures.

### What we are explicitly NOT building
- A "sync templates from RazorpayX" pull — not possible, no API.
- Assignment-by-`structure_id` — not possible, no API.
- Retroactive re-pricing of already-executed payslips — RazorpayX doesn't allow it.
- PT/ESI eligibility toggles or tax-regime picker — dashboard-only in RazorpayX.

## Open questions for you before build

1. Should templates be **org-wide** (any HR-admin edits) or scoped per **subsidiary**? Current `hr_salary_structure_templates` is org-wide — flag if you want subsidiary scoping added.
2. When HR changes an employee's template mid-month (before payroll runs), should we **auto-push** to RazorpayX immediately, or require a confirmation dialog every time? Recommend: confirmation dialog with the diff preview.
3. Bulk apply: do you want a "reassign all employees on template X" bulk button, or keep bulk gated behind the existing pilot/unlock flow only?
