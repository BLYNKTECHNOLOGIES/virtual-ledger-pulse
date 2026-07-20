## Goal
After the operator enters the RazorpayX Employee ID in Stage 5 and clicks **Verify with RazorpayX**, pull the RazorpayX profile and compare it field-by-field with the ERP onboarding record. Show any mismatches inline, block **Finalize** until every field matches (or the operator explicitly overrides each row), and only then allow the unified-ID finalization to proceed.

## Fields to compare
Pulled from RazorpayX `people:read` snapshot vs. `hr_employee_onboarding` row:

| Onboarding field | RazorpayX field |
| --- | --- |
| `first_name` | `first_name` |
| `last_name` | `last_name` |
| `email` | `email` / `personal_email` |
| `phone` | `contact_number` |
| `gender` | `gender` |
| `date_of_birth` | `dob` |
| `date_of_joining` | `hire_date` (dd/mm/yyyy → ISO) |
| `ctc` (annual) | `annual_ctc` |
| `documents.pan.value` | `pan` |
| `documents.uan.value` | `uan_number` |
| `bank_details.account_number` | `bank_account.account_number` |
| `bank_details.ifsc_code` | `bank_account.ifsc` |
| `bank_details.account_holder_name` | `bank_account.name` |

Comparison rules: trim + case-insensitive for names/emails, digit-only for phone/PAN, ISO-date normalize for dates, numeric-equal for CTC (allow paise rounding). Empty on either side → flagged as "missing on <side>" (still blocks unless overridden).

## Changes

### 1. `supabase/functions/razorpay-payroll-proxy/index.ts`
Add (or extend the existing `recover_person_by_id`) so its response always includes the normalized RazorpayX snapshot fields listed above under a stable `snapshot` key. No new endpoint if `recover_person_by_id` already returns the raw people record — just guarantee the fields.

### 2. `src/lib/hrms/razorpayReconcile.ts` (new)
Pure helper:
```ts
type Diff = { field: string; label: string; erp: string; razorpay: string; status: "match" | "mismatch" | "missing_erp" | "missing_rp" };
export function reconcileOnboarding(erp, rpSnapshot, bank): Diff[];
```
Handles the normalization rules above. No I/O.

### 3. `src/components/hrms/onboarding-pipeline/Stage5Finalization.tsx`
- On successful `handleVerifyRazorpayId`, run `reconcileOnboarding` and store `diffs` + a `overrides: Record<field, boolean>` map in state.
- Render a **Data Reconciliation** panel below the verification banner listing every field:
  - Green check for `match`.
  - Amber row for `mismatch` / `missing_*` showing both values side-by-side, with:
    - **Use RazorpayX value** button → writes RazorpayX value back to the onboarding record (via existing `updateForm` / doc-update helpers) and re-runs reconcile.
    - **Keep ERP value & override** checkbox → marks that row as acknowledged without changing data (audit-logged).
- Compute `reconciled = diffs.every(d => d.status === "match" || overrides[d.field])`.
- Disable the **Finalize & Create Employee** button unless `rpVerification?.ok && reconciled`. Tooltip explains why.
- Persist `razorpay_reconciliation` (diffs + overrides + verified_at) into `hr_employee_onboarding.additional_info` so a reload keeps state.

### 4. `src/components/hrms/onboarding-pipeline/OnboardingWizard.tsx`
- In `handleFinalize`, refuse to proceed unless `stage5Data.razorpay_reconciled === true` (mirror check server-side is not needed — this is a UI/audit guard).
- Log a `razorpay_reconciliation_completed` audit row with the diff/override snapshot.

### 5. `hr_employee_onboarding` (migration)
Add nullable JSONB `razorpay_reconciliation` column (diffs + overrides + last_checked_at). Keeps audit intact and survives page reloads.

## Out of scope
- No changes to how RazorpayX itself is edited from Stage 5 (operator still fixes RazorpayX-side data in the RazorpayX dashboard; the "Use RazorpayX value" button only rewrites the ERP draft).
- No changes to eSSL push flow; it still runs after Finalize using the unified ID.
- No new permission gates; whoever can finalize can reconcile.

## Acceptance
- Verifying an ID whose RazorpayX profile matches the ERP draft → all rows green, Finalize enabled.
- Any mismatch → Finalize disabled with a tooltip; each row can be resolved by pulling the RazorpayX value into ERP or by explicit override.
- Reloading Stage 5 mid-reconciliation restores the diff panel and override checks.
- Audit log shows `razorpay_person_verified` + `razorpay_reconciliation_completed` with the final snapshot.
