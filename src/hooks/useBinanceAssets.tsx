import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logAdAction, AdActionTypes } from "@/hooks/useAdActionLog";

export interface AssetBalance {
  asset: string;
  funding_free: number;
  funding_locked: number;
  funding_freeze: number;
  spot_free: number;
  spot_locked: number;
  total_free: number;
  total_locked: number;
  total_balance: number;
}

export interface TickerPrice {
  symbol: string;
  price: string;
}

// Configured trading pairs (from P2P supported coins)
export const TRADING_PAIRS = [
  { symbol: "BTCUSDT", base: "BTC", quote: "USDT", name: "Bitcoin" },
  { symbol: "ETHUSDT", base: "ETH", quote: "USDT", name: "Ethereum" },
  { symbol: "BNBUSDT", base: "BNB", quote: "USDT", name: "BNB" },
  { symbol: "XRPUSDT", base: "XRP", quote: "USDT", name: "XRP" },
  { symbol: "SOLUSDT", base: "SOL", quote: "USDT", name: "Solana" },
  { symbol: "TRXUSDT", base: "TRX", quote: "USDT", name: "TRON" },
  { symbol: "SHIBUSDT", base: "SHIB", quote: "USDT", name: "SHIBA INU" },
  { symbol: "TONUSDT", base: "TON", quote: "USDT", name: "Toncoin" },
  { symbol: "USDCUSDT", base: "USDC", quote: "USDT", name: "USDC" },
  { symbol: "FDUSDUSDT", base: "FDUSD", quote: "USDT", name: "First Digital USD" },
];

export const COIN_COLORS: Record<string, string> = {
  USDT: "#26A17B",
  BTC: "#F7931A",
  ETH: "#627EEA",
  BNB: "#F3BA2F",
  XRP: "#23292F",
  SOL: "#9945FF",
  TRX: "#FF0013",
  SHIB: "#FFA409",
  TON: "#0098EA",
  USDC: "#2775CA",
  FDUSD: "#4A90D9",
};

export function useBinanceBalances() {
  return useQuery({
    queryKey: ["binance_asset_balances"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("binance-assets", {
        body: { action: "getBalances" },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to fetch balances");
      const EXCLUDED_ASSETS = ["HOME"];
      return (data.data.balances as AssetBalance[]).filter(
        (b) => !EXCLUDED_ASSETS.includes(b.asset)
      );
    },
    refetchInterval: 15000,
    staleTime: 5000,
  });
}

export function useBinanceTickerPrices() {
  return useQuery({
    queryKey: ["binance_ticker_prices"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("binance-assets", {
        body: { action: "getTickerPrice" },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to fetch prices");
      return data.data as TickerPrice[];
    },
    refetchInterval: 10000,
    staleTime: 3000,
  });
}

export function useExecuteTrade() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      symbol: string;
      side: "BUY" | "SELL";
      quantity?: string;
      quoteOrderQty?: string;
      transferAsset: string;
    }) => {
      // 1. Log trade attempt
      const { data: logData } = await supabase
        .from("spot_trade_history")
        .insert({
          symbol: params.symbol,
          side: params.side,
          quantity: parseFloat(params.quantity || params.quoteOrderQty || "0"),
          status: "PENDING",
          execution_method: "SPOT",
          binance_trade_id: `pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        })
        .select("id")
        .single();

      const tradeId = logData?.id;

      // 2. Execute via edge function (auto-transfers from funding if needed)
      const { data, error } = await supabase.functions.invoke("binance-assets", {
        body: {
          action: "executeTradeWithTransfer",
          ...params,
        },
      });

      if (error) {
        // Extract actual error message from edge function response
        let errMsg = error.message;
        try {
          const ctx = await (error as any).context?.json?.();
          if (ctx?.error) errMsg = ctx.error;
        } catch { /* ignore */ }
        // Also check if data contains the error (supabase may put response body in data)
        if (!errMsg || errMsg === 'Edge Function returned a non-2xx status code') {
          errMsg = (data as any)?.error || error.message;
        }
        if (tradeId) {
          await supabase
            .from("spot_trade_history")
            .update({ status: "FAILED", error_message: errMsg })
            .eq("id", tradeId);
        }
        throw new Error(errMsg);
      }

      if (!data?.success) {
        const errMsg = data?.error || data?.data?.order?.msg || "Trade execution failed";
        if (tradeId) {
          await supabase
            .from("spot_trade_history")
            .update({ status: "FAILED", error_message: errMsg })
            .eq("id", tradeId);
        }
        throw new Error(errMsg);
      }

      const order = data.data.order;
      
      // Check if Binance returned an error in the order response
      if (order?.code && order.code < 0) {
        const errMsg = order.msg || `Binance error: ${order.code}`;
        if (tradeId) {
          await supabase
            .from("spot_trade_history")
            .update({ status: "FAILED", error_message: errMsg })
            .eq("id", tradeId);
        }
        throw new Error(errMsg);
      }

      // 3. Update trade log with results (handles both spot and convert responses)
      if (tradeId) {
        const executedQty = parseFloat(order?.executedQty || order?.toAmount || "0");
        const cummQuoteQty = parseFloat(order?.cummulativeQuoteQty || order?.fromAmount || "0");
        const avgPrice = order?.ratio ? parseFloat(order.ratio) : (executedQty > 0 ? cummQuoteQty / executedQty : 0);
        const orderStatus = order?.status || order?.orderStatus || "FILLED";

        await supabase
          .from("spot_trade_history")
          .update({
            status: orderStatus === "FILLED" || orderStatus === "SUCCESS" || orderStatus === "ACCEPT_SUCCESS" ? "FILLED" : "PARTIAL",
            binance_order_id: String(order?.orderId || ""),
            executed_price: avgPrice,
            quantity: executedQty,
            quote_quantity: cummQuoteQty,
            funding_transfer_done: data.data.fundingTransferred,
          })
          .eq("id", tradeId);
      }

      return data.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["binance_asset_balances"] });
      queryClient.invalidateQueries({ queryKey: ["spot_trade_history"] });
      toast.success("Trade executed successfully");
      logAdAction({
        actionType: AdActionTypes.SPOT_TRADE_EXECUTED,
        adDetails: { symbol: variables.symbol, side: variables.side, quantity: variables.quantity || variables.quoteOrderQty, transferAsset: variables.transferAsset },
        metadata: { orderId: data?.order?.orderId, executedQty: data?.order?.executedQty, price: data?.order?.price },
      });
    },
    onError: (error: Error, variables) => {
      toast.error(`Trade failed: ${error.message}`);
      logAdAction({
        actionType: AdActionTypes.SPOT_TRADE_FAILED,
        adDetails: { symbol: variables.symbol, side: variables.side, quantity: variables.quantity || variables.quoteOrderQty },
        metadata: { error: error.message },
      });
    },
  });
}

export function useSpotTradeHistory() {
  return useQuery({
    queryKey: ["spot_trade_history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("spot_trade_history")
        .select("*")
        .order("trade_time", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });
}
