# Deposits & Recoveries — lifecycle tabs, grouping, refund flow

Deposit Management becomes a full lifecycle view: every security deposit and error recovery sits in exactly one state, employees with several entries are grouped into one row, and paying money back to the employee is a first-class action with a proper audit trail.

## Page structure

Top level stays as today: **Security Deposit** | **Error Recovery** (counts on each).

Inside each type, a second row of sub-tabs by lifecycle state:

- **Active** — still collecting (balance outstanding, not paused-out, employee active).
- **Collected** — target fully collected, money still held by the company, nothing paid back yet.
- **Paid back** — refunded to the employee (full or partial). Shows refunded amount, withheld/forfeited amount and reason, refund payroll month.
- **Exited — unpaid** — employee is inactive/separated and the company still holds money that was never paid back. This is the "he resigned so we didn't pay the deposit" bucket.
- **All** — everything, with a state column.

Summary tiles recompute per sub-tab (Total / Collected / Outstanding / Held or Refunded, depending on the tab).

## Grouping by employee

Each sub-tab lists **one row per employee**, aggregating their entries of that type and state: total, collected, balance, number of entries, overall state. A chevron expands to a detailed breakdown table of the individual entries (amount, mode, start month, incident ref, progress, status, actions). Employees with a single entry expand to that single line — same interaction, no special case.

Row-level actions (edit, pause/resume, view ledger, refund, settle) stay on the individual entries inside the expansion; the group row only aggregates.

## Refund flow (both types)

One **"Pay back to employee"** dialog, available on any entry with money collected and not yet refunded:

- Shows amount held (collected).
- HR enters **refund amount** (defaults to the full held amount, can be lower — that is the partial case) and the **payroll month** for the addition.
- If refund amount < held: a **reason for withholding** is mandatory (e.g. deducted against loss, notice-period shortfall).
- On confirm: a non-taxable payroll **addition** is staged for that month labelled `Security deposit refund` / `Error recovery refund`, a `refund` ledger entry is written, the deposit is closed as refunded with the refunded and withheld amounts recorded, and any pending payroll installments are cleared.
- Refund closes the record — a second refund on the same entry is not possible.

For error recovery specifically the dialog label reads "Error recovered — pay back to employee"; there is no separate counterparty-recovery bookkeeping, just the refund amount.

## What HR can see at a glance

- Per employee, per type: how much was taken, how much is still being taken, whether it was paid back, how much was withheld and why.
- The Exited — unpaid tab is the standing list of money the company holds for people who have left.
- Ledger drawer (unchanged, extended) shows initiated / modified / paused / collection / refund / F&F entries with running balance.

## Technical notes

- `hr_employee_deposits` gains `refund_amount numeric`, `withheld_amount numeric`, `withheld_reason text`, `refunded_at timestamptz`, `refund_period_month date`, `refund_status text` (`none|refunded`). Existing `is_settled` / `is_recovered` are kept and set alongside so F&F and profile code paths keep working.
- Derived lifecycle state (computed client-side from the row + employee active flag): `refunded` → `exited_unpaid` (employee inactive, balance held, not refunded) → `collected` (fully collected, not refunded) → `active`.
- Employee active/separated flag comes from the existing `hr_employees.is_active` already joined on the query.
- Refund mutation replaces the current `refundMutation`: stages `hr_payroll_input_additions` (rupees, `addition_type` 0, `taxable=false`) for the chosen `period_month`, inserts a `refund` ledger row, updates the deposit, then calls `hr_rebuild_deposit_schedule` to drop pending installments.
- `SeedDepositsDialog` unchanged; seeded records land in **Collected** since they are fully collected with no refund.
- Employee profile deposit block gains the same refunded/withheld display so the employee-side view matches.
- Verification before reporting done: create an entry of each type, run a partial refund, confirm the addition row exists for the right period with the right amount, the ledger balances, the record moves to Paid back, and an inactive employee's unrefunded deposit appears under Exited — unpaid.
