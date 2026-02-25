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
 * Send a chat message via WebSocket relay.
 * 1. Get chat credentials from Binance (via REST proxy)
 * 2. Connect to the relay (port 8080) targeting Binance's WSS
 * 3. Send the message
 */
async function sendChatMessage(
  proxyUrl: string,
  proxyToken: string,
  orderNo: string,
  content: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Step 1: Get chat credentials via generic proxy GET handler
    const credRes = await fetch(
      `${proxyUrl}/api/sapi/v1/c2c/chat/retrieveChatCredential?orderNo=${orderNo}`,
      {
        method: "GET",
        headers: {
          "x-proxy-token": proxyToken,
        },
      }
    );
    const credData = await credRes.json();
    console.log(`retrieveChatCredential for ${orderNo}: code=${credData?.code}, hasData=${!!credData?.data}`);

    if (credData?.code !== "000000" || !credData?.data) {
      return { success: false, error: `Credential failed: ${JSON.stringify(credData)}` };
    }

    const chatWssUrl = credData.data.chatWssUrl;
    const listenKey = credData.data.listenKey;
    const listenToken = credData.data.listenToken;

    if (!chatWssUrl || !listenKey || !listenToken) {
      return { success: false, error: `Missing WSS fields: url=${chatWssUrl}, key=${listenKey}` };
    }

    // Step 2: Connect to relay on port 8080
    const proxyHost = new URL(proxyUrl).hostname;
    const targetUrl = `${chatWssUrl}?listenKey=${listenKey}`;
    const relayUrl = `ws://${proxyHost}:8080?key=${encodeURIComponent(proxyToken)}&target=${encodeURIComponent(targetUrl)}`;

    console.log(`Connecting to relay for order ${orderNo}...`);

    const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      const ws = new WebSocket(relayUrl);
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          try { ws.close(); } catch (_) {}
          resolve({ success: false, error: "WebSocket timeout (10s)" });
        }
      }, 10000);

      ws.onopen = () => {
        console.log(`WebSocket connected for order ${orderNo}, sending auth...`);

        // Authenticate with token
        ws.send(JSON.stringify({
          type: "auth",
          listenKey: listenKey,
          token: listenToken,
        }));

        // Send message after brief auth delay
        setTimeout(() => {
          const msgPayload = JSON.stringify({
            type: "sendMessage",
            orderNo: orderNo,
            content: content,
            contentType: "TEXT",
            uuid: crypto.randomUUID(),
          });
          console.log(`Sending chat message for ${orderNo}: ${content.substring(0, 50)}...`);
          ws.send(msgPayload);

          // Wait for response/confirmation
          setTimeout(() => {
            if (!settled) {
              settled = true;
              clearTimeout(timeout);
              try { ws.close(); } catch (_) {}
              resolve({ success: true });
            }
          }, 2000);
        }, 500);
      };

      ws.onmessage = (event) => {
        const data = typeof event.data === "string" ? event.data : "";
        console.log(`WebSocket response for ${orderNo}: ${data.substring(0, 300)}`);
      };

      ws.onerror = (event) => {
        console.error(`WebSocket error for ${orderNo}:`, event);
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve({ success: false, error: "WebSocket connection error" });
        }
      };

      ws.onclose = (event) => {
        console.log(`WebSocket closed for ${orderNo}: code=${event.code}`);
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve({ success: false, error: `WebSocket closed: code=${event.code}` });
        }
      };
    });

    return result;
  } catch (err) {
    return { success: false, error: String(err) };
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
      const buyOrdersPendingPayment = activeOrders.filter((o) => {
        const status = String(o.orderStatus ?? "").toUpperCase();
        return (
          o.tradeType === "BUY" &&
          !status.includes("PAID") &&
          !status.includes("PAYING") &&
          !status.includes("COMPLETED") &&
          !status.includes("CANCEL") &&
          !status.includes("APPEAL") &&
          !status.includes("EXPIRED")
        );
      });

      for (const order of buyOrdersPendingPayment) {
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
            const { data: alreadyPaid } = await supabase
              .from("p2p_auto_pay_log")
              .select("id")
              .eq("order_number", order.orderNumber)
              .eq("status", "success")
              .maybeSingle();

            if (alreadyPaid) continue;

            console.log(`🤖 Auto-paying order ${order.orderNumber}`);
            const markPaidRes = await fetch(
              `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/markOrderAsPaid`,
              {
                method: "POST",
                headers: proxyHeaders,
                body: JSON.stringify({ orderNumber: order.orderNumber }),
              }
            );
            const markPaidResult = await markPaidRes.json();

            if (markPaidResult?.code === "000000" || markPaidRes.ok) {
              await supabase.from("p2p_auto_pay_log").insert({
                order_number: order.orderNumber,
                action: "mark_paid",
                status: "success",
                minutes_remaining: parseFloat(minutesRemaining.toFixed(2)),
              });
              autoPaidCount++;
            } else {
              await supabase.from("p2p_auto_pay_log").insert({
                order_number: order.orderNumber,
                action: "mark_paid",
                status: "failed",
                minutes_remaining: parseFloat(minutesRemaining.toFixed(2)),
                error_message: JSON.stringify(markPaidResult),
              });
              errors++;
            }
          }
        } catch (apErr) {
          console.error(`Auto-pay error for ${order.orderNumber}:`, apErr);
          errors++;
        }
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

      // Pre-fetch verified names
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
            if (name) verifiedNameMap.set(row.order_number, name);
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

      // Send each message via WebSocket relay
      for (const pm of pendingMessages) {
        const result = await sendChatMessage(
          BINANCE_PROXY_URL,
          BINANCE_PROXY_TOKEN,
          pm.orderNumber,
          pm.message,
        );

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