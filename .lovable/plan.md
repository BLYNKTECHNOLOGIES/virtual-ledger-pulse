
# Claim-by-claim verification, then implementation plan

I read the exact code, cron table, and SQL functions referenced by each claim before writing this. Verdicts first, then the plan.

## Verification

### A1 · Silent no-op on non-salary RazorpayX pushes — TRUE
- `rg "verify_push"` in `supabase/functions/razorpay-payroll-proxy/index.ts` returns nothing. The action does not exist.
- `.lovable/plan.md` contains the full, well-formed fix (proxy `verify_push` action, `pushWithVerification` client, `RazorpayPushResultDialog`, provider mount, caller swap). It's the plan we should just execute.

### A2 · Attendance stale-session watchdog does not exist — TRUE
- `pg_proc` search: `hr_resolve_stale_session` / `hr_watchdog_sessions` / any equivalent → not present.
- `cron.job`: only `auto-absent-marking-daily` and `archive-old-attendance-data`. No watchdog job.
- No route, no page, no edge function for "open session ≥ 12h" resolution.
- Live data: **5 open sessions right now, all older than 12h** (out of 290 total). The condition is live in production, not theoretical.
- The July-19 migration confirms the orphan_out guard exists but only prevents the 20h monster session; it never resolves the earlier open IN.

### A3 · Auto-absent function is calendar-day, not window-aware — TRUE (as claim), but narrower than stated
- `supabase/functions/auto-absent-marking/index.ts` uses `istYesterday()` (calendar date) and writes to legacy `hr_attendance` — **not** the v4 `hr_attendance_daily.no_data` output.
- It does honor weekly-off patterns, holidays, and approved leaves.
- Cron: `0 2 * * *` UTC = 07:30 IST daily. Timing is correct relative to the 05:00→05:00 window close.
- Consequence is real: an employee whose day rolls into the 05:00 window will be judged on calendar date, and `hr_attendance_daily.no_data` rows produced by the v4 engine are ignored.

### A4 · LOP has no single source of truth — MOSTLY FALSE, one real fairness bug
- `hr_compute_lop_days` **is** the single source. `compute-shadow-payroll` calls it (line 267) and comments say "single source of truth". No parallel LOP formula exists in `razorpayPushback.ts` or in the proxy — grep returns zero independent LOP math on the push path.
- Formula: `LOP = WD − (present + paid_leave + incomplete_held)`, capped to `[0, WD]`. Unpaid leave is **not** subtracted — so it falls into the shortfall automatically and becomes LOP. Claim "unpaid leave escapes LOP entirely" is factually wrong. The SQL also surfaces `unpaid_leave_days` for reporting.
- The real bug inside A4 is narrower: `incomplete_held = 0 LOP` is fair only if operators have a resolution surface. Without A2, `incomplete` days silently reduce LOP with no path to convert them into either "present" or "absent". Fix belongs inside A2's plan, not a separate LOP overhaul.

### A5 · No per-day drill-down (Phase 7) — TRUE
- Routes present: `attendance/punches`, `attendance/summary`, `attendance/calendar`, `attendance/regularization`, `attendance/period-lock`, `attendance/policy`. No per-day view.
- v4 engine stores per-punch suppression reasons (`orphan_out`, etc.) but nothing renders them.

---

## Implementation plan (sequenced)

The three real defects are A1, A2, A5. A3 gets a small hardening in the same window as A2. A4 collapses into A2.

### Slice 1 — A1: Universal RazorpayX push verification (execute the existing plan file)

Execute `.lovable/plan.md` verbatim. Concrete deliverables:

**Proxy (`supabase/functions/razorpay-payroll-proxy/index.ts`)**
- New action `verify_push({ kind, razorpay_employee_id, expected })` → `{ fields: [{ key, expected, actual, match, reason? }], overall: 'verified' | 'partial' | 'failed' }`.
- Field maps per kind: identity, bank, employment, salary, statutory, dismissal (exact keys in plan.md).
- Normalization: dates → `YYYY-MM-DD`; phone → last-10; IFSC → upper; booleans → strict; numbers → ±₹1 tolerance.
- Extend `read_person_by_id` snapshot with `__statutory` (PF/ESI/PT enrollment) and `__dismissal` (`dismissed`, `date_of_dismissal`).
- Fields RazorpayX doesn't expose (e.g. `annual_ctc` before first payroll run) return `match: null` with an explicit `reason` — never a false success.

**Client (`src/lib/razorpayPushback.ts`)**
- Refactor to `pushWithVerification(kind, employeeId, expected)`: push → wait 800ms → verify_push → re-verify once at +2s if not verified → return `{ ok, overall, diff, error?, razorpayEmployeeId? }`.
- `pushIdentity/Bank/Salary/Employment/Statutory/Dismissal` become thin wrappers.
- Record the diff in `hr_razorpay_pushback_log.response_snapshot`. Open `hr_drift_alerts` only when `overall !== 'verified'`.

**UI**
- `src/components/hrms/RazorpayPushResultDialog.tsx` — two-column diff (confirmed vs not applied) with per-field reason, **Retry push**, **Open in RazorpayX**, **Dismiss** (records ack in drift alert). Happy-path (`verified`) still just toasts — no interruption.
- `src/components/hrms/RazorpayPushFeedbackProvider.tsx` — provider + `useRazorpayPushFeedback()` hook, mounted in `HorillaLayout.tsx`.

**Callers swapped to the hook**
- `ReviseSalaryDialog.tsx`, `SalaryRevisionsPage.tsx` per-row retry, `Stage5Finalization.tsx`, `EmployeeProfilePage.tsx` (bank + identity), `SeparationDialog.tsx`, statutory toggle in `EmployeeProfilePage`.

