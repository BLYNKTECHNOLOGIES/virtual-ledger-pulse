# Cleanup of Outdated / Unused Database Tables

I cross-referenced all **206 public tables** against the entire frontend (`src/`), every edge function (`supabase/functions/`), and all database functions/triggers. Most "code-orphan" tables are actually alive via RPC or triggers (e.g. `terminal_bypass_codes`, `terminal_webauthn_credentials`, `reversal_guards`, `terminal_mpi_snapshots`) — those are kept. The list below is what is genuinely dead: no UI usage, no edge-function usage, no DB-function usage.

## Tier A — Confirmed dead, safe to drop

**Customer Support module (leftover from the deleted Support page)**
- `customer_support_tickets` (2 rows)
- `customer_support_ticket_activities` (1 row)
- `customer_support_ticket_attachments` (0 rows)
- `customer_support_ticket_transfers` (1 row)

These have zero references in code, edge functions, or DB functions. The HR Helpdesk page uses a different table (`hr_helpdesk_tickets`), so it is unaffected. They have FKs among themselves, so they must be dropped together (children first, or `CASCADE`).

**Superseded MPI v1 tables** (replaced by the Horilla MPI v3 set used by `MPIPage.tsx`: `mpi_critical_violations`, `mpi_kpi_definitions`, `mpi_monthly_results`, `mpi_pip_records`, `mpi_scorecard_templates`)
- `mpi_audit_log` (0 rows)
- `mpi_monthly_scores` (0 rows)
- `mpi_score_overrides` (0 rows)

Zero rows, zero references anywhere.

## Tier B — Almost certainly dead, drop after a final dependency confirmation

These have no code/edge/DB-function references. The strings that looked like matches in code are unrelated local variable names (e.g. a `platforms` array built from wallets, not the table).
- `platforms` (8 rows) — superseded by the wallet-derived platform list in `SalesOrderDialog.tsx`
- `payment_methods_master` (9 rows) — superseded by the active `payment_methods` table
- `stock_adjustments` (0 rows) — superseded by `stock_transactions`
- `ad_payment_methods` (0 rows) — has 1 DB-function reference only; confirm that function is itself dead
- `wallet_drift_audit` (0 rows) — audit sink, never written; confirm no planned trigger relies on it
- `email_send_state` (1 row) — confirm the email cron/edge flow does not write it via RPC before dropping

## Approach

```text
1. Pre-flight (read-only): for each Tier B table, re-confirm
   - no foreign keys point INTO it from a live table
   - no trigger writes to it
   - row counts unchanged
2. Migration 1: DROP Tier A tables (CASCADE on the support set).
3. Migration 2: DROP Tier B tables individually after pre-flight passes.
4. Remove the now-orphaned types from src/integrations/supabase/types.ts
   (auto-regenerated after migration; no manual edit needed).
5. Storage: if a bucket exists solely for customer_support_ticket_attachments,
   flag it for removal (handled separately, not auto-deleted).
```

No UI changes are required — none of these tables render anywhere. This is a pure backend/data-model cleanup.

## Notes / not touched
- Cron/webhook-only edge functions (e.g. `daily-report-email`, `biometric-webhook`, `cleanup-pending-kyc`, `snapshot-asset-value`) are not called from `src/` by design — they are alive, not dead.
- `docs/binance_api-17.pdf` is reference material — kept.
- One-off `backfill-verified-names` edge function is harmless; can be removed later if desired (not included here).

## Question before I build
Do you want me to drop **both Tier A and Tier B** in this pass, or **Tier A only** (the most clear-cut: deleted-Support + dead-MPI tables) and leave Tier B for a separate review? Given the project's data-integrity priority, I will run the Tier B pre-flight checks regardless before any drop.
