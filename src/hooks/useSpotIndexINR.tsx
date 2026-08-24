import { useQueries } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUSDTRate } from '@/hooks/useUSDTRate';

/**
 * Live INR index price per asset, built exactly like Hybrid Adjust:
 *   USDT  → live USDT/INR rate (fetch-usdt-rate)
 *   other → Binance spot <ASSET>USDT ticker × live USDT/INR rate
 *
 * This is the index Binance floating ratios are expressed against, and the same
 * reference Hybrid Adjust uses — NOT the P2P `getReferencePrice` (which carries a
 * P2P market premium and produces wrong floating ratios).
 */
export function useSpotIndexINR(assets: string[], enabled = true) {
  const { data: rateData, isLoading: rateLoading } = useUSDTRate();
  const usdtInr = rateData?.rate || 0;
  const uniqueAssets = [...new Set(assets)];
  const nonUsdt = uniqueAssets.filter((a) => a !== 'USDT');

  const results = useQueries({
    queries: nonUsdt.map((asset) => ({
      queryKey: ['binance-spot-ticker', `${asset}USDT`],
      queryFn: async () => {
        const { data, error } = await supabase.functions.invoke('binance-assets', {
          body: { action: 'getTickerPrice', symbol: `${asset}USDT` },
        });
        if (error) throw error;
        const price = Number((data as any)?.data?.price ?? (data as any)?.price);
        return price > 0 ? price : null;
      },
      staleTime: 30 * 1000,
      enabled: enabled && !!asset,
    })),
  });

  const index: Record<string, number | null> = {};
  if (usdtInr > 0 && uniqueAssets.includes('USDT')) index.USDT = usdtInr;
  nonUsdt.forEach((asset, i) => {
    const px = results[i]?.data as number | null | undefined;
    index[asset] = usdtInr > 0 && px ? px * usdtInr : null;
  });

  return {
    index,
    usdtInr,
    rateSource: rateData?.source,
    rateIsFallback: !!rateData?.isFallback,
    isLoading: rateLoading || results.some((r) => r.isLoading),
  };
}
