import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchAllRows } from "../_shared/paginate.ts";
import { requireCaller } from "../_shared/require-caller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface AutoReplyRule {
  id: string;
  name: string;
  trigger_event: string;
  trade_type: string | null;
  message_template: string;
  delay_seconds: number;
  is_active: boolean;
  priority: number;
  conditions: Record<string, any>;
}

interface BinanceOrder {
  orderNumber: string;
  advNo: string;
  tradeType: string;
  asset: string;
  fiatUnit: string;
  totalPrice: string;
  amount: string;
  unitPrice: string;
  orderStatus: string | number;
  createTime: number;
  counterPartNickName: string;
  buyerRealName?: string;
  sellerRealName?: string;
  buyerName?: string;
  sellerName?: string;
  payMethodName?: string;
  notifyPayEndTime?: number;
  confirmPayEndTime?: number;
  notifyPayedExpireMinute?: number;
  chatUnreadCount?: number;
  tradeMethodCommissionRateVoList?: any[];
}

const ACTIONABLE_ORDER_STATUS_LIST = [1, 2];


function extractOrders(data: any): BinanceOrder[] {
  if (Array.isArray(data?.data?.data)) return data.data.data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data)) return data;
  return [];
}

interface PendingMessage {
  orderNumber: string;
  message: string;
  event: string;
  rule: AutoReplyRule;
  sendTimestamp: number;
}

function getCounterpartyName(order: BinanceOrder, verifiedName?: string | null): string | null {
  const clean = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const s = v.trim();
    if (!s || s.includes("*") || s.toLowerCase() === "undefined" || s.toLowerCase() === "unknown") return null;
    return s;
  };
  const isSell = String(order.tradeType).toUpperCase() === "SELL";
  return clean(verifiedName) || clean(isSell ? order.buyerRealName : order.sellerRealName) || clean(isSell ? order.buyerName : order.sellerName);
}

function renderTemplate(template: string, order: BinanceOrder, verifiedName?: string | null): string | null {
  const name = getCounterpartyName(order, verifiedName);
  // Never personalize with a Binance nickname. If the template needs a name,
  // defer it until Binance supplies the verified KYC name.
  if (template.includes("{{counterparty}}") && !name) return null;
  return template
    .replace(/\{\{orderNumber\}\}/g, order.orderNumber)
    .replace(/\{\{amount\}\}/g, order.amount)
    .replace(/\{\{totalPrice\}\}/g, order.totalPrice)
    .replace(/\{\{unitPrice\}\}/g, order.unitPrice)
    .replace(/\{\{asset\}\}/g, order.asset || "USDT")
    .replace(/\{\{fiat\}\}/g, order.fiatUnit || "INR")
    .replace(/\{\{counterparty\}\}/g, name || "")
    .replace(/\{\{payMethod\}\}/g, order.payMethodName || "N/A");
}

function detectTriggerEvents(order: BinanceOrder): string[] {
  const events: string[] = [];
  const status = String(order.orderStatus ?? "").toUpperCase();

  const isCompleted = status === "4" || status.includes("COMPLETED");
  if (isCompleted) {
    // "Order released" — only for orders we sold (we released the crypto),
    // and only while fresh so a history sweep never re-blasts old orders.
    // NOTE: payment_marked is deliberately NOT replayed here. Verified against
    // live sends: Binance silently drops chat messages posted to an order that
    // is already released, so a catch-up reply never reaches the counterparty.
    // Fast pay+release trades are covered by the seller_payed chat trigger,
    // which fires while the order is still open.
    const completedAgeMinutes = (Date.now() - order.createTime) / 60000;
    if (order.tradeType === "SELL" && completedAgeMinutes < 180) {
      events.push("order_released");
    }
    return events;

  }


  if (status === "5" || status.includes("CANCEL") || status.includes("EXPIRED")) {
    return events;
  }

  if (!status.includes("APPEAL")) {
    events.push("order_received");
  }

  if (status === "2" || status === "3" || status.includes("PAID") || status.includes("PAYING")) {
    events.push("payment_marked");
  }

  if (status.includes("APPEAL")) {
    events.push("order_appealed");
  }

  const ageMinutes = (Date.now() - order.createTime) / 60000;
  if (ageMinutes > 15) {
    events.push("timer_breach");
  }

  if (ageMinutes > 5 && (status === "1" || status === "" || status.includes("PENDING")) && !status.includes("PAID")) {
    events.push("payment_pending");
  }

  return events;
}

