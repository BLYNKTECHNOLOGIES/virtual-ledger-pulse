import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  payMethodName?: string;
  notifyPayEndTime?: number;
  notifyPayedExpireMinute?: number;
}

interface PendingMessage {
  orderNumber: string;
  message: string;
  event: string;
  rule: AutoReplyRule;
}

function getCounterpartyName(order: BinanceOrder, verifiedName?: string | null): string {
  if (verifiedName) return verifiedName;
  if (order.buyerRealName) return order.buyerRealName;
  if (order.sellerRealName) return order.sellerRealName;
  if (order.counterPartNickName && order.counterPartNickName !== "" && order.counterPartNickName !== "undefined") return order.counterPartNickName;
  return "Trader";
}

function renderTemplate(template: string, order: BinanceOrder, verifiedName?: string | null): string {
  const name = getCounterpartyName(order, verifiedName);
  return template
    .replace(/\{\{orderNumber\}\}/g, order.orderNumber)
    .replace(/\{\{amount\}\}/g, order.amount)
    .replace(/\{\{totalPrice\}\}/g, order.totalPrice)
    .replace(/\{\{unitPrice\}\}/g, order.unitPrice)
    .replace(/\{\{asset\}\}/g, order.asset || "USDT")
    .replace(/\{\{fiat\}\}/g, order.fiatUnit || "INR")
    .replace(/\{\{counterparty\}\}/g, name)
    .replace(/\{\{payMethod\}\}/g, order.payMethodName || "N/A");
}

function detectTriggerEvents(order: BinanceOrder): string[] {
  const events: string[] = [];
  const status = String(order.orderStatus ?? "").toUpperCase();

  if (status.includes("COMPLETED") || status === "4" || status === "5" ||
      status.includes("CANCEL") || status.includes("EXPIRED")) {
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

/**
 * Generate HMAC-SHA256 signature for Binance API requests.
 */
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
 * Get Binance chat WebSocket credentials via proxy (same as binance-ads).
 * Direct Binance API calls fail due to IP restrictions on edge functions.
 */
async function getChatCredential(
  proxyUrl: string,
  proxyHeaders: Record<string, string>,
): Promise<{ chatWssUrl: string; listenKey: string; token: string } | null> {
  try {
    const url = `${proxyUrl}/api/sapi/v1/c2c/chat/retrieveChatCredential`;
    console.log("getChatCredential URL (GET):", url);
    
    const res = await fetch(url, {
      method: "GET",
      headers: proxyHeaders,
    });
    const text = await res.text();
    console.log("getChatCredential response:", res.status, text.substring(0, 500));
    
    const data = JSON.parse(text);
    if (data?.code === "000000" && data?.data) {
      return {
        chatWssUrl: data.data.chatWssUrl,
        listenKey: data.data.listenKey,
        token: data.data.listenToken || data.data.token,
      };
    }
    console.error("getChatCredential failed:", text.substring(0, 300));
    return null;
  } catch (err) {
    console.error("getChatCredential error:", err);
    return null;
  }
}

/**
 * Send a chat message via Binance WebSocket.
 * Binance P2P chat requires WebSocket — there is no REST endpoint for sending messages.
 */
async function sendChatMessage(
  proxyUrl: string,
  proxyHeaders: Record<string, string>,
  orderNo: string,
  content: string,
  cachedCredential?: { chatWssUrl: string; listenKey: string; token: string } | null,
): Promise<{ success: boolean; error?: string; credential?: { chatWssUrl: string; listenKey: string; token: string } }> {
  // First try proxy (in case it supports sendMessage)
  try {
    const proxyMsgUrl = `${proxyUrl}/api/sapi/v1/c2c/chat/sendMessage?orderNo=${encodeURIComponent(orderNo)}&content=${encodeURIComponent(content)}&contentType=TEXT`;
    const proxyRes = await fetch(proxyMsgUrl, { method: "POST", headers: proxyHeaders });
    const proxyText = await proxyRes.text();
    
    if (proxyRes.ok && !proxyText.includes("Not Found")) {
      let data: any;
      try { data = JSON.parse(proxyText); } catch { data = { raw: proxyText }; }
      if (data?.code === "000000" || data?.success) {
        return { success: true };
      }
    }
  } catch {
    // Proxy failed, continue to WebSocket
  }

  // WebSocket approach: get credentials, connect, send, disconnect
  const cred = cachedCredential || await getChatCredential(proxyUrl, proxyHeaders);
  if (!cred) {
    return { success: false, error: "Failed to get chat WebSocket credentials" };
  }

  try {
    const wssUrl = `${cred.chatWssUrl}/${cred.listenKey}?token=${cred.token}&clientType=web`;
    console.log(`WS connecting for order ${orderNo}...`);

    const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      const timeout = setTimeout(() => {
        try { ws.close(); } catch {}
        resolve({ success: false, error: "WebSocket timeout (8s)" });
      }, 8000);

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
        
        // Give Binance a moment to acknowledge, then close
        setTimeout(() => {
          clearTimeout(timeout);
          try { ws.close(); } catch {}
          resolve({ success: true });
        }, 1500);
      };

      ws.onerror = (err) => {
        clearTimeout(timeout);
        console.error(`WS error for ${orderNo}:`, err);
        resolve({ success: false, error: `WebSocket error` });
      };

      ws.onclose = () => {
        // If already resolved, this is a no-op
      };
    });

    return { ...result, credential: cred };
  } catch (err) {
    return { success: false, error: `WebSocket exception: ${String(err)}`, credential: cred };
  }
}

