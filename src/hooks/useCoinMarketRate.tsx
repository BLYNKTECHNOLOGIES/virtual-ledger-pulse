import { supabase } from "@/integrations/supabase/client";

/**
 * Fetches the current CoinUSDT market rate for a given asset code.
 * Returns 1.0 for USDT, fetches live Binance ticker price for other assets.
 */
export async function fetchCoinMarketRate(assetCode: string): Promise<number> {
  const code = assetCode?.toUpperCase() || 'USDT';
  if (code === 'USDT') return 1.0;

  try {
    const symbol = `${code}USDT`;
    const { data, error } = await supabase.functions.invoke("binance-assets", {
      body: { action: "getTickerPrice", symbol },
    });

    if (error) {
      console.warn(`[fetchCoinMarketRate] Error fetching ${symbol}:`, error.message);
      return 0;
    }

    if (data?.success && data?.data?.price) {
      return parseFloat(data.data.price);
    }

    // If array response (multiple tickers), find our symbol
    if (Array.isArray(data?.data)) {
      const ticker = data.data.find((t: any) => t.symbol === symbol);
      if (ticker?.price) return parseFloat(ticker.price);
    }

    console.warn(`[fetchCoinMarketRate] No price data for ${symbol}`);
    return 0;
  } catch (err) {
    console.error(`[fetchCoinMarketRate] Failed for ${assetCode}:`, err);
    return 0;
  }
}
