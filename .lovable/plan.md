# Security audit — how staff emails and data can be reached, and how to close it

I tested the live backend as an anonymous visitor (no login, using only the public key that ships inside the app bundle). Direct table reads are correctly blocked. The exposure is elsewhere, and it is serious.

## Confirmed findings

**1. A live staff email feed, open to anyone (critical)**
`get_active_users` is callable without logging in and returns username, **email address**, name and status of every user active in the last five minutes. Polling it every few minutes rebuilds the entire staff email list. This alone explains how an outsider could obtain employee addresses.

**2. Login endpoint open to the public (critical)**
`validate_user_credentials` accepts a username/email plus a password from anyone, and returns the account's email and name even when the password is wrong. It is both an email-harvester and an unlimited password-guessing endpoint (no rate limit, no lockout).

**3. Full employee roster readable without login (high)**
`hr_org_chart_directory` returned the complete active-employee list — names, roles, departments, reporting lines — to an anonymous request. Verified live. Names plus a known company address format is exactly what the phishing mail used.

**4. 362 privileged database routines are exposed to anonymous callers (critical)**
Of those, 287 contain no internal permission check at all, and 188 of the ungated ones *change data* (salary revisions, registration approval, order assignment, cleanup routines, and more). Anything not internally gated is effectively a public API running with owner privileges. A few, such as the password-reset routine, do check the caller's role and currently fail safely — but they should not be reachable at all.

**5. Mail-sending backend functions with no caller check (high)**
Several email functions run without any authentication: the HR workflow notifier, the attendance-notice preview, the payslip preview, the ERP password-OTP sender, the transactional-email preview, and the task/compliance notifiers. An outsider who knows the URL can make our own systems send mail from `hr@blynkex.com` to any address, with attacker-supplied names and dates. That turns our infrastructure into a phishing amplifier.

**Not the cause:** the spoof mail you received (`venet@vera.com.uy`) did not originate from our system — no such send exists in the logs and no code path can use that address. But findings 1–3 explain how the attacker knew who to target.

## The fix

**Phase 1 — stop the bleeding (same session)**
- Revoke anonymous execute rights across all application database routines; grant them back only to logged-in roles.
- Remove `get_active_users` and `validate_user_credentials` from anonymous reach entirely, and make each of them refuse to run without a valid session.
- Gate the org-chart directory behind login.
- Keep only the genuinely public routines reachable (the public onboarding-form path), each re-checked individually.

**Phase 2 — permission checks inside the routines**
- Add a caller check to every routine that changes data: HR/admin routines require HR staff, payroll routines require payroll rights, terminal routines require terminal roles. Read routines return only what the caller is entitled to see.
- Anything that cannot be justified as callable from the browser is restricted to the service role and moved behind a backend function.

**Phase 3 — lock down the email functions**
- Require a verified caller (staff session) or a shared cron secret on every mail function; reject everything else.
- Fix the previews so they can only send to the requesting staff member's own address, never an arbitrary one.
- Add per-caller rate limiting to the OTP and password-reset paths.

**Phase 4 — anti-phishing at the mail layer (configuration, outside the app)**
- Confirm SPF/DKIM and move DMARC to reject for blynkex.com so spoofed "Blynk" mail is refused at the receiving server.
- Turn on the external-sender warning banner in Google Workspace and brief staff on the pattern.
- Optional: alert HR when a routine returns unusually large directory reads.

**Phase 5 — verification**
- Re-run the anonymous probe against every finding above and show the before/after output.
- Run the platform security scanner and confirm the app still works end-to-end for HR, payroll and terminal users after the permission changes.

## Technical notes

- Root cause is a blanket `GRANT EXECUTE ... TO anon` on the public schema's `SECURITY DEFINER` functions, which bypasses row-level security regardless of table policies. Remediation is a migration that runs `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, public`, followed by explicit `GRANT EXECUTE ... TO authenticated` per function, plus an `ALTER DEFAULT PRIVILEGES` change so new functions are not auto-granted to `anon`.
- `search_path` is pinned on each touched function while editing it.
- Edge functions: set `verify_jwt = true` in `supabase/config.toml` where possible, and add the existing `_shared/require-auth.ts` guard (already used correctly by `hr-mail-send`) to the rest; cron-invoked functions accept a `CRON_SECRET` header instead.
- Frontend impact: anonymous calls that legitimately exist today (public onboarding form) are enumerated first so nothing user-facing breaks; every other call already runs with a session.

Phase 1 is the priority and can ship immediately; the rest follows in the same arc.
