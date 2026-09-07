# Phase 3b — Always-on chat listener on Lightsail

## One correction before we start (verified in code)

The Binance chat socket is **one connection per Binance account**, not one per chat. The credential call (`retrieveChatCredential`) returns a single `listenKey` + `listenToken` per account, and every order's messages for that account arrive on that one socket through the relay. So with 2 Binance accounts the listener holds **2 sockets**, and 50 concurrent chats cost nothing extra.

That makes the hardware question easy: the $5 Lightsail plan (1 GB / 1 vCPU) is more than enough. Take the $10 (2 GB) plan only if you want headroom for logs and future services.

## Part A — Lightsail setup (copy-paste)

### A1. Create the instance
In the Lightsail console: Create instance → Region **Mumbai (ap-south-1)** → Linux/Unix → **Ubuntu 24.04 LTS** → plan **$5 (1 GB)** or **$10 (2 GB)** → name it `blynk-chat-listener` → Create.

Then: Networking tab → leave only **SSH (22)** open, and restrict it to your own IP. No inbound ports are needed; the service only makes outbound connections.

### A2. Connect and prepare the box
Use the browser SSH button in Lightsail, or your own terminal. Then:

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install curl git ufw
curl -fsSL https://deno.land/install.sh | sudo DENO_INSTALL=/usr/local sh
deno --version
sudo ufw allow OpenSSH && sudo ufw --force enable
```

### A3. Create the service user and folder

```bash
sudo useradd -r -m -d /opt/chat-listener -s /usr/sbin/nologin chatsvc
sudo mkdir -p /opt/chat-listener
sudo chown chatsvc:chatsvc /opt/chat-listener
```

### A4. Put the secrets on the box (never in code)

```bash
sudo tee /etc/chat-listener.env >/dev/null <<'EOF'
SUPABASE_URL=https://vagiqbespusdxsbqpvbo.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<paste service role key>
BINANCE_PROXY_URL=<same value as the edge function secret>
BINANCE_PROXY_TOKEN=<same value as the edge function secret>
BINANCE_RELAY_URL=wss://relay.rewarnd.com
BINANCE_API_KEY=<account 1 key>
BINANCE_API_SECRET=<account 1 secret>
BINANCE_API_KEY_2=<account 2 key>
BINANCE_API_SECRET_2=<account 2 secret>
EOF
sudo chmod 600 /etc/chat-listener.env
```

### A5. Install the service (after I write the code)

```bash
sudo -u chatsvc git clone <repo-or-scp-the-file> /opt/chat-listener/app
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

Handy later: `sudo systemctl restart chat-listener`, `journalctl -u chat-listener -n 200`.

### A6. What to send me when the box is ready
Public IP, SSH key/user, and confirmation that the env file is filled in. I do not need the secret values themselves.

## Part B — What the listener service does

A single Deno file (~200 lines) on the instance:

1. Reads active Binance accounts from `terminal_exchange_accounts` (service-role Supabase client).
2. For each account, calls `retrieveChatCredential` through the existing proxy with that account's key/secret and opens **one** relay WebSocket: `wss://relay.rewarnd.com/?key=<token>&target=<chatWssUrl>/<listenKey>?token=<listenToken>&clientType=web` — exactly the URL shape the browser uses today.
3. On every inbound frame, normalises the message and upserts into `binance_order_chat_messages` on `dedupe_key` (table already has that column), tagging `exchange_account_id`. Idempotent, so browser archive-sync writing the same message causes no duplicates.
4. Refreshes credentials every 25 minutes and reconnects with exponential backoff on close/error; drops the cached credential when a socket is rejected.
5. Writes a heartbeat row into `terminal_collector_state` (`id='chat_listener'`) every 15 s with connected socket count, last message time and reconnect count.
6. Sending stays where it is — the browser/edge-function send path is unchanged.

## Part C — Terminal (app) side

1. **Realtime chat** — add `binance_order_chat_messages` to the Supabase realtime publication and subscribe in the chat hook so new rows paint instantly, instead of relying on the browser socket for freshness.
2. **Instant paint** — chat opens from the database rows first (already partly done in Phase 3a); with the listener running, history is always complete.
3. **Browser socket becomes send-only** — keep the socket for sending and typing state, drop the REST reconciliation poll while the listener heartbeat is healthy.
4. **Listener status chip** — reuse the existing collector heartbeat surface: show "Live chat: connected / stale" next to the orders banner, driven by the new `chat_listener` state row.
5. **Fallback** — if the listener heartbeat is stale, the browser transparently resumes today's behaviour (own socket + reconciliation poll), so nothing breaks if the box goes down.

## Order of work
A1–A4 by you → I write the listener service and hand you A5 → verify messages landing in the database live → then Part C in the app, with the fallback kept in place throughout.
