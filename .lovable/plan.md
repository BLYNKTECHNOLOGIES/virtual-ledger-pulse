# Phase 3b — Chat listener: remaining steps

## Checks on what you've already done — all correct
- `/home/ubuntu/chat-listener` created, `npm init -y` done, `ws` + `@supabase/supabase-js` + `dotenv` installed (11 packages, 0 vulnerabilities).
- `.env` reads back exactly the seven expected keys and is `chmod 600`.
- `pm2` shows `binance-proxy` and `chat-relay` online; the listener joins them as a third app.
- The last attempt failed only because nano closed before the paste landed, so the script went into bash instead of into the file. Nothing was created and nothing was damaged — the stray `command not found` noise is harmless.

## Step 1 — Create `main.js` (paste-proof method)

Your terminal is injecting bracketed-paste characters, which is what mangled both earlier attempts. Turn that off first, then paste into a quoted heredoc — inside `<<'JSEOF'` bash treats every line as plain text, so parentheses and backticks can't be interpreted:

```bash
bind 'set enable-bracketed-paste off'
```

Then paste the whole block below in one go — from `cat > ...` down to and including the final `JSEOF` line — and press Enter:

```bash
cat > /home/ubuntu/chat-listener/main.js <<'JSEOF'
<PASTE THE JAVASCRIPT BELOW HERE>
JSEOF
```

Verify:

```bash
wc -l /home/ubuntu/chat-listener/main.js
node --check /home/ubuntu/chat-listener/main.js
```

Expect roughly 250 lines and no output at all from `node --check` (silence means it parses). If you see `cat: command not found` again, the bracketed-paste toggle didn't take — in that case run `nano /home/ubuntu/chat-listener/main.js`, **wait for the blue editor to actually appear**, paste there, then `Ctrl+O`, `Enter`, `Ctrl+X`.

The script is verified against the app's own credential fetch, relay URL shape and message-normalisation logic, so the rows it writes are identical in shape to what the ERP already stores.

