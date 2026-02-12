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
  payMethodName?: string;
  notifyPayEndTime?: number;
  notifyPayedExpireMinute?: number;
}

function renderTemplate(template: string, order: BinanceOrder): string {
  return template
    .replace(/\{\{orderNumber\}\}/g, order.orderNumber)
    .replace(/\{\{amount\}\}/g, order.amount)
    .replace(/\{\{totalPrice\}\}/g, order.totalPrice)
    .replace(/\{\{unitPrice\}\}/g, order.unitPrice)
    .replace(/\{\{asset\}\}/g, order.asset || "USDT")
    .replace(/\{\{fiat\}\}/g, order.fiatUnit || "INR")
    .replace(/\{\{counterparty\}\}/g, order.counterPartNickName || "Trader")
    .replace(/\{\{payMethod\}\}/g, order.payMethodName || "N/A");
}

function detectTriggerEvents(order: BinanceOrder): string[] {
  const events: string[] = [];
  const status = String(order.orderStatus ?? "").toUpperCase();

  if (!status.includes("COMPLETED") && !status.includes("CANCEL") && !status.includes("APPEAL") && !status.includes("EXPIRED")) {
    events.push("order_received");
  }

  if (status === "2" || status === "3" || status.includes("PAID") || status.includes("PAYING")) {
    events.push("payment_marked");
  }

  if (status.includes("COMPLETED") || status === "4" || status === "5") {
    events.push("order_completed");
  }

  if (status.includes("CANCEL")) {
    events.push("order_cancelled");
  }

  if (status.includes("APPEAL")) {
    events.push("order_appealed");
  }

  const ageMinutes = (Date.now() - order.createTime) / 60000;
  if (ageMinutes > 15 && !status.includes("COMPLETED") && !status.includes("CANCEL")) {
    events.push("timer_breach");
  }

  if (ageMinutes > 5 && (status === "1" || status === "" || status.includes("PENDING")) && !status.includes("PAID")) {
    events.push("payment_pending");
  }

  return events;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = "https://vagiqbespusdxsbqpvbo.supabase.co";
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const BINANCE_PROXY_URL = Deno.env.get("BINANCE_PROXY_URL");
    const BINANCE_API_KEY = Deno.env.get("BINANCE_API_KEY");
    const BINANCE_API_SECRET = Deno.env.get("BINANCE_API_SECRET");
    const BINANCE_PROXY_TOKEN = Deno.env.get("BINANCE_PROXY_TOKEN");

    if (!BINANCE_PROXY_URL || !BINANCE_API_KEY || !BINANCE_API_SECRET || !BINANCE_PROXY_TOKEN) {
      throw new Error("Missing Binance configuration secrets");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const proxyHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "x-proxy-token": BINANCE_PROXY_TOKEN,
      "x-api-key": BINANCE_API_KEY,
      "x-api-secret": BINANCE_API_SECRET,
    };

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

    // 3. Fetch active orders from Binance
    const activeRes = await fetch(`${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/listOrders`, {
      method: "POST",
      headers: proxyHeaders,
      body: JSON.stringify({ page: 1, rows: 50 }),
    });
    const activeData = await activeRes.json();
    const activeOrders: BinanceOrder[] = activeData?.data || [];

    // 4. Also check recent history for completed/cancelled events
    const historyRes = await fetch(
      `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/listUserOrderHistory`,
      {
        method: "POST",
        headers: proxyHeaders,
        body: JSON.stringify({ page: 1, rows: 20 }),
      }
    );
    const historyData = await historyRes.json();
    const historyOrders: BinanceOrder[] = historyData?.data || [];

    // Merge, dedup by orderNumber
    const orderMap = new Map<string, BinanceOrder>();
    for (const o of [...activeOrders, ...historyOrders]) {
      if (!orderMap.has(o.orderNumber)) orderMap.set(o.orderNumber, o);
    }

    const allOrders = Array.from(orderMap.values());
    console.log(`Processing ${allOrders.length} orders (${activeOrders.length} active, ${historyOrders.length} history)`);

    let processed = 0;
    let errors = 0;
    let autoPaidCount = 0;

    // ===== AUTO-PAY LOGIC =====
    if (autoPayActive) {
      // Only process active BUY orders that haven't been paid yet
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

      console.log(`Auto-pay: ${buyOrdersPendingPayment.length} BUY orders pending payment`);

      for (const order of buyOrdersPendingPayment) {
        try {
          // Calculate time remaining to expiry
          let expiryTimeMs: number | null = null;

          if (order.notifyPayEndTime) {
            expiryTimeMs = order.notifyPayEndTime;
          } else if (order.notifyPayedExpireMinute && order.createTime) {
            expiryTimeMs = order.createTime + order.notifyPayedExpireMinute * 60 * 1000;
          }

          if (!expiryTimeMs) {
            // Fallback: assume 15 min payment window from createTime
            expiryTimeMs = order.createTime + 15 * 60 * 1000;
          }

          const timeRemainingMs = expiryTimeMs - Date.now();
          const minutesRemaining = timeRemainingMs / 60000;

          console.log(`Order ${order.orderNumber}: ${minutesRemaining.toFixed(1)} min remaining, threshold: ${autoPayMinutes} min`);

          // Check if within the auto-pay window (less than X minutes remaining, but still positive)
          if (minutesRemaining <= autoPayMinutes && minutesRemaining > 0) {
            // Check if already auto-paid
            const { data: alreadyPaid } = await supabase
              .from("p2p_auto_pay_log")
              .select("id")
              .eq("order_number", order.orderNumber)
              .eq("status", "success")
              .maybeSingle();

            if (alreadyPaid) {
              console.log(`Order ${order.orderNumber}: already auto-paid, skipping`);
              continue;
            }

            // Mark as paid via Binance API
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

            if (markPaidResult?.code === "000000" || markPaidRes.ok) {
              await supabase.from("p2p_auto_pay_log").insert({
                order_number: order.orderNumber,
                action: "mark_paid",
                status: "success",
                minutes_remaining: parseFloat(minutesRemaining.toFixed(2)),
              });
              console.log(`✅ Auto-paid order ${order.orderNumber}`);
              autoPaidCount++;
            } else {
              await supabase.from("p2p_auto_pay_log").insert({
                order_number: order.orderNumber,
                action: "mark_paid",
                status: "failed",
                minutes_remaining: parseFloat(minutesRemaining.toFixed(2)),
                error_message: JSON.stringify(markPaidResult),
              });
              console.error(`❌ Auto-pay failed for ${order.orderNumber}: ${JSON.stringify(markPaidResult)}`);
              errors++;
            }
          }
        } catch (apErr) {
          console.error(`Auto-pay error for ${order.orderNumber}:`, apErr);
          await supabase.from("p2p_auto_pay_log").insert({
            order_number: order.orderNumber,
            action: "mark_paid",
            status: "failed",
            error_message: String(apErr),
          });
          errors++;
        }
      }
    }

    // ===== AUTO-REPLY LOGIC (existing) =====
    if (hasRules) {
      for (const order of allOrders) {
        const triggerEvents = detectTriggerEvents(order);

        for (const event of triggerEvents) {
          const matchingRules = (rules as AutoReplyRule[]).filter((r) => {
            if (r.trigger_event !== event) return false;
            if (r.trade_type && r.trade_type !== order.tradeType) return false;
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

            const message = renderTemplate(rule.message_template, order);

            try {
              const sendParams = new URLSearchParams({
                orderNo: order.orderNumber,
                content: message,
                contentType: "TEXT",
              });
              const sendRes = await fetch(
                `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/chat/sendMessage?${sendParams.toString()}`,
                {
                  method: "POST",
                  headers: proxyHeaders,
                }
              );
              const sendResult = await sendRes.json();

              if (sendResult?.code === "000000" || sendRes.ok) {
                await supabase.from("p2p_auto_reply_processed").insert({
                  order_number: order.orderNumber,
                  trigger_event: event,
                  rule_id: rule.id,
                });

                await supabase.from("p2p_auto_reply_log").insert({
                  rule_id: rule.id,
                  order_number: order.orderNumber,
                  trigger_event: event,
                  message_sent: message,
                  status: "sent",
                });

                console.log(`✅ Auto-reply sent: [${event}] ${rule.name} → Order ${order.orderNumber}`);
                processed++;
              } else {
                await supabase.from("p2p_auto_reply_log").insert({
                  rule_id: rule.id,
                  order_number: order.orderNumber,
                  trigger_event: event,
                  message_sent: message,
                  status: "failed",
                  error_message: JSON.stringify(sendResult),
                });
                console.error(`❌ Auto-reply failed: ${rule.name} → ${JSON.stringify(sendResult)}`);
                errors++;
              }
            } catch (sendErr) {
              await supabase.from("p2p_auto_reply_log").insert({
                rule_id: rule.id,
                order_number: order.orderNumber,
                trigger_event: event,
                message_sent: message,
                status: "failed",
                error_message: String(sendErr),
              });
              console.error(`❌ Auto-reply error: ${rule.name} → ${sendErr}`);
              errors++;
            }
          }
        }
      }
    }

    const result = {
      message: "Execution complete",
      processed,
      autoPaid: autoPaidCount,
      errors,
      ordersChecked: allOrders.length,
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
