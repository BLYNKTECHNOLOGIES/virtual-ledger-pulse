# Leave Request & Two-Stage Approval (ERP-first)

Employees raise leave from their ERP profile. The reporting manager approves in the ERP. HR gives the final approval in HRMS. Email + in-app notifications go to both approvers at the right moment.

## Flow

```text
Employee (ERP profile)  ->  requested
        |                      | manager approves
        v                      v
Reporting Manager (ERP) ->  manager_approved   (HR sees "Awaiting manager" until this point)
        |                      | HR approves
        v                      v
HR (HRMS)               ->  approved  (balance deducted here, and only here)

Rejection at either stage -> rejected (with reason). Employee can cancel while pending.
```

Key rule: leave balance is deducted only on final HR approval — the existing balance triggers key on `approved`, so the new intermediate state is safe and cannot double-deduct.

## What gets built

**1. Employee request form (ERP profile → My Requests)**
- "Request Leave" dialog next to the existing Regularization button: leave type (with live balance shown per type), start/end date, half-day toggle with AM/PM, auto-computed working days, reason, optional attachment (mandatory when the leave type requires one), contact-during-leave number, and an inline warning showing how many teammates in the same department are already off on those dates.
- Shows the resolved reporting manager so the employee knows who it goes to.
- Client-side guards mirroring existing DB rules (no backdating beyond 3 days, no sick leave during probation, insufficient balance).

**2. Manager approval inside the ERP**
- New "Team Approvals" card in the ERP profile, visible only to employees who are somebody's reporting manager.
- Lists pending team requests with employee, dates, days, type, reason, remaining balance and clash count; Approve / Reject (reason required) with an AlertDialog confirm.
- Deep-linkable (`/profile?tab=team-approvals&leaveId=...`) so the email link lands on the exact request.

**3. HR final approval (HRMS Leave Requests page)**
- Status filter gains `Awaiting manager` and `Manager approved`.
- Requests still awaiting the manager are shown read-only with an "Awaiting <manager name>" badge; HR's Approve button unlocks only after manager approval.
- HR override (approve without manager) allowed for Super Admin / HR admin only, and recorded in the audit trail.
- Each row shows the approval trail: who requested, manager decision + timestamp, HR decision + timestamp.

**4. Notifications**
- On submit: in-app notification to the reporting manager (ERP) and to HR (HRMS), plus confirmation to the employee.
- On manager approval: in-app to HR ("ready for final approval") and to the employee.
- On HR approval/rejection: in-app to the employee and the manager.
- Reuses the existing `hr_notifications` + `hr_notify` / `hr_broadcast_notification_to_hr` plumbing already wired to the notification bell.

**5. Emails**
- New `leave-request` transactional template (matching the plain HR mail style already used): employee name, type, dates, days, reason, balance after approval, clash warning, and a deep link button to approve.
- Sent from `hr@blynkex.com` via the existing HR mail sender.
- Triggered on submit (manager + HR), on manager decision (HR + employee), on HR decision (employee + manager). Idempotency key per request+stage+recipient so retries never double-send.

## Suggested additions (industry practice) — tell me which you want

1. **Auto-escalation**: if the manager doesn't act within N days (default 2 working days), reminder mail; after N+2, HR can approve directly. Prevents stuck requests.
2. **Delegate approver**: when the manager is themselves on leave, requests route to their manager (or a nominated delegate).
3. **Manager-less fallback**: 2 of 44 employees have no reporting manager set — their requests skip stage 1 and go straight to HR, flagged so HR knows the chain is missing.
4. **Team leave calendar for the manager** showing overlapping absences before approving.
5. **Attendance link**: approved leave days auto-marked as on-leave in attendance so LOP is not double-counted.
6. **Cancellation after approval**: employee requests cancellation, manager/HR confirms, balance restored (already supported by the balance trigger).
7. **Withdraw before manager action**: one-click, no approval needed.
8. **Sandwich/holiday policy visibility**: show which days are excluded per leave type at request time (the type flags already exist).
9. **Approval audit export** for compliance.

## Technical notes

- `hr_leave_requests` gains: `manager_id`, `manager_status`, `manager_decided_at`, `manager_remarks`, `hr_approved_by`, `hr_approved_at`, `contact_during_leave`. Status vocabulary extends with `manager_approved` (existing `requested` / `approved` / `rejected` / `cancelled` untouched).
- Trigger updates: notification trigger extended for the new stage; balance triggers left keyed on `approved` (no change needed, verified).
- RLS: employees insert/select their own; managers select + update `manager_status` on rows where `manager_id` matches their employee id; HR roles retain full access.
- Manager resolution: `hr_employee_work_info.reporting_manager_id`, snapshotted onto the request at insert time so later org changes don't re-route in-flight requests.
- Email dispatch through the existing `hr-mail-send` / transactional email registry; new template file added to the registry.
