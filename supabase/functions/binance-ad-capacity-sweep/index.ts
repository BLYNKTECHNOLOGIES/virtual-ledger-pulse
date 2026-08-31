// Automatic, account-wide discovery of Binance's maximum publishable ad
// quantity (initAmount) for every asset + market zone + side we actually run.
//
// Binance publishes NO endpoint that returns per-asset / per-zone ad quantity
// caps, so the ceiling can only be established empirically: for each
// combination we take one of our own ads as the carrier, escalate initAmount
// (doubling) until Binance rejects, then binary-search the bracket. The
// carrier's original quantity is always restored afterwards. Nothing is
// guessed, extrapolated across assets, or defaulted.
//
// Auth: a terminal user with `terminal_ads_manage`, or an internal caller
// presenting the `internal_cron` scheduler secret.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveAccount, proxyHeadersFor } from "../_shared/binance-account.ts";
import { classifyZone } from "../_shared/adZone.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-scheduler-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OK = "000000";
const THROTTLE_MS = 600;
const MAX_ESCALATIONS = 12;
const MAX_BISECTIONS = 14;
// Edge functions have a hard wall-clock limit; stop cleanly before it and let
// the caller resume with another invocation.
const DEADLINE_MS = 100_000;

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
    m.includes("cannot be greater") ||
    m.includes("limit")
  );
}

function isBalanceError(code: string, message: string): boolean {
  const m = `${code} ${message}`.toLowerCase();
  return m.includes("insufficient") || m.includes("balance") || m.includes("not enough");
}

