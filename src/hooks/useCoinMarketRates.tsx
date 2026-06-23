import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fetches live USDT-denominated market prices for crypto assets and caches them
 * for 6 hours. Used to value non-stablecoin holdings at actual market value
 * (instead of weighted average cost). USDT and USDC are always treated as 1:1.
 */

const CACHE_KEY = "coin_market_rates_usdt";
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

// Stablecoins are pegged 1:1 to USDT — no market lookup needed.
const STABLE_CODES = new Set(["USDT", "USDC"]);

export type CoinMarketRates = Record<string, number>; // asset code -> price in USDT

interface CachedRates {
  rates: CoinMarketRates;
  cachedAt: number;
}

function readCache(): CachedRates | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedRates;
    if (parsed?.rates && typeof parsed.cachedAt === "number") return parsed;
  } catch {}
  return null;
}

function writeCache(rates: CoinMarketRates) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ rates, cachedAt: Date.now() }));
  } catch {}
}

async function fetchAllMarketRates(): Promise<CoinMarketRates> {
  // Serve from cache if still fresh (< 6 hours old).
  const cached = readCache();
  if (cached && Date.now() - cached.cachedAt < SIX_HOURS_MS) {
    return cached.rates;
  }

  try {
    // No symbol => Binance returns every ticker price in one public call.
    const { data, error } = await supabase.functions.invoke("binance-assets", {
      body: { action: "getTickerPrice" },
    });
    if (error) throw error;

    const tickers: any[] = Array.isArray(data?.data) ? data.data : [];
    const rates: CoinMarketRates = { USDT: 1, USDC: 1 };

    tickers.forEach((t) => {
      const symbol: string = t?.symbol || "";
      const price = parseFloat(t?.price);
      if (!symbol.endsWith("USDT") || !(price > 0)) return;
      const code = symbol.slice(0, -4); // strip trailing "USDT"
      if (!code) return;
      rates[code] = price;
    });

    if (Object.keys(rates).length > 2) {
      writeCache(rates);
      return rates;
    }
    throw new Error("No ticker data returned");
  } catch (err) {
    console.warn("[useCoinMarketRates] Falling back to last cached rates:", err);
    // Use last known cached rates even if stale — never block valuation.
    return cached?.rates ?? { USDT: 1, USDC: 1 };
  }
}

export function isStableCoin(code?: string | null): boolean {
  return !!code && STABLE_CODES.has(code.toUpperCase());
}

export function useCoinMarketRates() {
  return useQuery({
    queryKey: ["coin_market_rates_usdt"],
    queryFn: fetchAllMarketRates,
    staleTime: SIX_HOURS_MS,
    refetchInterval: SIX_HOURS_MS,
    refetchOnWindowFocus: false,
  });
}
