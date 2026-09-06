# Make LOP, casual leave and comp-off deterministic everywhere

## Correct Dilkhush’s August result

- Treat the accrual ledger date as authority, not the date a backfill was inserted.
- Dilkhush has 4 raw absence days, no comp-off, and 1 valid CL credit dated 10 August 2026.
- His correct chargeable LOP is therefore **3 days**.
- At the confirmed blended monthly base of ₹11,161 and a 31-day divisor, the current LOP should be approximately **₹1,080** (final amount follows the engine’s exact unrounded base).
- His separate ₹1,452 CTC-normalisation deduction remains separate; the combined expected August deduction is approximately **₹2,532**, not ₹2,892.

## Fix the root causes

1. Make historical CL availability derive from `hr_leave_accrual_log.accrual_date` plus period-valid manual allocations and period consumption, so late backfills remain valid for the month they represent while later-month credits cannot leak backward.
2. Exclude synthetic `auto_lop_absorption` requests from raw attendance LOP so recalculation cannot apply the same leave twice.
3. Prevent recalculation of an already-pushed row from consuming CL or comp-off unless the pushed payroll row is first reset/reopened; show it only as a correction required.
4. Use one shared post-absorption result in Auto-LOP, shadow payroll, projected salary register, cockpit summaries, and verification exports. Keep labels explicit: Raw absence LOP → Comp-off offset → CL offset → Chargeable LOP.
5. Preserve the fixed order: comp-off first, then any genuinely available CL, then LOP. Sick leave is never auto-applied.

## Repair and verify August safely

- Reconstruct August leave availability for the full roster from dated accrual and consumption ledgers.
- Identify every employee whose staged/pushed LOP, consumed CL, consumed comp-off, shadow payroll, or export differs from the corrected result.
- Repair only erroneous internal synthetic absorption/settlement records; do not silently change money already pushed to RazorpayX.
- Recalculate the full August roster and verify database outputs, generated preview/export totals, and affected employee details agree.
- Report the complete affected-employee list and exact old versus corrected figures before any RazorpayX re-send.
- Add regression tests covering late-inserted August accruals, later-month accrual exclusion, rerun idempotency, and pushed-row immutability.
- Record the completed systemic correction in the shared state log.
