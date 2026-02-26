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

  let singleRuleId: string | null = null;
  try {
    const body = await req.json();
    singleRuleId = body?.ruleId || null;
  } catch { /* empty body for cron */ }

  try {
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

    const { data: exclusions } = await supabase.from("ad_automation_exclusions").select("adv_no");
    const excludedSet = new Set((exclusions || []).map((e: any) => e.adv_no));

    const results: any[] = [];

    for (const rule of rules) {
      try {
        const logEntries = await processRule(rule, excludedSet, supabase);
        results.push({ ruleId: rule.id, results: logEntries });
      } catch (err) {
        console.error(`Rule ${rule.id} error:`, err);
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
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const currentTimeStr = istNow.toISOString().slice(11, 19);

  // 1. CHECK SCHEDULING
  if (rule.active_hours_start && rule.active_hours_end) {
    const inWindow = currentTimeStr >= rule.active_hours_start && currentTimeStr <= rule.active_hours_end;
    if (!inWindow) {
      if (rule.resting_price || rule.resting_ratio) {
        await applyRestingPriceMultiAsset(rule, excludedSet, supabase);
      }
      await logAndUpdate(rule, supabase, { status: "skipped", skipped_reason: "outside_hours" });
      return [{ status: "skipped", reason: "outside_hours" }];
    }
  }

  // 2. CHECK COOLDOWN
  if (rule.manual_override_cooldown_minutes > 0 && rule.last_manual_edit_at) {
    const cooldownEnd = new Date(new Date(rule.last_manual_edit_at).getTime() + rule.manual_override_cooldown_minutes * 60000);
    if (now < cooldownEnd) {
      await logAndUpdate(rule, supabase, { status: "skipped", skipped_reason: "cooldown" });
      return [{ status: "skipped", reason: "cooldown" }];
    }
  }

  // 3. CHECK AUTO-PAUSE
  if (rule.consecutive_deviations >= rule.auto_pause_after_deviations) {
    await supabase.from("ad_pricing_rules").update({ is_active: false }).eq("id", rule.id);
    await logAndUpdate(rule, supabase, { status: "skipped", skipped_reason: "auto_paused" });
    return [{ status: "skipped", reason: "auto_paused" }];
  }

  // Determine assets to process: use `assets` array if available, otherwise fall back to single `asset`
  const assetsToProcess: string[] = (rule.assets && rule.assets.length > 0) ? rule.assets : [rule.asset];
  const assetConfig: Record<string, any> = rule.asset_config || {};

  // Map terminal trade type to Binance search trade type
  const binanceTradeType = rule.trade_type === "BUY" ? "SELL" : "BUY";

  // Fetch USDT/INR once for all assets
  const usdtInr = await fetchUsdtInr(supabase);

  const allResults: any[] = [];

  // Process each asset independently
  for (const currentAsset of assetsToProcess) {
    try {
      const result = await processAsset(rule, currentAsset, assetConfig[currentAsset] || {}, binanceTradeType, usdtInr, excludedSet, supabase, now, assetsToProcess.length);
      allResults.push(result);
    } catch (assetErr) {
      console.error(`Rule ${rule.id} asset ${currentAsset} error:`, assetErr);
      await supabase.from("ad_pricing_logs").insert({
        rule_id: rule.id,
        asset: currentAsset,
        status: "error",
        error_message: (assetErr as Error).message,
      });
      allResults.push({ asset: currentAsset, status: "error", error: (assetErr as Error).message });
    }
  }

  // For multi-asset rules: if ALL assets were skipped due to no_merchant/no_listings, pause the whole rule
  if (assetsToProcess.length > 1 && rule.pause_if_no_merchant_found) {
    const allSkippedNoMerchant = allResults.every(r => r.status === "skipped" && (r.reason === "no_merchant" || r.reason === "no_listings"));
    if (allSkippedNoMerchant) {
      await supabase.from("ad_pricing_rules").update({ is_active: false }).eq("id", rule.id);
    }
  }

  // Update rule's last_checked timestamp
  await supabase.from("ad_pricing_rules").update({
    last_checked_at: now.toISOString(),
    last_error: null,
    consecutive_errors: 0,
  }).eq("id", rule.id);

  return allResults;
}

async function processAsset(
  rule: any,
  asset: string,
  config: any,
  binanceTradeType: string,
  usdtInr: number,
  excludedSet: Set<string>,
  supabase: any,
  now: Date,
  totalAssets: number = 1
) {
  // 4. FETCH COMPETITOR DATA for this asset
  const searchResult = await searchP2P(asset, rule.fiat, binanceTradeType);

  if (!searchResult || !searchResult.data || searchResult.data.length === 0) {
    if (rule.pause_if_no_merchant_found && totalAssets === 1) {
      await supabase.from("ad_pricing_rules").update({ is_active: false }).eq("id", rule.id);
    }
    await supabase.from("ad_pricing_logs").insert({
      rule_id: rule.id,
      asset,
      status: "skipped",
      skipped_reason: "no_listings",
    });
    return { asset, status: "skipped", reason: "no_listings" };
  }

  // Find target merchant in the results
  const merchants = [rule.target_merchant, ...(rule.fallback_merchants || [])].filter(Boolean);
  let matchedMerchant: string | null = null;
  let competitorPrice: number | null = null;

  for (const nickname of merchants) {
    const normalizedNick = nickname.trim().toLowerCase();
    const found = searchResult.data.find((item: any) => {
      const advNickName = (item.advertiser?.nickName || "").trim().toLowerCase();
      if (advNickName !== normalizedNick) return false;
      // If only_counter_when_online is set, skip merchants that aren't marked online
      // Note: Binance P2P search with publisherType:"merchant" already filters for merchants.
      // The online status fields may not be present in search results, so default to true (assume online).
      if (rule.only_counter_when_online) {
        const onlineField = item.advertiser?.isOnline;
        const onlineStatus = item.advertiser?.userOnlineStatus;
        const isOnline = onlineField === true || onlineStatus === "online" || (onlineField === undefined && onlineStatus === undefined);
        if (!isOnline) return false;
      }
      return true;
    });
    if (found) {
      matchedMerchant = nickname;
      competitorPrice = parseFloat(found.adv?.price || "0");
      break;
    }
  }

  if (!matchedMerchant || !competitorPrice) {
    if (rule.pause_if_no_merchant_found && totalAssets === 1) {
      await supabase.from("ad_pricing_rules").update({ is_active: false }).eq("id", rule.id);
    }
    await supabase.from("ad_pricing_logs").insert({
      rule_id: rule.id,
      asset,
      status: "skipped",
      skipped_reason: "no_merchant",
    });
    return { asset, status: "skipped", reason: "no_merchant" };
  }

  // 5. MARKET VALIDATION
  // Market ref = coinUsdt × usdtInr (P2P rate)
  let marketReferencePrice: number | null = null;
  let deviationPct: number | null = null;

  if (asset === "USDT") {
    marketReferencePrice = usdtInr;
  } else {
    const coinUsdt = await fetchCoinUsdtRate(asset);
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
      await supabase.from("ad_pricing_logs").insert({
        rule_id: rule.id,
        asset,
        status: "skipped",
        skipped_reason: "deviation_exceeded",
        competitor_merchant: matchedMerchant,
        competitor_price: competitorPrice,
        market_reference_price: marketReferencePrice,
        deviation_from_market_pct: deviationPct,
      });
      return { asset, status: "skipped", reason: "deviation_exceeded", deviation: deviationPct };
    }
  }

  // Reset consecutive deviations on successful validation
  if (rule.consecutive_deviations > 0) {
    await supabase.from("ad_pricing_rules").update({ consecutive_deviations: 0 }).eq("id", rule.id);
  }

  // 6. CALCULATE PRICE — use per-asset config for offsets and limits
  const offsetAmount = config.offset_amount ?? rule.offset_amount ?? 0;
  const offsetPct = config.offset_pct ?? rule.offset_pct ?? 0;
  const maxCeiling = config.max_ceiling ?? rule.max_ceiling;
  const minFloor = config.min_floor ?? rule.min_floor;
  const maxRatioCeiling = config.max_ratio_ceiling ?? rule.max_ratio_ceiling;
  const minRatioFloor = config.min_ratio_floor ?? rule.min_ratio_floor;

  let newPrice: number | null = null;
  let newRatio: number | null = null;
  let wasCapped = false;
  let wasRateLimited = false;

  // Resolve ad numbers early (needed by FLOATING mode to infer Binance index)
  const adNumbers = (config.ad_numbers || rule.ad_numbers || []).filter((no: string) => !excludedSet.has(no));

  if (rule.price_type === "FIXED") {
    if (rule.offset_direction === "OVERCUT") {
      newPrice = competitorPrice + offsetAmount;
    } else {
      newPrice = competitorPrice - offsetAmount;
    }

    // Rate-of-change guard
    if (rule.max_price_change_per_cycle && rule.last_applied_price) {
      const delta = Math.abs(newPrice - rule.last_applied_price);
      if (delta > rule.max_price_change_per_cycle) {
        const direction = newPrice > rule.last_applied_price ? 1 : -1;
        newPrice = rule.last_applied_price + direction * rule.max_price_change_per_cycle;
        wasRateLimited = true;
      }
    }

    // Hard limits (per-asset)
    if (maxCeiling && newPrice > maxCeiling) { newPrice = maxCeiling; wasCapped = true; }
    if (minFloor && newPrice < minFloor) { newPrice = minFloor; wasCapped = true; }

  } else {
    // FLOATING mode — we need Binance's actual P2P index to compute accurate ratios.
    // Our marketReferencePrice (coinUsdt × CoinGecko USDT/INR) ≠ Binance's index.
    // Best approach: infer Binance's index from our own ad's current displayed price & ratio.
    let binanceIndex = marketReferencePrice || competitorPrice;

    // Try to infer the real Binance index from the first ad we'll update
    const firstAdNo = adNumbers[0];
    if (firstAdNo) {
      try {
        const inferredIndex = await inferBinanceIndex(firstAdNo, supabase);
        if (inferredIndex && inferredIndex > 0) {
          console.log(`[FLOATING] Inferred Binance index for ${asset}: ₹${inferredIndex.toFixed(2)} (vs our ref ₹${(marketReferencePrice || 0).toFixed(2)})`);
          binanceIndex = inferredIndex;
        }
      } catch (e) {
        console.error(`[FLOATING] Failed to infer Binance index for ${asset}:`, e);
      }
    }

    // Calculate desired price from competitor + offset
    let desiredPrice: number;
    if (rule.offset_direction === "OVERCUT") {
      desiredPrice = competitorPrice * (1 + offsetPct / 100);
    } else {
      desiredPrice = competitorPrice * (1 - offsetPct / 100);
    }

    // Compute ratio that produces desiredPrice on Binance: ratio = desiredPrice / binanceIndex * 100
    newRatio = (desiredPrice / binanceIndex) * 100;

    if (rule.max_ratio_change_per_cycle && rule.last_applied_ratio) {
      const delta = Math.abs(newRatio - rule.last_applied_ratio);
      if (delta > rule.max_ratio_change_per_cycle) {
        const direction = newRatio > rule.last_applied_ratio ? 1 : -1;
        newRatio = rule.last_applied_ratio + direction * rule.max_ratio_change_per_cycle;
        wasRateLimited = true;
      }
    }

    if (maxRatioCeiling && newRatio > maxRatioCeiling) { newRatio = maxRatioCeiling; wasCapped = true; }
    if (minRatioFloor && newRatio < minRatioFloor) { newRatio = minRatioFloor; wasCapped = true; }
  }

  // 7. EXECUTE — ad numbers already resolved above
  if (adNumbers.length === 0) {
    await supabase.from("ad_pricing_logs").insert({
      rule_id: rule.id,
      asset,
      status: "skipped",
      skipped_reason: "no_ads",
    });
    return { asset, status: "skipped", reason: "no_ads" };
  }

  const binanceAdsUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/binance-ads`;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  let successCount = 0;
  let skipCount = 0;

  for (const adNo of adNumbers) {
    try {
      const adData: any = { advNo: adNo };
      if (rule.price_type === "FIXED") {
        const roundedPrice = Math.round((newPrice!) * 100) / 100;
        adData.price = roundedPrice;
        adData.priceType = 1;
      } else {
        const roundedRatio = Math.round((newRatio!) * 10000) / 10000;
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
        await supabase.from("ad_pricing_logs").insert({
          rule_id: rule.id,
          ad_number: adNo,
          asset,
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
          status: "applied",
        });
      } else {
        await supabase.from("ad_pricing_logs").insert({
          rule_id: rule.id,
          ad_number: adNo,
          asset,
          competitor_merchant: matchedMerchant,
          competitor_price: competitorPrice,
          status: "error",
          error_message: respData.error || "Update failed",
        });
      }

      await new Promise((r) => setTimeout(r, 300));
    } catch (adErr) {
      console.error(`Failed to update ad ${adNo} for ${asset}:`, adErr);
      await supabase.from("ad_pricing_logs").insert({
        rule_id: rule.id,
        ad_number: adNo,
        asset,
        status: "error",
        error_message: (adErr as Error).message,
      });
    }
  }

  return {
    asset,
    status: successCount > 0 ? "success" : skipCount === adNumbers.length ? "no_change" : "error",
    updated: successCount,
    skipped: skipCount,
    competitor: matchedMerchant,
    competitorPrice,
    newPrice: rule.price_type === "FIXED" ? newPrice : undefined,
    newRatio: rule.price_type === "FLOATING" ? newRatio : undefined,
  };
}

async function applyRestingPriceMultiAsset(rule: any, excludedSet: Set<string>, supabase: any) {
  const assetsToProcess: string[] = (rule.assets && rule.assets.length > 0) ? rule.assets : [rule.asset];
  const assetConfig: Record<string, any> = rule.asset_config || {};
  const binanceAdsUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/binance-ads`;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  for (const asset of assetsToProcess) {
    const config = assetConfig[asset] || {};
    const adNumbers = (config.ad_numbers || rule.ad_numbers || []).filter((no: string) => !excludedSet.has(no));

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
        publisherType: "merchant",
        payTypes: [],
      }),
    });
    const pageData = await resp.json();
    const items = pageData?.data || [];
    allData.push(...items);
    if (items.length < 20) break;
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
  // Primary: CoinGecko USDT/INR live market rate (matches Google's "USDT INR" rate ~₹90.96)
  try {
    const cgResp = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=inr",
      { headers: { Accept: "application/json" } }
    );
    const cgData = await cgResp.json();
    if (cgData?.tether?.inr && cgData.tether.inr > 80) {
      console.log(`[fetchUsdtInr] CoinGecko: ${cgData.tether.inr}`);
      return cgData.tether.inr;
    }
  } catch (e) {
    console.error("[fetchUsdtInr] CoinGecko failed:", e);
  }

  // Fallback: P2P merchant sell-side median
  try {
    const resp = await fetch("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset: "USDT", fiat: "INR", tradeType: "SELL", page: 1, rows: 10, publisherType: "merchant" }),
    });
    const data = await resp.json();
    if (data?.data?.length > 0) {
      const prices = data.data.map((d: any) => parseFloat(d.adv?.price || "0")).filter((p: number) => p > 0);
      if (prices.length > 0) {
        prices.sort((a: number, b: number) => a - b);
        const mid = Math.floor(prices.length / 2);
        const rate = prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];
        console.log(`[fetchUsdtInr] P2P fallback: ${rate.toFixed(2)}`);
        return rate;
      }
    }
  } catch { /* fallback */ }

  return 90;
}

