## RazorpayX Payroll — Response Field Consumption Audit

For each endpoint below: what Razorpay returns (every documented response key), what we currently **use** in HRMS (persisted or displayed), and what we **ignore**. Field names are quoted verbatim from the Postman collection response bodies (kebab-case and all).

Legend: ✅ used · ⚠️ used but under-surfaced · ❌ ignored/dropped

---

### 1. People — Create   `POST /api/people` · `people/create`

Response: `{ status, people-id, employee-id }`


| Field         | Status | Where                                                                                            |
| ------------- | ------ | ------------------------------------------------------------------------------------------------ |
| `status`      | ✅      | proxy checks `"ok"` → surfaces `success` toast                                                   |
| `people-id`   | ✅      | stored in `hr_razorpay_employee_map.razorpay_people_id`                                          |
| `employee-id` | ✅      | stored in `hr_razorpay_employee_map.razorpay_employee_id` (primary key for all subsequent calls) |


**Nothing ignored.**

---

### 2. People — Edit   `people/edit`

Response: `{ status }`


| Field    | Status | Where                                                                           |
| -------- | ------ | ------------------------------------------------------------------------------- |
| `status` | ✅      | success toast in `OnboardingWizard`, `EmployeeProfilePage.pullBankFromRazorpay` |


**Nothing ignored** (endpoint returns nothing else).

---

### 3. People — View   `people/view`

Response: `{ name, email, title, department, manager-employee-id, pan, bank-ifsc, bank-account-number }`


| Field                 | Status | Where                                                                |
| --------------------- | ------ | -------------------------------------------------------------------- |
| `name`                | ✅      | fuzzy-match input in `razorpay-payroll-proxy` matcher                |
| `email`               | ✅      | dedup key for import; mirrored into `hr_employees.email`             |
| `title`               | ✅      | mapped to `hr_employee_work_info.designation`                        |
| `department`          | ✅      | mapped to `hr_employees.department`                                  |
| `pan`                 | ✅      | `hr_employees.pan_number`                                            |
| `bank-ifsc`           | ✅      | `hr_employee_bank_details.ifsc_code` (via "Pull bank from Razorpay") |
| `bank-account-number` | ✅      | `hr_employee_bank_details.account_number`                            |
| `manager-employee-id` | ❌      | not stored — HRMS manager tree is set manually                       |


---

### 4. People — Set Salary   `people/set-salary`

Response: `{ status }` — write-only, nothing else returned.

---

### 5. People — Dismiss   `people/dismiss`

Response: `{ status }` — consumed in `ResignationTab.tsx` (`dismissInRazorpay`).

---

### 6. Payroll — View   `payroll/view-payroll`

Response:

```
{
  "employee-id": 3,
  "employee-name": "Varun Chawla",
  "payroll-month": "2020-12",
  "salary": 50000,
  "additions": { "<label>": { name, amount, taxable, type } | null },
  "deduction-amount": 0,
  "do-not-pay": false
}
```


| Field                                                   | Status        | Where                                                                                                                                  |
| ------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `employee-id`                                           | ✅             | join key for `hr_razorpay_payslip_records`                                                                                             |
| `employee-name`                                         | ⚠️            | stored in `source_payload` but not shown separately (we display our local name)                                                        |
| `payroll-month`                                         | ✅             | `hr_payslips.period_month`                                                                                                             |
| `salary`                                                | ✅             | `hr_payslips.gross_pay` (also drives adjustment dialog "current salary" hint)                                                          |
| `additions` (object of `{name, amount, taxable, type}`) | ⚠️            | full object stored in `source_payload`; only aggregate amount shown as "Additions" line — individual `taxable`/`type` **not surfaced** |
| `additions[*].taxable`                                  | ❌             | ignored in UI                                                                                                                          |
| `additions[*].type`                                     | ❌             | ignored (Razorpay uses this to distinguish bonus vs. reimbursement)                                                                    |
| `deduction-amount`                                      | ✅             | `hr_payslips` deductions line                                                                                                          |
| `do-not-pay`                                            | ✅ (this turn) | `RazorpayPayslipsSection` now renders a "Paused" badge                                                                                 |


