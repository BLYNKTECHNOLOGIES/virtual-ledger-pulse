import { useQuery } from "@tanstack/react-query";

interface USDTRateData {
  rate: number;
  timestamp: Date;
  source: string;
}

// Default fallback rate when API is unavailable
const FALLBACK_RATE = 84.5;

// Fetch live USDT/INR rate from CoinGecko (free API, no key required)
async function fetchUSDTRate(): Promise<USDTRateData> {
  try {
    // Use AbortController to timeout quickly on CORS/network issues
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=inr',
      {
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
      }
    );
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();
    
    if (data.tether && data.tether.inr) {
      return {
        rate: data.tether.inr,
        timestamp: new Date(),
        source: 'CoinGecko'
      };
    }
    
    throw new Error('Invalid response format');
  } catch (error) {
    // Silently fallback - CORS/rate-limit errors are expected from browser
    // Log only in development for debugging
    if (import.meta.env.DEV) {
      console.debug('[useUSDTRate] Using fallback rate due to:', error instanceof Error ? error.message : 'API unavailable');
    }
    return {
      rate: FALLBACK_RATE,
      timestamp: new Date(),
      source: 'Fallback'
    };
  }
}

export function useUSDTRate() {
  return useQuery({
    queryKey: ['usdt_inr_rate'],
    queryFn: fetchUSDTRate,
    staleTime: 30000, // Consider fresh for 30 seconds
    refetchInterval: 60000, // Refetch every minute
    retry: 1, // Reduce retries since CORS will always fail from browser
    retryDelay: 2000,
  });
}

// Calculate platform fee in USDT
export function calculatePlatformFeeInUSDT(
  orderAmountINR: number,
  feePercentage: number,
  usdtRateINR: number
): { feeINR: number; feeUSDT: number } {
  // Fee in INR = Order Amount × Fee Percentage
  const feeINR = orderAmountINR * (feePercentage / 100);
  
  // Fee in USDT = Fee in INR / USDT Rate
  const feeUSDT = usdtRateINR > 0 ? feeINR / usdtRateINR : 0;
  
  return {
    feeINR,
    feeUSDT: parseFloat(feeUSDT.toFixed(6)) // Round to 6 decimal places
  };
}

// Calculate fee INR value using average buying price (for accounting)
export function calculateFeeINRValueAtBuyingPrice(
  feeUSDT: number,
  averageBuyingPrice: number
): number {
  return feeUSDT * averageBuyingPrice;
}
