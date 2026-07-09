import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveAccount, proxyHeadersFor, type ResolvedAccount } from "../_shared/binance-account.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OUR_HANDLES = new Set(["blynkex", "asec-corporation"]);

// A usable, unmasked nickname: non-empty, no '*', not a placeholder, not our own handle.
function cleanNickname(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v || v.includes("*") || v.toLowerCase() === "unknown") return null;
  if (OUR_HANDLES.has(v.toLowerCase())) return null;
  return v;
}

function isMaskedOrMissing(value: unknown): boolean {
  if (typeof value !== "string") return true;
  const v = value.trim();
  return !v || v.includes("*") || v.toLowerCase() === "unknown";
}

// Extract the counterparty's nickname / verified name / user number from a
// getUserOrderDetail payload. For SELL orders WE are the seller, so the
// counterparty is the buyer; for BUY orders the counterparty is the seller.
function extractCounterparty(detail: any, tradeType: string) {
  if (!detail || typeof detail !== "object") return { nick: null, verified: null, userNo: null };
  if (String(tradeType).toUpperCase() === "SELL") {
    return {
      nick: cleanNickname(detail.buyerNickname ?? detail.buyerNickName),
      verified: (detail.buyerRealName || detail.buyerName || null) as string | null,
      userNo: (detail.buyerNo || detail.buyerUserNo || detail.buyerUserId || null) as string | null,
    };
  }
  return {
    nick: cleanNickname(detail.sellerNickname ?? detail.sellerNickName),
    verified: (detail.sellerRealName || detail.sellerName || null) as string | null,
    userNo: (detail.sellerNo || detail.sellerUserNo || detail.sellerUserId || null) as string | null,
  };
}

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 2, delayMs = 500): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      lastError = err as Error;
      const msg = (err as Error).message || "";
      if (msg.includes("connection closed") || msg.includes("ConnectionReset") || msg.includes("SendRequest") || msg.includes("ECONNRESET")) {
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
          continue;
        }
      }
      throw err;
    }
  }
  throw lastError;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const BINANCE_PROXY_URL = Deno.env.get("BINANCE_PROXY_URL");
    const BINANCE_PROXY_TOKEN = Deno.env.get("BINANCE_PROXY_TOKEN");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!BINANCE_PROXY_URL || !BINANCE_PROXY_TOKEN) {
      return new Response(JSON.stringify({ error: "Missing proxy config" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Window: default last 90 minutes (well inside Binance's ~1h nickname window,
    // covering the 30-minute cron cadence plus slack). No small batch cap.
    let windowMinutes = 90;
    try {
      if (req.method === "POST") {
        const body = await req.clone().json().catch(() => ({}));
        if (Number.isFinite(body?.windowMinutes)) windowMinutes = Math.max(15, Math.min(7 * 24 * 60, Number(body.windowMinutes)));
      }
    } catch { /* ignore */ }

    const windowStart = Date.now() - windowMinutes * 60 * 1000;

    const { data: orders, error: fetchErr } = await supabase
      .from("binance_order_history")
      .select("order_number, trade_type, counter_part_nick_name, order_detail_raw, exchange_account_id")
      .eq("order_status", "COMPLETED")
      .gte("create_time", windowStart)
      .order("create_time", { ascending: false });

    if (fetchErr) {
      console.error("DB fetch error:", fetchErr);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only act on orders whose promoted nickname is masked/missing.
    const pending = (orders || []).filter((o: any) => isMaskedOrMissing(o.counter_part_nick_name));
    if (pending.length === 0) {
      return new Response(JSON.stringify({ captured: 0, scanned: (orders || []).length, message: "All recent orders already have a nickname" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const headersCache = new Map<string, Record<string, string> | null>();
    async function headersForAccount(accountId: string | null): Promise<Record<string, string> | null> {
      const key = accountId ?? "default";
      if (headersCache.has(key)) return headersCache.get(key)!;
      let headers: Record<string, string> | null = null;
      try {
        const acct: ResolvedAccount = await resolveAccount(accountId);
        headers = proxyHeadersFor(acct);
      } catch (e) {
        console.warn(`Could not resolve credentials for account ${key}:`, (e as Error).message);
      }
      headersCache.set(key, headers);
      return headers;
    }

    async function persist(orderNumber: string, tradeType: string, accountId: string | null, nick: string, verified: string | null, userNo: string | null) {
      await supabase.from("binance_order_history")
        .update({ counter_part_nick_name: nick, ...(verified ? { verified_name: verified } : {}) })
        .eq("order_number", orderNumber);
      await supabase.from("p2p_order_records")
        .update({ counterparty_nickname: nick })
        .eq("binance_order_number", orderNumber);
      await supabase.from("order_nickname_registry").upsert({
        order_number: orderNumber,
        exchange_account_id: accountId,
        cp_userno: userNo,
        nickname: nick,
        verified_name: verified,
        trade_type: tradeType,
        captured_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: "order_number" });
    }

    console.log(`Capturing nicknames for ${pending.length} orders (scanned ${(orders || []).length})...`);
    let captured = 0, promoted = 0, failed = 0;

    for (const order of pending) {
      try {
        // Fast path: unmasked nickname already sits in the stored detail — promote it, no API call.
        const stored = order.order_detail_raw && typeof order.order_detail_raw === "object" && !(order.order_detail_raw as any)._enrich_no_detail
          ? order.order_detail_raw : null;
        if (stored) {
          const fromStored = extractCounterparty(stored, order.trade_type);
          if (fromStored.nick) {
            await persist(order.order_number, order.trade_type, order.exchange_account_id ?? null, fromStored.nick, fromStored.verified, fromStored.userNo);
            promoted++;
            continue;
          }
        }

        // Live fetch within Binance's window.
        const proxyHeaders = await headersForAccount(order.exchange_account_id ?? null);
        if (!proxyHeaders) { failed++; continue; }

        const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/getUserOrderDetail`;
        const response = await fetchWithRetry(url, {
          method: "POST", headers: proxyHeaders, body: JSON.stringify({ adOrderNo: order.order_number }),
        });
        const text = await response.text();
        let result: any = null;
        try { result = JSON.parse(text); } catch { /* ignore */ }
        const detail = result?.data?.data || result?.data || result;

        const cp = extractCounterparty(detail, order.trade_type);
        if (cp.nick) {
          // Also persist the freshly fetched detail so future runs can self-heal offline.
          if (detail && typeof detail === "object") {
            await supabase.from("binance_order_history").update({ order_detail_raw: detail }).eq("order_number", order.order_number);
          }
          await persist(order.order_number, order.trade_type, order.exchange_account_id ?? null, cp.nick, cp.verified, cp.userNo);
          captured++;
        } else {
          failed++;
        }

        await new Promise((r) => setTimeout(r, 200));
      } catch (err) {
        console.warn(`Error capturing ${order.order_number}:`, (err as Error).message);
        failed++;
      }
    }

    console.log(`Capture complete: ${captured} fetched, ${promoted} promoted-from-detail, ${failed} failed of ${pending.length}`);
    return new Response(JSON.stringify({ captured, promoted, failed, pending: pending.length, scanned: (orders || []).length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("capture-order-nicknames error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
