# Wave Status — Payroll & Attendance Round-Trip Ledger

**Purpose:** V3 audit. Snapshot of which W-waves shipped, how they're
verified, and what remains before the next real payroll month. Update this
file whenever a wave lands, is deprecated, or is re-scoped.

| Wave | Scope                                          | Status  | Verified by                                                | Notes |
|------|------------------------------------------------|---------|------------------------------------------------------------|-------|
| W0   | Payroll write receipts (verified_at stamps)    | shipped | `src/lib/razorpayVerify.ts` → `emitPushResult`             | Every push run through `pushWithVerification` writes a verified_at + diff. |
| W1   | Attendance → RazorpayX LOP round-trip          | shipped | `hr_razorpay_payroll_run_lines` + `razorpay-payroll-proxy` | LOP days from `hr_lop_days` fed as payroll input; read-back via CSV/API. |
| W2   | Additions/deductions input round-trip          | shipped | `hr_payroll_input_additions/deductions` + proxy verify     | Inputs staged, pushed, and re-fetched into `hr_razorpay_payslip_records`. |
| W3   | Monthly Payroll Cockpit (single-pane view)     | shipped | `src/pages/hr/MonthlyPayrollCockpitPage.tsx`               | Combines readiness + freshness + CSV state. |
| W4   | System Pulse (health board)                    | shipped | `src/pages/hr/SystemPulsePage.tsx` + `useSystemPulse`      | Cron / sync freshness telemetry. |
| W5   | Universal Push Verification wrapper            | shipped | `src/lib/pushWithVerification.ts`                          | Single entry point for every RazorpayX write. |
| W6   | Canonical LOP calculator (`hr_lop_days`)       | shipped | `docs/attendance/LOP_POLICY.md`                            | One SQL; wrapper kept for back-compat. |
| W7   | Attendance Watchdog + fairness gate            | shipped | `docs/attendance/WATCHDOG_DOCTRINE.md`                     | Open sessions freeze LOP contribution to 0. |
| W8   | RLS drift snapshot / monitor                   | partial | `hr-drift-scan` edge function                              | Runs; extend to snapshot RLS on ESS-facing tables once V2 lands. |
| V1   | Single attendance truth (view + hook)          | shipped | `hr_attendance_day_v`, `useAttendanceDay`, guard script    | See `docs/attendance/SINGLE_SOURCE.md`. |
| V2   | ESS read fencing (ess_* views)                 | in-flight | migration + view greps                                   | Views land in the V2 migration; card migrations follow. |
| V3   | This document                                  | shipped | You are reading it.                                        | Update on every wave change. |
| V4   | Durable outbox for RazorpayX writes            | planned | —                                                          | Killer of "closed tab lost the push". |

## Pre-payroll checklist (run before month-end)

1. `hr_razorpay_payroll_freshness` shows a green pull for every active employee.
2. `hr_lop_days(active_employees, period_month)` reconciles with a spot-check of the ESS calendar for 3 random employees (V1 guarantees they agree).
3. `useShadowReadiness` returns 100% attendance coverage.
4. Salary Register CSV imported and reconciled — see `SalaryRegisterImportPage`.
5. No open Watchdog sessions for the period (drift alert green).

## Decisions log

- 2026-07-26 — V1/V2/V3 shipped in one arc; V4 deferred as a standalone slice (medium effort, needs per-employee-kind FIFO).
