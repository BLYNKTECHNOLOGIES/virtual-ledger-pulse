// Auto Screenshot Sender — generates a UPI receipt PNG and posts it to the Binance order chat
// Triggered from PayerOrderRow when a Payer clicks "Mark Paid" on an eligible UPI BUY order.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Resvg, initWasm } from "https://esm.sh/@resvg/resvg-wasm@2.6.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

let wasmReady: Promise<void> | null = null;
let fontBuffersReady: Promise<Uint8Array[]> | null = null;

async function ensureWasm() {
  if (!wasmReady) {
    wasmReady = (async () => {
      const wasmResp = await fetch("https://esm.sh/@resvg/resvg-wasm@2.6.2/index_bg.wasm");
      const wasmBuf = await wasmResp.arrayBuffer();
      await initWasm(wasmBuf);
    })();
  }
  return wasmReady;
}

async function ensureFonts() {
  if (!fontBuffersReady) {
    fontBuffersReady = (async () => {
      const fontUrls = [
        "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.17/files/inter-latin-400-normal.ttf",
        "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.17/files/inter-latin-600-normal.ttf",
        "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.17/files/inter-latin-700-normal.ttf",
      ];

      const buffers = await Promise.all(
        fontUrls.map(async (url) => {
          const resp = await fetch(url);
          if (!resp.ok) {
            throw new Error(`font fetch failed ${resp.status} for ${url}`);
          }
          return new Uint8Array(await resp.arrayBuffer());
        })
      );

      return buffers;
    })();
  }

  return fontBuffersReady;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function generateUpiTxnId(): string {
  const firstDigit = ["5", "8", "9"][Math.floor(Math.random() * 3)];
  let rest = "";
  for (let i = 0; i < 9; i++) rest += Math.floor(Math.random() * 10).toString();
  return firstDigit + rest;
}

function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${pad(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()}, ${pad(h)}:${pad(m)} ${ampm}`;
}

function fmtINR(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildSvg(args: {
  toUpiId: string;
  amount: number;
  fee: number;
  total: number;
  upiTxnId: string;
  fromName: string;
  fromUpiId: string;
  dateTime: string;
}): string {
  const W = 420;
  const headerH = 200;
  const rowH = 38;
  const detailsTop = headerH + 16;
  const rows = args.fee > 0 ? 6 : 5;
  const H = detailsTop + rows * rowH + 24;
  const dt = formatDateTime(args.dateTime);

  let detailsSvg = "";
  let y = detailsTop;
  const drawRow = (label: string, valueLines: { text: string; size: number; bold?: boolean; color?: string }[], hasBorder = true) => {
    let line = "";
    let ly = y + 22;
    for (const v of valueLines) {
      line += `<text x="${W - 24}" y="${ly}" text-anchor="end" font-family="Inter, sans-serif" font-size="${v.size}" ${v.bold ? 'font-weight="600"' : ""} fill="${v.color || "#222"}">${escapeXml(v.text)}</text>`;
      ly += v.size + 2;
    }
    detailsSvg += `
      <text x="24" y="${y + 22}" font-family="Inter, sans-serif" font-size="13" fill="#888">${escapeXml(label)}</text>
      ${line}
      ${hasBorder ? `<line x1="24" y1="${y + rowH - 1}" x2="${W - 24}" y2="${y + rowH - 1}" stroke="#f0f0f0" stroke-width="1"/>` : ""}
    `;
    y += rowH;
  };

  drawRow("To", [{ text: args.toUpiId, size: 13, bold: true }]);
  drawRow("From", [
    { text: args.fromName, size: 13, bold: true },
    { text: args.fromUpiId, size: 11, color: "#888" },
  ]);
  drawRow("UPI Transaction ID", [{ text: args.upiTxnId, size: 12 }]);
  drawRow("Paid Amount", [{ text: fmtINR(args.amount), size: 13, bold: true }]);
  if (args.fee > 0) drawRow("Payment Provider Fees", [{ text: fmtINR(args.fee), size: 13 }]);
  drawRow("Total Debited", [{ text: fmtINR(args.total), size: 13, bold: true }], false);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a9e6f"/>
      <stop offset="50%" stop-color="#2bb87e"/>
      <stop offset="100%" stop-color="#1a8f65"/>
    </linearGradient>
    <clipPath id="card"><rect x="0" y="0" width="${W}" height="${H}" rx="12" ry="12"/></clipPath>
  </defs>
  <g clip-path="url(#card)">
    <rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>
    <rect x="0" y="0" width="${W}" height="${headerH}" fill="url(#g)"/>
    <text x="${W / 2}" y="48" text-anchor="middle" font-family="Inter, sans-serif" font-size="13" fill="#ffffff" opacity="0.9">To ${escapeXml(args.toUpiId)}</text>
    <text x="${W / 2}" y="92" text-anchor="middle" font-family="Inter, sans-serif" font-size="32" font-weight="700" fill="#ffffff">${escapeXml(fmtINR(args.amount).replace(/\.00$/, ".00"))}</text>
    <rect x="${W / 2 - 60}" y="110" width="120" height="28" rx="14" ry="14" fill="rgba(255,255,255,0.22)"/>
    <text x="${W / 2}" y="129" text-anchor="middle" font-family="Inter, sans-serif" font-size="12" font-weight="600" fill="#ffffff">✓ Completed</text>
    <text x="${W / 2}" y="160" text-anchor="middle" font-family="Inter, sans-serif" font-size="12" fill="#ffffff" opacity="0.85">${escapeXml(dt)}</text>
    ${detailsSvg}
  </g>
