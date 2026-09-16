// Ad uptime collector — captures the live state of every Binance ad once a minute
// per exchange account and grades each ad minute as effective / hollow / offline.
//
// Truth comes ONLY from Binance ad data pulled server-side. No operator input is
// ever accepted, and minutes with no heartbeat row stay "unmeasured" instead of
// being credited as active.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { listActiveAccounts, resolveAccount, proxyHeadersFor } from "../_shared/binance-account.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Max distance from the best market price before an online ad is "hollow". */
const PRICE_GAP_LIMIT_PCT = 1.5;

type Band = { min: number; max: number } | null;

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : null;
}

function payMethodCount(ad: any): number {
  const methods = Array.isArray(ad?.tradeMethods)
    ? ad.tradeMethods
    : Array.isArray(ad?.payMethods)
      ? ad.payMethods
      : Array.isArray(ad?.adDetailResp?.tradeMethods)
        ? ad.adDetailResp.tradeMethods
        : [];
  return methods.length;
}

function inBand(band: Band, min: number | null, max: number | null): boolean {
  if (!band) return false;
  if (min === null && max === null) return false;
  const lo = min ?? max!;
  const hi = max ?? min!;
  // A small-sale ad is one whose whole trade window sits inside the configured band.
  return lo >= band.min && hi <= band.max;
}

async function fetchBand(supabase: any, table: string): Promise<Band> {
  const { data } = await supabase.from(table).select("min_amount, max_amount, is_enabled").limit(1).maybeSingle();
  if (!data || data.is_enabled === false) return null;
  const min = num(data.min_amount);
  const max = num(data.max_amount);
  if (min === null || max === null) return null;
  return { min, max };
}

const marketCache = new Map<string, { price: number | null; at: number }>();

/** Best price competitors are showing for the same asset/side (page 1 only — cheap). */
async function bestMarketPrice(asset: string, fiat: string, tradeType: string): Promise<number | null> {
  const key = `${asset}:${fiat}:${tradeType}`;
  const cached = marketCache.get(key);
  if (cached && Date.now() - cached.at < 55_000) return cached.price;
  let price: number | null = null;
  try {
    const resp = await fetch("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset, fiat, tradeType, page: 1, rows: 20, publisherType: "merchant", payTypes: [], classifies: ["mass", "profession"] }),
    });
    const json = await resp.json();
    const prices = (json?.data || [])
      .map((item: any) => num(item?.adv?.price))
      .filter((p: number | null): p is number => p !== null && p > 0);
    if (prices.length) {
      // Our SELL ad competes on the lowest ask; our BUY ad on the highest bid.
      price = tradeType === "SELL" ? Math.min(...prices) : Math.max(...prices);
    }
  } catch (e) {
    console.error(`[ad-uptime] market price lookup failed for ${key}:`, e);
  }
  marketCache.set(key, { price, at: Date.now() });
  return price;
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

function gradeAd(ad: any, marketRef: number | null) {
  const advStatus = num(ad?.advStatus);
  const online = advStatus === 1;
  const surplus = num(ad?.surplusAmount);
  const minAmt = num(ad?.minSingleTransAmount);
  const maxAmt = num(ad?.maxSingleTransAmount);
  const price = num(ad?.price);
  const methods = payMethodCount(ad);
  const side = String(ad?.tradeType || "").toUpperCase();

  if (!online) {
    return { grade: "offline", reasons: [] as string[], price, surplus, minAmt, maxAmt, methods, gapPct: null as number | null };
  }

  const reasons: string[] = [];

  // Tradable surplus: at least one minimum-size trade must still be fillable.
  const surplusFiat = surplus !== null && price !== null ? surplus * price : null;
  if (surplus === null || surplus <= 0) reasons.push("no_surplus");
  else if (surplusFiat !== null && minAmt !== null && surplusFiat < minAmt) reasons.push("surplus_below_min_limit");

  if (minAmt === null || minAmt <= 0 || maxAmt === null || maxAmt < minAmt) reasons.push("invalid_limits");
  if (methods === 0) reasons.push("no_payment_method");

  let gapPct: number | null = null;
  if (price !== null && marketRef !== null && marketRef > 0) {
    gapPct = side === "SELL"
      ? ((price - marketRef) / marketRef) * 100
      : ((marketRef - price) / marketRef) * 100;
    gapPct = Math.round(gapPct * 1000) / 1000;
    if (gapPct > PRICE_GAP_LIMIT_PCT) reasons.push("price_off_market");
  }

  return {
    grade: reasons.length ? "hollow" : "effective",
    reasons,
    price,
    surplus,
    minAmt,
    maxAmt,
    methods,
    gapPct,
  };
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

    for (const accountRow of accounts) {
      const startedAt = Date.now();
      try {
        const acct = await resolveAccount(accountRow.id);
        const ads = await fetchAllAds(acct);

        const rows: Record<string, unknown>[] = [];
        for (const ad of ads) {
          const advNo = ad?.advNo || ad?.adsNo;
          if (!advNo) continue;
          const side = String(ad?.tradeType || "").toUpperCase() === "BUY" ? "BUY" : "SELL";
          const asset = ad?.asset ? String(ad.asset) : null;
          const fiat = String(ad?.fiatUnit || ad?.fiatSymbol || "INR");
          const marketRef = asset ? await bestMarketPrice(asset, fiat, side) : null;
          const graded = gradeAd(ad, marketRef);

          const band = side === "SELL" ? sellBand : buyBand;
          const isSmall = inBand(band, graded.minAmt, graded.maxAmt);
          const adClass = isSmall ? "small_sale" : side === "BUY" ? "buy" : "sell";

          rows.push({
            minute: minuteIso,
            adv_no: String(advNo),
            exchange_account_id: acct.id,
            side,
            ad_class: adClass,
            asset,
            is_online: graded.grade !== "offline",
            adv_status: num(ad?.advStatus),
            surplus_amount: graded.surplus,
            min_single_trans_amount: graded.minAmt,
            max_single_trans_amount: graded.maxAmt,
            pay_method_count: graded.methods,
            price: graded.price,
            market_ref_price: marketRef,
            price_gap_pct: graded.gapPct,
            grade: graded.grade,
            hollow_reasons: graded.reasons,
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
          duration_ms: Date.now() - startedAt,
        }, { onConflict: "minute,exchange_account_id" });

        results.push({ account: acct.accountName, ads: rows.length });
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

    // Keep today's (and yesterday's, around midnight IST) shift summary fresh so
    // the dashboard is usable intraday, not only after the nightly rollup.
    const istToday = new Date(minute.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
    await supabase.rpc("rollup_terminal_ad_uptime", { p_date: istToday });

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
