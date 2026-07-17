# Create Razorpay Employee from ERP

## Goal
On finalize (Stage 5), optionally create the employee in RazorpayX Payroll in one shot — no more "match to existing Razorpay employee" round trip. On success, wire the new Razorpay ID into `hr_razorpay_employee_map` so future payroll runs pick them up automatically.

## User flow

1. HR opens Stage 5 for a pending onboarding.
2. A new toggle appears: **"Also create in RazorpayX Payroll"** (default OFF; hidden if this record is already Razorpay-linked).
3. When ON, an inline checklist shows the fields Razorpay requires and their current state (green tick / red gap):
   - PAN (from Stage 3 KYC) — mandatory
   - Full name, email, phone, gender, DOB
   - Date of Joining
   - Department, Designation
   - CTC (annual)
   - Bank account number + IFSC + account holder name
4. If any red-gap exists, the toggle is disabled with a "Fix these fields first" hint that deep-links back to the relevant stage.
5. On **Finalize & Create Employee**:
   - ERP employee is created as today.
   - If the toggle is ON, a new `create_person` proxy action fires; on success the returned Razorpay employee id + PAN is stored in `hr_razorpay_employee_map` (linked to the new `hr_employee_id`).
   - Success toast shows the Razorpay ID; a small badge appears on the employee profile: **"Razorpay: Pending penny-drop"**.

## Technical details

### 1. New edge-function action — `razorpay-payroll-proxy` : `create_person`
- Input: `{ hr_employee_id, dry_run? }`.
- Reads from ERP: `hr_employees`, `hr_employee_work_info`, `hr_employee_bank_details`, `client_kyc_documents` (for PAN via linked user), `hr_employee_salary_structures` (for CTC).
- Validates all mandatory fields server-side; returns `{ ok: false, missing: [...] }` on gaps (no Razorpay call).
- Calls Razorpay: `POST {BASE}/people` with
  ```json
  {
    "auth": { ... },
    "request": { "type": "people", "sub-type": "add" },
    "data": {
      "employee-type": "employee",
      "name": "...",
      "email": "...",
      "phone_number": "...",
      "gender": "...",
      "date-of-birth": "dd/mm/yyyy",
      "date-of-joining": "dd/mm/yyyy",
      "department": "...",
      "title": "...",
      "pan": "...",
      "annual_ctc": <int paise or rupee per Razorpay contract>,
      "bank_account_number": "...",
      "bank_ifsc": "...",
      "bank_account_holder_name": "..."
    }
  }
  ```
- On 2xx: inserts into `hr_razorpay_employee_map` `{ razorpay_employee_id, hr_employee_id, is_pilot_verified: false, last_pull_snapshot: <the request payload as baseline> }` — writing the baseline immediately unlocks future `push_person` diffs.
- Logs to `hr_razorpay_sync_log` with action `create_person` (http_status, error_text, field snapshot).
- Errors from Razorpay (dup PAN, invalid IFSC, penny-drop pre-check) surface verbatim to the toast.

### 2. UI — `Stage5Finalization.tsx`
- Add local state `createInRazorpay` (bool).
- New component `RazorpayCreateChecklist` that computes gaps in real time from the same form state + existing bank query + KYC docs (fetched via a new `useOnboardingPan` hook that reads `client_kyc_documents` for the linked user, or the PAN captured in Stage 3).
- Toggle disabled + reason if `linkedEmpId` already has a `hr_razorpay_employee_map` row.
- In `handleFinalize` (after the employee is created and bank details persist): if toggle ON, call the new action with the freshly created `hr_employee_id`; show progress + toast; ignore Razorpay failure silently for the ERP finalize path (employee is still created).

### 3. Schema
No new tables. `hr_razorpay_employee_map` already has the columns we need. Confirm the migration is inserted by the edge function (already used elsewhere), no client-side insert.

### 4. Permissions
- Reuse `hrms_razorpay_sync` — the same permission that gates `push_person`.

### 5. PAN capture gate
- Stage 3 already stores KYC documents but PAN number is text-optional. Add a small **PAN number** text input in Stage 3 (already exists as `pan_number`? verify) that persists on the onboarding row so the create-person path can read it deterministically.

## Files touched
- `supabase/functions/razorpay-payroll-proxy/index.ts` — new `create_person` action (~120 LOC).
- `src/components/hrms/onboarding-pipeline/Stage5Finalization.tsx` — toggle + checklist + wire-up.
- `src/components/hrms/onboarding-pipeline/Stage3Documents.tsx` — ensure PAN text field is present and persisted (small addition if missing).
- New: `src/components/hrms/onboarding-pipeline/RazorpayCreateChecklist.tsx`.

## Out of scope (future)
- Bulk "backfill missing Razorpay employees" from HR employees list.
- Post-create penny-drop status polling badge on the profile (can piggyback on existing `pull_person_full`).
- Auto-pushing CTC revisions after create (already handled by existing `push_salary_*` actions).
