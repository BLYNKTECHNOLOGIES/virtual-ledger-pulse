# F1 · F2 · F3 — Implementation notes

## F1 · Universal push verification (finished on the client)
- `pushWithVerification` remains the single entry point for identity / bank /
  employment / salary / statutory / advance-salary / one-time-payment writes.
- `razorpayVerify.diffFields` now grants a **±₹1 tolerance** on `annual_ctc`
  so RazorpayX's paise-level rounding cannot flip a good push to "failed".
- The +2s auto-reverify (retryDelayMs) is already active for all kinds —
  documented here so it is not re-implemented.
- All existing callers (Onboarding, Profile edits, Revise Salary, Loans →
  Advance Salary, One-Time Payouts) route through `pushToRazorpay` /
  `pushOneTimePayoutToRazorpay`, which internally call `verifyAndFinalize`.
  There is no un-verified push path left in the app.

## F2 · Watchdog auto-resolve (SQL)
`hr_watchdog_open_sessions()` now returns four counters
(`opened, refreshed, closed, auto_resolved`) and performs an extra pass:

For each stale open session it looks for the **latest employee punch** that
is `in_time + 2 min < punch_time ≤ in_time + 14h` and not already the IN of a
different session. When found:

1. The session is closed with that punch (`out_punch_id` set, `minutes`
   computed, `flags.auto_paired_by_watchdog = true`).
2. The corresponding stale-session row is marked
   `status = 'auto_resolved_paired_out'` with an audit note describing how
   long the session had been open.

Only genuinely ambiguous sessions (no plausible OUT within 14h) remain in the
watchdog page for HR to triage.

## F3 · Cockpit auto-completion (SQL)
`hr_cockpit_month_state(_month)` now folds deterministic completion into the
returned `ack_status`:

- If the step's `live_status = 'complete'` **and** the step is one of
  `{1,2,3,4,6,7,8}` **and** HR has not explicitly acknowledged a different
  state, the row is returned with `ack_status = 'done'`, `ack_at = now()`,
  and `auto = true` (so the UI's `StepBadge` renders "Auto ✓").
- Steps 5 (RazorpayX dashboard run) and 9 (close month) still require
  explicit HR acknowledgement — the API cannot confirm them.
- HR can still open a step and record notes; explicit acknowledgements in
  `hr_payroll_cockpit_state` continue to win over the auto default.

Net effect: the monthly cockpit shows genuine blockers only. Deterministic
progress is credited automatically as live signals turn green.
