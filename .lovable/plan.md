# Phase 3b — Always-on chat listener on the existing relay box

## Confirmed state of the box

- Ubuntu 22.04, 914 MB RAM (~450 MB free), 30 GB free disk — ample.
- `pm2` manages everything: `binance-proxy` (server.js, port 3000) and `chat-relay` (relay.js, port 8080). No crontab, no systemd units. The listener becomes a third pm2 app.
- nginx terminates TLS on 443 in front of both; the listener talks to them over **localhost**, so nginx stays untouched and no new ports open.
- Account mapping (verified in DB): `credential_key = default` → **Blynk Binance**; `credential_key = acct2` → **ASEC Binance**.
- `/home/ubuntu/binance-proxy/.env` already holds Blynk's key/secret plus `PROXY_TOKEN` and `BINANCE_PROXY_TOKEN`. Only ASEC's key/secret need adding.
- Done so far: `/home/ubuntu/chat-listener` created, `npm init -y`, and `ws`, `@supabase/supabase-js`, `dotenv` installed.

**Key architectural point (verified in app code):** Binance chat is **one WebSocket per Binance account**, not per order — every order's messages for an account arrive on that account's single socket. 50 concurrent chats = 2 sockets, ~40 MB total.

## SECURITY — do this first

The Blynk and ASEC Binance API keys and the Supabase service-role key were pasted into chat, so treat all three as exposed:

1. Binance → API Management → **Blynk** account: delete the current key, create a new one with the same permissions and IP whitelist, and put it in `/home/ubuntu/binance-proxy/.env`, then `pm2 restart binance-proxy chat-relay`.
2. Binance → API Management → **ASEC** account: same, and put the new pair in `/home/ubuntu/chat-listener/.env`.
3. Supabase dashboard → Project Settings → API → roll the `service_role` key, then update `/home/ubuntu/chat-listener/.env`.
4. After rotation, also update the matching values in the app's stored secrets so edge functions keep working.

This can be done immediately or right after the listener is verified working — but it must be done.

## Part A — Setup on the box

### A1. Fix the `.env` file (the heredoc paste got mangled)

The earlier paste failed because the terminal injected bracketed-paste characters (`cat: command not found`), and one attempt wrapped values in `<...>` and appended a stray `>` / `~`. Verify and rewrite with an editor rather than a heredoc:

```bash
cat /home/ubuntu/chat-listener/.env
```

If it is missing, empty or contains `<`, `>` or blank-line noise, rewrite it:

```bash
nano /home/ubuntu/chat-listener/.env
```

Paste exactly these lines inside nano (no angle brackets, no blank lines), replacing the two ASEC values and the service-role key with the current (post-rotation) ones, then `Ctrl+O`, `Enter`, `Ctrl+X`:

```
SUPABASE_URL=https://vagiqbespusdxsbqpvbo.supabase.co
SUPABASE_SERVICE_ROLE_KEY=PASTE_SERVICE_ROLE_KEY
PROXY_BASE=http://127.0.0.1:3000
RELAY_BASE=ws://127.0.0.1:8080
UPSTREAM_ENV=/home/ubuntu/binance-proxy/.env
BINANCE_API_KEY_2=PASTE_ASEC_KEY
BINANCE_API_SECRET_2=PASTE_ASEC_SECRET
```

Then lock it down and sanity-check that only key **names** appear:

```bash
chmod 600 /home/ubuntu/chat-listener/.env
grep -o '^[A-Z_0-9]*' /home/ubuntu/chat-listener/.env
```

Expected output: the seven names above, nothing else.

### A2. Install `main.js`

I write `main.js` next and hand it over as a single file to save into `/home/ubuntu/chat-listener/main.js` (via nano, to avoid paste mangling again).

### A3. Start it under pm2

```bash
cd /home/ubuntu/chat-listener
pm2 start main.js --name chat-listener
pm2 save
pm2 ls
pm2 logs chat-listener --lines 100
```

Expected in the logs: `accounts: 2`, one `socket open` line per account, then `saved message …` lines as chats move.

Handy later: `pm2 restart chat-listener`, `pm2 logs chat-listener`, `pm2 describe chat-listener`.

### A4. Nothing else changes
No new inbound ports (outbound/localhost only), no nginx edits, no instance upgrade. pm2 already restarts crashed apps, and `pm2 save` makes it survive reboot.

## Part B — What `main.js` does (~200 lines)

1. Loads `/home/ubuntu/chat-listener/.env` plus the upstream proxy `.env` (for Blynk's key/secret and the proxy tokens), so no credential is duplicated.
2. Reads active accounts from `terminal_exchange_accounts` with a service-role Supabase client and maps each `credential_key` to its key/secret pair — the same rule the edge functions use.
3. Per account: `GET http://127.0.0.1:3000/api/sapi/v1/c2c/chat/retrieveChatCredential` with `x-proxy-token` plus that account's `x-api-key` / `x-api-secret`, then opens **one** socket to `ws://127.0.0.1:8080/?key=<PROXY_TOKEN>&target=<chatWssUrl>/<listenKey>?token=<listenToken>&clientType=web` — exactly the shape the browser uses today.
4. Every inbound frame is normalised and upserted into `binance_order_chat_messages` on `dedupe_key` (column exists), stamped with `exchange_account_id`. Idempotent, so the browser's archive sync writing the same message never duplicates.
5. Credentials refresh every 25 minutes; sockets reconnect with exponential backoff; a rejected listenKey clears the cache and re-fetches.
6. Heartbeat into `terminal_collector_state` (`id='chat_listener'`) every 15 s: connected sockets, last message time, reconnect count.
7. Sending is untouched — it stays on the existing browser socket / `chat/send` proxy route. This service only listens.

## Part C — Terminal (app) side

1. Add `binance_order_chat_messages` to the Supabase realtime publication and subscribe in the chat hook, so messages paint instantly from our own database.
2. Chat opens from database rows first; with the listener running, history is complete even after a reload.
3. Browser socket becomes send-only — keep it for sending/typing, drop the REST reconciliation poll while the listener heartbeat is healthy.
4. "Live chat: connected / stale" chip beside the existing orders banner, driven by the `chat_listener` heartbeat row.
5. Fallback: if the heartbeat goes stale, browsers transparently resume today's behaviour (own socket + poll), so nothing breaks if the box goes down.

## Verification before calling it done
- `pm2 ls` shows `chat-listener` online with restarts not climbing.
- A live test message in an open order appears as a new row in `binance_order_chat_messages` within seconds, with the correct `exchange_account_id` and no duplicate rows.
- `terminal_collector_state` has a fresh `chat_listener` heartbeat.
- Terminal chat shows history instantly on open and updates without the browser socket doing the fetching.

## Order of work
A1 (env fix) → I write `main.js` → A3 start under pm2 → verify live messages in the database → Part C in the app, fallback kept throughout → key rotation confirmed.
