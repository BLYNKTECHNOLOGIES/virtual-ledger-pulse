# Attendance Summary — readable layout + real names

Two problems on this page: names showing as "Unknown", and an insights section that dumps everything at one flat level so nothing is scannable.

## 1. Fix "Unknown" names (root cause confirmed)

The page loads its employee name lookup with an `is_active = true` filter, but attendance rows exist for employees who have since been deactivated. Any such row falls through the lookup and renders as "Unknown".

Verified in the database for August 2026: 37 employees have attendance rows, 34 are active. The 3 missing ones are Vandana Raikwar, Rashi Mandrai and Rishabh Singh — exactly the rows rendering as "Unknown" in the lateness and exception lists.

Fix:
- Load the name lookup from the full employee list (no active filter) so every attendance row resolves to a real person.
- Keep the active roster as the basis for the summary table and headcount, so totals do not change.
- Show a small "inactive" tag next to a former employee's name wherever they appear, so their presence in the list is explained rather than surprising.
- Fall back to the badge ID (never the word "Unknown") if a name is genuinely absent.

## 2. Reorganise the page into a readable hierarchy

Current order is one long unbroken column of cards. New structure, top to bottom:

```text
Header + month picker + search
------------------------------------------------
Period integrity bar (coverage, warning)      compact single line
------------------------------------------------
5 headline KPIs                               unchanged metrics, tighter cards
------------------------------------------------
Tabs:  Overview | People | Patterns | Exceptions
```

- **Overview** — daily attendance-rate vs late-arrivals chart, punctuality distribution, day-mix bar.
- **People** — "Needs attention" and "Chronic vs occasional lateness" merged into ONE ranked table (name, department, days lost, late days / worked, avg late, badge for severity), sorted worst-first, capped with a "show all" toggle. This replaces the wall of 30+ pill chips, which is the single biggest source of clutter.
- **Patterns** — day-of-week pattern and the department comparison table.
- **Exceptions** — the exception register, one grouped block per exception type with counts, collapsed by default beyond the first few names.

## 3. UI quality pass

- Consistent card treatment: section title + one-line "what this means" caption on every block, so a reader knows what they are looking at without guessing.
- KPI cards get a clear value/label/context hierarchy (large number, muted label above, single supporting line below) instead of three similar-weight lines.
- Comma-free tabular numbers aligned right in all tables; percentages to one decimal, minutes rendered as `1h 12m` rather than `72m` once past an hour.
- Chips replaced by tables where the content is a ranked list; chips retained only for status badges.
- All colour via existing semantic tokens (success / warning / destructive / muted), verified in both light and dark themes.
- Charts: shared axis styling, tooltips that name the metric and the date in words, empty-state message when a month has no maintained rows.

## 4. Data-quality flag (display only, no logic change)

The "avg 967 min late" values are night-shift/timestamp artefacts, not real lateness. Any lateness above 4 hours will be shown with a warning marker and excluded from the *average late* headline, while still being counted as a late day and listed under Exceptions as "implausible late minutes — check shift mapping". No stored data is altered.

## Technical notes

- Files touched: `src/components/hrms/attendance/AttendanceInsights.tsx` (restructure + tabs + name fallback), `src/pages/horilla/AttendanceSummaryPage.tsx` (employee query no longer filtered to active for the lookup map; pass an `activeIds` set through).
- No database migration, no RPC change, no edge function change. The summary table at the bottom of the page stays exactly as it is.
- Verification: reload the page for August 2026 via browser automation and confirm zero "Unknown" labels, the three former employees appear tagged as inactive, and the tabbed layout renders in both themes.
