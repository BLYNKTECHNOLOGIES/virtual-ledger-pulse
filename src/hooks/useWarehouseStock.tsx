
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface WarehouseStockItem {
  product_id: string;
  product_name: string;
  product_code: string;
  unit_of_measurement: string;
  warehouse_id: string;
  warehouse_name: string;
  quantity: number;
}

export interface ProductStockSummary {
  product_id: string;
  product_name: string;
  product_code: string;
  unit_of_measurement: string;
  total_stock: number;
  warehouse_stocks: {
    warehouse_id: string;
    warehouse_name: string;
    quantity: number;
  }[];
}

export function useWarehouseStock() {
  return useQuery({
    queryKey: ['warehouse_stock_summary'],
    queryFn: async () => {
      const { data: movements, error } = await supabase
        .from('warehouse_stock_movements')
        .select(`
          warehouse_id,
          product_id,
          movement_type,
          quantity,
          products(name, code, unit_of_measurement),
          warehouses(name)
        `);

      if (error) throw error;

      // Aggregate stock by warehouse and product
      const stockMap = new Map<string, WarehouseStockItem>();
      
      movements?.forEach(movement => {
        const key = `${movement.warehouse_id}-${movement.product_id}`;
        
        if (!stockMap.has(key)) {
          stockMap.set(key, {
            product_id: movement.product_id,
            product_name: movement.products?.name || '',
            product_code: movement.products?.code || '',
            unit_of_measurement: movement.products?.unit_of_measurement || '',
            warehouse_id: movement.warehouse_id,
            warehouse_name: movement.warehouses?.name || '',
            quantity: 0
          });
        }
        
        const stock = stockMap.get(key)!;
        if (movement.movement_type === 'IN' || movement.movement_type === 'ADJUSTMENT') {
          stock.quantity += movement.quantity;
        } else if (movement.movement_type === 'OUT' || movement.movement_type === 'TRANSFER') {
          stock.quantity -= movement.quantity;
        }
      });

      // Filter out entries with zero or negative quantities
      return Array.from(stockMap.values()).filter(stock => stock.quantity > 0);
    },
  });
}

export function useProductStockSummary() {
  const { data: warehouseStock, ...rest } = useWarehouseStock();

  const productSummaries = warehouseStock?.reduce((acc, stock) => {
    if (!acc[stock.product_id]) {
      acc[stock.product_id] = {
        product_id: stock.product_id,
        product_name: stock.product_name,
        product_code: stock.product_code,
        unit_of_measurement: stock.unit_of_measurement,
        total_stock: 0,
        warehouse_stocks: []
      };
    }

    acc[stock.product_id].total_stock += stock.quantity;
    
    // Only add warehouse stocks with positive quantities
    if (stock.quantity > 0) {
      acc[stock.product_id].warehouse_stocks.push({
        warehouse_id: stock.warehouse_id,
        warehouse_name: stock.warehouse_name,
        quantity: stock.quantity
      });
    }

    return acc;
  }, {} as Record<string, ProductStockSummary>);

  return {
    data: productSummaries ? Object.values(productSummaries) : undefined,
    ...rest
  };
}
