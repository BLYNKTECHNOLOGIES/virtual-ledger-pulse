

# Employee Deposit Management System

## Overview

A system to track employee security deposits with flexible deduction schedules, penalty-from-deposit logic, deposit replenishment via payroll, and Full & Final (F&F) settlement integration.

## Database Design

### New Table: `hr_employee_deposits`
Tracks the deposit configuration and current balance per employee.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | |
| employee_id | uuid (FK to hr_employees) | |
| total_deposit_amount | numeric | Total deposit required (e.g., 15,000) |
| collected_amount | numeric DEFAULT 0 | Amount collected so far |
| current_balance | numeric DEFAULT 0 | Current deposit balance (collected minus penalty deductions) |
| deduction_mode | text | `one_time`, `percentage`, `fixed_installment` |
| deduction_value | numeric | Percentage of salary or fixed amount per month |
| deduction_start_month | text | YYYY-MM when deductions begin |
| is_fully_collected | boolean DEFAULT false | Whether total deposit has been collected |
| is_settled | boolean DEFAULT false | Deposit returned during F&F |
| settled_at | timestamptz | When F&F settlement happened |
| settlement_notes | text | F&F notes |
| created_at | timestamptz DEFAULT now() | |
| updated_at | timestamptz DEFAULT now() | |

### New Table: `hr_deposit_transactions`
Ledger of all deposit movements (collections, penalty deductions, replenishments, F&F refund).

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | |
| employee_id | uuid (FK) | |
| deposit_id | uuid (FK to hr_employee_deposits) | |
| transaction_type | text | `collection` / `penalty_deduction` / `replenishment` / `ff_refund` |
| amount | numeric | Positive = credit to deposit, negative = debit |
| balance_after | numeric | Running balance after this transaction |
| reference_id | text | Links to penalty ID or payroll run ID |
| description | text | Human-readable note |
| transaction_date | date | |
| payroll_run_id | uuid | Which payroll run triggered this |
| created_at | timestamptz DEFAULT now() | |

## Core Logic

### 1. Deposit Collection via Payroll
During payroll generation (`PayrollDashboardPage.tsx`), the system will:
- Check if employee has an active deposit with `is_fully_collected = false`
- Calculate the installment based on `deduction_mode`:
  - `one_time`: deduct full remaining amount in one go
  - `percentage`: deduct X% of gross salary
  - `fixed_installment`: deduct a fixed amount
- Cap the deduction so it never exceeds the remaining amount
- Add "Security Deposit" to payslip deductions
- Insert a `collection` transaction in `hr_deposit_transactions`
- Update `collected_amount` and `current_balance` on the deposit record
- Mark `is_fully_collected = true` when fully collected

### 2. Penalty from Deposit
When a penalty is configured to deduct from deposit (new field `deduct_from_deposit` on `hr_penalties`):
- Deduct from `current_balance` instead of salary
- If deposit balance becomes less than the total required, a replenishment deficit is tracked
- Insert a `penalty_deduction` transaction

### 3. Deposit Replenishment via Payroll
If `current_balance < collected_amount` (due to penalty deductions):
- Calculate replenishment needed = `collected_amount - current_balance`
- Deduct replenishment amount from salary using same deduction_mode/value
- Insert a `replenishment` transaction
- Restore `current_balance`

### 4. F&F Settlement
When employee status changes to inactive/terminated:
- Show F&F settlement UI with deposit balance
- Refund `current_balance` as part of final payment
- Insert `ff_refund` transaction
- Mark deposit as `is_settled = true`

## UI Changes

### A. New "Deposit Management" Page (`/hrms/deposits`)
- View all employees' deposit status (total, collected, balance, mode)
- Add/edit deposit configuration per employee
- View transaction history per deposit
- Sidebar link under Payroll section

### B. Employee Profile - About Tab
- New "Deposit Information" section showing:
  - Total Deposit Amount
  - Collected So Far
  - Current Balance
  - Deduction Mode & Value
  - Collection Status (progress bar)
  - Recent Transactions (last 5)

### C. Employee Profile - Payroll Tab
- Payslips will show "Security Deposit" and "Deposit Replenishment" as deduction line items when applicable

### D. Penalty Management Page
- New checkbox "Deduct from Deposit" when adding manual penalties
- Visual indicator when a penalty was deducted from deposit vs salary

### E. Payroll Dashboard
- Deposit deductions will appear in payslip generation summary

## Files to Create/Modify

| File | Action |
|------|--------|
| Migration SQL | Create `hr_employee_deposits` and `hr_deposit_transactions` tables; add `deduct_from_deposit` column to `hr_penalties` |
| `src/pages/horilla/DepositManagementPage.tsx` | **New** - Full deposit management UI |
| `src/pages/horilla/PayrollDashboardPage.tsx` | **Modify** - Add deposit collection + replenishment logic in `generatePayslips` |
| `src/pages/horilla/EmployeeProfilePage.tsx` | **Modify** - Add deposit info section in About tab |
| `src/pages/horilla/PenaltyManagementPage.tsx` | **Modify** - Add "deduct from deposit" option |
| `src/App.tsx` | **Modify** - Add deposit route |
| `src/components/horilla/HorillaSidebar.tsx` | **Modify** - Add sidebar link |

## Payroll Generation Flow (Updated)

```text
For each employee:
1. Calculate earnings (template-based)
2. Calculate standard deductions (EPF, ESI, etc.)
3. Calculate penalties (salary-based)
4. Check deposit:
   a. If not fully collected -> deduct installment from salary
   b. If penalty marked "deduct_from_deposit" -> deduct from deposit balance
   c. If deposit balance < collected (deficit) -> deduct replenishment from salary
5. Record all transactions
6. Generate payslip with all line items
```

