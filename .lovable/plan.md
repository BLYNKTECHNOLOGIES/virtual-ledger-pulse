# Configurable Business Report Formats

Add an ERP tab (Super Admin only) to manage multiple business‑report email formats — each with its own name, recipients, send time, and content variant. Ship a second built‑in variant, **Operations Business Report**, that hides all profit/asset‑value figures but keeps the Stock‑by‑Asset and POS/Gateway detail tables. Migrate the existing 11 AM management report into this tab as the **Profit Business Report** so its recipients and time become editable.

## How it works today

- `daily-report-email` edge function builds one full report object and renders the `daily-business-report` email template.
- A pg_cron job `daily-report-email-11am-ist` (`30 5 * * *` UTC = 11 AM IST) fires it to two hardcoded recipients (`RECIPIENTS`). A separate monthly job stays untouched.
- The template already renders sections conditionally based on which fields are present (`pnl`, `assetValue`, `narrative`, `charts.pnl`, etc.).

## Data model

New table `public.report_email_configs`:

```text
id            uuid pk
name          text                 -- e.g. "Profit Business Report"
variant       text                 -- 'profit' | 'operations'
recipients    text[]               -- list of email IDs
send_time     text                 -- 'HH:MM' in IST (24h)
enabled       boolean default true
is_monthly    boolean default false
last_sent_on  date                 -- idempotency guard for the dispatcher
created_at / updated_at timestamptz + update trigger
```

- GRANTs: `authenticated` (SELECT/INSERT/UPDATE/DELETE), `service_role` ALL. No `anon`.
- RLS: all actions gated to Super Admin via the existing role check (`has_role`/role hierarchy used elsewhere). Service role (edge functions) bypasses RLS.
- Seed two rows: `Profit Business Report` (variant `profit`, `send_time` `11:00`, recipients = current two management addresses) and `Operations Business Report` (variant `operations`, send_time chosen in the UI, recipients empty until set).

## Scheduling (dispatcher)

- New edge function `dispatch-report-emails`: computes the current IST `HH:MM`, selects enabled `report_email_configs` whose `send_time` matches the current minute window and `last_sent_on <> today`, and for each invokes `daily-report-email` with `{ recipients, variant, isMonthly }`; then stamps `last_sent_on = today`.
- New pg_cron job runs the dispatcher every 5 minutes (`*/5 * * * *`). Matching uses an HH:MM equality against the 5‑minute window so a config sends once at its configured time.
- Remove the old fixed `daily-report-email-11am-ist` cron job (its behavior is now the seeded Profit config). The monthly cron job is left unchanged.
- Idempotency: `daily-report-email` idempotency key will include the variant (`daily-report-${date}-${variant}-${recipient}`) so Profit and Operations sends to the same address never collide; `last_sent_on` prevents duplicate dispatch within a day.

## Report content — Operations variant

`daily-report-email` accepts a `variant` param (default `profit`). When `variant === 'operations'`, before sending it strips profit/asset figures from the report object:

- Remove `pnl` → hides Gross/Net Profit KPI cards **and** the P&L Summary card.
- Remove `narrative` → hides the AI Daily Narrative.
- Remove `charts.pnl` → hides the P&L breakdown chart.
- Reshape `assetValue`: set an `operationsMode` flag; keep **POS/Gateway total row**, **Stock‑by‑Asset table**, and **POS/Gateway detail table**; drop the Total Asset Value KPI amount and the Bank Balances / Stock Valuation / Unpaid TDS / Net Total rows.

Everything else (Sales, Purchases, Wallet, Expenses, Shifts, Platform Rates, Stats, KYC, ERP‑vs‑Terminal diff, other charts) is unchanged. The balance‑snapshot cleanup after a successful daily send is kept only for the Profit variant so the Operations send doesn't erase snapshots the Profit report still needs.

## Template change

`daily-business-report.tsx`: in the Total Asset Value section, honor `assetValue.operationsMode` — when true, render only the POS total row + the two tables and skip the total KPI card and the other breakdown rows. No change to any section when the flag is absent (existing report unaffected).

## Frontend tab

- New page `src/pages/ReportSettings.tsx`, route `/report-settings`, added to `App.tsx` behind `AuthCheck`/`Layout`.
- Sidebar (`AppSidebar.tsx`) + mobile nav entry, gated to Super Admin only (reuse the super‑admin check already used for restricted items).
- The page lists configs in cards with: name, variant badge (Profit / Operations), editable recipients (chip input), send‑time picker, enabled toggle, and a **Send now** button (invokes `daily-report-email` with that config's variant + recipients for a manual run). CRUD via `@tanstack/react-query` against `report_email_configs`. `AlertDialog` for delete confirmation, per project UI conventions. Variant is chosen from the two built‑in variants (extensible later).

## Files touched

- Migration: create `report_email_configs` (+ grants, RLS, trigger, seed); add dispatcher cron; drop old 11 AM cron.
- `supabase/functions/dispatch-report-emails/index.ts` (new).
- `supabase/functions/daily-report-email/index.ts` (variant param + operations stripping + variant‑scoped idempotency & snapshot cleanup).
- `supabase/functions/_shared/transactional-email-templates/daily-business-report.tsx` (operationsMode rendering).
- `src/pages/ReportSettings.tsx` (new) + `src/App.tsx` route.
- `src/components/AppSidebar.tsx` + `src/components/MobileBottomNav.tsx` (Super‑Admin‑only nav entry).

## Validation

- `bunx tsgo --noEmit`.
- Deploy `daily-report-email` and `dispatch-report-emails`; use `dryRun` to confirm both variants build correctly and that the Operations payload has no `pnl`/`narrative`/`charts.pnl` and a reshaped `assetValue`.
- Manually invoke the dispatcher to confirm it selects matching configs and stamps `last_sent_on`.
