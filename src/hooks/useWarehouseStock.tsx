import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { validateProductStock, ValidationError } from "@/utils/validations";

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
      console.log('Fetching warehouse stock movements...');
      
      // Use the sync function to ensure consistency
      await supabase.rpc('sync_product_warehouse_stock');
      
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

      if (error) {
        console.error('Error fetching warehouse movements:', error);
        throw error;
      }

      console.log('Raw movements data:', movements);

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

      // Filter out negative stock quantities
      const result = Array.from(stockMap.values()).filter(stock => {
        if (stock.quantity < 0) {
          console.warn(`Negative stock detected for ${stock.product_name} in warehouse ${stock.warehouse_name}: ${stock.quantity}`);
          return false;
        }
        return stock.quantity >= 0;
      });
      
      console.log('Processed warehouse stock:', result);
      
      return result;
    },
    refetchInterval: 30000, // Refetch every 30 seconds for real-time updates
  });
}

export function useProductStockSummary() {
  const { data: warehouseStock, isLoading, error } = useWarehouseStock();

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
    
    // Add warehouse stocks (including zero quantities for tracking)
    acc[stock.product_id].warehouse_stocks.push({
      warehouse_id: stock.warehouse_id,
      warehouse_name: stock.warehouse_name,
      quantity: stock.quantity
    });

    return acc;
  }, {} as Record<string, ProductStockSummary>);

  console.log('Product summaries:', productSummaries);

  return {
    data: productSummaries ? Object.values(productSummaries) : undefined,
    isLoading,
    error
  };
}

// Hook to sync product total stock with warehouse totals
export function useSyncProductStock() {
  const { data: productSummaries } = useProductStockSummary();

  const syncStock = async () => {
    if (!productSummaries) return;

    for (const product of productSummaries) {
      // Update the product's current_stock_quantity to match warehouse totals
      const { error } = await supabase
        .from('products')
        .update({ 
          current_stock_quantity: product.total_stock 
        })
        .eq('id', product.product_id);

      if (error) {
        console.error('Error syncing product stock:', error);
      }
    }
  };

  return { syncStock, productSummaries };
}

// New function to validate and create stock movement
export async function createValidatedStockMovement(
  productId: string,
  warehouseId: string,
  movementType: 'IN' | 'OUT' | 'TRANSFER' | 'ADJUSTMENT',
  quantity: number,
  referenceType?: string,
  referenceId?: string,
  reason?: string
) {
  // Validate stock for OUT movements
  if (movementType === 'OUT' && quantity > 0) {
    await validateProductStock(productId, warehouseId, quantity);
  }

  // Create the stock movement
  const { error } = await supabase
    .from('warehouse_stock_movements')
    .insert({
      product_id: productId,
      warehouse_id: warehouseId,
      movement_type: movementType,
      quantity,
      reference_type: referenceType,
      reference_id: referenceId,
      reason
    });

  if (error) throw error;
}
