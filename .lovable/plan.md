# Leave balance ledger in the Auto-LOP step (UI table + CSV)

Today the LOP step shows only how many days of each leave type were *consumed* in the month. It does not show what balance the employee started with, what was credited during the month, or what remains after the month's consumption and settlements. This adds a full opening → credited → used → closing ledger for the three balance-bearing categories: **Casual Leave (CL)**, **Sick Leave (SL)** and **Comp-off (CO)** — in both the on-screen table and the exported CSV.

## What you will see

A new **Leave balance** column group in the LOP table, three sub-blocks:

```text
Casual leave      Sick leave        Comp-off
Open · Cr · Used · Bal   Open · Cr · Used · Bal   Open · Cr · Used/Set-off · Bal
```

- **Open** — balance carried into the first day of the payroll month.
- **Cr** — days credited during that month (CL/SL from the accrual run, comp-off from verified worked-off-day credits).
- **Used** — days consumed in that month by approved leave. For comp-off this also includes days used to cancel LOP and days encashed in the month's settlement.
- **Bal** — closing balance = Open + Cr − Used.

Density handling: the group renders as four compact numbers per category with the header split, same styling as the existing groups, and the whole block is horizontally scrollable as today. The expandable per-employee detail row gains a small "Leave ledger" table repeating the same four figures per category, plus the credit dates already shown for comp-off.

If the closing balance from the ledger disagrees with the balance currently stored against the employee's allocation, the cell shows the existing small mismatch marker rather than silently adjusting anything.

**CSV export** gains the same twelve columns, inserted after the existing leave-consumption columns and before the LOP columns, using the same header names (`CL opening`, `CL credited`, `CL used`, `CL balance`, then SL, then comp-off with an extra `CO set-off/encashed` figure).

## How each figure is derived

- **Comp-off** — already available: `hr_compoff_month_pool` returns opening, earned, taken and available for the month, and it is already passed into the row (`compoff_opening`, `compoff_earned`, `compoff_taken`, `compoff_available`). Set-off/encashment comes from `hr_compoff_settlements` for the period. No new comp-off logic.
- **CL / SL credited in month** — `hr_leave_accrual_log` rows whose `accrual_date` falls in the month, joined through `hr_leave_accrual_plans` to the leave type (the two live plans are exactly CL and SL).
- **CL / SL used in month** — the existing month-clipped consumption already computed in `hr_leave_month_breakdown`.
- **CL / SL closing** — current `available_days` on the employee's allocation rows for that leave type and period.
- **CL / SL opening** — derived as closing + used − credited, so the row is arithmetically self-consistent and auditable left to right.

## Guardrails

- Reporting only. No change to LOP arithmetic, comp-off crediting/settlement, accrual, staging or push behaviour.
- Extension of the existing HR-gated `STABLE SECURITY DEFINER` read function; no writes.
- Contract employees keep their "LOP not applicable" treatment; their leave ledger still renders for reference.

## Technical notes

- Migration: extend `public.hr_leave_month_breakdown(uuid[], date)` with `leave_ledger jsonb` — per category `{opening, credited, used, closing}` — built from `hr_leave_accrual_log` + `hr_leave_allocations` + the existing consumption CTE. Recreate (drop + create) because the return signature changes; re-grant execute to `authenticated`, `service_role` and the audit role.
- `supabase/functions/generate-lop-deductions/index.ts`: pass `leave_ledger` and the settlement figures through onto each preview row (dry-run payload only; the staging payload is untouched).
- `src/components/hr/payroll/AutoLopDialog.tsx`: extend `PreviewRow`, add the column group and header colspans, the expanded-row ledger table, and the twelve new CSV columns.
