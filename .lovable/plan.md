# Employee Self-Service (ESS) — Profile as the Single Point of Contact

Non-HR staff will not have `/hrms` access, so `/profile` (`src/pages/UserProfile.tsx`) must carry every HR interaction an employee needs: viewing information, raising requests, tracking status, acknowledging policies, and initiating lifecycle events. Today the page already has 11 tabs (Profile, My Tasks, Attendance, Salary & PF, Payslips, Banking, Leaves, Requests, Documents, Alerts, Settings) but coverage is thin, mobile navigation breaks past ~6 tabs, and several employees (like the screenshot's Shubham Singh) hit a dead-end "No Employee Profile Found" because their `users` row isn't linked to an `hr_employees` row.

The build is split into ten phases so nothing important is missed. Each phase ships end-to-end (UI + data + permission gate + mobile layout) before moving on.

## Phase 0 — Foundations (unblocks everything else)

- **Employee resolution fallback.** When `hr_employees` isn't linked, try (in order) `badge_id`, work email, phone, then `razorpay_employee_id`. Surface a soft banner ("Ask HR to link your employee record") instead of a hard empty state, and still allow Profile / Tasks / Settings / Alerts / Documents (personal KYC) / Payslips (by employee email match) to render whatever is available.
- **New tab shell.** Replace the current flat `TabsList` with a mobile-friendly nav: horizontal scroll strip on desktop, a sticky **section dropdown** on mobile (< md). Group tabs into five sections — Me, Time, Leaves, Pay, Requests — plus persistent Alerts/Settings icons in the header row. Unread/actionable counts render as small badges on section labels.
- **Permission map.** Central `useEssPermissions()` hook: read-only vs editable per section, HR-only editors always hidden, `hr_employees.status` (active / notice / separated) gates the Separation tab.
- **Deep-link support.** URL params `?tab=…&sub=…&id=…` land on the right sub-section and highlight the target row (reuse existing `useDeepLinkHighlight`).

## Phase 1 — "Me" (identity, contact, documents, assets)

- **Profile tab (rebuilt).** Sections: Identity (verified name — locked, KYC-immutable rule), Contact (phone / personal email — editable with edit-lock), Address (permanent + current), Emergency contacts (add / edit / delete), Family / dependents (view-only unless HR editable), Statutory IDs (PAN / Aadhaar last-4 / UAN / ESIC — masked, read-only), Bank (existing salary account, read-only).
- **Documents tab (expanded).** Three groups: (a) *My KYC* from onboarding (PAN, Aadhaar, education, previous employment) with re-upload flow that routes to HR review; (b) *Issued by HR* (offer letter, appointment letter, salary revision letters, Form 16, experience/relieving after exit); (c) *Company documents* (HR Policies, employee handbook, code of conduct — with acknowledgement toggle & audit log).
- **Assets tab (new).** Read-only list from `hr_asset_assignments` — device, serial, issued date, condition; "raise return request" CTA.

## Phase 2 — Time (attendance, regularization, overtime, comp-off, shift)

- **Today card.** Live status (in-progress / done / absent / week-off / holiday / on-leave), first-in / last-out, worked hours, LOP risk flag.
- **Punches & sessions.** Last 30 days grouped by day, drill-down to Day Detail (reuse `AttendanceDayDetailPage` in embedded mode).
- **Regularization.** File request (missed punch, wrong shift, WFH), track status, cancel while pending. Uses existing `hr_validate_regularization_proposal`.
- **Monthly summary.** Present/absent/LOP/OT/late marks + downloadable summary.
- **Overtime.** Declare OT (needs manager approval); ledger view.
- **Comp-off.** Ledger (Sunday-work credits already auto-granted), request to redeem.
- **Shift & week-off.** Current shift, upcoming week-off, holiday overlay.

## Phase 3 — Leaves

- Balance dashboard per leave type (retain current logic), Apply / Cancel with clash warnings (reuse `LeaveClashCard`), request history with status, org-wide leave calendar (who's out this week), year-end reset preview.

## Phase 4 — Pay (payslips, salary, tax, reimbursements, loans)

- **Payslips.** Keep existing canonical `hr_payslips_v` list + RazorpayX deep-link (R7 doctrine — no fake PDF).
- **Salary & PF.** Existing CTC breakdown, plus **Compensation history** (revisions, effective dates, reasons — reuse `CompensationHistory`), PF/UAN passbook deep-link, gratuity accrual estimate.
- **Tax.** Regime declaration (Old/New) for the FY, investment proofs upload, projected TDS. Locks after HR freezes.
- **Reimbursements.** Submit expense claim (category, amount, receipt), track approval, RazorpayX push status once reimbursed.
- **Loans & Advances.** View outstanding, EMI schedule, raise Salary Advance request (reuse `NewSalaryAdvanceDialog`).

## Phase 5 — Requests hub

Single unified "My Requests" inbox aggregating: regularization, leave, comp-off, overtime, reimbursement, salary advance, document re-upload, asset return, helpdesk tickets. Filters by status/type; each row deep-links to its source card. Manager approvals surface here too when the user is someone's reporting manager.

## Phase 6 — Announcements, Holidays, Policies

- Announcements timeline (retain `AnnouncementsBanner` on top, full list here).
- Upcoming Holidays + full year calendar.
- HR Policies list with per-policy **Acknowledged** toggle written to `hr_policy_acknowledgements` (audit trail HR can pull).
- Helpdesk ticket creation for anything not covered (routes to HR queue).

## Phase 7 — Growth & Performance

- Skills & tags self-update (reuse `TagsAndSkillsTab`).
- 360 feedback: pending self-reviews, peer reviews assigned to me, history.
- Goals / PMS view if data exists (read-only for the employee).
- Disciplinary actions log (own record, read-only).

## Phase 8 — Separation

Visible only when `status ∈ (active, notice)`:
- Initiate resignation (notice period auto-computed from offer-letter policy), LWD calendar, F&F preview (deposit refund, unpaid leave encashment, dues).
- Exit checklist (asset return, KT handover, clearance sign-offs).
- Post-LWD read-only view of relieving letter, Form 16, F&F statement.

## Phase 9 — Alerts & Settings

- Notification preferences (keep `NotificationSettingsTab`, extend to attendance / payslip / policy channels).
- Password change, session list, biometric badge ID display, linked devices (WebAuthn).
- Language / theme / density.

## Technical notes

- **Files touched:** `src/pages/UserProfile.tsx` (shell + routing only after Phase 0); new sub-components live under `src/components/profile/<section>/…` mirroring the section grouping. Reuse `hrms/` primitives (`SectionHeader`, `EmptyState`, `ResponsiveList`, `ResponsiveDialog`) for consistency with the polished HRMS look.
- **Data layer:** all reads via `@tanstack/react-query` (per Core rule). New mutations for reimbursements, tax declaration, policy acknowledgement, asset return, resignation — each with optimistic invalidations and `AlertDialog` confirmations for destructive/irreversible actions.
- **Permissions:** every write path re-validated by RLS on `hr_*` tables scoped to `employee_id = current_user_employee()`. No client-side trust.
- **Mobile-first:** every new sub-page uses card lists on `< md`, tables on `md+`, matching the earlier HRMS mobile refactor pattern.
- **Rollout order:** Phase 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9. Each phase is independently shippable so the employee experience improves incrementally without waiting for the full arc.

## Out of scope for this arc

- No changes to `/hrms` HR/admin surfaces (already covered).
- No new RazorpayX write paths — reimbursement/advance pushes stay behind the existing Universal Push Verification.
- No payroll math changes — RazorpayX remains primary authority.

Approve to start with Phase 0 (foundations + employee resolution fix visible in the screenshot).
