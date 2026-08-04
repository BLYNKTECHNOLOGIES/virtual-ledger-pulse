# Fix "Absent" vs "Not Punched" inconsistency

## What the data actually shows (3 August 2026)

| Employee | Punches on 3 Aug | Stored status | Row last written |
|---|---|---|---|
| Aarti Pawaiya (26) | 1 punch: OUT 18:01, marked ineffective (`orphan_out` — an OUT with no matching IN) | `no_data` -> "Not Punched" | 4 Aug 04:51 (engine rebuild) |
| Lavany Pradhan (15) | none at all | `no_data` -> "Not Punched" | 4 Aug 07:02 (engine rebuild) |
| Himanshu Rajak (20) | none at all | `absent` -> "Absent" | 4 Aug 02:00 (absent marker) |
| Jatan Chaidwal (23) | none at all | `absent` -> "Absent" | 4 Aug 02:00 (absent marker) |

So Lavany and Himanshu have **identical** underlying data (zero punches) but different tags. The tag is not driven by any rule about the employee — it is driven by **which job wrote the row last**:

- The nightly absent marker runs at 02:00 and writes `absent` for zero-punch days (after excluding leave/weekly-off/holiday).
- The v4 attendance engine rebuild (`hr_v4_recompute_range`) writes `no_data` whenever it finds no effective punches — and it overwrites the marker's verdict.

Aarti additionally shows that a lone unmatched OUT punch counts as "no effective punch", so she is treated the same as someone with no punches at all.

## What to change

1. **Preserve the absent verdict on rebuild.** `hr_v4_recompute_range` must not downgrade an existing `absent` row to `no_data`. Zero effective punches on a past, unlocked, non-leave/non-holiday/non-weekly-off day resolves to `absent`.
2. **Single source of truth for absence.** Move the leave/holiday/weekly-off/pending-session checks into one SQL helper used by both the nightly marker and the engine, so both always agree.
3. **Reserve "Not Punched" for genuinely undecided days**: today (window still open), future dates, locked periods, and days with an unresolved stale session. Everything else past becomes Absent, On Leave, Weekly Off or Holiday.
4. **Surface suppressed punches.** Where a day has punches that were all discarded (Aarti's `orphan_out`), show an "unmatched punch" marker on the row so HR can regularize instead of seeing a blank day.
5. **Backfill history** for the current attendance period so past days stop showing mixed tags, skipping locked periods.

## Technical notes

- Files/objects touched: `hr_v4_recompute_range`, new `hr_resolve_day_status(employee_id, date)` helper, `supabase/functions/auto-absent-marking/index.ts`, `src/pages/horilla/AttendanceOverviewPage.tsx`.
- Backfill runs as a one-time SQL pass over `hr_attendance_daily`, respecting `hr_v4_is_window_locked`.
- No change to punch ingestion or to LOP calculation logic in this step; LOP already keys off `absent`, so it becomes more accurate once the labels stop flipping.
