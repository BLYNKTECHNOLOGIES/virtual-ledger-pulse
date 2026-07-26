
# Analysis of V1–V4 and Recommended Plan

## My honest verdict up front

- **V1 — Do it. Priority 1.** Legitimate and cheap. Three surfaces (HR Overview, HR Day Detail, ESS calendar) each derive "status/worked/LOP" from raw tables. That's the same class of drift that caused the payroll-split incidents. One shared read layer is the correct structural fix.
- **V2 — Do it, but scoped. Priority 2.** The risk is real (ESS runs on policies authored in the HR era), but the pragmatic version is *view-based whitelists + a lightweight RLS-drift check*, not a full re-architecture. Full "employee-JWT can't touch raw HR tables" would require reworking many existing HR queries that share the same authenticated role. Do the fence for ESS-consumed tables now; expand later.
- **V3 — Do it. Cheap and calendar-bound.** This is a status audit, not new code. Payroll month is close; we should know which of W0–W8 are actually shipped vs assumed, and finish W1/W2 before the run.
- **V4 — Do it, but last. Priority 4.** Real value (kills the "closed tab lost the push" class of bug), but medium effort and touches every RazorpayX call site. Worth it, but only after V1–V3.

Net: all four are legitimate. None are gold-plating. V1 and V3 are near-mandatory; V2 and V4 are high-value structural upgrades.

---

## V1 — One attendance truth

### What changes
- New SQL view `public.hr_attendance_day_v` (employee_id, date, status, first_in, last_out, worked_minutes, break_minutes, is_late, lop_contribution, engine_version, flags) built from `hr_attendance_daily` + `hr_lop_days` + `hr_stale_session_held` — the same inputs the Day Detail RPC already uses.
- New hook `useAttendanceDay(employeeId, date | dateRange)` — the ONLY sanctioned reader.
- Rewrite three call sites to consume it: `MyAttendanceCalendar.tsx`, `AttendanceOverviewPage.tsx` (list cells), `AttendanceDayDetailPage.tsx` (summary block).
- Build-time guard script `scripts/check-attendance-single-source.sh` — greps `src/**` for direct `.from('hr_attendance_daily')` / `hr_lop_days` outside the sanctioned hook and fails CI.

### After it ships
- **Employee's calendar cell, HR's day row, and payroll's LOP number are literally the same value** — a mismatch is impossible without a schema change.
- **Frontend:** cells may render 1 tick differently (status vocab unified). No workflow change.
- **Backend:** one thin view + one hook. No writes, no migrations to existing tables.
- **HR effort:** zero.

---

## V2 — ESS read fencing (pragmatic version)

### What changes
- New views: `ess_profile_v`, `ess_attendance_day_v` (wrapper over V1), `ess_leave_balance_v`, `ess_payslip_summary_v`, `ess_milestones_v` — each with an explicit column whitelist and `WHERE employee_id = current_hr_employee_id()` (helper resolves auth.uid → hr_employees.id via existing linkage).
- Grants: `SELECT` to `authenticated` on views only; nothing else touched.
- ESS cards migrated to read from these views. HR-only surfaces continue reading raw tables as today.
- Enable the existing `hr-drift-scan` (or extend it) to snapshot RLS on ESS-touched tables weekly and alert on change (this is the W8 monitor).

### After it ships
- **Structural guarantee for ESS cards:** even if a future ESS card forgets a filter, it can only ask for whitelisted columns of the viewer's own row.
- **Frontend:** ESS cards swap their `.from()` targets. No UI changes visible to the employee.
- **Backend:** additive views + grants; no changes to raw table RLS (so HR flows untouched).
- **HR effort:** zero. Effort: small-medium.

### Explicit non-goal
Not rewriting existing HR RLS. That's a separate, larger project. This version fences ESS *reads*; writes stay on today's RLS.

---

## V3 — Wave reconciliation (receipts before frontier)

### What changes (verification pass, not code)
- One document: `docs/attendance/WAVE_STATUS.md` — for each of W0–W8: exists? which file? verified how? last run?
- Grep-level audit of: post-push fetch-backs, `verified_at` stamps, guard suite presence, auto-assign proposals, auto-lock, coverage receipts, RLS snapshots.
- If W1/W2 (payroll round-trip) gaps found → finish them before the payroll month. If not, dated decision recorded.

### After it ships
- **Truthful wave ledger.** No "we assumed it shipped" going into payroll.
- **Frontend:** none.
- **Backend:** possibly small fixes surfaced by the audit; scoped separately.
- **HR effort:** zero.

---

## V4 — Durable outbox for RazorpayX writes

### What changes
- New table `razorpay_outbox` (kind, payload jsonb, hr_employee_id, status, attempt, last_error, next_attempt_at, verified_at, receipt).
- New worker Edge Function `razorpay-outbox-worker`, called on the existing scheduler cadence: pops due rows, calls the existing push helper, runs F1 verification, stamps receipt or reschedules with backoff, opens a drift alert only after exhausted retries.
- `pushWithVerification` becomes an enqueue call by default, returning `{status: 'queued', outboxId}`. Existing sync UIs show "Queued · will verify" and poll the outbox row (or subscribe via realtime).
- Callers that must stay synchronous (rare — interactive dialogs where the operator waits) opt in via a `mode: 'sync'` flag that preserves today's behavior.

### After it ships
- **Transient RazorpayX outages become invisible to HR.** Closed tab or 5xx no longer loses the write.
- **Frontend:** buttons flip from "Pushing…" spinner-block to instant "Queued · verifying" chip; a small "recent pushes" tray shows lifecycle. `RazorpayPushFeedbackProvider` continues to raise the diff dialog only on exhausted-retry / partial-verified outcomes.
- **Backend:** every RazorpayX write now has one lifecycle (queued → pushed → verified → receipted) and one alert path.
- **HR effort:** occasional exhausted-retry alert triage.
- **Risk to manage:** ordering. If two revisions for the same employee are queued back-to-back, worker must serialize per `hr_employee_id + kind`. Plan covers this via a partial unique index on `(hr_employee_id, kind, status='queued')` + FIFO processing per key.

---

## Recommended sequencing

| Order | Item | Effort | HR touch | Blocker? |
|---|---|---|---|---|
| 1 | V1 single attendance truth + CI guard | Small | none | Before more ESS cards |
| 2 | V2 ESS read fencing (views + drift monitor) | Small-medium | none | Pairs with V1 |
| 3 | V3 Wave status audit doc | Verification | none | Before next payroll run |
| 4 | V4 RazorpayX outbox | Medium | rare alerts | After V1–V3 |

## My view

These aren't overkill; they're the natural next step now that employees are consumers. V1 in particular I'd push to do *before* any new ESS card — every additional card without it deepens the divergence surface. V2 is the "do it once so we stop asking the same audit question" move. V3 is basically free insurance for the imminent payroll month. V4 is the only one big enough to defer if we're constrained, but it's also the one that permanently removes a class of human-retry pain.

Ship V1 + V2 + V3 this week; schedule V4 as a standalone slice after.
