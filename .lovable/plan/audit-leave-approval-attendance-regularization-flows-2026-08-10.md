# Audit: Leave Approval + Attendance Regularization flows

Both flows are wired correctly end to end — the stages, triggers, status vocabularies, manager resolution and emails all line up, and the regularization state machine was verified in the database (submit → HR push → manager decision → HR final approval → synthetic punches + v4 recompute). Six defects were found. Four are correctness/security issues that should be fixed; two need your decision.

## What is verified working

- Leave: manager snapshot on insert (from employee work info), auto-skip to HR when no manager exists, manager decision stamping, HR final stamping, balance debit only on HR approval, LOP/paid split.
- Regularization: status vocabulary (`pending → manager_review → manager_reviewed → approved/rejected`), routing trigger reads the manager from work info, period-lock guard, synthetic punch insert with per-request idempotency, engine recompute over a ±1 day window.
- Manager visibility in ERP and HR visibility in HRMS both resolve through the correct policies; regularization RLS is tight (own rows, routed rows, HR-all).

## Defects to fix

**1. Leave requests are wide open (critical).** A leftover policy on `hr_leave_requests` grants every signed-in user full read and write over every leave row. Any employee can read colleagues' leave, and can set their own request straight to approved — bypassing both the manager and HR stages entirely. Remove that policy and keep only the scoped ones.

**2. No column guard on either table.** Even after fixing #1, the scoped policies let an employee update any field on their own row, and let a manager edit the requested punch times / leave dates rather than only recording a decision. Add guard triggers so an employee can only cancel, and a manager can only write the decision fields.

**3. Duplicate regularization requests for the same date.** Nothing stops two requests for one employee/date. If both get approved, two synthetic IN/OUT pairs land on the same day (idempotency is keyed per request, not per date) and the engine sees conflicting punches. Add a partial uniqueness guard on open/approved requests per employee per date.

**4. Employee gets two notifications on every leave decision, one with a dead link.** Two notification triggers fire on the same status change; one of them points at `/employee/leaves`, a route that does not exist in this app. Consolidate to the single trigger that links to `/profile`.

**5. Regularization has no in-app notifications.** Leave sends bell notifications to the manager, HR and the employee at each stage; regularization sends email only, all fired from the browser. If HR pushes a request and closes the tab before the call completes, the manager is never told. Add the same notification parity for regularization (raised → HR, pushed → manager, manager decided → HR, final → employee).

**6. Employee cannot withdraw a regularization once HR pushes it.** Cancel is limited to `pending`, so a request sitting with the manager is stuck until someone decides. Allow cancel while the request is still undecided.

## Decisions needed from you

- **Manager rejection asymmetry.** On leave, a manager rejection closes the request immediately. On regularization, a manager rejection goes back to HR, who can still approve. Should leave also route rejections back to HR for a final call, or is the current behaviour intended?
- **Email delivery.** All stage emails are fired from the browser after the write. Moving them server-side (fired by the database change itself) would make them reliable regardless of the tab, at the cost of one new edge-function hop. Worth doing now, or leave as is?

## Technical detail

- Drop `authenticated_all_hr_leave_requests` on `public.hr_leave_requests`; add an explicit SELECT policy for HR roles so HRMS keeps its full view, and tighten the existing employee/manager UPDATE policy.
- New BEFORE UPDATE guard functions `hr_leave_request_field_guard` and `hr_reg_request_field_guard`: when the actor is the employee, only `status → cancelled` may change; when the actor is `manager_id`, only `manager_status` / `manager_remarks` may change; HR roles unrestricted.
- Partial unique index on `hr_attendance_regularization_requests (employee_id, attendance_date)` where `status` in (`pending`,`manager_review`,`manager_reviewed`,`approved`).
- Drop trigger `trg_hr_notify_leave_decision` (dead `/employee/leaves` link, duplicates `hr_notify_leave_request_change`).
- New `hr_notify_regularization_change` trigger using `hr_notify` / `hr_broadcast_notification_to_hr` / `hr_emit_notification`, mirroring the leave notifier.
- Relax the `Employee cancel own pending` policy to cover `manager_review` and `manager_reviewed`.
- Frontend: `MyRequestsHub.tsx` cancel affordance for pushed regularizations; no other UI change required.
