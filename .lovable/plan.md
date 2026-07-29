# ESSL Clock Offset Correction (+30 min)

## Problem
Both ESSL devices (ZHM2255300863 "IN", QJT3242100429 "OUT") are running at UTC+5 instead of UTC+5:30. Every timestamp they hand us (via ADMS/webhook) is 30 minutes behind reality. Our ingester (`parseESSLTimestamp`) blindly stamps the string with `+05:30`, so every punch, session, daily row, LOP calc, late/early flag, and stale-session detection is shifted 30 min early. Setting the device clock has not held (nightly `SET TIME` push isn't sticking), so we treat the device offset as data, not as an assumed truth.

## Approach
Introduce a **per-device timezone-offset correction** applied at the single ingestion chokepoint, plus a one-time backfill of already-stored punches from the affected devices. Everything downstream (sessions, daily, watchdog, payslip LOP) recomputes from the corrected `hr_attendance_punches` rows — no other math needs to change.

## Changes

### 1. Per-device offset config (schema)
Add to `hr_biometric_devices`:
- `clock_offset_minutes int not null default 0` — minutes to ADD to every raw punch string from this device before storing.
- `clock_offset_reason text` — audit note ("device stuck at UTC+5, +30 correction").
- `clock_offset_updated_at timestamptz`.

Seed both current ESSL devices with `clock_offset_minutes = 30`.

### 2. Ingestion correction (single chokepoint)
`supabase/functions/biometric-webhook/index.ts`:
- Change `parseESSLTimestamp(timeStr)` → `parseESSLTimestamp(timeStr, offsetMinutes)`: still parse as IST, then add `offsetMinutes * 60_000` before returning ISO.
- Change `getPunchDateFromESSLTimestamp` the same way (so the attendance-date bucket uses the corrected time — critical for punches near midnight).
- At the top of each request, look up the device by `serialNumber` once and cache `clock_offset_minutes` (default 0). Thread it into every call site: AttLog parse (line 224/226), operlog parse (1216), single-punch JSON path (1312), and the `lastStamp` echo back to the device (line 119 / 383) so ADMS `?INFO=` uses the corrected clock and doesn't re-download the last 30 min of punches every poll.
- Log the applied offset per batch so the fix is visible in edge logs.

Other ingest callers (`biometric-refresh-scheduler`, any pull path): route through the same helper with the same per-device lookup — no other timestamp sources exist for ESSL punches.

### 3. Backfill existing punches
Migration to shift already-stored rows that came in under the broken clock. Bounded to devices with `clock_offset_minutes > 0` and to punches after the known drift start.
- `hr_attendance_punches`: `punch_time = punch_time + interval '30 minutes'` for rows whose `device_serial` matches an offset device and whose `punch_time >= '2026-07-01'` (safe lower bound — we can widen after checking the earliest drift entry in `hr_biometric_device_info.clock_drift_seconds` history).
- Same shift for `hr_attendance_punches_archive`, `hr_attendance_quarantine`, and `hr_biometric_device_operlog.occurred_at` for the same serials/window.
- Recompute `attendance_date` from the shifted `punch_time` (IST date) in the same migration so midnight-boundary rows land on the right day.
- Write an audit row per shifted table into `hr_employee_id_rekey_log`-style log (or a fresh `hr_attendance_offset_backfill_log`) capturing serial, rows touched, offset applied, window.

### 4. Downstream recompute
After backfill, trigger for each affected `(employee_id, attendance_date)` in the window:
- v4 session rebuild (existing `rebuild_attendance_sessions_for_employee_date` / equivalent used by the Watchdog "Mark full day" flow).
- `hr_attendance_daily` recompute (existing daily rebuild function used post-cutover).
- Re-run late/early classifier and LOP for the window (uses corrected first-in/last-out automatically).
- Invalidate the current payroll cockpit period so LOP tiles refresh; do not auto-push to RazorpayX (owner controls that).

### 5. Watchdog + drift auto-heal
`hr-drift-scan`:
- Continue flagging `|clock_drift_seconds| > 300`, but when a device has a configured `clock_offset_minutes`, subtract that from the raw drift before alerting (so a device that is *intentionally* +30 doesn't spam drift alerts). Raise a distinct alert if drift moves off the expected offset (e.g. device suddenly matches server → offset should be cleared).
- Add a one-click "Clear correction" action on the device page for the day the device clock is actually fixed — clearing it disables the +30 add for future punches only (no retroactive shift).

### 6. Verification (fix-then-verify loop)
Before declaring done:
- `psql` check: pick 5 punches from today per device, confirm stored `punch_time` = raw device stamp + 30 min.
- Recomputed `hr_attendance_daily` for today shows first-in/last-out advanced by 30 min and Late count drops for employees who were being wrongly flagged.
- Edge logs on next ADMS poll show `applied_offset_minutes=30` and no duplicate punch inserts (dedupe key still holds because the shift is uniform).
- Watchdog no longer opens new stale sessions caused by the 30-min gap.

## Technical notes

- **Why offset at ingest, not at read:** every downstream table (sessions, daily, LOP, payslip register) is materialized from `hr_attendance_punches`. Correcting once at write keeps a single source of truth and avoids sprinkling `+ interval '30 minutes'` across dozens of views/RPCs.
- **Idempotency:** the backfill migration writes a marker row (`hr_attendance_offset_backfill_log(device_serial, applied_at, offset_minutes, window_start, window_end)`) and refuses to run again for the same window/serial — safe to re-deploy.
- **Dedupe safety:** unique index is `(employee_id, punch_time, punch_type)`. A uniform +30 shift preserves uniqueness within the affected window; the only collision risk is with any legacy manual punches inserted at the corrected time, which the migration handles with `ON CONFLICT DO NOTHING` + a report row.
- **Not touched:** RazorpayX payroll figures, salary structures, non-ESSL attendance sources (manual regularizations, self-service punches) — those already store true IST.
- **Future-proof:** when the physical device clock is fixed, set `clock_offset_minutes = 0` in one row; no code change needed.

## Out of scope (call out, don't build)
- Re-pushing already-finalized payroll periods to RazorpayX. If any locked period overlaps the backfill window, surface it in the Payroll Cockpit as "recomputed after clock correction — review before next push" and let the owner decide.
