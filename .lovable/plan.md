# Phase 3b — Always-on chat listener on the existing relay box

## Confirmed state of the box

- Ubuntu 22.04, 914 MB RAM (~450 MB free), 30 GB free disk — ample.
- `pm2` manages everything: `binance-proxy` (server.js, port 3000, 54 MB) and `chat-relay` (relay.js, port 8080, 44 MB). No crontab, no systemd units. The listener will be a third pm2 app for consistency.
- nginx terminates TLS on 443 in front of both; the listener will talk to them over **localhost**, so nginx stays untouched and no new ports open.
- Account mapping (verified in DB):
  - `credential_key = default` → **Blynk Binance**
  - `credential_key = acct2` → **ASEC Binance**
- `/home/ubuntu/binance-proxy/.env` holds `BINANCE_API_KEY`, `BINANCE_API_SECRET`, `PROXY_TOKEN`, `BINANCE_PROXY_TOKEN` — i.e. **only Blynk's keys**. ASEC's key/secret must be added to the listener's own env, otherwise ASEC chats won't be captured.


**Key architectural point (verified in app code):** Binance chat is **one WebSocket per Binance account**, not per order — every order's messages for an account arrive on that account's single socket. 50 concurrent chats = 2 sockets. Memory cost is trivial (~40 MB total).

## Part A — Setup commands

### A1. Create the service folder and install dependencies

```bash
mkdir -p /home/ubuntu/chat-listener && cd /home/ubuntu/chat-listener
npm init -y
npm install ws @supabase/supabase-js dotenv
```

### A2. Secrets — reuse what's already on the box

You don't need to remember any values. The listener will **read `/home/ubuntu/binance-proxy/.env` directly** for Account 1's key/secret and both proxy tokens, so only Account 2's pair has to be supplied.

To see what's already there (do this in a private window):

```bash
cat /home/ubuntu/binance-proxy/.env
```

Then create a small extra file with just the new values:

```bash
cat > /home/ubuntu/chat-listener/.env <<'EOF'
SUPABASE_URL=https://vagiqbespusdxsbqpvbo.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<paste service role key>
PROXY_BASE=http://127.0.0.1:3000
RELAY_BASE=ws://127.0.0.1:8080
UPSTREAM_ENV=/home/ubuntu/binance-proxy/.env
BINANCE_API_KEY_2=<account 2 key>
BINANCE_API_SECRET_2=<account 2 secret>
EOF
chmod 600 /home/ubuntu/chat-listener/.env
```

Where each value comes from:
- **Service role key** — Supabase dashboard, Project Settings → API → `service_role` secret.
- **Blynk key/secret, PROXY_TOKEN, BINANCE_PROXY_TOKEN** — already in the proxy `.env`; nothing to type.
- **ASEC key/secret** — not on this box. They are stored encrypted in the app's secrets (`BINANCE_API_KEY_2` / `BINANCE_API_SECRET_2`) and cannot be read back, so copy them from Binance → API Management on the **ASEC** account, or generate a fresh read-enabled pair there. If ASEC chats aren't needed yet, leave these blank and the listener simply runs for Blynk.



### A3. Install `main.js` (I write it after you confirm A1/A2) and start it under pm2

```bash
cd /home/ubuntu/chat-listener
pm2 start main.js --name chat-listener
pm2 save
pm2 ls
pm2 logs chat-listener --lines 100
```

Handy later: `pm2 restart chat-listener`, `pm2 logs chat-listener`, `pm2 describe chat-listener`.

### A4. Nothing else to change
No new inbound ports (outbound/localhost only), no nginx edits, no plan upgrade. pm2 already restarts crashed apps and `pm2 save` makes it survive reboot.

## Part B — What the listener does (`main.js`, ~200 lines)

1. Reads active accounts from `terminal_exchange_accounts` with a service-role Supabase client and maps each `credential_key` to its `BINANCE_API_KEY*` pair — the same rule the edge functions use.
2. Per account: `GET http://127.0.0.1:3000/api/sapi/v1/c2c/chat/retrieveChatCredential` with `x-proxy-token` plus that account's `x-api-key` / `x-api-secret`, then opens **one** socket to `ws://127.0.0.1:8080/?key=<RELAY_TOKEN>&target=<chatWssUrl>/<listenKey>?token=<listenToken>&clientType=web` — exactly the URL shape the browser uses today.
3. Each inbound frame is normalised and upserted into `binance_order_chat_messages` on `dedupe_key` (column already exists), stamped with `exchange_account_id`. Idempotent, so the browser's archive sync writing the same message never duplicates.
4. Credentials refresh every 25 minutes; sockets reconnect with exponential backoff; a rejected listenKey clears the cache and re-fetches.
5. Heartbeat into `terminal_collector_state` (`id='chat_listener'`) every 15 s: connected sockets, last message time, reconnect count.
6. Sending stays exactly as it is today (browser socket / `chat/send` proxy route) — this service only listens.

## Part C — Terminal (app) side

1. Add `binance_order_chat_messages` to the Supabase realtime publication and subscribe in the chat hook, so messages paint instantly from our own database.
2. Chat opens from database rows first; with the listener running, history is always complete even after a reload.
3. Browser socket becomes send-only — keep it for sending/typing, drop the REST reconciliation poll while the listener heartbeat is healthy.
4. "Live chat: connected / stale" chip beside the existing orders banner, driven by the `chat_listener` heartbeat row.
5. Fallback: if the heartbeat goes stale, browsers transparently resume today's behaviour (own socket + poll), so nothing breaks if the box goes down.

## Order of work
A1 + A2 on the box → I write `main.js`, you run A3 → verify live messages landing in the database → then Part C in the app, with the fallback kept throughout.
