import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface BinanceOrder {
  orderNumber: string;
  advNo?: string;
  tradeType: string;
  asset?: string;
  fiatUnit?: string;
  totalPrice?: string;
  amount?: string;
  unitPrice?: string;
  orderStatus: string | number;
  createTime: number;
  counterPartNickName?: string;
  notifyPayEndTime?: number;
  notifyPayedExpireMinute?: number;
  payEndTime?: number;
  paymentEndTime?: number;
  source?: string;
  raw?: any;
}

const DEFAULT_PAYMENT_WINDOW_MINUTES = 15;
const CACHED_LOOKBACK_MS = 30 * 60 * 1000;
const FINAL_STATUS_KEYWORDS = ["COMPLETED", "CANCEL", "EXPIRED", "APPEAL", "DISPUTE"];
const ALREADY_PAID_KEYWORDS = ["BUYER_PAYED", "BUYER_PAID", "PAID", "PAYING", "RELEASING"];
const PAYABLE_KEYWORDS = ["TRADING", "PENDING", "PENDING_PAYMENT"];
const NUMERIC_STATUS_MAP: Record<number, string> = {
  1: "TRADING",
  2: "BUYER_PAYED",
  3: "BUYER_PAYED",
  4: "BUYER_PAYED",
  5: "COMPLETED",
  6: "CANCELLED",
  7: "CANCELLED",
  8: "APPEAL",
};

function normalizeStatus(raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return "";
  const value = String(raw).trim();
  if (/^\d+$/.test(value)) return NUMERIC_STATUS_MAP[Number(value)] || value;
  return value.toUpperCase();
}

function isFinalStatus(status: string): boolean {
  const upper = normalizeStatus(status);
  return FINAL_STATUS_KEYWORDS.some((kw) => upper.includes(kw));
}

function isAlreadyPaidStatus(status: string): boolean {
  const upper = normalizeStatus(status);
  return ALREADY_PAID_KEYWORDS.some((kw) => upper.includes(kw));
}

function isPayableStatus(status: unknown): boolean {
  const upper = normalizeStatus(status);
  if (!upper) return false;
  if (isFinalStatus(upper) || isAlreadyPaidStatus(upper)) return false;
  return PAYABLE_KEYWORDS.some((kw) => upper.includes(kw)) || upper === "1";
}

function extractOrders(data: any): BinanceOrder[] {
  if (Array.isArray(data?.data?.data)) return data.data.data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data)) return data;
  return [];
}

function getOrderNumber(order: any): string {
  return String(order?.orderNumber ?? order?.order_number ?? order?.binance_order_number ?? "").trim();
}

function toCandidate(order: any, source: string): BinanceOrder | null {
  const orderNumber = getOrderNumber(order);
  if (!orderNumber) return null;

  const raw = order?.raw_data ?? order?.raw ?? order;
  return {
    orderNumber,
    advNo: order?.advNo ?? order?.adv_no ?? order?.binance_adv_no ?? raw?.advNo,
    tradeType: String(order?.tradeType ?? order?.trade_type ?? raw?.tradeType ?? "BUY"),
    asset: order?.asset ?? raw?.asset ?? "USDT",
    fiatUnit: order?.fiatUnit ?? order?.fiat_unit ?? raw?.fiatUnit ?? raw?.fiat ?? "INR",
    totalPrice: String(order?.totalPrice ?? order?.total_price ?? raw?.totalPrice ?? "0"),
    amount: String(order?.amount ?? raw?.amount ?? "0"),
    unitPrice: String(order?.unitPrice ?? order?.unit_price ?? raw?.unitPrice ?? raw?.price ?? "0"),
    orderStatus: order?.orderStatus ?? order?.order_status ?? raw?.orderStatus ?? "",
    createTime: Number(order?.createTime ?? order?.create_time ?? order?.binance_create_time ?? raw?.createTime ?? 0),
    counterPartNickName: order?.counterPartNickName ?? order?.counter_part_nick_name ?? raw?.counterPartNickName,
    notifyPayEndTime: Number(order?.notifyPayEndTime ?? raw?.notifyPayEndTime ?? 0) || undefined,
    notifyPayedExpireMinute: Number(order?.notifyPayedExpireMinute ?? raw?.notifyPayedExpireMinute ?? 0) || undefined,
    payEndTime: Number(order?.payEndTime ?? raw?.payEndTime ?? 0) || undefined,
    paymentEndTime: Number(order?.paymentEndTime ?? raw?.paymentEndTime ?? 0) || undefined,
    source,
    raw,
  };
}

