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
    // ===== AP-ARCH-01: CIRCUIT BREAKER CHECK =====
    const { data: engineState } = await supabase
      .from("ad_pricing_engine_state")
      .select("*")
      .eq("id", "singleton")
      .single();

    if (engineState && engineState.circuit_status === "OPEN") {
      const openedAt = new Date(engineState.opened_at || 0);
      const cooldownMs = (engineState.cooldown_minutes || 10) * 60000;
      if (Date.now() - openedAt.getTime() < cooldownMs) {
        console.log("[circuit-breaker] Circuit OPEN, cooldown active. Skipping cycle.");
        return new Response(JSON.stringify({ success: true, message: "Circuit breaker OPEN, skipping" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Cooldown elapsed — transition to HALF_OPEN
      await supabase.from("ad_pricing_engine_state").update({
        circuit_status: "HALF_OPEN", updated_at: new Date().toISOString(),
      }).eq("id", "singleton");
      console.log("[circuit-breaker] Cooldown elapsed, transitioning to HALF_OPEN");
    }

    const isHalfOpen = engineState?.circuit_status === "HALF_OPEN";

    // ===== AP-BUG-01: REST TIMER CHECK =====
    const { data: restTimers } = await supabase
      .from("ad_rest_timer")
      .select("*")
      .eq("is_active", true)
      .limit(1);

    if (restTimers && restTimers.length > 0) {
      const timer = restTimers[0];
      const expiresAt = new Date(new Date(timer.started_at).getTime() + timer.duration_minutes * 60000);
      if (new Date() < expiresAt) {
        console.log(`[rest-timer] Active rest timer until ${expiresAt.toISOString()}, skipping entire cycle`);
        // Log skip for all active rules
        const { data: activeRules } = await supabase.from("ad_pricing_rules").select("id").eq("is_active", true);
        if (activeRules && activeRules.length > 0) {
          await supabase.from("ad_pricing_logs").insert(
            activeRules.map((r: any) => ({ rule_id: r.id, status: "skipped", skipped_reason: "rest_timer" }))
          );
        }
        return new Response(JSON.stringify({ success: true, message: "Rest timer active, skipping" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        // Expired but still active — clean up
        await supabase.from("ad_rest_timer").update({ is_active: false }).eq("id", timer.id);
        console.log("[rest-timer] Expired timer cleaned up");
      }
    }

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

    // Filter out inactive rules even when called with a specific ruleId
    const activeRules = rules.filter((r: any) => r.is_active !== false);
    if (activeRules.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "Rule is inactive", skipped: rules.map((r: any) => r.id) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== AP-BUG-05: AD CONFLICT DETECTION =====
    const adToRule = new Map<string, string>();
    const conflictedRules = new Set<string>();
    for (const rule of activeRules) {
      const allAdNos = getAllAdNumbers(rule);
      for (const adNo of allAdNos) {
        if (adToRule.has(adNo)) {
          const existingRule = adToRule.get(adNo)!;
          conflictedRules.add(rule.id);
          conflictedRules.add(existingRule);
          console.warn(`[conflict] Ad ${adNo} claimed by rules: ${existingRule} and ${rule.id}`);
        } else {
          adToRule.set(adNo, rule.id);
        }
      }
    }

    // In HALF_OPEN mode, only process first rule as test
    const rulesToProcess = isHalfOpen ? activeRules.slice(0, 1) : activeRules;

    let cycleSuccessCount = 0;
    let cycleErrorCount = 0;

    for (const rule of rulesToProcess) {
      // Skip conflicted rules
      if (conflictedRules.has(rule.id)) {
        await supabase.from("ad_pricing_logs").insert({
          rule_id: rule.id, status: "skipped", skipped_reason: "ad_conflict",
        });
        results.push({ ruleId: rule.id, status: "skipped", reason: "ad_conflict" });
        continue;
      }

      try {
        const logEntries = await processRule(rule, excludedSet, supabase);
        results.push({ ruleId: rule.id, results: logEntries });
        cycleSuccessCount++;
      } catch (err) {
        console.error(`Rule ${rule.id} error:`, err);
        await supabase.from("ad_pricing_rules").update({
          last_checked_at: new Date().toISOString(),
          last_error: (err as Error).message,
          consecutive_errors: (rule.consecutive_errors || 0) + 1,
        }).eq("id", rule.id);
        results.push({ ruleId: rule.id, status: "error", error: (err as Error).message });
        cycleErrorCount++;
      }
    }

    // ===== CIRCUIT BREAKER STATE TRANSITION =====
    await updateCircuitBreaker(supabase, engineState, cycleSuccessCount, cycleErrorCount);

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("auto-price-engine fatal:", err);
    // Record fatal failure in circuit breaker
    try {
      await supabase.from("ad_pricing_engine_state").update({
        consecutive_failures: (await supabase.from("ad_pricing_engine_state").select("consecutive_failures").eq("id", "singleton").single()).data?.consecutive_failures + 1 || 1,
        last_failure_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", "singleton");
    } catch { /* best effort */ }
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getAllAdNumbers(rule: any): string[] {
  const assetConfig: Record<string, any> = rule.asset_config || {};
  const allNos: string[] = [];
  const assets = (rule.assets && rule.assets.length > 0) ? rule.assets : [rule.asset];
  for (const asset of assets) {
    const config = assetConfig[asset] || {};
    const nos = config.ad_numbers || [];
    allNos.push(...nos);
  }
  // Fallback to top-level
  if (allNos.length === 0 && rule.ad_numbers) {
    allNos.push(...rule.ad_numbers);
  }
  return allNos;
}

async function updateCircuitBreaker(supabase: any, currentState: any, successes: number, errors: number) {
  if (!currentState) return;
  const now = new Date().toISOString();

  if (currentState.circuit_status === "HALF_OPEN") {
    if (successes > 0 && errors === 0) {
      await supabase.from("ad_pricing_engine_state").update({
        circuit_status: "CLOSED", consecutive_failures: 0,
        last_success_at: now, updated_at: now,
      }).eq("id", "singleton");
      console.log("[circuit-breaker] HALF_OPEN → CLOSED (test passed)");
    } else {
      await supabase.from("ad_pricing_engine_state").update({
        circuit_status: "OPEN", opened_at: now,
        consecutive_failures: currentState.consecutive_failures + errors,
        last_failure_at: now, updated_at: now,
      }).eq("id", "singleton");
      console.log("[circuit-breaker] HALF_OPEN → OPEN (test failed)");
    }
    return;
  }

  // CLOSED state
  if (errors > 0) {
    const newFailures = (currentState.consecutive_failures || 0) + errors;
    const threshold = currentState.failure_threshold || 5;
    if (newFailures >= threshold) {
      await supabase.from("ad_pricing_engine_state").update({
        circuit_status: "OPEN", consecutive_failures: newFailures,
        opened_at: now, last_failure_at: now, updated_at: now,
      }).eq("id", "singleton");
      console.log(`[circuit-breaker] CLOSED → OPEN (${newFailures} failures >= ${threshold})`);
    } else {
      await supabase.from("ad_pricing_engine_state").update({
        consecutive_failures: newFailures, last_failure_at: now, updated_at: now,
      }).eq("id", "singleton");
    }
  } else if (successes > 0) {
    if (currentState.consecutive_failures > 0) {
      await supabase.from("ad_pricing_engine_state").update({
        consecutive_failures: 0, last_success_at: now, updated_at: now,
      }).eq("id", "singleton");
    }
  }
}

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
    // AP-MISS-03: Alert on auto-pause
    await insertPricingAlert(supabase, rule, "auto_paused",
      `Rule "${rule.name}" auto-paused after ${rule.consecutive_deviations} consecutive deviations`);
    return [{ status: "skipped", reason: "auto_paused" }];
  }

  // Determine assets to process
  const assetsToProcess: string[] = (rule.assets && rule.assets.length > 0) ? rule.assets : [rule.asset];
  const assetConfig: Record<string, any> = rule.asset_config || {};

  const binanceTradeType = rule.trade_type === "BUY" ? "SELL" : "BUY";
  const usdtInr = await fetchUsdtInr(supabase);

  const allResults: any[] = [];

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
    // AP-MISS-03: Alert on merchant disappearance (only if previously found)
    if (rule.last_matched_merchant) {
      await insertPricingAlert(supabase, rule, "merchant_disappeared",
        `Merchant "${rule.target_merchant}" disappeared from ${asset} listings for rule "${rule.name}"`);
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

  // 6. CALCULATE PRICE
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

  const adNumbers = (config.ad_numbers || rule.ad_numbers || []).filter((no: string) => !excludedSet.has(no));

  if (rule.price_type === "FIXED") {
    if (rule.offset_direction === "OVERCUT") {
      newPrice = competitorPrice + offsetAmount;
    } else {
      newPrice = competitorPrice - offsetAmount;
    }

    if (rule.max_price_change_per_cycle && rule.last_applied_price && newPrice !== null) {
      const delta = Math.abs(newPrice - rule.last_applied_price);
      if (delta > rule.max_price_change_per_cycle) {
        const direction = newPrice > rule.last_applied_price ? 1 : -1;
        newPrice = rule.last_applied_price + direction * rule.max_price_change_per_cycle;
        wasRateLimited = true;
      }
    }

    if (maxCeiling && newPrice !== null && newPrice > maxCeiling) { newPrice = maxCeiling; wasCapped = true; }
    if (minFloor && newPrice !== null && newPrice < minFloor) { newPrice = minFloor; wasCapped = true; }

  } else {
    // Try to infer Binance's actual index price from one of our own floating ads
    let binanceIndex: number | null = null;
    for (const adNo of adNumbers) {
      binanceIndex = await inferBinanceIndex(adNo, supabase);
      if (binanceIndex && binanceIndex > 0) break;
    }

    const baseRef = binanceIndex && binanceIndex > 0
      ? binanceIndex
      : (marketReferencePrice && marketReferencePrice > 0 ? marketReferencePrice : competitorPrice);
    
    const indexSource = binanceIndex && binanceIndex > 0 ? "binance_index" : (marketReferencePrice && marketReferencePrice > 0 ? "coingecko" : "competitor");
    console.log(`[FLOATING] ${asset}: Using ${indexSource} as base reference: ₹${baseRef.toFixed(2)}${binanceIndex ? ` (Binance index inferred: ₹${binanceIndex.toFixed(2)})` : ''}`);
    
    const competitorRatio = (competitorPrice / baseRef) * 100;

    if (rule.offset_direction === "OVERCUT") {
      newRatio = competitorRatio + offsetPct;
    } else {
      newRatio = competitorRatio - offsetPct;
    }

    console.log(`[FLOATING] ${asset}: competitorPrice=₹${competitorPrice}, marketRef=₹${baseRef.toFixed(2)}, competitorRatio=${competitorRatio.toFixed(4)}%, offset=${rule.offset_direction} ${offsetPct}%, newRatio=${newRatio !== null ? newRatio.toFixed(4) : 'null'}%`);

    if (rule.max_ratio_change_per_cycle && rule.last_applied_ratio && newRatio !== null) {
      const delta = Math.abs(newRatio - rule.last_applied_ratio);
      if (delta > rule.max_ratio_change_per_cycle) {
        const direction = newRatio > rule.last_applied_ratio ? 1 : -1;
        newRatio = rule.last_applied_ratio + direction * rule.max_ratio_change_per_cycle;
        wasRateLimited = true;
      }
    }

    if (maxRatioCeiling && newRatio !== null && newRatio > maxRatioCeiling) { newRatio = maxRatioCeiling; wasCapped = true; }
    if (minRatioFloor && newRatio !== null && newRatio < minRatioFloor) { newRatio = minRatioFloor; wasCapped = true; }
  }

  // AP-MISS-03: Anomaly alert if price changed >3% from last applied
  if (rule.price_type === "FIXED" && newPrice && rule.last_applied_price && rule.last_applied_price > 0) {
    const changePct = Math.abs((newPrice - rule.last_applied_price) / rule.last_applied_price) * 100;
    if (changePct > 3) {
      await insertPricingAlert(supabase, rule, "price_spike",
        `${asset}: Price changing ${changePct.toFixed(1)}% (₹${rule.last_applied_price} → ₹${newPrice.toFixed(2)}) for rule "${rule.name}"`);
    }
  }
  if (rule.price_type === "FLOATING" && newRatio && rule.last_applied_ratio && rule.last_applied_ratio > 0) {
    const changePct = Math.abs((newRatio - rule.last_applied_ratio) / rule.last_applied_ratio) * 100;
    if (changePct > 3) {
      await insertPricingAlert(supabase, rule, "ratio_spike",
        `${asset}: Ratio changing ${changePct.toFixed(1)}% (${rule.last_applied_ratio}% → ${newRatio.toFixed(4)}%) for rule "${rule.name}"`);
    }
  }

  // 7. EXECUTE
  if (adNumbers.length === 0) {
    await supabase.from("ad_pricing_logs").insert({
      rule_id: rule.id,
      asset,
      status: "skipped",
      skipped_reason: "no_ads",
    });
    return { asset, status: "skipped", reason: "no_ads" };
  }

  // ===== AP-ARCH-03: DRY-RUN MODE =====
  if (rule.is_dry_run) {
    await supabase.from("ad_pricing_logs").insert({
      rule_id: rule.id,
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
      status: "dry_run",
    });
    console.log(`[DRY-RUN] ${rule.name}/${asset}: would apply ${rule.price_type === "FIXED" ? `₹${newPrice?.toFixed(2)}` : `${newRatio?.toFixed(4)}%`}`);
    return {
      asset, status: "dry_run",
      competitor: matchedMerchant, competitorPrice,
      newPrice: rule.price_type === "FIXED" ? newPrice : undefined,
      newRatio: rule.price_type === "FLOATING" ? newRatio : undefined,
    };
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
          market_reference_price: marketReferencePrice,
          deviation_from_market_pct: deviationPct,
          calculated_price: rule.price_type === "FIXED" ? newPrice : null,
          calculated_ratio: rule.price_type === "FLOATING" ? newRatio : null,
          status: "error",
          error_message: respData.error || JSON.stringify(respData).substring(0, 200),
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

// ===== AP-MISS-03: ANOMALY ALERT HELPER =====
async function insertPricingAlert(supabase: any, rule: any, alertType: string, message: string) {
  try {
    // Rate-limit: max 1 alert per rule per 15 minutes
    const { data: recentAlerts } = await supabase
      .from("terminal_notifications")
      .select("id")
      .eq("notification_type", "pricing_anomaly")
      .like("message", `%${rule.id}%`)
      .gte("created_at", new Date(Date.now() - 15 * 60000).toISOString())
      .limit(1);

    if (recentAlerts && recentAlerts.length > 0) return;

    await supabase.from("terminal_notifications").insert({
      notification_type: "pricing_anomaly",
      title: `Pricing Alert: ${alertType.replace(/_/g, " ")}`,
      message: `[${rule.id}] ${message}`,
      severity: alertType === "auto_paused" ? "critical" : "warning",
      is_active: true,
    });
  } catch (e) {
    console.error("[alert] Failed to insert pricing alert:", e);
  }
}

async function applyRestingPriceMultiAsset(rule: any, excludedSet: Set<string>, supabase: any) {
  const assetsToProcess: string[] = (rule.assets && rule.assets.length > 0) ? rule.assets : [rule.asset];
  const assetConfig: Record<string, any> = rule.asset_config || {};
  const binanceAdsUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/binance-ads`;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Skip resting price application in dry-run mode
  if (rule.is_dry_run) {
    console.log(`[DRY-RUN] ${rule.name}: would apply resting price/ratio (skipped)`);
    return;
  }

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
  const BINANCE_PROXY_URL = Deno.env.get("BINANCE_PROXY_URL");
  const BINANCE_API_KEY = Deno.env.get("BINANCE_API_KEY");
  if (BINANCE_PROXY_URL) {
    try {
      const headers: Record<string, string> = {};
      if (BINANCE_API_KEY) headers["X-MBX-APIKEY"] = BINANCE_API_KEY;
      const resp = await fetch(`${BINANCE_PROXY_URL}/api/v3/ticker/price?symbol=${asset}USDT`, { headers });
      const text = await resp.text();
      console.log(`[fetchCoinUsdtRate] Proxy raw response for ${asset}USDT: ${text.substring(0, 200)}`);
      const data = JSON.parse(text);
      const price = parseFloat(data.price || "0");
      if (price > 0) {
        console.log(`[fetchCoinUsdtRate] ${asset}USDT = ${price} (proxy)`);
        return price;
      }
    } catch (e) {
      console.error(`[fetchCoinUsdtRate] Proxy failed for ${asset}:`, e);
    }
  }

  try {
    const resp = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${asset}USDT`);
    const data = await resp.json();
    const price = parseFloat(data.price || "0");
    if (price > 0) {
      console.log(`[fetchCoinUsdtRate] ${asset}USDT = ${price} (direct)`);
      return price;
    }
    console.warn(`[fetchCoinUsdtRate] Direct API returned no price for ${asset}:`, JSON.stringify(data).substring(0, 200));
  } catch (e) {
    console.error(`[fetchCoinUsdtRate] Direct API failed for ${asset}:`, e);
  }

  return 0;
}

async function fetchUsdtInr(supabase: any): Promise<number> {
  // PRIMARY: CoinGecko USDT/INR — gives actual crypto USDT/INR rate (closest to Binance index)
  try {
    const cgResp = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=inr",
      { headers: { Accept: "application/json" } }
    );
    const cgData = await cgResp.json();
    if (cgData?.tether?.inr && cgData.tether.inr > 70) {
      console.log(`[fetchUsdtInr] USDT/INR (CoinGecko primary): ${cgData.tether.inr}`);
      return cgData.tether.inr;
    }
  } catch (e) {
    console.error("[fetchUsdtInr] CoinGecko failed:", e);
  }

  // FALLBACK 1: Coinbase USDT exchange rate
  try {
    const cbResp = await fetch("https://api.coinbase.com/v2/exchange-rates?currency=USDT");
    const cbData = await cbResp.json();
    const inrRate = parseFloat(cbData?.data?.rates?.INR || "0");
    if (inrRate > 70) {
      console.log(`[fetchUsdtInr] USDT/INR (Coinbase fallback): ${inrRate}`);
      return inrRate;
    }
  } catch (e) {
    console.error("[fetchUsdtInr] Coinbase failed:", e);
  }

  // FALLBACK 2: USD/INR forex (less accurate for USDT but still reasonable)
  try {
    const resp = await fetch("https://open.er-api.com/v6/latest/USD");
    const data = await resp.json();
    if (data?.result === "success" && data?.rates?.INR && data.rates.INR > 70) {
      console.log(`[fetchUsdtInr] USD/INR forex fallback (er-api): ${data.rates.INR}`);
      return data.rates.INR;
    }
  } catch (e) {
    console.error("[fetchUsdtInr] er-api failed:", e);
  }

  // FALLBACK 3: Frankfurter forex
  try {
    const resp = await fetch("https://api.frankfurter.app/latest?from=USD&to=INR");
    const data = await resp.json();
    if (data?.rates?.INR && data.rates.INR > 70) {
      console.log(`[fetchUsdtInr] USD/INR forex fallback (frankfurter): ${data.rates.INR}`);
      return data.rates.INR;
    }
  } catch (e) {
    console.error("[fetchUsdtInr] frankfurter failed:", e);
  }

  return 91;
}

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

  const adData = result?.data?.data || result?.data;
  if (!adData) return null;

  const price = parseFloat(adData.price || adData.adDetailResp?.price || "0");
  const ratio = parseFloat(adData.priceFloatingRatio || adData.adDetailResp?.priceFloatingRatio || "0");
  const priceType = adData.priceType ?? adData.adDetailResp?.priceType;

  if (priceType === 2 && ratio > 0 && price > 0) {
    const index = price / (ratio / 100);
    console.log(`[inferBinanceIndex] Ad ${adNo}: price=${price}, ratio=${ratio}, inferred index=${index.toFixed(2)}`);
    return index;
  }

  console.log(`[inferBinanceIndex] Ad ${adNo}: priceType=${priceType}, cannot infer index`);
  return null;
}
