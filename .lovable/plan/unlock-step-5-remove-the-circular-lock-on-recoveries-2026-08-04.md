# Unlock Step 5 — remove the circular lock on recoveries

## The deadlock you spotted

Step 5's gate blocks the step when any automatic recovery for the month is still `scheduled`. But the only place to push a recovery to RazorpayX is the Step 5 tool itself — which the gate disables. So a single unpushed recovery makes the step impossible to complete from the cockpit.

The gate was meant to guard **acknowledgement** (don't tick Step 5 as done while work is pending), not **access** to the work surface.

Current live data for August 2026: 13 recovery installments — 12 `pushed`, 1 `paid`, 0 `scheduled`. So the specific banner you're seeing is a stale/cached count; the underlying rule is still wrong and would trap you next month.

## What changes

1. **Open the door, keep the tick locked.** The "Open additions / deductions" button is never disabled by the gate. Only the "Mark done / Acknowledge" action stays blocked while items are pending.
2. **Reword the banner** from a lock message to a to-do: "Cannot acknowledge yet — 1 automatic recovery still scheduled. Open the tool to push it." with the pending employee names listed so you know exactly what to act on.
3. **Split the two gate reasons.** LOP verification (Step 4's own concern) and unpushed recoveries (Step 5's own work) are shown as separate lines, since only the first is genuinely an upstream dependency.
4. **Refresh the count after a push.** Pushing a recovery from the Step 5 tool invalidates the gate query, so the cockpit banner clears immediately instead of showing a stale number.
5. **Deep-link the pending rows.** The banner's action opens the additions/deductions tool filtered to the pending recoveries.

## Technical notes

- `src/pages/hr/MonthlyPayrollCockpitPage.tsx`: `gated` stops driving the tool button's `disabled`; it continues to drive `canAck`. Banner copy and layout updated.
- `src/hooks/hrms/usePayrollStepGate.ts`: return the pending rows (names + status), split `lopReasons` / `recoveryReasons`, and expose the query keys for invalidation.
- Recovery push mutation invalidates `["gate_auto_recoveries", month]` and `["gate_lop", month]`.
- No change to the push logic, RazorpayX verification, or the recoveries view itself.
