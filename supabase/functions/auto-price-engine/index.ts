import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Check if a single rule was requested (manual trigger)
  let singleRuleId: string | null = null;
  try {
    const body = await req.json();
    singleRuleId = body?.ruleId || null;
  } catch { /* empty body for cron */ }

  try {
    // Fetch active rules (or single rule for manual trigger)
    let query = supabase.from("ad_pricing_rules").select("*");
    if (singleRuleId) {
      query = query.eq("id", singleRuleId);
    } else {
      query = query.eq("is_active", true);
    }
    const { data: rules, error: rulesErr } = await query;
    if (rulesErr) throw rulesErr;
    if (!rules || rules.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No active rules" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch excluded ads
    const { data: exclusions } = await supabase.from("ad_automation_exclusions").select("adv_no");
    const excludedSet = new Set((exclusions || []).map((e: any) => e.adv_no));

    const results: any[] = [];

    for (const rule of rules) {
      try {
        const logEntry = await processRule(rule, excludedSet, supabase);
        results.push({ ruleId: rule.id, ...logEntry });
      } catch (err) {
        console.error(`Rule ${rule.id} error:`, err);
        // Increment consecutive errors
        await supabase.from("ad_pricing_rules").update({
          last_checked_at: new Date().toISOString(),
          last_error: (err as Error).message,
          consecutive_errors: (rule.consecutive_errors || 0) + 1,
        }).eq("id", rule.id);
        results.push({ ruleId: rule.id, status: "error", error: (err as Error).message });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("auto-price-engine fatal:", err);
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function processRule(rule: any, excludedSet: Set<string>, supabase: any) {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; // IST = UTC+5:30
  const istNow = new Date(now.getTime() + istOffset);
  const currentTimeStr = istNow.toISOString().slice(11, 19); // HH:MM:SS

  // 1. CHECK SCHEDULING
  if (rule.active_hours_start && rule.active_hours_end) {
    const inWindow = currentTimeStr >= rule.active_hours_start && currentTimeStr <= rule.active_hours_end;
    if (!inWindow) {
      // Set resting price if configured
      if (rule.resting_price || rule.resting_ratio) {
        await applyRestingPrice(rule, excludedSet, supabase);
      }
      await logAndUpdate(rule, supabase, { status: "skipped", skipped_reason: "outside_hours" });
      return { status: "skipped", reason: "outside_hours" };
    }
  }

  // 2. CHECK COOLDOWN
  if (rule.manual_override_cooldown_minutes > 0 && rule.last_manual_edit_at) {
    const cooldownEnd = new Date(new Date(rule.last_manual_edit_at).getTime() + rule.manual_override_cooldown_minutes * 60000);
    if (now < cooldownEnd) {
      await logAndUpdate(rule, supabase, { status: "skipped", skipped_reason: "cooldown" });
      return { status: "skipped", reason: "cooldown" };
    }
  }

  // 3. CHECK AUTO-PAUSE
  if (rule.consecutive_deviations >= rule.auto_pause_after_deviations) {
    await supabase.from("ad_pricing_rules").update({ is_active: false }).eq("id", rule.id);
    await logAndUpdate(rule, supabase, { status: "skipped", skipped_reason: "auto_paused" });
    return { status: "skipped", reason: "auto_paused" };
  }

  // 4. FETCH COMPETITOR DATA
  // Map terminal trade type to Binance search trade type
  // BUY rule → search SELL page (show buyers), SELL rule → search BUY page (show sellers)
  const binanceTradeType = rule.trade_type === "BUY" ? "SELL" : "BUY";
  const searchResult = await searchP2P(rule.asset, rule.fiat, binanceTradeType);

  if (!searchResult || !searchResult.data || searchResult.data.length === 0) {
    if (rule.pause_if_no_merchant_found) {
      await supabase.from("ad_pricing_rules").update({ is_active: false }).eq("id", rule.id);
    }
    await logAndUpdate(rule, supabase, { status: "skipped", skipped_reason: "no_merchant" });
    return { status: "skipped", reason: "no_merchant" };
  }

  // Find target merchant
  const merchants = [rule.target_merchant, ...(rule.fallback_merchants || [])].filter(Boolean);
  let matchedMerchant: string | null = null;
  let competitorPrice: number | null = null;

  for (const nickname of merchants) {
    const found = searchResult.data.find((item: any) => {
      const advNickName = item.advertiser?.nickName;
      if (advNickName?.toLowerCase() !== nickname.toLowerCase()) return false;
      if (rule.only_counter_when_online && item.advertiser?.userType !== "merchant") return false;
      return true;
    });
    if (found) {
      matchedMerchant = nickname;
      competitorPrice = parseFloat(found.adv?.price || "0");
      break;
    }
  }

  if (!matchedMerchant || !competitorPrice) {
    if (rule.pause_if_no_merchant_found) {
      await supabase.from("ad_pricing_rules").update({ is_active: false }).eq("id", rule.id);
    }
    await logAndUpdate(rule, supabase, { status: "skipped", skipped_reason: "no_merchant" });
    return { status: "skipped", reason: "no_merchant" };
  }

  // 5. MARKET VALIDATION
  let marketReferencePrice: number | null = null;
  let deviationPct: number | null = null;

  if (rule.asset === "USDT") {
    // For USDT, reference is just USDT/INR rate
    const usdtInr = await fetchUsdtInr(supabase);
    marketReferencePrice = usdtInr;
  } else {
    // For non-USDT, get coin/USDT rate * USDT/INR
    const [coinUsdt, usdtInr] = await Promise.all([
      fetchCoinUsdtRate(rule.asset),
      fetchUsdtInr(supabase),
    ]);
    marketReferencePrice = coinUsdt * usdtInr;
  }

  if (marketReferencePrice && marketReferencePrice > 0) {
    deviationPct = Math.abs((competitorPrice - marketReferencePrice) / marketReferencePrice) * 100;
    if (deviationPct > (rule.max_deviation_from_market_pct || 5)) {
      const newDeviations = (rule.consecutive_deviations || 0) + 1;
      await supabase.from("ad_pricing_rules").update({
        consecutive_deviations: newDeviations,
        last_checked_at: now.toISOString(),
        last_competitor_price: competitorPrice,
        last_matched_merchant: matchedMerchant,
      }).eq("id", rule.id);
      await logAndUpdate(rule, supabase, {
        status: "skipped",
        skipped_reason: "deviation_exceeded",
        competitor_merchant: matchedMerchant,
        competitor_price: competitorPrice,
        market_reference_price: marketReferencePrice,
        deviation_from_market_pct: deviationPct,
      });
      return { status: "skipped", reason: "deviation_exceeded", deviation: deviationPct };
    }
  }

  // Reset consecutive deviations on successful validation
  if (rule.consecutive_deviations > 0) {
    await supabase.from("ad_pricing_rules").update({ consecutive_deviations: 0 }).eq("id", rule.id);
  }

  // 6. CALCULATE PRICE
  let newPrice: number | null = null;
  let newRatio: number | null = null;
  let wasCapped = false;
  let wasRateLimited = false;

  if (rule.price_type === "FIXED") {
    if (rule.offset_direction === "OVERCUT") {
      newPrice = competitorPrice + (rule.offset_amount || 0);
    } else {
      newPrice = competitorPrice - (rule.offset_amount || 0);
    }

    // 7. RATE-OF-CHANGE GUARD
    if (rule.max_price_change_per_cycle && rule.last_applied_price) {
      const delta = Math.abs(newPrice - rule.last_applied_price);
      if (delta > rule.max_price_change_per_cycle) {
        const direction = newPrice > rule.last_applied_price ? 1 : -1;
        newPrice = rule.last_applied_price + direction * rule.max_price_change_per_cycle;
        wasRateLimited = true;
      }
    }

    // 8. HARD LIMITS
    if (rule.max_ceiling && newPrice > rule.max_ceiling) { newPrice = rule.max_ceiling; wasCapped = true; }
    if (rule.min_floor && newPrice < rule.min_floor) { newPrice = rule.min_floor; wasCapped = true; }

  } else {
    // FLOATING mode
    const refInr = marketReferencePrice || competitorPrice;
    const baseRatio = (competitorPrice / refInr) * 100;

    if (rule.offset_direction === "OVERCUT") {
      newRatio = baseRatio + (rule.offset_pct || 0);
    } else {
      newRatio = baseRatio - (rule.offset_pct || 0);
    }

    // Rate-of-change guard for ratio
    if (rule.max_ratio_change_per_cycle && rule.last_applied_ratio) {
      const delta = Math.abs(newRatio - rule.last_applied_ratio);
      if (delta > rule.max_ratio_change_per_cycle) {
        const direction = newRatio > rule.last_applied_ratio ? 1 : -1;
        newRatio = rule.last_applied_ratio + direction * rule.max_ratio_change_per_cycle;
        wasRateLimited = true;
      }
    }

    // Hard limits for ratio
    if (rule.max_ratio_ceiling && newRatio > rule.max_ratio_ceiling) { newRatio = rule.max_ratio_ceiling; wasCapped = true; }
    if (rule.min_ratio_floor && newRatio < rule.min_ratio_floor) { newRatio = rule.min_ratio_floor; wasCapped = true; }
  }

  // 9. EXECUTE — update each ad
  const adNumbers = (rule.ad_numbers || []).filter((no: string) => !excludedSet.has(no));
  if (adNumbers.length === 0) {
    await logAndUpdate(rule, supabase, { status: "skipped", skipped_reason: "no_ads" });
    return { status: "skipped", reason: "no_ads" };
  }

  const binanceAdsUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/binance-ads`;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  let successCount = 0;
  let skipCount = 0;

  for (const adNo of adNumbers) {
    try {
      // Build update payload
      const adData: any = { advNo: adNo };
      if (rule.price_type === "FIXED") {
        // Round to 2 decimals
        const roundedPrice = Math.round((newPrice!) * 100) / 100;
        if (rule.last_applied_price && Math.abs(roundedPrice - rule.last_applied_price) < 0.01) {
          skipCount++;
          continue; // No change
        }
        adData.price = roundedPrice;
        adData.priceType = 1;
      } else {
        const roundedRatio = Math.round((newRatio!) * 10000) / 10000;
        if (rule.last_applied_ratio && Math.abs(roundedRatio - rule.last_applied_ratio) < 0.0001) {
          skipCount++;
          continue;
        }
        adData.priceFloatingRatio = roundedRatio;
        adData.priceType = 2;
      }

      const resp = await fetch(binanceAdsUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ action: "updateAd", adData }),
      });
      const respData = await resp.json();

      if (respData.success) {
        successCount++;
        // Log per ad
        await supabase.from("ad_pricing_logs").insert({
          rule_id: rule.id,
          ad_number: adNo,
          competitor_merchant: matchedMerchant,
          competitor_price: competitorPrice,
          market_reference_price: marketReferencePrice,
          deviation_from_market_pct: deviationPct,
          calculated_price: rule.price_type === "FIXED" ? newPrice : null,
          calculated_ratio: rule.price_type === "FLOATING" ? newRatio : null,
          applied_price: rule.price_type === "FIXED" ? Math.round((newPrice!) * 100) / 100 : null,
          applied_ratio: rule.price_type === "FLOATING" ? Math.round((newRatio!) * 10000) / 10000 : null,
          was_capped: wasCapped,
          was_rate_limited: wasRateLimited,
          status: "success",
        });
      } else {
        await supabase.from("ad_pricing_logs").insert({
          rule_id: rule.id,
          ad_number: adNo,
          competitor_merchant: matchedMerchant,
          competitor_price: competitorPrice,
          status: "error",
          error_message: respData.error || "Update failed",
        });
      }

      // Delay between API calls
      await new Promise((r) => setTimeout(r, 300));
    } catch (adErr) {
      console.error(`Failed to update ad ${adNo}:`, adErr);
      await supabase.from("ad_pricing_logs").insert({
        rule_id: rule.id,
        ad_number: adNo,
        status: "error",
        error_message: (adErr as Error).message,
      });
    }
  }

  // Update rule state
  await supabase.from("ad_pricing_rules").update({
    last_checked_at: now.toISOString(),
    last_competitor_price: competitorPrice,
    last_applied_price: rule.price_type === "FIXED" ? Math.round((newPrice!) * 100) / 100 : rule.last_applied_price,
    last_applied_ratio: rule.price_type === "FLOATING" ? Math.round((newRatio!) * 10000) / 10000 : rule.last_applied_ratio,
    last_matched_merchant: matchedMerchant,
    last_error: null,
    consecutive_errors: 0,
  }).eq("id", rule.id);

  return {
    status: successCount > 0 ? "success" : skipCount === adNumbers.length ? "no_change" : "error",
    updated: successCount,
    skipped: skipCount,
    competitor: matchedMerchant,
    competitorPrice,
    newPrice: rule.price_type === "FIXED" ? newPrice : undefined,
    newRatio: rule.price_type === "FLOATING" ? newRatio : undefined,
  };
}

async function applyRestingPrice(rule: any, excludedSet: Set<string>, supabase: any) {
  const adNumbers = (rule.ad_numbers || []).filter((no: string) => !excludedSet.has(no));
  const binanceAdsUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/binance-ads`;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  for (const adNo of adNumbers) {
    const adData: any = { advNo: adNo };
    if (rule.price_type === "FIXED" && rule.resting_price) {
      adData.price = rule.resting_price;
      adData.priceType = 1;
    } else if (rule.price_type === "FLOATING" && rule.resting_ratio) {
      adData.priceFloatingRatio = rule.resting_ratio;
      adData.priceType = 2;
    } else {
      continue;
    }

    try {
      await fetch(binanceAdsUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anonKey}` },
        body: JSON.stringify({ action: "updateAd", adData }),
      });
    } catch (e) {
      console.error(`Resting price update failed for ${adNo}:`, e);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function logAndUpdate(rule: any, supabase: any, logData: any) {
  await supabase.from("ad_pricing_logs").insert({
    rule_id: rule.id,
    ...logData,
  });
  await supabase.from("ad_pricing_rules").update({
    last_checked_at: new Date().toISOString(),
  }).eq("id", rule.id);
}

async function searchP2P(asset: string, fiat: string, tradeType: string) {
  // Fetch up to 500 listings (25 pages) — raw API includes many small accounts the website filters out
  const allData: any[] = [];
  for (let page = 1; page <= 25; page++) {
    const resp = await fetch("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset,
        fiat,
        tradeType,
        page,
        rows: 20,
        publisherType: null,
        payTypes: [],
      }),
    });
    const pageData = await resp.json();
    const items = pageData?.data || [];
    allData.push(...items);
    if (items.length < 20) break; // No more pages
  }
  return { data: allData };
}

async function fetchCoinUsdtRate(asset: string): Promise<number> {
  try {
    const resp = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${asset}USDT`);
    const data = await resp.json();
    return parseFloat(data.price || "0");
  } catch {
    return 0;
  }
}

async function fetchUsdtInr(supabase: any): Promise<number> {
  try {
    // Try to get from our fetch-usdt-rate function's cached data
    const { data } = await supabase.from("usdt_inr_rate").select("rate").order("updated_at", { ascending: false }).limit(1).single();
    if (data?.rate) return data.rate;
  } catch { /* fallback */ }

  // Fallback: fetch from Binance P2P
  try {
    const resp = await fetch("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset: "USDT", fiat: "INR", tradeType: "SELL", page: 1, rows: 5 }),
    });
    const data = await resp.json();
    if (data?.data?.length > 0) {
      const prices = data.data.map((d: any) => parseFloat(d.adv?.price || "0")).filter((p: number) => p > 0);
      return prices.reduce((a: number, b: number) => a + b, 0) / prices.length;
    }
  } catch { /* fallback */ }

  return 90; // Last resort fallback
}
