import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SmallTradeBand, SmallTradeBands } from '@/lib/small-trade';

function toBand(row: any): SmallTradeBand | null {
  if (!row) return null;
  const min = Number(row.min_amount);
  const max = Number(row.max_amount);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= 0 || max < min) return null;
  return { min, max };
}

/**
 * Small-order amount bands, read from the same automation settings the
 * small sales / small buys engines use. Used as-is (the automation on/off
 * toggle does not change what an amount means).
 */
export function useSmallTradeBands() {
  return useQuery<SmallTradeBands>({
    queryKey: ['small-trade-bands'],
    queryFn: async () => {
      const [sales, buys] = await Promise.all([
        supabase.from('small_sales_config').select('min_amount, max_amount').limit(1).maybeSingle(),
        supabase.from('small_buys_config' as any).select('min_amount, max_amount').limit(1).maybeSingle(),
      ]);
      return {
        sell: toBand(sales.data),
        buy: toBand(buys.data as any),
      };
    },
    staleTime: 60_000,
  });
}
