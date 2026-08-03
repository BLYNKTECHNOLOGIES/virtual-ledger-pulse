# Forgotten punch-out: how it behaves today, and how to harden it

## Your questions, answered against the live engine

Settings in force: day cutoff 05:00 IST, debounce 15s, watchdog 12h, half-day 4.5h net, OT reference 9h/day.

**1. If someone punches IN, forgets OUT, and punches IN again the next day — is the next day counted?**
Yes. The session builder (`hr_v4_recompute_range`) keeps a "currently open IN". When a new IN arrives while one is open, it normally suppresses it as `redundant_in` — but there is a guard: if the open IN is older than the watchdog window (12h), the stale open is dropped and the next-day IN starts a **fresh session**. So the next day is not swallowed. The previous day stays as an open session → day status `incomplete`.

**2. If he punches OUT the next day — is it a 48-hour shift?**
No. An OUT arriving more than 12h after the open IN is suppressed as `orphan_out`. No monster session is created, no 48h of working minutes. The day stays `incomplete` and waits for HR.

**3. Does it credit extra overtime?**
Not from the open session (open sessions contribute zero minutes). But there is a real exposure once it gets *closed*: OT is computed as `last_out − expected_shift_end` with **no upper cap**, so any pairing that lands a late OUT — for example the watchdog auto-pair, or HR "Set out-time" with a wrong value — can credit many hours of OT in one day. `ot_daily_hours = 9` exists in settings but is never applied.

**4. What does it do to LOP / payroll?**
While the stale row is `status = 'open'`, `hr_lop_days` treats the day as **held harmless** (`incomplete_held_days`) — no LOP. Once HR resolves it, that shield disappears: `void` removes the IN-punch entirely, so unless a regularization exists the day flips to no-evidence and becomes LOP.

## Gaps found (root causes worth fixing)

1. **Watchdog window is inconsistent.** Settings say 12h, but the auto-pair query hardcodes 14h and `hr_resolve_stale_session` falls back to 14h. The engine suppresses an OUT past 12h while the watchdog re-pairs punches up to 14h — the two disagree.
2. **Auto-pair can eat the next day's IN-punch.** The watchdog picks the *latest* unused punch within the window as the OUT. A next-morning IN that has not yet become a session's in-punch qualifies. Result: prior day gets an inflated session and OT, and the next day loses its IN → shows absent. This is the highest-risk defect.
3. **No OT ceiling.** Any repaired/oversized session converts directly to overtime hours in `hr_attendance`.
4. **Resolution has no "regularize as present" outcome.** `void` silently converts a genuine attended day into LOP.
5. **`confirm_long_shift` caps at watchdog + 2h** (i.e. 14h today), which is a payable-hours decision buried in code, not a setting.

## Recommended handling (what I propose to implement)

**A. Single source of truth for the window**
Use `hr_attendance_engine_settings.watchdog_hours` everywhere: engine, watchdog auto-pair, and `hr_resolve_stale_session`. Remove the hardcoded 14h.

**B. Make auto-pair safe**
Only pair a punch that is (a) `punch_type = 'out'`, or (b) an unclassified punch that is **not** the first punch of a later window date. Never consume a punch that starts a new attendance window. If the only candidate is a next-day first punch, leave the session open for HR.

**C. Cap overtime**
Clamp daily OT to `ot_daily_hours`, and set OT to 0 on any session flagged `auto_paired_by_watchdog` or `hr_long_shift_confirmed` — repaired time should be paid as attendance, not overtime, unless HR approves it.

**D. Add a fourth resolution: "Present — shift-standard out"**
Closes the session at the employee's scheduled shift end (never later), marks the day `present` with zero OT and no early-out penalty. This becomes the default recommended action for a genuine forgotten punch-out, instead of `void`.

**E. Make `void` LOP-explicit**
When HR voids, show in the dialog that the day will become unpaid unless a regularization is approved, and offer a one-click "void + raise regularization" path.

**F. Surface the payroll impact on the Stale Sessions page**
Each card shows: window date, current day status, whether the day is currently held harmless from LOP, and what each button will do to LOP and OT before it is clicked.

**G. Configurable long-shift cap**
Move the `watchdog + 2h` cap into engine settings as `long_shift_cap_hours` (default 14).

## Technical notes

- Changes are SQL-side in `hr_watchdog_open_sessions`, `hr_v4_recompute_range`, `hr_v4_shift_metrics` (OT clamp) and `hr_resolve_stale_session` (new `mark_shift_end` resolution + settings-driven caps), plus one settings column.
- UI changes in the Stale Attendance Sessions page for the new action and impact preview.
- After deployment, re-run the watchdog and recompute affected windows, then verify: no session exceeds the watchdog window, no day carries OT above the cap, and no next-day IN was consumed as a previous-day OUT.
