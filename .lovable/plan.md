# ERP Full System Audit — Phase 21 Report

## Phases 1-20 Status (completed)

All previous phases complete: data integrity, orphaned code, permissions, XSS, dead code, console.log cleanup (client+edge), confirm() dialogs, manual purchase RPC rebuild, P&L backfill, useQuery refactors, hard-reload elimination, 'Current User' audit fix, polling standardization (30s), silent catch blocks, OTP system removal, hardcoded backdoor removed, anonymous role policies dropped, payment gateway components refactored, edge function logging cleaned.

---

## CATEGORY A: CRITICAL — Users Table Exposes Password Hashes to Anonymous Users EXEMPT IT AS WE RUN AND GIVE ACESS TO ONLY USER INSIDE ORGANIZATION

### P21-SEC-01: `anon_read_users_for_login` policy leaks bcrypt hashes, emails, phone numbers

**Impact: CRITICAL** — The `users` table has an `anon_read_users_for_login` policy with `USING (true)` for the `{anon}` role. Any unauthenticated request can read **all 19 user rows** including `password_hash` (bcrypt), `email`, `phone`, `username`, and login timestamps.

This is the single most severe vulnerability in the system. An attacker can extract all password hashes and run offline brute-force attacks.

**Fix:** SQL migration to drop this policy:

```sql
DROP POLICY IF EXISTS "anon_read_users_for_login" ON public.users;
```

The login flow uses `validate_user_credentials` RPC (SECURITY DEFINER) which bypasses RLS — it does not need anon SELECT access to the users table.

---

## CATEGORY B: CRITICAL — Storage Buckets Publicly Accessible

### P21-SEC-02: 7 storage buckets allow unauthenticated read/write/delete

**Impact: CRITICAL** — The following buckets have `{public}` role policies with no auth check, meaning anyone on the internet can read, upload, and delete files:


| Bucket                    | Contains                               | Public Operations                     |
| ------------------------- | -------------------------------------- | ------------------------------------- |
| `kyc-documents`           | Aadhar cards, PAN cards, identity docs | SELECT, INSERT, UPDATE, DELETE        |
| `employee-documents`      | Aadhar, PAN, resumes, offer letters    | SELECT, INSERT, UPDATE, DELETE        |
| `internal-chat-files`     | Operator chat files                    | SELECT, INSERT, DELETE                |
| `task-attachments`        | Task files                             | SELECT, INSERT, UPDATE, DELETE (anon) |
| `sales_attachments`       | Payment proofs, transaction bills      | ALL                                   |
| `documents`               | Business documents                     | SELECT, INSERT, UPDATE, DELETE        |
| `investigation-documents` | Compliance investigation docs          | SELECT, INSERT, UPDATE, DELETE        |


**Fix:** SQL migration to:

1. Drop all `{public}` and `{anon}` policies on these buckets
2. Create `{authenticated}` policies for SELECT, INSERT, UPDATE, DELETE with `auth.role() = 'authenticated'` check
3. Set buckets to private where currently public

---

## CATEGORY C: HIGH — WebAuthn Credentials and Pending Registrations Exposed

### P21-SEC-03: `terminal_webauthn_credentials` readable by anonymous users

**Fix:** Drop `anon_read_terminal_webauthn_credentials` policy. Replace with authenticated-only:

```sql
DROP POLICY IF EXISTS "anon_read_terminal_webauthn_credentials" ON public.terminal_webauthn_credentials;
```

### P21-SEC-04: `pending_registrations` password hashes readable by all authenticated users

The `authenticated_all_pending_registrations` policy grants ALL operations to any authenticated user. A low-privilege operator can read pending registration password hashes.

**Fix:** Replace with manager-only access using `is_manager()`.PROPERPERLY CREATE A PERMISSION SYTEM THAT COULD BE GIVEN TO USER AND ADMIN AND SUPER ADMIJN SHALL HAVE IT BY DEFAULT

---

## CATEGORY D: HIGH — 14 Terminal/ERP Tables Readable Without Authentication

### P21-SEC-05: Public-role SELECT policies on operational tables

14 tables have `{public}` role SELECT policies with `USING (true)`:

- `p2p_terminal_roles`, `p2p_terminal_role_permissions`, `p2p_terminal_user_roles`
- `terminal_order_assignments`, `terminal_user_profiles`, `terminal_user_supervisor_mappings`
- `terminal_user_size_range_mappings`, `terminal_user_exchange_mappings`, `terminal_exchange_accounts`
- `terminal_order_size_ranges`, `terminal_wallet_links`
- `role_permissions` (anon)
- `stock_transactions` (public — exposes customer names and trade amounts)

**Fix:** Single migration to drop all these public/anon SELECT policies and replace with `{authenticated}` equivalents.

---

## Summary Table


| #   | ID         | Severity | Action                                                    | Target                                                                              |
| --- | ---------- | -------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | P21-SEC-01 | CRITICAL | Drop anon policy exposing user password hashes            | `users` tableEXEMPT IT AS WE RUN AND GIVE ACESS TO ONLY USER INSIDE ORGANIZATION    |
| 2   | P21-SEC-02 | CRITICAL | Secure 7 storage buckets (drop public policies, add auth) | Storage policiesEXEMPT IT AS WE RUN AND GIVE ACESS TO ONLY USER INSIDE ORGANIZATION |
| 3   | P21-SEC-03 | HIGH     | Drop anon WebAuthn credentials policy                     | `terminal_webauthn_credentials`                                                     |
| 4   | P21-SEC-04 | HIGH     | Restrict pending_registrations to managers only           | `pending_registrations`                                                             |
| 5   | P21-SEC-05 | HIGH     | Replace 14 public SELECT policies with authenticated      | Multiple terminal/ERP tables                                                        |


**Total: 1 critical password hash exposure closed, 7 storage buckets secured, 16 public/anon table policies replaced with authenticated-only access**

### Technical Details

**Why this matters consequentially:** Every prior security fix (backdoor removal, anon role policies) is undermined if the `users` table itself is readable by anonymous users — an attacker can extract all bcrypt hashes and emails without authentication. The storage bucket exposure means KYC identity documents (Aadhar/PAN cards) are downloadable by anyone with the bucket URL.

**Login flow impact:** The `validate_user_credentials` function is `SECURITY DEFINER`, so it bypasses RLS entirely. Removing `anon_read_users_for_login` will NOT break login. The frontend calls the RPC, not a direct table query.

**Storage migration approach:** For each bucket, drop all `{public}` and `{anon}` policies, then create four new policies (SELECT/INSERT/UPDATE/DELETE) scoped to `{authenticated}` with `auth.role() = 'authenticated'`. Buckets will also be set to `public = false` where applicable (except `avatars` which may legitimately need public read).

**Terminal table policies:** All 14 tables currently use `{public}` because the terminal was originally designed for open access. Since the terminal now has its own permission system with `has_terminal_permission()`, the base RLS only needs to gate on `{authenticated}`.