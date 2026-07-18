# RazorpayX API Response Fields — What We Read vs. Ignore

Legend: ✅ consumed in our code · ⚠️ opportunistic / fallback only · ❌ ignored (not read anywhere)
All line refs = `supabase/functions/razorpay-payroll-proxy/index.ts` unless stated otherwise.

---

## People / Create — `people/create`
```json
{ "status": "ok", "people-id": 36286, "employee-id": 4 }
```
| Field | Used? | Where |
|---|---|---|
| `status` | ✅ | Success gate at line 104 (`res.ok && looksLikeEmployee && !errText`). |
| `employee-id` | ✅ | Line 4425 — extracted via `pickStr(bodyOut, ["employee-id","employee_id","id",…])` and stored to `hr_razorpay_employee_map.razorpay_employee_id`. Line 4427 rejects the row if absent. |
| `people-id` | ❌ | Never read. Razorpay returns two IDs; only the payroll one (`employee-id`) is needed. |

## People / Edit — `people/edit`
```json
{ "status": "ok" }
```
| `status` | ✅ | Success gate → increments `applied` counters in `push_bank_apply_*` / `push_person_apply_*`. Response has no diff, so we re-fetch via `people/view` to reconcile. |

## People / View — `people/view`
```json
{ "name":"…","email":"…","title":null,"department":null,
  "manager-employee-id":null,"pan":null,"bank-ifsc":null,"bank-account-number":null }
```
Real tenants also emit `gender`, `dob`, `phone`, `type`, `date-of-joining`, and (in our compound `pull_person_full`) a nested `__salary` block.

| Field | Used? | Where |
|---|---|---|
| `name` | ✅ | Draft creation (line 879), `buildDraftFromRazorpay` (543, 562), fuzzy match `hr_match_employee_by_normalized_name`. |
| `email` | ✅ | Primary Opfin lookup key; used by `payroll/view-payroll` (176, 381). |
| `pan` | ✅ | Match by PAN (468, 488–491, `matched_by:"pan"`); written to `hr_employees.pan_number` (562, 681). |
| `title` | ✅ | Position resolver `ensurePositionId(title|designation|job_title)` (691, 760). |
| `department` | ✅ | `departments` lookup by name (543, 690, 759). |
| `bank-account-number` | ✅ | `resolveBankFields()` (726); written back via `people/edit` at line 1784. |
| `bank-ifsc` | ✅ | Line 727; written back at 1785. |
| `manager-employee-id` | ❌ | Never read. HRMS's reporting manager is set locally. |
| `phone` (extra) | ✅ | Match fallback (`matched_by:"phone"`) + draft/profile columns. |
| `gender` / `dob` (extra) | ✅ | Draft + `hr_employees.gender` / `date_of_birth`. |
| `date-of-joining` (extra) | ✅ | Draft `date_of_joining`. |
| `__salary` compound | ✅ | Line 786 → `annual_ctc` / monthly-gross derivation. |
| Any other keys | ⚠️ | Preserved in `hr_razorpay_employee_map.razorpay_snapshot` JSONB but not surfaced in UI. |

## People / Set Salary — `people/set-salary`
```json
{ "status": "ok" }
```
| `status` | ✅ | Success gate for `push_salary_apply_*` (line 2156). No numeric echo — confirmation via a follow-up `pull_person_full`. |

## People / Dismiss — `people/dismiss`
```json
{ "status": "ok" }
```
| `status` | ✅ | `src/lib/razorpayPushback.ts` (221–268). On OK we flip local `hr_employees.status = 'dismissed'`. |

---

## Payroll / View — `payroll/view-payroll`
```json
{ "employee-id":3,"employee-name":"…","payroll-month":"2020-12",
  "salary":50000,
  "additions":{ "Bonus":{ "name":"Bonus","amount":"10000","taxable":true,"type":0 } },
  "deduction-amount":0,"do-not-pay":false }
```
Real payslip responses also include `net-pay`, `tds`/`income-tax`, `pf`, `esi`, `professional-tax`, `payment-status`, `paid-on`, `payslip-url`.

| Field | Used? | Where |
|---|---|---|
| `employee-id` | ✅ | Row match to `hr_razorpay_employee_map` (3431, 3672). |
| `employee-name` | ✅ | Fallback display when local employee row missing. |
| `payroll-month` | ✅ | Written to `hr_payslips.period_month` (payslip history import). |
| `salary` (monthly gross) | ✅ | `readNum(body,["salary"])` (200); monthly→annual CTC inference at 791. |
| `additions` (map) | ✅ | Summed by `sumMoneyLeaves` (295); breakdown persisted in `hr_payslips.earnings`. |
| `deduction-amount` | ✅ | `pickDeepMoney(...,["deduction-amount",…])` (292). |
| `do-not-pay` | ⚠️ | Only stripped from the money sniffer (272); **not surfaced in UI**. |
| `net-pay` (extra) | ✅ | Pick list at 305 → `hr_payslips.net_pay`. |
| `tds` / `income-tax` (extra) | ✅ | Line 307 → `hr_payslips.tds`. |
| `pf` / `esi` / `professional-tax` (extra) | ⚠️ | Grabbed by generic amount-key regex (273); stored in earnings/deductions JSONB, not as columns. |
| `payslip-url` (extra) | ✅ | `RazorpayPayslipsSection.tsx` uses it for the "Open PDF" button. |
| `paid-on` / `payment-status` (extra) | ⚠️ | Persisted inside `source_payload` (414); not shown as badges. |

