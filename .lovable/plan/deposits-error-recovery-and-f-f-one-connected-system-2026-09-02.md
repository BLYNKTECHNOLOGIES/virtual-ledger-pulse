# Deposits, Error Recovery and F&F — one connected system

Today the exit settlement and the Deposit / Error Recovery page live separate lives: penalties arrive in the wrong unit, error-recovery money silently disappears into "written off", HR cannot change any of it, and nothing moves on the Deposit page until the settlement is paid. This makes all four honest.

## 1. The ₹0.5 penalty — a unit mistake

Penalties are recorded in **days** (Lokesh: 0.5 day for late marks). F&F was adding those numbers up as **rupees**, so 0.5 day became ₹0.50.

Fix: F&F converts days into money using the same one-day rate payroll uses — monthly salary (RazorpayX-mirrored) ÷ that month's working days — and shows the working:

```text
Penalties
  Aug 2026 · late marks · 0.5 day × ₹1,154/day        − ₹577
```

Penalties already recorded directly in rupees keep their rupee value. HR can still override the final figure, and the override is stored with the reason.

## 2. Nothing is ever "written off" behind HR's back

The old rule — *error recovery is refundable only if already recovered from the outside party* — silently moved Lokesh's ₹6,000 into a written-off list with no controls. That rule is removed as an automatic decision.

Instead the settlement shows **every** deposit and recovery the employee holds, one editable line each:

```text
Money held by the company
  Security deposit        held ₹9,000   refund [ 9,000 ]   withhold ₹0
  Error recovery ₹6,000   held ₹6,000   refund [     0 ]   withhold ₹6,000
                                        reason: [ loss not recovered from counterparty ]  ← required
```

- Default for a security deposit: refund in full.
- Default for an error recovery: keep the money (withhold in full) — because the loss has not been recovered.
- HR can change any line to full refund, part refund, or zero.
- **Whenever refund is less than what is held, a written reason is mandatory.** No reason → the settlement cannot be saved.
- The "Deposit Refund" total in the settlement is simply the sum of the refund boxes — no hidden arithmetic.

## 3. Saving the settlement immediately updates the Deposit page

From the moment the settlement is **saved as a draft**, each deposit line is reflected on the Deposit / Error Recovery page:

- Status becomes **Reserved in F&F** with the intended refund and withheld amounts and the reason visible.
- The entry is locked against ordinary edits (it is now governed by the settlement) but stays fully readable, with a link back to the settlement.
- Editing the settlement rewrites those figures; cancelling the settlement releases the entries back to their previous state.
- Marking the settlement **Paid** converts *Reserved* into final **Paid back** / **Withheld at exit**, writes the ledger entries, and closes the records.

So the two pages can never disagree again — the settlement is the owner of the record while it is live.

## 4. Editing amounts on the Deposit page

Any entry's target amount, deduction mode, incident reference and recovery reason can be corrected, **with a mandatory reason**. Every change writes a `modified` ledger row (old value → new value, who, when, why). Collected amounts are never silently rewritten; if the new target is below what was already collected, the surplus is offered as a refund line instead of vanishing.

Error-recovery entries get the missing context fields on screen (incident date, reference, reason, recovered-from-counterparty toggle) and the same edit / pause / refund / ledger actions security deposits have.

## 5. Situations and how the system behaves

| Situation | What happens |
|---|---|
| Employee leaves, security deposit fully collected | Refund pre-filled in full; HR can reduce with a reason |
| Employee leaves, error recovery not recovered from counterparty | Withheld in full by default, reason pre-filled and editable |
| Counterparty pays back later, employee already exited | Entry stays visible under "Withheld at exit"; a **Pay back after exit** action stages a one-time payout and records it |
| Part refund | Refund + withheld + reason all stored; ledger shows both lines |
| Deposit still being collected when employee exits | Only the collected amount is in play; pending installments are cancelled |
| Settlement cancelled | Deposits released back to their pre-settlement state, ledger records the release |
| Two entries of the same type | Each is a separate line with its own decision and reason |
| Employee inactive with money never returned | Appears in the existing **Exited — unpaid** tab until refunded or formally withheld |

## Technical notes

- `fnfEngine.ts`: replace the refundable/written-off split with a per-deposit decision list (`deposit_id`, `held`, `refund`, `withheld`, `reason`, `source`), persisted in `hr_fnf_settlements.breakdown.deposit_decisions`; `deposit_refund` becomes the sum. Penalty conversion uses `_shared/salaryBase` monthly base ÷ month working days (same divisor as LOP), stored as `penalty_days` + `penalty_rate` + resulting rupees in the breakdown.
- New columns on `hr_employee_deposits`: `fnf_settlement_id uuid`, `fnf_state text` (`none|reserved|closed`) so the Deposit page can show reserved state and lock rows; refund/withheld/reason columns already exist and are reused at close.
- New RPC `hr_apply_fnf_deposit_reservations(p_settlement_id uuid)` called on settlement save/edit (idempotent: releases entries no longer in the settlement, reserves the current set). `hr_close_fnf_sources` extended to honour per-line refund/withheld/reason and write `refund` / `withheld` ledger rows.
- Deposit edit: mandatory `reason`, writes a `modified` row in `hr_deposit_transactions` with old/new snapshot, then `hr_rebuild_deposit_schedule`.
- Verification before reporting done: on Lokesh — confirm the penalty renders as days × rate, the ₹6,000 error recovery appears as an editable withheld line with reason, saving the draft flips both deposits to *Reserved* on the Deposit page, editing the refund to a partial amount blocks save without a reason, marking Paid writes matching ledger rows, and cancelling releases the reservations.
