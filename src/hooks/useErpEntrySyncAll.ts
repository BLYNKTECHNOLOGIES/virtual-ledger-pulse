import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { syncOrderHistoryFromBinance } from "@/hooks/useBinanceOrderSync";
import { syncCompletedBuyOrders } from "@/hooks/useTerminalPurchaseSync";
import { syncCompletedSellOrders } from "@/hooks/useTerminalSalesSync";
import { syncSpotTradesFromBinance, syncSpotTradesToConversions } from "@/hooks/useSpotTradeSyncStandalone";
import { syncSmallBuys } from "@/hooks/useSmallBuysSync";
import { syncSmallSales } from "@/hooks/useSmallSalesSync";
import { toast } from "@/hooks/use-toast";

/**
 * Sync All — explicitly EXCLUDES small buys / small sales sync.
 * Small batches are produced only via the dedicated "Sync Small …" buttons.
 */
export function useSyncAll() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const results = await Promise.allSettled([
        supabase.functions.invoke("binance-assets", {
          body: { action: "syncAssetMovements", force: true },
        }),
        supabase.functions.invoke("binance-assets", {
          body: { action: "checkNewMovements" },
        }),
        (async () => {
          await syncOrderHistoryFromBinance({ fullSync: false, forceGapFill: true });
          const buyResult = await syncCompletedBuyOrders();
          const sellResult = await syncCompletedSellOrders();
          return { buyResult, sellResult };
        })(),
        (async () => {
          await syncSpotTradesFromBinance();
          return syncSpotTradesToConversions();
        })(),
      ]);
      return results;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["erp-entry-feed"] });
      qc.invalidateQueries({ queryKey: ["erp_action_queue"] });
      qc.invalidateQueries({ queryKey: ["terminal-purchase-sync"] });
      qc.invalidateQueries({ queryKey: ["terminal-sales-sync"] });
      qc.invalidateQueries({ queryKey: ["cached-order-history"] });
      qc.invalidateQueries({ queryKey: ["binance-sync-metadata"] });
      qc.invalidateQueries({ queryKey: ["erp_conversions"] });
      toast({ title: "Sync complete", description: "All entry sources refreshed." });
    },
    onError: (err: any) => {
      toast({ title: "Sync failed", description: err?.message || "Unknown error", variant: "destructive" });
    },
  });
}

export function useSyncSmallBuys() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => syncSmallBuys({ operatorInitiated: true, source: 'erp_entry_small_menu' }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["erp-entry-feed"] });
      qc.invalidateQueries({ queryKey: ["small-buys-sync"] });
      toast({
        title: "Small Buys sync complete",
        description: res.synced
          ? `${res.synced} batch(es) created · ${res.duplicates} duplicate(s) skipped`
          : `No new small buys to group · ${res.duplicates} duplicate(s) skipped`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Small Buys sync failed", description: err?.message || "Unknown error", variant: "destructive" });
    },
  });
}

export function useSyncSmallSales() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => syncSmallSales({ operatorInitiated: true, source: 'erp_entry_small_menu' }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["erp-entry-feed"] });
      qc.invalidateQueries({ queryKey: ["small-sales-sync"] });
      toast({
        title: "Small Sales sync complete",
        description: res.synced
          ? `${res.synced} batch(es) created · ${res.duplicates} duplicate(s) skipped`
          : `No new small sales to group · ${res.duplicates} duplicate(s) skipped`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Small Sales sync failed", description: err?.message || "Unknown error", variant: "destructive" });
    },
  });
}
