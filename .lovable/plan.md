# Phase 3b — Always-on chat listener on the existing relay box

## What we now know about the box (from your output)

- Ubuntu 22.04 LTS, 914 MB RAM (~450 MB free), 30 GB free disk — plenty for this.
- `/home/ubuntu/binance-proxy/server.js` — Express API proxy on **port 3000** (`/api/*`, token via `x-proxy-token`, per-request `x-api-key` / `x-api-secret`).
- `/home/ubuntu/binance-proxy/relay.js` — WebSocket chat relay on **port 8080** (`?key=<token>&target=<binance wss url>`).
- nginx terminates TLS on 443 and fronts both.
- Two `node` processes are running but not as systemd units — so they are started by pm2, nohup or a cron `@reboot`. One command below settles that.

**Key architectural point (verified in app code):** Binance chat is **one WebSocket per Binance account**, not per order. Every order's messages for an account arrive on that account's single socket. So 50 concurrent chats = 2 sockets (one per account). Memory cost is negligible.

## Part A — Setup on the existing instance

### A1. Two last discovery commands

```bash
pm2 ls; crontab -l; ps -o pid,ppid,cmd -p 365454 -p 365462
grep -o '^[A-Z_]*' /home/ubuntu/binance-proxy/.env
```

The first tells me how the existing node apps are kept alive (so the listener matches that style); the second lists only the **names** of the env keys already present (no values), so I know whether account-2 keys are already on the box.

### A2. Runtime

Node is already installed and in use, so the listener will be a plain Node file — no new runtime to install.

```bash
node -v && npm -v
```

### A3. Create the service folder

```bash
mkdir -p /home/ubuntu/chat-listener
cd /home/ubuntu/chat-listener
npm init -y
npm install ws @supabase/supabase-js dotenv
```

### A4. Secrets file (values never in code)

```bash
cat > /home/ubuntu/chat-listener/.env <<'EOF'
SUPABASE_URL=https://vagiqbespusdxsbqpvbo.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<paste service role key>
PROXY_BASE=http://127.0.0.1:3000
RELAY_BASE=ws://127.0.0.1:8080
PROXY_TOKEN=<same value server.js uses>
BINANCE_API_KEY=<account 1 key>
BINANCE_API_SECRET=<account 1 secret>
BINANCE_API_KEY_2=<account 2 key>
BINANCE_API_SECRET_2=<account 2 secret>
EOF
chmod 600 /home/ubuntu/chat-listener/.env
```

Localhost is used deliberately: no TLS hop, no public round-trip, and nginx stays untouched.

### A5. Install `main.js` (I write this after A1) and run it under systemd

```bash
sudo tee /etc/systemd/system/chat-listener.service >/dev/null <<'EOF'
[Unit]
Description=Blynk Binance chat listener
After=network-online.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/chat-listener
ExecStart=/usr/bin/node main.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now chat-listener
sudo systemctl status chat-listener --no-pager
journalctl -u chat-listener -f
```

(If A1 shows pm2 running the other two apps, we use `pm2 start main.js --name chat-listener && pm2 save` instead, to keep one process manager.)

### A6. Optional hardening on the same box
- `sudo fallocate -l 512M /swapfile` style extra swap only if memory gets tight later — not needed now.
- No new inbound ports: the listener is outbound-only, connecting to 127.0.0.1:3000 and 127.0.0.1:8080.

## Part B — What the listener does (`main.js`, ~200 lines)

1. Reads active accounts from `terminal_exchange_accounts` via a service-role Supabase client, mapping `credential_key` → the matching `BINANCE_API_KEY*` env pair (same rule the edge functions use).
2. Per account: `GET http://127.0.0.1:3000/api/sapi/v1/c2c/chat/retrieveChatCredential` with the proxy token and that account's key/secret, then opens **one** socket to `ws://127.0.0.1:8080/?key=<PROXY_TOKEN>&target=<chatWssUrl>/<listenKey>?token=<listenToken>&clientType=web` — the exact shape the browser uses today.
3. Every inbound frame is normalised and upserted into `binance_order_chat_messages` on `dedupe_key` (column already exists), stamped with `exchange_account_id`. Idempotent, so the browser's archive sync writing the same message causes no duplicates.
4. Credentials refresh every 25 minutes; sockets reconnect with exponential backoff; a rejected listenKey drops the cache and re-fetches.
5. Heartbeat row in `terminal_collector_state` (`id='chat_listener'`) every 15 s: connected sockets, last message time, reconnect count.
6. Sending is unchanged — it stays on the existing browser/edge-function path.

## Part C — Terminal (app) side

1. Add `binance_order_chat_messages` to the Supabase realtime publication and subscribe in the chat hook, so new messages paint instantly from our database.
2. Chat opens from database rows first; with the listener running, history is always complete even after a reload.
3. Browser socket becomes send-only — keep it for sending/typing, drop the REST reconciliation poll while the listener heartbeat is healthy.
4. "Live chat: connected / stale" chip beside the existing orders banner, driven by the `chat_listener` heartbeat row.
5. Fallback: if the heartbeat goes stale, the browser transparently resumes today's behaviour (own socket + poll), so nothing breaks if the box goes down.

## Order of work
A1 output from you → I write `main.js` and give you A3–A5 exactly → verify live messages landing in the database → then Part C in the app, fallback kept throughout.
