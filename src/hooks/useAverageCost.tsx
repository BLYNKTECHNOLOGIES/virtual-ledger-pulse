
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
      // Use effective_usdt_qty and net_payable_amount from purchase_orders
      // These are the normalized USDT-equivalent fields — source of truth
      const { data: purchaseOrders, error: poError } = await supabase
        .from('purchase_orders')
        .select(`
          effective_usdt_qty,
          net_payable_amount,
          purchase_order_items (
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

      // Aggregate: WAC = total INR cost / total USDT-equivalent qty per product
      const costCalculations = new Map<string, { totalUsdtQty: number; totalCost: number }>();

      purchaseOrders?.forEach(po => {
        const usdtQty = Number(po.effective_usdt_qty) || 0;
        const cost = Number(po.net_payable_amount) || 0;
        if (usdtQty <= 0 || cost <= 0) return;

        // Get product code from first item (each PO maps to one product)
        const productCode = (po.purchase_order_items as any)?.[0]?.products?.code;
        if (!productCode) return;

        const existing = costCalculations.get(productCode) || { totalUsdtQty: 0, totalCost: 0 };
        costCalculations.set(productCode, {
          totalUsdtQty: existing.totalUsdtQty + usdtQty,
          totalCost: existing.totalCost + cost,
        });
      });

      const result: AverageCostData[] = Array.from(costCalculations.entries()).map(([productCode, data]) => ({
        product_code: productCode,
        total_quantity: data.totalUsdtQty,
        total_cost: data.totalCost,
        average_cost: data.totalUsdtQty > 0 ? data.totalCost / data.totalUsdtQty : 0,
      }));

      return result;
    },
    refetchInterval: 30000,
    staleTime: 10000,
  });
}
