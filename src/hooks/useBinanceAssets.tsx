import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { withActiveAccount } from "@/lib/activeExchangeAccount";
import { useExchangeAccount } from "@/contexts/ExchangeAccountContext";
import { toast } from "sonner";
import { logAdAction, AdActionTypes } from "@/hooks/useAdActionLog";
import type { SymbolRules } from "@/components/terminal/assets/tradeRules";

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
  const { accountsToQuery } = useExchangeAccount();
  const EXCLUDED_ASSETS = ["HOME"];

  const fetchForAccount = async (accountId: string): Promise<AssetBalance[]> => {
    const { data, error } = await supabase.functions.invoke("binance-assets", {
      body: withActiveAccount({ action: "getBalances", exchange_account_id: accountId }),
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || "Failed to fetch balances");
    return (data.data.balances as AssetBalance[]).filter((b) => !EXCLUDED_ASSETS.includes(b.asset));
  };

  return useQuery({
    queryKey: ["binance_asset_balances", accountsToQuery.join(",")],
    queryFn: async () => {
      // Single account → as-is. Multiple → sum per asset across accounts and
      // attach a per-account breakdown for tooltips/expanders.
      if (accountsToQuery.length === 1) {
        return fetchForAccount(accountsToQuery[0]);
      }
      const settled = await Promise.allSettled(
        accountsToQuery.map((id) => fetchForAccount(id).then((rows) => ({ id, rows }))),
      );
      const byAsset = new Map<string, AssetBalance & { _accounts?: { accountId: string; total_balance: number }[] }>();
      for (const res of settled) {
        if (res.status !== "fulfilled") continue;
        const { id, rows } = res.value;
        for (const b of rows) {
          const existing = byAsset.get(b.asset);
          if (!existing) {
            byAsset.set(b.asset, {
              ...b,
              _accounts: [{ accountId: id, total_balance: b.total_balance }],
            });
          } else {
            existing.funding_free += b.funding_free;
            existing.funding_locked += b.funding_locked;
            existing.funding_freeze += b.funding_freeze;
            existing.spot_free += b.spot_free;
            existing.spot_locked += b.spot_locked;
            existing.total_free += b.total_free;
            existing.total_locked += b.total_locked;
            existing.total_balance += b.total_balance;
            existing._accounts = [...(existing._accounts || []), { accountId: id, total_balance: b.total_balance }];
          }
        }
      }
      return Array.from(byAsset.values());
    },
    refetchInterval: 30000,
    staleTime: 10000,
  });
}

/**
 * Fetches live Binance balances (funding + spot combined) for every wallet that
 * is API-linked via an active `terminal_wallet_links` row, keyed by wallet_id.
 *
 * Used by the Asset Inventory view to show the subtle difference between the
 * real exchange balance and the ERP ledger balance per wallet. This is a
 * reference-only read — it does NOT patch/mutate ERP balances. Refreshes every
 * 15 minutes rather than constantly to keep API usage low.
 */
