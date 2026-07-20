## What changes

Pivot Stage 5 Finalization away from "reserve an ID and force-create in Razorpay" and align with how RazorpayX actually works: Razorpay only issues an Employee ID after the employee completes self-registration. You will paste that ID into Stage 5, and the ERP uses it as the single unified ID everywhere (HRMS badge_id + ESSL PIN + Razorpay employee_id).

## Stage 5 UI rework (`Stage5Finalization.tsx`)

Replace the reserved-ID banner with a two-mode picker at the top of the card:

1. **Waiting for Razorpay Employee ID** (default for fresh drafts)
   - Explains: "RazorpayX only issues an Employee ID after the new hire completes self-registration on their invite. Save the draft here — no HRMS employee, no ESSL PIN, no ERP account is created yet."
   - Only **Save Draft** and **Back** are enabled. Finalize is disabled with a tooltip explaining why.
   - `essl_badge_id` field is disabled with helper text: "Locked until Razorpay Employee ID is entered."

2. **Razorpay Employee ID received** (operator toggles / enters the number)
   - Input for the numeric Razorpay Employee ID (validated: digits only, non-empty).
   - Auto-fills `essl_badge_id` with that same value and disables manual edit — enforces the unified-ID doctrine.
   - Optional "Verify with Razorpay" button that calls the proxy to confirm the ID exists and pull `first_name/last_name/email/status` for a diff preview. Shows green tick on match, red warning on mismatch.
   - Only then does **Finalize & Create Employee** become enabled.

Remove:
- The `hr_next_razorpay_employee_id()` reservation call and its status pills.
- The `create_in_razorpay` switch (creation via API is retired; the ID must exist first).
- All "reservation released / recovered" plumbing on this page.

## Wizard finalize flow (`OnboardingWizard.tsx`)

Rewrite `handleFinalize` so it never calls `create_person`:

1. Require `stage5Data.razorpay_employee_id` (numeric). Abort with a clear message if missing.
2. Use that ID as `unifiedId` for:
   - `hr_employees.badge_id`
   - `essl_badge_id` (and the eSSL device push after activation)
   - RazorpayX linkage row in `hr_razorpay_employee_map`
3. Call the proxy with a lightweight `verify_and_link_person` action (see next section) instead of `create_person`. On success, upsert the map row and push identity/bank/salary via existing pushback helpers.
4. Keep the existing ERP-account creation, leave allocations, work info, bank details, and biometric queueing flow.
5. Drop the reserved-ID release paths — nothing to release anymore.

## Proxy (`razorpay-payroll-proxy/index.ts`)

Add one new action, reuse existing code paths for the rest:

- `verify_and_link_person`
  - Input: `{ hr_employee_id, razorpay_employee_id }`.
  - Calls Razorpay `people:fetch` (or the existing recovery lookup) by Employee ID.
  - Returns `{ ok, razorpay_people_id, first_name, last_name, email, status }` or `{ ok:false, error }` if the ID isn't found or is dismissed.
  - Upserts `hr_razorpay_employee_map (hr_employee_id, razorpay_employee_id, razorpay_people_id)`.

Leave the legacy `create_person` / recovery / reservation actions in place (still used by imports and the existing "already exists in Razorpay" repair flow) but stop calling them from onboarding.

## Draft schema

Add two nullable columns to `hr_employee_onboarding` via migration:
- `razorpay_employee_id text` — the operator-entered ID.
- `razorpay_verified_at timestamptz` — set when Verify succeeds.

Both are optional so existing drafts keep working. No RLS/grant changes needed (table already granted).

## Technical notes

- Unified ID stays a plain integer string; no ID generator is called anywhere in the onboarding path anymore. Range-check it against the existing 6-digit ESSL PIN limit and reject if the Razorpay ID exceeds it.
- `hr_next_razorpay_employee_id()` RPC is left in the DB for other callers (import backfill) but removed from Stage 5.
- Finalize keeps the "draft employee row (is_active=false) → activate on full success" pattern so a failed ERP-account step still lets you retry.
- No changes to statutory / salary / bank push helpers — they run after activation as today.

## Out of scope

- Sending the Razorpay invite from ERP (Razorpay dashboard already does this; API path doesn't reliably activate).
- Any automated polling for the newly issued ID — operator enters it manually per your instruction.
