# Project architecture decisions

- Tables fit; client tables stack labelled cells via client-mobile.css on phones. Narrow settlements stack; only wide grids set minimums.
- Client selection actions render in a body portal, outside animated page ancestors, so fixed RA assignment controls stay viewport-anchored on phones and desktop.
- Settlement links use sales_view + Sales orderId; fetch missing linked orders to reach older sales.
- Sales details read PAN only from the explicit client_id with client-view access and a user-scoped cache; never match names or nicknames, because PAN must not cross client identities.

- Read subdirectory AGENTS.md before edits (ATS, workforce, Terminal, quiz, edge functions).

- BrandLogo/brandLogos use the surface theme for contrast; ERP/HRMS use ThemeContext, Terminal its own.

- F&F stages inputs only; cockpit Inputs Push owns RazorpayX writes/read-back, separating review from execution.
- All login removals share hr_erp_access_revocations + completeErpRevocation (ERP/Auth/Terminal read-back/retries); preserve HR/ledger tombstones. LWD/biometrics are independent of F&F; RazorpayX dismissal needs paid F&F and final salary for the later LWD/F&F month (no payout API).
- hr_lop_days_window uses manual_status first, else corrected punch outcomes; approved corrections never imply full days, because half days/absence remain possible.
- Watchdog resolutions (manual or automatic) are refused on period-locked days, because a locked period never recomputes and a 'resolved' entry would hide an unapplied result.
- The comp-off payout step rewrites the month's settlement and credit marks on every run, even when the result is zero, because stale rows otherwise contradict the staged lines.
- The verification pack flags watchdog days closed automatically (no HR resolver) as needs-review, because an auto-paired punch-out may be a break punch.
- A day inside approved leave keeps the status the device or HR gives it, and leave is refunded only for the worked part (hr_reconcile_worked_leave_days, re-evaluated on every run), because device punches and HR day marks are the attendance source of truth.
- Leave accrual (run_leave_accrual) skips anyone whose last working day is before the accrual month's end, because a mid-month leaver earns no leave for the leaving month.
- hr_attendance_daily is attendance truth (device then HR override); hr_attendance is a trigger-kept mirror whose HR edits route into the calendar, keeping payroll/screens consistent.
- Calendar/HR day LOP uses hr_lop_days_window, not status math, so paid half-days agree; summaries use hr_attendance_month_summary (self-only for non-HR).
- RazorpayX additions use exact hr_razorpay_component_catalog names, mirroring Settings → Salary Component Library; proxy maps or rejects, custom wording goes in remarks, because non-library names fail.
- A mid-month CTC revision is held from RazorpayX until that month's cockpit Step 7 (payroll run complete) is done, then pushed automatically, because RazorpayX must pay the old CTC for the month being processed.
- Reports use hr_payslips_v; employer cost = gross + employer contributions; leave is day totals; availability is evidence-backed attendance; owner exclusions cover metrics, drill-downs and exports.
- Salary-register importer sums two headers for one figure only if they resolve to different columns (aliases can double a deduction).
- Tests use `bun run test` and import "vitest", never bun:test, for one unified runner.

- Leave days: total_days, apply check, approval recompute and consumption all use hr_leave_working_days (offs/holidays excluded), never fn_calculate_leave_days, so every count matches.
- Paid leave (CL/CO/SL) is applied/approved only within balance credited by the end of its last day's month minus pending (hr_leave_available, hr_leave_take_from); CO only from same-month credits; never spills into other types; LOP stamps Absent — unearned or encashed credit must not pay leave.
- Approved leave: employee cancels only before day 1 (IST); HR not in locked periods; cancel/reject refunds net of worked-day restores, drops worked-day rows, unstamps evidence-free days — a withdrawn leave must not stay paid or refund twice.
- User Management rights live in public.um_* SQL functions (um_my_access feeds the screen); every UI gate reads them, because screen and server must agree.
- Auth owns sign-in times/logs; ERP-shell heartbeat is self-only for consistent presence. Legacy role_functions are immutable with retained role UUIDs after deletion, preserving history without blocking role removal.
- Binance account access comes only from public.binance_accounts_for_user (screen + edge functions), so they cannot drift.
- Merchant schedules use the existing globally serialized ad-rest path with schedule ownership/account markers and claim-before-execution occurrences; manual pricing uses an atomic pre-acknowledgement cooldown, because overlapping external actions cannot be safely replayed.

- Designation authority is positions: triggers sync title/grade/department to employed people, open onboarding, ERP logins and RACI; leavers preserve exit history. hierarchy_level is company grade, reports_to_position_id is JD structure, managers are separate. Edit departments/designations only in HRMS Organization; RazorpayX imports never create them, keeping titles consistent.
- Joining previews and dispatch share `_shared/joiningBatch.ts` through an HRMS re-export, preventing browser/server scheduling drift.
- The sample-prejoining link is browser-only; joining choices reuse the shared calendar, and date changes invalidate signed offer/confirmation, keeping sample evidence out of real records.
- Optional real pre-joining uses the existing invite and onboarding record; versioned package evidence stays staged until explicit HR review, and activation requires HR-confirmed arrival. Shared rules govern browser/server validation; E2 uses canonical letterhead and paginated candidate disclosures, avoiding duplicate portals or implied electronic signatures.

- Terminal-sale approval, Small-sales approval and New order write the sale through create_sales_order_with_postings (one transaction, caller's rights, rows built by the screen; bank/settlement steps before the wallet debit), never as separate browser inserts, because a failed later step left half-approved orders that most approvers cannot delete.
- A sale's client is the client picked on screen (Terminal: the userNo-locked client) or the only active client with exactly that name; namesakes block the save and phone/state/PAN updates go to that id only, because name matches put orders and contact details on the wrong person.
- Non-USDT cost pools change only in the database: a purchase adds net quantity × the USDT rate fetched before the save (p_market_rate_usdt) in its create function, and wallet_tx_cost_pool_trigger moves cost with every wallet movement (out at unit cost, transfers carry it, purchase edits/deletes at the purchase's own rate without re-adding the cost of coins already sold, a product change at the new coin's rate the edit screen records first, cleared when empty); screens never write wallet_asset_positions, because double counts and INR prices made the averages meaningless.
- Price snapshots are inserted with their reference (fetchMarketRate before the save, recordLockedRate after it), because price_snapshots has no UPDATE policy and a later link silently changes nothing.
- Edit sales/purchase order posts to the ledger only for values that really changed (normalised comparison with the saved order; selects ignore Radix's empty value while their lists load), because unchanged saves reversed income and rewrote Terminal totals.
- New order writes nothing until payment is confirmed (no PENDING/USER_PAYING rows), because sales reports count every sales_orders row as a sale.
