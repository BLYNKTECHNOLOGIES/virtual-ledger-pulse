# Home Access: Office Devices vs Personal View-Only Devices (Terminal)

Goal: let staff open the Trading Terminal from their personal laptop at home and **watch** everything their role can see, while being physically unable to release an order, send a chat, touch an ad, or change any business data. Office machines keep working exactly as today.

## The trust idea (answering "any other way?")

A device is not trusted because someone ticks a box. Trust comes from three things that must all hold, and it is re-checked at every unlock — not stamped once:

1. **The fingerprint itself is the device.** The fingerprint credential registered in Windows Hello / Touch ID cannot be copied off that machine. So the registration record *is* the machine's identity. Nobody can move an office registration to a home laptop.
2. **An office registration can only be created under supervision.** A Super Admin opens a short enrolment window (a one-time code, valid ~10 minutes, single use) and the enrolment must also come from the office network. Without both, any new registration is created as **view-only** — that is the default for every device, forever.
3. **Trust is re-evaluated at each unlock, not inherited.** If an office-registered laptop is unlocked from outside the office network, the session is automatically downgraded to view-only for that session. So a company laptop taken home behaves like a personal one, with no admin action needed.

This also removes the "who decides?" loophole: an employee at home has no path to anything but view-only.

## What view-only means

Server-side, the unlocked session carries a mode: `full` or `view_only`. Mode is decided on the server from the registration record plus the network check — never sent by the browser, never stored in the browser.

In `view_only` the only writes accepted anywhere are: presence heartbeat, chat read markers, and personal view preferences (your chosen safe list). Everything else is refused: order release, chat send, ad create/edit/price/quantity, payments, assignments, appeals, approvals, settings, exports that write. Visibility is unchanged — same data the role sees in office.

## Registration flow

```text
Employee opens terminal on a new device
      |
      v
Fingerprint registration (as today) ---> device saved as VIEW-ONLY (always)
      |
      +-- Office setup only:
             Super Admin issues one-time office enrolment code
             Employee enters it during registration, on office network
             -> device saved as OFFICE (full actions)

Every unlock:
   office device + office network  -> full session
   office device + outside network -> view-only session (auto downgrade, banner)
   view-only device                -> view-only session
   Super Admin                     -> unchanged behaviour
```

## What the operator sees

- A persistent amber "VIEW ONLY — personal device" strip in the terminal header, plus a watermark on the Orders workspace.
- Every action button (Release, Send, Mark Paid, Pay, ad edits, dialogs' confirm buttons) renders disabled with the tooltip "Not available on a personal device".
- If anything still reaches the server, the refusal comes back as a clear toast, not a crash.
- Users & Roles gains a **Devices** tab: each person's registered devices with name, type (Office / Personal), last used, last network, plus Revoke and "Issue office enrolment code".

## Security layers (all three, so read-only really means read-only)

1. **Database:** one statement-level guard trigger, attached mechanically to every business table (loop over `public` tables, excluding the safe-list tables, audit/log tables and the session tables themselves), plus an event trigger so tables created later are covered automatically. It refuses any insert/update/delete while the acting user's current terminal session is `view_only`. Statement-level, so the cost is one check per statement, not per row. This closes every direct-write path in the app at once (~900 call sites) without editing them.
2. **Server functions:** a shared `assertWriteAllowed()` used by the mutating edge functions (Binance order/ad/asset actions, chat send, payer screenshot, assignments). Those run with elevated rights and bypass row rules, so they get their own explicit check against the caller's session mode. Binance action calls will also carry the unlock session token and it is verified server-side.
3. **UI:** buttons and dialogs disabled from the session mode, so a view-only operator never hits an error in normal use.

Refused attempts are written to the terminal audit log with device, mode and action, so an attempt to act from home is visible.

## Not breaking what exists today

- Existing registrations are migrated as **Office**, and existing office machines stay on the office network, so nobody is locked out on day one.
- Super Admin is exempt, as you asked.
- Automation (cron, auto-price, auto-pay, collectors) runs as the system, not as a user session, so it is untouched by the guard.
- Rollout in two steps: first **log-only** mode (guard records what it would have blocked, blocks nothing) for a day so we can confirm no legitimate office action is caught; then switch enforcement on.

## Technical notes

- `terminal_webauthn_credentials`: add `trust_level` (`office` | `view_only`), `enrolled_ip`, `enrolled_via`, `approved_by`, `revoked_at`.
- New `terminal_device_enrolment_codes` (code hash, issued_by, user, expires_at, consumed_at) and `terminal_trusted_networks` (office public IPs / CIDRs, managed by Super Admin).
- `terminal_biometric_sessions`: add `mode`, `credential_id`, `client_ip`, `enforced_reason`.
- `terminal-webauthn` decides mode at `verify`/`validate_bypass` time; bypass codes mint `view_only` unless the issuing Super Admin marks the code as office.
- New DB functions: `public.terminal_session_mode(uuid)`, `public.terminal_guard_view_only()` trigger fn, `public.terminal_write_allowed(uuid)`; safe-list table `terminal_view_only_write_allowlist`.
- Client: extend `useTerminalBiometricSession` / `useTerminalAuth` with `sessionMode`, plus a `useTerminalWriteAllowed()` hook and a `<WriteGate>` wrapper used by action buttons.
- Enforcement switch lives in a settings row so it can be flipped without a deploy.

## Phases

1. Schema + session mode plumbing + audit (no behaviour change).
2. `terminal-webauthn` mode decision, network check, enrolment codes, Devices tab.
3. UI view-only banner, disabled actions, `<WriteGate>`.
4. Edge-function `assertWriteAllowed()` across mutating actions.
5. DB guard trigger in log-only mode, review, then enforce.
