import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveAccount, proxyHeadersFor, type ResolvedAccount } from "../_shared/binance-account.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OUR_HANDLES = new Set(["blynkex", "asec-corporation"]);

// Our own merchant (maker) account numbers. Binance's getUserOrderDetail does
// NOT expose buyer/seller userNos directly — it only carries `merchantNo` (the
// ad owner / maker) and `takerUserNo` (whoever took the order). On our own ads
// WE are the maker, so `merchantNo` is us and the counterparty is the taker.
// When we take someone else's ad, `merchantNo` is the counterparty instead.
const OUR_MERCHANT_NOS = new Set([
  "se7510c53abb33831869d5152e7bf1333", // BlynkEx
  "sac9f53661c6a3ebcbf7b691b6a66b2cd", // ASEC Corporation
]);

function cleanNickname(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v || v.includes("*") || v.toLowerCase() === "unknown") return null;
  if (OUR_HANDLES.has(v.toLowerCase())) return null;
  return v;
}

// Extract the counterparty's userNo / nickname / verified name from a
// getUserOrderDetail payload. For SELL orders WE are the seller, so the
// counterparty is the buyer; for BUY orders the counterparty is the seller.
function extractCounterparty(detail: any, tradeType: string) {
  if (!detail || typeof detail !== "object") return { nick: null, verified: null, userNo: null };
  const isSell = String(tradeType).toUpperCase() === "SELL";

  const nick = cleanNickname(
    isSell ? (detail.buyerNickname ?? detail.buyerNickName) : (detail.sellerNickname ?? detail.sellerNickName),
  );
  const verified = (isSell
    ? (detail.buyerRealName || detail.buyerName)
    : (detail.sellerRealName || detail.sellerName)) as string | null || null;

  // 1) Direct buyer/seller userNo fields — rarely present, but honour them first.
  let userNo = (isSell
    ? (detail.buyerNo || detail.buyerUserNo || detail.buyerUserId)
    : (detail.sellerNo || detail.sellerUserNo || detail.sellerUserId)) as string | null || null;

  // 2) Fallback: derive from maker(merchantNo)/taker(takerUserNo). Pick the side
  //    that is NOT one of our own merchant accounts.
  if (!userNo) {
    const merchantNo = detail.merchantNo ? String(detail.merchantNo) : null;
    const takerUserNo = detail.takerUserNo ? String(detail.takerUserNo) : null;
    if (merchantNo && OUR_MERCHANT_NOS.has(merchantNo)) {
      userNo = takerUserNo; // our ad → counterparty is the taker
    } else if (merchantNo) {
      userNo = merchantNo; // we took their ad → counterparty is the maker
    } else {
      userNo = takerUserNo;
    }
  }

  return { nick, verified, userNo: userNo ? String(userNo) : null };
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
    const { requireAuth } = await import("../_shared/require-auth.ts");
    const auth = await requireAuth(req, { corsHeaders });
    if (!auth.ok) return auth.response;

    const BINANCE_PROXY_URL = Deno.env.get("BINANCE_PROXY_URL");
    const BINANCE_PROXY_TOKEN = Deno.env.get("BINANCE_PROXY_TOKEN");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!BINANCE_PROXY_URL || !BINANCE_PROXY_TOKEN) {
      return new Response(JSON.stringify({ error: "Missing proxy config" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const orderNumber = String(body?.order_number || body?.orderNumber || "").trim();
    if (!orderNumber) {
      return new Response(JSON.stringify({ error: "order_number is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Resolve trade type + exchange account. Prefer explicit input, else look up history.
    let tradeType = body?.trade_type ? String(body.trade_type) : null;
    let accountId: string | null = body?.exchange_account_id ?? null;
    let storedDetail: any = null;

    // A detail payload is only usable when it is a real order detail — Binance
    // error envelopes (e.g. { code: 83998, msg: "The operation is illegal" }, which
    // is what a cross-account read returns) must never be treated as identity data.
    const isUsableDetail = (d: any): boolean => {
      if (!d || typeof d !== "object") return false;
      if (d._enrich_no_detail) return false;
      if (d.code !== undefined && String(d.code) !== "000000") return false;
      if (d.msg && !d.orderNumber && !d.orderNo) return false;
      const returned = d.orderNumber ?? d.orderNo;
      if (returned && String(returned) !== orderNumber) return false;
      return Boolean(d.orderNumber || d.orderNo || d.merchantNo || d.takerUserNo || d.sellerNickname || d.buyerNickname);
    };

    const { data: hist } = await supabase
      .from("binance_order_history")
      .select("trade_type, exchange_account_id, order_detail_raw")
      .eq("order_number", orderNumber)
      .maybeSingle();
    if (hist) {
      tradeType = tradeType || hist.trade_type;
      accountId = accountId ?? hist.exchange_account_id ?? null;
      if (isUsableDetail(hist.order_detail_raw)) storedDetail = hist.order_detail_raw;
    }
    if (!tradeType) tradeType = "BUY"; // safe default; counterparty=seller

    // Second stored source: the terminal sync rows keep the raw Binance detail
    // captured at sync time (order_data.*_payment_details._raw_detail).
    if (!storedDetail) {
      const syncTable = String(tradeType).toUpperCase() === "SELL" ? "terminal_sales_sync" : "terminal_purchase_sync";
      const { data: syncRows } = await supabase
        .from(syncTable)
        .select("order_data")
        .eq("binance_order_number", orderNumber);
      for (const row of syncRows || []) {
        const od: any = row.order_data || {};
        const candidates = [
          od?.seller_payment_details?._raw_detail,
          od?.buyer_payment_details?._raw_detail,
          od?.payment_details?._raw_detail,
          od?._raw_detail,
        ];
        const hit = candidates.find(isUsableDetail);
        if (hit) { storedDetail = hit; break; }
      }
    }

    // Fast path: userNo already sits in stored detail.
    let cp = storedDetail ? extractCounterparty(storedDetail, tradeType) : { nick: null, verified: null, userNo: null };

    // Live fetch if we don't yet have a userNo. Historical rows are sometimes
    // attributed to the wrong exchange account — a read with the wrong API key
    // returns 83998, so try every active account and repair the attribution.
    if (!cp.userNo) {
      const candidateIds: (string | null)[] = [accountId];
      try {
        const accounts = await listActiveAccounts();
        for (const a of accounts) if (a.id !== accountId) candidateIds.push(a.id);
      } catch (e) {
        console.warn("listActiveAccounts failed:", (e as Error).message);
      }

      const url = `${BINANCE_PROXY_URL}/api/sapi/v1/c2c/orderMatch/getUserOrderDetail`;
      for (const candidateId of candidateIds) {
        let acct: ResolvedAccount | null = null;
        try {
          acct = await resolveAccount(candidateId);
        } catch (e) {
          console.warn(`Could not resolve credentials for account ${candidateId}:`, (e as Error).message);
          continue;
        }
        let detail: any = null;
        try {
          const response = await fetchWithRetry(url, {
            method: "POST",
            headers: proxyHeadersFor(acct),
            body: JSON.stringify({ adOrderNo: orderNumber, orderNo: orderNumber }),
          });
          const text = await response.text();
          let result: any = null;
          try { result = JSON.parse(text); } catch { /* ignore */ }
          detail = result?.data?.data || result?.data || result;
        } catch (e) {
          console.warn(`getUserOrderDetail failed on ${acct.accountName}:`, (e as Error).message);
          continue;
        }
        if (!isUsableDetail(detail)) {
          console.warn(`Unusable order detail for ${orderNumber} on ${acct.accountName}:`, JSON.stringify(detail)?.slice(0, 300));
          continue;
        }
        cp = extractCounterparty(detail, tradeType);
        // Persist only verified detail, and repair the account attribution.
        await supabase
          .from("binance_order_history")
          .update({ order_detail_raw: detail, exchange_account_id: acct.id })
          .eq("order_number", orderNumber);
        if (acct.id && acct.id !== accountId) {
          const syncTable = String(tradeType).toUpperCase() === "SELL" ? "terminal_sales_sync" : "terminal_purchase_sync";
          await supabase.from(syncTable).update({ exchange_account_id: acct.id }).eq("binance_order_number", orderNumber);
        }
        accountId = acct.id ?? accountId;
        if (cp.userNo) break;
      }
    }


    if (!cp.userNo) {
      // Binance did not return a usable userNo (restricted / expired / rate-limited).
      // Never fabricate — surface the limitation to the caller.
      return new Response(JSON.stringify({ cp_userno: null, verified_name: cp.verified ?? null, nickname: cp.nick ?? null, reason: "userNo unavailable from Binance" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userNo = String(cp.userNo).trim();

    // Persist the freshly resolved identity into cp_order_identity + registry.
    await supabase.from("cp_order_identity").upsert({
      order_number: orderNumber,
      cp_userno: userNo,
      nickname: cp.nick,
      verified_name: cp.verified,
    }, { onConflict: "order_number" });

    await supabase.from("order_nickname_registry").upsert({
      order_number: orderNumber,
      exchange_account_id: accountId,
      cp_userno: userNo,
      nickname: cp.nick,
      verified_name: cp.verified,
      trade_type: tradeType,
      captured_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: "order_number" });

    // Resolve the client that owns this userNo (if any).
    let clientId: string | null = null;
    let clientName: string | null = null;
    const { data: resolved } = await supabase.rpc("resolve_client_by_userno", { p_cp_userno: userNo });
    const row = Array.isArray(resolved) ? resolved[0] : resolved;
    if (row?.client_id) { clientId = row.client_id; clientName = row.client_name; }

    return new Response(JSON.stringify({
      cp_userno: userNo,
      verified_name: cp.verified ?? null,
      nickname: cp.nick ?? null,
      client_id: clientId,
      client_name: clientName,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("resolve-order-userno error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
