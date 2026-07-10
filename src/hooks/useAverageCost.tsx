
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
      // WAC = total INR cost / total COIN quantity acquired (per product).
      //
      // IMPORTANT: The denominator MUST be the actual coin quantity, NOT the
      // USDT-equivalent quantity. Using effective_usdt_qty only works for USDT
      // (where 1 coin == 1 USDT). For any other asset (TRX, BTC, ...) the
      // USDT-equivalent is far smaller than the coin count, which inflated the
      // reported "Avg Cost" to roughly the USDT buying rate (e.g. TRX showed
      // ~₹95/coin — the USDT rate — instead of its true ~₹29/coin basis).
      const { data: purchaseOrders, error: poError } = await supabase
        .from('purchase_orders')
        .select(`
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

      // Aggregate: WAC = total INR cost / total coin qty per product
      const costCalculations = new Map<string, { totalQty: number; totalCost: number }>();

      purchaseOrders?.forEach(po => {
        const cost = Number(po.net_payable_amount) || 0;
        if (cost <= 0) return;

        // Each PO maps to one product/asset (first item).
        const item = (po.purchase_order_items as any)?.[0];
        const productCode = item?.products?.code;
        const coinQty = Number(item?.quantity) || 0;
        if (!productCode || coinQty <= 0) return;

        const existing = costCalculations.get(productCode) || { totalQty: 0, totalCost: 0 };
        costCalculations.set(productCode, {
          totalQty: existing.totalQty + coinQty,
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
