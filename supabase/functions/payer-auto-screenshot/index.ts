// Auto Screenshot Sender — client-driven receipt delivery.
// The PNG itself is rendered in the payer's browser using the SAME React
// template as the manual Utility Hub generator (see ReceiptTemplate.tsx),
// then uploaded to Binance via this function. This guarantees the
// auto-screenshot is byte-identical to the manual one.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function callBinance(supabase: any, action: string, payload: any) {
  const { data, error } = await supabase.functions.invoke("binance-ads", { body: { action, ...payload } });
  if (error) throw new Error(`binance-ads ${action} failed: ${error.message || error}`);
  return data;
}

function extractUpi(payMethods: any[]): string | null {
  for (const m of payMethods || []) {
    const id = (m.identifier || m.payType || m.tradeMethodName || "").toString();
    if (/upi/i.test(id) || /UPI/i.test(m.payType || "")) {
      const fields = Array.isArray(m.fields) ? m.fields : [];
      const upiField = fields.find((f: any) => /upi/i.test(f.fieldName || "") || /vpa/i.test(f.fieldName || ""))
        || fields.find((f: any) => /account/i.test(f.fieldName || ""));
      const upi = upiField?.fieldValue || m.payAccount || m.payeeAccount || m.account || null;
      if (upi) return upi;
    }
  }
  for (const m of payMethods || []) {
    const fields = Array.isArray(m.fields) ? m.fields : [];
    for (const f of fields) {
      const v = String(f.fieldValue || "");
      if (v.includes("@")) return v;
    }
  }
  return null;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
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

async function verifyImageDelivery(supabase: any, orderNo: string, imageUrl: string, sentAfterMs: number) {
  try {
    const resp = await callBinance(supabase, "getChatMessages", { orderNo, page: 1, rows: 20, sort: "desc" });
    if (resp?.success === false) return false;
    const messages = extractChatMessages(resp);
    return messages.some((msg: any) => {
      const createTime = Number(msg?.createTime || 0);
      const content = String(msg?.content || msg?.message || "");
      const msgImage = String(msg?.imageUrl || msg?.thumbnailUrl || "");
      const isSelf = msg?.self === true || msg?.isSelf === true;
      return isSelf
        && (!createTime || createTime >= sentAfterMs - 5000)
        && (content === imageUrl || content.includes(imageUrl) || msgImage === imageUrl || msgImage.includes(imageUrl));
    });
  } catch (err) {
    console.warn("verifyImageDelivery failed", err);
    return false;
  }
}

async function waitForVerifiedImageDelivery(
  supabase: any,
  orderNo: string,
  imageUrl: string,
  sentAfterMs: number,
  attempts = 5,
  delayMs = 1800,
) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const delivered = await verifyImageDelivery(supabase, orderNo, imageUrl, sentAfterMs);
    if (delivered) return true;
    if (attempt < attempts) await sleep(delayMs);
  }
  return false;
}

async function getChatCredential(supabase: any) {
  const resp = await callBinance(supabase, "getChatCredential", {});
  if (resp?.success === false) return null;
  const outer = resp?.data ?? resp;
  const inner = outer?.data ?? outer;
  const token = inner?.listenToken || inner?.token;
  if (!inner?.chatWssUrl || !inner?.listenKey || !token) return null;
  return {
    chatWssUrl: inner.chatWssUrl as string,
    listenKey: inner.listenKey as string,
    token: token as string,
    relayUrl: outer?._relay?.relayUrl as string | undefined,
    relayToken: outer?._relay?.relayToken as string | undefined,
  };
}

