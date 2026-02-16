import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Syncs spot trades from Binance API (/api/v3/myTrades) into spot_trade_history.
 * Runs once on mount and every 5 minutes. Deduplicates via binance_trade_id + symbol unique index.
 */
export function useSpotTradeSync() {
  const queryClient = useQueryClient();
  const isSyncing = useRef(false);

  useEffect(() => {
    const sync = async () => {
      if (isSyncing.current) return;
      isSyncing.current = true;

      try {
        // Find most recent synced trade time to do incremental sync
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
          console.warn("Spot trade sync failed:", error || data?.error);
          return;
        }

        const trades = data.data as any[];
        if (!trades?.length) return;

        // Batch upsert trades into DB
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
        }));

        // Check for existing terminal trades by binance_order_id so we don't overwrite their source
        const orderIds = [...new Set(rows.map((r) => r.binance_order_id))];
        const { data: terminalTrades } = await supabase
          .from("spot_trade_history")
          .select("binance_order_id, binance_trade_id")
          .eq("source", "terminal")
          .in("binance_order_id", orderIds);

        const terminalOrderIds = new Set(
          (terminalTrades || []).map((t) => t.binance_order_id)
        );

        // For terminal trades: update their binance_trade_id so future syncs skip them via dedup
        for (const tt of terminalTrades || []) {
          const matchingRow = rows.find((r) => r.binance_order_id === tt.binance_order_id);
          if (matchingRow && tt.binance_trade_id !== matchingRow.binance_trade_id) {
            await supabase
              .from("spot_trade_history")
              .update({
                binance_trade_id: matchingRow.binance_trade_id,
                commission: matchingRow.commission,
                commission_asset: matchingRow.commission_asset,
                is_buyer: matchingRow.is_buyer,
                is_maker: matchingRow.is_maker,
              })
              .eq("binance_order_id", tt.binance_order_id)
              .eq("source", "terminal");
          }
        }

        // Filter out trades that belong to terminal-sourced orders
        const newRows = rows.filter((r) => !terminalOrderIds.has(r.binance_order_id));

        // Upsert only non-terminal trades
        const CHUNK_SIZE = 50;
        for (let i = 0; i < newRows.length; i += CHUNK_SIZE) {
          const chunk = newRows.slice(i, i + CHUNK_SIZE);
          const { error: upsertError } = await supabase
            .from("spot_trade_history")
            .upsert(chunk, { 
              onConflict: "binance_trade_id,symbol",
              ignoreDuplicates: true 
            });
          
          if (upsertError) {
            console.warn("Spot trade upsert error:", upsertError);
          }
        }

        queryClient.invalidateQueries({ queryKey: ["spot_trade_history"] });
        console.log(`✅ Synced ${rows.length} spot trades from Binance`);
      } catch (err) {
        console.error("Spot trade sync error:", err);
      } finally {
        isSyncing.current = false;
      }
    };

    // Initial sync
    sync();

    // Periodic sync every 5 minutes
    const interval = setInterval(sync, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [queryClient]);
}
