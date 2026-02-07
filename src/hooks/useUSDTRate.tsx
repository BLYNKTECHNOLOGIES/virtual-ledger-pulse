import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface USDTRateData {
  rate: number;
  timestamp: Date;
  source: string;
}

// Default fallback rate when all sources are unavailable
const FALLBACK_RATE = 84.5;

async function fetchUSDTRate(): Promise<USDTRateData> {
  try {
    const { data, error } = await supabase.functions.invoke("fetch-usdt-rate");

    if (error) {
      console.error("[useUSDTRate] Edge function error:", error.message);
      throw error;
    }

    if (data?.rate) {
      return {
        rate: data.rate,
        timestamp: new Date(data.timestamp || Date.now()),
        source: data.source || "Binance",
      };
    }

    throw new Error("Invalid response from edge function");
  } catch (error) {
    if (import.meta.env.DEV) {
      console.debug("[useUSDTRate] Using fallback rate due to:", error instanceof Error ? error.message : "API unavailable");
    }
    return {
      rate: FALLBACK_RATE,
      timestamp: new Date(),
      source: "Fallback",
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
