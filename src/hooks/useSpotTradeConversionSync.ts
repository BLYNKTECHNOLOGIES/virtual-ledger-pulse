
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/system-action-logger";
import { toast } from "@/hooks/use-toast";

export interface SpotTradeForSync {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  executed_price: number;
  quote_quantity: number;
  commission: number | null;
  commission_asset: string | null;
  trade_time: number | null;
  source: string;
  status: string;
  is_buyer: boolean | null;
  created_at: string;
  already_synced?: boolean;
}

/**
 * Fetches FILLED spot trades that haven't been synced to ERP conversions yet.
 */
export function useUnsyncedSpotTrades() {
  return useQuery({
    queryKey: ["spot_trades_for_conversion_sync"],
    queryFn: async () => {
      // Get all FILLED spot trades from 12 Feb 2026 onwards
      // 12 Feb 2026 00:00 IST = 11 Feb 2026 18:30 UTC
      const cutoffDate = "2026-02-11T18:30:00Z";
      const { data: rawTrades, error: tradeErr } = await supabase
        .from("spot_trade_history")
        .select("id, symbol, side, quantity, executed_price, quote_quantity, commission, commission_asset, trade_time, source, status, is_buyer, created_at, binance_order_id")
        .eq("status", "FILLED")
        .gte("created_at", cutoffDate)
        .order("trade_time", { ascending: false });

      if (tradeErr) throw tradeErr;

      // Deduplicate by binance_order_id — prefer the record with commission data (binance_app source)
      const orderMap = new Map<string, any>();
      for (const t of (rawTrades || [])) {
        const key = t.binance_order_id || t.id; // fallback to id if no binance_order_id
        const existing = orderMap.get(key);
        if (!existing) {
          orderMap.set(key, t);
        } else {
          // Prefer the one with commission data
          if (t.commission != null && t.commission > 0 && (!existing.commission || existing.commission === 0)) {
            orderMap.set(key, t);
          }
        }
      }
      const trades = Array.from(orderMap.values());

      // Get already synced trade IDs
      const { data: synced, error: syncErr } = await supabase
        .from("erp_product_conversions" as any)
        .select("spot_trade_id")
        .not("spot_trade_id", "is", null);

      if (syncErr) throw syncErr;

      const syncedIds = new Set((synced || []).map((s: any) => s.spot_trade_id));

      return trades.map((t: any) => ({
        ...t,
        already_synced: syncedIds.has(t.id),
      })) as SpotTradeForSync[];
    },
  });
}

/**
 * Syncs all unsynced FILLED spot trades into erp_product_conversions as PENDING_APPROVAL.
 */
export function useSyncSpotTradesToConversions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ walletId, trades }: { walletId: string; trades: SpotTradeForSync[] }) => {
      const userId = getCurrentUserId();
      if (!userId) throw new Error("User session not found");

      const unsyncedTrades = trades.filter(t => !t.already_synced);
      if (unsyncedTrades.length === 0) {
        throw new Error("No new trades to sync");
      }

      const rows = unsyncedTrades.map((t) => {
        // Extract asset code from symbol (e.g., BTCUSDT -> BTC)
        const assetCode = t.symbol.replace("USDT", "");
        const qty = Number(t.quantity) || 0;
        const price = Number(t.executed_price) || 0;
        const grossUsd = Number(t.quote_quantity) || qty * price;
        const commission = Number(t.commission) || 0;
        const commissionAsset = t.commission_asset || (t.is_buyer === false ? "USDT" : assetCode);

        // Determine side: is_buyer=true means BUY, is_buyer=false means SELL
        // Fallback to t.side field
        const side = t.is_buyer === true ? "BUY" : t.is_buyer === false ? "SELL" : t.side;

        // For BUY: fee is in asset, net_asset = qty - commission, net_usdt = grossUsd
        // For SELL: fee is in USDT, net_asset = qty, net_usdt = grossUsd - commission
        const feeAmount = commission;
        const feeAsset = side === "BUY" ? assetCode : "USDT";
        const feePercentage = grossUsd > 0 ? (commission / (side === "BUY" ? qty : grossUsd)) * 100 : 0;
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
          fee_amount: feeAmount,
          fee_asset: feeAsset,
          net_asset_change: netAssetChange,
          net_usdt_change: netUsdtChange,
          status: "PENDING_APPROVAL",
          created_by: userId,
          spot_trade_id: t.id,
          metadata: {
            source: "SPOT_TRADE_SYNC",
            binance_symbol: t.symbol,
            trade_source: t.source,
            trade_time: t.trade_time,
          },
        };
      });

      // Insert in chunks to avoid payload limits
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
    },
    onSuccess: ({ inserted }) => {
      queryClient.invalidateQueries({ queryKey: ["erp_conversions"] });
      queryClient.invalidateQueries({ queryKey: ["spot_trades_for_conversion_sync"] });
      toast({ title: "Sync Complete", description: `${inserted} spot trade(s) imported as pending conversions.` });
    },
    onError: (error: any) => {
      toast({ title: "Sync Failed", description: error.message, variant: "destructive" });
    },
  });
}