/**
 * Fetch verified (unmasked) counterparty name from Binance order detail API.
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
      body: JSON.stringify({ orderNo }),
    });
    const data = await res.json();
    const detail = data?.data;
    if (!detail) return null;
    // For BUY orders we are the buyer, counterparty is seller
    // For SELL orders we are the seller, counterparty is buyer
    const name = tradeType === "BUY" ? detail.sellerRealName : detail.buyerRealName;
    if (name && !name.includes("*")) return name;
    // Fallback to nickname
    return detail.counterPartNickName || null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    // 2. Fetch auto-pay settings
    const { data: autoPaySettings } = await supabase
      .from("p2p_auto_pay_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    const autoPayActive = autoPaySettings?.is_active === true;
    const autoPayMinutes = autoPaySettings?.minutes_before_expiry || 3;

    const hasRules = rules && rules.length > 0;
    if (!hasRules && !autoPayActive) {
      console.log("No active rules or auto-pay. Skipping.");
      return new Response(JSON.stringify({ message: "Nothing active", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Rules: ${rules?.length || 0}, AutoPay: ${autoPayActive ? `ON (${autoPayMinutes}min)` : "OFF"}`);

    // 3. Fetch ONLY active orders
    const activeRes = await fetch(`${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/listOrders`, {
      method: "POST",
      headers: proxyHeaders,
      body: JSON.stringify({ page: 1, rows: 50 }),
    });
    const activeData = await activeRes.json();
    const activeOrders: BinanceOrder[] = activeData?.data || [];

    console.log(`Processing ${activeOrders.length} active orders`);

    let processed = 0;
    let errors = 0;
    let autoPaidCount = 0;

    // ===== AUTO-PAY LOGIC =====
    if (autoPayActive) {
      // Numeric status codes from Binance listOrders API:
      // 1=TRADING, 2=BUYER_PAYED, 3=PAID, 4=COMPLETED, 5=CANCELLED, 6=APPEAL, 7=EXPIRED
      // Only status 1 (TRADING/pending payment) is valid for auto-pay
      const PAYABLE_STATUSES = new Set(["1", "TRADING"]);
      const NON_PAYABLE_KEYWORDS = ["PAID", "PAYING", "COMPLETED", "CANCEL", "APPEAL", "EXPIRED"];

      const buyOrdersPendingPayment = activeOrders.filter((o) => {
        const statusRaw = String(o.orderStatus ?? "");
        const statusUpper = statusRaw.toUpperCase();

        // Must be a BUY order (we are the buyer)
        if (o.tradeType !== "BUY") return false;

        // If numeric status, only "1" (TRADING) is payable
        if (/^\d+$/.test(statusRaw)) {
          return PAYABLE_STATUSES.has(statusRaw);
        }

        // If string status, exclude non-payable keywords
        return !NON_PAYABLE_KEYWORDS.some((kw) => statusUpper.includes(kw));
      });

      console.log(`Auto-pay candidates: ${buyOrdersPendingPayment.length} BUY orders in TRADING status`);

      // Fetch recent failed attempts to avoid retry-spamming (within last 3 minutes)
      const recentCutoff = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      const { data: recentFailedLogs } = await supabase
        .from("p2p_auto_pay_log")
        .select("order_number")
        .eq("status", "failed")
        .gte("executed_at", recentCutoff);

      const recentlyFailed = new Set((recentFailedLogs || []).map((l: any) => l.order_number));

      // Process auto-pay candidates in parallel for speed
      const autoPayPromises = buyOrdersPendingPayment.map(async (order) => {
        try {
          let expiryTimeMs: number | null = null;
          if (order.notifyPayEndTime) {
            expiryTimeMs = order.notifyPayEndTime;
          } else if (order.notifyPayedExpireMinute && order.createTime) {
            expiryTimeMs = order.createTime + order.notifyPayedExpireMinute * 60 * 1000;
          }
          if (!expiryTimeMs) {
            expiryTimeMs = order.createTime + 15 * 60 * 1000;
          }

          const timeRemainingMs = expiryTimeMs - Date.now();
          const minutesRemaining = timeRemainingMs / 60000;

          if (minutesRemaining <= autoPayMinutes && minutesRemaining > 0) {
            // Skip if already successfully paid
            const { data: alreadyPaid } = await supabase
              .from("p2p_auto_pay_log")
              .select("id")
              .eq("order_number", order.orderNumber)
              .eq("status", "success")
              .maybeSingle();

            if (alreadyPaid) return { skipped: true, reason: "already_paid" };

            // Skip if recently failed (avoid log spam)
            if (recentlyFailed.has(order.orderNumber)) {
              return { skipped: true, reason: "recently_failed" };
            }

            console.log(`🤖 Auto-paying order ${order.orderNumber} (${minutesRemaining.toFixed(1)} min remaining)`);
            const markPaidRes = await fetch(
              `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/markOrderAsPaid`,
              {
                method: "POST",
                headers: proxyHeaders,
                body: JSON.stringify({ orderNumber: order.orderNumber }),
              }
            );
            const markPaidResult = await markPaidRes.json();

            // Only treat as success if Binance explicitly returns success code
            if (markPaidResult?.code === "000000") {
              await supabase.from("p2p_auto_pay_log").insert({
                order_number: order.orderNumber,
                action: "mark_paid",
                status: "success",
                minutes_remaining: parseFloat(minutesRemaining.toFixed(2)),
              });
              return { success: true };
            } else {
              await supabase.from("p2p_auto_pay_log").insert({
                order_number: order.orderNumber,
                action: "mark_paid",
                status: "failed",
                minutes_remaining: parseFloat(minutesRemaining.toFixed(2)),
                error_message: JSON.stringify(markPaidResult),
              });
              return { failed: true };
            }
          }
          return { skipped: true, reason: "outside_window" };
        } catch (apErr) {
          console.error(`Auto-pay error for ${order.orderNumber}:`, apErr);
          return { error: true };
        }
      });

      const autoPayResults = await Promise.all(autoPayPromises);
      for (const r of autoPayResults) {
        if (r.success) autoPaidCount++;
        if (r.failed || r.error) errors++;
      }
    }

    // ===== AUTO-REPLY LOGIC =====
    if (hasRules) {
      const { data: exclusionRows } = await supabase
        .from("terminal_auto_reply_exclusions")
        .select("order_number");
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
      const orderNumbers = activeOrders.map((o) => o.orderNumber);
      const verifiedNameMap = new Map<string, string>();
      if (orderNumbers.length > 0) {
        const { data: nameRows } = await supabase
          .from("binance_order_history")
          .select("order_number, verified_name, counter_part_nick_name")
          .in("order_number", orderNumbers);
        if (nameRows) {
          for (const row of nameRows) {
            const name = row.verified_name || row.counter_part_nick_name;
            if (name && !name.includes("*")) verifiedNameMap.set(row.order_number, name);
          }
        }
      }

      // For orders without a clean name, fetch from Binance detail API
      for (const order of activeOrders) {
        if (!verifiedNameMap.has(order.orderNumber)) {
          const detailName = await fetchVerifiedName(BINANCE_PROXY_URL, proxyHeaders, order.orderNumber, order.tradeType);
          if (detailName && !detailName.includes("*")) {
            verifiedNameMap.set(order.orderNumber, detailName);
          }
        }
      }

      // Collect all pending messages first
      const pendingMessages: PendingMessage[] = [];

      for (const order of activeOrders) {
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

            const verifiedName = verifiedNameMap.get(order.orderNumber) || null;
            const message = renderTemplate(rule.message_template, order, verifiedName);

            pendingMessages.push({ orderNumber: order.orderNumber, message, event, rule });
          }
        }
      }

      console.log(`${pendingMessages.length} pending auto-reply messages to send`);

      // Pre-fetch WebSocket credentials once, reuse for all messages
      let chatCredential: { chatWssUrl: string; listenKey: string; token: string } | null = null;
      if (pendingMessages.length > 0) {
        chatCredential = await getChatCredential(BINANCE_PROXY_URL, proxyHeaders);
      }

      // Send each message via WebSocket
      for (const pm of pendingMessages) {
        const result = await sendChatMessage(
          BINANCE_PROXY_URL,
          proxyHeaders,
          pm.orderNumber,
          pm.message,
          chatCredential,
        );
        // Update cached credential if returned
        if (result.credential) chatCredential = result.credential;

        if (result.success) {
          await supabase.from("p2p_auto_reply_processed").insert({
            order_number: pm.orderNumber,
            trigger_event: pm.event,
            rule_id: pm.rule.id,
          });
          await supabase.from("p2p_auto_reply_log").insert({
            rule_id: pm.rule.id,
            order_number: pm.orderNumber,
            trigger_event: pm.event,
            message_sent: pm.message,
            status: "sent",
          });
          console.log(`✅ Auto-reply sent: [${pm.event}] ${pm.rule.name} → Order ${pm.orderNumber}`);
          processed++;
        } else {
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
    }

    const result = {
      message: "Execution complete",
      processed,
      autoPaid: autoPaidCount,
      errors,
      ordersChecked: activeOrders.length,
      rulesActive: rules?.length || 0,
      autoPayActive,
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