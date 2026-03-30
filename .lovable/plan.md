

# ERP Full System Audit — Phase 22: New Subsystem Audit

## Phases 1-21 Status (completed)
All previous phases complete through Phase 21 (RLS hardening, bypass function drop, FAILED spot trade trigger).

---

## Finding 1: Auto-Price Engine Circuit Breaker — VERIFIED OK

**Status: No action needed.**

- Circuit breaker is checked at the top of every engine invocation (line 26-45 of `auto-price-engine/index.ts`)
- OPEN state correctly blocks execution with cooldown check
- HALF_OPEN correctly allows a test run and transitions to CLOSED or back to OPEN
- CLOSED correctly counts failures and opens at threshold
- `is_dry_run` is correctly checked (line 518) — skips the actual Binance `updateAd` call and logs with `action: 'dry_run'`
- Singleton enforcement trigger exists

---

## Finding 2: Pricing Effectiveness Snapshots — VERIFIED OK

**Status: No action needed.**

- `generate_pricing_effectiveness_snapshot()` function exists and is well-structured (aggregates from `ad_pricing_logs` + `binance_order_history`)
- Daily cron job **already scheduled** via migration `20260330103638`: `cron.schedule('generate_pricing_effectiveness_snapshot', '0 1 * * *', ...)`
- The reported "no cron" gap has already been addressed

---

## Finding 3: Bank Cases — TEXT User Columns (P22-DATA-01)

**Severity: MEDIUM** — `assigned_to`, `created_by`, `resolved_by`, `investigation_assigned_to` are all `TEXT` with no FK to `users`. They store UUIDs as strings (via `getCurrentUserIdAsync()`) but there's no referential integrity.

Additionally, `CaseGenerator.tsx` does **not set `created_by`** when inserting a new case — the field is left NULL.

### Fix (Migration):
1. Alter all 4 columns from `TEXT` to `UUID` using `ALTER COLUMN ... TYPE uuid USING ...::uuid`
2. Add FK references to `public.users(id)` with `ON DELETE SET NULL`
3. Handle any non-UUID values (the cleanup function already NULLs them on user deletion, so existing data should be clean UUIDs or NULL)

### Fix (Frontend):
4. In `CaseGenerator.tsx`, add `created_by: await getCurrentUserIdAsync()` to the insert payload

---

## Finding 4: Email Send Log — No Cleanup (P22-MAINT-01)

**Severity: LOW** — `email_send_log` and `hr_email_send_log` have no retention policy. They will grow unbounded. The system already has a pattern for log cleanup (auto-reply/auto-pay logs are purged after 30 days via the hourly snapshot cron).

### Fix (Migration):
Add a daily cron job to purge `email_send_log` and `hr_email_send_log` entries older than 90 days (longer retention than automation logs since email history is useful for debugging).

```sql
SELECT cron.schedule(
  'cleanup-old-email-logs',
  '30 2 * * *',
  $$DELETE FROM email_send_log WHERE created_at < now() - interval '90 days';
    DELETE FROM hr_email_send_log WHERE created_at < now() - interval '90 days';$$
);
```

---

## Summary Table

| # | ID | Severity | Action | Target |
|---|------|----------|--------|--------|
| 1 | Circuit Breaker | OK | No action — fully wired | `auto-price-engine/index.ts` |
| 2 | Effectiveness Snapshots | OK | No action — cron exists | `generate_pricing_effectiveness_snapshot` |
| 3 | P22-DATA-01 | MEDIUM | Convert 4 TEXT columns to UUID with FK + set created_by on insert | `bank_cases` table, `CaseGenerator.tsx` |
| 4 | P22-MAINT-01 | LOW | Add 90-day cleanup cron for email logs | `email_send_log`, `hr_email_send_log` |

**Total: 2 subsystems verified clean, 4 columns need type fix + FK, 1 missing field assignment, 1 cleanup cron to add**

### Technical Notes

**Column type migration safety:** The `ALTER COLUMN TYPE uuid USING` cast will fail if any row contains a non-UUID string. The cleanup functions already NULL out these fields when users are deleted, and `getCurrentUserIdAsync()` always returns a UUID. A pre-check query confirms no non-UUID/non-NULL values exist. If any do, they'll be NULLed in the same migration before the type change.

**Email log retention:** 90 days balances debugging utility with storage growth. At typical volumes (tens of emails/day), this is ~2,700 rows max — negligible, but the cron prevents unbounded growth if volume increases.

