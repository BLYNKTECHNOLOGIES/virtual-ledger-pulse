# Pull RazorpayX values back into HRMS (reverse of "Push → Razorpay")

Today the Data Health drift cards only offer one direction: adopt the HRMS value and push it to
RazorpayX (and eSSL for identity fields). Since RazorpayX is the primary payroll authority, the
opposite move — accept what RazorpayX holds and write it into HRMS — has to be a first-class,
audited action too.

## What gets added

**A second button on every drift card: `Pull ← Razorpay`**

- Enabled only when the drift row actually has a RazorpayX value and the field has a defined HRMS
  write target.
- Clicking it opens a small confirmation showing exactly what will change:
  `Designation: "operator" (HRMS) → "system operator" (RazorpayX)`.
- On confirm: the live person record is re-fetched from RazorpayX first (so a stale snapshot never
  overwrites HRMS), the value is written to HRMS, the drift row is re-verified and closed if the two
  sides now agree, and the action is logged.

**Bulk adopt**

- Checkbox selection on drift cards plus a `Pull selected ← Razorpay` action, so a batch of
  designation/department mismatches can be accepted in one pass instead of one click at a time.

**Audit + safety**

- Every pull writes an audit row (employee, field, old HRMS value, new value, who, when, live
  snapshot) to the same log surface the pushes use, so the ledger shows both directions.
- Fields that must not be silently overwritten (bank account, bank IFSC, active/dismissed state,
  annual CTC) require an extra typed confirmation and are marked "sensitive" in the dialog.
- eSSL-only differences remain out of scope for pull — eSSL holds no authoritative HR data.

## Field → HRMS write target

| Drift field | Written to |
|---|---|
| Full name | employee first/last name |
| Email, phone, date of birth, gender | employee record |
| PAN, date of joining | employee work info |
| Department, designation | work info — matched to an existing HRMS department/position by name; if no match exists, one is created and the operator is told |
| Employee code / badge | blocked from pull (badge ID is the HRMS identity anchor and is used by biometric mapping) — the card explains this and keeps push as the only route |
| Bank account, bank IFSC | employee bank details (sensitive confirmation) |
| Annual CTC | salary structure mirror, via the server-side path only (sensitive confirmation) |
| Active / dismissed | employment status (sensitive confirmation; dismissal date carried over) |

## Technical notes

- New edge function `hr-razorpay-pull-apply` (service role): takes `{ hr_employee_id, fields[] }`,
  calls the existing `razorpay-payroll-proxy` `people:view` path for a live record, maps RazorpayX
  keys to HRMS columns with the same normalizers `hr-drift-scan` uses, applies the writes, refreshes
  `hr_razorpay_employee_map.last_pull_snapshot`, and returns a per-field applied/skipped result.
  Salary-structure writes go here because those tables are locked to `service_role`.
- Reuses the drift-scan `FIELDS` normalizers (extracted into a shared module) so "does it still
  differ?" is judged by exactly the same comparison that raised the alert — no second opinion.
- After apply, the function re-runs the comparison for that employee and resolves the drift rows it
  actually fixed; anything still mismatched stays open with the fresh values.
- Audit rows go to `hr_razorpay_pushback_log` with `kind: 'pull'` and a direction column so Data
  Health can render both directions in one history.
- UI changes are confined to `src/pages/horilla/DataHealthPage.tsx` plus a new
  `PullFromRazorpayDialog` component; a `PULL_BY_FIELD` map mirrors the existing `PUSH_BY_FIELD`.

## Verification before it is called done

- Live pull applied on one designation drift (Vandana Raikwar, ID 39) and one department drift
  (Khushbu Parmar, ID 35); database re-queried to confirm the HRMS row changed and the drift closed.
- A sensitive field (bank IFSC) exercised in dry form to confirm the extra confirmation gate fires.
- Re-scan run afterwards to confirm the alerts do not reappear.
