import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/system-action-logger";

/**
 * Standalone function to sync spot trades from Binance API into spot_trade_history.
 * Can be called outside React component context (e.g., from universal sync).
 */
export async function syncSpotTradesFromBinance(): Promise<{ synced: number }> {
  const { data: latestTrade } = await supabase
    .from("spot_trade_history")
    .select("trade_time")
    .not("binance_trade_id", "is", null)
    .order("trade_time", { ascending: false })
    .limit(1)
    .single();

  const startTime = latestTrade?.trade_time
    ? Number(latestTrade.trade_time) + 1
    : undefined;

  const { data, error } = await supabase.functions.invoke("binance-assets", {
    body: { action: "getMyTrades", startTime },
  });

  if (error || !data?.success) {
    throw new Error(error?.message || data?.error || "Spot trade sync failed");
  }

  const trades = data.data as any[];
  if (!trades?.length) return { synced: 0 };

  const rows = trades.map((t: any) => ({
    binance_trade_id: String(t.id),
    binance_order_id: String(t.orderId),
    symbol: t.symbol,
    side: t.isBuyer ? "BUY" : "SELL",
    quantity: parseFloat(t.qty || "0"),
    executed_price: parseFloat(t.price || "0"),
    quote_quantity: parseFloat(t.quoteQty || "0"),
    commission: parseFloat(t.commission || "0"),
    commission_asset: t.commissionAsset || null,
    is_buyer: t.isBuyer,
    is_maker: t.isMaker,
    trade_time: t.time,
    status: "FILLED" as const,
    execution_method: "SPOT" as const,
    source: "binance_app" as const,
  }));

  // Enrich terminal trades with commission data
  const orderIds = [...new Set(rows.map((r) => r.binance_order_id))];
  const { data: terminalTrades } = await supabase
    .from("spot_trade_history")
    .select("binance_order_id, binance_trade_id")
    .eq("source", "terminal")
    .in("binance_order_id", orderIds);

  const terminalOrderIds = new Set(
    (terminalTrades || []).map((t) => t.binance_order_id)
  );

  for (const tt of terminalTrades || []) {
    const matchingRows = rows.filter((r) => r.binance_order_id === tt.binance_order_id);
    if (matchingRows.length > 0) {
      const totalCommission = matchingRows.reduce((sum, r) => sum + (r.commission || 0), 0);
      const commissionAsset = matchingRows.find((r) => r.commission_asset)?.commission_asset || null;
      const firstRow = matchingRows[0];
      await supabase
        .from("spot_trade_history")
        .update({
          binance_trade_id: firstRow.binance_trade_id,
          commission: totalCommission,
          commission_asset: commissionAsset,
          is_buyer: firstRow.is_buyer,
          is_maker: firstRow.is_maker,
        })
        .eq("binance_order_id", tt.binance_order_id)
        .eq("source", "terminal");
    }
  }

  const newRows = rows.filter((r) => !terminalOrderIds.has(r.binance_order_id));

  const CHUNK_SIZE = 50;
  for (let i = 0; i < newRows.length; i += CHUNK_SIZE) {
    const chunk = newRows.slice(i, i + CHUNK_SIZE);
    await supabase
      .from("spot_trade_history")
      .upsert(chunk, {
        onConflict: "binance_trade_id,symbol",
        ignoreDuplicates: true,
      });
  }

  return { synced: rows.length };
}

/**
 * Standalone function to sync unsynced spot trades into erp_product_conversions.
 * Automatically picks the first active wallet if available.
 */
