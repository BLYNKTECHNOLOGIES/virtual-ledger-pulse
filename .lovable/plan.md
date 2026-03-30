# ERP Full System Audit — Phase 21 Complete

## Phases 1-21 Status (completed)

All previous phases complete: data integrity, orphaned code, permissions, XSS, dead code, console.log cleanup (client+edge), confirm() dialogs, manual purchase RPC rebuild, P&L backfill, useQuery refactors, hard-reload elimination, 'Current User' audit fix, polling standardization (30s), silent catch blocks, OTP system removal, hardcoded backdoor removed, anonymous role policies dropped, payment gateway useQuery refactors, edge function logging cleaned, RLS security hardening (Phase 21).

---

## Phase 21 Results

### P21-SEC-01: EXEMPTED (users table anon policy) — per user decision
### P21-SEC-02: EXEMPTED (storage bucket policies) — per user decision

### P21-SEC-03: ✅ Dropped `anon_read_terminal_webauthn_credentials` policy
- WebAuthn credentials now only accessible to authenticated users via existing `authenticated_all_terminal_webauthn_credentials` policy

### P21-SEC-04: ✅ Restricted `pending_registrations` to managers only
- Replaced open `authenticated_all_pending_registrations` (ALL to any authenticated user) with `manage_pending_registrations` gated by `is_manager(auth.uid())`
- Super Admin, Admin, COO roles have access; operators and lower ranks cannot read pending registration password hashes

### P21-SEC-05: ✅ Dropped 13 public/anon SELECT policies, added 4 authenticated replacements
Dropped public policies on:
- `p2p_terminal_roles`, `p2p_terminal_role_permissions`, `p2p_terminal_user_roles`
- `terminal_order_assignments`, `terminal_user_profiles`, `terminal_user_supervisor_mappings`
- `terminal_user_size_range_mappings`, `terminal_user_exchange_mappings`, `terminal_exchange_accounts`
- `terminal_order_size_ranges`, `terminal_wallet_links`
- `stock_transactions` (public)
- `role_permissions` (anon)

Added authenticated SELECT for tables that didn't already have it:
- `p2p_terminal_roles`, `p2p_terminal_role_permissions`, `p2p_terminal_user_roles`, `stock_transactions`

All other terminal tables already had `authenticated_all_*` policies covering SELECT.

### Verification
Post-migration query confirmed: **zero public/anon policies remain** on any of the 15 targeted tables. All access is now `{authenticated}` only.
