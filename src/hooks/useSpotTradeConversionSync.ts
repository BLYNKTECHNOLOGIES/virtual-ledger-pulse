
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
  binance_order_id?: string | null;
  fill_ids?: string[];
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

      // Aggregate fills by binance_order_id — sum qty, quote_quantity, commission
      const orderMap = new Map<string, any>();
      for (const t of (rawTrades || [])) {
        const key = t.binance_order_id || t.id; // fallback to id if no binance_order_id
        const existing = orderMap.get(key);
        if (!existing) {
          orderMap.set(key, { ...t, _fill_ids: [t.id] });
        } else {
          // Aggregate: sum quantities, quote_quantity, commission
          existing.quantity = (Number(existing.quantity) || 0) + (Number(t.quantity) || 0);
          existing.quote_quantity = (Number(existing.quote_quantity) || 0) + (Number(t.quote_quantity) || 0);
          existing.commission = (Number(existing.commission) || 0) + (Number(t.commission) || 0);
          // Keep the commission_asset from whichever has it
          if (!existing.commission_asset && t.commission_asset) {
            existing.commission_asset = t.commission_asset;
          }
          // Recalculate executed_price as weighted average
          if (existing.quantity > 0) {
            existing.executed_price = existing.quote_quantity / existing.quantity;
          }
          // Track all fill IDs for sync checking
          existing._fill_ids.push(t.id);
          // Prefer earlier trade_time
          if (t.trade_time && (!existing.trade_time || t.trade_time < existing.trade_time)) {
            existing.trade_time = t.trade_time;
            existing.created_at = t.created_at;
          }
        }
      }
      const trades = Array.from(orderMap.values());

      // Get already synced trade IDs and their binance_order_ids
      const { data: synced, error: syncErr } = await supabase
        .from("erp_product_conversions" as any)
        .select("spot_trade_id")
        .not("spot_trade_id", "is", null);

      if (syncErr) throw syncErr;

      const syncedTradeIds = new Set((synced || []).map((s: any) => s.spot_trade_id));

      // Also look up binance_order_ids for synced trades to catch all fills of the same order
      const syncedOrderIds = new Set<string>();
      if (syncedTradeIds.size > 0) {
        const { data: syncedTrades } = await supabase
          .from("spot_trade_history")
          .select("binance_order_id")
          .in("id", Array.from(syncedTradeIds))
          .not("binance_order_id", "is", null);
        
        for (const st of (syncedTrades || [])) {
          if (st.binance_order_id) syncedOrderIds.add(st.binance_order_id);
        }
      }

      return trades.map((t: any) => {
        const fillIds: string[] = t._fill_ids || [t.id];
        const anySynced = fillIds.some((fid: string) => syncedTradeIds.has(fid)) ||
          (t.binance_order_id && syncedOrderIds.has(t.binance_order_id));
        const { _fill_ids, ...rest } = t;
        return { ...rest, fill_ids: fillIds, already_synced: anySynced } as SpotTradeForSync;
      });
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
            binance_order_id: t.binance_order_id || null,
            fill_ids: t.fill_ids || [t.id],
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
