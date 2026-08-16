# Send workflow emails from the HR mailbox with HR branding

Attendance-regularization and leave-approval notifications currently go out from `task@blynkex.com` using the generic transactional layout (plain card, no Blynk header, no HR signature). They should come from `hr@blynkex.com` and look like the other HR mails.

## What changes

- Sender becomes the HR mailbox (`hr@blynkex.com`), the same account used for attendance absent/half-day notices and HR campaigns.
- Layout adopts the HR mail design: Blynk header strip, white card, detail rows, coloured status chip, action button, and the standard Honey Sewani / Human Resources signature footer.
- Status colour stays contextual — green for approved, red for rejected, amber/blue for pending-action mails — inside the HR-branded shell.
- Both the attendance-regularization mails (requested, sent to manager, manager decided, approved, rejected) and the leave-approval mails follow the same treatment.
- Content is tightened: empty fields such as Category, Reason, HR notes are omitted instead of printing "—" or "none".

## Sample

After the change, one sample approved-regularization mail is sent to shubham.singh@blynkex.com from the HR mailbox for visual confirmation, and the delivery is verified in the send log.

## Technical notes

- New edge function `hr-workflow-notify`: resolves the active HR mailbox from `hr_mailboxes` (falling back to `HR_SMTP_*` secrets), renders HTML/plain-text bodies, sends via denomailer, and writes to `hr_email_send_log` with the existing idempotency key so repeat events do not double-send.
- Rendering reuses `supabase/functions/_shared/hrSignature.ts` (`hrHeaderHtml`, `hrSignatureHtml`, `hrSignatureText`) plus a small shared card builder mirroring `hr-attendance-exception-notify`.
- `src/utils/regularizationEmail.ts` and `src/utils/leaveEmail.ts` switch their `supabase.functions.invoke` target from `send-transactional-email` to `hr-workflow-notify`; payload shape and fire-and-forget behaviour are unchanged.
- The React Email templates `regularization-approval.tsx` and `leave-approval.tsx` are retired from the transactional registry once the new path is live.
- Verification: deploy, invoke the function once for the sample recipient, then confirm the log row and a 250 SMTP acceptance in the function logs.
