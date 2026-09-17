// Ad uptime collector — captures the live state of every Binance ad once a minute
// per exchange account and records whether it was ACTIVE (online + public),
// PRIVATE (online but link-only) or OFFLINE.
//
// Truth comes ONLY from Binance ad data pulled server-side. No operator input is
// ever accepted, and minutes with no heartbeat row stay "unmeasured" instead of
// being credited as active. No optimisation judgement is applied (no surplus,
// limit or price checks) — an ad that is online and public is active.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { listActiveAccounts, resolveAccount, proxyHeadersFor } from "../_shared/binance-account.ts";
import { classifyZone } from "../_shared/adZone.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Binance identifier of Lightning UPI (as used in the Ad Manager). */
const LIGHTNING_UPI = "UPIQRCODE";

type Band = { min: number; max: number } | null;

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : null;
}

function payMethodIds(ad: any): string[] {
  const methods = Array.isArray(ad?.tradeMethods)
    ? ad.tradeMethods
    : Array.isArray(ad?.payMethods)
      ? ad.payMethods
      : Array.isArray(ad?.adDetailResp?.tradeMethods)
        ? ad.adDetailResp.tradeMethods
        : [];
  return methods
    .map((m: any) => String(m?.identifier || m?.payType || m?.tradeMethodName || "").trim())
    .filter(Boolean);
}

function inBand(band: Band, min: number | null, max: number | null): boolean {
  if (!band) return false;
  if (min === null && max === null) return false;
  const lo = min ?? max!;
  const hi = max ?? min!;
  // A small-sale ad is one whose whole trade window sits inside the configured band.
  return lo >= band.min && hi <= band.max;
}

/** Small-sales / small-buys band exactly as configured in Terminal automation. */
async function fetchBand(supabase: any, table: string): Promise<Band> {
  const { data } = await supabase.from(table).select("min_amount, max_amount").limit(1).maybeSingle();
  if (!data) return null;
  const min = num(data.min_amount);
  const max = num(data.max_amount);
  if (min === null || max === null) return null;
  return { min, max };
}

async function fetchAllAds(acct: Awaited<ReturnType<typeof resolveAccount>>): Promise<any[]> {
  const headers = proxyHeadersFor(acct);
  const url = `${acct.proxyUrl}/api/sapi/v1/c2c/ads/listWithPagination`;
  const all: any[] = [];
  let expectedTotal = 0;
  for (let page = 1; page <= 20; page++) {
    const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify({ page, rows: 20 }) });
    const text = await resp.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`listAds page ${page} returned non-JSON (status ${resp.status})`);
    }
    const list: any[] = Array.isArray(json?.data) ? json.data : [];
    if (page === 1) expectedTotal = Number(json?.total ?? list.length) || list.length;
    all.push(...list);
    if (list.length === 0) break;
    if (expectedTotal && all.length >= expectedTotal) break;
    if (list.length < 20) break;
  }
  return all;
}

/**
 * listWithPagination does not carry advVisibleRet, so online ads are enriched
 * with the ad-detail call (same rule the Ad Manager uses: userSetVisible === 1
 * means the ad is Private). A failed lookup marks privacy as unknown, and that
 * minute is skipped for the ad rather than credited as active.
 */
