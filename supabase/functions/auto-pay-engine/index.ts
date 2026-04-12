import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
  notifyPayEndTime?: number;
  notifyPayedExpireMinute?: number;
  paymentWindow?: number; // actual payment window in minutes from order detail
}

/**
 * Fetch the actual payment window for an order from Binance order detail.
 * Returns the payment window in minutes, or null if unavailable.
 */
async function fetchOrderPaymentWindow(
  proxyUrl: string,
  proxyHeaders: Record<string, string>,
  orderNumber: string,
): Promise<{ paymentWindowMinutes: number | null; notifyPayEndTime: number | null }> {
  try {
    const res = await fetch(`${proxyUrl}/api/sapi/v1/c2c/orderMatch/getUserOrderDetail`, {
      method: "POST",
      headers: proxyHeaders,
      body: JSON.stringify({ orderNo: orderNumber }),
    });
    const data = await res.json();
    const detail = data?.data;
    if (!detail) return { paymentWindowMinutes: null, notifyPayEndTime: null };

    // Try multiple field names Binance uses for payment window
    const endTime = detail.notifyPayEndTime || detail.payEndTime || detail.paymentEndTime || null;
    const expireMinute = detail.notifyPayedExpireMinute || detail.payExpireMinute || detail.payTimeLimit || null;

    if (endTime && typeof endTime === 'number') {
      return { paymentWindowMinutes: null, notifyPayEndTime: endTime };
    }
    if (expireMinute && typeof expireMinute === 'number') {
      return { paymentWindowMinutes: expireMinute, notifyPayEndTime: null };
    }

    return { paymentWindowMinutes: null, notifyPayEndTime: null };
  } catch {
    return { paymentWindowMinutes: null, notifyPayEndTime: null };
  }
}

/**
 * Fetch ALL active orders from Binance, paginating through all pages.
 * This is critical — with only page 1 (50 rows), orders can be silently missed.
 */
async function fetchAllActiveOrders(
  proxyUrl: string,
  proxyHeaders: Record<string, string>,
): Promise<BinanceOrder[]> {
  const allOrders: BinanceOrder[] = [];
  const seen = new Set<string>();
  const maxPages = 5; // Safety limit — 5 pages × 50 = 250 orders max
  const rows = 50;

  for (let page = 1; page <= maxPages; page++) {
    try {
      const res = await fetch(`${proxyUrl}/api/sapi/v1/c2c/orderMatch/listOrders`, {
        method: "POST",
        headers: proxyHeaders,
        body: JSON.stringify({ page, rows }),
      });
      const data = await res.json();
      const orders: BinanceOrder[] = data?.data || [];

      if (!Array.isArray(orders) || orders.length === 0) break;

      for (const o of orders) {
        if (!o.orderNumber || seen.has(o.orderNumber)) continue;
        seen.add(o.orderNumber);
        allOrders.push(o);
      }

      // If we got fewer than requested, no more pages
      if (orders.length < rows) break;

      // Small delay between pages to avoid rate-limiting
      if (page < maxPages) {
        await new Promise((r) => setTimeout(r, 100));
      }
    } catch (err) {
      console.error(`Error fetching page ${page}:`, err);
      break;
    }
  }

  return allOrders;
}

/**
 * Verify order status after marking paid by fetching order detail.
 */