async function fetchOrderDetail(
  proxyUrl: string,
  proxyHeaders: Record<string, string>,
  orderNumber: string,
): Promise<{ detail: any | null; raw: any | null; requestShape: string | null }> {
  const payloads = [
    { shape: "orderNo", body: { orderNo: orderNumber } },
    { shape: "adOrderNo", body: { adOrderNo: orderNumber } },
    { shape: "orderNumber", body: { orderNumber } },
  ];

  for (const payload of payloads) {
    try {
      const res = await fetch(`${proxyUrl}/api/sapi/v1/c2c/orderMatch/getUserOrderDetail`, {
        method: "POST",
        headers: proxyHeaders,
        body: JSON.stringify(payload.body),
      });
      const raw = await res.json().catch(() => null);
      const detail = raw?.data?.data ?? raw?.data ?? null;
      if (detail?.orderNumber || detail?.orderNo || detail?.adOrderNo) {
        return { detail, raw, requestShape: payload.shape };
      }
    } catch (err) {
      console.warn(`Detail fetch failed for ${orderNumber} using ${payload.shape}:`, err);
    }
  }

  return { detail: null, raw: null, requestShape: null };
}

function resolveExpiry(order: BinanceOrder, detail?: any): { expiryTimeMs: number | null; method: string; fallbackUsed: boolean } {
  const source = detail || order.raw || order;
  const endTime = Number(
    order.notifyPayEndTime ||
      order.payEndTime ||
      order.paymentEndTime ||
      source?.notifyPayEndTime ||
      source?.payEndTime ||
      source?.paymentEndTime ||
      0,
  );
  if (endTime > 0) return { expiryTimeMs: endTime, method: "explicit_end_time", fallbackUsed: false };

  const expireMinute = Number(
    order.notifyPayedExpireMinute ||
      source?.notifyPayedExpireMinute ||
      source?.payExpireMinute ||
      source?.payTimeLimit ||
      0,
  );
  const createTime = Number(detail?.createTime || order.createTime || 0);
  if (expireMinute > 0 && createTime > 0) {
    return { expiryTimeMs: createTime + expireMinute * 60 * 1000, method: "detail_window", fallbackUsed: false };
  }

  if (createTime > 0) {
    return {
      expiryTimeMs: createTime + DEFAULT_PAYMENT_WINDOW_MINUTES * 60 * 1000,
      method: "fallback_15_min_window",
      fallbackUsed: true,
    };
  }

  return { expiryTimeMs: null, method: "unavailable", fallbackUsed: false };
}

async function fetchAllActiveOrders(proxyUrl: string, proxyHeaders: Record<string, string>): Promise<BinanceOrder[]> {
  const allOrders: BinanceOrder[] = [];
  const seen = new Set<string>();
  const maxPages = 8;
  const rows = 50;

  for (let page = 1; page <= maxPages; page++) {
    try {
      const res = await fetch(`${proxyUrl}/api/sapi/v1/c2c/orderMatch/listOrders`, {
        method: "POST",
        headers: proxyHeaders,
        body: JSON.stringify({ page, rows, tradeType: "BUY" }),
      });
      const data = await res.json();
      const orders = extractOrders(data);
      if (orders.length === 0) break;

      for (const raw of orders) {
        const candidate = toCandidate(raw, "live_listOrders");
        if (!candidate || seen.has(candidate.orderNumber)) continue;
        seen.add(candidate.orderNumber);
        allOrders.push(candidate);
      }

      if (orders.length < rows) break;
      await new Promise((r) => setTimeout(r, 100));
    } catch (err) {
      console.error(`Error fetching active order page ${page}:`, err);
      break;
    }
  }

  return allOrders;
}

