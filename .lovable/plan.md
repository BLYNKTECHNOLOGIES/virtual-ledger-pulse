# Phase 3b — Always-on chat listener on your existing relay box

## One correction before we start (verified in code)

The Binance chat socket is **one connection per Binance account**, not one per chat. The credential call (`retrieveChatCredential`) returns a single `listenKey` + `listenToken` per account, and every order's messages for that account arrive on that one socket through the relay. So with 2 Binance accounts the listener holds **2 sockets**, and 50 concurrent chats cost nothing extra.

Since you already run the Binance proxy/relay on an active instance, **no new server is needed**. The listener is one more small always-on service on that same box, and it can talk to the relay over localhost. Resource cost is negligible (tens of MB RAM, near-zero CPU) — no plan upgrade required unless the box is already tight on memory.

## Part A — Setup on the existing instance (copy-paste)

### A0. Sanity check the box first

```bash
free -m
df -h /
sudo systemctl list-units --type=service --state=running | grep -Ei 'proxy|relay|node|pm2|docker'
```

Send me that output — it tells me whether the existing relay runs under systemd, PM2 or Docker, so the new service matches the same style, and confirms free memory (need ~150 MB).

### A1. Install the runtime (skip if Node 20+ is already there)

```bash
node -v || true
curl -fsSL https://deno.land/install.sh | sudo DENO_INSTALL=/usr/local sh
deno --version
```

### A2. Service user and folder

```bash
sudo useradd -r -m -d /opt/chat-listener -s /usr/sbin/nologin chatsvc || true
sudo mkdir -p /opt/chat-listener/app
sudo chown -R chatsvc:chatsvc /opt/chat-listener
```

### A3. Secrets file (never in code)

Reuse the same proxy URL/token and Binance keys the existing service already uses.

```bash
sudo tee /etc/chat-listener.env >/dev/null <<'EOF'
SUPABASE_URL=https://vagiqbespusdxsbqpvbo.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<paste service role key>
BINANCE_PROXY_URL=http://127.0.0.1:<local proxy port>
BINANCE_PROXY_TOKEN=<same token the edge functions use>
BINANCE_RELAY_URL=ws://127.0.0.1:<local relay port>
BINANCE_API_KEY=<account 1 key>
BINANCE_API_SECRET=<account 1 secret>
BINANCE_API_KEY_2=<account 2 key>
BINANCE_API_SECRET_2=<account 2 secret>
EOF
sudo chmod 600 /etc/chat-listener.env
```

If localhost ports aren't obvious, we simply use the public `https://…` proxy URL and `wss://relay.rewarnd.com` — it works either way, localhost is just faster.

### A4. Install and run the service (after I write the code)

```bash
# copy main.ts to /opt/chat-listener/app/ (scp or git clone)
sudo tee /etc/systemd/system/chat-listener.service >/dev/null <<'EOF'
[Unit]
Description=Blynk Binance chat listener
After=network-online.target

[Service]
User=chatsvc
EnvironmentFile=/etc/chat-listener.env
WorkingDirectory=/opt/chat-listener/app
ExecStart=/usr/local/bin/deno run --allow-net --allow-env main.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now chat-listener
sudo systemctl status chat-listener
journalctl -u chat-listener -f
```

Later: `sudo systemctl restart chat-listener`, `journalctl -u chat-listener -n 200`.

### A5. Firewall / access
Nothing new to open — the listener only makes outbound connections. Existing relay inbound rules stay untouched. Keep SSH restricted to your IP.

### A6. What I need from you
The A0 output, SSH access details, and confirmation the env file is filled in. I don't need the secret values themselves.

## Part B — What the listener service does

A single file (~200 lines) on the instance:

1. Reads active Binance accounts from `terminal_exchange_accounts` (service-role Supabase client).
2. For each account, calls `retrieveChatCredential` through the proxy with that account's key/secret and opens **one** relay WebSocket: `<relay>/?key=<token>&target=<chatWssUrl>/<listenKey>?token=<listenToken>&clientType=web` — exactly the URL shape the browser uses today.
3. On every inbound frame, normalises the message and upserts into `binance_order_chat_messages` on `dedupe_key` (column already exists), tagging `exchange_account_id`. Idempotent, so the browser's archive sync writing the same message causes no duplicates.
4. Refreshes credentials every 25 minutes, reconnects with exponential backoff, and drops the cached credential when a socket is rejected.
5. Writes a heartbeat into `terminal_collector_state` (`id='chat_listener'`) every 15 s with connected socket count, last message time and reconnect count.
6. Sending is unchanged — it stays on the existing browser/edge-function path.

## Part C — Terminal (app) side

1. **Realtime chat** — add `binance_order_chat_messages` to the Supabase realtime publication and subscribe in the chat hook, so new rows paint instantly instead of depending on the browser socket.
2. **Instant paint** — chat opens from database rows first; with the listener running, history is always complete even after a reload.
3. **Browser socket becomes send-only** — keep it for sending/typing state, drop the REST reconciliation poll while the listener heartbeat is healthy.
4. **Listener status chip** — reuse the collector heartbeat surface: "Live chat: connected / stale" beside the orders banner, driven by the `chat_listener` state row.
5. **Fallback** — if the heartbeat goes stale, the browser transparently resumes today's behaviour (own socket + reconciliation poll), so nothing breaks if the box goes down.

## Order of work
A0–A3 by you → I write the listener service and hand you A4 → verify messages landing in the database live → then Part C in the app, with the fallback kept in place throughout.
