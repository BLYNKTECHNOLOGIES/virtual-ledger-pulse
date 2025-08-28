
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
      console.log('🔄 Calculating average costs...');
      
      // Get all completed purchase orders with their items
      const { data: purchaseOrders, error: poError } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          purchase_order_items (
            quantity,
            unit_price,
            total_price,
            products (
              code,
              name
            )
          )
        `)
        .eq('status', 'COMPLETED');

      if (poError) {
        console.error('Error fetching purchase orders:', poError);
        throw poError;
      }

      console.log('Purchase orders for cost calculation:', purchaseOrders);

      // Calculate average cost per product
      const costCalculations = new Map<string, { totalQuantity: number; totalCost: number; }>();

      purchaseOrders?.forEach(po => {
        po.purchase_order_items?.forEach((item: any) => {
          const productCode = item.products?.code;
          if (!productCode) return;

          const existing = costCalculations.get(productCode) || { totalQuantity: 0, totalCost: 0 };
          
          costCalculations.set(productCode, {
            totalQuantity: existing.totalQuantity + item.quantity,
            totalCost: existing.totalCost + item.total_price
          });
        });
      });

      // Convert to result format
      const result: AverageCostData[] = Array.from(costCalculations.entries()).map(([productCode, data]) => ({
        product_code: productCode,
        total_quantity: data.totalQuantity,
        total_cost: data.totalCost,
        average_cost: data.totalQuantity > 0 ? data.totalCost / data.totalQuantity : 0
      }));

      console.log('Calculated average costs:', result);
      return result;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 10000, // Consider stale after 10 seconds
  });
}
