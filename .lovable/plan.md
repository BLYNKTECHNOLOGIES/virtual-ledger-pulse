# V5 · V7 · V8 · V9 — analysis and plan

## My honest read on each

**V5 · Nightly synthetic self-test — Worth it. Later, not now.**
Real value: catches attendance-engine regressions before a real punch hits. But we already have the V1 canonical view + guard script (structural) and Watchdog (runtime fairness). The failure mode V5 catches — a code change silently breaking debounce/alternation/session/LOP for messy input — is real but rare, and the cost is a full synthetic-employee scaffold (dedicated namespace, seed generator, teardown, cron, isolation guards on every real surface). Legitimate but priority 5 is right. Ship a **thin first slice** now (canonical fixture + assertion RPC, invoked by an already-existing cron), grow into full synthetic namespace when it's earned attention.

**V7 · Retention purge — Legitimate and overdue. Ship in full.**
Small effort, real compliance value, owner-approved in the v4 design PDF, and today's answer to an auditor is genuinely "we meant to." Raw punches + suppressed rows accumulating forever is not neutral — it's growing liability. This is the clearest win of the four.

**V8 · Alert economy governance — Legitimate. Ship in full.**
This is the "F7 self-destruct" risk: a bell that rings daily about the same thing gets muted, and then it stops being a bell. `hr_drift_alerts` already has `first_seen_at`/`last_seen_at`/`auto_status` — the plumbing is half there. Add a `dedup_key`, a proper severity tier, an auto-close pass when the underlying condition clears, and a noise-ratio tile on Pulse. Small, high leverage.

**V9 · New-joiner first-payroll receipt — Legitimate. Ship a first slice.**
The Uday/Vicky deposit-window class is exactly the failure this prevents. The chain is real: mapping → salary push+verify → deposit schedule → training swap → shift ripening. Each already exists in isolation. Building the aggregator (`hr_new_joiner_readiness` + daily re-check) is small; the only reason it's not P1 is that new joiners are infrequent and each existing link has its own verification. Ship the aggregator + one card on the profile of the joiner's HR admin.

## What changes after implementation — plain language

**Frontend**
- **Pulse** gains three new tiles: *Engine self-test* (V5), *Retention purge* (V7), *Alert noise ratio* (V8). All read-only status pills.
- **Drift alerts list** shows a "recurring since" pill instead of one row per day (V8). Auto-closed alerts get a distinct muted style.
- **New-joiner readiness card** appears on the joiner's profile page for HR admins only, showing 5 chain items green/red (V9). Employees see nothing new.
- No other pages, no employee-facing changes, no layout shifts.

**Backend**
- One new table `hr_new_joiner_readiness` (V9), one new table `hr_attendance_self_test_runs` (V5), one new table `hr_data_retention_settings` (V7).
- Two new cron jobs: nightly self-test (V5), monthly retention purge (V7). One extended cron: existing drift scanner gains dedup + auto-close pass (V8).
- One new column on `hr_drift_alerts`: `dedup_key` (V8). Unique partial index on `(dedup_key)` where `resolved_at IS NULL` — this is what actually stops the daily duplicates.

**Operational reality**
- HR notifications drop noticeably (V8) — same signal, fewer messages.
- Storage growth on `hr_attendance_punches` / `hr_attendance_quarantine` bounded to the retention window (V7). Default: 24 months; owner can tune.
- Every morning has a dated line: "self-test pass 03:10, retention purge on the 1st, drift noise ratio 12%" (V5+V7+V8 together = the Pulse doctrine finally being self-attesting).
- New joiners get a receipt no human has to remember to check (V9).

## My view

Sequence I'd ship: **V7 → V8 → V9 → V5.** V7 is the compliance overhang and takes the least code. V8 protects every alert we've already built — including the ones from V7 and V9. V9 pays for itself the first time a joiner would have missed their deposit window. V5 is the "engine proves itself" ceremony; genuinely valuable but the least urgent because V1 already made structural regressions loud at build time.

