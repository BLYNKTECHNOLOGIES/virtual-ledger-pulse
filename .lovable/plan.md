# Implementation Status: COMPLETED

## Core Business Operations Constraint (NEW)
**CRITICAL**: Stock purchases and sales are core trading operations and should NEVER be counted as operating expenses or income in any calculations.

### Exclusion Categories for Expense/Income Queries:
The following categories are excluded from expense/income calculations across all financial modules:
- `Purchase`
- `Sales`
- `Stock Purchase`
- `Stock Sale`
- `Trade`
- `Trading`

### Calculation Logic:
- **Gross Profit** = Revenue (Sales) - Cost of Goods Sold (Purchases)
- **Net Profit** = Gross Profit - Operating Expenses + Operating Income
- Operating Expenses = Bank transactions with type EXPENSE (excluding trading categories)
- Operating Income = Bank transactions with type INCOME (excluding trading categories)

### Files Updated for This Constraint:
- `src/pages/ProfitLoss.tsx` - P&L dashboard
- `src/components/hrms/StatisticsTab.tsx` - Statistics page
- `src/components/bams/journal/ExpensesIncomesTab.tsx` - Journal entries
- `src/components/bams/journal/DirectoryTab.tsx` - Directory listing

---

## PIN-Protected Tab Grouping (COMPLETED)

### Groups Configured:
| Group Name | Child Tabs | PIN Code |
|------------|------------|----------|
| HR Management | HRMS, Payroll, EMS | 07172525 |
| Finance & Analytics | Accounting, P&L, Financials, Statistics | 07172525 |

### Features:
- Session-based unlock state (clears on browser close)
- All sidebar items (including groups) are draggable
- Position persists per user ID

### Files Created:
- `src/components/sidebar/PinProtectionDialog.tsx`
- `src/components/sidebar/CollapsibleSidebarGroup.tsx`
- `src/contexts/PinUnlockContext.tsx`

### Files Modified:
- `src/components/AppSidebar.tsx`
- `src/hooks/useSidebarPreferences.tsx`
- `src/components/Layout.tsx`
- `src/index.css` (shake animation)