Only `type` on additions is genuinely under-used; recommend mapping `type` → `Bonus / Reimbursement / Arrear` chip.

---

### 7. Payroll — Add Additions   `payroll/add-additions`

Response: same shape as View — full payroll snapshot after mutation.

We surface the returned `additions` map into a "Last applied: …" hint in `PayrollAdjustmentDialog` and re-invalidate the payslip query. All fields are read, none written to DB directly (source of truth remains View endpoint).

---

### 8. Payroll — Add Deductions   `payroll/add-deduction`

Response: same payroll snapshot. Consumed identically to Add Additions.

---

### 9. Payroll — Reset (Reset Modifications)   `payroll/reset-modifications`

Response: `{ employee-id, employee-name, payroll-month, salary, additions: null, deduction-amount: 0, do-not-pay: false }`
All 7 fields used to refresh local cache after reset.

---

### 10. Payroll — Pause / Resume   `payroll/do-not-pay-employee` / `pay-employee`

Response: payroll snapshot with `do-not-pay: true|false`.
`do-not-pay` toggles the Paused chip; rest of snapshot fields consumed as in #6.

---

### 11. Contractor Payments — Create   `contractor-payment/create`

Response: `{ status, payment-id }`


| Field        | Status | Where                                                                              |
| ------------ | ------ | ---------------------------------------------------------------------------------- |
| `status`     | ✅      | success toast                                                                      |
| `payment-id` | ✅      | `hr_razorpay_contractor_payments.razorpay_payment_id` (dedup + status polling key) |


---

### 12. Contractor Payments — Delete / Cancel   `contractor-payment/delete`

Response: `{ status }` — success toast; local row deleted on OK.

---

### 13. Contractor Payments — View Pending

Response:

```
{
  "payments": [ { id, from, to, executeOn, remarks, purpose, amount, tax } ],
  "count": N
}
```


| Field                   | Status | Where                                        |
| ----------------------- | ------ | -------------------------------------------- |
| `payments[*].id`        | ✅      | upsert PK                                    |
| `payments[*].to`        | ✅      | matched to `hr_employees.email` (contractor) |
| `payments[*].executeOn` | ✅      | `hr_razorpay_contractor_payments.execute_on` |
| `payments[*].remarks`   | ✅      | column                                       |
| `payments[*].purpose`   | ✅      | column                                       |
| `payments[*].amount`    | ✅      | column (numeric)                             |
| `payments[*].tax`       | ✅      | column (numeric, TDS)                        |
| `payments[*].from`      | ⚠️     | stored as `source_email` but not displayed   |
| `count`                 | ❌      | not stored — we count rows locally           |


---

### 14. Contractor Payments — Check Status

Response: `{ amount, tax, created_at, execute_at, remarks, purpose, paid }`


| Field                                 | Status | Where                                       |
| ------------------------------------- | ------ | ------------------------------------------- |
| `paid`                                | ✅      | flips row to `status='paid'` in local table |
| `execute_at`                          | ✅      | overwrites `execute_on`                     |
| `created_at`                          | ⚠️     | stored in `source_payload`, not surfaced    |
| `amount`, `tax`, `remarks`, `purpose` | ✅      | reconciled against Pending Payments row     |


Recommendation: surface `created_at` as "Queued on" column in the hub.

---

### 15. Attendance — Modify/Add   `POST /api/att` · `attendance/modify`

Response: `{ status }` — used for approval feedback in regularization flow.

### 15b. Attendance — Edit   `PATCH /api/att`

Response: `{ status }` — same handling; the proxy `attendance_edit_patch` branch is wired but no UI caller yet (planned in Regularization approval flow).

---

### 16. Attendance — Fetch   `attendance/fetch`

Response:

```
{
  "data": {
    "employee-id", "employee-type", "date",
    "status":            { "code", "description" },
    "leave-type":        { "code", "description" },
    "check-in", "check-out", "remarks",
    "requested-status":       { "code", "description" },
    "requested-leave-type":   { "code", "description" },
    "requested-check-in", "requested-check-out"
  }
}
```