Recommendation: do all four in this plan as one arc — the compounding benefit is real (V7's purge summary becomes a V8 dedup class, V9's readiness card uses V8's severity tiers, V5's pass/fail feeds V8's noise ratio).

## Plan

### Slice A — V7 retention purge
1. Migration: `hr_data_retention_settings` (singleton row: `raw_punch_days`, `suppressed_days`, `quarantine_days`, `enabled`, `updated_by`, timestamps). Default 24/12/6 months.
2. Migration: `hr_purge_expired_attendance_rows()` — deletes rows older than the retention windows, returns a summary row per table, writes an entry to `hr_notification_log`.
3. Cron: monthly on the 1st at 02:00 IST.
4. Frontend: `RetentionSettingsCard` on the HRMS admin settings page (owner-only), and a "Last purge · 01 Aug 02:03 · 4,812 rows" tile on Pulse.
5. Enrollment surface: add a `consent_recorded_at` column on `hr_biometric_device_users` and a checkbox on the enrollment dialog.

### Slice B — V8 alert economy
1. Migration: `hr_drift_alerts.dedup_key text`, `severity` re-typed to enum `('critical','warning','info')`, partial unique index on `dedup_key` where `resolved_at IS NULL`.
2. Backfill `dedup_key` from `(hr_employee_id, field, systems_involved)`.
3. Update `hr-drift-scan`: on scan, upsert by `dedup_key` (bump `last_seen_at`, increment `occurrence_count`) instead of insert; auto-close alerts whose condition cleared.
4. Notification router: `critical` → immediate email + bell; `warning` → digested every 4h; `info` → daily digest line only.
5. Pulse: `AlertNoiseRatioTile` (opened vs auto-closed over 7d).

### Slice C — V9 new-joiner readiness
1. Migration: `hr_new_joiner_readiness (hr_employee_id, joined_at, mapping_ok, salary_pushed_verified, deposit_scheduled, training_swap_applied, shift_proposal_ripe, first_payroll_month, last_checked_at, receipt_stamped_at)`.
2. RPC `hr_new_joiner_check(employee_id)`: runs the 5 checks, upserts the row, writes a drift alert (severity `critical`) naming the broken link if any.
3. Trigger: on `Stage5Finalization` completion → enqueue check.
4. Cron: daily 07:00 IST — re-check every joiner whose `first_payroll_month` hasn't closed yet.
5. Frontend: `NewJoinerReadinessCard` on the employee profile page (HR admin gate only), listing 5 chain items with pass/fail chips and the broken-link explanation.

### Slice D — V5 self-test (thin first slice)
1. Migration: `hr_attendance_self_test_runs (id, ran_at, fixture_version, outcome, failures jsonb, duration_ms)`.
2. RPC `hr_attendance_self_test_run()`: builds an in-memory messy punch sequence (F10's canonical case + the window-semantics case), runs it through the same session/LOP derivation SQL as production, asserts expected debounce/alternation/session/LOP outputs, records the run. **No synthetic employee, no webhook write** — pure SQL fixture, so no isolation guards needed for slice 1.
3. Cron: nightly 03:10 IST.
4. Pulse: `EngineSelfTestTile` ("Last pass 03:10 · 42/42").
5. Later slice (deferred): full synthetic namespace + webhook path + optional sandbox push+verify.

### Verification
- V7: run the purge RPC once with `dry_run=true`; confirm row-count summary; then real run on rows > 5 years old only.
- V8: seed two identical drift conditions, confirm one row not two; clear the condition, confirm auto-close.
- V9: run `hr_new_joiner_check` on the most recent joiner; confirm 5 chips; break one link deliberately, confirm the critical alert.
- V5: run the RPC once by hand; confirm 42/42 pass and the Pulse tile updates.

## Technical notes

- All new tables get `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated`, `GRANT ALL ... TO service_role`, RLS enabled, HR-admin-only policies via `has_role`. No `anon` grants.
- All new cron jobs go through `supabase--insert` (not migration) since they contain the anon-key HTTP call.
- V8 severity enum: keep existing severity values by aliasing before altering the type to avoid a rewrite storm.
- V5 slice 1 avoids the "synthetic employee excluded from every surface" problem by never inserting a row — it's a pure derivation test against a fixture. This is why it's small; the full V5 vision (real webhook path) becomes a follow-up when the appetite for it is proven.
- V7 purge RPC returns `TABLE(source text, rows_deleted bigint)` so the Pulse tile can render the breakdown.
- HR touch: V7 zero, V8 negative (fewer alerts), V9 only-if-broken card, V5 zero. Matches the recommendation's stated posture.

Effort: V7 small · V8 small · V9 small-medium · V5 slice-1 small. Full arc ~1 focused build session.

Ready to build on approval.
