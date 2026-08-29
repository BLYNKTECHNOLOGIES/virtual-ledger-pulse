# Gmail-style HR Mailbox rework

Rebuild the HR Mailbox reading and composing experience so it reads like Gmail, and fix the text-encoding and header defects visible in the current messages.

## Formatting defects found (confirmed in code)

1. **Mojibake (`â€"`, `Â`, `â` blocks)** — the IMAP parser decodes quoted-printable and base64 into single *bytes* and never runs them through a UTF-8 decoder, so every em dash, curly quote and non-breaking space arrives corrupted. Same bug in the encoded-word decoder used for subjects, which is why the subject line in the screenshot shows `Half Day â 21 Aug 2026`.
2. **Charset ignored** — a part's declared `charset=` is never read; ISO-8859-1 and UTF-8 are treated identically.
3. **Cc / Bcc dropped on inbound mail** — only `To` is parsed and stored, so the reader can never show a Cc line.
4. **Attachments detected but discarded** — `has_attachments` is set, but no filename, size or content is kept, so the paperclip icon leads nowhere.
5. **Quoted reply history is not collapsed** — the whole previous mail (including the branded HR card) renders inline, making a two-line reply look enormous.
6. **Thread header shows raw addresses** — `Name <addr@x>` on every row, no avatars, no "me", no relative timestamps ("17:51", "25 Aug"), and no per-message details panel.
7. **No reply from the reader** — replies must be composed from scratch in the Compose tab, losing threading headers.

## Gmail-style UI

**Shell**
- Left rail: Inbox / Sent / Templates / Compose as a Gmail-like nav, with unread counts; mailbox selector at the top. Tabs remain the mechanism on mobile.
- Prominent "Compose" button; search bar spanning the top with the filter panel as a dropdown, not a stacked card.

**Conversation list**
- Rows: colored initial avatar, sender names ("me" for our mailbox), subject in bold + grey snippet on the same line, attachment clip, thread count chip, right-aligned relative time (time today, "25 Aug" older).
- Unread rows bold with a light background; read rows plain. Hover shows quick actions (mark read/unread, open).
- Row density comfortable, single-line truncation, no wrapping.

**Reader**
- Sticky thread header: subject, thread count, back arrow (mobile), reply button.
- Each message as a Gmail card: avatar, sender name, `<address>` muted, timestamp right; collapsed rows show one-line snippet, last message auto-expanded.
- Expanded message gains a details toggle revealing From / To / Cc / Date / Reply-To in a Gmail-style table.
- Quoted history collapsed behind a "···" chip; attachments listed as chips with filename and size.
- Footer actions: Reply, Reply all, Forward, Mark unread.

**Reply**
- Inline reply box at the bottom of the thread — sender fixed to the mailbox, To prefilled, Cc field expandable, subject auto `Re:`, quoted original appended, attachments allowed. Sends through the existing send function with `In-Reply-To`/`References` so Gmail threads it correctly.

**Compose**
- Gmail-like composer: To / Cc / Bcc chip rows (Cc, Bcc revealed by links), recipient picker for employees or "all active", subject, body, attachment chips, template load/save.

## Technical notes

- `supabase/functions/_shared/imap-client.ts`: decode quoted-printable and base64 to `Uint8Array`, then `TextDecoder(charset)` per part; same for encoded words (B and Q, per-word charset). Parse `Cc`, `Bcc`, `Reply-To`, and per-part `Content-Disposition` filename/size. Keep the parser's output shape additive.
- Migration: add `cc_addresses`, `reply_to`, `attachments` (jsonb) to `hr_mail_messages`; back-fill nothing. Grants + RLS follow the existing HR-staff pattern.
- `_shared/hr-mail-sync.ts`: persist the new fields.
- `hr-mail-send`: accept `replyToMessageId`, `cc`, and thread headers; set `In-Reply-To`/`References` on the outgoing mail. Existing campaign behaviour unchanged.
- Frontend: split `MailboxPage.tsx` into `src/components/hrms/mail/` — `MailShell`, `ThreadList`, `ThreadReader`, `MessageCard`, `MessageDetails`, `InlineReply`, `Composer`. `MailBodyView` gains quoted-history collapsing (`blockquote`, `gmail_quote`, `On … wrote:`).
- Existing hooks in `useHrMailbox.ts` are reused; one new mutation for reply. All colours via semantic tokens; icons only, no emoji.
- Verification: sync a mailbox and confirm a previously mojibake subject/body renders correctly; send one reply from the reader and confirm it lands threaded in Gmail and is logged.