function isHardAbortError(code: string, message: string): boolean {
  const m = `${code} ${message}`.toLowerCase();
  return (
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

/** Whole-number assets on Binance P2P (LOT_SIZE stepSize = 1). */
const WHOLE_NUMBER_ASSETS = new Set(["USDC", "FDUSD"]);
function normalizeQty(asset: string, qty: number): number {
  if (WHOLE_NUMBER_ASSETS.has(asset)) return Math.floor(qty);
  return Math.floor(qty * 100) / 100;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    // ---- authorization -----------------------------------------------------
    let userId: string | null = null;
    const schedulerSecret = req.headers.get("x-scheduler-secret") || "";
    let authorized = false;
    if (schedulerSecret) {
      const { data: row } = await supabase
        .from("app_scheduler_secrets")
        .select("secret_value")
        .eq("name", "internal_cron")
        .maybeSingle();
      authorized = !!row?.secret_value && row.secret_value === schedulerSecret;
      if (!authorized) throw new Error("Invalid scheduler secret");
    } else {
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (!token) throw new Error("Authentication required");
      const { data: authData, error: authErr } = await supabase.auth.getUser(token);
      if (authErr || !authData?.user?.id) throw new Error("Authentication required");
      userId = authData.user.id;
      const { data: allowed } = await supabase.rpc("has_terminal_permission", {
        _user_id: userId,
        _permission: "terminal_ads_manage",
      });
      if (!allowed) throw new Error("Permission denied: terminal_ads_manage required");
      authorized = true;
    }
    if (!authorized) throw new Error("Unauthorized");

    const body = await req.json().catch(() => ({}));
    const exchangeAccountId: string | null = body.exchange_account_id ?? null;
    const onlyAsset = body.asset ? String(body.asset).toUpperCase() : null;
    const onlyZone = body.zone ? String(body.zone).toLowerCase() : null;
    const onlySide = body.tradeType ? String(body.tradeType).toUpperCase() : null;
    const force = body.force === true; // re-probe combinations already calibrated
    const runId = body.runId || crypto.randomUUID();

    const account = await resolveAccount(exchangeAccountId);
    const headers = proxyHeadersFor(account);
    const base = account.proxyUrl;

    // ---- 1. list every ad on the account ----------------------------------
    const listPage = async (page: number) => {
      const resp = await fetch(`${base}/api/sapi/v1/c2c/ads/listWithPagination`, {
        method: "POST",
        headers,
        body: JSON.stringify({ page, rows: 20 }),
      });
      const text = await resp.text();
      try { return JSON.parse(text); } catch { return { raw: text }; }
    };
    const first = await listPage(1);
    const ads: any[] = Array.isArray(first?.data) ? [...first.data] : [];
    const total = Number(first?.total ?? ads.length);
    let page = 2;
    while (ads.length < total && page <= 50) {
      const r = await listPage(page);
      const list: any[] = Array.isArray(r?.data) ? r.data : [];
      if (list.length === 0) break;
      ads.push(...list);
      page++;
    }
    if (ads.length === 0) throw new Error("Binance returned no ads for this account — nothing to calibrate");

    // ---- 2. group into asset|zone|side combinations ------------------------
    interface Combo { asset: string; zone: string; tradeType: string; carrier: any; offline: boolean }
    const combos = new Map<string, Combo>();
    for (const ad of ads) {
      const asset = String(ad.asset || "").toUpperCase();
      const zone = classifyZone(ad.classify);
      const tradeType = String(ad.tradeType || "").toUpperCase();
      if (!asset || !tradeType) continue;
      if (onlyAsset && asset !== onlyAsset) continue;
      if (onlyZone && zone !== onlyZone) continue;
      if (onlySide && tradeType !== onlySide) continue;
      const key = `${asset}|${zone}|${tradeType}`;
      const offline = Number(ad.advStatus) !== 1;
      const existing = combos.get(key);
      // Prefer an offline carrier when one exists for this combination.
      if (!existing || (offline && !existing.offline)) {
        combos.set(key, { asset, zone, tradeType, carrier: ad, offline });
      }
    }

    // Skip combinations already calibrated unless force is set.
    const { data: existingRows } = await supabase
      .from("binance_ad_capacity_limits")
      .select("asset, zone, trade_type, max_accepted_qty, needs_recalibration")
      .eq("exchange_account_id", account.id);
    const calibrated = new Set(
      (existingRows || [])
        .filter((r: any) => r.max_accepted_qty !== null && !r.needs_recalibration)
        .map((r: any) => `${String(r.asset).toUpperCase()}|${r.zone}|${r.trade_type}`),
    );

    const results: any[] = [];
    const startedAt = Date.now();
    let deferred = 0;

    for (const [key, combo] of combos) {
      if (Date.now() - startedAt > DEADLINE_MS) {
        deferred++;
        results.push({ key, skipped: "deferred to next run (time budget)" });
        continue;
      }
      if (!force && calibrated.has(key)) {
        results.push({ key, skipped: "already calibrated" });
        continue;
      }

      // Load full detail so we replay the ad's exact configuration.
      const detailResp = await fetch(
        `${base}/api/sapi/v1/c2c/ads/getDetailByNo?adsNo=${encodeURIComponent(combo.carrier.advNo)}`,
        { method: "POST", headers },
      );
      const detailJson = await detailResp.json().catch(() => null);
      const ad = detailJson?.data?.data || detailJson?.data || null;
      if (!ad?.advNo) {
        results.push({ key, error: "could not load carrier ad detail" });
        continue;
      }

      const originalInit = Number(ad.initAmount) || 0;
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
          method: "POST", headers, body: JSON.stringify(payload),
        });
        const text = await resp.text();
        let parsed: any;
        try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
        const code = String(parsed?.code ?? resp.status ?? "");
        const message = String(parsed?.message ?? parsed?.msg ?? parsed?.raw ?? "");
        const accepted = code === OK || parsed?.success === true;
        await supabase.from("binance_ad_capacity_probe_log").insert({
          exchange_account_id: account.id,
          asset: combo.asset, zone: combo.zone, trade_type: combo.tradeType,
          carrier_adv_no: ad.advNo,
          attempted_qty: qty,
          accepted,
          response_code: code || null,
          response_message: message ? message.slice(0, 500) : null,
          run_id: runId,
          created_by: userId,
        });
        await sleep(THROTTLE_MS);
        return { accepted, code, message };
      };

      let maxAccepted: number | null = null;
      let minRejected: number | null = null;
      let abortReason: string | null = null;
      let lastError = { code: "", message: "" };
      const attempts: any[] = [];

      // 2a. Escalate: double from the current quantity until Binance rejects.
      let probe = normalizeQty(combo.asset, originalInit > 0 ? originalInit : 1);
      for (let i = 0; i < MAX_ESCALATIONS; i++) {
        const r = await attempt(probe);
        attempts.push({ qty: probe, ...r });
        if (r.accepted) {
          maxAccepted = probe;
          probe = normalizeQty(combo.asset, probe * 2);
          continue;
        }
        lastError = { code: r.code, message: r.message };
        if (isHardAbortError(r.code, r.message)) { abortReason = r.message || `Binance error ${r.code}`; break; }
        if (isBalanceError(r.code, r.message)) { abortReason = `Bounded by wallet balance, not by an ad cap: ${r.message}`; break; }
        if (!isQuantityCapError(r.code, r.message)) { abortReason = `Unclassified Binance rejection: ${r.message || r.code}`; break; }
        minRejected = probe;
        break;
      }

      // 2b. Bisect the accepted/rejected bracket.
      if (!abortReason && maxAccepted !== null && minRejected !== null) {
        for (let i = 0; i < MAX_BISECTIONS; i++) {
          const mid = normalizeQty(combo.asset, (maxAccepted + minRejected) / 2);
          if (mid <= maxAccepted || mid >= minRejected) break;
          const r = await attempt(mid);
          attempts.push({ qty: mid, ...r });
          if (r.accepted) { maxAccepted = mid; continue; }
          lastError = { code: r.code, message: r.message };
          if (isHardAbortError(r.code, r.message) || isBalanceError(r.code, r.message)) {
            abortReason = r.message || `Binance error ${r.code}`;
            break;
          }
          minRejected = mid;
        }
      }

      // 2c. Restore the carrier's original quantity, always.
      let restored = true;
      let restoreError: string | null = null;
      if (originalInit > 0) {
        const r = await attempt(originalInit);
        restored = r.accepted;
        if (!r.accepted) restoreError = r.message || `Binance error ${r.code}`;
      }

      let saved = false;
      if (maxAccepted !== null) {
        const { error } = await supabase.from("binance_ad_capacity_limits").upsert({
          exchange_account_id: account.id,
          asset: combo.asset, zone: combo.zone, trade_type: combo.tradeType,
          max_accepted_qty: maxAccepted,
          min_rejected_qty: minRejected,
          source: "probe",
          binance_error_code: lastError.code || null,
          binance_error_message: lastError.message ? lastError.message.slice(0, 500) : null,
          needs_recalibration: minRejected === null, // no ceiling hit yet → refine later
          last_probed_at: new Date().toISOString(),
          updated_by: userId,
        }, { onConflict: "exchange_account_id,asset,zone,trade_type" });
        if (!error) saved = true;
      }

      results.push({
        key,
        asset: combo.asset, zone: combo.zone, tradeType: combo.tradeType,
        carrierAdvNo: ad.advNo,
        carrierWasOffline: combo.offline,
        maxAccepted, minRejected, saved, abortReason, restored, restoreError,
        attempts,
      });
    }

    return new Response(JSON.stringify({
      success: true,
      runId,
      exchange_account_id: account.id,
      combinations: results.length,
      deferred,
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[capacity-sweep] failed:", e?.message || String(e), e?.stack || "");
    return new Response(JSON.stringify({ success: false, error: e?.message || String(e) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