No schema change. No new secrets.

### Slice 2 — A2 + A4 fairness: Stale-session watchdog with resolution door

**Schema (single migration)**
- New table `public.hr_attendance_stale_sessions` (one row per open session ≥ 12h): `session_id`, `employee_id`, `in_time`, `hours_open`, `status ∈ {open, resolved_set_out_time, resolved_confirm_long_shift, resolved_voided}`, `resolved_by`, `resolved_at`, `resolution_note`, timestamps. Standard GRANT block (`authenticated`, `service_role`) and RLS scoped to HR roles + owning employee (read-only for employee).
- Function `hr_watchdog_open_sessions()` — scans `hr_attendance_sessions where out_time is null and in_time < now() - interval '12 hours'`, upserts rows by `session_id`, closes rows whose session got resolved.
- Function `hr_resolve_stale_session(session_id, resolution, out_time?, note?)` — three arms:
  - `set_out_time` → writes the OUT punch (via existing `hr_attendance_punches` insert path so the v4 rebuild trigger recomputes the day) and records ack.
  - `confirm_long_shift` → forces an OUT punch equal to a policy-capped duration (e.g. shift end + max_overtime) with reason `long_shift_confirmed`.
  - `void_session` → deletes the open IN via the standard suppression path (writes reason `voided_by_hr`); the day rebuilds as `no_data`.

**Cron**
- New job `hr-attendance-watchdog-hourly` (`5 * * * *`) calling an edge function `hr-attendance-watchdog` that just invokes `hr_watchdog_open_sessions()` and logs counts.

**UI**
- New card **"Open sessions needing resolution"** on `AttendanceOverviewPage.tsx` (HR only) — count of `hr_attendance_stale_sessions` where `status = 'open'`.
- New page `src/pages/horilla/AttendanceStaleSessionsPage.tsx` (route `attendance/stale-sessions`) — one row per open session: employee, IN time, hours open, three action buttons wired to `hr_resolve_stale_session`. Confirm dialogs use `AlertDialog`.
- Add a small "Long-open" flag to the affected row in `AttendancePunchesPage.tsx` and `AttendanceCalendarPage.tsx` so the same day is discoverable from either surface.

**LOP fairness (A4 collapse)**
- No formula change. Once the watchdog exists, `incomplete_held = 0 LOP` becomes provably fair because every `incomplete` day either (a) gets resolved to present via `set_out_time` / `confirm_long_shift`, or (b) gets voided → `no_data` → picked up by A3's absent-marker.

### Slice 3 — A3 hardening (small, ships with Slice 2)

Rewrite `supabase/functions/auto-absent-marking/index.ts` to be **v4-window aware**:
- Iterate window date = `istYesterday` (unchanged — the 05:00→05:00 window closes at 05:00 IST, so 07:30 IST cron is safe).
- Source of truth flips from "no row in `hr_attendance`" to "row in `hr_attendance_daily` with `status = 'no_data'`" for the same window date.
- Write the absence into `hr_attendance_daily` (via existing v4 write path) instead of legacy `hr_attendance`.
- Skip lists (holiday, weekly-off, approved leave) unchanged.
- Add a "did-run" audit row to a lightweight log table so we can prove the marker executed on any given day.

### Slice 4 — A5: "Show the working" day drill-down (Phase 7)

**Route + page**
- New route `attendance/day/:employeeId/:date` → `src/pages/horilla/AttendanceDayDetailPage.tsx`.
- Deep-linked from every row in `AttendancePunchesPage`, `AttendanceSummaryPage`, `AttendanceCalendarPage`, `AttendanceStaleSessionsPage`.

**Data**
- New read-only RPC `hr_attendance_day_detail(employee_id, date)` returning:
  - all raw punches for the window (device, IN/OUT, direction inference, `suppressed_reason` if any),
  - derived sessions with arithmetic (`in_time`, `out_time`, `duration_minutes`, `overlap_trimmed`, `capped_at_shift_end`),
  - totals (worked hours, overtime, late, early-leave),
  - flags (`orphan_out`, `long_open`, `outside_shift_window`, `regularization_status`).

**UI**
- Three vertical sections:
  1. **Punches** — timeline with each row's suppression tag and one-line reason.
  2. **Sessions built** — table of IN/OUT/duration with a subtotal.
  3. **Result** — `status`, `total_hours`, `lop_contribution`, and any linked regularization + stale-session actions.
- Mobile-first (matches recent HRMS mobile pass): stacked cards below `md:`, table above.
- No mutations here except a "Request regularization" button that opens the existing dialog with the day pre-filled.

## Sequencing

1. **Slice 1** — highest active harm (silent bank IFSC / dismissal no-ops on payday). Ship first; independent of the others.
2. **Slice 2 + Slice 3 together** — one migration + one edge function + one page. A3's rewrite must land with A2 because both write to `hr_attendance_daily`.
3. **Slice 4** — pure additive. Ship last; benefits from the stale-session data Slice 2 introduces.

No slice needs a secret. Slices 1 and 4 have no schema changes. Slice 2 needs one migration (table + two SQL functions) and one cron entry (via the `insert` tool because the URL/anon-key are project-specific per instructions).

## Corrections to the original claims (worth calling out)

- **A3** is real but narrower: the cron *time* is correct; only the internals are calendar-day and write to the wrong table.
- **A4**'s "two-formula" and "unpaid leave escapes LOP" statements are not supported by the code — `hr_compute_lop_days` is the sole source and unpaid leave folds into the shortfall. The only genuine fairness gap inside A4 is `incomplete_held = 0 LOP` needing a resolution door, which is exactly what Slice 2 delivers.