/**
 * Infer Binance's actual P2P index price by fetching our own ad's
 * current displayed price and floating ratio.
 * Formula: index = displayedPrice / (floatingRatio / 100)
 */
async function inferBinanceIndex(adNo: string, supabase: any): Promise<number | null> {
  const binanceAdsUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/binance-ads`;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const resp = await fetch(binanceAdsUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ action: "getAdDetail", adsNo: adNo }),
  });
  const result = await resp.json();

  // Navigate Binance response structure
  const adData = result?.data?.data || result?.data;
  if (!adData) return null;

  const price = parseFloat(adData.price || adData.adDetailResp?.price || "0");
  const ratio = parseFloat(adData.priceFloatingRatio || adData.adDetailResp?.priceFloatingRatio || "0");
  const priceType = adData.priceType ?? adData.adDetailResp?.priceType;

  // Only infer index if ad is currently using floating pricing (priceType 2)
  if (priceType === 2 && ratio > 0 && price > 0) {
    const index = price / (ratio / 100);
    console.log(`[inferBinanceIndex] Ad ${adNo}: price=${price}, ratio=${ratio}, inferred index=${index.toFixed(2)}`);
    return index;
  }

  // If ad is FIXED or no ratio, we can't infer the index
  console.log(`[inferBinanceIndex] Ad ${adNo}: priceType=${priceType}, cannot infer index`);
  return null;
}
