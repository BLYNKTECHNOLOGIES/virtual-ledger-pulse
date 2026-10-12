# Public site stats function (read-only)

## 1. Metrics, sources and today's counts (checked 12 Oct 2026, ~11:15 PM IST)

| Metric | Definition | Exact today | Returned | Website |
|---|---|---|---|---|
| identities_verified | `clients` where `kyc_status = 'VERIFIED'` and not `is_deleted` | 5,636 | 5,600 | 3,800+ |
| ledger_records | rows in the two hash-chained ledgers: `bank_transactions` + `wallet_transactions` (both carry `row_hash`/`prev_hash`, 100% hashed) | 15,646 + 27,337 = 42,983 | 42,000 | 1M+ |
| risk_events_flagged | `risk_detection_logs` where `flagged = true` (written only by the automated `risk-detection` scan) | **0** (11,901 checks run, none triggered; `risk_flags` also 0) | 0 | 6,000+ |
| team_members | `hr_employees` where `is_active = true` | 36 | 36 | 30+ |

Notes for the owner:
- The hash-chained ledger covers only bank and wallet entries. Other order tables (Binance order history ~67k, sales/purchase/stock) are not hash-chained, so they are not counted. Even including them, the total is under 150k — "1M+" cannot be backed by ERP data.
- "6,000+ risk events" is not supported: the automated risk scan has never flagged anyone. Options: (a) show 0 / hide the figure, or (b) redefine as "automated risk checks run" (11,901 → 11,000). The plan defaults to (a), strict flagged count, until you choose.
- Team count includes owners/directors on the "contract" type; tell me if they should be excluded.

## 2. Output
`GET` returns only:
```text
{ generated_at, identities_verified, ledger_records, risk_events_flagged, team_members }
```
Each value floored to two significant figures (3,796 → 3,700; 36 → 36; 0 → 0). No ids, names, exact counts or errors with detail.

## 3. Caching
- New table `public_site_stats_cache` (single row: payload jsonb, computed_at). RLS on, no policies, grants to `service_role` only — invisible to the app and to anon.
- On request: if `computed_at` is under 1 hour old, return it. Otherwise recompute, upsert, return. No cron.
- Cheap counts: `count: 'exact', head: true` per metric (4 small queries, all index/seq scans on tables under 30k rows). A stampede guard skips recompute if another request refreshed within the last minute; on any failure the last cached payload is returned.

## 4. Access
- `supabase/config.toml`: `[functions.public-site-stats] verify_jwt = false`.
- CORS: echo `Origin` only if it is `https://blynkex.com`, `https://www.blynkex.com`, or matches `https://*.lovable.app`; OPTIONS handled; GET only (405 otherwise).
- Header `Cache-Control: public, max-age=3600`.

## 5. Safety
- Function uses the service-role key server-side only, issues read-only `count` queries on four tables, and writes only its own cache row.
- No triggers, RPCs, pg_net calls, cron jobs or shared helpers touched; trading engines (auto-price/pay/reply) share no code or tables with it.
- Load bounded to at most ~4 count queries per hour regardless of traffic (plus CDN caching via the header).
- No changes to existing tables, functions, calculations or UI.

## 6. Logging
Append one line to `docs/STATE_LOG.md`: "2026-10-xx: Shipped read-only public-site-stats edge fn + public_site_stats_cache (service-role only); hourly self-cache, 2-sig-fig floored counts."

## Technical details
- Files: `supabase/functions/public-site-stats/index.ts`, one migration (create cache table, grant service_role, enable RLS), config.toml section, state log line.
- Verification after build: curl GET (200, shape, headers), CORS preflight from allowed and disallowed origins, second call served from cache.