export function useBinanceBalancesByWallet() {
  const EXCLUDED_ASSETS = ["HOME"];

  const fetchForAccount = async (accountId: string): Promise<AssetBalance[]> => {
    const { data, error } = await supabase.functions.invoke("binance-assets", {
      body: { action: "getBalances", exchange_account_id: accountId },
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || "Failed to fetch balances");
    return (data.data.balances as AssetBalance[]).filter((b) => !EXCLUDED_ASSETS.includes(b.asset));
  };

  return useQuery({
    queryKey: ["binance_balances_by_wallet"],
    queryFn: async () => {
      // Active wallet↔account links (e.g. BINANCE BLYNK, BINANCE ASEC).
      const { data: links, error } = await supabase
        .from("terminal_wallet_links")
        .select("wallet_id, exchange_account_id")
        .eq("status", "active");
      if (error) throw error;

      const result: Record<string, Record<string, number>> = {};
      await Promise.all(
        (links || [])
          .filter((l) => l.wallet_id && l.exchange_account_id)
          .map(async (l) => {
            try {
              const rows = await fetchForAccount(l.exchange_account_id as string);
              const byAsset: Record<string, number> = {};
              for (const b of rows) byAsset[b.asset] = b.total_balance;
              result[l.wallet_id as string] = byAsset;
            } catch {
              /* skip accounts that fail; keep others usable */
            }
          }),
      );
      return result;
    },
    // Reference data — refresh every 15 minutes, no aggressive polling.
    refetchInterval: 15 * 60 * 1000,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}


/**
 * Prices for the Assets page. Pass the symbols the page needs (F11): the edge
 * function returns only those, filtered server-side so an unknown symbol can't
 * break the call. Without symbols it keeps the old full-list behaviour.
 */
export function useBinanceTickerPrices(symbols?: string[]) {
  const list = symbols ? [...new Set(symbols)].sort() : null;
  return useQuery({
    queryKey: ["binance_ticker_prices", list ? list.join(",") : "all"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("binance-assets", {
        body: list ? { action: "getTickerPrice", symbols: list } : withActiveAccount({ action: "getTickerPrice" }),
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to fetch prices");
      return data.data as TickerPrice[];
    },
    enabled: !list || list.length > 0,
    refetchInterval: 20000,
    staleTime: 8000,
  });
}

/** Symbols the Assets page prices: the 10 trading pairs plus <coin>USDT for held coins. */
export function assetPageSymbols(heldAssets: string[]): string[] {
  const set = new Set<string>(TRADING_PAIRS.map((p) => p.symbol));
  for (const a of heldAssets) if (a && a !== "USDT") set.add(`${a}USDT`);
  return [...set];
}

/** F3 — Binance's live LOT_SIZE / MARKET_LOT_SIZE / NOTIONAL rules for the trading pairs (cached ~1 h). */
export function useSymbolRules() {
  return useQuery({
    queryKey: ["binance_symbol_rules"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("binance-assets", {
        body: { action: "getSymbolRules", symbols: TRADING_PAIRS.map((p) => p.symbol) },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to load Binance trading rules");
      return data.data as Record<string, SymbolRules>;
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/** Balances of ONE account (used for trading so Available/Max match the order's account). */
export function useAccountBalances(accountId: string | null | undefined) {
  return useQuery({
    // Same key shape as useBinanceBalances in single-account view, so the cache is shared.
    queryKey: ["binance_asset_balances", accountId || ""],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("binance-assets", {
        body: { action: "getBalances", exchange_account_id: accountId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to fetch balances");
      return (data.data.balances as AssetBalance[]).filter((b) => b.asset !== "HOME");
    },
    enabled: !!accountId,
    refetchInterval: 30000,
    staleTime: 10000,
  });
}

/**
 * F5c — sync deposits/withdrawals/transfers/Pay for EVERY active Binance account
 * (each with its own cursor), then the caller may run checkNewMovements once.
 */
export async function syncAssetMovementsAllAccounts(force = false) {
  const { data: accts, error } = await supabase
    .from("terminal_exchange_accounts")
    .select("id, account_name")
    .eq("is_active", true);
  if (error) throw error;
  const results: { accountId: string; accountName: string; ok: boolean; data?: any; error?: string }[] = [];
  for (const a of accts || []) {
    const { data, error: e } = await supabase.functions.invoke("binance-assets", {
      body: { action: "syncAssetMovements", force, exchange_account_id: a.id },
    });
    results.push({ accountId: a.id, accountName: a.account_name, ok: !e && data?.success !== false, data: data?.data, error: e?.message || data?.error });
  }
  return results;
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
      /** F5 — the account the operator chose; sent explicitly and stamped on the log row. */
      exchangeAccountId: string;
    }) => {
      if (!params.exchangeAccountId) throw new Error("Choose the Binance account for this order.");
      // 1. Log trade attempt
      const { data: logData } = await supabase
        .from("spot_trade_history")
        .insert({
          symbol: params.symbol,
          side: params.side,
          quantity: parseFloat(params.quantity || params.quoteOrderQty || "0"),
          status: "PENDING",
          execution_method: "SPOT",
          source: "terminal",
          exchange_account_id: params.exchangeAccountId,
          binance_trade_id: `pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        })
        .select("id")
        .single();

      const tradeId = logData?.id;

      // 2. Execute via edge function (auto-transfers from funding if needed)
      const { data, error } = await supabase.functions.invoke("binance-assets", {
        body: {
          action: "executeTradeWithTransfer",
          symbol: params.symbol,
          side: params.side,
          quantity: params.quantity,
          quoteOrderQty: params.quoteOrderQty,
          transferAsset: params.transferAsset,
          exchange_account_id: params.exchangeAccountId,
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

        // Extract commission from fills array (Binance returns an array of partial fills)
        const fills = order?.fills || [];
        let totalCommission = 0;
        let commissionAsset: string | null = null;
        for (const fill of fills) {
          totalCommission += parseFloat(fill.commission || "0");
          if (!commissionAsset && fill.commissionAsset) {
            commissionAsset = fill.commissionAsset;
          }
        }

        await supabase
          .from("spot_trade_history")
          .update({
            status: orderStatus === "FILLED" || orderStatus === "SUCCESS" || orderStatus === "ACCEPT_SUCCESS" ? "FILLED" : "PARTIAL",
            binance_order_id: String(order?.orderId || ""),
            executed_price: avgPrice,
            quantity: executedQty,
            quote_quantity: cummQuoteQty,
            commission: totalCommission > 0 ? totalCommission : undefined,
            commission_asset: commissionAsset || undefined,
            funding_transfer_done: data.data.fundingTransferred,
          })
          .eq("id", tradeId);
      }

      return data.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["binance_asset_balances"] });
      queryClient.invalidateQueries({ queryKey: ["spot_trade_history"] });
      const moved = Number(data?.fundingMovedAmount || 0);
      toast.success(
        moved > 0
          ? `Trade executed — ${data.fundingMovedAmount} ${data.fundingMovedAsset} moved from Funding to Spot first`
          : "Trade executed successfully",
      );
      logAdAction({
        actionType: AdActionTypes.SPOT_TRADE_EXECUTED,
        adDetails: { symbol: variables.symbol, side: variables.side, quantity: variables.quantity || variables.quoteOrderQty, transferAsset: variables.transferAsset },
        metadata: { orderId: data?.order?.orderId, executedQty: data?.order?.executedQty, price: data?.order?.price, exchangeAccountId: variables.exchangeAccountId, fundingMovedAmount: data?.fundingMovedAmount },
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

/**
 * F5b — follows the account switcher. One account → only its rows. All accounts →
 * every row (including the few old failed rows that carry no account).
 */
export function useSpotTradeHistory() {
  const { accountsToQuery, isAllAccounts } = useExchangeAccount();
  return useQuery({
    queryKey: ["spot_trade_history", isAllAccounts ? "ALL" : accountsToQuery.join(",")],
    queryFn: async () => {
      let q = supabase
        .from("spot_trade_history")
        .select("*")
        .order("trade_time", { ascending: false })
        .limit(200);
      if (!isAllAccounts) q = q.in("exchange_account_id", accountsToQuery);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });
}
