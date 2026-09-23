# Biometric registration by invitation email

Replace the self-registration flow (where staff typed a one-time office code on the office network) with an admin-sent registration link. The admin chooses, at the moment of sending, whether that link registers an **office device** (full access) or a **personal device** (view only).

## What changes for you

**Removed**
- The typed office code and the code generator.
- The office IP address list and the network check — an office-level device now keeps full access wherever it is used, as you asked.
- The Off / Log only / Enforce protection switch: access level is decided by the link you send, so there is nothing left to stage.
- The deep database-wide write blocker installed last time.

**New — Terminal → Users & Roles**
- Each user row gets a "Send biometric registration" action. You pick **Office device (full access)** or **Personal device (view only)**, optionally add a note, and the employee gets an email with a link.
- The link works for **24 hours** and registers **exactly one** device, then dies. You can resend or cancel a pending invite at any time.
- The Devices tab stays, minus the code and network sections: every device, its owner, office or personal, when it was last used, with the ability to flip its level or revoke it.

**Employee experience**
- They open the link on the machine they want to use, confirm it is them, and register their fingerprint. No code to type.
- On a personal (view-only) device they still see everything their role covers, with the amber "VIEW ONLY" strip and action buttons disabled.

**Existing devices** keep their current level, as you chose. Anything registered before stays full access unless you flip it in the Devices tab.

## Enforcement that stays

View only remains genuinely read only, but enforced in two layers instead of three:
- The Terminal UI disables actions and shows the strip.
- The server refuses order release, chat sending, ad changes, payments, transfers and other business writes for a view-only session.

## Technical notes

Removal
- Drop `terminal_device_enrolment_codes`, `terminal_trusted_networks`, `terminal_device_guard_settings`; drop RPCs `issue_terminal_office_enrolment_code`, `consume_terminal_office_enrolment_code`, `terminal_ip_is_office`, `set_terminal_session_mode`.
- Drop the `zz_terminal_view_only_guard` trigger from all tables carrying it, plus the guard function; keep `terminal_view_only_denials` as an audit log of refused attempts.
- Strip `getGuardSettings` / `isOfficeNetwork` / IP logic from `supabase/functions/_shared/terminalDeviceMode.ts` and from `decideSessionMode` in `terminal-webauthn`; mode becomes: Super Admin → full, credential `trust_level = 'office'` → full, otherwise view only.
- Remove `officeCode` from `registerBiometric`, the code field from `BiometricRegistrationDialog`, and the code/network/enforcement sections from `TerminalDevicesList.tsx`.

New
- Migration: `terminal_biometric_invites` (id, user_id, token_hash, trust_level office|view_only, note, created_by, expires_at, consumed_at, consumed_credential_id, revoked_at, timestamps) with GRANTs, RLS limited to terminal admins, plus RPCs `create_terminal_biometric_invite`, `revoke_terminal_biometric_invite`, `list_terminal_biometric_invites`, and a `consume_terminal_biometric_invite` used server-side only.
- Edge function `terminal-biometric-invite`: admin-authenticated create/resend/revoke; sends the mail through the existing shared mail sender (subject/filename tidying already in `_shared/mailBody.ts`), recipient taken from `public.users.email` — confirm each target user has one and surface a clear message when missing.
- `terminal-webauthn` `register` accepts `invite_token` instead of `office_code`: validates the token (unexpired, unconsumed, not revoked, belongs to the caller), sets `trust_level` from the invite, marks it consumed atomically.
- Public route `/terminal/register-device?token=…` (`TerminalDeviceRegistrationPage`): requires the employee to be signed in, shows whose invite it is and which level, then runs WebAuthn registration and confirms.
- New UI: `SendBiometricInviteDialog` wired into `TerminalUsersList` row actions and a pending-invites panel in `TerminalDevicesList`.
- Add a dated line to `docs/STATE_LOG.md` recording the rollback of the office-code/IP guard and the switch to emailed invites.
