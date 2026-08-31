// Empirical discovery of Binance's maximum publishable ad quantity (initAmount)
// for one asset + market zone + side combination.
//
// Binance publishes no endpoint that returns per-asset / per-zone ad quantity
// caps, so the ceiling is discovered by binary search: each step submits a real
// ad update on a CURRENTLY OFFLINE carrier ad (never a live, publicly visible
// ad) with only `initAmount` changed, and reads Binance's accept/reject.
// The carrier ad's original quantity is always restored before returning.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveAccount, proxyHeadersFor } from "../_shared/binance-account.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OK = "000000";
const THROTTLE_MS = 500;
const MAX_STEPS = 16;

/** Binance error text that means "the quantity you asked for is too large". */
function isQuantityCapError(code: string, message: string): boolean {
  const m = `${code} ${message}`.toLowerCase();
  if (!m.trim()) return false;
  return (
    m.includes("exceed") ||
    m.includes("too large") ||
    m.includes("maximum") ||
    m.includes("max amount") ||
    m.includes("upper limit") ||
    m.includes("out of range") ||
    m.includes("cannot be greater")
  );
}

/** Errors that must abort the probe rather than narrow the ceiling. */
function isAbortError(code: string, message: string): boolean {
  const m = `${code} ${message}`.toLowerCase();
  return (
    m.includes("insufficient") ||
    m.includes("balance") ||
    m.includes("too many request") ||
    m.includes("rate limit") ||
    m.includes("frequen") ||
    m.includes("signature") ||
    m.includes("api-key") ||
    m.includes("unauthor") ||
    m.includes("forbidden")
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("Authentication required");
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData?.user?.id) throw new Error("Authentication required");
    const userId = authData.user.id;

    const { data: allowed } = await supabase.rpc("has_terminal_permission", {
      _user_id: userId,
      _permission: "terminal_ads_manage",
    });
    if (!allowed) throw new Error("Permission denied: terminal_ads_manage required");

    const body = await req.json().catch(() => ({}));
    const asset = String(body.asset || "").toUpperCase();
    const zone = String(body.zone || "").toLowerCase();
    const tradeType = String(body.tradeType || "").toUpperCase();
    const advNo = String(body.carrierAdvNo || "");
    const exchangeAccountId: string | null = body.exchange_account_id || null;
    const upperBound = Number(body.upperBound);
    const runId = body.runId || crypto.randomUUID();

    if (!asset) throw new Error("asset is required");
    if (zone !== "p2p" && zone !== "block") throw new Error("zone must be 'p2p' or 'block'");
    if (tradeType !== "BUY" && tradeType !== "SELL") throw new Error("tradeType must be BUY or SELL");
    if (!advNo) throw new Error("carrierAdvNo is required");
    if (!Number.isFinite(upperBound) || upperBound <= 0) throw new Error("upperBound must be a positive number");

    const account = await resolveAccount(exchangeAccountId);
    const headers = proxyHeadersFor(account);
    const base = account.proxyUrl;

    // 1. Load the carrier ad and make sure it is offline before touching it.
    const detailResp = await fetch(`${base}/api/sapi/v1/c2c/ads/getDetailByNo?adsNo=${encodeURIComponent(advNo)}`, { headers });
    const detailJson = await detailResp.json().catch(() => null);
    const ad = detailJson?.data?.adDetailResp || detailJson?.data || null;
    if (!ad || !ad.advNo) throw new Error(`Could not load carrier ad ${advNo} from Binance`);
    if (Number(ad.advStatus) === 1) {
      throw new Error("Carrier ad is currently online — probing is only allowed on an offline ad");
    }
    if (String(ad.asset || "").toUpperCase() !== asset || String(ad.tradeType || "").toUpperCase() !== tradeType) {
      throw new Error("Carrier ad does not match the requested asset/side");
    }

    const originalInit = Number(ad.initAmount);
    const tradeMethods = (ad.tradeMethods || []).map((m: any) => ({
      payType: m.payType,
      identifier: m.identifier,
      ...(m.payId ? { payId: m.payId } : {}),
    }));

    const attempt = async (qty: number) => {
      const payload: Record<string, unknown> = {
        advNo: ad.advNo,
        asset: ad.asset,
        fiatUnit: ad.fiatUnit,
        tradeType: ad.tradeType,
        priceType: ad.priceType,
        initAmount: qty,
        minSingleTransAmount: Number(ad.minSingleTransAmount),
        maxSingleTransAmount: Number(ad.maxSingleTransAmount),
        tradeMethods,
        payTimeLimit: ad.payTimeLimit || 15,
        ...(Number(ad.priceType) === 1
          ? { price: ad.price }
          : { priceFloatingRatio: ad.priceFloatingRatio }),
      };
      const resp = await fetch(`${base}/api/sapi/v1/c2c/ads/update`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const text = await resp.text();
      let parsed: any;
      try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
      const code = String(parsed?.code ?? resp.status ?? "");
      const message = String(parsed?.message ?? parsed?.msg ?? parsed?.raw ?? "");
      const accepted = code === OK || parsed?.success === true;
      await supabase.from("binance_ad_capacity_probe_log").insert({
        exchange_account_id: account.id,
        asset, zone, trade_type: tradeType,
        carrier_adv_no: ad.advNo,
        attempted_qty: qty,
        accepted,
        response_code: code || null,
        response_message: message ? message.slice(0, 500) : null,
        run_id: runId,
        created_by: userId,
      });
      return { accepted, code, message };
    };

    // 2. Binary search between the ad's current quantity and the upper bound.
    let low = Number.isFinite(originalInit) && originalInit > 0 ? originalInit : 0;
    let high = upperBound;
    let maxAccepted: number | null = null;
    let minRejected: number | null = null;
    let lastError = { code: "", message: "" };
    let abortReason: string | null = null;
    const attempts: Array<{ qty: number; accepted: boolean; code: string; message: string }> = [];

    // First probe the upper bound itself — if Binance accepts it, there is no
    // ceiling below it and we report the bound as the highest verified value.
    for (let step = 0; step < MAX_STEPS; step++) {
      const qty = step === 0 ? high : Math.floor((low + high) / 2);
      if (step > 0 && (qty <= low || qty >= high)) break;

      const r = await attempt(qty);
      attempts.push({ qty, ...r });

      if (r.accepted) {
        maxAccepted = Math.max(maxAccepted ?? 0, qty);
        low = qty;
        if (step === 0) break; // upper bound itself accepted
        if (minRejected !== null && minRejected - low <= 1) break;
      } else {
        lastError = { code: r.code, message: r.message };
        if (isAbortError(r.code, r.message)) {
          abortReason = r.message || `Binance error ${r.code}`;
          break;
        }
        if (!isQuantityCapError(r.code, r.message)) {
          abortReason = `Unclassified Binance rejection: ${r.message || r.code}`;
          break;
        }
        minRejected = minRejected === null ? qty : Math.min(minRejected, qty);
        high = qty;
        if (maxAccepted !== null && high - maxAccepted <= 1) break;
      }
      await sleep(THROTTLE_MS);
    }

    // 3. Always restore the carrier ad's original quantity.
    let restored = true;
    let restoreError: string | null = null;
    if (Number.isFinite(originalInit)) {
      await sleep(THROTTLE_MS);
      const r = await attempt(originalInit);
      restored = r.accepted;
      if (!r.accepted) restoreError = r.message || `Binance error ${r.code}`;
    }

    // 4. Persist the discovered ceiling.
    let saved = false;
    if (maxAccepted !== null && !abortReason) {
      const { error } = await supabase
        .from("binance_ad_capacity_limits")
        .upsert({
          exchange_account_id: account.id,
          asset, zone, trade_type: tradeType,
          max_accepted_qty: maxAccepted,
          min_rejected_qty: minRejected,
          source: "probe",
          binance_error_code: lastError.code || null,
          binance_error_message: lastError.message ? lastError.message.slice(0, 500) : null,
          needs_recalibration: false,
          last_probed_at: new Date().toISOString(),
          updated_by: userId,
        }, { onConflict: "exchange_account_id,asset,zone,trade_type" });
      if (error) throw error;
      saved = true;
    }

    return new Response(JSON.stringify({
      success: !abortReason,
      runId,
      asset, zone, tradeType,
      exchange_account_id: account.id,
      carrierAdvNo: ad.advNo,
      maxAccepted,
      minRejected,
      saved,
      abortReason,
      restored,
      restoreError,
      attempts,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("binance-ad-capacity-probe error:", e?.message || e);
    return new Response(JSON.stringify({ success: false, error: e?.message || "Probe failed" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
