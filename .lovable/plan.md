# Add Rejected ERP Entries to Daily Business Report

Append a new audit section at the end of the daily report email listing every ERP transactional entry that was **rejected during the report's IST calendar day**, including the rejecting user. No rejected entry is filtered out beyond the date scope, so the section is audit-complete.

## Scope

Time window: entries rejected on the report day only (same IST day used by every other section).

Sources included (transactional ERP entries):
- `terminal_purchase_sync` and `terminal_sales_sync` — `sync_status = 'rejected'`
- `small_buys_sync` and `small_sales_sync` — `sync_status = 'rejected'`
- `erp_action_queue` — `status = 'REJECTED'` (deposits/withdrawals)
- `erp_product_conversions` — `status = 'REJECTED'`

Buyer KYC onboarding rejections are intentionally excluded (already has its own KYC section logic).

## Data gathering (`supabase/functions/daily-report-email/index.ts`)

Add `buildRejected(supabase, date)`:
- Query each source for rejected rows, paginated via the existing `fetchAllRows`.
- Determine the rejection timestamp per source and keep only rows whose IST date (via existing `istDateStr`) equals the report date:
  - sync tables: `reviewed_at` (fall back to `updated_at`/`synced_at`)
  - `erp_action_queue`: `processed_at` (fall back to `updated_at`)
  - `erp_product_conversions`: `rejected_at`
- Resolve the rejecting user to a display name:
  - sync tables: `reviewed_by`
  - `erp_action_queue`: `processed_by`
  - conversions: `rejected_by_name` if present, else `rejected_by`
  - Batch-resolve the collected UUIDs against `users` (first_name/last_name/username); show "—" when unknown.
- Normalize each into a flat row: `{ type, label, amount, counterparty, reason, rejectedBy, rejectedAt }` (type = Terminal Buy / Terminal Sale / Small Buys / Small Sales / Deposit / Withdrawal / Conversion), reusing the same amount/label formatting style as the frontend rejected feed.
- Sort newest-rejected first and return `{ count, rows }`.
- Wire into `buildReport` return payload as `rejected`.

## Template (`supabase/functions/_shared/transactional-email-templates/daily-business-report.tsx`)

- Extend `DailyReportProps` with:
  `rejected?: { count: number; rows: { type: string; label: string; amount: string; counterparty: string; reason: string; rejectedBy: string; rejectedAt: string }[] }`
- Add a new `<Section>` (styled like other cards, with a red/destructive accent) rendered just before the footer, titled "Rejected ERP Entries (Audit)".
  - If `count === 0`: show "No entries were rejected on this day."
  - Otherwise a table with columns: Type, Details, Amount, Rejected By, Time, Reason.
- Keep `Body` background white per email rules; use red accent only on the card border/header.

## Deployment

After editing, deploy `daily-report-email`, `send-transactional-email`, and the shared template (registry already includes `daily-business-report`).

## Technical notes

- All counts use IST date conversion already present in the file; no new timezone logic.
- User-name resolution mirrors the pattern used elsewhere (first+last, fallback username).
- No schema/migration changes required — all needed columns (`reviewed_by`, `processed_by`, `rejected_by`, `*_at`, reason fields) already exist.