</svg>`;
}

async function renderPng(svg: string): Promise<Uint8Array> {
  await ensureWasm();
  const fontBuffers = await ensureFonts();
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 840 },
    font: {
      fontBuffers,
      defaultFontFamily: "Inter",
      sansSerifFamily: "Inter",
      loadSystemFonts: false,
    },
  });
  return resvg.render().asPng();
}

async function callBinance(supabase: any, action: string, payload: any) {
  // binance-ads parses body as { action, ...payload } — payload fields must be top-level, NOT nested.
  const { data, error } = await supabase.functions.invoke("binance-ads", { body: { action, ...payload } });
  if (error) throw new Error(`binance-ads ${action} failed: ${error.message || error}`);
  return data;
}

function extractUpi(payMethods: any[]): { upiId: string | null; raw: any } {
  for (const m of payMethods || []) {
    const id = (m.identifier || m.payType || m.tradeMethodName || "").toString();
    if (/upi/i.test(id) || /UPI/i.test(m.payType || "")) {
      const fields = Array.isArray(m.fields) ? m.fields : [];
      const upiField = fields.find((f: any) => /upi/i.test(f.fieldName || "") || /vpa/i.test(f.fieldName || ""))
        || fields.find((f: any) => /account/i.test(f.fieldName || ""));
      const upi = upiField?.fieldValue || m.payAccount || m.payeeAccount || m.account || null;
      return { upiId: upi, raw: m };
    }
  }
  // fallback: any method whose first field looks like a UPI VPA (contains @)
  for (const m of payMethods || []) {
    const fields = Array.isArray(m.fields) ? m.fields : [];
    for (const f of fields) {
      const v = String(f.fieldValue || "");
      if (v.includes("@")) return { upiId: v, raw: m };
    }
  }
  return { upiId: null, raw: null };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractChatMessages(resp: any): any[] {
  const outer = resp?.data ?? resp;
  const inner = outer?.data ?? outer;

  if (Array.isArray(inner)) return inner;
  if (Array.isArray(inner?.list)) return inner.list;
  if (Array.isArray(inner?.messages)) return inner.messages;
  if (Array.isArray(outer?.list)) return outer.list;
  return [];
}

async function getChatCredential(supabase: any): Promise<{
  chatWssUrl: string;
  listenKey: string;
  token: string;
  relayUrl?: string;
  relayToken?: string;
} | null> {
  const resp = await callBinance(supabase, "getChatCredential", {});
  if (resp?.success === false) return null;

  const outer = resp?.data ?? resp;
  const inner = outer?.data ?? outer;
  const token = inner?.listenToken || inner?.token;

  if (!inner?.chatWssUrl || !inner?.listenKey || !token) return null;

  return {
    chatWssUrl: inner.chatWssUrl,
    listenKey: inner.listenKey,
    token,
    relayUrl: outer?._relay?.relayUrl,
    relayToken: outer?._relay?.relayToken,
  };
}

async function verifyImageDelivery(supabase: any, orderNo: string, imageUrl: string, sentAfterMs: number) {
  try {
    const resp = await callBinance(supabase, "getChatMessages", {
      orderNo,
      page: 1,
      rows: 20,
      sort: "desc",
    });
    if (resp?.success === false) return false;

    const messages = extractChatMessages(resp);
    return messages.some((msg: any) => {
      const createTime = Number(msg?.createTime || 0);
      const content = String(msg?.content || msg?.message || "");
      const msgImage = String(msg?.imageUrl || msg?.thumbnailUrl || "");
      const isSelf = msg?.self === true || msg?.isSelf === true;

      return isSelf
        && (!createTime || createTime >= sentAfterMs - 5000)
        && (
          content === imageUrl
          || content.includes(imageUrl)
          || msgImage === imageUrl
          || msgImage.includes(imageUrl)
        );
    });
  } catch (err) {
    console.warn("verifyImageDelivery failed", err);
    return false;
  }
}

async function sendImageViaWs(credential: {
  chatWssUrl: string;
  listenKey: string;
  token: string;
  relayUrl?: string;
  relayToken?: string;
}, orderNo: string, imageUrl: string) {
  const directTarget = `${credential.chatWssUrl}/${credential.listenKey}?token=${credential.token}&clientType=web`;
  const targets = [
    directTarget,
    credential.relayUrl && credential.relayToken
      ? `${credential.relayUrl}/?key=${encodeURIComponent(credential.relayToken)}&target=${encodeURIComponent(directTarget)}`
      : null,
  ].filter(Boolean) as string[];

  let lastError = "WebSocket delivery failed";

  for (const wsUrl of targets) {
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          try { ws.close(); } catch {}
          reject(new Error("WebSocket timeout (10s)"));
        }, 10000);

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          const now = Date.now();
          ws.send(JSON.stringify({
            type: "text",
            uuid: String(now),
            orderNo,
            content: imageUrl,
            self: true,
            clientType: "web",
            createTime: now,
            sendStatus: 0,
            topicId: orderNo,
            topicType: "ORDER",
          }));

          setTimeout(() => {
            clearTimeout(timeout);
            try { ws.close(); } catch {}
            resolve();
          }, 2500);
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          reject(new Error("WebSocket error"));
        };

        ws.onclose = () => {};
      });

      return;
    } catch (err: any) {
      lastError = err?.message || String(err);
    }
  }

  throw new Error(lastError);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") || "";
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const body = await req.json().catch(() => ({}));
  const orderNumber = String(body?.orderNumber || "").trim();
  const paidAtIso = String(body?.paidAtIso || new Date().toISOString());

  if (!orderNumber) {
    return new Response(JSON.stringify({ error: "orderNumber required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Resolve payer identity
  let payerId: string | null = null;
  let payerName: string | null = null;
  try {
    const { data: u } = await userClient.auth.getUser();
    payerId = u?.user?.id ?? null;
    if (payerId) {
      const { data: prof } = await adminClient.from("profiles").select("name,email").eq("user_id", payerId).maybeSingle();
      payerName = (prof as any)?.name || (prof as any)?.email || u?.user?.email || null;
    }
  } catch (_) { /* ignore */ }

  const logRow = async (status: string, extra: Record<string, any>, error_message?: string) => {
    try {
      await adminClient.from("payer_screenshot_automation_log").upsert({
        order_number: orderNumber,
        payer_user_id: payerId,
        payer_name: payerName,
        status,
        error_message: error_message ?? null,
        ...extra,
      }, { onConflict: "order_number" });
    } catch (e) {
      console.error("log insert failed", e);
    }
  };

  try {
    // 1. Load config
    const { data: cfg, error: cfgErr } = await adminClient
      .from("payer_screenshot_automation_config")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (cfgErr) throw cfgErr;
    if (!cfg || !cfg.is_active) {
      return new Response(JSON.stringify({ status: "automation_inactive" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2. Fetch order detail from Binance
    const detailResp = await callBinance(adminClient, "getOrderDetail", { orderNumber });
    // binance-ads returns { success, data: <binanceJson>, error? }
    // Binance JSON shape: { code: "000000", message, data: {...orderFields, tradeType, payMethods, totalPrice} }
    if (detailResp && detailResp.success === false) {
      await logRow("failed", {}, `binance-ads error: ${detailResp.error || "unknown"}`);
      return new Response(JSON.stringify({ status: "failed", error: detailResp.error }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const binJson = detailResp?.data ?? detailResp;
    if (binJson && binJson.code && binJson.code !== "000000") {
      await logRow("failed", {}, `binance code ${binJson.code}: ${binJson.message || ""}`);
      return new Response(JSON.stringify({ status: "failed", error: binJson.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const detail = binJson?.data ?? binJson;
    if (!detail || typeof detail !== "object") {
      await logRow("failed", {}, "order detail empty");
      return new Response(JSON.stringify({ status: "failed", error: "empty detail" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const tradeType = String(detail.tradeType || detail.orderType || "").toUpperCase();
    if (tradeType && tradeType !== "BUY") {
      await logRow("skipped_non_buy", {});
      return new Response(JSON.stringify({ status: "skipped_non_buy" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!tradeType) {
      await logRow("failed", {}, `tradeType missing in detail. keys=${Object.keys(detail).slice(0,20).join(",")}`);
      return new Response(JSON.stringify({ status: "failed", error: "tradeType missing" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const totalPrice = Number(detail.totalPrice ?? detail.amount ?? 0);
    const amountInt = Math.floor(totalPrice);

    // Range gate
    const min = Number(cfg.min_amount || 0);
    const max = Number(cfg.max_amount || 0);
    if (amountInt < min || amountInt > max) {
      await logRow("skipped_out_of_range", { amount_used: amountInt });
      return new Response(JSON.stringify({ status: "skipped_out_of_range", amount: amountInt, min, max }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // UPI extraction
    const payMethods = detail.payMethods || detail.payMethodList || detail.sellerPayMethod?.payMethods || [];
    const { upiId } = extractUpi(payMethods);
    if (!upiId) {
      await logRow("skipped_non_upi", { amount_used: amountInt });
      return new Response(JSON.stringify({ status: "skipped_non_upi" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const fee = Number(cfg.provider_fee_flat || 10);
    const total = amountInt + fee;
    const upiTxnId = generateUpiTxnId();

    // 3. Render PNG
    const svg = buildSvg({
      toUpiId: upiId,
      amount: amountInt,
      fee,
      total,
      upiTxnId,
      fromName: cfg.from_name,
      fromUpiId: cfg.from_upi_id,
      dateTime: paidAtIso,
    });
    const pngBytes = await renderPng(svg);

    // 4. Get upload URL from Binance
    const imageName = `${orderNumber}_${Date.now()}.png`;
    const uploadResp = await callBinance(adminClient, "getChatImageUploadUrl", { imageName });
    const outer = uploadResp?.data || uploadResp;
    const inner = outer?.data || outer;
    const preSignedUrl: string | undefined = inner?.uploadUrl || inner?.preSignedUrl;
    const imageUrl: string | undefined = inner?.imageUrl || inner?.imageUr1;
    if (!preSignedUrl || !imageUrl) throw new Error("missing upload url from Binance");

    const putResp = await fetch(preSignedUrl, { method: "PUT", body: pngBytes, headers: { "Content-Type": "image/png" } });
    if (!putResp.ok) throw new Error(`upload PUT failed ${putResp.status}`);

    // 5. Send chat image and verify it actually lands in Binance chat.
    // Some proxy success responses are false positives, so do not trust them blindly.
    const sendStartedAt = Date.now();
    const sendResp = await callBinance(adminClient, "sendChatMessage", { orderNo: orderNumber, imageUrl });
    const restSendOk = !(sendResp?.success === false);

    if (restSendOk) {
      await sleep(1800);
    }

    let delivered = restSendOk
      ? await verifyImageDelivery(adminClient, orderNumber, imageUrl, sendStartedAt)
      : false;

    if (!delivered) {
      console.warn("payer-auto-screenshot: REST send unverified, falling back to WebSocket", { orderNumber });
      const credential = await getChatCredential(adminClient);
      if (!credential) {
        throw new Error("chat delivery could not be verified and chat credentials were unavailable");
      }

      await sendImageViaWs(credential, orderNumber, imageUrl);
      await sleep(1800);
      delivered = await verifyImageDelivery(adminClient, orderNumber, imageUrl, Date.now());
    }

    if (!delivered) {
      throw new Error("chat image upload completed but delivery to Binance chat could not be verified");
    }

    await logRow("sent", {
      amount_used: amountInt,
      provider_fee: fee,
      total_debited: total,
      to_upi_id: upiId,
      upi_txn_id: upiTxnId,
      image_url: imageUrl,
    });

    return new Response(JSON.stringify({ status: "sent", imageUrl, amount: amountInt, upiTxnId }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("payer-auto-screenshot error", e);
    await logRow("failed", {}, e?.message || String(e));
    return new Response(JSON.stringify({ status: "failed", error: e?.message || String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
