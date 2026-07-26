# Attendance Watchdog Doctrine (v4)

The Watchdog is the ONLY manual door into the v4 attendance engine.

## Surface

- Route: `/hrms/attendance/watchdog` (alias) → `/hrms/attendance/regularization`
- Component: `src/pages/horilla/AttendanceRegularizationPage.tsx`
- Source table: `public.hr_attendance_stale_sessions` (rows with `status='open'`)
- Resolver RPC: `hr_resolve_stale_session(session_id, resolution, out_time, note)`
- Audit table: `hr_attendance_intervention_log`

## Three verbs (and only three)

1. **Set true out-time** — insert a manual out-punch at operator-picked IST time
   and rebuild the day.
2. **Confirm long shift** — accept a genuine long shift; out-time is capped at
   `in_time + watchdog_hours + 2h` and the day is stamped `night_span`.
3. **Void (forgotten punch)** — delete the offending in-punch entirely.

Every resolution writes an `hr_attendance_intervention_log` row with
`reason_code='stale_session_resolution'` and the actor's email/UUID.

## Fairness rule

While a session is `status='open'` on the Watchdog, that day's LOP contribution
is pinned to `0` by `hr_lop_days` regardless of engine status. See
[`LOP_POLICY.md`](./LOP_POLICY.md).

## Legacy regularization requests

The old `hr_attendance_regularization_requests` flow lives BELOW the Watchdog
cards on the same page — retained for history + residual pending items. Every
approve/reject now requires:

- a **reason code** (from the fixed enum in the page)
- a **note** (free-text, mandatory)

and is likewise audited into `hr_attendance_intervention_log`.
