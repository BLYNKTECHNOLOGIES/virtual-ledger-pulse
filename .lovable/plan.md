# Align Attendance Summary and Payroll LOP on one source of truth

## What I found (verified against the live database)

The two screens read **two different tables**, and only one of them is biometric-derived.

| Screen | Reads | July 2026 content |
|---|---|---|
| Attendance Summary (`/hrms/attendance/summary`) | `hr_attendance` (legacy per-day status table) | 1031 rows, 39 employees |
| Payroll Inputs -> Auto-LOP | `hr_attendance_punches` + `hr_attendance_sessions` via `hr_lop_days` | 1853 punches / 510 sessions, 32 employees |

Every July row in `hr_attendance` was written on **2026-08-01** in one blanket pass: 1000 `present`, 25 `absent`, 1 `half_day`. Only 5 rows in the whole month have an organic timestamp (21-25 July). So the Summary page is showing the result of that mass update, not eSSL evidence.

Per-employee proof (July):

| Badge | Employee | Summary present | Days with punches | Days with sessions | LOP days |
|---|---|---|---|---|---|
| 10 | Sushil Verma | 27 | 6 | 5 | 11 |
| 20 | Himanshu Rajak | 26 | 14 | 12 | 4 |
| 23 | Jatan Chaidwal | 24 | 10 | 10 | 7 |
| 43 | Abhishek Ranjan Singh | 25 | 14 | 9 | 3 |
| 54 | Vicky Sahare | 27 | 11 | 3 | 0 |

The LOP engine is the one tracking the real device data; the Summary is the one that is wrong. (LOP present-days differ slightly from raw punch days because of the blackout / held-harmless rules that protect days where the whole roster has zero device signal.)

## Recommended fix

Make the Attendance Summary read the same evidence chain the LOP engine reads, and stop treating the mass-written `hr_attendance` rows as truth.

1. **New canonical monthly summary function** `public.hr_attendance_month_summary(employee_ids uuid[], period_month date)` returning, per employee: working days, present days, half days, absent days, LOP days, late minutes, early-leave minutes, OT hours, and a `held_harmless_days` count. It is built on exactly the same CTEs as `hr_lop_days` (punches + sessions + holidays + weekly-off pattern + blackout gate + approved leave / regularization), so the two screens can never drift again.
2. **Repoint `AttendanceSummaryPage.tsx`** at that RPC instead of aggregating `hr_attendance` client-side. Same layout and charts; the numbers become evidence-based.
3. **Add a transparency column** on the summary table: `Held harmless` (days with no roster-wide device signal) plus a per-row tooltip explaining why a day was excluded, so an operator can see why present-days are lower than the old view.
4. **Add a reconciliation banner** when the legacy `hr_attendance` row for a day disagrees with the biometric evidence, linking to the day-detail page. This surfaces the 2026-08-01 blanket write instead of hiding it.
5. **Document the decision** in `docs/attendance/SINGLE_SOURCE.md` and append one line to `docs/STATE_LOG.md`.

No payroll numbers change: LOP output stays exactly as it is today. Only the Summary changes, and it changes to match payroll.

## Alternative (not recommended)

Rebuild `hr_attendance` from punches so the legacy table becomes correct. This rewrites 1031 historical rows and destroys the audit trail of the 2026-08-01 override, and any manual HR correction ever entered there. Cleaner to leave the legacy table read-only and stop reading it for reporting.

## Technical notes

- `hr_lop_days` already handles: Asia/Kolkata date casting, holidays (incl. recurring), per-employee weekly-off patterns with tenant fallback, joining/last-working-day windows, contractor flag, blackout days, and stale-session hold-harmless. The new summary function will reuse that body rather than re-derive it.
- 7 active employees have zero punches in July (32 of 39 have device data); the summary must show these as "no biometric enrollment - HR review", the same wording the LOP dialog uses, not as absent.
- The `hr_attendance` table stays in place for the day-detail/manual-edit flows; only monthly reporting stops depending on it.
