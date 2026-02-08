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
  orderStatus: string;
  createTime: number;
  counterPartNickName: string;
  payMethodName?: string;
}

// Template variable replacer
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

// Map Binance order status to trigger events
function detectTriggerEvents(order: BinanceOrder): string[] {
  const events: string[] = [];
  const status = (order.orderStatus || "").toUpperCase();

  // order_received: any active order (not completed/cancelled)
  if (!status.includes("COMPLETED") && !status.includes("CANCEL") && !status.includes("APPEAL")) {
    events.push("order_received");
  }

  // payment_marked: buyer has paid (status codes 2, 3 or string contains PAID/PAYING)
  if (status === "2" || status === "3" || status.includes("PAID") || status.includes("PAYING")) {
    events.push("payment_marked");
  }

  // order_completed
  if (status.includes("COMPLETED") || status === "4" || status === "5") {
    events.push("order_completed");
  }

  // timer_breach: order older than 15 minutes and still active
  const ageMinutes = (Date.now() - order.createTime) / 60000;
  if (ageMinutes > 15 && !status.includes("COMPLETED") && !status.includes("CANCEL")) {
    events.push("timer_breach");
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
    if (!rules || rules.length === 0) {
      console.log("No active auto-reply rules found. Skipping.");
      return new Response(JSON.stringify({ message: "No active rules", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${rules.length} active auto-reply rules`);

    // 2. Fetch active orders from Binance
    const activeRes = await fetch(`${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/listOrders`, {
      method: "POST",
      headers: proxyHeaders,
      body: JSON.stringify({ page: 1, rows: 50 }),
    });
    const activeData = await activeRes.json();
    const activeOrders: BinanceOrder[] = activeData?.data || [];

    // 3. Also check recent history for completed/cancelled events
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

    for (const order of allOrders) {
      const triggerEvents = detectTriggerEvents(order);

      for (const event of triggerEvents) {
        // Find matching rules for this event
        const matchingRules = (rules as AutoReplyRule[]).filter((r) => {
          if (r.trigger_event !== event) return false;
          if (r.trade_type && r.trade_type !== order.tradeType) return false;
          return true;
        });

        for (const rule of matchingRules) {
          // Check if already processed
          const { data: existing } = await supabase
            .from("p2p_auto_reply_processed")
            .select("id")
            .eq("order_number", order.orderNumber)
            .eq("trigger_event", event)
            .eq("rule_id", rule.id)
            .maybeSingle();

          if (existing) continue; // Already sent

          // Check delay (order age must exceed delay_seconds)
          const orderAgeSeconds = (Date.now() - order.createTime) / 1000;
          if (orderAgeSeconds < rule.delay_seconds) continue;

          // Render the message
          const message = renderTemplate(rule.message_template, order);

          try {
            // Send via Binance Chat API
            const sendRes = await fetch(
              `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/chat/sendChatMessage`,
              {
                method: "POST",
                headers: proxyHeaders,
                body: JSON.stringify({
                  orderNo: order.orderNumber,
                  message,
                  chatMessageType: "text",
                }),
              }
            );
            const sendResult = await sendRes.json();

            if (sendResult?.code === "000000" || sendRes.ok) {
              // Mark as processed
              await supabase.from("p2p_auto_reply_processed").insert({
                order_number: order.orderNumber,
                trigger_event: event,
                rule_id: rule.id,
              });

              // Log execution
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
              // Log failure
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

    const result = { message: "Execution complete", processed, errors, ordersChecked: allOrders.length, rulesActive: rules.length };
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
