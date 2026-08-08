# HR Mailbox for HRMS

A dedicated mail workspace inside HRMS where HR can compose and send mail to all or selected employees, keep a full sent history with per-recipient delivery status, reuse templates, and read incoming replies in an inbox.

## What HR gets

**Compose**
- Rich text editor (bold, lists, links, headings) plus file attachments.
- Recipients: "All active employees", or hand-pick individuals from a searchable employee list with chips. Free-typed external addresses allowed too.
- Choice of sender mailbox (multiple HR addresses supported, e.g. hr.desk@ and hr@), picked from a dropdown.
- Placeholders like {{employee_name}}, {{employee_id}}, {{department}} filled per recipient.
- Save as template / load a template. Templates are shared across HR users.
- Preview panel showing exactly what one selected employee will receive before sending.

**Sent / Campaigns**
- Every send is one campaign row: subject, sender mailbox, recipient count, sent/failed counts, who sent it, when.
- Open a campaign to see per-recipient status (sent, failed with reason, bounced) and re-send only the failures.
- Sends are chunked and idempotent, so a retry or timeout never double-mails anyone.

**Inbox**
- List of incoming mail per HR mailbox: from, subject, snippet, date, read/unread, attachments.
- Open a message to read the full body; attachments downloadable.
- Reply from inside HRMS (reply goes out through the same mailbox and lands in the campaign log).
- Sender is auto-matched to an employee where the address is known, so HR sees "Priyanka Thakur — Leave query" instead of a bare address.
- Mail is pulled on a schedule (roughly every 5 minutes) plus a manual "Refresh" button.

## Inbox feasibility (needs one confirmation)

Reading mail requires IMAP access on the HR mailboxes. Outgoing already works through the existing SMTP relay, and the same host almost always offers IMAP on port 993 — but it must be enabled on the account and reachable.

The plan handles both outcomes without rework:
1. Build compose + campaigns + templates + logs first (no dependency on IMAP).
2. Add the inbox behind a per-mailbox "IMAP configured" flag. A connection test button reports success/failure with the exact server error.
3. If a mailbox has no IMAP, the Inbox tab shows a clear "Inbox not connected for this mailbox" state instead of a broken screen — nothing else is affected.

I will need, per mailbox: IMAP host, port (usually 993/TLS), username, and an app password, stored as project secrets. I'll ask for those at the point the inbox work starts.

## Access rules

Only HR/admin roles can open the mailbox, gated by the existing HRMS permission model. Employees never see it — it lives entirely under /hrms.

## Technical outline

**Database (new tables, all RLS-protected, HR-role only)**
- `hr_mailboxes` — configured HR sender addresses: label, from-address, SMTP secret key name, IMAP host/port/secret key name, `imap_enabled`, active flag.
- `hr_mail_templates` — name, subject, HTML body, created_by.
- `hr_mail_campaigns` — mailbox_id, subject, html_body, attachment paths, recipient_mode (all/selected), sent_by, counts, status.
- `hr_mail_campaign_recipients` — campaign_id, employee_id (nullable), email, status, error_message, sent_at; unique on (campaign_id, email) for idempotency.
- `hr_mail_messages` — mailbox_id, imap_uid, from_address/name, to, subject, body_html/text, received_at, is_read, matched_employee_id; unique on (mailbox_id, imap_uid).
- `hr_mail_attachments` — links messages/campaigns to Storage objects.
- New private Storage bucket `hr-mail` for outbound attachments and inbound saved attachments.

**Edge functions**
- `hr-mail-send` — validates payload with zod, resolves recipient list server-side (never trusts a client-supplied "all employees" blob), writes campaign + recipient rows first, then sends in chunks via denomailer using the selected mailbox's SMTP secrets, updating each recipient row. Reuses the CC/oversight and logging conventions already in `send-hr-email`, and writes to `hr_email_send_log` so existing HR Logs keeps working.
- `hr-mail-fetch` — IMAP client over `Deno.connectTls`, fetches new UIDs since the stored high-water mark per mailbox, parses headers/body/attachments, upserts into `hr_mail_messages`. Also exposes a `test_connection` action.
- Cron job (pg_cron, scheduled under the `postgres` role per the existing convention) calling `hr-mail-fetch` every 5 minutes.

**Frontend**
- New route `/hrms/mailbox` with tabs: Inbox, Compose, Sent, Templates. Added to `HorillaSidebar`.
- Components under `src/components/hrms/mail/`: `MailboxPage`, `InboxList`, `MessageView`, `ComposePanel` (recipient picker, rich text editor, attachment dropzone, template load/save, preview), `CampaignsList`, `CampaignDetailDialog`, `TemplatesPanel`.
- Rich text via a lightweight editor dependency; attachments uploaded to Storage first, then referenced by path in the send call.
- All data access through `@tanstack/react-query`; no polling beyond the manual refresh and a 30s inbox refetch while the tab is open.

## Build order

1. Schema + storage bucket + RLS/grants.
2. `hr-mail-send` + Compose + Sent/campaign detail + resend-failures.
3. Templates.
4. Mailbox configuration screen + IMAP connection test.
5. `hr-mail-fetch` + Inbox + reply + cron.