async function signQuery(queryString: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(queryString));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get Binance chat WebSocket credentials with retry logic.
 * Retries up to 3 times with exponential backoff.
 */
async function getChatCredentialWithRetry(
  proxyUrl: string,
  proxyHeaders: Record<string, string>,
  maxRetries = 3,
): Promise<{ chatWssUrl: string; listenKey: string; token: string } | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const url = `${proxyUrl}/api/sapi/v1/c2c/chat/retrieveChatCredential`;
      if (attempt === 1) console.log("getChatCredential URL (GET):", url);
      
      const res = await fetch(url, {
        method: "GET",
        headers: proxyHeaders,
      });
      const text = await res.text();
      if (attempt === 1) console.log("getChatCredential response:", res.status, text.substring(0, 500));
      
      const data = JSON.parse(text);
      if (data?.code === "000000" && data?.data) {
        return {
          chatWssUrl: data.data.chatWssUrl,
          listenKey: data.data.listenKey,
          token: data.data.listenToken || data.data.token,
        };
      }
      
      if (attempt < maxRetries) {
        console.warn(`getChatCredential attempt ${attempt} failed, retrying in ${attempt * 1000}ms...`);
        await new Promise(r => setTimeout(r, attempt * 1000));
      } else {
        console.error("getChatCredential failed after all retries:", text.substring(0, 300));
      }
    } catch (err) {
      if (attempt < maxRetries) {
        console.warn(`getChatCredential attempt ${attempt} error, retrying...`, err);
        await new Promise(r => setTimeout(r, attempt * 1000));
      } else {
        console.error("getChatCredential error after all retries:", err);
      }
    }
  }
  return null;
}

/**
 * Verify message delivery by checking if our message appears in chat history.
 */
async function verifyMessageDelivery(
  proxyUrl: string,
  proxyHeaders: Record<string, string>,
  orderNo: string,
  sentContent: string,
  sentAfterMs?: number,
): Promise<boolean> {
  try {
    const url = `${proxyUrl}/api/sapi/v1/c2c/chat/retrieveChatMessagesWithPagination?orderNo=${encodeURIComponent(orderNo)}&page=1&rows=10`;
    const res = await fetch(url, { method: "GET", headers: proxyHeaders });
    const data = await res.json();
    
    if (data?.code === "000000" && data?.data) {
      const contentSnippet = sentContent.substring(0, 50);
      // Only match messages sent AFTER the send attempt to avoid matching old duplicates
      const cutoff = sentAfterMs ? sentAfterMs - 5000 : 0;
      return data.data.some((msg: any) => 
        msg.self === true && 
        msg.type === "text" && 
        msg.content?.includes(contentSnippet) &&
        (!cutoff || (msg.createTime && msg.createTime >= cutoff))
      );
    }
    return false;
  } catch (err) {
    console.warn("verifyMessageDelivery error:", err);
    return false;
  }
}

/**
 * Send a chat message via Binance WebSocket with delivery verification.
 */
