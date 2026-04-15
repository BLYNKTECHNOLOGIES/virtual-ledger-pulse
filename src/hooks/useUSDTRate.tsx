import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface USDTRateData {
  rate: number;
  timestamp: Date;
  source: string;
  isFallback: boolean;
}

const CACHE_KEY = "usdt_inr_last_known_rate";

function getLastKnownRate(): number | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed?.rate && typeof parsed.rate === "number" && parsed.rate > 0) {
        return parsed.rate;
      }
    }
  } catch {}
  return null;
}

function cacheRate(rate: number) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ rate, cachedAt: Date.now() }));
  } catch {}
}

async function fetchUSDTRate(): Promise<USDTRateData> {
  try {
    const { data, error } = await supabase.functions.invoke("fetch-usdt-rate");

    if (error) {
      console.error("[useUSDTRate] Edge function error:", error.message);
      throw error;
    }

    if (data?.rate && data?.source !== "Fallback") {
      cacheRate(data.rate);
      return {
        rate: data.rate,
        timestamp: new Date(data.timestamp || Date.now()),
        source: data.source || "Binance",
        isFallback: false,
      };
    }

    // Edge function returned fallback — use last known rate instead
    if (data?.source === "Fallback") {
      console.warn("[useUSDTRate] Edge function returned fallback, using last known rate");
    }

    throw new Error("Primary source unavailable");
  } catch (error) {
    const lastKnown = getLastKnownRate();
    if (lastKnown) {
      console.warn(`[useUSDTRate] Using last known rate: ₹${lastKnown}`);
      return {
        rate: lastKnown,
        timestamp: new Date(),
        source: "Last Known Rate",
        isFallback: true,
      };
    }

    // No cached rate available — return 0 to force UI to show error state
    console.error("[useUSDTRate] No cached rate available. Rate unavailable.");
    return {
      rate: 0,
      timestamp: new Date(),
      source: "Unavailable",
      isFallback: true,
    };
  }
}

export function useUSDTRate() {
  return useQuery({
    queryKey: ["usdt_inr_rate"],
    queryFn: fetchUSDTRate,
    staleTime: 30000,
    refetchInterval: 60000,
    retry: 1,
    retryDelay: 2000,
  });
}

// Calculate platform fee in USDT
export function calculatePlatformFeeInUSDT(
  orderAmountINR: number,
  feePercentage: number,
  usdtRateINR: number
): { feeINR: number; feeUSDT: number } {
  const feeINR = orderAmountINR * (feePercentage / 100);
  const feeUSDT = usdtRateINR > 0 ? feeINR / usdtRateINR : 0;
  return {
    feeINR,
    feeUSDT: parseFloat(feeUSDT.toFixed(6)),
  };
}

// Calculate fee INR value using average buying price (for accounting)
export function calculateFeeINRValueAtBuyingPrice(
  feeUSDT: number,
  averageBuyingPrice: number
): number {
  return feeUSDT * averageBuyingPrice;
}
