# Attendance freeze during biometric outages

When the biometric readers stop pushing punches, the system currently keeps running: employees get marked absent, half-day emails go out, and calendars fill with wrong data that HR must clean up by hand. This adds an outage-aware "freeze" so nothing is judged or emailed while the readers are down, and everything is rebuilt and sent once they are back.

## How it will behave

- **Automatic pause**: if no reader has pushed data for 2 hours, attendance marking and all attendance emails pause by themselves. If any one reader is silent, everything pauses (with one reader dead, in/out direction is unreliable for everyone).
- **Manual pause/resume button** on the Biometric Devices page: HR can pause and resume at any time, with a reason, and the manual choice overrides the automatic one until cleared.
- **While paused**: no absent/half-day marking, no absent/half-day notices, no late/early-out notices, no HR attendance digests, no watchdog stale-session mail. Nothing is lost — every suppressed item is recorded so it can be produced later.
- **On recovery**: once the devices push again (device buffers flush automatically), the system waits for a short settle window, rebuilds attendance for every date in the outage from the punches that arrived, and then sends the held notices automatically for those dates.
- **Visible state everywhere**: a banner on the HRMS attendance surfaces and employee profile explains that attendance is paused because the readers are offline, so a blank day is not read as absence.
- Days inside an outage that is not yet resolved are shown as "pending device data", never as absent.

## What gets built

1. **Outage state store** — a single attendance-automation state row (`running` / `paused_auto` / `paused_manual`), the paused-since timestamp, reason, who paused, plus an outage log table holding each outage's start, end, covered dates, backfill result and mail-release result.
2. **Gate used by every attendance job** — one shared check called at the top of the absent marker, exception-notice sweep, late/early notices, HR digests and watchdog mail. If paused, the job exits immediately and records why. Cron keeps firing; the gate is what actually stops the work.
3. **Outage detector** — a small scheduled check that compares each device's last push against the 2-hour threshold, opens an outage and pauses automation, and closes the outage when pushes resume.
4. **Recovery worker** — after resume (auto or manual), it recomputes the attendance engine for the outage's date range, re-runs the absent marker for those dates only, then releases the held notices for those dates, in order, idempotently, with a bound on work per run and a lock so two runs cannot overlap.
5. **Controls on the Biometric Devices page** — status card (running / paused, since when, why, which devices are silent, dates awaiting backfill), Pause and Resume buttons with confirmation and reason, plus a "Rebuild & release now" action for the current outage and a history list of past outages.
6. **Banners** — reuse and extend the existing offline banner so it also states that attendance judgement and emails are paused.

## Safeguards

- Backfill never overwrites a manually set status, approved leave, holiday, weekly off or a locked payroll period; locked dates are reported instead of silently skipped.
- Held mail is released once per employee-date; existing send logs prevent duplicates.
- A pause older than a configurable number of days raises a warning to HR rather than staying silent forever.
- Manual resume is always allowed even if devices still look offline (for cases where punches were imported another way).

## Technical details

- New tables: `hr_attendance_automation_state` (single row, service-role write, HR read) and `hr_attendance_outages` (open/closed windows with dates, backfill and release status). Both with grants, RLS and updated-at triggers.
- New shared helper `supabase/functions/_shared/attendance-gate.ts` returning `{ paused, reason, outage_id }`; wired into `auto-absent-marking`, `hr-attendance-exception-notify`, `hr-attendance-watchdog` and any other attendance-mail sender found by a repo-wide sweep.
- New edge function `hr-attendance-outage-monitor` (every 10 minutes via pg_cron) for detection and auto-resume, and `hr-attendance-outage-recover` for the bounded backfill + release, invoked on resume and re-entrant on the next monitor tick until finished.
- Frontend: extend `src/pages/horilla/BiometricDevicesPage.tsx` and `src/components/hrms/BiometricDeviceOfflineBanner.tsx`, plus a new hook for the automation state.
- Verification: simulate an outage by ageing `last_sync_at`, confirm the marker and notice sweeps exit paused, confirm no rows/mails are produced, then restore, confirm outage closes, dates are rebuilt from real punches and held notices are sent exactly once. All timings reported in IST, and the change logged in `docs/STATE_LOG.md`.
