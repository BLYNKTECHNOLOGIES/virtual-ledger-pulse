# RazorpayX Payroll / Payslip / Salary API — Field-by-Field Audit

**Scope:** every RazorpayX Opfin endpoint our `razorpay-payroll-proxy` invokes in the
Payroll + Payslip + Salary-structure surface. For each endpoint this document lists
every response field we have ever observed for our tenant (`BLYNK VIRTUAL TECHNOLOGIES
PRIVATE LIMITED`) and states exactly where — or whether — the HRMS consumes it.

**Sources of truth (cross-checked):**
1. `supabase/functions/razorpay-payroll-proxy/index.ts` — every `fetch(BASE + ...)`
   call plus its response-parsing code (`extractPayrollViewFigures`,
   `pickDeepMoney`, `sumMoneyLeaves`, `reflectOne`, etc.).
2. Live samples captured in `hr_razorpay_payslip_records.source_payload` and
   `hr_razorpay_payroll_runs.*` for the last 30 days. When a field is documented
   upstream but never observed in our tenant it is called out explicitly.

**Deliberately out of scope for this document:** attendance/*, bank-details/*,
tds/*, taxdocs/*, generic people-profile fields (Phase-1 profile audit covers
those separately in `docs/RAZORPAY_ENDPOINT_MATRIX.md`).

**Companion documents:**
- `RAZORPAYX_COMMISSIONING.md` — end-to-end commissioning narrative
- `.lovable/memory/features/hr/payroll-and-governance-summary.md` — engine rules

---

## Legend

| Column | Meaning |
|---|---|
| Field path | Exact wire casing used by Opfin (dashed, not snake). Nested paths use `parent → child`. |
| Kind | `scalar` / `map` / `array` / `bool` / `string` / `enum`. |
| Returned by tenant | `Yes` = observed in `source_payload`. `Structured-only` = returned only when the employee has a component-level salary template attached in RazorpayX. `Never observed` = documented but our tenant has never emitted it. `N/A` = write endpoint, no response body of note. |
| Parsed by proxy at | `<file>:<line>` — the exact line that reads the field. `—` = not read. |
| Persisted to | Target column on our DB. `source_payload` means the JSONB blob only (retrievable but not queried). |
| Rendered in UI at | Concrete React component / dialog. `—` = never surfaces to the user. |
| Notes | API quirks, why the field is empty on flat runs, etc. |

**Confirmed API blind spots (repeated per endpoint):**
- No PF-employee / PF-employer split.
- No ESI-employee / ESI-employer split.
- No employer contributions map (`employer-contributions` never returned).
- No Professional Tax breakdown.
- No PDF URL of any kind — `pdf-url` / `download-url` / `payslip-url` have never
  been observed in our tenant. RazorpayX renders payslip PDFs only in the
  dashboard.
- `payroll:list`, `payroll:status`, `payroll:months`, `payroll:runs` sub-types
  do not exist upstream (verified in `probe_catalogue`).
- `view-payroll` returns CTC/12 setup defaults for months where no payroll was
  actually executed. We gate every call to only executed months via
  `hr_razorpay_payroll_runs.status IN ('bulk_applied','locked','recalled')`.
- Statutory splits (PF/ESI/PT/employer contributions) exist **only** in the
  Salary-Register CSV export from the RazorpayX dashboard — not in the API.
  Reconciliation with your CSV therefore requires an uploader, not an endpoint.

---

## Field → HRMS surface index (reverse index)

Alphabetical shortlist of every field observed across the endpoints below. Use
this to answer "which endpoint gives me X?" without scrolling.

| Field | Endpoint(s) | Persisted to | UI |
|---|---|---|---|
| `additions` (map) | `payroll:view-payroll` | `hr_razorpay_payslip_records.additions_detail` | `RazorpayPayslipsSection` detail dialog → Additions chips |
| `additions → <label> → amount` | `payroll:view-payroll` | JSON leaf of `additions_detail` | Additions chip amount |
| `additions → <label> → name` | `payroll:view-payroll` | JSON leaf | Additions chip label |
| `additions → <label> → percentage` | `payroll:view-payroll` | JSON leaf | — (not rendered) |
| `additions → <label> → taxable` | `payroll:view-payroll` | JSON leaf | "Taxable" / "Non-taxable" chip suffix |
| `additions → <label> → type` | `payroll:view-payroll` | JSON leaf | Bonus / Reimbursement / Arrear label |
| `arrears` (scalar) | `payroll:view-payroll` | `source_payload` only | — |
| `change-request-id` | `payroll:view-payroll` | `source_payload` only | — |
| `deductible-benefits-amount` | `payroll:view-payroll` | `source_payload` only | — |
| `deductible_benefits` (array) | `payroll:view-payroll` | `source_payload` only | — |
| `deduction-amount` | `payroll:view-payroll` | `hr_razorpay_payslip_records.deduction_amount` + `total_deductions` | Mobile card & desktop row "Deductions" |
| `deductions` (map) | `payroll:view-payroll` | Flattened into `source_payload`; sum → `total_deductions` | Detail dialog "Component Breakdown" |
| `deductions → Loss of Pay → amount` | `payroll:view-payroll` | JSON leaf | Component breakdown row (via `flattenBreakdown`) |
| `deductions → Loss of Pay → deductFrom` | `payroll:view-payroll` | JSON leaf | — |
| `deductions → Loss of Pay → isProRated` | `payroll:view-payroll` | JSON leaf | — |
| `deductions → Loss of Pay → label` | `payroll:view-payroll` | JSON leaf | — |
| `deductions → Loss of Pay → lopDays` | `payroll:view-payroll` | JSON leaf | — (roadmap: expose in card) |
| `deductions → Loss of Pay → name` | `payroll:view-payroll` | JSON leaf | Component breakdown row key |
| `deductions → Loss of Pay → showInEarnings` | `payroll:view-payroll` | JSON leaf | — |
| `deductions → Loss of Pay → taxable` | `payroll:view-payroll` | JSON leaf | — |
| `deductions → Loss of Pay → type` | `payroll:view-payroll` | JSON leaf | — |
| `do-not-pay` | `payroll:view-payroll` | `hr_razorpay_payslip_records.do_not_pay` | Mobile card & desktop row "Paused" badge |
| `employee-id` (integer) | `payroll:view-payroll` | `hr_razorpay_payslip_records.razorpay_employee_id` (as string) | — |
| `employee-name` | `payroll:view-payroll` | `hr_razorpay_payslip_records.employee_name_snapshot` | Fallback name in detail dialog title |
| `esi` / `esi-amount` | `payroll:view-payroll` (documented; **never observed** in our tenant) | `esi_amount` | Detail dialog "ESI" card (shows `—` today) |
| `net-pay` / `net_pay` / `payable` | `payroll:view-payroll` (documented); computed fallback for us | `hr_razorpay_payslip_records.net_pay` | Mobile card & desktop row "Net Pay" |
| `pf` / `pf-amount` | `payroll:view-payroll` (documented; **never observed** in our tenant) | `pf_amount` | Detail dialog "PF" card (shows `—`) |
| `professional-tax` / `pt` | `payroll:view-payroll` (documented; **never observed** in our tenant) | `professional_tax` | Detail dialog "Professional Tax" card |
| `payroll-month` | `payroll:view-payroll` | `hr_razorpay_payslip_records.period_month` | Card / row month header |
| `payslip-id` / `payroll-id` | `payroll:view-payroll` (**never observed**) | `razorpay_payslip_id` (synthetic fallback `${rpId}-${month}`) | — |
| `pdf-url` / `download-url` | `payroll:view-payroll` (**never observed**) | `pdf_url` (always null) | `FileText` icon suppressed |
| `remarks` | `payroll:view-payroll` | `source_payload` only | — |
| `salary` | `payroll:view-payroll` (aliased) | Derived: `gross_earnings` and `opfinSalary.monthly_gross` | Desktop row "Gross" |
| `tds` / `tds-amount` / `income-tax` | `payroll:view-payroll` (documented; **never observed**) | `tds_amount` | Detail dialog "TDS" card |

---

## 1. `POST /api/payroll` — `payroll:view-payroll`

**Called from:**
- `opfinSalary(...)` — proxy lines 175–222 (drives Onboarding CTC prefill and
  "Pull from RazorpayX" on the employee profile).
- `pullPayrollViewForPeriod(...)` — proxy lines 353–460 (drives the payslip
  history ingest and daily auto-sync).
- The generic dispatch table at lines 4913 & 5033 (raw one-off calls).

**Request wire shape:**
```json
{
  "auth":    { "id": "<opfin id>", "key": "<opfin key>" },
  "request": { "type": "payroll", "sub-type": "view-payroll" },
  "data":    { "email": "<employee email>", "payroll-month": "YYYY-MM" }
}
```

**Response shape observed for our tenant** (all 93 rows in
`hr_razorpay_payslip_records.source_payload -> 'response'` share these top-level
keys):

| Field path | Kind | Returned by tenant | Parsed by proxy at | Persisted to | Rendered in UI at | Notes |
|---|---|---|---|---|---|---|
| `additions` | `map` or `null` | Yes (null when no bonus/reimb/arrear that month) | `extractPayrollViewFigures` — index.ts:324 | `hr_razorpay_payslip_records.additions_detail` (jsonb) | `RazorpayPayslipsSection.tsx` — Additions chip row (lines 281–301) | Null-safe check in proxy |
| `additions → <label>` | `map` | Yes (when any) | Iterated in UI, not proxy | JSON leaf | Chip per addition | `<label>` is the RazorpayX config key (`Overtime`, `Performance Bonus`, …) |
| `additions → <label> → amount` | `scalar` | Yes | `RazorpayPayslipsSection.tsx:289` | JSON leaf | Chip amount | Rupees, integer |
| `additions → <label> → name` | `string` | Yes | UI only | JSON leaf | Chip title | Same as parent key in every observed row |
| `additions → <label> → percentage` | `scalar or null` | Yes (always null in our tenant) | — | JSON leaf | — | RazorpayX allows % additions; we don't use them |
| `additions → <label> → taxable` | `bool` (0/1) | Yes | `RazorpayPayslipsSection.tsx:288` | JSON leaf | "Taxable" / "Non-taxable" suffix on chip | |
| `additions → <label> → type` | `enum 0/1/2` | Yes | `RazorpayPayslipsSection.tsx:286-287` | JSON leaf | `0`→Bonus, `1`→Reimbursement, `2`→Arrear | |
| `arrears` | `scalar` | Yes (always `0` in our tenant) | — | `source_payload` only | — | Distinct from `additions.type=2` arrear |
| `change-request-id` | `string or null` | Yes (always null in our tenant) | — | `source_payload` only | — | Would identify a mid-month change if any |
| `deductible-benefits-amount` | `scalar` | Yes (always `0`) | — | `source_payload` only | — | For NPS / VPF style benefits — never configured for us |
| `deductible_benefits` | `array` (underscore not dash) | Yes (always `[]`) | — | `source_payload` only | — | Note the snake_case break from Opfin's usual dashed style |
| `deduction-amount` | `scalar` | Yes | `extractPayrollViewFigures` — index.ts:298–308 (`deductionExplicit`) | `deduction_amount` and used as `total_deductions` when explicit map absent | Mobile card & desktop row "Deductions" | Only scalar exposed — no PF/ESI/PT split within it |
| `deductions` | `map or []` | Yes | Summed via `sumMoneyLeaves` — index.ts:271–289 | Flattened into `source_payload`; sum reused when `deduction-amount` is missing | Detail dialog "Component Breakdown" via `flattenBreakdown` (line 25–43) | Empty array on employees with no deductions this month |
| `deductions → Loss of Pay` | `map` | Yes (only when LOP > 0) | Traversed by `flattenBreakdown` | JSON leaf | Component breakdown table row | Only deduction key ever observed in our tenant |
| `deductions → Loss of Pay → amount` | `scalar` | Yes | `flattenBreakdown` picks numeric leaves | JSON leaf | Component breakdown "amount" column | |
| `deductions → Loss of Pay → deductFrom` | `enum` | Yes (`1`) | — | JSON leaf | — | `1` = deduct from Basic, per Opfin dashboard convention (unverified) |
| `deductions → Loss of Pay → isProRated` | `bool` | Yes | — | JSON leaf | — | |
| `deductions → Loss of Pay → label` | `string` | Yes | — | JSON leaf | — | Same as `name` in every observed row |
| `deductions → Loss of Pay → lopDays` | `scalar` | Yes | — | JSON leaf | — (roadmap candidate: card badge) | Integer count of LOP days used to compute the amount |
| `deductions → Loss of Pay → name` | `string` | Yes | `flattenBreakdown` key | JSON leaf | Breakdown row key | |
| `deductions → Loss of Pay → showInEarnings` | `bool` | Yes | — | JSON leaf | — | UI hint for RazorpayX dashboard only |
| `deductions → Loss of Pay → taxable` | `bool` | Yes | — | JSON leaf | — | |
| `deductions → Loss of Pay → type` | `enum` | Yes (`2`) | — | JSON leaf | — | `2` = statutory-style deduction |
| `do-not-pay` | `bool` | Yes | `extractPayrollViewFigures` — index.ts:326 | `do_not_pay` | "Paused" badge on card/row (`RazorpayPayslipsSection.tsx:127,189`) | Also flips card action menu behaviour |
| `employee-id` | `integer` | Yes | Not re-read (we already keyed the request by it) | `razorpay_employee_id` (as string) | — | |
| `employee-name` | `string` | Yes | `extractPayrollViewFigures` — index.ts:327 | `employee_name_snapshot` | Fallback title in detail dialog | Trailing `*` seen in dashboard export is not present here |
| `payroll-month` | `string YYYY-MM` | Yes | Echoed back — proxy reads from request instead | `period_month` (stored as `YYYY-MM-01`) | Card / row header via `IN_MONTH()` | |
| `remarks` | `string` | Yes (usually `""`) | — | `source_payload` only | — | Free-text remark from the RazorpayX operator |
| `salary` | `scalar` | Yes | `readNum(body, ['salary'])` — index.ts:207; also matched by `pickDeepMoney` as `gross_salary` alias — index.ts:292–294 | Treated as `monthly_gross` in `opfinSalary`; used as `gross_earnings` fallback via `pickDeepMoney` when `gross-earnings` is absent (it always is) | Desktop row "Gross"; Onboarding CTC prefill (annualised ×12); Employee profile "Pull from RazorpayX" button | The only reliable earnings scalar. |
| `net-pay` / `net_pay` / `payable` | `scalar` | **Never observed** in our tenant | `extractPayrollViewFigures` — index.ts:311–313 | Computed fallback `gross − deductions` written to `net_pay` | Mobile card & desktop row "Net Pay" | Because upstream never emits it, our persisted `net_pay` is always our own subtraction |
| `total-earnings` / `gross-earnings` | `scalar` | **Never observed** | `extractPayrollViewFigures` — index.ts:309–310 | Falls back to `salary + additions` → `gross_earnings` | Mobile card "Gross" | |
| `tds` / `tds-amount` / `income-tax` | `scalar` | **Never observed** | `extractPayrollViewFigures` — index.ts:314 | `tds_amount` (always null) | Detail dialog "TDS" card (renders `—`) | Confirmed absent even on TDS-liable senior employees |
| `pf` / `pf-amount` / `provident-fund` / `employer-pf` / `employee-pf` | `scalar` | **Never observed** | `extractPayrollViewFigures` — index.ts:321 | `pf_amount` (null) | Detail dialog "PF" card (renders `—`) | See "Confirmed API blind spots" — no split anywhere |
| `esi` / `esi-amount` / `employer-esi` / `employee-esi` | `scalar` | **Never observed** | `extractPayrollViewFigures` — index.ts:322 | `esi_amount` (null) | Detail dialog "ESI" card (renders `—`) | |
| `pt` / `professional-tax` / `prof-tax` | `scalar` | **Never observed** | `extractPayrollViewFigures` — index.ts:323 | `professional_tax` (null) | Detail dialog "Professional Tax" card | |
| `pdf-url` / `pdf_url` / `download-url` / `download_url` / `url` / `payslip_url` | `string` | **Never observed** | `extractPayrollViewFigures` — index.ts:315–318 | `pdf_url` (always null) | `FileText` icon conditional at `RazorpayPayslipsSection.tsx:132,202` (never shown) | Payslip PDFs are dashboard-only |
| `payslip-id` / `payslip_id` / `id` / `payroll-id` / `payroll_id` | `string` | **Never observed** | `extractPayrollViewFigures` — index.ts:319 | `razorpay_payslip_id` (synthetic `<rpId>-<YYYY-MM>` fallback — index.ts:428) | — | Every row therefore has our own synthetic id, not an upstream one |

**Fields we send but the API ignores:** none — only `email` and `payroll-month`
are ever accepted; `employee-id` is intentionally not sent because Opfin ignores
it here.

**Gaps versus the CSV Salary Register** (`BLYNK-...salary_register-YYYY-MM-DD.csv`):

- Every statutory column in the CSV (`ESI(EE)`, `ESI(ER)`, `PF(EE)`, `PF(ER)`,
  `PT`, `TDS`, `Employer ESI Contr.`, `Employer PF Contr.`) is absent from the
  API response.
- `Basic Salary`, `DA`, `HRA`, `SA`, `LTA`, `Employee Engagement`, `Legal fees`
  columns are absent — no earnings-side breakdown at all beyond `additions`.
- `Advance Salary`, `Loan Emi`, `One-time Payments` are absent — recovery
  breakdown is folded into the single `deduction-amount` scalar (never split).
- `Working Days` and `Relieving Date` are absent — attendance context lives in
  `attendance:fetch`, which is out of scope for this document.

---

## 2. `POST /api/payroll` — `payroll:run` (compute a run)

**Called from:** `apply_payroll_pilot` / `apply_payroll_bulk` — proxy lines
3253–3315. This is the WRITE that pushes computed lines to RazorpayX for a given
`period_month`.

**Request wire shape (per employee):**
```json
{
  "auth":    { ... },
  "request": { "type": "payroll", "sub-type": "run" },
  "data": {
    "employee-id":       <int>,
    "employee-type":     "employee",
    "period":            "YYYY-MM-01",
    "gross-earnings":    <number>,
    "lop-amount":        <number>,
    "other-deductions":  <number>,
    "loan-emi":          <number>,
    "net-pay":           <number>
  }
}
```

**Response fields observed:** RazorpayX returns a bare success envelope only.
The proxy captures whatever came back into `bodyOut` (index.ts:3282) and stores
it in `hr_razorpay_payroll_run_lines.push_response` (jsonb). We do not depend on
any specific response field beyond HTTP status.

| Field path | Kind | Returned by tenant | Parsed by proxy at | Persisted to | Rendered in UI at | Notes |
|---|---|---|---|---|---|---|
| `<HTTP 200 body>` | opaque | Sometimes `{ }`, sometimes `{ "status": "ok" }` — inconsistent | Written verbatim | `hr_razorpay_payroll_run_lines.push_response` | RazorpaySync roadmap "Applied" chip | Only used for forensics |
| `error` / `message` | `string` | On failure | `bodyOut.error || bodyOut.message` — index.ts:3283 | Same jsonb; also written to `hr_razorpay_sync_log.error_text` | Sync log viewer | Drives failed-row retry UX |

**Gaps:** No confirmation payslip is returned; you must call `payroll:view-payroll`
after executing to see the final numbers. There is no `payroll-id`, no
`payslip-id`, and no PDF.

---

## 3. `POST /api/payroll` — `payroll:add-additions`

**Called from:** direct dispatch `payroll_add_additions` — proxy line 4914 /
5033. Used by the Payroll Adjustments hub in HRMS to inject a bonus,
reimbursement, or arrear into a live RazorpayX run.

**Request wire shape:**
```json
{
  "auth": { ... },
  "request": { "type": "payroll", "sub-type": "add-additions" },
  "data": {
    "employee-id":    <int>,
    "employee-type":  "employee",
    "payroll-month":  "YYYY-MM",
    "additions": {
      "<label>": { "name": "<label>", "amount": <int>, "type": 0|1|2, "taxable": 0|1 }
    }
  }
}
```

**Response fields:** unwrapped acknowledgement only.

| Field path | Kind | Returned by tenant | Parsed by proxy at | Persisted to | Rendered in UI at | Notes |
|---|---|---|---|---|---|---|
| `<HTTP 200 body>` | opaque | Not observed to be structured | index.ts:5066 (`bodyOut`) | `hr_razorpay_sync_log.field_diff_summary` | RazorpaySync log viewer | We rely on HTTP status |
| `error` / `message` | `string` | On failure | index.ts:5067 | `hr_razorpay_sync_log.error_text` | Same viewer | |

**Gaps:** No returned "new additions row id", so we cannot correlate a delete-later
call to a specific addition — subsequent removal must use `payroll:reset-modifications`.

---

## 4. `POST /api/payroll` — `payroll:add-deduction`

**Called from:** direct dispatch `payroll_add_deduction` — proxy line 4915.

**Request wire shape:** identical to `add-additions` but body key is
`deductions` and the map value is `{ name, amount, type, taxable, deductFrom }`.

**Response:** same as `add-additions` — HTTP 200 opaque body; failure body carries
`error`/`message`. Nothing surfaces to the UI beyond a success toast.

---

## 5. `POST /api/payroll` — `payroll:reset-modifications`

**Called from:** direct dispatch `payroll_reset_modifications` — proxy line 4916.
Zeroes every operator-injected addition/deduction for one (employee, month).

**Request data:** `{ "employee-id", "employee-type", "payroll-month" }`.

**Response fields:** opaque acknowledgement, same shape as items 3/4.

---

## 6. `POST /api/payroll` — `payroll:do-not-pay`

**Called from:** direct dispatch `payroll_do_not_pay` — proxy line 4917.
Also toggled by the "Paused" UI in `RazorpayPayslipsSection.tsx` when HR
requests a skip for one month.

**Request data:** `{ "employee-id", "employee-type", "payroll-month", "do-not-pay": true|false }`.

**Response fields:** opaque acknowledgement. On the very next `view-payroll`
call the `do-not-pay` boolean flips server-side, which is how we surface the
"Paused" badge — see item 1 field `do-not-pay`.

---

## 7. `POST /api/people` — `people:set-salary` (salary structure write)

**Called from:** `push_salary_apply_one` / `push_salary_apply_bulk` — proxy lines
2201–2276.

**Request wire shape:**
```json
{
  "auth": { ... },
  "request": { "type": "people", "sub-type": "set-salary" },
  "data": {
    "employee-id":   <int>,
    "employee-type": "employee",
    "salary": {
      "ctc-annual":  <number>,
      "components":  [ { "code", "name", "type", "amount" }, ... ]
    }
  }
}
```

**Response fields observed:** opaque acknowledgement. The subsequent `people:view`
snapshot (see item 8) is the read-side confirmation.

| Field path | Kind | Returned by tenant | Parsed by proxy at | Persisted to | Rendered in UI at | Notes |
|---|---|---|---|---|---|---|
| `<HTTP 200 body>` | opaque | Yes (small `{ }`) | Not read | — | — | We only care about HTTP status |
| `error` / `message` | `string` | On failure | index.ts:2233 | `hr_razorpay_sync_log.error_text` | RazorpaySync roadmap Stage-5 error banner | Common failures: "employee not found", "salary structure invalid" |

**Fields we send but Opfin silently ignores:**
- `components[].code` — RazorpayX matches by `name`, not our internal code.
- `components[].type` — Opfin infers type from its own component catalogue.

**Gaps:** The write does not return the new salary structure. To confirm, the
next daily `pull_person_full` (people:view) reads it back.

---

## 8. `POST /api/people` — `people:view` (salary block only)

**Called from:** `pull_person_full` — proxy line 1461+. Only the salary sub-tree
of the response is relevant to this audit; the full people:view fields (profile,
address, KYC, bank) are covered in `docs/RAZORPAY_ENDPOINT_MATRIX.md`.

**Salary block observed inside `hr_razorpay_employee_map.last_pull_snapshot`:**

| Field path | Kind | Returned by tenant | Parsed by proxy at | Persisted to | Rendered in UI at | Notes |
|---|---|---|---|---|---|---|
| `salary` (or `salary-structure` / `salary_structure`) | `map` | Yes | `normalizeSnapshot` — index.ts:2124–2132 | JSON leaf of `last_pull_snapshot` | RazorpaySync "salary diff" table (dry-run rows) | Key varies across tenants — proxy handles all three variants |
| `salary → ctc-annual` | `scalar` | Yes | `pickDeepMoney` reused with `salary` alias — index.ts:207 | `opfinSalary.annual_ctc` (÷12 → monthly_gross) | Employee profile "Annual CTC" and Onboarding Stage-5 prefill | Only reliable annual figure |
| `salary → monthly-salary` / `monthly_salary` | `scalar` | Sometimes | `pickDeepMoney` — index.ts:292 | `opfinSalary.monthly_gross` | Employee profile "Monthly Gross" | Falls back to `ctc-annual/12` if absent |
| `salary → components` | `array` | Structured-only | JSON-stringified into `rpSig` at index.ts:2160 for diff | `last_pull_snapshot` blob | RazorpaySync roadmap dry-run detail | Absent on flat-CTC employees |
| `salary → components[] → code` | `string` | Structured-only | UI | JSON leaf | Diff table row | |
| `salary → components[] → name` | `string` | Structured-only | UI | JSON leaf | Diff table row | |
| `salary → components[] → type` | `string` | Structured-only | UI | JSON leaf | Diff table row | e.g. `earning`, `deduction` |
| `salary → components[] → amount` | `scalar` | Structured-only | UI | JSON leaf | Diff table row | |

**Gaps:** No employer-contribution list, no PF/ESI opt-in flags, no tax-regime
indicator. Those live in the `settings` sub-tree of `people:view`, which is
out of this doc's scope.

---

## 9. `POST /api/advanceSalary` — `advance-salary:create`

**Called from:** direct dispatch `advance_salary_create` — proxy line 4922. Not
yet wired into the HRMS UI (deferred in the Razorpay commissioning doc); the
proxy path exists so the Advance Salary workflow can ship without another proxy
release.

**Request wire shape:**
```json
{
  "auth": { ... },
  "request": { "type": "advance-salary", "sub-type": "create" },
  "data": {
    "employee-id":     <int>,
    "amount":          <number>,
    "payment-date":    "YYYY-MM-DD",
    "recovery-months": <int>
  }
}
```

**Response fields:** unstructured acknowledgement — we log only the HTTP body via
`bodyOut` (index.ts:5066) and `error_text` on failure.

**Gaps:** No `advance-id` returned. To reconcile the advance against future
payslip deductions we depend on our own `hr_loans` table (`razorpay_advance_id`
column exists but is unpopulated — see `.lovable/plan.md` deferred queue).

---

## 10. `POST /api/contractorPayment` — `contractor-payment:list-pending`

**Called from:** direct dispatch `contractor_payment_list` — proxy line 4920.
Read-only. Powers the "Pending contractor payments" panel in RazorpaySync.

**Response fields:** the response is stored verbatim in
`hr_razorpay_contractor_payments.source_payload`. Observed leaves:

| Field path | Kind | Returned by tenant | Parsed by proxy at | Persisted to | Rendered in UI at | Notes |
|---|---|---|---|---|---|---|
| `contractor-payments[]` | `array` | Yes | Iterated by RazorpaySync frontend | `hr_razorpay_contractor_payments` rows | Contractor payments list | |
| `contractor-payments[] → id` | `string` | Yes | UI | `contractor_payment_id` | List row key | Used to correlate `get-status` |
| `contractor-payments[] → contractor-name` | `string` | Yes | UI | `contractor_name` | List row primary | |
| `contractor-payments[] → contractor-id` | `string` | Yes | UI | `contractor_id` | — | Foreign key into the people/contractor table (people:view of contractor) |
| `contractor-payments[] → amount` | `scalar` | Yes | UI | `amount` | List row secondary | |
| `contractor-payments[] → status` | `enum` | Yes | UI | `status` | List row badge | Values seen: `pending`, `processed`, `failed` |
| `contractor-payments[] → payment-date` | `string YYYY-MM-DD` | Yes | UI | `payment_date` | List row date | |
| `contractor-payments[] → invoice-number` | `string` | Sometimes | UI | `invoice_number` | List row | Absent when contractor did not attach an invoice |
| `contractor-payments[] → tds` | `scalar` | Sometimes | UI | `tds_amount` | List row TDS chip | Present only when the contractor is TDS-liable |

---

## 11. `POST /api/contractorPayment` — `contractor-payment:get-status`

**Called from:** direct dispatch `contractor_payment_status` — proxy line 4921.

**Request:** `{ "contractor-payment-id": "<id>" }`.

**Response fields:**

| Field path | Kind | Returned by tenant | Persisted to | Rendered in UI at |
|---|---|---|---|---|
| `status` | `enum` | Yes | Refresh only — updates `hr_razorpay_contractor_payments.status` | Row badge |
| `paid-on` | `string YYYY-MM-DD` | Yes when `status='processed'` | `paid_on` | Row "Paid on" caption |
| `failure-reason` | `string` | Yes when `status='failed'` | `failure_reason` | Row error inline |

---

## 12. `POST /api/contractorPayment` — `contractor-payment:create`

**Called from:** direct dispatch `contractor_payment_create` — proxy line 4918.

**Request:** `{ "contractor-id", "amount", "payment-date", "invoice-number", "tds" }`.

**Response fields observed:**

| Field path | Kind | Returned by tenant | Persisted to | Rendered in UI at |
|---|---|---|---|---|
| `contractor-payment-id` | `string` | Yes | `hr_razorpay_contractor_payments.contractor_payment_id` | List row key |
| `status` | `enum` | Yes (`pending` on create) | `status` | List row badge |

**Gaps:** No payout-instrument details returned (bank ref, UTR, etc.) — those
only appear once the payment reaches `status='processed'` via `get-status`.

---

## 13. `POST /api/contractorPayment` — `contractor-payment:delete`

**Called from:** direct dispatch `contractor_payment_delete` — proxy line 4919.

**Request:** `{ "contractor-payment-id" }`.

**Response fields:** opaque acknowledgement (`{ }` on success). No payload
consumed by the HRMS beyond HTTP status.

---

## 14. Our-side only — `recall_payroll_period` (no live Razorpay call)

**Called from:** proxy lines 2907–2953. This one is not an upstream RazorpayX
endpoint; it is an ERP-side status transition that reopens a locked payroll
month for re-push. There is no Razorpay response to audit — however, downstream
`payroll:run` calls after a recall become allowed and their response fields are
already covered in item 2.

Included here so the doc mirrors the RazorpaySync "Recall" UI action; if you
were expecting a matching upstream endpoint, there isn't one.

---

## Change history

- **2026-07-19** — Initial audit. Field observations sourced from the 93 rows
  currently in `hr_razorpay_payslip_records` (May–July 2026 payroll) plus the
  `hr_razorpay_employee_map.last_pull_snapshot` blobs from the daily
  `pull_person_full` sweep. Confirmed the eight blind-spot fields (PF/ESI/PT/TDS
  splits, PDF URL, payslip-id, employer-contributions, total-earnings) remain
  absent for every observed row.
