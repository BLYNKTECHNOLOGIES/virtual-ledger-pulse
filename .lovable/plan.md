# Client Activity Chat — inside Purpose & Communication

Add a Binance-style, scrollable, chronological chat feed at the bottom of the existing **Purpose & Communication** card on the Client Details page. Everything that ever happens to this client shows up as a dated bubble with the actor's name, including document previews. A composer at the bottom lets authorized users post notes and upload files without leaving the card.

## Where it goes

- File: `src/components/clients/PurposeCommunication.tsx`
- Nothing existing is removed. Purpose of Buying, Compliance Notes, Contacts, Operator Notes, Follow-up, and the current action buttons stay exactly as they are.
- A new section **Activity Timeline** is appended inside the same `<CardContent>` under a divider, containing the chat feed + composer.

## What shows up in the feed

Merged, sorted strictly by timestamp (oldest → newest, auto-scroll to bottom on open, "jump to latest" chip):

1. **System actions** — every `system_action_logs` row with `entity_id = client.id` (client created/updated, KYC approved/rejected, buyer/seller approval, limit changes, etc.). Uses the same `ACTION_LABELS` map already in `useActivityTimeline.ts`.
2. **Operator notes** — `client_operator_notes` rows (existing thread powering `OperatorNotesThread.tsx`).
3. **Communication logs** — `client_communication_logs` rows (calls/emails/meetings from `CommunicationLogDialog.tsx`). Type + subject rendered as a labelled bubble.
4. **KYC & compliance documents** — `client_kyc_documents` rows as file-preview bubbles: thumbnail for images, PDF/file icon + filename for others, plus doc type, uploader, upload date, and "Open" / "Download" actions using signed URLs from the existing KYC storage bucket.
5. **Orders** — `sales_orders` and `purchase_orders` where `client_id = client.id` (and `supplier_id` for purchases when the client is also a supplier). Compact bubble: order number, product, qty × price, status badge. Click opens the existing rich detail via `openTransaction({ type: 'sales_order' | 'purchase_order', id })`.
6. **Bank transactions** — `bank_transactions` where `client_id = client.id`. Compact bubble: type + amount + reference. Click opens `openTransaction({ type: 'bank_transaction', id })`.

Reversal/reversal-noise bank rows are hidden by default (matches the ledger convention already applied in `AccountSummary.tsx`); a small toggle above the feed reveals them.

## Visual style (Binance-style)

- Full-width chat pane, ~520px tall, `overflow-y-auto`, sticky day separators (e.g. "Today", "Yesterday", "25 Jul 2026").
- Two lanes:
  - **System / auto events** — neutral surface bubble, left-aligned, small icon on the left indicating source (system, doc, order, bank, comm).
  - **Human notes / uploads by staff** — primary-tinted bubble, right-aligned, avatar initial of the actor.
- Every bubble shows: actor name, exact time (`HH:mm`), and a source chip ("System", "Note", "KYC", "Sales", "Purchase", "Bank", "Call/Email/Meet").
- Document bubble: 96×96 image thumbnail with lightbox on click, or file-type icon + filename for non-images; secondary line shows doc type + uploader + date; buttons for Preview and Download.
- Order/bank bubbles are clickable rows that reuse the existing Universal Transaction Detail dialog — no new detail UI needed.
- Empty state: single centered "No activity yet" line with the composer still available.

## Composer (permission-gated by `MANAGE_CLIENTS`)

Anchored at the bottom of the chat pane:

- Textarea (auto-grow, Enter to send, Shift+Enter for newline).
- Paperclip button opens file picker (images, PDFs, docs).
- Send button. Behavior:
  - Text-only → insert into `client_operator_notes` (author = current user).
  - Attachment(s) → upload to the existing KYC storage bucket under the client's permanent path, then insert one `client_kyc_documents` row per file with `document_type = 'communication_attachment'`, uploader = current user, plus the accompanying text (if any) as a linked `client_operator_notes` row referencing the filename.
- Uploads follow the existing KYC durability rule (permanent `kyc/` path, no auto-cleanup).
- Toast on success/failure; feed refetches automatically via `queryClient.invalidateQueries`.

Users without `MANAGE_CLIENTS` see the feed but no composer.

## Data plumbing

New hook `src/hooks/useClientActivityFeed.ts`:

- Runs 6 parallel queries scoped to `clientId` (system actions, operator notes, communication logs, KYC documents, sales orders, purchase orders, bank transactions — using `fetchAllPaginated` where row counts can exceed 1000).
- Resolves actor names via a single `users` lookup (id → full name / username), mirroring the pattern already in `useActivityTimeline.ts`.
- Normalizes every row into a common `ClientFeedItem` shape:
  ```ts
  { id, kind: 'system'|'note'|'comm'|'doc'|'sales'|'purchase'|'bank',
    at: string, actorId, actorName, title, body?, badge?,
    attachment?: { url, mime, filename }, deepLink?: { type, id } }
  ```
- Sorts by `at` ascending in memory, returns the flat list.
- Realtime: subscribe to Postgres changes on `client_operator_notes`, `client_kyc_documents`, and `system_action_logs` filtered by this client, using the `useEffect` + `removeChannel` cleanup pattern per project rules, so new events appear live without refresh.

New component `src/components/clients/ClientActivityChat.tsx`:

- Renders the header row ("Activity Timeline" + reversal-toggle + refresh), the scrollable feed, and the composer.
- Handles day-separators, auto-scroll-to-bottom on mount and on new incoming items when already at the bottom, "Jump to latest" pill when the user has scrolled up.
- Image preview uses an existing `Dialog` for lightbox; non-image previews open in a new tab via signed URL.

`PurposeCommunication.tsx` change is minimal: import `ClientActivityChat` and append `<ClientActivityChat clientId={activeClientId!} />` inside `CardContent` after the current action buttons, with a `Separator` above it.

## Out of scope

- No schema changes. All tables and buckets already exist.
- No changes to the existing Notes / Communication Log dialogs — they continue to work; the chat is an additional surface.
- No email/SMS sending from the composer.
- No edit/delete of already-posted feed items in this pass (matches current operator-notes behavior).

## Verification

- Load a client with existing orders, bank rows, KYC docs, notes: confirm every item appears once, sorted correctly, with actor + timestamp.
- Post a note → appears instantly at the bottom, attributed to current user.
- Upload an image → thumbnail bubble with working lightbox; upload a PDF → file bubble with working "Open" link.
- Click an order/bank bubble → existing transaction detail dialog opens with full data.
- Sign in as a user without `MANAGE_CLIENTS` → feed visible, composer hidden.
- Confirm no console errors, no Realtime leaks (cleanup fires on unmount).