

## ERP Balance Integrity — Permanent Self-Healing Architecture

### What I diagnosed

Three independent drift vectors, each with a clear code-level root cause:

**1. Bank cache drift — ₹348,226 across 11 accounts (live, right now).**
`bank_accounts.balance` is a **cached column** updated by trigger `trigger_update_bank_account_balance`. Sum of `bank_transactions` ≠ cache because at some point the cache was written directly (manual UPDATE / RPC / trigger disable), and there is no daily auto-heal. The hourly `erp-balance-snapshot` records the gap but **never raises an alert** (`erp_drift_alerts` table is empty after weeks of running).

**2. Wallet asset drift — fixed for conversions, still possible for sync.**
The Migration 2 RPC rewrite closed the conversion vector. But `binance-assets` (deposits/withdrawals via `erp_action_queue`) still requires a human to click "Process". A skipped/rejected queue item silently leaves Binance and ERP out of sync, with no comparison job to catch it.

**3. No external source-of-truth reconciliation.**
Nothing in the system pulls live Binance Spot balances or live bank statements and compares them to ERP balances. All "drift detection" today is internal-vs-internal (cache vs ledger sum), which can't detect missing transactions — only stale caches.

### What we'll build (4 layers, all automatic, zero operator clicks)

#### Layer 1 — Lock the cache (prevent future bank drift at the source)

- Migration: `bank_accounts.balance` becomes an **always-derived value** via `BEFORE UPDATE` trigger that overwrites any direct write with `(SELECT calculated FROM get_bank_calculated_balances WHERE bank_account_id = NEW.id)`. Direct UPDATEs to `balance` from anywhere except the txn trigger get silently corrected.
- Same pattern applied to `wallets.current_balance` and `wallet_asset_balances.balance`.
- One-time backfill: re-derive all bank cache balances from `bank_transactions` SUM. The ₹348k discrepancy disappears.
- Audit row written to `adjustment_posting_audit` for every backfill change so nothing is silent.

#### Layer 2 — Activate the existing snapshot's alert path (zero new infra)

The hourly `erp-balance-snapshot` already runs; it just doesn't alert. Two changes:
- Edge function update: after writing snapshot lines, INSERT into `erp_drift_alerts` for any line where `|tracked − calculated| > threshold` (USDT 1, INR 10, BTC 0.0001, others 0.001).
- Add **per-asset** wallet calculation (today only USDT-summary is compared). Use `get_wallet_calculated_balances_per_asset` (new SQL function aggregating `wallet_transactions` by `wallet_id, asset_code`).
- Auto-resolve alerts that disappear in the next snapshot (`resolved_at = now()`), so the alerts table stays a live "open issues" list.

#### Layer 3 — External source-of-truth reconciliation (catches missing txns, not just stale caches)

New scheduled edge function `audit-binance-vs-ledger` (every 30 min):
- For each Binance-linked wallet (BINANCE BLYNK, etc.), call `binance-assets` proxy: `GET /api/v3/account` (Spot) and `GET /sapi/v1/asset/wallet/balance` (Funding).
- Compare each asset to `wallet_asset_balances.balance` for that wallet.
- If `|delta| > threshold`, write to `wallet_drift_audit` (new table) and create an `erp_drift_alerts` row tagged `source='BINANCE_LIVE'`.
- **Auto-heal for deposits/withdrawals**: when delta matches an unprocessed `erp_action_queue` item exactly, auto-process it (no human click), tagged `processed_by = SYSTEM_AUTORECONCILE`.
- Reasonable rate-limit: respect Binance weight budget; one paged call per 30 min is well under cap.

For bank accounts there is no automatic external feed, so we use a different mechanism:
- New module-level field `bank_accounts.last_statement_balance` + `last_statement_at`.
- BAMS UI gets a one-field "Statement balance as of <time>" entry on each bank card (operator pastes ledger balance from bank app once a day during shift recon — already part of existing shift workflow per `mem://features/erp/shift-reconciliation-tool-v2`).
- Same `audit-binance-vs-ledger` job (renamed `audit-balances-vs-truth`) compares this to the cached `balance`. Drift alert if mismatch persists more than 6 h.

