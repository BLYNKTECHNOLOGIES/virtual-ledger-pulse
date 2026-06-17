# Daily Business Report Email (9 AM IST)

Send Shubham.singh@blynkex.com a detailed report every morning at 9:00 AM IST covering the **full previous day** (midnight–midnight, Asia/Kolkata). The email includes P&L, sales, purchases, wallet balances & fees, and key statistics, with copper/amber-themed charts embedded as images.

## What the report contains

1. **P&L Summary** — Gross profit, net profit, avg sales rate, effective purchase rate, NPM (per-USDT margin), total fees. Reuses the proven logic already in `snapshot-daily-profit` (effective-USDT fields, fee handling).
2. **Sales breakdown** — Total qty, total value, order count, average ticket, split by asset.
3. **Purchases breakdown** — Total qty, total value, order count, average ticket, split by asset.
4. **Wallet balances & fees** — End-of-day asset balances (USDT, TRX, BTC, etc.) and platform/transfer/order fee totals.
5. **Statistics** — Order counts, completed vs total, busiest hour, top counterparties/assets by volume, day-over-day comparison vs the prior day.
6. **Charts (copper/amber theme, embedded as PNG images)**
   - Sales vs Purchases value (bar)
   - P&L breakdown (gross → fees → net)
   - Volume by asset (bar)
   - Hourly activity (line)

Charts render as static images (email clients can't run JS) using a chart-image service; styled in copper/amber tones to match the report.

## How it works

```text
pg_cron (daily 03:30 UTC = 09:00 IST)
        │  HTTP POST
        ▼
edge fn: daily-report-email
   ├─ compute previous IST day window
   ├─ aggregate sales / purchases / P&L / wallet / fees / stats
   ├─ build copper-themed chart image URLs
   ├─ render HTML report
   └─ invoke send-transactional-email
                 │
                 ▼
        Lovable Emails → Shubham.singh@blynkex.com
```

## Technical implementation

### 1. New email template
- `supabase/functions/_shared/transactional-email-templates/daily-business-report.tsx` — React Email component rendering all sections (summary cards, data tables, embedded chart `<Img>` tags). White body background, copper/amber accents.
- Register `'daily-business-report'` in `_shared/transactional-email-templates/registry.ts`.

### 2. New edge function `daily-report-email`
- `supabase/functions/daily-report-email/index.ts` (service role; `verify_jwt = false`).
- Accepts optional `{ date }` for manual/backfill testing; defaults to previous IST day.
- Date window: build `dayStart`/`dayEnd` in IST and query by `order_date` (IST date) consistent with existing snapshot logic and the project's IST date convention.
- Data sources (matching project's truth sources):
  - Sales: `sales_orders` (status COMPLETED, effective_usdt fields)
  - Purchases: `purchase_orders` (effective_usdt fields)
  - Fees: `wallet_transactions` / `wallet_fee_deductions`
  - Balances: `wallet_asset_balances`
  - P&L: same formula as `snapshot-daily-profit` (Net = Gross − fees), respecting adjustment-bucket exclusions.
  - Uses `fetchAllPaginated`-style paging for >1000 rows.
- Builds chart image URLs (copper palette, e.g. `#B87333`, `#C77B3B`, `#8C5A2B`) via QuickChart-style image endpoint.
- Calls `send-transactional-email` with `templateName: 'daily-business-report'`, `recipientEmail: 'Shubham.singh@blynkex.com'`, an `idempotencyKey` of `daily-report-<ISTdate>`, and all aggregated `templateData`.

### 3. Schedule (pg_cron)
- Insert a `cron.schedule` job `daily-report-email-9am-ist` at `30 3 * * *` (09:00 IST) that POSTs to the function URL with the project anon key header. Inserted via the Supabase insert tool (contains project-specific URL/key), not a migration.

### 4. Deploy
- Deploy `daily-report-email` and `send-transactional-email` (template/registry change).

## Verification
- Manually invoke `daily-report-email` with a known past date and confirm the email arrives with correct figures and rendered charts.
- Cross-check totals against the Statistics/Accounting pages for that date.
- Confirm `email_send_log` shows `sent` for the report.

## Notes / constraints
- All financial figures come from the existing ledger truth sources; no manual/dummy data.
- Adjustment buckets and 'Manual Baseline Reset' are excluded from aggregations (per project rules).
- Email is app/transactional (single recipient, event-driven) — compliant with Lovable Emails.
- Recipient is hardcoded to Shubham.singh@blynkex.com; easy to extend later.
