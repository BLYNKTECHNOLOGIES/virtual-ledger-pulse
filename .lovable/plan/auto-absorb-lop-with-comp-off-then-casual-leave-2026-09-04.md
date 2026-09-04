# Auto-absorb LOP with comp-off, then casual leave

Today only comp-off cancels loss of pay. Casual leave is used only when the employee explicitly applies for it, so an employee with CL in hand still gets charged LOP. New rule: LOP is absorbed automatically — comp-off first, then casual leave — and only the remainder is deducted from salary. Sick leave stays application-only and is never auto-consumed.

## Rules being implemented

1. Raw LOP days are computed exactly as today (no change to attendance or the LOP engine itself).
2. Absorption order: available comp-off → available casual leave → remainder charged as LOP.
3. Casual leave pool = full available CL balance as of that payroll month (carried-forward CL included), as shown on the Leave Allocations page.
4. Half-day granularity: 0.5 of a day can be absorbed.
5. Sick leave is excluded from auto-absorption entirely.
6. Contract employees stay "LOP not applicable" — nothing absorbed, nothing charged.
7. Employment-gap / pre-joining proration days are NOT absorbable (they are not absence, the person simply was not employed) — they remain charged.

## Record keeping

Auto-absorbed casual leave becomes real consumption, written only when the HR user stages the LOP for the month (never on preview/recalculate):

- an auto-generated approved CL leave request for the month, tagged `source = 'auto_lop_absorption'`, with a system note naming the payroll month,
- matching `hr_leave_request_consumption` rows and `hr_leave_allocations.used_days` increments (oldest non-expired allocation first),
- re-staging the same month first reverses the previous auto-absorption for that month and re-writes it, so recalculating never double-consumes,
- absorption is skipped for any employee whose LOP row is already pushed to RazorpayX (pushed rows are never rewritten); those rows are flagged stale instead, as today.

## UI

In the Auto-calculate LOP step and its CSV export, the LOP group gains a "CL set-off" column next to the existing "Comp-off set-off", so the arithmetic reads: Raw → comp-off set-off → CL set-off → proration → Charged. The Casual Leave balance group shows the auto-absorbed days inside "Used" with a sub-label, and the expanded per-employee panel lists the absorbed dates/days and the resulting closing CL balance. The summary chips add total CL days absorbed.

## Technical notes

- `supabase/functions/_shared/compoff.ts`: extend `splitCompoff` into a single `absorbLop(compoffAvailable, clAvailable, rawLopDays)` helper returning `{ compoff_offset, cl_offset, lop_after_offset, encash_days }`, so the LOP engine and the comp-off encashment engine keep sharing one implementation (encashable comp-off remainder is unchanged).
- New RPC `public.hr_cl_available(uuid[], date)` (STABLE, SECURITY DEFINER, HR-gated) returning available CL per employee for the month, using the same non-expired-allocation rule already used in `hr_leave_month_breakdown`'s ledger CTE.
- New RPC `public.hr_apply_cl_lop_absorption(p_absorptions jsonb, p_period_month date)` (VOLATILE, SECURITY DEFINER, service-role only) that transactionally reverses prior `auto_lop_absorption` records for the month and writes the new request/consumption/allocation rows.
- `supabase/functions/generate-lop-deductions/index.ts`: fetch CL availability, apply the extended absorption, add `cl_offset_days` / `cl_available` to each preview row, and call the apply RPC in the staging path only.
- `src/components/hr/payroll/AutoLopDialog.tsx`: new column, CSV column, summary chip, expanded-detail lines.
- Verification: SQL before/after for August 2026 (per-employee raw LOP, comp-off set-off, CL set-off, charged LOP, CL closing balance), a re-stage run to prove no double consumption, plus typecheck/build. Logged in `docs/STATE_LOG.md` and `docs/attendance/LOP_POLICY.md` updated with the new absorption rule.