#### Layer 4 — Forward-only invariants (kill the remaining manual-error surface)

- `wallet_transactions` and `bank_transactions`: **disallow** direct DELETE/UPDATE on `amount`, `transaction_type`, `wallet_id/bank_account_id`, `asset_code` once `created_at` is older than 5 minutes. Reversals must go through a paired `RECONCILIATION` row (current convention) — this is enforced by trigger, not policy.
- `MANUAL_ADJUSTMENT` rows must reference an `adjustment_posting_audit` row with a non-empty `notes` field and a Super Admin `posted_by`. Trigger rejects the insert otherwise. (This kills the original 6,881 USDT misposting class permanently.)
- Adjustment-bucket exclusion (per `mem://financials/adjustment-bucket-exclusion`) is now enforced inside `get_wallet_calculated_balances_per_asset` and the snapshot job — adjustment wallets always reconcile to themselves and never inflate aggregates.

### What stays manual (deliberately)

- **Initial bank statement entry** (Layer 3): legally we can't read bank balances without per-bank API integration, which requires per-bank vendor onboarding. The 1-field daily entry is the minimum operator touch.
- **Variance overrides on conversions** (>1 USDT): kept as Super-Admin override per current policy. Auto-approving these would re-open the drift door.

Everything else — drift detection, alerting, auto-heal of cached fields, auto-process of matched Binance movements — runs on cron and never asks the operator anything.

### UI surface (read-only, no new operator workflow)

- New page: `/admin/balance-integrity`. Shows: open `erp_drift_alerts` grouped by source, snapshot trend (drift over time), last successful Binance reconcile, last bank statement entry per account.
- Dashboard widget: red badge "N drift alerts" linking to that page. Visible only to Admin / Super Admin / Auditor.

### Files / DB objects touched

**New edge functions**
- `supabase/functions/audit-balances-vs-truth/index.ts` — every 30 min, Binance + bank statement comparison + auto-heal.

**Updated edge function**
- `supabase/functions/erp-balance-snapshot/index.ts` — emit `erp_drift_alerts`, per-asset wallet calc, auto-resolve.

**Migrations**
- Bank/wallet cache lock triggers + one-time backfill.
- New SQL function `get_wallet_calculated_balances_per_asset`.
- New table `wallet_drift_audit` (live-vs-ledger Binance gap log).
- Add `bank_accounts.last_statement_balance`, `last_statement_at`, `last_statement_by`.
- Forward-only invariant triggers on `wallet_transactions`, `bank_transactions`.
- `MANUAL_ADJUSTMENT` enforcement trigger (audit row + Super Admin required).

**Cron**
- Add `audit-balances-vs-truth-30min` (`*/30 * * * *`).

**Frontend**
- New route `src/pages/admin/BalanceIntegrity.tsx` + `src/hooks/useBalanceIntegrity.ts`.
- Dashboard alert badge component.
- BAMS bank card: small "Statement balance" inline editor.

### What this prevents going forward

- Bank cache drift: structurally impossible (cache is now derived).
- Wallet cache drift: structurally impossible (same lock pattern).
- Missing Binance deposits/withdrawals: caught and auto-applied within 30 min.
- Operator-skipped `erp_action_queue` items: auto-processed when they match a real Binance delta.
- Manual adjustments without audit context: rejected at insert.
- Unnoticed silent drift: alerts surface in dashboard within 1 hour.

### Risk / scope notes

- Layer 1 cache lock will produce ~10 audit rows immediately (the ₹348k backfill). I'll preview them before commit.
- Auto-heal in Layer 3 only fires for **exact-match** deltas (same asset, same amount, same direction, queue item exists). Anything ambiguous becomes an alert, never an auto-posting.
- No changes to existing P&L, conversion, sales, purchase logic — this is a pure observability + invariant layer on top of the just-fixed conversion RPC.

Approve scope and I'll execute Layer 1 + Layer 2 first (immediate value, fully internal), then Layer 3 + Layer 4 in a follow-up batch so the Binance-side auto-heal can be observed for a few cycles before the forward-only invariants lock down.

