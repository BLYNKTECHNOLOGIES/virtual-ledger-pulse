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
const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
  // Node 20 has no global WebSocket; supabase-js realtime needs an explicit transport
  realtime: { transport: WebSocket },
});

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

// ---- Binance chat credential ----
// Primary: local proxy (same route the ERP edge functions use successfully).
// The proxy signs the request itself and sends the clientType header.
const PROXY_BASE = process.env.PROXY_BASE || 'http://127.0.0.1:3000';

function parseCred(body) {
  if (body?.code !== '000000' || !body?.data?.chatWssUrl) return null;
  const d = body.data;
  return { chatWssUrl: d.chatWssUrl, listenKey: d.listenKey, listenToken: d.listenToken || d.token };
}

async function fetchChatCredential(apiKey, apiSecret) {
  let lastErr = '';
  // 1) via proxy
  try {
    const res = await fetch(`${PROXY_BASE}/api/sapi/v1/c2c/chat/retrieveChatCredential`, {
      headers: {
        'Content-Type': 'application/json',
        'x-proxy-token': RELAY_TOKEN,
        'x-api-key': apiKey,
        'x-api-secret': apiSecret,
        'clientType': 'web',
      },
    });
    const body = await res.json().catch(() => null);
    const cred = parseCred(body);
    if (cred) return cred;
    lastErr = `proxy ${res.status} ${JSON.stringify(body).slice(0, 160)}`;
  } catch (e) {
    lastErr = `proxy error ${e.message}`;
  }
  // 2) direct signed call, with clientType header (Binance requires it for chat)
  const qs = `timestamp=${Date.now()}`;
  const sig = crypto.createHmac('sha256', apiSecret).update(qs).digest('hex');
  const url = `https://api.binance.com/sapi/v1/c2c/chat/retrieveChatCredential?${qs}&signature=${sig}`;
  const res2 = await fetch(url, {
    headers: { 'X-MBX-APIKEY': apiKey, 'Content-Type': 'application/json', 'clientType': 'web' },
  });
  const body2 = await res2.json().catch(() => null);
  const cred2 = parseCred(body2);
  if (cred2) return cred2;
  throw new Error(`chat credential failed: ${lastErr} | direct ${res2.status} ${JSON.stringify(body2).slice(0, 160)}`);
}


// Stable key for a chat that Binance delivers without an order number.
// Uses Binance's own chat group id when present, otherwise the counterparty
// user number. Never invents an order number.
function inquiryThreadKey(m) {
  const group = m?.chatGroupId || m?.groupId || m?.chatGroupNo || m?.groupNo;
  if (group) return `INQ-${String(group)}`;
  const users = [m?.fromUserNo, m?.toUserNo, m?.userNo, m?.counterPartyUserNo]
    .filter(Boolean)
    .map(String)
    .sort();
  if (users.length) return `INQ-${users.join('-')}`;
  return null;
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
    capture_source: 'listener_ws',
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
    // Binance can redeliver a message between the read and insert. Every
    // supported identity has a database unique index, so a race is harmless.
    if (error?.code === '23505') return;
    if (error) { console.error('insert error', error.message); return; }
    stats.saved++;
    stats.lastMessageAt = new Date().toISOString();
    console.log(`saved message order=${row.order_number} type=${row.message_type} source=${row.capture_source}`);
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
    this.retryTimer = null;
  }

  async credential() {
    // Refresh the listenKey before Binance's 60-minute expiry. Re-fetching on
    // every reconnect plus proactively invalidating a key older than 25 min
    // keeps the socket session healthy.
    if (this.cred && Date.now() - this.credAt < 25 * 60 * 1000) return this.cred;
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
          // Binance also delivers chats that are NOT tied to an order (an
          // advertiser enquiry started from the ad). They used to be dropped
          // here, so those conversations were invisible in the terminal even
          // though the Binance app shows them. Store them under a stable
          // synthetic thread key derived from Binance's own chat identifiers.
          const threadKey = orderNo ? String(orderNo) : inquiryThreadKey(m);
          if (!threadKey) {
            console.log('skipped frame without order/thread id:', JSON.stringify(m || {}).slice(0, 220));
            continue;
          }
          try { await persist(normalize(threadKey, m, this.account.id)); }
          catch (e) { console.error('persist failed', e.message); }
        }
      });

      ws.on('close', (code, reason) => {
        this.connected = false;
        this.cred = null;
        this.retry(`close code=${code} reason=${reason?.toString() || 'none'}`);
      });
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
    if (this.retryTimer) return;
    stats.reconnects++;
    const wait = this.backoff;
    this.backoff = Math.min(this.backoff * 2, 60000);
    console.log(`reconnect ${this.account.account_name} in ${wait}ms (${reason})`);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, wait);
  }

  stop() {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    try { this.ws?.close(); } catch {}
  }
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

setInterval(syncAccounts, ACCOUNT_REFRESH_MS);
setInterval(heartbeat, HEARTBEAT_MS);

process.on('SIGTERM', () => { for (const s of sockets.values()) s.stop(); process.exit(0); });
process.on('unhandledRejection', (e) => console.error('unhandledRejection', e?.message || e));

syncAccounts().then(heartbeat);
console.log('chat-listener started');