## Payroll / Add Additions — `payroll/add-additions`
```json
{ "employee-id":2,"employee-name":"…","payroll-month":"2020-12",
  "salary":116129,"additions":{…},"deduction-amount":0,"do-not-pay":false }
```
| All fields | ❌ | No dedicated caller. Only the generic `probe_endpoint`/`run_sub_type` executor can hit this endpoint; response is passed through but not parsed anywhere. |

## Payroll / Add Deductions — `payroll/add-deduction`
Same shape as Additions. **All fields ❌.**

## Payroll / Reset — `payroll/reset-modifications`
Same shape (`additions:null,deduction-amount:0`). **All fields ❌.**

## Payroll / Pause-Resume — `payroll/do-not-pay`
Same shape (`do-not-pay: true|false`). **All fields ❌ — even the toggle we send is not reflected anywhere.**

---

## Contractor Payments / Create — `contractor-payment/create`
```json
{ "status": "ok", "payment-id": 13908 }
```
| Field | Used? | Where |
|---|---|---|
| `status`, `payment-id` | ❌ | No contractor UI. Generic executor only. |

## Contractor Payments / Delete — `contractor-payment/delete`
```json
{ "status": "ok" }
```
| `status` | ❌ | Not consumed. |

## Contractor Payments / List Pending — `contractor-payment/list-pending`
```json
{ "payments":[
    { "id":13908,"from":"…","to":"…","executeOn":"2020-12-15",
      "remarks":"…","purpose":"professional-services",
      "amount":"2000.00","tax":"360" } ],
  "count":2 }
```
| Every field (`payments[]`, `count`, `id`, `from`, `to`, `executeOn`, `remarks`, `purpose`, `amount`, `tax`) | ❌ | Not consumed. |

## Contractor Payments / Get Status — `contractor-payment/get-status`
```json
{ "amount":"2000.00","tax":"360",
  "created_at":"15/12/2020 20:14:32","execute_at":"15/12/2020",
  "remarks":"…","purpose":"professional-services","paid":false }
```
| All fields | ❌ | Not consumed. |

---

## Attendance / Modify-Add (POST) — `attendance/modify`
```json
{ "status": "ok" }
```
| `status` | ✅ | Success gate for `push_attendance_apply_*` (2640); updates counters in `hr_razorpay_pushback_log`. |

Our push payload sends `date`, `status-code`, `leave-type-code`, `check-in`, `check-out`; Opfin does not echo them back.

## Attendance / Fetch — `attendance/fetch`
```json
{ "data":{
    "employee-id":2,"employee-type":"employee","date":"2020-12-15",
    "status":{"code":20,"description":"leave"},
    "leave-type":{"code":1,"description":"Medical Leave"},
    "check-in":"09:00:00","check-out":"11:00:00","remarks":"…",
    "requested-status":{…},"requested-leave-type":{…},
    "requested-check-in":null,"requested-check-out":null } }
```
| Every field | ❌ | Not consumed. We own attendance locally (v4 engine); fetch is registered only for `probe_catalogue` and the response body is discarded. |

## Attendance / Edit (PATCH) — `attendance/modify`
❌ **Endpoint not implemented at all.** Response schema N/A.

---

## Advance Salary / Create — `advance-salary/create`
```json
{ "status": "ok", "advance-salary-id": 13908 }
```
| `status`, `advance-salary-id` | ❌ | Registered but no HRMS caller. Advances live in `hr_loans` and are deducted inside `fn_generate_payroll`; we never round-trip Opfin's ID. |

---

## Consumption summary

- Truly **relied on**: `status` (success gate), `employee-id` (row key), `email` (Opfin lookup), and the salary/earnings/deductions numeric family from `payroll/view-payroll`.
- Everything else is either (a) opportunistically absorbed by an amount-key regex into a JSONB blob, or (b) discarded.

### Fields currently ignored that we should start consuming (recommended)
1. `payroll/view-payroll.do-not-pay` — surface as a red **Paused** badge on the payslip row.
2. `payroll/view-payroll.payment-status` / `paid-on` — show "Paid on …" pill instead of only "Imported".
3. `pf` / `esi` / `professional-tax` breakdown — promote from JSONB to first-class columns on `hr_payslips` for the payslip statutory panel.
4. All contractor-payment fields + `advance-salary-id` — will be consumed once the dedicated flows land (per the prior wiring plan).
5. `people/view.manager-employee-id` — optional; wire into `hr_employees.reporting_manager_id` only if the customer actually maintains it in Opfin.

If you approve, I can bundle **items 1–3 (surfacing already-received fields we currently ignore)** together with the 11-endpoint wire-up plan into a single implementation pass. Say the word and I'll build it.
