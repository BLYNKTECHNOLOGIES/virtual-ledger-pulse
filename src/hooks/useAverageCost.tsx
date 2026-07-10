
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isStableCoin } from "./useCoinMarketRates";

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
      const { data: purchaseOrders, error: poError } = await supabase
        .from('purchase_orders')
        .select(`
          effective_usdt_qty,
          net_payable_amount,
          purchase_order_items (
            quantity,
            products (
              code
            )
          )
        `)
        .eq('status', 'COMPLETED')
        .not('effective_usdt_qty', 'is', null);

      if (poError) {
        throw poError;
      }

      const costCalculations = new Map<string, { totalQty: number; totalCost: number }>();

      purchaseOrders?.forEach(po => {
        const cost = Number(po.net_payable_amount) || 0;
        if (cost <= 0) return;

        // Each PO maps to one product/asset (first item).
        const item = (po.purchase_order_items as any)?.[0];
        const productCode = item?.products?.code;
        if (!productCode) return;

        // Stablecoins keep the USDT-equivalent basis; other coins use coin qty.
        const denomQty = isStableCoin(productCode)
          ? Number(po.effective_usdt_qty) || 0
          : Number(item?.quantity) || 0;
        if (denomQty <= 0) return;

        const existing = costCalculations.get(productCode) || { totalQty: 0, totalCost: 0 };
        costCalculations.set(productCode, {
          totalQty: existing.totalQty + denomQty,
          totalCost: existing.totalCost + cost,
        });
      });

      const result: AverageCostData[] = Array.from(costCalculations.entries()).map(([productCode, data]) => ({
        product_code: productCode,
        total_quantity: data.totalQty,
        total_cost: data.totalCost,
        average_cost: data.totalQty > 0 ? data.totalCost / data.totalQty : 0,
      }));

      return result;
    },
    refetchInterval: 30000,
    staleTime: 10000,
  });
}

