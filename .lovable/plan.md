

## Internal Chat System — Plan

### Overview
Build an order-scoped internal team chat system. Replace the "History" tab in `OrderDetailWorkspace` with "Internal Chat" (default tab). Add a second chat icon per order row in `TerminalOrders.tsx` beside the existing Binance chat icon. Each internal chat is scoped to one order and persists forever.

### Database Changes

**1. New table: `terminal_internal_messages`**
- `id` (uuid PK), `order_number` (text, indexed), `sender_id` (uuid), `sender_name` (text), `message_text` (text nullable), `file_url` (text nullable), `file_name` (text nullable), `message_type` (text: 'text'|'image'|'file'), `created_at` (timestamptz)

**2. New table: `terminal_internal_chat_reads`**
- `id` (uuid PK), `order_number` (text), `user_id` (uuid), `last_read_at` (timestamptz)
- UNIQUE(order_number, user_id)

**3. Storage bucket: `internal-chat-files`** for photo/file uploads.

**4. RLS**: Matching the project's existing anon-based auth pattern.

### Code Changes

**1. New hook: `src/hooks/useInternalChat.ts`**
- `useInternalMessages(orderNumber)` — fetch messages + Supabase realtime subscription for live updates
- `useSendInternalMessage()` — insert message with sender info from `useTerminalAuth`
- `useInternalUnreadCounts(orderNumbers[])` — bulk unread count query per order
- `useMarkInternalChatRead(orderNumber)` — upsert `last_read_at` to now

**2. New component: `src/components/terminal/orders/InternalChatPanel.tsx`**
- Chat UI: sender name on each bubble, own messages right-aligned (blue), others left-aligned (gray)
- File/photo upload via Supabase storage bucket
- Auto-scroll to bottom, mark-as-read on mount
- Text input with send button + attachment button

**3. Update `OrderDetailWorkspace.tsx`**
- Replace "History" tab with "Internal" tab in the right panel tabs (Profile | Internal)
- Set default `rightPanel` to `'internal'` instead of `'profile'`
- On mobile, add "Internal" tab (Details | Chat | Internal | Profile), default to `'internal'`
- Render `InternalChatPanel` when internal tab is active

**4. Update `TerminalOrders.tsx` — order row (lines ~798-811)**
- Add a second icon button (e.g., `Users` icon) right beside the existing `MessageSquare` chat icon in the same `<TableCell>`
- Call `useInternalUnreadCounts` for visible order numbers
- Show red unread badge on the internal chat icon independently
- Clicking the internal icon opens the order detail with internal chat tab focused

### Per-order scoping
Each chat is keyed by `order_number`. Messages from one order never appear in another. After order completion, text messages remain forever; files can be manually cleaned up later (no auto-deletion now).

### Suggested Additional Features

1. **@Mention Notifications** — Tag specific operators in internal chat messages for focused alerts.
2. **Order Handoff / Transfer** — Formal operator-to-operator order transfer with summary note.
3. **Pinned Messages** — Pin critical internal messages to the top of the order detail.
4. **SLA Timer / Breach Alerts** — Highlight orders exceeding response time targets.

