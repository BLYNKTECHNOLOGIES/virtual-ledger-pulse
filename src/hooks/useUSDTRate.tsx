import { useQuery } from "@tanstack/react-query";

interface USDTRateData {
  rate: number;
  timestamp: Date;
  source: string;
}

// Fetch live USDT/INR rate from CoinGecko (free API, no key required)
async function fetchUSDTRate(): Promise<USDTRateData> {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=inr',
      {
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch USDT rate');
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
    console.error('Error fetching USDT rate from CoinGecko:', error);
    // Fallback to a reasonable default if API fails
    // This should be replaced with a cached value in production
    return {
      rate: 84.5, // Approximate fallback rate
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
    retry: 3,
    retryDelay: 1000,
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
