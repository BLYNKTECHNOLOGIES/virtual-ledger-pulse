# Reconciliation & Exception Cockpit

## Goal
One dedicated page that surfaces **only anomalies** across the ERP's financial truth sources, so ops catch integrity issues before they compound. Nothing is invented — this consolidates signals that already exist in the database plus a few cheap derived checks. Read-first, with a lightweight acknowledge/resolve workflow. No changes to existing ledger logic.

## Where the data already lives
```text
erp_drift_alerts        → tracked vs calculated balance drift (severity, acknowledged, resolved)
erp_balance_snapshots   → snapshot headers (fed by erp-balance-snapshot edge fn)
ledger_tamper_log       → blocked wallet-ledger tamper attempts
bank_ledger_tamper_log  → blocked bank-ledger tamper attempts
adjustment_posting_audit→ every posting into an adjustment/contra bucket
shift_reconciliations   → shift mismatches (has_mismatches, mismatch_count)
wallet_asset_balances   → per-asset balances (negatives on non-CREDIT = anomaly)
purchase/sales_order_payment_splits → split totals vs order total (0.01 epsilon)
erp_action_queue + terminal/small sync tables → pending entries (aging)
```

## The Cockpit — six exception lanes
A single route `/reconciliation` rendering one card per lane. Each lane shows a count badge, severity color, and an expandable list. Empty lanes collapse to a green "clear" state so a healthy system reads as mostly green.

1. **Balance Drift** — unresolved `erp_drift_alerts` (tracked ≠ calculated), grouped by entity, sorted by severity then absolute drift. Row shows entity, asset, tracked vs calculated, drift delta.
2. **Payment-Split Mismatches** — purchase/sales orders where the sum of `*_payment_splits` differs from the order total beyond the 0.01 epsilon. Derived via a read-only DB function (below).
3. **Negative Non-CREDIT Balances** — `wallet_asset_balances` with `balance < 0` where the account is not a CREDIT/Balance-Adjustment account (honors the existing exclusion rules from memory).
4. **Stale Pending Approvals** — entries from the ERP Entry Manager sources aging past thresholds (e.g. >4h warning, >24h critical), reusing the existing feed logic so counts stay consistent.
5. **Tamper Attempts** — recent `blocked = true` rows from `ledger_tamper_log` + `bank_ledger_tamper_log` (security signal, last 7 days).
6. **Shift Mismatches** — `shift_reconciliations` where `has_mismatches` and `status` not yet reviewed.

## Workflow
- Each drift/mismatch row gets **Acknowledge** (writes `acknowledged_by`/`acknowledged_at` on `erp_drift_alerts`; equivalent state table for derived lanes) and, where applicable, a **Resolve** action with a mandatory reason, logged via the existing `system-action-logger`.
- A top-bar **"Run Snapshot Now"** button invokes the existing `erp-balance-snapshot` edge function and refetches, so users can force a fresh drift calculation on demand.
- Realtime subscription on `erp_drift_alerts` (+ periodic 60s refetch of derived lanes) so the cockpit stays live without a global refetch storm.

## Permissions
- Gate the page and its actions behind the existing `erp_reconciliation` system function + Admin/Super Admin (reuse `useErpReconciliationAccess`). Acknowledge is allowed for anyone with access; **Resolve** requires `erp_destructive`-style manage rights (align with existing granular pattern — confirm exact key during build).
- Adjustment/contra buckets and the "Manual Baseline Reset" category stay excluded from all lanes per existing accounting rules.

## Technical work

### Database (migration)
- Read-only SQL function `get_payment_split_mismatches()` returning order id, type, order total, split total, delta — for lane 2. No data mutation.
- Optional tiny state table `reconciliation_exception_state` (exception_type, exception_ref, acknowledged_by/at, resolved_by/at, resolution_reason) for lanes that lack their own ack columns (2, 3, 4). Full GRANT + RLS block gated to `authenticated` with the reconciliation function; `service_role` full. `erp_drift_alerts` already has its own ack/resolve columns and needs no schema change.

### Hooks (`src/hooks`)
- `useReconciliationCockpit.ts` — one query per lane via `Promise.all`, normalized into a shared `ExceptionRow` shape (mirrors the `ErpEntryRow` pattern already used). 60s refetch + realtime channel on `erp_drift_alerts` with proper `removeChannel` cleanup.
- `useAcknowledgeException.ts` / `useResolveException.ts` — mutations writing to `erp_drift_alerts` or the state table, invalidating the cockpit query.

### UI (`src/components/reconciliation` + `src/pages/Reconciliation.tsx`)
- `Reconciliation.tsx` page shell (access gate + skeletons, matching `ErpEntryManager` structure).
- `ExceptionLane.tsx` (collapsible card, count badge, severity color, clear-state), `ExceptionRow.tsx` (details + ack/resolve buttons using `AlertDialog`, never `confirm()`), `SnapshotNowButton.tsx`.
- Reuse existing severity/soft-badge styling and `tabular-nums` for numeric columns; no new brand colors.

### Routing & nav
- Add `/reconciliation` route in `src/App.tsx` inside the main `Layout`.
- Add a permission-aware "Reconciliation" item to `AppSidebar` (hidden without access).

## Explicitly out of scope
- No changes to how balances, WAC, splits, or reversals are computed — the cockpit only reads and flags. It never auto-corrects or posts adjustments.
- No Binance API additions (all data is internal). No terminal-side changes.

## Verification
- Seed/read real rows via `supabase--read_query` to confirm each lane's query returns the expected anomalies and that healthy entities are excluded.
- Confirm the epsilon function matches the 0.01 tolerance used elsewhere.
- Playwright pass: load `/reconciliation` as an authorized session, confirm lanes render, acknowledge a drift row, verify it drops out and the audit log records the actor.