export async function syncSpotTradesToConversions(): Promise<{ inserted: number }> {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("User session not found");

  // Get first active wallet
  const { data: wallets } = await supabase
    .from("wallets")
    .select("id")
    .eq("is_active", true)
    .order("wallet_name")
    .limit(1);

  const walletId = wallets?.[0]?.id;
  if (!walletId) throw new Error("No active wallet found");

  // Fetch unsynced trades
  const cutoffDate = "2026-02-11T18:30:00Z";
  const { data: rawTrades, error: tradeErr } = await supabase
    .from("spot_trade_history")
    .select("id, symbol, side, quantity, executed_price, quote_quantity, commission, commission_asset, trade_time, source, status, is_buyer, created_at, binance_order_id")
    .eq("status", "FILLED")
    .gte("created_at", cutoffDate)
    .order("trade_time", { ascending: false });

  if (tradeErr) throw tradeErr;

  // Aggregate fills by binance_order_id
  const orderMap = new Map<string, any>();
  for (const t of rawTrades || []) {
    const key = t.binance_order_id || t.id;
    const existing = orderMap.get(key);
    if (!existing) {
      orderMap.set(key, { ...t, _fill_ids: [t.id] });
    } else {
      existing.quantity = (Number(existing.quantity) || 0) + (Number(t.quantity) || 0);
      existing.quote_quantity = (Number(existing.quote_quantity) || 0) + (Number(t.quote_quantity) || 0);
      existing.commission = (Number(existing.commission) || 0) + (Number(t.commission) || 0);
      if (!existing.commission_asset && t.commission_asset) existing.commission_asset = t.commission_asset;
      if (existing.quantity > 0) existing.executed_price = existing.quote_quantity / existing.quantity;
      existing._fill_ids.push(t.id);
      if (t.trade_time && (!existing.trade_time || t.trade_time < existing.trade_time)) {
        existing.trade_time = t.trade_time;
        existing.created_at = t.created_at;
      }
    }
  }
  const trades = Array.from(orderMap.values());

  // Check which are already synced
  const { data: synced } = await supabase
    .from("erp_product_conversions" as any)
    .select("spot_trade_id")
    .not("spot_trade_id", "is", null);

  const syncedTradeIds = new Set((synced || []).map((s: any) => s.spot_trade_id));

  const syncedOrderIds = new Set<string>();
  if (syncedTradeIds.size > 0) {
    const { data: syncedTrades } = await supabase
      .from("spot_trade_history")
      .select("binance_order_id")
      .in("id", Array.from(syncedTradeIds))
      .not("binance_order_id", "is", null);
    for (const st of syncedTrades || []) {
      if (st.binance_order_id) syncedOrderIds.add(st.binance_order_id);
    }
  }

  const unsyncedTrades = trades.filter((t: any) => {
    const fillIds: string[] = t._fill_ids || [t.id];
    return !fillIds.some((fid: string) => syncedTradeIds.has(fid)) &&
      !(t.binance_order_id && syncedOrderIds.has(t.binance_order_id));
  });

  if (unsyncedTrades.length === 0) return { inserted: 0 };

  const rows = unsyncedTrades.map((t: any) => {
    const assetCode = t.symbol.replace("USDT", "");
    const qty = Number(t.quantity) || 0;
    const price = Number(t.executed_price) || 0;
    const grossUsd = Number(t.quote_quantity) || qty * price;
    const commission = Number(t.commission) || 0;
    const side = t.is_buyer === true ? "BUY" : t.is_buyer === false ? "SELL" : t.side;
    const feeAsset = side === "BUY" ? assetCode : "USDT";
    const feePercentage = grossUsd > 0 ? (commission / (side === "BUY" ? qty : grossUsd)) * 100 : 0;
    const commissionAsset = t.commission_asset || (t.is_buyer === false ? "USDT" : assetCode);
    const netAssetChange = side === "BUY" ? qty - (commissionAsset === assetCode ? commission : 0) : qty;
    const netUsdtChange = side === "SELL" ? grossUsd - (commissionAsset === "USDT" ? commission : 0) : grossUsd;

    return {
      wallet_id: walletId,
      side,
      asset_code: assetCode,
      quantity: qty,
      price_usd: price,
      gross_usd_value: grossUsd,
      fee_percentage: feePercentage,
      fee_amount: commission,
      fee_asset: feeAsset,
      net_asset_change: netAssetChange,
      net_usdt_change: netUsdtChange,
      status: "PENDING_APPROVAL",
      created_by: userId,
      spot_trade_id: t.id,
      metadata: {
        source: "SPOT_TRADE_SYNC",
        binance_symbol: t.symbol,
        binance_order_id: t.binance_order_id || null,
        fill_ids: t._fill_ids || [t.id],
        trade_source: t.source,
        trade_time: t.trade_time,
      },
    };
  });

  // Delete rejected conversions for re-sync
  const spotTradeIds = rows.map(r => r.spot_trade_id).filter(Boolean);
  if (spotTradeIds.length > 0) {
    await supabase
      .from("erp_product_conversions" as any)
      .delete()
      .in("spot_trade_id", spotTradeIds)
      .eq("status", "REJECTED");
  }

  const CHUNK = 50;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("erp_product_conversions" as any)
      .insert(chunk);
    if (error) throw error;
    inserted += chunk.length;
  }

  return { inserted };
}