async function fetchCachedRecentBuyOrders(supabase: any): Promise<BinanceOrder[]> {
  const cutoffMs = Date.now() - CACHED_LOOKBACK_MS;
  const [history, records] = await Promise.all([
    supabase
      .from("binance_order_history")
      .select("order_number,adv_no,trade_type,asset,fiat_unit,order_status,amount,total_price,unit_price,commission,counter_part_nick_name,create_time,raw_data")
      .eq("trade_type", "BUY")
      .gte("create_time", cutoffMs)
      .order("create_time", { ascending: false })
      .limit(100),
    supabase
      .from("p2p_order_records")
      .select("binance_order_number,binance_adv_no,trade_type,asset,fiat_unit,order_status,amount,total_price,unit_price,commission,counterparty_nickname,binance_create_time")
      .eq("trade_type", "BUY")
      .gte("binance_create_time", cutoffMs)
      .order("binance_create_time", { ascending: false })
      .limit(100),
  ]);

  const rows = [
    ...((history.data || []).map((row: any) => toCandidate(row, "cached_history"))),
    ...((records.data || []).map((row: any) => toCandidate(row, "cached_p2p_records"))),
  ].filter(Boolean) as BinanceOrder[];

  return rows;
}

async function logDecision(supabase: any, params: {
  order: BinanceOrder;
  status: string;
  minutesRemaining?: number | null;
  message?: string | null;
  reason: string;
  rawStatus?: unknown;
  metadata?: Record<string, any>;
}) {
  const { order, status, minutesRemaining, message, reason, rawStatus, metadata } = params;
  await supabase.from("p2p_auto_pay_log").insert({
    order_number: order.orderNumber,
    action: "mark_paid",
    status,
    minutes_remaining: minutesRemaining == null ? null : Number(minutesRemaining.toFixed(2)),
    error_message: message || null,
    decision_reason: reason,
    raw_status: rawStatus == null ? null : String(rawStatus),
    source: order.source || "unknown",
    metadata: metadata || {},
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  let runId: string | null = null;

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://vagiqbespusdxsbqpvbo.supabase.co";
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const BINANCE_PROXY_URL = Deno.env.get("BINANCE_PROXY_URL");
    const BINANCE_PROXY_TOKEN = Deno.env.get("BINANCE_PROXY_TOKEN");
    const BINANCE_API_KEY = Deno.env.get("BINANCE_API_KEY");
    const BINANCE_API_SECRET = Deno.env.get("BINANCE_API_SECRET");

    if (!BINANCE_PROXY_URL || !BINANCE_PROXY_TOKEN) throw new Error("Missing Binance configuration secrets");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: runRow } = await supabase.from("p2p_auto_pay_engine_runs").insert({ status: "running" }).select("id").single();
    runId = runRow?.id || null;

    const proxyHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "x-proxy-token": BINANCE_PROXY_TOKEN,
      clientType: "web",
    };
    if (BINANCE_API_KEY) proxyHeaders["x-api-key"] = BINANCE_API_KEY;
    if (BINANCE_API_SECRET) proxyHeaders["x-api-secret"] = BINANCE_API_SECRET;

    const { data: autoPaySettings } = await supabase
      .from("p2p_auto_pay_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    const autoPayActive = autoPaySettings?.is_active === true;
    const autoPayMinutes = Number(autoPaySettings?.minutes_before_expiry || 3);
    if (!autoPayActive) {
      const inactive = { message: "Auto-pay inactive", processed: 0 };
      if (runId) await supabase.from("p2p_auto_pay_engine_runs").update({ status: "inactive", finished_at: new Date().toISOString(), summary: inactive }).eq("id", runId);
      return new Response(JSON.stringify(inactive), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`Auto-pay ON: trigger at ${autoPayMinutes} min before expiry`);

    const [liveOrders, cachedOrders] = await Promise.all([
      fetchAllActiveOrders(BINANCE_PROXY_URL, proxyHeaders),
      fetchCachedRecentBuyOrders(supabase),
    ]);

    const orderMap = new Map<string, BinanceOrder>();
    for (const order of [...cachedOrders, ...liveOrders]) {
      const existing = orderMap.get(order.orderNumber);
      if (!existing || order.source === "live_listOrders") orderMap.set(order.orderNumber, order);
    }
    const allOrders = Array.from(orderMap.values());
    console.log(`Fetched ${liveOrders.length} live + ${cachedOrders.length} cached recent BUY orders; merged ${allOrders.length}`);

    let autoAssigned = 0;
    for (const order of liveOrders) {
      try {
        const { data: result } = await supabase.rpc("auto_assign_order_by_scope", {
          p_order_number: order.orderNumber,
          p_trade_type: order.tradeType,
          p_total_price: parseFloat(order.totalPrice || "0"),
          p_asset: order.asset || "USDT",
          p_adv_no: order.advNo || null,
        });
        if (result?.status === "assigned") autoAssigned++;
      } catch (err) {
        console.warn(`Auto-assign failed for ${order.orderNumber}:`, err);
      }
    }

    const candidates = allOrders.filter((order) => order.tradeType === "BUY" && !isFinalStatus(normalizeStatus(order.orderStatus)));
    console.log(`Auto-pay candidates before live verification: ${candidates.length}`);

    const { data: recentSuccessLogs } = await supabase
      .from("p2p_auto_pay_log")
      .select("order_number")
      .in("status", ["success", "unverified_success"])
      .gte("executed_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    const alreadyHandledSet = new Set((recentSuccessLogs || []).map((l: any) => l.order_number));

    let attempted = 0;
    let autoPaidCount = 0;
    let errors = 0;
    let skipped = 0;
    let warnings = 0;

    for (const order of candidates) {
      if (alreadyHandledSet.has(order.orderNumber)) {
        skipped++;
        continue;
      }

      try {
        const detailCheck = await fetchOrderDetail(BINANCE_PROXY_URL, proxyHeaders, order.orderNumber);
        const detail = detailCheck.detail;
        const liveStatus = normalizeStatus(detail?.orderStatus ?? order.orderStatus);

        if (!detail && order.source !== "live_listOrders") {
          warnings++;
          skipped++;
          await logDecision(supabase, {
            order,
            status: "warning",
            reason: "detail_unavailable_cached_order",
            rawStatus: order.orderStatus,
            message: "Cached order could not be verified from Binance detail; not safe to mark paid",
            metadata: { source: order.source, requestShape: detailCheck.requestShape, raw: detailCheck.raw },
          });
          continue;
        }

        if (isFinalStatus(liveStatus)) {
          skipped++;
          await logDecision(supabase, {
            order,
            status: "skipped",
            reason: "final_state",
            rawStatus: liveStatus,
            message: `Order already final: ${liveStatus}`,
            metadata: { requestShape: detailCheck.requestShape },
          });
          continue;
        }

        if (isAlreadyPaidStatus(liveStatus)) {
          autoPaidCount++;
          await logDecision(supabase, {
            order,
            status: "success",
            reason: "already_paid",
            rawStatus: liveStatus,
            message: `Already paid/releasing: ${liveStatus}`,
            metadata: { requestShape: detailCheck.requestShape },
          });
          alreadyHandledSet.add(order.orderNumber);
          continue;
        }

        if (!isPayableStatus(liveStatus)) {
          warnings++;
          skipped++;
          await logDecision(supabase, {
            order,
            status: "warning",
            reason: "non_payable_unknown_status",
            rawStatus: liveStatus,
            message: `Unknown non-final status not marked paid: ${liveStatus}`,
            metadata: { requestShape: detailCheck.requestShape, detailAvailable: !!detail },
          });
          continue;
        }

        const expiry = resolveExpiry(order, detail);
        if (!expiry.expiryTimeMs) {
          warnings++;
          skipped++;
          await logDecision(supabase, {
            order,
            status: "warning",
            reason: "expiry_unavailable",
            rawStatus: liveStatus,
            message: "Could not determine payment deadline; no create time available",
            metadata: { requestShape: detailCheck.requestShape },
          });
          continue;
        }

        const minutesRemaining = (expiry.expiryTimeMs - Date.now()) / 60000;
        if (minutesRemaining > autoPayMinutes) {
          skipped++;
          await logDecision(supabase, {
            order,
            status: "skipped",
            reason: "outside_trigger_window",
            rawStatus: liveStatus,
            minutesRemaining,
            message: `Not inside ${autoPayMinutes} minute trigger window`,
            metadata: { expiryMethod: expiry.method, fallbackUsed: expiry.fallbackUsed },
          });
          continue;
        }

        if (minutesRemaining <= -1) {
          warnings++;
          skipped++;
          await logDecision(supabase, {
            order,
            status: "warning",
            reason: "expired_before_attempt",
            rawStatus: liveStatus,
            minutesRemaining,
            message: "Payment deadline already passed before auto-pay attempt",
            metadata: { expiryMethod: expiry.method, fallbackUsed: expiry.fallbackUsed },
          });
          continue;
        }

        console.log(`🤖 Auto-paying order ${order.orderNumber} (${minutesRemaining.toFixed(1)} min remaining, ${expiry.method})`);
        attempted++;

        const markPaidRes = await fetch(`${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/markOrderAsPaid`, {
          method: "POST",
          headers: proxyHeaders,
          body: JSON.stringify({ orderNumber: order.orderNumber }),
        });
        const markPaidResult = await markPaidRes.json().catch(() => null);

        if (markPaidResult?.code === "000000" || markPaidResult?.success === true) {
          await new Promise((r) => setTimeout(r, 700));
          const postCheck = await fetchOrderDetail(BINANCE_PROXY_URL, proxyHeaders, order.orderNumber);
          const postStatus = normalizeStatus(postCheck.detail?.orderStatus);
          const verified = isAlreadyPaidStatus(postStatus) || postStatus === "BUYER_PAYED";

          await logDecision(supabase, {
            order,
            status: verified ? "success" : "unverified_success",
            reason: verified ? "marked_paid_verified" : "marked_paid_unverified",
            rawStatus: postStatus || null,
            minutesRemaining,
            message: verified ? `Verified: status ${postStatus}` : `Mark-paid returned success but post-verify status ${postStatus || "null"}`,
            metadata: { expiryMethod: expiry.method, fallbackUsed: expiry.fallbackUsed, markPaidResult, postRequestShape: postCheck.requestShape },
          });

          if (!verified) warnings++;
          autoPaidCount++;
          alreadyHandledSet.add(order.orderNumber);
        } else {
          const errorCode = markPaidResult?.code;
          const alreadyPaidError = errorCode === 83023 || errorCode === "83023";
          await logDecision(supabase, {
            order,
            status: alreadyPaidError ? "skipped" : "failed",
            reason: alreadyPaidError ? "already_non_payable_api" : "mark_paid_api_failed",
            rawStatus: liveStatus,
            minutesRemaining,
            message: JSON.stringify(markPaidResult),
            metadata: { expiryMethod: expiry.method, fallbackUsed: expiry.fallbackUsed, markPaidResult },
          });
          if (alreadyPaidError) skipped++;
          else errors++;
        }
      } catch (apErr) {
        console.error(`Auto-pay error for ${order.orderNumber}:`, apErr);
        errors++;
        await logDecision(supabase, {
          order,
          status: "failed",
          reason: "exception",
          rawStatus: order.orderStatus,
          message: String(apErr),
        });
      }
    }

    const result = {
      message: "Auto-pay complete",
      totalOrders: allOrders.length,
      liveOrders: liveOrders.length,
      cachedOrders: cachedOrders.length,
      candidates: candidates.length,
      attempted,
      autoPaid: autoPaidCount,
      autoAssigned,
      skipped,
      warnings,
      errors,
      autoPayMinutes,
      durationMs: Date.now() - startedAt,
    };
    console.log("Auto-pay result:", JSON.stringify(result));

    if (runId) {
      await supabase.from("p2p_auto_pay_engine_runs").update({
        finished_at: new Date().toISOString(),
        total_orders: allOrders.length,
        candidates: candidates.length,
        attempted,
        auto_paid: autoPaidCount,
        skipped,
        warnings,
        errors,
        auto_assigned: autoAssigned,
        status: errors > 0 ? "completed_with_errors" : warnings > 0 ? "completed_with_warnings" : "completed",
        summary: result,
      }).eq("id", runId);
    }

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Auto-pay engine error:", err);
    try {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://vagiqbespusdxsbqpvbo.supabase.co";
      const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      if (runId && SUPABASE_SERVICE_KEY) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        await supabase.from("p2p_auto_pay_engine_runs").update({
          finished_at: new Date().toISOString(),
          status: "failed",
          errors: 1,
          summary: { error: String(err), durationMs: Date.now() - startedAt },
        }).eq("id", runId);
      }
    } catch (_) {
      // best-effort failure audit only
    }
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
