## Goal
Stop trying to force RazorpayX to create a fully active employee from ERP. Align onboarding with what the RazorpayX API actually supports: invite-only creation, then the employee self-completes and RazorpayX assigns the real `employee-id`. ERP then uses that ID as the single canonical ID across RazorpayX + eSSL + HRMS.

## New onboarding flow (Stage 5 Finalization)

Two modes, chosen on the finalization screen:

**Mode A — Invite via RazorpayX (default for brand-new hires)**
1. ERP calls `people:create` with only the fields RazorpayX accepts for invite (name, email, type). No `employee-id`, no salary, no bank, no PAN pushed here.
2. RazorpayX emails the invite. ERP saves the onboarding as `awaiting_razorpay_id` (draft persists, wizard resumable).
3. Employee opens the invite, completes RazorpayX self-registration; RazorpayX assigns the real `employee-id`.
4. Owner comes back to the same onboarding draft, sees a "Enter RazorpayX Employee ID" field on Stage 5, pastes the ID, clicks **Verify & Finalize**.
5. ERP calls `people:fetch` (or `people:edit` probe) to confirm the ID exists and matches the invited email; then:
   - writes `hr_razorpay_employee_map` (hr_employee_id ↔ razorpay_employee_id),
   - stamps the same numeric ID as the ERP badge_id / employee_id and as the eSSL PIN,
   - queues eSSL push (existing `hr-essl-push`) with that PIN,
   - creates the ERP user account (existing `create-erp-user` flow),
   - marks onboarding `completed`.

**Mode B — Employee already exists in RazorpayX**
Owner toggles "Employee already has a RazorpayX ID" on Stage 5, enters the ID directly, clicks Verify & Finalize. Same verify → map → eSSL → ERP-user path as step 5 above. No `people:create` call.

## What gets removed / gated

- Remove the "reserve sequential ID + force-active create + retry loop + Gmail alias fallback + people-id ghost recovery" logic from `Stage5Finalization.tsx` and from `razorpay-payroll-proxy` (`create_person` / recovery branches). Keep it behind a feature flag we can delete later, or delete outright — plan is delete outright.
- Remove `hr_next_razorpay_employee_id()` usage from the wizard (the number no longer comes from us; RazorpayX owns it).
- The current failure banner ("Employee ID 77 could not be attached/verified…") goes away because we never pretend to attach an ID we don't yet have.

## What gets added

- `razorpay-payroll-proxy` action `invite_person`: minimal `people:create` (name, email, type only). Returns `{ ok, invited: true, email }`.
- `razorpay-payroll-proxy` action `verify_person_by_id`: calls `people:fetch` for the supplied `employee-id`, returns the RazorpayX record. Used by Stage 5 verify step. Rejects if email doesn't match the onboarding draft's email (safety net so the owner doesn't paste the wrong ID).
- `razorpay-payroll-proxy` action `finalize_person` (post-verify enrichment): pushes the profile bundle RazorpayX accepts *after* self-registration (department, title, hire_date, PAN, bank, IFSC, salary structure if we already have it). Non-fatal if any field is rejected — logged to `hr_razorpay_pushback_log` and surfaced as a drift alert (existing mechanism), never blocks finalization.
- Onboarding draft schema: add `razorpay_invite_sent_at`, `razorpay_employee_id_entered`, `finalization_mode` ('invite' | 'existing_id'). Wizard resumes into Stage 5 with the entered ID pre-filled.
- Stage 5 UI: two clearly labeled cards ("Invite via RazorpayX" / "Employee already has a RazorpayX ID"), an "Enter RazorpayX Employee ID" input that appears after invite is sent, a **Verify & Finalize** primary button, and a plain-English status line ("Waiting for employee to complete RazorpayX self-registration — come back and enter the ID here once they're done.").

## ID unification rule (unchanged intent, cleaner mechanics)

Once verified, the RazorpayX `employee-id` becomes:
- ERP `hr_employees.badge_id` and `employee_id`,
- eSSL device PIN (via `hr-essl-push`),
- The key in `hr_razorpay_employee_map`.

No sequential reservation on our side. If the owner uses Mode B for an existing employee whose current ERP badge differs, we show a confirm dialog explaining that ERP badge/eSSL PIN will be rekeyed to the RazorpayX ID (existing rekey path).

## Files touched

- `src/components/hrms/onboarding-pipeline/Stage5Finalization.tsx` — new two-mode UI, remove reserve/retry logic, add verify+finalize.
- `src/components/hrms/onboarding-pipeline/OnboardingWizard.tsx` — new draft fields, resume into Stage 5 with saved invite state.
- `supabase/functions/razorpay-payroll-proxy/index.ts` — add `invite_person`, `verify_person_by_id`, `finalize_person`; delete forced-active create, alias fallback, ghost recovery, 45s retry loop.
- `src/lib/razorpayPushback.ts` — no behavior change; enrichment failures continue to log + open drift alerts.
- `hr_onboarding_drafts` (or equivalent) — migration for the three new columns.

## Out of scope (explicit)

- No change to the eSSL push contract, biometric webhook, or ERP user creation flow beyond receiving the canonical ID from the verify step.
- No change to attendance engine v4, payroll, or statutory logic.
- We are not building a webhook listener for RazorpayX "employee activated" events in this pass — verification is owner-driven by pasting the ID. Webhook-driven auto-finalize can be a later enhancement if RazorpayX exposes it.

## One clarification before I build

Once the owner pastes the RazorpayX employee ID, do you want me to **hard-block** finalization if the email on the RazorpayX record doesn't exactly match the onboarding draft's email, or just **warn and let you proceed** (in case the employee registered with a slightly different email casing/alias)? Default in the plan above is hard-block; say the word if you'd rather warn-only.
