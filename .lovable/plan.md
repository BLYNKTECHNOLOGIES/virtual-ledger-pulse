# Off-day / holiday working and the "unpaid 0.5" — what the data actually says

All figures below are live reads from the database for August 2026 (checked 04 Sep 2026, ~04:10 IST). Your instinct was right on two of three points, and one of the numbers you saw is a genuine reporting bug I introduced yesterday.

## 1. Satyam's "Unpaid 0.5" is correct as a fact, but probably wrong as a decision

- Satyam (badge 55) has one approved leave in August: 18 Aug, half day, reason "personal work", `total_days 0.5`, `unpaid_days 0.5`.
- Its consumption row is `source = 'unpaid'`, so no leave type is attached — the breakdown therefore prints it as "Unpaid leave (LOP), 0.5".
- His August LOP of 1.0 day = 0.5 (half-day attendance) + 0.5 (this unpaid leave). ₹625 on a ₹15,000 base.
- **The problem:** he currently holds Casual Leave allocated 1.0, used 0.0, available 1.0. A paid balance existed, yet the cascade booked the day as unpaid. Either the CL was allocated after the approval, or the approval path skipped the cascade. This needs to be traced request-by-request before the August payroll is closed, because the same pattern may have docked others.

## 2. Off-day / holiday working — the credits are mostly right, the new report is wrong

Comp-off credits are granted by a trigger on `hr_attendance_daily`: status in (present / late / half_day) on a weekly-off or holiday inserts one credit day. Checked against your reading of the calendar:

| Person | You said | Credits in DB |
|---|---|---|
| Meenu Raja (52) | 2 off days worked | 2 (23 Aug, 30 Aug) |
| Naman Saxena (48) | 2 | 2 (09 Aug, 30 Aug) |
| Monti Raja (50) | 3 | 5 rows — 3 Sunday credits + a `holiday` credit and a duplicate `manual` "Rakhi holiday comp" credit, both on 28 Aug |

So the engine agrees with you; the extra rows come from a manual Rakhi top-up that overlaps the automatic holiday credit.

The **"Worked on weekly off / holiday"** figure in the new LOP breakdown does not agree with any of this: it counts a day as worked whenever a raw punch or session row exists, with no status check. That is why Naman shows 6 worked-off days against 2 credits, and Sushil shows 0 worked-off days against a credit granted from a manually marked present day with no punches. This column is a reporting bug in `hr_leave_month_breakdown`, not a payroll bug — no rupee value depends on it.

## 3. The real integrity finding: 15 August was never processed by the attendance engine

August punch-vs-session counts by date show one date completely missing:

```text
15 Aug (Independence Day):  18 punches, 12 employees, 0 sessions, 0 daily rows
28 Aug (Rakhi):             19 punches,  8 employees, 5 sessions, 6 daily rows
```

Twelve people punched in on Independence Day and the v4 engine produced no session and no daily row for any of them. Because the comp-off trigger fires on the daily row, none of those twelve received a holiday comp-off credit. 28 Aug is partially processed (8 punched, 6 got daily rows) — the same class of gap, smaller. Several individual off-days show the same shape (e.g. badge 48 on 15 Aug: 3 punches, no session; badge 47 on 09/15/23/28 Aug: 1-2 punches each, no session).

This is the actual loss of entitlement you sensed, and it is upstream of everything in the payroll cockpit.

## What I propose to do

1. **Diagnose the engine gap first (no writes).** Determine why 15 Aug produced zero sessions — whether the session builder skips holiday/weekly-off dates, or whether those days were simply never re-run after late punch ingestion (some 15 Aug punches were ingested on 02 Sep). Report the exact cause before changing anything.
2. **Reprocess the affected dates** once the cause is known, so daily rows exist for every date with punches; the existing comp-off trigger then grants the missing credits by itself. Any credits it creates are listed for your approval, not silently applied.
3. **Fix the worked-off column** in `hr_leave_month_breakdown` so it counts the same thing the credit engine counts: days with a `present / late / half_day` daily status falling on that employee's weekly off or an active holiday, plus a separate small count of "punched but not processed" days so this class of gap is visible instead of hidden.
4. **Surface comp-off in the LOP step** — per employee: credits earned this month with dates and type (auto Sunday / auto holiday / manual), duplicates flagged, and the pool arithmetic already shown.
5. **Audit the unpaid cascade** — list every August leave request booked as `unpaid` where the employee held a paid balance on the approval date, with the rupee impact, for your decision on re-booking.

Nothing in LOP arithmetic, staging, pushing or proration changes.

## Questions before I start

1. **Duplicate 28 Aug credits** (auto `holiday` + manual "Rakhi holiday comp" for Sabeel, Arjun, Ritesh, Monti, Subham): was the manual grant meant to be the only credit, or is a Rakhi day genuinely worth two? I would keep one per day per person unless you say otherwise.
2. **Comp-off expiry.** Auto credits currently expire at month end and `hr_compoff_close_month` zeroes the pool when the month closes. If the 15 Aug credits are granted retroactively, should they stay usable in September, or be settled in the August payroll?
3. **Satyam's 18 Aug half day** — re-book it against his available Casual Leave (removing 0.5 LOP, ₹312), or leave it unpaid because that is what was approved?
