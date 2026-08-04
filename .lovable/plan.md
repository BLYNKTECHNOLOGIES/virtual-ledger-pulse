# Absent vs Not Punched — what the two labels mean, and why they disagree

## The logic today

The Attendance Overview reads one row per employee per day from `hr_attendance_daily` and maps the stored `status`:

- `present` / `late` / `half_day` -> Present-type badges
- `absent` -> **Absent**
- `no_data` (and `incomplete`) -> **Not Punched**
- no row at all -> a placeholder row is rendered as **Not Punched**

So both groups in your screenshot have zero punches. The only difference is *which writer touched the row last*:

- **Absent** = the nightly `auto-absent-marking` job (runs ~07:30 IST for the window that just closed) judged the day: no punches, no approved leave, no weekly off, no holiday -> it writes `status = 'absent'` with `flags.auto_absent = true`.
- **Not Punched** = the v4 attendance engine (`hr_v4_recompute_range`) rebuilt that day from raw punches and, finding zero punches, wrote `status = 'no_data'` with shift-metric flags (`expected_start`, `expected_end`, `grace_minutes`).

## Verified evidence (2026-08-03)

| Group | Count | Last write | Flags |
|---|---|---|---|
| `absent` | 10 | 2026-08-04 02:00 UTC (marker run) | `auto_absent: true` |
| `no_data` | 8 | 2026-08-04 03:50 – 07:02 UTC (engine rebuilds) | shift metrics, no `auto_absent` |

None of the 8 `no_data` employees were on approved leave or weekly off, and all are active. Their rows were rewritten *after* the absent marker ran. So this is not a policy difference between the two groups — it is a **last-writer-wins race**: any punch webhook, watchdog run, or manual recompute that rebuilds a zero-punch day silently downgrades a settled `absent` verdict back to `no_data` ("Not Punched").

This matters beyond cosmetics: LOP and payroll treat `absent` and `no_data` differently, so the same real-world day can be paid or unpaid depending on whether a rebuild happened to run after the marker.

## Proposed fix

1. **Make the rebuild absence-preserving.** In `hr_v4_recompute_range`, when a day resolves to zero punches, do not blindly write `no_data`: keep `absent` if the existing row was auto-marked absent (`flags.auto_absent = true`) or manually set absent, and only use `no_data` for days whose window has not yet closed.
2. **Single absence verdict function.** Extract the marker's decision (no punches AND no leave AND no weekly-off AND no holiday AND window closed -> `absent`, else `no_data`) into one SQL function used by both the nightly marker and the rebuild, so both writers always agree.
3. **Backfill.** Re-run the verdict for all days from the v4 cutover to yesterday so historical rows stop showing a mix of Absent / Not Punched for identical situations.
4. **UI clarity.** Keep the two labels but make `no_data` explicitly mean "window still open / not yet judged", and show "Absent" for closed windows. Add a tooltip on each badge stating the reason (auto-marked, awaiting window close, device offline).
5. **Verification.** After deploy: recompute a past date, confirm previously-absent rows stay `absent`; confirm counts for 2026-08-01..08-03 have no zero-punch `no_data` rows on closed windows.

## Technical notes

- Writers involved: `supabase/functions/auto-absent-marking/index.ts`, SQL `hr_v4_recompute_range`, watchdog paths that call recompute.
- Readers affected: `AttendanceOverviewPage.tsx`, `EmployeeProfilePage.tsx`, monthly summary and LOP views that filter on `status = 'absent'`.
- No schema change required; only the status-derivation logic plus a backfill migration.
