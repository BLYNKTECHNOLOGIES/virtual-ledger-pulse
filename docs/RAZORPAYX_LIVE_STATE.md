# RazorpayX — Live Envelope State

Snapshot: **2026-07-26** (post July-25 live-fire arc).

This file captures which RazorpayX push envelopes are **verified in production**
against real Opfin read-back and which remain **unverified** (either because we
have never fired them in live, or because Razorpay has not yet granted sandbox
credentials to rehearse them safely).

The single flag `hr_razorpay_settings.push_<envelope>_endpoint_verified`
gates each write; the doctrine is that no envelope may be considered
"green" until a real live-fire push has round-tripped through Opfin and
been re-read by the verifier. See `PAYROLL_DOCTRINE.md` for the deeper contract.

## Verified in production

| Envelope | Verified | Notes |
| --- | --- | --- |
| `push_people_endpoint_verified` | ✅ | Employee create + update round-trips confirmed. |
| `push_salary_endpoint_verified` | ✅ | July-25 arc — Shubham Singh ₹9,12,000 CTC read-back green. |
| `push_payroll_endpoint_verified` | ✅ | July-25 arc — one-time bonus additions accepted and verified; auto-verified alongside `salary` per the shared envelope. |
| `push_statutory_endpoint_verified` | ✅ | PF / ESI / PT enrollment toggles round-trip. Read-back now the sole source of truth after the July-26 dedup fix. |

## Unverified — gated on live-fire or sandbox

| Envelope | Status | Blocker |
| --- | --- | --- |
| `push_contractor_endpoint_verified` | ⚠️ Unverified | Awaiting first real contractor payroll cycle in production. |
| `push_reimbursement_endpoint_verified` | ⚠️ Unverified | No live reimbursement payload sent yet; safe to rehearse only in sandbox. |
| `push_taxdoc_endpoint_verified` | ⚠️ Unverified | Requires Investment Declarations / Form-16 API access from Razorpay. |

## Sandbox rehearsal (R12) — gated on external credentials

The base-URL toggle (`SandboxToggleCard`) and auto-revoke cascade are already
built. They are intentionally not activated in production because Razorpay
has **not yet issued sandbox credentials for our account**. When they do:

1. Add sandbox key + secret via `add_secret` (`RAZORPAY_SANDBOX_KEY_ID`, `RAZORPAY_SANDBOX_KEY_SECRET`).
2. Flip the sandbox toggle in RazorpaySyncPage; the persistent banner will show `SANDBOX MODE`.
3. Rehearse the three unverified envelopes above end-to-end.
4. Auto-revoke cron flips the toggle back after the rehearsal window closes.
5. Only then flip production envelopes to verified.

## Doctrine reminders

- **Never** log `status = 'success'` before the read-back completes — the
  verifier's row is the only authoritative outcome.
- **Never** fabricate a payslip PDF; use `RazorpayPayslipLink` deep-links.
- **Never** trust a "HTTP 200" as verification — Razorpay silently no-ops
  disallowed statutory / salary changes.