async function verifyOrderStatus(
  proxyUrl: string,
  proxyHeaders: Record<string, string>,
  orderNumber: string,
): Promise<{ verified: boolean; currentStatus: string | number | null }> {
  try {
    const res = await fetch(`${proxyUrl}/api/sapi/v1/c2c/orderMatch/getUserOrderDetail`, {
      method: "POST",
      headers: proxyHeaders,
      body: JSON.stringify({ orderNo: orderNumber }),
    });
    const data = await res.json();
    const detail = data?.data;
    if (!detail) return { verified: false, currentStatus: null };

    const status = String(detail.orderStatus ?? "");
    // Status 2 = BUYER_PAYED, 3 = PAID — both mean payment was registered
    const paidStatuses = new Set(["2", "3", "BUYER_PAYED", "PAID", "PAYING"]);
    return {
      verified: paidStatuses.has(status) || status.toUpperCase().includes("PAID"),
      currentStatus: detail.orderStatus,
    };
  } catch {
    return { verified: false, currentStatus: null };
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

    // 1. Fetch auto-pay settings
    const { data: autoPaySettings } = await supabase
      .from("p2p_auto_pay_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    const autoPayActive = autoPaySettings?.is_active === true;
    const autoPayMinutes = autoPaySettings?.minutes_before_expiry || 3;

    if (!autoPayActive) {
      console.log("Auto-pay is OFF. Skipping.");
      return new Response(JSON.stringify({ message: "Auto-pay inactive", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Auto-pay ON: trigger at ${autoPayMinutes} min before expiry`);

    // 2. Fetch ALL active orders (paginated)
    const allActiveOrders = await fetchAllActiveOrders(BINANCE_PROXY_URL, proxyHeaders);
    console.log(`Fetched ${allActiveOrders.length} total active orders (all pages)`);

    // 2b. Auto-assign orders to operators by scope (size range / ad ID)
    let autoAssigned = 0;
    for (const order of allActiveOrders) {
      try {
        const { data: result } = await supabase.rpc('auto_assign_order_by_scope', {
          p_order_number: order.orderNumber,
          p_trade_type: order.tradeType,
          p_total_price: parseFloat(order.totalPrice || '0'),
          p_asset: order.asset || 'USDT',
          p_adv_no: order.advNo || null,
        });
        if (result?.status === 'assigned') {
          autoAssigned++;
          console.log(`📋 Auto-assigned ${order.orderNumber} to ${result.operator_id} via ${result.match_type}`);
        }
      } catch (err) {
        // Non-critical — log and continue
        console.warn(`Auto-assign failed for ${order.orderNumber}:`, err);
      }
    }
    if (autoAssigned > 0) {
      console.log(`Auto-assigned ${autoAssigned} orders to operators by scope`);
    }

    // 3. Filter to BUY orders in TRADING status (status 1)
    const PAYABLE_STATUSES = new Set(["1", "TRADING"]);
    const NON_PAYABLE_KEYWORDS = ["PAID", "PAYING", "COMPLETED", "CANCEL", "APPEAL", "EXPIRED"];

    const buyOrdersPendingPayment = allActiveOrders.filter((o) => {
      if (o.tradeType !== "BUY") return false;
      const statusRaw = String(o.orderStatus ?? "");
      const statusUpper = statusRaw.toUpperCase();

      if (/^\d+$/.test(statusRaw)) {
        return PAYABLE_STATUSES.has(statusRaw);
      }
      return !NON_PAYABLE_KEYWORDS.some((kw) => statusUpper.includes(kw));
    });

    console.log(`Auto-pay candidates: ${buyOrdersPendingPayment.length} BUY orders in TRADING status`);

    if (buyOrdersPendingPayment.length === 0) {
      return new Response(JSON.stringify({
        message: "No candidates",
        totalOrders: allActiveOrders.length,
        candidates: 0,
        autoPaid: 0,
        errors: 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Fetch recent logs to avoid redundant attempts
    // - Skip orders already successfully paid
    // - Skip orders that failed within the last 5 minutes (increased from 3 to reduce spam)
    const recentCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const [{ data: recentSuccessLogs }, { data: recentFailedLogs }] = await Promise.all([
      supabase
        .from("p2p_auto_pay_log")
        .select("order_number")
        .eq("status", "success"),
      supabase
        .from("p2p_auto_pay_log")
        .select("order_number")
        .eq("status", "failed")
        .gte("executed_at", recentCutoff),
    ]);

    const alreadyPaidSet = new Set((recentSuccessLogs || []).map((l: any) => l.order_number));
    const recentlyFailedSet = new Set((recentFailedLogs || []).map((l: any) => l.order_number));

    let autoPaidCount = 0;
    let errors = 0;
    let skipped = 0;

    // 5. Process each candidate
    for (const order of buyOrdersPendingPayment) {
      try {
        // Skip if already paid successfully
        if (alreadyPaidSet.has(order.orderNumber)) {
          skipped++;
          continue;
        }

        // Skip if recently failed (5-min cooldown)
        if (recentlyFailedSet.has(order.orderNumber)) {
          skipped++;
          continue;
        }

        // Calculate time remaining
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

        // Only pay if within the window and order hasn't expired
        if (minutesRemaining > autoPayMinutes || minutesRemaining <= 0) {
          continue;
        }

        console.log(`🤖 Auto-paying order ${order.orderNumber} (${minutesRemaining.toFixed(1)} min remaining)`);

        // Pre-verify: check current order status before attempting payment
        // This reduces 83023 errors from orders already paid by operators
        const preCheck = await verifyOrderStatus(BINANCE_PROXY_URL, proxyHeaders, order.orderNumber);
        if (preCheck.verified) {
          console.log(`⏭️ Order ${order.orderNumber} already paid (status: ${preCheck.currentStatus}), skipping`);
          // Log as success since it's already paid
          await supabase.from("p2p_auto_pay_log").insert({
            order_number: order.orderNumber,
            action: "mark_paid",
            status: "success",
            minutes_remaining: parseFloat(minutesRemaining.toFixed(2)),
            error_message: `Already paid (status: ${preCheck.currentStatus}) — skipped markPaid call`,
          });
          alreadyPaidSet.add(order.orderNumber);
          autoPaidCount++;
          continue;
        }

        // Mark as paid
        const markPaidRes = await fetch(
          `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/markOrderAsPaid`,
          {
            method: "POST",
            headers: proxyHeaders,
            body: JSON.stringify({ orderNumber: order.orderNumber }),
          }
        );
        const markPaidResult = await markPaidRes.json();

        if (markPaidResult?.code === "000000") {
          // Post-payment verification
          await new Promise((r) => setTimeout(r, 500)); // Brief delay for status to propagate
          const postCheck = await verifyOrderStatus(BINANCE_PROXY_URL, proxyHeaders, order.orderNumber);

          await supabase.from("p2p_auto_pay_log").insert({
            order_number: order.orderNumber,
            action: "mark_paid",
            status: "success",
            minutes_remaining: parseFloat(minutesRemaining.toFixed(2)),
            error_message: postCheck.verified
              ? `Verified: status ${postCheck.currentStatus}`
              : `Warning: post-verify status ${postCheck.currentStatus}`,
          });

          if (!postCheck.verified) {
            console.warn(`⚠️ Order ${order.orderNumber} markPaid returned success but post-verify shows status ${postCheck.currentStatus}`);
          } else {
            console.log(`✅ Order ${order.orderNumber} paid and verified (status: ${postCheck.currentStatus})`);
          }

          alreadyPaidSet.add(order.orderNumber);
          autoPaidCount++;
        } else {
          // Check if error is "already paid" type (83023)
          const errorCode = markPaidResult?.code;
          const isAlreadyPaidError = errorCode === 83023 || errorCode === "83023";

          if (isAlreadyPaidError) {
            // Don't log as failure — it's already paid, just record it
            await supabase.from("p2p_auto_pay_log").insert({
              order_number: order.orderNumber,
              action: "mark_paid",
              status: "skipped",
              minutes_remaining: parseFloat(minutesRemaining.toFixed(2)),
              error_message: `Already in non-payable state (${errorCode})`,
            });
            alreadyPaidSet.add(order.orderNumber);
          } else {
            // Genuine failure
            await supabase.from("p2p_auto_pay_log").insert({
              order_number: order.orderNumber,
              action: "mark_paid",
              status: "failed",
              minutes_remaining: parseFloat(minutesRemaining.toFixed(2)),
              error_message: JSON.stringify(markPaidResult),
            });
            errors++;
            console.error(`❌ Auto-pay FAILED for ${order.orderNumber}: ${JSON.stringify(markPaidResult)}`);
          }
        }
      } catch (apErr) {
        console.error(`Auto-pay error for ${order.orderNumber}:`, apErr);
        errors++;
      }
    }

    const result = {
      message: "Auto-pay complete",
      totalOrders: allActiveOrders.length,
      candidates: buyOrdersPendingPayment.length,
      autoPaid: autoPaidCount,
      autoAssigned,
      skipped,
      errors,
      autoPayMinutes,
    };
    console.log("Auto-pay result:", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Auto-pay engine error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
