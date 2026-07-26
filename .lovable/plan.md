
# My honest view on R6–R9

Short version: **R6, R7, R8 are worth building. R9 should be folded into R6 as one step, not built as a separate ritual.** All four are grounded — every underlying piece (crons, shadow engine, drift ledger, payslip mirror, `hr_payslips_v`, sandbox toggle, email health tile) already exists in the codebase. This work is **orchestration, not new machinery**.

---

## R6 · Monthly Payroll Cockpit — **BUILD (highest leverage)**

**Verdict:** Legitimate and the single most valuable item on the list. Today the month-end sequence lives partly in `RazorpaySyncPage` (the roadmap stations), partly in `PayrollInputsPage`, partly in `ShadowPayrollPage`, partly in cron jobs no one watches, and partly in your head. That is exactly how the "forgotten deposit for a month-2 employee" and "missed training swap" mistakes happen.

**What changes for you (frontend):** one new page `/hrms/payroll/cockpit` with 9 numbered steps. Each step is a card showing: **state** (pending / done / blocked-by / N/A), **who acts** (HR / RazorpayX operator / automatic), **what to do** button, and a timestamp of the last action. Steps gate each other — you cannot mark step 4 done if step 1 is unlocked. A single "Current month: Nov 2026" header at the top; changing month reloads all 9 states.

**What changes underneath (backend):** one new table `hr_payroll_cockpit_state` (month, step_no, status, actor, notes, updated_at) + one RPC `hr_cockpit_month_state(month)` that reads live signals from existing tables (attendance period lock, watchdog rows, LOP staged rows, inputs push log, payslip import count, shadow run id, drift-open count) and returns the 9-step status. **No new crons**, no duplicated logic — it's a read-through view of what already exists, with a thin state table to record human acknowledgements.

**After it ships:** month-end is a ~30 min checklist any trained HR can execute. Nothing silently skipped. Full audit trail per month.

**Effort:** medium. ~1 page, 1 table, 1 RPC, wiring to existing surfaces.

---

## R7 · Payslip unification + PDF honesty — **BUILD (small, high clarity)**

**Verdict:** Legitimate. Right now 13 files read payslip data; some read `hr_payslips`, some `hr_razorpay_payslip_records`, some the new `hr_payslips_v` view. This is exactly the split that caused the "missing payslip" confusion. `hr_razorpay_payslip_records` carries the `reg_*` statutory columns and IS canonical in reality — we should just declare it so.

**What changes for you (frontend):** every payslip surface (PayslipsPage, EmployeeProfile → Payslips tab, PayrollDashboard, StatutoryReportsPanel, RazorpayPayslipsSection, UserProfile) reads from the same view. Where a PDF used to be implied, we render a "View on RazorpayX Dashboard →" deep link with an honest note "RazorpayX API does not expose payslip PDFs." No more phantom download buttons.

**What changes underneath:** `hr_payslips_v` becomes the single read path (already exists). `hr_payslips` is either retired or kept as a legacy write-only staging table with a UI banner "legacy — read from view." Migration touches read paths only; no data movement.

**After it ships:** one source of truth for payslips. The "why does this employee show a payslip here but not there" class of bug ends structurally.

**Effort:** small–medium. Mostly find-and-replace across 6–7 read sites + PDF link component.

---

## R8 · System Pulse ops board — **BUILD (small, high visibility)**

**Verdict:** Legitimate. You have 42 cron jobs, an email dispatcher, device command queues, drift alerts, stale-session watchdog, sandbox auto-revoke — all currently invisible unless something breaks loudly. The `DataHealthPage` already has 2 tiles (Payslip Parity, Email Dispatch Health) — this is just extending that pattern into one comprehensive board.

**What changes for you (frontend):** `/hrms/system-pulse` — a single grid of live tiles, each showing green/amber/red plus last-run timestamp: Cron Heartbeats (per-job last run vs schedule from `cron.job_run_details`), Email Queue Depth, Device Command Ages, Razorpay Freshness (from existing `hr_razorpay_payroll_freshness` view), Drift Alert Open Count, Watchdog Stale Sessions, Sandbox Window Status. One click on any red tile → the relevant management page.

**What changes underneath:** one RPC `hr_system_pulse()` that aggregates the signals in a single call. No new data, no new crons — pure aggregation over `cron.job_run_details`, `hr_email_send_log`, `hr_biometric_device_commands`, `hr_drift_alerts`, `hr_attendance_stale_sessions`, `hr_razorpay_settings`.

**After it ships:** silent failures (like the "email dispatcher wedged at 70/70" or "auto-absent-marking never ran" scenarios Claude flagged) become visible in the first 30 seconds of a workday. Reduces your external-auditor role to a glance.

**Effort:** small–medium.

---

## R9 · Shadow proof-run ritual — **FOLD INTO R6, don't build separately**

**Verdict:** The *goal* is legitimate — the shadow engine needs to actually get exercised each cycle with TDS excluded from scoring. But building it as a "separate ritual" with its own page duplicates the cockpit. The shadow run IS step 7 of R6.

**What we do instead:** inside R6 step 7 ("Shadow compare"), the card has: a "Run shadow for this month" button (one click, uses existing engine), a comparison view with a **TDS-excluded toggle default-on** and the **±₹5 tolerance already in place**, and each drift line linked to the existing bidirectional resolution ledger. Step 7 cannot be marked done while drift lines are unresolved.

**After it ships:** the shadow engine finally gets its 2–3 months of real-world validation, but without a parallel ritual competing for HR's attention.

**Effort:** small (the "ritual" is 3 tweaks to the existing ShadowPayrollPage + linking it as step 7).

---

## Overall situation after all four ship

- **You** stop being the human cron monitor. Month-end runs to a checklist; between months you glance at System Pulse.
- **HR** gets a scripted 30-min procedure with visible state and audit trail. No tribal knowledge required.
- **Codebase** consolidates: one payslip read path, one cockpit for the month, one pulse for the platform, one place shadow drift is reviewed.
- **Risk of regression:** low. R6/R8/R9 are read-through orchestrations over existing data. R7 is a read-path migration — needs careful search-and-replace but no schema break.

**My recommendation: build in this order — R7 first (unblocks R6 step 6 cleanly), then R6 (with R9 folded in as step 7), then R8.** Total effort ~1 medium + 2 small–medium slices. If you approve I'll start with R7.

---

## Technical execution outline (for the record)

- **R7:** declare `hr_razorpay_payslip_records` canonical via `hr_payslips_v`; migrate 6 read sites (`PayslipsPage`, `EmployeeProfilePage`, `PayrollDashboardPage`, `StatutoryReportsPanel`, `RazorpayPayslipsSection`, `UserProfile`); add `<RazorpayPayslipLink recordId=… />` component; retire/legacy-flag `hr_payslips` writes.
- **R6:** new `hr_payroll_cockpit_state` table (month + step_no unique) with GRANTs + RLS to HR roles; RPC `hr_cockpit_month_state(month date)` returning 9 rows with derived status; new `MonthlyPayrollCockpitPage.tsx` under `/hrms/payroll/cockpit`; sidebar entry; each step card wires to the existing surface (period lock, watchdog, LOP push, inputs push, RazorpayX dashboard link, payslip import, shadow run, drift ledger, close-month RPC).
- **R9 (inside R6):** shadow step card sets TDS-excluded scoring by default; blocks close until `hr_drift_alerts` open-count for that month = 0.
- **R8:** RPC `hr_system_pulse()` aggregating cron/email/device/drift/watchdog/sandbox/razorpay-freshness; new `SystemPulsePage.tsx` with tile grid; extend existing `DataHealthPage` tile pattern.
