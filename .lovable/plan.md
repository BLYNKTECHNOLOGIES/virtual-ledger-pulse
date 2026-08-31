# Fix ERP manager approval routing

## Outcome
Reporting managers without HRMS access will see leave and attendance-regularization approvals in **ERP Profile → Requests**, and notification clicks will open the correct request.

## Changes
- Replace profile approval queries that depend on broad HR table visibility with the existing manager-scoped database queues.
- Preserve the approve/reject workflow while limiting each manager to requests assigned to their linked employee identity.
- Keep notification links directed to `/profile?tab=requests` and highlight the linked request.
- Verify Shivangi's employee/auth mapping, assigned requests, notification targets, database access rules, and the rendered profile flow.

## Technical details
- Use `hr_manager_leave_queue()` and `hr_manager_regularization_queue()` for manager-facing reads.
- Continue writes through the existing manager-only row-level policies and status-transition triggers.
- Validate live data for Shivangi separately from authenticated UI verification; no HRMS permission will be granted.