```js

'use strict';
const fs = require('fs');
const crypto = require('crypto');
const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/home/ubuntu/chat-listener/.env' });

// ---- config -------------------------------------------------------------
function loadEnvFile(p) {
  const out = {};
  try {
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].trim();
    }
  } catch (e) { console.error('cannot read upstream env', p, e.message); }
  return out;
}

const up = loadEnvFile(process.env.UPSTREAM_ENV || '/home/ubuntu/binance-proxy/.env');
const RELAY_BASE = process.env.RELAY_BASE || 'ws://127.0.0.1:8080';
const RELAY_TOKEN = up.BINANCE_PROXY_TOKEN || up.PROXY_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !RELAY_TOKEN) {
  console.error('missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / relay token');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CRED_TTL_MS = 25 * 60 * 1000;
const HEARTBEAT_MS = 15 * 1000;
const ACCOUNT_REFRESH_MS = 5 * 60 * 1000;

// credential_key -> { key, secret }
function secretsFor(credentialKey) {
  if (!credentialKey || credentialKey === 'default') {
    return { key: up.BINANCE_API_KEY, secret: up.BINANCE_API_SECRET };
  }
  const m = String(credentialKey).match(/^acct(\d+)$/i);
  const sfx = m ? `_${m[1]}` : `_${String(credentialKey).toUpperCase()}`;
  return {
    key: process.env[`BINANCE_API_KEY${sfx}`] || up[`BINANCE_API_KEY${sfx}`],
    secret: process.env[`BINANCE_API_SECRET${sfx}`] || up[`BINANCE_API_SECRET${sfx}`],
  };
}

// ---- Binance chat credential (signed, direct — same as the send path) ----
async function fetchChatCredential(apiKey, apiSecret) {
  const qs = `timestamp=${Date.now()}&recvWindow=5000`;
  const sig = crypto.createHmac('sha256', apiSecret).update(qs).digest('hex');
  const url = `https://api.binance.com/sapi/v1/c2c/chat/retrieveChatCredential?${qs}&signature=${sig}`;
  const res = await fetch(url, { headers: { 'X-MBX-APIKEY': apiKey, 'Content-Type': 'application/json' } });
  const body = await res.json().catch(() => null);
  if (body?.code !== '000000' || !body?.data?.chatWssUrl) {
    throw new Error(`chat credential failed: ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
  }
  const d = body.data;
  return { chatWssUrl: d.chatWssUrl, listenKey: d.listenKey, listenToken: d.listenToken || d.token };
}

// ---- message normalisation (mirrors binance-ads/normalizeChatMessage) ----
function normalize(orderNo, msg, accountId) {
  const contentType = msg?.contentType == null ? null : String(msg.contentType).toLowerCase();
  const rawType = String(msg?.type || msg?.chatMessageType || msg?.messageType || contentType || 'unknown').toLowerCase();
  const known = new Set(['text','image','system','recall','mark','card','video','translate','error']);
  const messageType = known.has(rawType) ? rawType : (rawType || 'unknown');
  const content = msg?.content ?? msg?.message ?? msg?.text ?? null;
  const createTime = Number(msg?.createTime || msg?.time || 0);
  const isSystem = messageType === 'system' ||
    (msg?.self === undefined && /system|notice|risk|warning|kyc|appeal|complaint/i.test(String(content || '')));
  const isRecall = messageType === 'recall' || /recall|retract|withdraw/i.test(messageType);
  const isCompliance = isSystem || isRecall || ['card','video','error','mark'].includes(messageType);
  const id = msg?.id == null ? null : String(msg.id);
  const uuid = msg?.uuid == null ? null : String(msg.uuid);
  const fallback = `${orderNo}-${createTime || 'no-time'}-${messageType}-${String(content || JSON.stringify(msg || {})).slice(0,160)}`;
  return {
    order_number: orderNo,
    dedupe_key: id || uuid || fallback,
    binance_message_id: id,
    binance_uuid: uuid,
    message_type: messageType,
    chat_message_type: msg?.chatMessageType == null ? null : String(msg.chatMessageType),
    content_type: contentType,
    sender_is_self: typeof msg?.self === 'boolean' ? msg.self : (typeof msg?.isSelf === 'boolean' ? msg.isSelf : null),
    sender_nickname: msg?.fromNickName || msg?.senderNickName || msg?.nickName || null,
    message_status: msg?.status == null ? (msg?.sendStatus == null ? null : String(msg.sendStatus)) : String(msg.status),
    binance_create_time: Number.isFinite(createTime) && createTime > 0 ? createTime : null,
    binance_created_at: Number.isFinite(createTime) && createTime > 0 ? new Date(createTime).toISOString() : null,
    message_text: typeof content === 'string' ? content : (content == null ? null : JSON.stringify(content)),
    image_url: msg?.imageUrl || null,
    thumbnail_url: msg?.thumbnailUrl || null,
    raw_payload: msg,
    is_system_message: isSystem,
    is_recall: isRecall,
    is_compliance_relevant: isCompliance,
    exchange_account_id: accountId,
    updated_at: new Date().toISOString(),
  };
}

const stats = { saved: 0, lastMessageAt: null, reconnects: 0 };

async function persist(row) {
  const { data: existing, error: readErr } = await sb
    .from('binance_order_chat_messages')
    .select('id')
    .eq('order_number', row.order_number)
    .eq('dedupe_key', row.dedupe_key)
    .eq('exchange_account_id', row.exchange_account_id)
    .maybeSingle();
  if (readErr) { console.error('read error', readErr.message); return; }
  if (existing?.id) {
    const { error } = await sb.from('binance_order_chat_messages').update(row).eq('id', existing.id);
    if (error) console.error('update error', error.message);
  } else {
    const { error } = await sb.from('binance_order_chat_messages')
      .insert({ ...row, captured_at: new Date().toISOString() });
    if (error) { console.error('insert error', error.message); return; }
    stats.saved++;
    stats.lastMessageAt = new Date().toISOString();
    console.log(`saved message order=${row.order_number} type=${row.message_type}`);
  }
}

// ---- one socket per Binance account -------------------------------------
class AccountSocket {
  constructor(account) {
    this.account = account;           // { id, account_name, credential_key }
    this.ws = null;
    this.backoff = 1000;
    this.credAt = 0;
    this.cred = null;
    this.stopped = false;
    this.connected = false;
  }

  async credential() {
    if (this.cred && Date.now() - this.credAt < CRED_TTL_MS) return this.cred;
    const { key, secret } = secretsFor(this.account.credential_key);
    if (!key || !secret) throw new Error(`no API secrets for ${this.account.account_name} (${this.account.credential_key})`);
    this.cred = await fetchChatCredential(key, secret);
    this.credAt = Date.now();
    return this.cred;
  }

  async connect() {
    if (this.stopped) return;
    try {
      const c = await this.credential();
      const target = `${c.chatWssUrl}/${c.listenKey}?token=${c.listenToken}&clientType=web`;
      const url = `${RELAY_BASE}/?key=${encodeURIComponent(RELAY_TOKEN)}&target=${encodeURIComponent(target)}`;
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.on('open', () => {
        this.connected = true;
        this.backoff = 1000;
        console.log(`socket open: ${this.account.account_name}`);
      });

      ws.on('message', async (buf) => {
        let msg;
        try { msg = JSON.parse(buf.toString()); } catch { return; }
        const payload = msg?.data ?? msg;
        const list = Array.isArray(payload) ? payload : [payload];
        for (const m of list) {
          const orderNo = m?.orderNo || m?.orderNumber || m?.order_no;
          if (!orderNo) continue;
          try { await persist(normalize(String(orderNo), m, this.account.id)); }
          catch (e) { console.error('persist failed', e.message); }
        }
      });

      ws.on('close', () => { this.connected = false; this.cred = null; this.retry('close'); });
      ws.on('error', (e) => { this.connected = false; console.error(`socket error ${this.account.account_name}:`, e.message); });

      ws.on('ping', () => { try { ws.pong(); } catch {} });
    } catch (e) {
      console.error(`connect failed ${this.account.account_name}:`, e.message);
      this.cred = null;
      this.retry('error');
    }
  }

  retry(reason) {
    if (this.stopped) return;
    stats.reconnects++;
    const wait = this.backoff;
    this.backoff = Math.min(this.backoff * 2, 60000);
    console.log(`reconnect ${this.account.account_name} in ${wait}ms (${reason})`);
    setTimeout(() => this.connect(), wait);
  }

  stop() { this.stopped = true; try { this.ws?.close(); } catch {} }
}

// ---- orchestration ------------------------------------------------------
const sockets = new Map();

async function syncAccounts() {
  const { data, error } = await sb
    .from('terminal_exchange_accounts')
    .select('id, account_name, credential_key, is_active')
    .eq('is_active', true);
  if (error) { console.error('account fetch failed', error.message); return; }
  const active = data || [];
  console.log(`accounts: ${active.length}`);
  for (const acct of active) {
    if (!sockets.has(acct.id)) {
      const s = new AccountSocket(acct);
      sockets.set(acct.id, s);
      s.connect();
    }
  }
  for (const [id, s] of sockets) {
    if (!active.find((a) => a.id === id)) { s.stop(); sockets.delete(id); }
  }
}

async function heartbeat() {
  const connected = [...sockets.values()].filter((s) => s.connected).length;
  const { error } = await sb.from('terminal_collector_state').upsert({
    id: 'chat_listener',
    last_tick_at: new Date().toISOString(),
    last_status: connected > 0 ? 'ok' : 'error',
    detail: {
      accounts: sockets.size,
      connected,
      savedMessages: stats.saved,
      lastMessageAt: stats.lastMessageAt,
      reconnects: stats.reconnects,
    },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) console.error('heartbeat failed', error.message);
}

// refresh credentials every 25 min by cycling sockets
setInterval(() => {
  for (const s of sockets.values()) { s.cred = null; try { s.ws?.close(); } catch {} }
}, CRED_TTL_MS);

setInterval(syncAccounts, ACCOUNT_REFRESH_MS);
setInterval(heartbeat, HEARTBEAT_MS);

process.on('SIGTERM', () => { for (const s of sockets.values()) s.stop(); process.exit(0); });
process.on('unhandledRejection', (e) => console.error('unhandledRejection', e?.message || e));

syncAccounts().then(heartbeat);
console.log('chat-listener started');
```

## Step 2 — Start it under pm2

```bash
cd /home/ubuntu/chat-listener
pm2 start main.js --name chat-listener
pm2 save
pm2 logs chat-listener --lines 50
```

Expected in the logs: `chat-listener started`, `accounts: 2`, then one `socket open: …` line per Binance account. Once a chat moves you should see `saved message order=… type=text`.

If a line reads `no API secrets for ASEC Binance`, the `BINANCE_API_KEY_2` pair in `.env` isn't matching — everything else keeps running for Blynk meanwhile.

## Step 3 — Verify it is actually landing data

- New rows appear in `binance_order_chat_messages` within seconds of a live message, with the right `exchange_account_id` and no duplicates.
- `terminal_collector_state` has a fresh `chat_listener` row with `connected: 2`.
- `pm2 ls` restart counter for `chat-listener` stays flat.

I run the database side of this verification from here once you report the logs.

## Step 4 — Terminal (app) side, after Step 3 passes

1. Add `binance_order_chat_messages` to the Supabase realtime publication and subscribe in the chat hook, so messages paint straight from our database.
2. Chat opens from database rows first; history stays complete across reloads.
3. Browser socket becomes send-only — keep it for sending/typing, drop the REST reconciliation poll while the listener heartbeat is healthy.
4. "Live chat: connected / stale" chip beside the existing orders banner, driven by the `chat_listener` heartbeat.
5. Fallback: if the heartbeat goes stale, browsers silently resume today's behaviour (own socket + poll), so nothing breaks if the box goes down.

## What `main.js` does
1. Loads its own `.env` plus the proxy `.env`, so Blynk's key/secret and the relay token are never duplicated.
2. Reads active accounts from `terminal_exchange_accounts` with a service-role client and maps each `credential_key` to its key/secret pair — the same rule the edge functions use.
3. Per account: signed `retrieveChatCredential` call to Binance, then **one** socket through the local relay — the exact URL shape the browser uses today. 50 concurrent chats = 2 sockets.
4. Every frame is normalised and de-duplicated on `dedupe_key`, so the browser's archive sync writing the same message never doubles up.
5. Credentials cycle every 25 minutes; sockets reconnect with exponential backoff; a rejected listenKey clears the cache and re-fetches.
6. Heartbeat into `terminal_collector_state` (`chat_listener`) every 15 s.
7. Sending is untouched — this service only listens.