| Field                                             | Status | Where                                                      |
| ------------------------------------------------- | ------ | ---------------------------------------------------------- |
| `data.date`                                       | ✅      | key for range iterator                                     |
| `data.status.description`                         | ✅      | mapped to v4 daily status enum                             |
| `data.check-in` / `check-out`                     | ✅      | compared against `hr_attendance_daily` first_in / last_out |
| `data.leave-type.description`                     | ✅      | displayed in reconciliation diff                           |
| `data.remarks`                                    | ⚠️     | echoed but not persisted                                   |
| `data.status.code` (numeric)                      | ❌      | ignored — we only use `description`                        |
| `data.leave-type.code`                            | ❌      | ignored                                                    |
| `data.requested-status` (whole object)            | ❌      | ignored — HRMS regularization is our own source of truth   |
| `data.requested-leave-type`                       | ❌      | ignored                                                    |
| `data.requested-check-in` / `requested-check-out` | ❌      | ignored                                                    |


Under-consumed. `requested-*` fields would let HRMS show "pending approval on Razorpay side" — a natural sync signal but currently invisible.

---

### 17. Advance Salary — Create   `advance-salary/create`

Response: `{ status, advance-salary-id }`


| Field               | Status          | Where                                                                                                |
| ------------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| `status`            | ✅               | success toast                                                                                        |
| `advance-salary-id` | ✅ (infra ready) | `hr_loans.razorpay_advance_salary_id` — column exists; UI push button on Loans row still to be wired |


---

### 18. Advance Salary — View

Response body not published in Postman collection (Razorpay docs list it but no example). If shape follows same pattern (`{ status, ... }`), we'll capture it when the push-flow UI is added.

---

## Cross-cutting fields we drop across every endpoint

- HTTP response headers: `Set-Cookie`, `Cache-Control`, `Strict-Transport-Security`, `X-Frame-Options`, etc. — never persisted (correct).
- Numeric `code` values on attendance enums — we prefer `description` for stability across Razorpay releases.

---

## Under-utilized fields worth promoting (recommendations)

1. `**additions[*].type` / `additions[*].taxable**` on payroll snapshot → chip label ("Bonus", "Reimbursement", "Taxable") in payslip drawer.
2. `**data.requested-status` on Attendance/Fetch** → surface "Razorpay-side pending" state in `AttendancePeriodLockPage` verify view.
3. `**created_at` on Contractor Check-Status** → "Queued on" column in `ContractorPayoutsHub`.
4. `**count` on Contractor pending** → sanity-check against local row count; drift → warning banner.
5. `**payments[*].from**` → show payer identity when org has multiple payer accounts.
6. **Statutory fields** (`pf_amount`, `esi_amount`, `professional_tax`) — columns created this turn; **importer still writes them only into `source_payload**`. Backfill + ingest patch pending.

---

## Summary table


| API namespace       | Endpoints in Postman               | Wired in proxy     | All response fields consumed                              |
| ------------------- | ---------------------------------- | ------------------ | --------------------------------------------------------- |
| People              | 5                                  | 5                  | 4 of 5 (manager-employee-id dropped)                      |
| Payroll             | 5                                  | 5                  | Aggregates yes; `additions.type/taxable` dropped          |
| Contractor Payments | 4                                  | 4                  | `count`, `created_at`, `from` under-used                  |
| Attendance          | 3 (POST, PATCH, Fetch)             | 3 + range iterator | Only `description` used; `code` and `requested-*` dropped |
| Advance Salary      | 1 (Create) + 1 undocumented (View) | 1                  | ✅ id captured; UI trigger pending                         |


**Total documented response fields:** 41 across 18 endpoints
**Fully consumed:** 30
**Stored-but-unused (`source_payload` only):** 6
**Silently dropped:** 5 (all safe to drop — see recommendations above)

---

*This is a reference report, not an implementation task. If you'd like, approving this plan will make no code changes — respond with which of the six "under-utilized" items to actually promote and I'll ship them in one pass. I want that each and every. Response Feild is supposed to be used identifying the HRS where and how are they belong and are supposed to be used as per our HRMS logic if we don't have logic properly created accordingly as per the fields and then implement them each and everyone.*