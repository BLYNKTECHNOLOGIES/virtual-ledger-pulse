
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AverageCostData {
  product_code: string;
  total_quantity: number;
  total_cost: number;
  average_cost: number;
}

export function useAverageCost() {
  return useQuery({
    queryKey: ['average_cost_calculation'],
    queryFn: async () => {
      // WAC = total INR cost / total quantity acquired (per product).
      //
      // Denominator rule (this was the logical bug):
      //  - Stablecoins (USDT/USDC): use effective_usdt_qty — the normalized
      //    USDT-equivalent is the established source of truth for the ₹/USDT
      //    rate and drives app-wide USDT valuation. Leave it untouched.
      //  - Every OTHER coin (TRX, BTC, ETH, ...): use the ACTUAL coin quantity.
      //    Previously all products divided INR by effective_usdt_qty, so a coin
      //    like TRX reported ~₹95/coin (the USDT rate) instead of its true
      //    ~₹29/coin cost basis, because its USDT-equivalent is far smaller
      //    than its coin count.
      // Aggregated in Postgres (get_product_avg_costs) — previously this pulled
      // every COMPLETED purchase order into the browser, which was both slow and
      // silently truncated at PostgREST's 1000-row cap.
      const { data, error } = await (supabase as any).rpc("get_product_avg_costs");
      if (error) throw error;

      const result: AverageCostData[] = ((data || []) as any[]).map((r) => ({
        product_code: String(r.product_code),
        total_quantity: Number(r.total_quantity || 0),
        total_cost: Number(r.total_cost || 0),
        average_cost: Number(r.average_cost || 0),
      }));

      return result;
    },
    refetchInterval: 60000,
    staleTime: 60000,
  });
}
