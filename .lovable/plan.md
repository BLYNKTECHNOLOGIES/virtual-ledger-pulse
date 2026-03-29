

# Salary Hold = Existing Deposit System — Gap Analysis & Enhancement Plan

## Finding

The existing **Security Deposit** system (`hr_employee_deposits` + `hr_deposit_transactions`) already implements the core salary hold concept:
- Monthly deduction from payroll (fixed/percentage/one-time modes)
- Separate line item in payslip ("Security Deposit")
- Transaction ledger with payroll_run_id linkage
- Auto-stop when target reached
- Caps deduction at remaining amount
- F&F settlement flow
- Penalty deduction from deposit balance

**The system IS the salary hold.** Below are the specific gaps to fix.

---

## Gaps to Fix

### Gap 1: No cap against net payable salary
**Current**: Deposit deduction can exceed employee's net pay (e.g., if salary is low month due to LOP, deduction still applies full amount).
**Fix**: In `PayrollDashboardPage.tsx` payroll generation (line ~348), add: `installment = Math.min(installment, remaining, netPayableBeforeDeposit)`. Carry forward remaining.

### Gap 2: No "Initiated" ledger entry on deposit creation
**Current**: Creating a deposit creates no transaction record. The first ledger entry only appears during payroll.
**Fix**: In `DepositManagementPage.tsx` `addMutation`, after insert, create an `hr_deposit_transactions` entry with `transaction_type: 'initiated'`, amount = total_deposit_amount, balance_after = 0, description = "Salary Hold Initiated".

### Gap 3: No "Completed" ledger entry when fully collected
**Current**: When `is_fully_collected` becomes true during payroll, no completion transaction is recorded.
**Fix**: In `PayrollDashboardPage.tsx`, after the collection transaction, if `is_fully_collected` just turned true, insert a `transaction_type: 'completed'` entry.

### Gap 4: No pause/resume capability
**Current**: Deposits are either active or settled. No way to temporarily pause deductions.
**Fix**: 
- Add `is_paused BOOLEAN DEFAULT false` and `paused_reason TEXT` columns to `hr_employee_deposits`.
- Add pause/resume buttons in the Deposit Management UI.
- In payroll generation, skip deposits where `is_paused = true`.
- Log pause/resume as ledger entries (transaction_type: 'paused' / 'resumed').

### Gap 5: No audit trail for modifications
**Current**: Editing deposit amount/mode overwrites values with no history.
**Fix**: On edit, create an `hr_deposit_transactions` entry with `transaction_type: 'modified'`, description containing old vs new values.

### Gap 6: Payslip PDF shows duplicate deduction entries
**Current**: In `PayslipsPage.tsx` line 128-129, TDS and LOP are manually added to deduction rows, but they already exist in `deductions_breakdown`. Need to verify no duplicates.
**Fix**: Ensure the PDF generator reads deductions exclusively from `deductions_breakdown` without double-adding.

---

## Implementation Steps

### Step 1: Database Migration
Add columns to `hr_employee_deposits`:
```sql
ALTER TABLE hr_employee_deposits 
  ADD COLUMN IF NOT EXISTS is_paused BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS paused_reason TEXT,
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
```

### Step 2: Fix Payroll Generation (`PayrollDashboardPage.tsx`)
- Skip deposits where `is_paused = true` in the deposit deduction block
- Cap deposit installment at `(totalEarnings - totalDeductions)` before deposit is applied — ensuring deposit never makes net salary negative
- When `is_fully_collected` transitions to true, insert a "completed" transaction

### Step 3: Add Ledger Entries on Create/Edit (`DepositManagementPage.tsx`)
- On create: insert "initiated" transaction
- On edit: insert "modified" transaction with change description
- Add pause/resume buttons that update `is_paused` and log to ledger

### Step 4: Verify Payslip Display (`PayslipsPage.tsx`)
- Confirm deposit deduction appears as distinct "Security Deposit" line
- Remove duplicate TDS/LOP entries if already in `deductions_breakdown`

### Step 5: Update Types
- Supabase types will auto-update after migration

---

## Files Modified

| File | Change |
|------|--------|
| `supabase/migrations/xxx.sql` | Add is_paused, paused_reason, paused_at columns |
| `src/pages/horilla/PayrollDashboardPage.tsx` | Cap deposit vs net pay, skip paused, completion entry |
| `src/pages/horilla/DepositManagementPage.tsx` | Initiated/modified ledger entries, pause/resume UI |
| `src/pages/horilla/PayslipsPage.tsx` | Fix duplicate deduction rows if any |

---

## What This Does NOT Change
- No new tables — reuses existing deposit infrastructure
- No renaming — "Security Deposit" label stays (or can be renamed to "Salary Hold" if preferred)
- No impact on existing F&F settlement flow
- Existing deposits continue working as before