async function enrichPrivacy(acct: Awaited<ReturnType<typeof resolveAccount>>, ads: any[]): Promise<void> {
  const headers = proxyHeadersFor(acct);
  const online = ads.filter((ad) => num(ad?.advStatus) === 1);
  const one = (ad: any) =>
    fetch(`${acct.proxyUrl}/api/sapi/v1/c2c/ads/getDetailByNo?adsNo=${ad.advNo || ad.adsNo}`, {
      method: "POST",
      headers,
    })
      .then((r) => r.json())
      .then((detail) => {
        const d = detail?.data?.data || detail?.data || detail;
        const vis = d?.advVisibleRet;
        if (vis && typeof vis.userSetVisible !== "undefined") {
          ad._isPrivate = Number(vis.userSetVisible) === 1;
        } else {
          ad._privacyUnknown = true;
        }
        if (!Array.isArray(ad.tradeMethods) && Array.isArray(d?.tradeMethods)) ad.tradeMethods = d.tradeMethods;
        if (!ad.classify && d?.classify) ad.classify = d.classify;
      })
      .catch((err) => {
        ad._privacyUnknown = true;
        console.warn(`[ad-uptime] detail lookup failed for ${ad.advNo}:`, (err as Error).message);
      });

  const BATCH = 8;
  for (let i = 0; i < online.length; i += BATCH) {
    await Promise.all(online.slice(i, i + BATCH).map(one));
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const minute = new Date();
  minute.setUTCSeconds(0, 0);
  const minuteIso = minute.toISOString();

  const results: Record<string, unknown>[] = [];

  try {
    const [accounts, sellBand, buyBand] = await Promise.all([
      listActiveAccounts(),
      fetchBand(supabase, "small_sales_config"),
      fetchBand(supabase, "small_buys_config"),
    ]);

    // Only accounts explicitly flagged for ad-uptime tracking are measured.
    const { data: trackedRows } = await supabase
      .from("terminal_exchange_accounts")
      .select("id")
      .eq("is_active", true)
      .eq("ad_uptime_tracked", true);
    const tracked = new Set((trackedRows ?? []).map((r: { id: string }) => r.id));

    for (const accountRow of accounts.filter((a) => tracked.has(a.id))) {

      const startedAt = Date.now();
      try {
        const acct = await resolveAccount(accountRow.id);
        const ads = await fetchAllAds(acct);
        await enrichPrivacy(acct, ads);

        const rows: Record<string, unknown>[] = [];
        let skippedUnknown = 0;

        for (const ad of ads) {
          const advNo = ad?.advNo || ad?.adsNo;
          if (!advNo) continue;

          const advStatus = num(ad?.advStatus);
          const online = advStatus === 1;
          const isPrivate = online && ad._isPrivate === true;

          // Privacy could not be read for an online ad -> do not guess, leave the minute unmeasured.
          if (online && ad._privacyUnknown === true) {
            skippedUnknown++;
            continue;
          }

          const side = String(ad?.tradeType || "").toUpperCase() === "BUY" ? "BUY" : "SELL";
          const asset = ad?.asset ? String(ad.asset) : null;
          const minAmt = num(ad?.minSingleTransAmount);
          const maxAmt = num(ad?.maxSingleTransAmount);
          const methods = payMethodIds(ad);
          const hasLightning = methods.some((m) => m.toUpperCase() === LIGHTNING_UPI);

          const band = side === "SELL" ? sellBand : buyBand;
          const isSmall = inBand(band, minAmt, maxAmt);

          const adClass = side === "BUY"
            ? "big_buy"
            : isSmall
              ? (hasLightning ? "lightning_small_sale" : "small_sale")
              : "big_sell";

          const grade = !online ? "offline" : isPrivate ? "private" : "active";

          rows.push({
            minute: minuteIso,
            adv_no: String(advNo),
            exchange_account_id: acct.id,
            side,
            ad_class: adClass,
            asset,
            zone: classifyZone(ad?.classify),
            is_online: online,
            is_private: isPrivate,
            adv_status: advStatus,
            surplus_amount: num(ad?.surplusAmount),
            min_single_trans_amount: minAmt,
            max_single_trans_amount: maxAmt,
            pay_method_count: methods.length,
            pay_methods: methods,
            price: num(ad?.price),
            grade,
            hollow_reasons: [],
            ist_date: minuteIso.slice(0, 10), // overwritten by trigger to IST date
          });
        }

        if (rows.length) {
          const { error } = await supabase
            .from("terminal_ad_uptime_minutes")
            .upsert(rows, { onConflict: "adv_no,exchange_account_id,minute" });
          if (error) throw error;
        }

        await supabase.from("terminal_ad_uptime_runs").upsert({
          minute: minuteIso,
          exchange_account_id: acct.id,
          ads_seen: rows.length,
          status: rows.length ? "ok" : "empty",
          error_text: skippedUnknown ? `privacy unknown for ${skippedUnknown} ad(s)` : null,
          duration_ms: Date.now() - startedAt,
        }, { onConflict: "minute,exchange_account_id" });

        results.push({ account: acct.accountName, ads: rows.length, skipped_unknown_privacy: skippedUnknown });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`[ad-uptime] account ${accountRow.account_name} failed:`, message);
        await supabase.from("terminal_ad_uptime_runs").upsert({
          minute: minuteIso,
          exchange_account_id: accountRow.id,
          ads_seen: 0,
          status: "error",
          error_text: message.slice(0, 500),
          duration_ms: Date.now() - startedAt,
        }, { onConflict: "minute,exchange_account_id" });
        results.push({ account: accountRow.account_name, error: message });
      }
    }

    // Keep today's shift summary fresh so the dashboard is usable intraday, but
    // only every 5th minute — the rollup scans the whole day's minute rows.
    const istToday = new Date(minute.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
    if (minute.getUTCMinutes() % 5 === 0) {
      await supabase.rpc("rollup_terminal_ad_uptime", { p_date: istToday });
      // Keep the stored monthly totals current-day-fresh every half hour (reads
      // only the small shift-summary rows, never the raw minutes).
      if (minute.getUTCMinutes() % 30 === 0) {
        await supabase.rpc("rollup_terminal_ad_uptime_monthly", { p_month: `${istToday.slice(0, 7)}-01` });
      }

    }

    return new Response(JSON.stringify({ success: true, minute: minuteIso, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[ad-uptime] collector failed:", message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
