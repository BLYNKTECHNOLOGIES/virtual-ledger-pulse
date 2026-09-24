# Finish emailed biometric registration (fixes: office computers can't get full access)

## The problem (confirmed)
Last update removed the office code system from the database, but the fingerprint registration still asks for that code. The check always fails, so every new device is saved as view only. The replacement (emailed registration link) was not wired in yet.

## What gets built
1. **Terminal → Users & Roles**: each user gets "Send biometric registration". Pick **Office device (full access)** or **Personal device (view only)**, optional note. The employee receives a branded email with a link valid 24 hours, one device only. Resend / cancel available.
2. **Devices tab**: a "Pending invites" panel (who, level, sent, expires, cancel).
3. **Registration page** from the link: employee signs in, sees whose invite and which level, registers the fingerprint. The device gets exactly the level the admin chose.
4. **Old code removed**: the office code box in the registration window, and leftover office-network / protection-mode checks on the server, so nothing references the deleted pieces.
5. Registering without an invite still works and is saved as view only (as before).

## Technical notes
- New edge function `terminal-biometric-invite` (create/resend/revoke): caller must pass `terminal_can_manage_devices`; calls `create_terminal_biometric_invite`, mails via shared HR mail sender with `wrapHrEmail`, recipient `public.users.email`, clear error if missing.
- `terminal-webauthn` `register`: replace `office_code` with `invite_token` → `consume_terminal_biometric_invite` (atomic, checks owner/expiry/revoked) sets `trust_level`; drop `terminal_trusted_networks` lookups and `issue_office_code` action; `decideSessionMode`: Super Admin → full, credential office → full, else view only.
- `_shared/terminalDeviceMode.ts`: drop `getGuardSettings`/`isOfficeNetwork`; `assertTerminalWriteAllowed` always enforces for view-only sessions.
- Client: `SendBiometricInviteDialog`, `TerminalUsersList` action, invites panel in `TerminalDevicesList`, route `/terminal/register-device?token=`, `registerBiometric(…, inviteToken)`, remove code field from `BiometricRegistrationDialog`.
- STATE_LOG line; resolve the monitoring finding as fixed.