async function sendChatMessage(
  proxyUrl: string,
  proxyHeaders: Record<string, string>,
  orderNo: string,
  content: string,
  cachedCredential?: { chatWssUrl: string; listenKey: string; token: string } | null,
): Promise<{ success: boolean; verified: boolean; error?: string; credential?: { chatWssUrl: string; listenKey: string; token: string } }> {
  const sendStartMs = Date.now();
  // First try proxy REST endpoint (in case it supports sendMessage)
  try {
    const proxyMsgUrl = `${proxyUrl}/api/sapi/v1/c2c/chat/sendMessage?orderNo=${encodeURIComponent(orderNo)}&content=${encodeURIComponent(content)}&contentType=TEXT`;
    const proxyRes = await fetch(proxyMsgUrl, { method: "POST", headers: proxyHeaders });
    const proxyText = await proxyRes.text();
    
    if (proxyRes.ok && !proxyText.includes("Not Found")) {
      let data: any;
      try { data = JSON.parse(proxyText); } catch { data = { raw: proxyText }; }
      if (data?.code === "000000" || data?.success) {
        // Verify delivery
        await new Promise(r => setTimeout(r, 2000));
        const verified = await verifyMessageDelivery(proxyUrl, proxyHeaders, orderNo, content, sendStartMs);
        return { success: true, verified };
      }
    }
  } catch {
    // Proxy failed, continue to WebSocket
  }

  // WebSocket approach with retry
  const cred = cachedCredential || await getChatCredentialWithRetry(proxyUrl, proxyHeaders);
  if (!cred) {
    return { success: false, verified: false, error: "Failed to get chat WebSocket credentials after 3 retries" };
  }

  // Try WebSocket send up to 2 times
  const WS_MAX_ATTEMPTS = 3;
  for (let wsAttempt = 1; wsAttempt <= WS_MAX_ATTEMPTS; wsAttempt++) {
    try {
      const wssUrl = `${cred.chatWssUrl}/${cred.listenKey}?token=${cred.token}&clientType=web`;
      if (wsAttempt === 1) console.log(`WS connecting for order ${orderNo}...`);

      const wsSendResult = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        const timeout = setTimeout(() => {
          try { ws.close(); } catch {}
          resolve({ success: false, error: "WebSocket timeout (10s)" });
        }, 10000);

        const ws = new WebSocket(wssUrl);

        ws.onopen = () => {
          console.log(`WS connected, sending message to order ${orderNo}`);
          const now = Date.now();
          const msgPayload = JSON.stringify({
            type: "text",
            uuid: String(now),
            orderNo: orderNo,
            content: content,
            self: true,
            clientType: "web",
            createTime: now,
            sendStatus: 0,
            topicId: orderNo,
            topicType: "ORDER",
          });
          ws.send(msgPayload);
          console.log(`WS payload sent: ${msgPayload.substring(0, 200)}`);
          
          // Wait for Binance to process
          setTimeout(() => {
            clearTimeout(timeout);
            try { ws.close(); } catch {}
            resolve({ success: true });
          }, 2500);
        };

        ws.onerror = (err) => {
          clearTimeout(timeout);
          console.error(`WS error for ${orderNo}:`, err);
          resolve({ success: false, error: `WebSocket error` });
        };

        ws.onclose = () => {};
      });

      if (wsSendResult.success) {
        // Verify delivery by checking chat messages
        await new Promise(r => setTimeout(r, 2500));
        const verified = await verifyMessageDelivery(proxyUrl, proxyHeaders, orderNo, content, sendStartMs);

        if (verified) {
          console.log(`✅ Message delivery VERIFIED for order ${orderNo}`);
          return { success: true, verified: true, credential: cred };
        } else if (wsAttempt < WS_MAX_ATTEMPTS) {
          console.warn(`⚠️ Message sent but NOT verified for order ${orderNo}, retrying WS...`);
          // Binance keeps one live chat session per account; give the previous
          // session time to drop before opening another one.
          await new Promise(r => setTimeout(r, 3000));
          continue;
        } else {
          console.warn(`⚠️ Message sent but NOT verified after ${WS_MAX_ATTEMPTS} attempts for order ${orderNo}`);
          return { success: true, verified: false, credential: cred };
        }
      } else if (wsAttempt < WS_MAX_ATTEMPTS) {
        console.warn(`WS send failed for ${orderNo}, retrying...`);
        await new Promise(r => setTimeout(r, 1000));
      } else {
        return { success: false, verified: false, error: wsSendResult.error, credential: cred };
      }
    } catch (err) {
      if (wsAttempt < WS_MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, 1000));
      } else {
        return { success: false, verified: false, error: `WebSocket exception: ${String(err)}`, credential: cred };
      }
    }
  }

  return { success: false, verified: false, error: "All WebSocket attempts failed", credential: cred };
}

/** Clean, unmasked human name or null. */
function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v || v.includes("*") || v.toLowerCase() === "unknown" || v.toLowerCase() === "undefined") return null;
  return v;
}

