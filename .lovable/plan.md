

# ERP Full System Audit — Phase 1 Report

## Methodology
Audited all routes, pages, database tables (200+), cron jobs, triggers, data integrity, orphaned files, and UI inconsistencies against the live database.

---

## CATEGORY 1: DATA INTEGRITY BUGS

### DI-01 | KUCOIN wallet has negative balance (-493.62 USDT)
The `check_wallet_balance_before_transaction` trigger was added to prevent this, but KUCOIN already has a historical negative balance of -493.62 USDT in both `wallets.current_balance` and `wallet_asset_balances`. The trigger allows negatives for wallets that already have negative balances (exception clause), meaning this will never self-correct.

**Fix**: Investigate root cause (likely a missing deposit credit), then either create a corrective adjustment transaction or manually zero the balance via a reconciliation entry.

**Effort**: Requires manual investigation — cannot auto-fix without data loss risk. Flag for shift reconciliation review.

### DI-02 | 23 sets of duplicate client phone numbers
Different client names share the same phone number (e.g., 4 different clients all with phone 7972213711). This violates identity integrity. Current system has no unique constraint on `clients.phone`, so P2P order sync can link the wrong client to an order.

**Fix**: 
- Add a data cleanup task to merge or flag duplicates
- Consider adding a unique partial index: `CREATE UNIQUE INDEX idx_clients_unique_phone ON clients(phone) WHERE phone IS NOT NULL AND phone != '' AND is_deleted = false;`
- This requires data cleanup first (resolve the 23 duplicate sets)

**Effort**: 30 min data review + migration

---

## CATEGORY 2: ORPHANED / DEAD CODE

### DC-01 | `Management.tsx` — orphaned page, no route
`src/pages/Management.tsx` (613 lines) defines an org chart view but is never imported in `App.tsx` and has no route. Completely unreachable dead code.

**Fix**: Delete the file, or wire it to a route if the org chart is wanted.

### DC-02 | `HRMS.tsx` — imported but never used in router
`src/pages/HRMS.tsx` is imported in `App.tsx` line 24 but never assigned to any route. The HRMS module uses the Horilla layout at `/hrms/*` instead. Dead import.

**Fix**: Remove the import from `App.tsx` and delete `HRMS.tsx` if Horilla is the canonical HRMS.

### DC-03 | Orphaned stock components never imported
- `StockAdjustmentTab.tsx` — only self-references, never imported by any parent component
- `WarehouseManagementTab.tsx` — never imported by any file (the `WalletManagementTab` is used instead)
- `ProductListingTab.tsx` — never imported

**Fix**: Delete these 3 files (~1,300 lines of dead code).

---

## CATEGORY 3: UI BUGS

### UI-01 | StockManagement.tsx has duplicate header
Lines 53-75 render a full header block ("Stock Management / Inventory, warehouse, and stock control system"), then lines 78-81 render a SECOND header ("Stock Management System / Comprehensive inventory and stock control") inside the tab container. Users see two stacked headers.

**Fix**: Remove lines 78-81 (the inner duplicate header).

### UI-02 | Accounting module tabs are mostly empty shells
- `JournalEntriesTab.tsx` — static placeholder "No journal entries recorded" with non-functional "Create Journal Entry" button
- `journal_entries` table has 0 rows
- `ledger_accounts` table has 0 rows

These are scaffolded UI shells with no real functionality. The buttons create false expectations.

**Fix**: Either disable the non-functional buttons or mark tabs as "Coming Soon" to set correct expectations. No code changes to make them functional — the accounting module is not in active use.

### UI-03 | Purchase CSV export has duplicate column
Line 221-222 in `Purchase.tsx` maps `order.total_amount` twice — once as "Total Amount" and again as "TDS Applied" column value. The TDS Applied column should show `order.tds_applied ? 'Yes' : 'No'` (which it does on line 223), but line 222 inserts `total_amount` in the wrong position, shifting all subsequent columns by one.

**Fix**: Remove line 222 (`order.total_amount || 0,`) which is a duplicate that shifts the CSV columns.

---

## CATEGORY 4: STALE DATABASE TABLES (0 rows, no frontend usage)

These tables exist in the schema but have zero rows and no active frontend code writing to them:

| Table | Purpose | Verdict |
|-------|---------|---------|
| `ad_payment_methods` | Was for ad payment config | Stale — `ad_pricing_rules` replaced |
| `employees` (non-HR) | Legacy employee table | Dead — `hr_employees` is canonical |
| `employee_offboarding` | Legacy offboarding | Dead — merged into HR separation |
| `erp_drift_alerts` | Drift detection alerts | Schema exists, no writer — deferred feature |
| `payment_methods` | Generic payment methods | Dead — `purchase_payment_methods` + `sales_payment_methods` used |
| `platforms` | Platform registry | Read by UI (Sales, KYC) but has 0 rows |
| `stock_adjustments` | Stock adjustment records | Referenced by orphaned components only |
| `permission_enforcement_log` | Audit-mode log | Schema ready, no data yet (enforcement in audit mode) |

**Fix**: 
- `platforms` has 0 rows but is actively queried by `SalesOrderDialog` and `OrderCompletionDialog`. This means platform dropdown is always empty — users can't select a platform when creating sales orders. Either seed default platforms or remove the field.
- The rest can remain dormant — no cleanup needed unless DB hygiene is a priority.

---

## CATEGORY 5: CRON JOB REVIEW

14 active cron jobs verified. All are functional and calling deployed edge functions. No stale jobs found. Key schedules:

| Job | Function | Schedule |
|-----|----------|----------|
| 1 | snapshot-asset-value | Daily midnight |
| 2 | snapshot-daily-profit | Daily midnight |
| 3 | auto-reply-engine | Every minute |
| 5 | auto-price-engine | Every 2 minutes |
| 8 | auto-pay-engine | Every minute |
| 23 | pricing-effectiveness-snapshot | Daily 1 AM |
| 24 | check_terminal_order_sla | Every minute |

All cron jobs confirmed active and pointing to valid edge function URLs.

---

## IMPLEMENTATION PLAN (Phased)

### Phase 1A — Critical Fixes (implement now)
1. **UI-01**: Remove duplicate header in `StockManagement.tsx` (lines 78-81)
2. **UI-03**: Fix Purchase CSV export duplicate column (line 222)
3. **DC-02**: Remove dead `HRMS` import from `App.tsx`

### Phase 1B — Dead Code Cleanup
4. Delete `src/pages/Management.tsx`
5. Delete `src/pages/HRMS.tsx`
6. Delete `src/components/stock/StockAdjustmentTab.tsx`
7. Delete `src/components/stock/WarehouseManagementTab.tsx`
8. Delete `src/components/stock/ProductListingTab.tsx`

### Phase 1C — Data Integrity (requires business decision)
9. **DI-01**: KUCOIN negative balance — flag for reconciliation review
10. **DI-02**: Duplicate client phones — data cleanup + unique index
11. **Platforms table**: Seed with default values or remove from Sales UI

### Phase 1D — UI Polish
12. **UI-02**: Mark non-functional Accounting tabs as "Coming Soon"

---

## Summary

| Category | Count | Severity |
|----------|-------|----------|
| Data integrity bugs | 2 | HIGH (negative balance, duplicate phones) |
| Dead/orphaned code | 6 files (~2,500 lines) | MEDIUM |
| UI bugs | 3 | MEDIUM (duplicate header, CSV shift, empty shells) |
| Stale tables | 8 | LOW (no active harm) |
| Cron issues | 0 | None |

