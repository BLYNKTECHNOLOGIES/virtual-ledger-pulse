# Terminal Chat Persistence Across Browser Tab Switches

## Root cause (verified in code)

Switching to another browser tab and back fires a Supabase `TOKEN_REFRESHED` event. That rebuilds the `user` object, which re-runs the terminal auth/permission fetches. Two holes remain:

1. **Full-screen remount:** `TerminalLayout.tsx` (line 23) renders a full-screen `min-h-screen` spinner whenever `isLoading || permsLoading` is true. Any transient loading flip during focus revalidation unmounts the entire Orders page, destroying `selectedOrder`, `showChatInbox` and `activeChatConv` component state. (The published site erp.blynkex.com also predates the earlier preview-only guards.)
2. **Incomplete session restore:** `TerminalOrders.tsx` only persists `orderNumber` + `queueMode` to sessionStorage. A chat opened from the **Chat Inbox** (`activeChatConv` / `showChatInbox`) is not persisted at all, and order restore depends on a fresh Binance deep-link fetch (?order=) that shows a spinner and drops you to the order list if it fails.

## Fix

### 1. Never unmount the terminal on revalidation (`TerminalLayout.tsx`)
Track first successful render with a ref: once content has been shown, background revalidations keep the existing page mounted (no full-screen spinner). The spinner only appears on the genuine first load.

### 2. Persist the full chat context (`TerminalOrders.tsx`)
Extend the sessionStorage payload to also remember:
- `showChatInbox` — whether the Chat Inbox was open
- `activeChatOrderNumber` — the order behind the open chat thread (works for both order-row chats and inbox conversations)

On remount, restore synchronously: re-open the inbox and/or resolve the conversation from the already-cached order list first, falling back to the existing deep-link fetch only when the order isn't in the loaded window. No visible spinner for the common case.

### 3. Stop redundant refetches on tab focus
- `useTerminalAuth`: skip the refetch when the refreshed user id + roles are unchanged from the last successful load (compare by value, not object identity), so tab focus does no work at all.
- React Query already has `refetchOnWindowFocus: false` globally — no change needed there.

## Files
- `src/components/terminal/TerminalLayout.tsx` — first-load-only spinner
- `src/pages/terminal/TerminalOrders.tsx` — extend session payload + synchronous restore
- `src/hooks/useTerminalAuth.tsx` — value-based change detection to skip no-op refetches

## Verification
- Build clean, then Playwright on the preview where possible (note: this project's external Supabase blocks authenticated sandbox checks, so final confirmation is manual: open a chat → switch to another browser tab → return → chat still open, no refresh spinner).
- Publish after approval so erp.blynkex.com picks up this and the earlier preview-only fixes.
