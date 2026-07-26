## My view

All four are legitimate and consistent with the doctrine we've been building — "every write earns a receipt." W0 is the highest-value one because it certifies things we've already claimed shipped; W1–W3 close the last three unverified writes (attendance push, inputs push, device roster). None require new UI journeys or HR ritual — they add read-back after existing writes and surface only mismatches. Recommend implementing all four in the given order.

Below is what changes, why, and what you'll see afterwards.

---

## W0 · Certify Wave 2 (F5, F2, F9, F10)

**Why:** F-items shipped, but their verifying halves live in code that no one is watching. Silent regression here is the exact "false-green" class we've been eliminating.

**What we'll do**
- **F5 (device clock sync):** confirm the `SET TIME` command is actually enqueued daily for both device serials, and that measured drift lands in `hr_biometric_devices.clock_drift_seconds`. If missing, add the enqueue + drift-record step and a "last handshake" field to the Pulse tile.
- **F2 (watchdog auto-resolve):** read the evaluator. If a stale session has exactly one candidate suppressed OUT punch within the allowed window, auto-close it with `auto_resolved_from_suppressed = true` and log to the intervention table. Only ambiguous cases stay on the Watchdog card.
- **F10 (absence window test):** wire `window_test.ts` into an executable check that runs at deploy and can be re-triggered from System Pulse; store `last_pass_at` and surface a red tile on failure.
- **F9 (ghost-email auto-remediation):** on ghost detection, automatically invoke the RazorpayX edit-by-email recovery path already documented; only card in Data Health if that recovery itself fails.

**After it lands:** every green tile on System Pulse is backed by a stored receipt, not a code path we hope still runs. HR sees nothing new unless something actually breaks.

**Frontend touch:** small — add "last verified" timestamps to four Pulse tiles.
**Backend touch:** small — one migration for receipt columns; edits inside four existing functions.
**Effort:** ~half a day. **Priority: 0.**

---

## W1 · Attendance mirror round-trip

**Why:** Today we push monthly LOP/present-days to RazorpayX and trust the proxy's 200 OK. RazorpayX offers `attendance:attendance-fetch` (62-day cap) and it's already reachable in `razorpay-payroll-proxy` — we just never read it back. A silently mangled attendance month currently surfaces only when someone questions a payslip.

**What we'll do**
- Immediately after `push_attendance_apply_one` / `push_attendance_apply_bulk` succeeds, the proxy calls `attendance-fetch` for the same YYYY-MM.
- Field-compares per employee: `lop_days`, `present_days`, `paid_days` (source = our `hr_lop_days` view).
- Writes onto the push record (`hr_razorpay_pushback_log` + `hr_razorpay_payroll_runs`): `readback_verified_at`, `readback_diff` (JSON of any mismatches).
- On mismatch: opens a `hr_drift_alerts` row per employee-day with `kind = 'attendance_readback'`, auto-status = `open`, so it flows into the existing unexplained-drift tile.
- No new cron; verification is the tail of the push action.

**After it lands:** the payroll input chain — v4 engine → `hr_lop_days` → push → fetch-back — is provable end-to-end. Cockpit's "attendance pushed" step turns green only after read-back matches. If a bulk push silently drops one employee's LOP, HR sees a named drift alert within seconds.

**Frontend touch:** none new — mismatches use the existing drift alert surface.
**Backend touch:** proxy addition + migration for two receipt columns + one drift kind.
**Effort:** small. **Priority: 1.**

---

## W2 · Inputs mirror round-trip

**Why:** Additions (bonuses, reimbursements) and deductions push through `pushWithVerification`, but nothing confirms the row actually landed inside that payroll month. `payroll:view-payroll` returns an additions block and deduction total we don't read post-push. A dropped bonus is discovered by the employee.

**What we'll do**
- After each additions/deductions push, the proxy pulls `view-payroll` for that employee+month.
- Matches each staged item by (name, amount) for additions and a within-tolerance check for the deduction total.
- Stamps `verified_at` and `verified_diff` onto `hr_payroll_input_additions` / `hr_payroll_input_deductions` (they already have `pushed_at` / `push_response`).
- Mismatch → drift alert `kind = 'inputs_readback'` naming employee + item.
- Cockpit "Inputs staged" step self-completes on verified-count === pushed-count, not on push-count.

**After it lands:** staging tables become a proven ledger. The cockpit no longer trusts push receipts — it trusts read-back receipts. Every bonus either provably inside the month or loudly flagged before payroll runs.

**Frontend touch:** cockpit signal tightens; staging pages show a small "verified in Razorpay" tick.
**Backend touch:** proxy addition + two receipt columns per staging table + one drift kind.
**Effort:** small. **Priority: 2.**

---

## W3 · Device-user mirror round-trip

**Why:** Identity parity is doctrine section 2, but the eSSL leg is assumed. The 48h sync refreshes device data without reconciling it against employees or `hr_biometric_device_users`. Ghost enrollments (the 17-user incident) accumulated silently before there was any auto-catch.

**What we'll do (extend existing 48h `hr-essl-sync-devices`, no new cron)**
- After refresh, three-way compare per device: device roster ↔ `hr_biometric_device_users` ↔ active `hr_employees`.
- Classify each discrepancy: `ghost_on_device`, `missing_on_device`, `pin_mismatch`, `dismissed_still_enrolled`.
- Auto-queue safe fixes through the existing command channel:
  - `dismissed_still_enrolled` → enqueue delete on all devices.
  - `missing_on_device` for active employees with a valid badge → re-push enrollment.
- Surface only unsafe cases (PIN collisions, name mismatch) as `hr_drift_alerts` for HR review.
- New Pulse tile: "Device roster parity — last reconciled, N discrepancies (M auto-fixed)."

**After it lands:** all three systems (v4 attendance, RazorpayX, eSSL) carry the same self-verifying property. Tri-system parity becomes machine-enforced. Ghost users can no longer accumulate — they're deleted or flagged within 48h of appearing.

**Frontend touch:** one new Pulse tile; existing Biometric Devices page unchanged.
**Backend touch:** additions to `hr-essl-sync-devices`; one reconciliation-log table; drift kind.
**Effort:** small-medium. **Priority: 3.**

---

## Sequencing & user-visible situation after Wave 3

1. W0 first — certifies the ground we're standing on.
2. W1 next — closes the highest-consequence unverified write (payroll input).
3. W2 — closes the second (inputs).
4. W3 — closes the last one (identity).

**Net situation:** every write into RazorpayX and every write into the biometric fleet is followed by a read-back the same code path can prove. System Pulse becomes a receipt board. HR sees zero new work in the happy path and only named, actionable mismatches when something is actually wrong. The cockpit's green ticks stop meaning "we tried" and start meaning "we verified."

I'll ship all four in one build pass, log to `docs/STATE_LOG.md`, and note the certifications in `docs/hrms/`.
