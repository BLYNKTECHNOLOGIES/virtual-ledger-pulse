

## WebSocket Chat Relay Integration

### Overview

Replace the current broken direct-to-Binance WebSocket chat connection with a relay through the Lightsail VPS. The browser connects to the relay, which forwards frames to/from Binance Chat WSS -- keeping the IP-whitelisted architecture intact.

```text
Current (broken):
  Browser --WSS--> Binance Chat (blocked by Cloudflare/IP mismatch)

New:
  Browser --WSS--> Lightsail Relay (Nginx /chat-relay/) --WSS--> Binance Chat
```

### Phase 1 -- Relay Server on Lightsail (you run manually)

I will provide exact copy-paste commands to:

1. Install `ws` package in `~/binance-proxy/`
2. Create `~/binance-proxy/relay.js` with:
   - WebSocket server on port 8080
   - Token auth via `key` query param (reuses existing `BINANCE_PROXY_TOKEN`)
   - Reads `target` query param (the full Binance WSS URL with listenKey/token)
   - Bidirectional frame forwarding
   - Ping/pong passthrough for keepalive
   - Clean close propagation both directions
3. Add Nginx config block for `/chat-relay/` with WebSocket upgrade headers
4. Start with PM2: `pm2 start relay.js --name chat-relay`

**No new secrets needed** -- the relay reuses `BINANCE_PROXY_TOKEN` for authentication, and the relay URL is constructed from the existing `BINANCE_PROXY_URL` (same IP, different path).

### Phase 2 -- Edge Function Update

**File: `supabase/functions/binance-ads/index.ts`**

Update the `getChatCredential` case (lines 299-311) to append the relay URL info to the response:

- Derive relay WSS URL from `BINANCE_PROXY_URL` (replace `http://` with `ws://`, append `/chat-relay/`)
- Return `relayUrl` and `relayToken` (same as `BINANCE_PROXY_TOKEN`) alongside existing `chatWssUrl`, `listenKey`, `listenToken`
- Frontend uses these to build the relay connection URL

### Phase 3 -- Frontend Hook Rewrite

**File: `src/hooks/useBinanceChatWebSocket.ts`**

The hook interface stays identical (`messages`, `isConnected`, `isConnecting`, `sendMessage`, `error`) so **ChatPanel.tsx needs zero changes**.

Changes inside the hook:

1. **`connect` function**: After fetching credentials via `getChatCredential`, build the Binance target URL and connect through the relay instead of directly:
   ```
   Target: ${chatWssUrl}/${listenKey}?token=${listenToken}&clientType=web
   Connect to: ws://${relayHost}/chat-relay/?key=${relayToken}&target=${encodedTarget}
   ```

2. **Message handling**: Stays exactly the same -- the relay is transparent, just forwarding raw frames

3. **Reconnect logic**: Unchanged (exponential backoff, max 5 attempts)

4. **Ping/pong**: The relay forwards Binance pings transparently, so the existing 30s keepalive ping from the client still works

### What stays the same (no changes needed)

- `ChatPanel.tsx` -- consumes the same hook interface
- `ChatBubble.tsx`, `ChatImageUpload.tsx`, `QuickReplyBar.tsx` -- untouched
- Chat inbox components -- untouched
- All message parsing, sound notifications, deduplication -- untouched
- REST-based chat history fetch on mount -- untouched (still works as fallback)

### Implementation sequence

1. I provide the Lightsail commands for you to run (relay.js + Nginx + PM2)
2. You run them and confirm relay is listening on port 8080
3. I update the `binance-ads` edge function to include relay info in `getChatCredential` response
4. I rewrite `useBinanceChatWebSocket.ts` to connect via relay
5. We test end-to-end from the Terminal orders page

### Edge cases handled

- **Relay unreachable**: Existing `wsError` banner shows "Connection failed", reconnect logic kicks in
- **Binance disconnects**: Close event propagates through relay to client, triggering reconnect
- **Token mismatch**: Relay closes socket immediately, client sees error state
- **Multiple browser tabs**: Each tab gets its own relay-to-Binance connection (simple model first; pooling optimization can come later)

