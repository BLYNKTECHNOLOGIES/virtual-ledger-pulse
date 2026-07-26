# R10–R13 Review

Read before planning: `fix_proxy.py` (not present), `supabase/functions/` (no `apply-scheduled-salary-revisions`; only `hr-promote-scheduled-salary-revisions` exists), `docs/` (no `RAZORPAYX_COMMISSIONING.md` — only PAYROLL_DOCTRINE, RAZORPAY_API_FIELD_AUDIT, REPO_LAYOUT, STATE_LOG, reference/), and existing employee surfaces (`src/pages/UserProfile.tsx`, `EmployeeProfilePage`, `LeaveRequestsPage`). Core memory: ESS lives in the ERP profile view, not `/hrms`.

## My view on each recommendation

### R10 · Employee self-service (phase one) — **DO IT (medium)**
Legitimate and high-leverage. Today an employee has no first-person view of "my punches today / my leave balance / my payslips". Every dispute becomes an HR ticket. Since v4 attendance, leave allocations, and the RazorpayX payslip mirror already exist and mobile primitives are in place, the build is mostly a read-only surface over data we already trust.

- **Where it lives:** inside the ERP `UserProfile.tsx` (per doctrine `/hrms` stays HR-only), as four tabs: Today, Leaves, Payslips, Profile.
- **Backend:** no schema changes. Add three RLS-scoped views/RPCs so an employee can read only their own rows: `ess_my_attendance_today`, `ess_my_leave_summary`, `ess_my_payslips` (thin wrappers over `hr_attendance_daily` / `hr_attendance_sessions`, `hr_leave_allocations` + `hr_leave_requests`, `hr_payslips_v`). Leave-request `INSERT` uses the existing table with a self-scoped policy.
- **Frontend:** four small tab components, no new design system. Payslip row = deep-link into RazorpayX dashboard (per R7 doctrine — we do not fabricate a PDF).
- **After it ships:** employees self-check attendance/leaves/payslips on mobile; HR ticket volume drops; foundation for later declarations/reimbursements is in place. No change to HRMS admin flows.

### R11 · Hygiene pass — **PARTIALLY STALE, do the real parts (trivial)**
Verified current state:
- `fix_proxy.py` — **not in the repo.** Nothing to delete.
- `apply-scheduled-salary-revisions` — **does not exist** as a deployed function. What exists is `hr-promote-scheduled-salary-revisions`, which is the *current* cron promoter (not retired). Do **not** undeploy it — that would break future-dated revisions.
- `RAZORPAYX_COMMISSIONING.md` — **not in `docs/`.** There is nothing to refresh; if we want a "commissioning reality" doc, we create one fresh.
- Stray docs — worth a scan; there are only 4 docs today so likely nothing to move.

What's actually worth doing: (a) audit `supabase/functions/` for genuinely retired functions and prune them; (b) write a short `RAZORPAYX_LIVE_STATE.md` capturing which envelopes are verified in production after the July-25 arc (salary, payroll) and which remain unverified; (c) append the corresponding STATE_LOG line.

- **After it ships:** repo reflects reality; no phantom paths mislead the next debugging session. Zero user-visible impact.

### R12 · Sandbox activation — **DEFER (blocked, correctly)**
Not required now. The design already exists (`SandboxToggleCard.tsx`, base-URL toggle, banner, auto-revoke cron). It is *correctly* gated on Razorpay issuing sandbox credentials — building further before we have credentials risks divergence from whatever sandbox actually behaves like. Action = a one-line checklist entry: "on receipt of Razorpay sandbox keys, flip the toggle, rehearse the two remaining unverified envelopes (contractor payouts, reimbursements), then flip back."

- **After it ships (later):** risky verifications happen with fake money; new payroll operators can be trained safely. Until credentials arrive, no code change.

### R13 · Module seams — **STRATEGIC, do incrementally, not in this pass**
Legitimate but not a single deliverable — it's four independent bridges of varying value:
1. **Recruitment "hired" → Onboarding candidate:** highest value, removes double data entry.
2. **PMS/MPI → variable-pay inputs (Payroll Inputs hub):** valuable but requires a policy decision (how MPI score maps to ₹) before code.
3. **Assets → F&F clearance checklist:** small, obvious win.
4. **Disciplinary → penalty engine:** already partially wired via `hr_penalty_rules`; needs an audit before we touch it.

Recommend doing #1 and #3 opportunistically after R10, and treating #2 and #4 as separate briefs.

- **After it ships (per seam):** data entered once flows to the next module; HRMS behaves as one organism rather than parallel modules.

## Recommended order

1. **R10 (ESS phase one)** — biggest user-facing win, no external dependency.
2. **R11 (hygiene, corrected scope)** — trivial, do alongside R10 as cleanup.
3. **R13 seam #1 (Recruitment → Onboarding)** — small, unblocks the "hired" moment.
4. **R12** — when Razorpay grants sandbox creds.
5. **R13 seams #2/#3/#4** — separate briefs when prioritized.

## What changes for you after each ships

- **After R10:** every employee has a mobile-first "my HR" view inside the ERP profile; can raise a leave request without HR; can see their payslip and open the RazorpayX PDF. HR sees fewer "what's my balance?" pings. No change to the HRMS admin console.
- **After R11:** docs reflect the July-25 live-fire reality; no orphan functions; STATE_LOG updated. Nothing visible in the app.
- **After R12 (when unblocked):** a sandbox banner appears when ops flip the toggle; risky pushes go to sandbox; auto-revokes after the rehearsal window.
- **After R13 seams (incrementally):** hired candidates land in Onboarding automatically; asset returns block F&F; MPI scores feed variable pay; disciplinary actions feed penalties.

## Technical scope (for reference)

- **R10:**
  - Migration: three security-invoker views (`ess_my_*`) + policies that scope to `auth.uid()` → `hr_employees.user_id`; INSERT policy on `hr_leave_requests` for self.
  - Frontend: `src/pages/user-profile/ess/{TodayTab,LeavesTab,PayslipsTab,ProfileTab}.tsx` mounted inside `UserProfile.tsx`.
  - Reuse: `hr_payslips_v`, `RazorpayPayslipLink`, `useDeepLinkHighlight`, existing regularization dialog for punch corrections.
- **R11:**
  - Enumerate `supabase/functions/` and confirm each is still referenced from a cron or a caller before pruning.
  - New `docs/RAZORPAYX_LIVE_STATE.md`; append STATE_LOG entry.
- **R13 #1:** trigger on `hr_candidates.status='HIRED'` that inserts an `hr_employee_onboarding` row and links back via `source_candidate_id`.

Nothing here touches financial engines, RLS on payroll writes, or the RazorpayX push doctrine.
