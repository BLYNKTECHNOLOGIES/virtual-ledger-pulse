

# ERP Full System Audit — Phase 17 Report

## Phases 1-16 Status (completed)
All previous phases complete: data integrity fixes, orphaned code removal, permissions cleanup, XSS fixes, dead tabs/tables, dead hooks/utils/components, console.log batches 1-5, native confirm() dialogs, manual purchase RPC rebuild, P&L backfill, useQuery refactors, hard-reload elimination.

---

## CATEGORY A: Data Integrity / Security Bugs (3 items)

### P17-SEC-01: Hardcoded `'Current User'` string in 4 files instead of actual user ID
**Impact: HIGH** — Audit trail is broken for bank account closures, compliance investigations, and case tracking. The string `'Current User'` is inserted into `closed_by`, `assigned_to`, `completed_by`, and `created_by` columns instead of the real user UUID.

**Files affected:**
- `src/components/bams/CloseAccountDialog.tsx` (line 188) — `closed_by: 'Current User'`
- `src/components/compliance/CaseTrackingTab.tsx` (line 92) — `investigation_assigned_to: 'Current User'`
- `src/components/compliance/InvestigationDetailsDialog.tsx` (lines 167, 225, 338) — `completed_by`, `created_by`, `submitted_by`
- `src/components/compliance/AccountStatusTab.tsx` (line 396) — `assigned_to: 'Current User'`

**Fix:** Replace all 6 occurrences with `getCurrentUserId()` from `@/lib/system-action-logger`, falling back to `auth.uid()` where the column expects a UUID. For text columns that store names, use `user.email` or `user.username` from the auth context.

**Live data corruption:** 2 rows in `closed_bank_accounts` already have `closed_by = 'Current User'`. Will backfill with the actual user who performed the closure if determinable from `system_action_logs`, otherwise mark as `'system-backfill'`.

### P17-SEC-02: `stock_transactions` — 100% of rows have `created_by = NULL`
**Impact: MEDIUM** — 1,373 out of 1,373 stock transaction rows lack audit attribution. This was caused by the old RPC functions not passing `created_by`. The rebuilt purchase RPCs (Phase 15) now pass `created_by`, but historical data is unattributed.

**Fix:** No retroactive backfill possible (original actor unknown). Document as known data gap. Verify the new purchase RPC correctly sets `created_by` going forward by checking one recent test entry.

### P17-SEC-03: `wallet_transactions` — 85% of rows have `created_by = NULL`
**Impact: MEDIUM** — 4,323 out of 5,056 wallet transaction rows lack audit attribution. Same root cause as P17-SEC-02.

**Fix:** Same approach — document as historical gap. The rebuilt RPCs now set `created_by`. No safe retroactive backfill.

---

## CATEGORY B: Aggressive Polling / Performance (2 items)

### P17-PERF-01: `WalletManagementTab` polls at 5-second intervals
Two queries in `WalletManagementTab.tsx` use `refetchInterval: 5000` with `staleTime: 0`. This fires 24 queries/minute per tab visitor, even when the data rarely changes.

**Fix:** Increase to `refetchInterval: 30000` (30s) and `staleTime: 10000` (10s). Wallet data doesn't change every 5 seconds.

### P17-PERF-02: `ExpensesIncomesTab` polls at 5-second intervals
`src/components/bams/journal/ExpensesIncomesTab.tsx` uses `refetchInterval: 5000`. Bank journal entries don't change every 5 seconds.

**Fix:** Increase to `refetchInterval: 30000`.

---

## CATEGORY C: Code Quality (2 items)

### P17-QUAL-01: Silent empty `catch {}` blocks in 5 locations
These swallow errors without any logging:
- `useTaskComments.ts:101`
- `useAdActionLog.ts:111`
- `RealDataWidgets.tsx:1090`
- `TerminalSettings.tsx:49`
- `ProfitLoss.tsx:265`

**Fix:** Add `console.warn` to each so failures are visible during debugging. The `TerminalSettings.tsx` one (localStorage parse) is acceptable as-is since it has a fallback.

### P17-QUAL-02: `useUSDTRate.tsx` — last remaining `console.debug` call
One `console.debug` remains gated behind `import.meta.env.DEV`, which is acceptable. No action needed — document as intentional.

---

## Summary Table

| # | ID | Action | File(s) |
|---|------|--------|---------|
| 1 | P17-SEC-01 | Replace 6x `'Current User'` with real user ID | CloseAccountDialog, CaseTrackingTab, InvestigationDetailsDialog, AccountStatusTab |
| 2 | P17-SEC-02 | Document stock_transactions audit gap | Documentation only |
| 3 | P17-SEC-03 | Document wallet_transactions audit gap | Documentation only |
| 4 | P17-PERF-01 | Reduce WalletManagementTab polling 5s → 30s | WalletManagementTab.tsx |
| 5 | P17-PERF-02 | Reduce ExpensesIncomesTab polling 5s → 30s | ExpensesIncomesTab.tsx |
| 6 | P17-QUAL-01 | Add console.warn to 4 silent catch blocks | 4 files |

**Total: 6 hardcoded 'Current User' strings fixed, 2 polling intervals reduced, 4 silent catch blocks instrumented**

No database schema changes needed. One data-fix query to backfill the 2 `closed_bank_accounts` rows.

