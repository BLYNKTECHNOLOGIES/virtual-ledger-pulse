import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const PRIMARY_ACCOUNT_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Syncs spot trades from Binance API (/api/v3/myTrades) into spot_trade_history
 * for EVERY active exchange account (ASEC, Blynk, ...).
 *
 * Each account is fetched independently with its OWN cursor (latest trade_time
 * for that account). A shared/global cursor would let the busiest account starve
 * the others — which is exactly why ASEC vs Blynk conversions were going missing.
 * Runs once on mount and every 5 minutes. Deduplicates via binance_trade_id + symbol.
 */
export function useSpotTradeSync() {
  const queryClient = useQueryClient();
  const isSyncing = useRef(false);
  const [isManuallySyncing, setIsManuallySyncing] = useState(false);

  const syncAccount = useCallback(async (accountId: string) => {
    // Per-account cursor — only advance based on this account's own trades.
    const { data: latestTrade } = await supabase
      .from("spot_trade_history")
      .select("trade_time")
      .eq("exchange_account_id", accountId)
      .not("binance_trade_id", "is", null)
      .order("trade_time", { ascending: false })
      .limit(1)
      .maybeSingle();

    const startTime = latestTrade?.trade_time
      ? Number(latestTrade.trade_time) + 1
      : undefined;

    const { data, error } = await supabase.functions.invoke("binance-assets", {
      body: { action: "getMyTrades", startTime, exchange_account_id: accountId },
    });

    if (error || !data?.success) {
      console.warn(`Spot trade sync failed for account ${accountId}:`, error || data?.error);
      return;
    }

    const resolvedAccountId: string = data._resolvedExchangeAccountId || accountId;
    const trades = data.data as any[];
    if (!trades?.length) return;

    const rows = trades.map((t) => ({
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
      exchange_account_id: resolvedAccountId,
    }));

    // Enrich pre-existing terminal trades (same account) with commission data.
    const orderIds = [...new Set(rows.map((r) => r.binance_order_id))];
    const { data: terminalTrades } = await supabase
      .from("spot_trade_history")
      .select("binance_order_id, binance_trade_id")
      .eq("source", "terminal")
      .eq("exchange_account_id", resolvedAccountId)
      .in("binance_order_id", orderIds);

    const terminalOrderIds = new Set((terminalTrades || []).map((t) => t.binance_order_id));

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
      const { error: upsertError } = await supabase
        .from("spot_trade_history")
        .upsert(chunk, {
          onConflict: "binance_trade_id,symbol",
          ignoreDuplicates: true,
        });

      if (upsertError) {
        console.warn("Spot trade upsert error:", upsertError);
      }
    }
  }, []);

  const sync = useCallback(async (manual = false) => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    if (manual) setIsManuallySyncing(true);

    try {
      // Resolve every active exchange account; fall back to the primary account.
      const { data: accounts } = await supabase
        .from("terminal_exchange_accounts")
        .select("id")
        .eq("is_active", true);

      const accountIds = (accounts || []).map((a: any) => a.id);
      if (accountIds.length === 0) accountIds.push(PRIMARY_ACCOUNT_ID);

      for (const accountId of accountIds) {
        try {
          await syncAccount(accountId);
        } catch (e) {
          console.warn(`Spot trade sync error for account ${accountId}:`, e);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["spot_trade_history"] });
      queryClient.invalidateQueries({ queryKey: ["spot_trades_for_conversion_sync"] });
    } catch (err) {
      console.error("Spot trade sync error:", err);
    } finally {
      isSyncing.current = false;
      if (manual) setIsManuallySyncing(false);
    }
  }, [queryClient, syncAccount]);

  useEffect(() => {
    sync();
    const interval = setInterval(() => sync(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [sync]);

  const manualSync = useCallback(() => sync(true), [sync]);

  return { manualSync, isManuallySyncing };
}