/**
 * Fetch verified (unmasked) counterparty name from Binance order detail API.
 *
 * The proxy wraps the Binance envelope, so the detail can sit at
 * `data.data.data`, `data.data` or the root — same unwrapping the
 * resolve-order-userno function uses. The endpoint also expects `adOrderNo`
 * alongside `orderNo`; sending only `orderNo` returns an empty payload, which
 * is why templates were falling back to the generic "Trader".
 */
async function fetchVerifiedName(
  proxyUrl: string,
  proxyHeaders: Record<string, string>,
  orderNo: string,
  tradeType: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${proxyUrl}/api/sapi/v1/c2c/orderMatch/getUserOrderDetail`, {
      method: "POST",
      headers: proxyHeaders,
      body: JSON.stringify({ adOrderNo: orderNo, orderNo }),
    });
    const text = await res.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { return null; }
    const detail = data?.data?.data || data?.data || data;
    if (!detail || typeof detail !== "object") return null;
    const isSell = String(tradeType).toUpperCase() === "SELL";
    return (
      cleanName(isSell ? detail.buyerRealName : detail.sellerRealName) ||
      cleanName(isSell ? detail.buyerName : detail.sellerName)
    );
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const caller = await requireCaller(req, corsHeaders);
  if (!caller.ok) return caller.response;

  try {
    // Event-driven trigger: when a payer marks a single order Paid, the cron poll
    // may miss it (order leaves the active list within seconds). Allow callers to
    // pass { orderNumber, triggerEvent? } to force-process a single order.
    let forcedOrderNumber: string | null = null;
    let forcedEvent: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.orderNumber) forcedOrderNumber = String(body.orderNumber);
        if (body?.triggerEvent) forcedEvent = String(body.triggerEvent);
      } catch {
        // no body — full poll mode
      }
    }

    const SUPABASE_URL = "https://vagiqbespusdxsbqpvbo.supabase.co";
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const BINANCE_PROXY_URL = Deno.env.get("BINANCE_PROXY_URL");
    const BINANCE_PROXY_TOKEN = Deno.env.get("BINANCE_PROXY_TOKEN");
    const BINANCE_API_KEY = Deno.env.get("BINANCE_API_KEY");
    const BINANCE_API_SECRET = Deno.env.get("BINANCE_API_SECRET");

    if (!BINANCE_PROXY_URL || !BINANCE_PROXY_TOKEN) {
      throw new Error("Missing Binance configuration secrets");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const proxyHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "x-proxy-token": BINANCE_PROXY_TOKEN,
    };
    if (BINANCE_API_KEY) proxyHeaders["x-api-key"] = BINANCE_API_KEY;
    if (BINANCE_API_SECRET) proxyHeaders["x-api-secret"] = BINANCE_API_SECRET;

    // 1. Fetch active auto-reply rules
    const { data: rules, error: rulesErr } = await supabase
      .from("p2p_auto_reply_rules")
      .select("*")
      .eq("is_active", true)
      .order("priority", { ascending: false });

    if (rulesErr) throw rulesErr;

    const hasRules = rules && rules.length > 0;
    if (!hasRules) {
      console.log("No active auto-reply rules. Skipping.");
      return new Response(JSON.stringify({ message: "No active rules", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let verified = 0;
    let unverified = 0;
    let errors = 0;
    

    // ===== RETRY PREVIOUSLY UNVERIFIED MESSAGES =====
    // Find messages logged as "sent" but not verified, within last 30 minutes
    // Only VERIFY delivery — never delete processed records or re-send
    const { data: unverifiedMessages } = await supabase
      .from("p2p_auto_reply_log")
      .select("id, order_number, trigger_event, rule_id, message_sent")
      .eq("status", "sent_unverified")
      .gte("executed_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
      .limit(10);

    if (unverifiedMessages && unverifiedMessages.length > 0) {
      console.log(`${unverifiedMessages.length} unverified messages to check`);
      for (const uv of unverifiedMessages) {
        const isNowDelivered = await verifyMessageDelivery(BINANCE_PROXY_URL, proxyHeaders, uv.order_number, uv.message_sent);
        if (isNowDelivered) {
          await supabase
            .from("p2p_auto_reply_log")
            .update({ status: "sent", error_message: "Verified on retry" })
            .eq("id", uv.id);
          console.log(`✅ Retry verification passed for ${uv.order_number}`);
        } else {
          // Mark as permanently unverified after 30 min — do NOT delete processed or re-send
          console.log(`⚠️ Still unverified: ${uv.order_number} — keeping processed guard intact`);
        }
      }
    }

    // ===== FETCH ACTIVE ORDERS =====
    // Paginate to ensure we don't miss orders beyond the first 50
    const allActiveOrders: BinanceOrder[] = [];
    const listOrdersDiagnostics: Record<string, any> = { filteredFetchUsed: !forcedOrderNumber, requestedStatusFilters: ACTIONABLE_ORDER_STATUS_LIST, pages: [], fallbackReason: null };
    if (forcedOrderNumber) {
      // Event-driven: fetch just this one order's detail and synthesize a list entry
      try {
        const detailRes = await fetch(`${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/getUserOrderDetail`, {
          method: "POST",
          headers: proxyHeaders,
          body: JSON.stringify({ adOrderNo: forcedOrderNumber }),
        });
        const detailJson = await detailRes.json();
        const d = detailJson?.data?.data || detailJson?.data || detailJson;
        if (d) {
          allActiveOrders.push({
            orderNumber: d.orderNumber || forcedOrderNumber,
            advNo: d.advNo,
            tradeType: d.tradeType,
            asset: d.asset,
            fiatUnit: d.fiatUnit,
            totalPrice: String(d.totalPrice ?? ""),
            amount: String(d.amount ?? ""),
            unitPrice: String(d.unitPrice ?? ""),
            // Force PAID-equivalent status so payment_marked rules match even if
            // Binance has already advanced the order to Releasing/Completed.
            orderStatus: forcedEvent === "payment_marked"
              ? "PAID"
              : forcedEvent === "order_released"
              ? "COMPLETED"
              : (d.orderStatus ?? ""),
            createTime: Number(d.createTime) || Date.now(),
            counterPartNickName: d.counterPartNickName,
            buyerRealName: d.buyerRealName,
            sellerRealName: d.sellerRealName,
            buyerName: d.buyerName,
            sellerName: d.sellerName,
            payMethodName: d.payMethodName,
            notifyPayEndTime: Number(d.notifyPayEndTime) || undefined,
            confirmPayEndTime: Number(d.confirmPayEndTime) || undefined,
            notifyPayedExpireMinute: Number(d.notifyPayedExpireMinute) || undefined,
            chatUnreadCount: Number(d.chatUnreadCount) || undefined,
            tradeMethodCommissionRateVoList: Array.isArray(d.tradeMethodCommissionRateVoList) ? d.tradeMethodCommissionRateVoList : undefined,
          } as BinanceOrder);
        }
      } catch (e) {
        console.warn("Forced order detail fetch failed:", e);
      }
      console.log(`Forced single-order auto-reply for ${forcedOrderNumber} (event=${forcedEvent || "auto"})`);
    } else {
      for (let page = 1; page <= 3; page++) {
        const activeRes = await fetch(`${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/listOrders`, {
          method: "POST",
          headers: proxyHeaders,
          body: JSON.stringify({ page, rows: 50, orderStatusList: ACTIONABLE_ORDER_STATUS_LIST }),
        });
        const activeData = await activeRes.json();
        if (!activeRes.ok || (activeData?.code && activeData.code !== "000000")) {
          listOrdersDiagnostics.filteredFetchUsed = false;
          listOrdersDiagnostics.fallbackReason = `filtered_listOrders_rejected:${activeData?.code || activeRes.status}`;
          allActiveOrders.length = 0;
          break;
        }
        const pageOrders: BinanceOrder[] = extractOrders(activeData);
        listOrdersDiagnostics.pages.push({ page, count: pageOrders.length, filtered: true });
        allActiveOrders.push(...pageOrders);
        if (pageOrders.length < 50) break;
      }
      if (!listOrdersDiagnostics.filteredFetchUsed) {
        for (let page = 1; page <= 3; page++) {
          const activeRes = await fetch(`${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/listOrders`, {
            method: "POST",
            headers: proxyHeaders,
            body: JSON.stringify({ page, rows: 50 }),
          });
          const activeData = await activeRes.json();
          const pageOrders: BinanceOrder[] = extractOrders(activeData);
          listOrdersDiagnostics.pages.push({ page, count: pageOrders.length, filtered: false });
          allActiveOrders.push(...pageOrders);
          if (pageOrders.length < 50) break;
        }
      }

      // ===== RECENTLY COMPLETED (RELEASED) ORDERS =====
      // Releases done directly in the Binance app never pass through the terminal,
      // and fast sales are paid + released between two polls, so they never show
      // up with status 2. Sweep freshly completed orders whenever a release rule
      // OR a sell-side payment_marked rule exists.
      const hasReleaseRule = (rules as AutoReplyRule[]).some((r) => r.trigger_event === "order_released");
      if (hasReleaseRule) {

        try {
          const seen = new Set(allActiveOrders.map((o) => o.orderNumber));
          const completedRes = await fetch(`${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/listOrders`, {
            method: "POST",
            headers: proxyHeaders,
            body: JSON.stringify({ page: 1, rows: 50, orderStatusList: [4] }),
          });
          const completedData = await completedRes.json();
          if (completedRes.ok && (!completedData?.code || completedData.code === "000000")) {
            const completedOrders: BinanceOrder[] = extractOrders(completedData);
            let added = 0;
            for (const o of completedOrders) {
              if (!o?.orderNumber || seen.has(o.orderNumber)) continue;
              const ageMinutes = (Date.now() - Number(o.createTime || 0)) / 60000;
              if (!Number.isFinite(ageMinutes) || ageMinutes > 180) continue;
              allActiveOrders.push(o);
              added++;
            }
            listOrdersDiagnostics.pages.push({ page: 1, count: added, filtered: true, completedSweep: true });
          } else {
            listOrdersDiagnostics.completedSweepError = completedData?.code || completedRes.status;
          }
        } catch (e) {
          console.warn("Completed-order sweep failed:", e);
        }
      }
      console.log(`Processing ${allActiveOrders.length} orders for auto-reply`);

    }

    {
      const exclusionRows = await fetchAllRows((from, to) =>
        supabase
          .from("terminal_auto_reply_exclusions")
          .select("order_number")
          .range(from, to)
      );
      const excludedOrders = new Set((exclusionRows || []).map((r: any) => r.order_number));

      const { data: sbConfig } = await supabase
        .from("small_buys_config")
        .select("is_enabled, min_amount, max_amount")
        .eq("is_enabled", true)
        .limit(1)
        .maybeSingle();

      const { data: ssConfig } = await supabase
        .from("small_sales_config")
        .select("is_enabled, min_amount, max_amount")
        .eq("is_enabled", true)
        .limit(1)
        .maybeSingle();

      // Pre-fetch verified names from DB
      const orderNumbers = allActiveOrders.map((o) => o.orderNumber);
      const verifiedNameMap = new Map<string, string>();
      if (orderNumbers.length > 0) {
        const { data: nameRows } = await supabase
          .from("binance_order_history")
          .select("order_number, verified_name")
          .in("order_number", orderNumbers);
        if (nameRows) {
          for (const row of nameRows) {
            const name = cleanName(row.verified_name);
            if (name) verifiedNameMap.set(row.order_number, name);
          }
        }
      }

      // Second source: identity cache captured at sync time.
      if (orderNumbers.length > 0) {
        const missing = orderNumbers.filter((n) => !verifiedNameMap.has(n));
        if (missing.length > 0) {
          const { data: idRows } = await supabase
            .from("cp_order_identity")
            .select("order_number, verified_name")
            .in("order_number", missing);
          for (const row of idRows || []) {
            const name = cleanName(row.verified_name);
            if (name) verifiedNameMap.set(row.order_number, name);
          }
        }
      }

      // For orders still without a clean name, fetch from Binance detail API,
      // then fall back to the multi-account resolver (the order may live on a
      // non-primary exchange account whose credentials this function lacks).
      for (const order of allActiveOrders) {
        if (verifiedNameMap.has(order.orderNumber)) continue;
        const detailName = await fetchVerifiedName(BINANCE_PROXY_URL, proxyHeaders, order.orderNumber, order.tradeType);
        if (detailName) {
          verifiedNameMap.set(order.orderNumber, detailName);
          continue;
        }
        try {
          const { data: resolved } = await supabase.functions.invoke("resolve-order-userno", {
            body: { order_number: order.orderNumber, trade_type: order.tradeType },
          });
          const name = cleanName(resolved?.verified_name);
          if (name) verifiedNameMap.set(order.orderNumber, name);
        } catch { /* best effort */ }
      }

      // Collect all pending messages
      const pendingMessages: PendingMessage[] = [];

      for (const order of allActiveOrders) {
        if (excludedOrders.has(order.orderNumber)) continue;

        const triggerEvents = detectTriggerEvents(order);
        const totalPrice = parseFloat(order.totalPrice || "0");

        for (const event of triggerEvents) {
          const matchingRules = (rules as AutoReplyRule[]).filter((r) => {
            if (r.trigger_event !== event) return false;
            if (r.trade_type) {
              if (r.trade_type === "SMALL_BUY") {
                if (order.tradeType !== "BUY") return false;
                if (!sbConfig?.is_enabled) return false;
                if (totalPrice < sbConfig.min_amount || totalPrice > sbConfig.max_amount) return false;
              } else if (r.trade_type === "SMALL_SELL") {
                if (order.tradeType !== "SELL") return false;
                if (!ssConfig?.is_enabled) return false;
                if (totalPrice < ssConfig.min_amount || totalPrice > ssConfig.max_amount) return false;
              } else {
                if (r.trade_type !== order.tradeType) return false;
              }
            }
            return true;
          });

          for (const rule of matchingRules) {
            // Check if already processed (dedup guard)
            const { data: existing } = await supabase
              .from("p2p_auto_reply_processed")
              .select("id")
              .eq("order_number", order.orderNumber)
              .eq("trigger_event", event)
              .eq("rule_id", rule.id)
              .maybeSingle();

            if (existing) continue;

            const orderAgeSeconds = (Date.now() - order.createTime) / 1000;
            if (orderAgeSeconds < rule.delay_seconds) continue;

            // === CLAIM THE SLOT FIRST (before sending) ===
            // This prevents concurrent cron runs from both sending
            const { error: claimErr } = await supabase
              .from("p2p_auto_reply_processed")
              .insert({
                order_number: order.orderNumber,
                trigger_event: event,
                rule_id: rule.id,
              });

            if (claimErr) {
              // Unique constraint violation = another invocation already claimed it
              console.log(`⏭️ Slot already claimed for ${order.orderNumber}:${event}:${rule.id}`);
              continue;
            }

            const verifiedName = verifiedNameMap.get(order.orderNumber) || null;
            const message = renderTemplate(rule.message_template, order, verifiedName);
            if (!message) {
              await supabase.from("p2p_auto_reply_processed")
                .delete()
                .eq("order_number", order.orderNumber)
                .eq("trigger_event", event)
                .eq("rule_id", rule.id);
              console.warn(`Verified counterparty name unavailable for ${order.orderNumber}; personalized auto-reply deferred`);
              continue;
            }

            // A previous attempt may have been reported unverified even though
            // Binance did deliver it. Never send the same text twice.
            const { data: alreadyThere } = await supabase
              .from("binance_order_chat_messages")
              .select("id")
              .eq("order_number", order.orderNumber)
              .eq("message_text", message)
              .limit(1);
            if (alreadyThere && alreadyThere.length > 0) {
              console.log(`⏭️ Reply text already present on ${order.orderNumber}, skipping`);
              continue;
            }

            pendingMessages.push({ orderNumber: order.orderNumber, message, event, rule, sendTimestamp: Date.now() });

          }
        }
      }

      console.log(`${pendingMessages.length} pending auto-reply messages to send`);

      // Binance allows a single live chat session per account. Two concurrent
      // invocations (e.g. two buyers marking paid in the same second) would
      // fight over that session and one message would silently vanish, so
      // serialise the send phase across invocations with a short DB lock.
      let sendLockHeld = false;
      if (pendingMessages.length > 0) {
        for (let attempt = 0; attempt < 12 && !sendLockHeld; attempt++) {
          const { data: got } = await supabase.rpc("acquire_chat_send_lock", {
            p_key: "auto_reply_primary",
            p_ttl_seconds: 40,
          });
          sendLockHeld = got === true;
          if (!sendLockHeld) await new Promise((r) => setTimeout(r, 2500));
        }
        if (!sendLockHeld) {
          console.log("Could not acquire chat send lock; releasing claims for retry");
          for (const pm of pendingMessages) {
            await supabase.from("p2p_auto_reply_processed")
              .delete()
              .eq("order_number", pm.orderNumber)
              .eq("trigger_event", pm.event)
              .eq("rule_id", pm.rule.id);
          }
          pendingMessages.length = 0;
        }
      }

      // Pre-fetch WebSocket credentials once with retry
      let chatCredential: { chatWssUrl: string; listenKey: string; token: string } | null = null;
      if (pendingMessages.length > 0) {
        chatCredential = await getChatCredentialWithRetry(BINANCE_PROXY_URL, proxyHeaders);
      }

      // Send each message with verification
      let sentInThisRun = 0;
      for (const pm of pendingMessages) {
        // Space out consecutive chat sessions on the same account.
        if (sentInThisRun > 0) await new Promise((r) => setTimeout(r, 3000));
        sentInThisRun++;
        pm.sendTimestamp = Date.now();
        const result = await sendChatMessage(
          BINANCE_PROXY_URL,
          proxyHeaders,
          pm.orderNumber,
          pm.message,
          chatCredential,
        );
        if (result.credential) chatCredential = result.credential;

        if (result.success) {
          // Slot already claimed before sending — just log
          const status = result.verified ? "sent" : "sent_unverified";
          await supabase.from("p2p_auto_reply_log").insert({
            rule_id: pm.rule.id,
            order_number: pm.orderNumber,
            trigger_event: pm.event,
            message_sent: pm.message,
            status: status,
            error_message: result.verified ? null : "Sent via WS but delivery not confirmed by chat history",
          });

          if (result.verified) {
            console.log(`✅ Auto-reply sent & VERIFIED: [${pm.event}] ${pm.rule.name} → Order ${pm.orderNumber}`);
            verified++;
          } else {
            // Unverified means Binance never echoed the message back. Release
            // the claim so the next cycle can retry while the order is open.
            await supabase.from("p2p_auto_reply_processed")
              .delete()
              .eq("order_number", pm.orderNumber)
              .eq("trigger_event", pm.event)
              .eq("rule_id", pm.rule.id);
            console.log(`⚠️ Auto-reply sent but UNVERIFIED (will retry): [${pm.event}] ${pm.rule.name} → Order ${pm.orderNumber}`);
            unverified++;
          }
          processed++;
        } else {
          // Send failed — remove the claimed slot so it can retry next cycle
          await supabase.from("p2p_auto_reply_processed")
            .delete()
            .eq("order_number", pm.orderNumber)
            .eq("trigger_event", pm.event)
            .eq("rule_id", pm.rule.id);

          await supabase.from("p2p_auto_reply_log").insert({
            rule_id: pm.rule.id,
            order_number: pm.orderNumber,
            trigger_event: pm.event,
            message_sent: pm.message,
            status: "failed",
            error_message: result.error || "Unknown error",
          });
          console.error(`❌ Auto-reply failed: ${pm.rule.name} → ${result.error}`);
          errors++;
        }
      }

      if (sendLockHeld) {
        await supabase.rpc("release_chat_send_lock", { p_key: "auto_reply_primary" });
      }
    }


    const result = {
      message: "Execution complete",
      processed,
      verified,
      unverified,
      
      errors,
      ordersChecked: allActiveOrders.length,
      rulesActive: rules?.length || 0,
      listOrdersDiagnostics,
    };
    console.log("Auto-reply engine result:", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Auto-reply engine error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
