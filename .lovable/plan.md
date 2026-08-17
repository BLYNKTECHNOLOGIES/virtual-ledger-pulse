# Employee self-service onboarding form (no-login link)

At Stage 1 of the onboarding pipeline, HR generates a unique, login-free link for the candidate. The candidate fills in only the details that must come from them, uploads their documents, and submits. The submission flows straight back into that specific onboarding draft, where HR reviews and accepts it.

## Which fields the employee fills (vs. HR)

Employee-supplied (in the public form):

- Identity: first name, last name, date of birth, gender, marital status, number of children, personal mobile, personal email
- Address: full address, city, state, PIN, country
- Emergency contact: name, relationship, phone
- Background: highest qualification, total years of experience, previous employer (optional)
- Statutory: PAN number, Aadhaar number, existing UAN (optional), existing ESIC number (optional), PF account number (optional)
- Bank: account holder name, bank name, account number, re-enter account number, IFSC, branch
- Documents (file upload): PAN card, Aadhaar (front/back, multiple files), passport photo, cancelled cheque / passbook page, educational certificate(s), previous experience / relieving letter (optional)
- Declaration: tick-box confirming details are true, plus typed full name as signature

Stays with HR (never shown on the public form): department, position, job role, shift, employee type, probation end date, CTC and salary template, deposit config, date of joining, badge ID, reporting manager, ERP account/role, offer letter and policy, RazorpayX mapping, training completion date.

## Flow

```text
Stage 1  ──[Generate invite link]──►  unique token URL
            │                          (emailed from hr@blynkex.com)
            ▼
   candidate opens /onboarding/apply/<token>  (no login)
            │  fills details + uploads docs, submits
            ▼
Stage 1 shows "Submission received" ─► HR reviews side-by-side ─► Accept
            │
            └─► fields merged into the onboarding draft + documents attached to Stage 3
```

- One token per onboarding record; link expires after 14 days and becomes single-use once submitted (HR can re-issue).
- The candidate can save a partial draft and return via the same link until they submit.
- Branded with the Blynk wordmark, the same header/footer treatment as HR emails, and the HR signature.

## Review step first

Before any of the wiring to the onboarding draft is built, the public form page and one working sample token are delivered so the form can be reviewed. Implementation of the accept/merge step follows only after approval of the look and field list.

## Technical notes

- New table `public.hr_onboarding_invites`: `onboarding_id`, `token` (random 32-byte URL-safe), `status` (pending/opened/submitted/expired), `expires_at`, `payload` jsonb (candidate draft), `submitted_at`, timestamps. RLS: no anon access at all; all public reads/writes go through edge functions with the service role.
- New public edge functions (`verify_jwt = false`) in `supabase/config.toml`:
  - `onboarding-invite-get` — token → prefilled candidate-visible data + status
  - `onboarding-invite-save` — partial autosave
  - `onboarding-invite-submit` — validates (PAN regex, IFSC, Aadhaar 12-digit, account-number match) and locks the token
  - `onboarding-invite-upload` — signed upload URL into `employee-documents` under `onboarding/<onboarding_id>/self/<field>/…`
  - Rate-limited per token; tokens compared server-side only, never listed.
- New route `/onboarding/apply/:token` registered outside `AuthCheck` in `App.tsx`, rendered by `src/pages/public/OnboardingApplyPage.tsx` (standalone branded layout, mobile-first, no sidebar).
- Stage 1 (`Stage1BasicDetails.tsx`) gains an "Invite candidate" panel: generate/copy/re-issue link, email it via the existing HR mail path, and show submission status.
- On accept, HR-side merge writes name/DOB/gender/marital status/phone/email into the onboarding row, the bank block into `bank_details`, statutory numbers into the documents/statutory payload, and uploaded files into the Stage 3 `documents` jsonb so nothing bypasses HR review.
- Verification: generate a sample token, open the public URL in a browser session with no auth, confirm render, upload, and submit; confirm the row in `hr_onboarding_invites`.
