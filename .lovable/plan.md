## Goal

Add a "Forgot password?" option to the **ERP Staff Login** (`LoginPage.tsx`) only — not the Terminal. A user enters their registered email, receives a 6-digit OTP at the email stored in `public.users`, then enters the OTP plus a new password to reset it.

## Flow

```text
Login page → "Forgot password?" link
   ↓
Step 1: Enter email  → send-erp-password-otp (edge fn)
        - verify email exists in public.users & status ACTIVE
        - generate 6-digit OTP, store hashed + 10-min expiry
        - email OTP via existing app-email infra
   ↓
Step 2: Enter OTP + new password → verify-erp-password-otp (edge fn)
        - validate OTP (match, not expired, attempt-limited)
        - reset password via Supabase admin auth (service role)
        - mark OTP used
   ↓
Success → return to login, sign in with new password
```

## Backend

**New table `public.erp_password_otps`** (migration):
- `id uuid pk`, `user_id uuid`, `email text`, `otp_hash text`, `expires_at timestamptz`, `attempts int default 0`, `used boolean default false`, `created_at timestamptz default now()`.
- RLS enabled with **no anon/authenticated policies** — only the service role (edge functions) touches it. GRANT `ALL` to `service_role` only. This keeps OTPs unreadable from the client.

**New email template** `supabase/functions/_shared/transactional-email-templates/erp-password-otp.tsx` (React Email), registered in `registry.ts`, styled to match the app. Sends the 6-digit code with expiry note.

**New edge function `send-erp-password-otp`** (public, no JWT):
- Looks up email in `public.users` (case-insensitive); requires `status = ACTIVE`.
- Always returns a generic success message (no account enumeration), but only emails when a real active user exists.
- Generates OTP, stores SHA-256 hash + 10-min expiry, invalidates prior unused OTPs for that user, sends via `send-transactional-email` with template `erp-password-otp`.

**New edge function `verify-erp-password-otp`** (public, no JWT):
- Validates email + OTP against the newest unused, non-expired row; increments `attempts`, locks after 5 tries.
- On success: resets the password using the service-role admin client (reusing the proven logic from `admin-reset-password` — direct `updateUserById`, with the email-fallback/create-user path for legacy users), then marks OTP `used` and best-effort syncs the legacy hash RPC.
- Enforces min 8-char password.

`config.toml` will mark both new functions `verify_jwt = false`.

## Frontend

**New component** `src/components/auth/ForgotPasswordDialog.tsx`:
- Two-step dialog (email → OTP + new/confirm password) with show/hide password, resend OTP, inline errors, success toast.
- Calls the two edge functions via `supabase.functions.invoke`.

**Edit `src/components/website/pages/LoginPage.tsx`**:
- Add a "Forgot password?" link under the password field that opens `ForgotPasswordDialog`.

No Terminal files are touched.

## Notes / constraints

- Reuses the existing app-email (transactional) infrastructure already set up for daily reports — no new email provider or secret needed.
- OTPs are hashed at rest, single-use, expiring, and attempt-limited; the table is service-role-only.
- Generic responses prevent email enumeration.
- After reset, `force_password_change` is left untouched (the user is choosing their own password).