async function sendImageViaWs(credential: { chatWssUrl: string; listenKey: string; token: string; relayUrl?: string; relayToken?: string; }, orderNo: string, imageUrl: string) {
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
        const ws = new WebSocket(wsUrl);
        const timeout = setTimeout(() => { try { ws.close(); } catch {} reject(new Error("WebSocket timeout (10s)")); }, 10000);
        ws.onopen = () => {
          const now = Date.now();
          ws.send(JSON.stringify({
            type: "text", uuid: String(now), orderNo, content: imageUrl,
            self: true, clientType: "web", createTime: now, sendStatus: 0,
            topicId: orderNo, topicType: "ORDER",
          }));
          setTimeout(() => { clearTimeout(timeout); try { ws.close(); } catch {} resolve(); }, 2500);
        };
        ws.onerror = () => { clearTimeout(timeout); reject(new Error("WebSocket error")); };
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
  const phase = String(body?.phase || "prepare");
  if (!orderNumber) return jsonResponse({ error: "orderNumber required" }, 400);

  // Resolve payer identity for logging.
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
    const { data: cfg, error: cfgErr } = await adminClient
      .from("payer_screenshot_automation_config").select("*").limit(1).maybeSingle();
    if (cfgErr) throw cfgErr;
    if (!cfg || !cfg.is_active) return jsonResponse({ status: "automation_inactive" });

    if (phase === "prepare") {
      const detailResp = await callBinance(adminClient, "getOrderDetail", { orderNumber });
      if (detailResp?.success === false) {
        await logRow("failed", {}, `binance-ads error: ${detailResp.error || "unknown"}`);
        return jsonResponse({ status: "failed", error: detailResp.error });
      }
      const binJson = detailResp?.data ?? detailResp;
      if (binJson?.code && binJson.code !== "000000") {
        await logRow("failed", {}, `binance code ${binJson.code}: ${binJson.message || ""}`);
        return jsonResponse({ status: "failed", error: binJson.message });
      }
      const detail = binJson?.data ?? binJson;
      if (!detail || typeof detail !== "object") {
        await logRow("failed", {}, "order detail empty");
        return jsonResponse({ status: "failed", error: "empty detail" });
      }
      const tradeType = String(detail.tradeType || detail.orderType || "").toUpperCase();
      if (tradeType && tradeType !== "BUY") {
        await logRow("skipped_non_buy", {});
        return jsonResponse({ status: "skipped_non_buy" });
      }

      const totalPrice = Number(detail.totalPrice ?? detail.amount ?? 0);
      const amountInt = Math.floor(totalPrice);
      const min = Number(cfg.min_amount || 0);
      const max = Number(cfg.max_amount || 0);
      if (amountInt < min || amountInt > max) {
        await logRow("skipped_out_of_range", { amount_used: amountInt });
        return jsonResponse({ status: "skipped_out_of_range", amount: amountInt, min, max });
      }

      const payMethods = detail.payMethods || detail.payMethodList || detail.sellerPayMethod?.payMethods || [];
      const upiId = extractUpi(payMethods);
      if (!upiId) {
        await logRow("skipped_non_upi", { amount_used: amountInt });
        return jsonResponse({ status: "skipped_non_upi" });
      }

      const providerFee = Number(cfg.provider_fee_flat || 10);
      return jsonResponse({
        status: "ready",
        amount: amountInt,
        providerFee,
        toUpiId: upiId,
        fromName: cfg.from_name || "Blynk Virtual Technologies Pvt. Ltd.",
        fromUpiId: cfg.from_upi_id || "blynkex@aeronflyprivatelimited",
      });
    }

    // phase === "deliver"
    const pngBase64 = String(body?.pngBase64 || "");
    const upiTxnId = String(body?.upiTxnId || "");
    const amountInt = Number(body?.amount || 0);
    const providerFee = Number(body?.providerFee || 0);
    const upiId = String(body?.toUpiId || "");
    if (!pngBase64) throw new Error("pngBase64 required");

    const pngBytes = base64ToBytes(pngBase64);
    const imageName = `${orderNumber}_${Date.now()}.png`;
    const uploadResp = await callBinance(adminClient, "getChatImageUploadUrl", { imageName });
    const outer = uploadResp?.data || uploadResp;
    const inner = outer?.data || outer;
    const preSignedUrl: string | undefined = inner?.uploadUrl || inner?.preSignedUrl;
    const imageUrl: string | undefined = inner?.imageUrl || inner?.imageUr1;
    if (!preSignedUrl || !imageUrl) throw new Error("missing upload url from Binance");

    const putResp = await fetch(preSignedUrl, { method: "PUT", body: pngBytes, headers: { "Content-Type": "image/png" } });
    if (!putResp.ok) throw new Error(`upload PUT failed ${putResp.status}`);

    const sendStartedAt = Date.now();
    const sendResp = await callBinance(adminClient, "sendChatMessage", { orderNo: orderNumber, imageUrl });
    const restSendOk = !(sendResp?.success === false);

    let delivered = restSendOk
      ? await waitForVerifiedImageDelivery(adminClient, orderNumber, imageUrl, sendStartedAt, 4, 1600)
      : false;

    if (!delivered) {
      console.warn("payer-auto-screenshot: REST send unverified, falling back to WebSocket", { orderNumber });
      const credential = await getChatCredential(adminClient);
      if (!credential) throw new Error("chat delivery could not be verified and chat credentials were unavailable");
      await sendImageViaWs(credential, orderNumber, imageUrl);
      delivered = await waitForVerifiedImageDelivery(adminClient, orderNumber, imageUrl, sendStartedAt, 6, 1800);
    }

    if (!delivered) throw new Error("chat image upload completed but delivery to Binance chat could not be verified");

    await logRow("sent", {
      amount_used: amountInt,
      provider_fee: providerFee,
      total_debited: amountInt + providerFee,
      to_upi_id: upiId,
      upi_txn_id: upiTxnId,
      image_url: imageUrl,
    });

    return jsonResponse({ status: "sent", imageUrl, amount: amountInt, upiTxnId });
  } catch (e: any) {
    console.error("payer-auto-screenshot error", e);
    await logRow("failed", {}, e?.message || String(e));
    return jsonResponse({ status: "failed", error: e?.message || String(e) }, 500);
  }
});