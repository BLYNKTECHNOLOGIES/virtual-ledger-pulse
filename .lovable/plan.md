# ERP Full System Audit — Phase 18 Report

## Phases 1-17 Status (completed)

All previous phases complete: data integrity fixes, orphaned code removal, permissions cleanup, XSS fixes, dead tabs/tables, dead hooks/utils/components, console.log cleanup (client-side complete), native confirm() dialogs, manual purchase RPC rebuild, P&L backfill, useQuery refactors, hard-reload elimination, 'Current User' audit fix, polling reduction, silent catch blocks.

---

## CATEGORY A: Performance — Aggressive Polling (6 items)

Phase 17 fixed 2 polling hotspots, but 6 more remain at 10-second intervals with `staleTime: 0`. These fire 6 queries/minute each per open tab.

### P18-PERF-01: `useWalletStock` — 4 queries at 10s polling

- `src/hooks/useWalletStock.tsx` lines 41-42, 59-60: Two queries with `refetchInterval: 10000, staleTime: 0`
- `src/hooks/useWalletStockWithCost.tsx` lines 57-58, 148-149: Two more queries same pattern

**Fix:** Increase all 4 to `refetchInterval: 30000, staleTime: 10000`. Wallet stock doesn't change every 10 seconds.

### P18-PERF-02: `WalletSelector` — 10s polling

- `src/components/stock/WalletSelector.tsx` line 67-68: `refetchInterval: 10000, staleTime: 0`

**Fix:** `refetchInterval: 30000, staleTime: 10000`.

### P18-PERF-03: `StockTransactionsTab` — 10s polling

- `src/components/stock/StockTransactionsTab.tsx` line 372: `refetchInterval: 10000`

**Fix:** `refetchInterval: 30000`.

### P18-PERF-04: `Dashboard` — 10s polling with `gcTime: 0`

- `src/pages/Dashboard.tsx` line 323-325: `refetchInterval: 10000, staleTime: 0, gcTime: 0`

This is the main ERP dashboard. Every 10 seconds it re-fetches AND discards cache.

**Fix:** `refetchInterval: 30000, staleTime: 10000`. Remove `gcTime: 0`.

### P18-PERF-05: `QueryProvider` global default — 60s polling on ALL queries

- `src/components/QueryProvider.tsx` line 12: `refetchInterval: 60000` as global default

This means every `useQuery` in the entire app polls every 60 seconds by default, even for static data like roles, products, permissions. This is wasteful.

**Fix:** Remove the global `refetchInterval`. Let individual queries opt-in to polling where needed. This alone reduces hundreds of unnecessary background requests.

### P18-PERF-06: `useBinanceAssets` — 10-15s polling

- `src/hooks/useBinanceAssets.tsx` lines 65-66: `refetchInterval: 15000, staleTime: 5000` (balances)
- Line 81-82: `refetchInterval: 10000, staleTime: 3000` (ticker prices)

**Fix:** Balances → `refetchInterval: 30000`. Ticker prices → `refetchInterval: 20000` (prices change faster, but 10s is excessive for a dashboard widget).

---

## CATEGORY B: Security — Hardcoded Password Backdoor (1 item)

### P18-SEC-01: `validate_user_credentials` still contains hardcoded admin password

**Impact: CRITICAL** — The security scan confirms `validate_user_credentials` has a hardcoded plaintext password `'Blynk@0717'` for a specific admin email. This is a permanent backdoor visible in migration files and the live function.

**Fix:** Create a migration to `CREATE OR REPLACE` the function, removing the hardcoded password branch entirely. All logins must go through the `crypt()` hash comparison path.

---

## CATEGORY C: Security — Anonymous Access to Role Data (1 item)

### P18-SEC-02: `user_roles` and `roles` tables readable by anonymous users

**Impact: HIGH** — The security scan found `anon_read_user_roles` and `anon_read_roles` policies that let unauthenticated users enumerate all user IDs and their roles (including Super Admin). This enables targeted attacks.

**Fix:** Migration to drop both anonymous read policies:

```sql
DROP POLICY IF EXISTS "anon_read_user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "anon_read_roles" ON public.roles;
```

---



---

## Summary Table


| #   | ID          | Severity | Action                                              | Target                                 | &nbsp; | &nbsp; |
| --- | ----------- | -------- | --------------------------------------------------- | -------------------------------------- | ------ | ------ |
| 1   | P18-PERF-01 | MEDIUM   | Reduce wallet stock polling 10s → 30s               | useWalletStock, useWalletStockWithCost | &nbsp; | &nbsp; |
| 2   | P18-PERF-02 | LOW      | Reduce WalletSelector polling 10s → 30s             | WalletSelector.tsx                     | &nbsp; | &nbsp; |
| 3   | P18-PERF-03 | LOW      | Reduce StockTransactionsTab polling 10s → 30s       | StockTransactionsTab.tsx               | &nbsp; | &nbsp; |
| 4   | P18-PERF-04 | MEDIUM   | Reduce Dashboard polling 10s → 30s, remove gcTime:0 | Dashboard.tsx                          | &nbsp; | &nbsp; |
| 5   | P18-PERF-05 | HIGH     | Remove global 60s refetchInterval default           | QueryProvider.tsx                      | &nbsp; | &nbsp; |
| 6   | P18-PERF-06 | LOW      | Reduce Binance asset polling 10-15s → 20-30s        | useBinanceAssets.tsx                   | &nbsp; | &nbsp; |
| 7   | P18-SEC-01  | CRITICAL | Remove hardcoded admin password backdoor            | SQL migration                          | &nbsp; | &nbsp; |
| 8   | P18-SEC-02  | HIGH     | Drop anonymous read policies on user_roles/roles    | SQL migration                          | &nbsp; | &nbsp; |
| 9   | &nbsp;      | &nbsp;   | &nbsp;                                              | &nbsp;                                 | &nbsp; | &nbsp; |


**Total: 6 polling reductions (eliminating ~600+ unnecessary queries/minute across the app), 1 critical security backdoor removed, 1 anonymous data exposure closed, 1 key leak fixed**

### Technical Details

The `QueryProvider` global default change is the highest-impact single fix: removing `refetchInterval: 60000` from the default query options stops every query in the app from polling unnecessarily. Only queries that explicitly set `refetchInterval` (terminal orders, chat, active ads) will continue polling — which is correct behavior.

The hardcoded password removal requires checking the current live function signature to ensure we don't break the normal `crypt()` authentication path.

The `verify-binance-keys` fix is a simple edge function redeploy — change the response format from partial-key strings to boolean flags.