# Attendance Regularization — HR-first approval flow with optional manager step

Mirrors the leave flow that just shipped, but with the routing reversed: the employee raises it in ERP, **HR sees it first**, and HR may either decide it or push it to the employee's reporting manager. If pushed, the manager decides in his own ERP profile and the request comes back to HR for the final approval.

## Flow

```text
Employee (ERP profile → My Requests)
        │  submits date, times, reason category, reason
        ▼
HR (HRMS → Attendance Watchdog / Regularization)      ← email to hr@blynkex.com
        ├── Approve / Reject  ────────────────────────► done (existing evidence + audit rules apply)
        └── Push to reporting manager
                    │                                  ← email to manager with details + ERP link
                    ▼
        Reporting manager (ERP profile → Team Approvals)
                    │  recommends approve / reject + remarks
                    ▼
        HR final approve / reject                      ← email back to HR
                    │
                    ▼
        Employee notified by email
```

## What the employee fills in

Existing fields (date, requested check-in, check-out, reason) plus a **reason category**: missed punch, device offline, wrong shift mapped, approved off-site work, other. The category is stored on the request so HR sees intent immediately and the existing reason-code discipline stays consistent.

## Screens

**ERP profile → My Requests** (existing hub)
- Richer "Raise regularization" dialog: adds the reason category, shows what HR will check (biometric evidence), and keeps the current guidance line.
- Status now reads as a stage: "Awaiting HR", "With reporting manager", "Manager approved · awaiting HR", "Approved", "Rejected". Employee can cancel while it's still pending.

**ERP profile → Team Approvals** (the card added for leave)
- New "Attendance regularizations" section listing requests HR pushed to this manager.
- Shows date, requested in/out, category, reason, and what the system currently has for that day.
- Manager records approve/reject with remarks; the item then shows "Sent back to HR".

**HRMS → Attendance Watchdog (regularization section)**
- New status filter values: Awaiting HR, With manager, Manager approved, plus existing approved/rejected.
- Each pending row gets a third action: **Push to manager** (shows the resolved manager name; blocked with a clear message if the employee has no reporting manager set).
- Rows returned by a manager display the manager's recommendation and remarks inline, so HR's final decision is informed.
- All existing rules stay intact: evidence validation before approve, mandatory reason code + notes, unsupported-override reason, and the `hr_attendance_intervention_log` audit entry — with new log actions for push-to-manager and manager decisions.

## Emails

One new template `regularization-approval`, sent through the existing transactional email function:
- On submit → HR inbox (hr@blynkex.com), with all details and an "Open HRMS" button.
- On push to manager → the manager, with details and an "Open ERP" button pointing at his profile requests tab.
- On manager decision → HR inbox, showing the recommendation and remarks.
- On HR final decision → the employee.

In-app notifications fire on the same four events (HR broadcast, manager, employee) using the notification helpers already wired for leave.

## Technical notes

Database (one migration on `hr_attendance_regularization_requests`):
- New columns: `manager_id`, `manager_status` (pending/approved/rejected), `manager_remarks`, `manager_decided_at`, `manager_decided_by`, `pushed_to_manager_at`, `pushed_by`, `reason_category`, `source`.
- Status vocabulary extended to `pending` → `manager_review` → `manager_reviewed` → `approved` / `rejected` / `cancelled`, enforced by a check constraint.
- Trigger to stamp `manager_id` from `hr_employees.reporting_manager_id` when HR pushes, and to stamp manager decision timestamps.
- RLS: employees read/insert/cancel their own; a manager reads and updates the manager fields only for requests routed to him; HR/admin retains full access. Grants for `authenticated` and `service_role`.
- No change to how an approved regularization affects attendance/LOP — the existing approve path is untouched.

Frontend:
- `src/components/profile/MyRequestsHub.tsx` — extend the existing regularization dialog and stage labels.
- `src/components/profile/TeamLeaveApprovals.tsx` — generalize into a team-approvals card with a regularization section (leave section unchanged).
- `src/pages/horilla/AttendanceRegularizationPage.tsx` — push-to-manager action, manager recommendation display, new filters.
- `src/utils/regularizationEmail.ts` + `supabase/functions/_shared/transactional-email-templates/regularization-approval.tsx` registered in the template registry, then redeploy `send-transactional-email`.

Verification before reporting done: submit → push → manager decide → HR finalize executed end-to-end against the database, plus a template render check on the deployed email function.
