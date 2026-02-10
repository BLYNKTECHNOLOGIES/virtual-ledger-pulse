import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
      return data.data.balances as AssetBalance[];
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
        if (tradeId) {
          await supabase
            .from("spot_trade_history")
            .update({ status: "FAILED", error_message: error.message })
            .eq("id", tradeId);
        }
        throw error;
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

      // 3. Update trade log with results
      if (tradeId) {
        const executedQty = parseFloat(order?.executedQty || "0");
        const cummQuoteQty = parseFloat(order?.cummulativeQuoteQty || "0");
        const avgPrice = executedQty > 0 ? cummQuoteQty / executedQty : 0;

        await supabase
          .from("spot_trade_history")
          .update({
            status: order?.status === "FILLED" ? "FILLED" : "PARTIAL",
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["binance_asset_balances"] });
      queryClient.invalidateQueries({ queryKey: ["spot_trade_history"] });
      toast.success("Trade executed successfully");
    },
    onError: (error: Error) => {
      toast.error(`Trade failed: ${error.message}`);
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
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });
}
