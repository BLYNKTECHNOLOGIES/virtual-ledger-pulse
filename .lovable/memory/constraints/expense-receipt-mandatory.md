---
name: Expense receipt optional
description: Bill/receipt upload is OPTIONAL for EXPENSE transactions (journal entry + edit dialogs); previously mandatory
type: constraint
---
Bill / Receipt attachment for EXPENSE bank transactions is **optional** (owner decision, 2026-09-17 IST).

- `TransactionForm.tsx` and `EditExpenseDialog.tsx` must not block submission when no bill is attached.
- Label shows "(optional)" — never a red required marker.
- **Why:** operators frequently record expenses without an immediate bill; the hard block stalled entries.
