
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Package } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AddProductDialog } from "./AddProductDialog";

export function ProductCardListingTab() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch products with actual warehouse stock quantities
  const { data: products, isLoading, refetch } = useQuery({
    queryKey: ['products_with_warehouse_stock_cards', searchTerm],
    queryFn: async () => {
      console.log('Fetching products with warehouse stock for cards...');
      
      // First get all products
      let query = supabase
        .from('products')
        .select('*')
        .order('name');

      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%`);
      }

      const { data: productsData, error: productsError } = await query;
      
      if (productsError) throw productsError;

      // Get warehouse stock movements to calculate actual stock
      const { data: movements, error: movementsError } = await supabase
        .from('warehouse_stock_movements')
        .select(`
          product_id,
          warehouse_id,
          movement_type,
          quantity,
          warehouses(name)
        `);

      if (movementsError) {
        console.error('Error fetching movements:', movementsError);
        throw movementsError;
      }

      // Calculate actual stock per product per warehouse
      const stockMap = new Map<string, Map<string, number>>();
      
      movements?.forEach(movement => {
        if (!stockMap.has(movement.product_id)) {
          stockMap.set(movement.product_id, new Map());
        }
        
        const productStocks = stockMap.get(movement.product_id)!;
        const warehouseId = movement.warehouse_id;
        
        if (!productStocks.has(warehouseId)) {
          productStocks.set(warehouseId, 0);
        }
        
        const currentStock = productStocks.get(warehouseId)!;
        
        if (movement.movement_type === 'IN' || movement.movement_type === 'ADJUSTMENT') {
          productStocks.set(warehouseId, currentStock + movement.quantity);
        } else if (movement.movement_type === 'OUT' || movement.movement_type === 'TRANSFER') {
          productStocks.set(warehouseId, Math.max(0, currentStock - movement.quantity));
        }
      });

      // Attach calculated stock to products
      const productsWithStock = productsData?.map(product => {
        const productStocks = stockMap.get(product.id);
        let totalStock = 0;
        const warehouseStocks: Array<{warehouse_id: string, warehouse_name: string, quantity: number}> = [];
        
        if (productStocks) {
          productStocks.forEach((quantity, warehouseId) => {
            totalStock += quantity;
            const warehouse = movements?.find(m => m.warehouse_id === warehouseId)?.warehouses;
            warehouseStocks.push({
              warehouse_id: warehouseId,
              warehouse_name: warehouse?.name || 'Unknown',
              quantity
            });
          });
        }

        return {
          ...product,
          calculated_stock: totalStock,
          warehouse_stocks: warehouseStocks,
          stock_value: totalStock * (product.average_buying_price || product.cost_price)
        };
      });

      return productsWithStock || [];
    },
  });

  const getStockBadge = (stock: number, unit: string) => {
    if (stock === 0) {
      return (
        <Badge variant="destructive" className="text-white">
          {stock} {unit}
        </Badge>
      );
    }
    return (
      <Badge className="bg-blue-500 text-white">
        {stock.toLocaleString()} {unit}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Product Listing</CardTitle>
            <p className="text-gray-600 mt-1">Manage your product inventory and stock levels</p>
          </div>
          <Button onClick={() => setShowAddDialog(true)} className="bg-blue-500 hover:bg-blue-600">
            <Plus className="h-4 w-4 mr-2" />
            Add Product
          </Button>
        </div>
        
        <div className="flex gap-2 max-w-md">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search products by name or code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8">Loading products...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {products?.map((product) => (
              <Card key={product.id} className="relative">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-semibold">{product.name}</h3>
                      <p className="text-sm text-gray-600">Code: {product.code}</p>
                    </div>
                    <Package className="h-6 w-6 text-gray-400" />
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Current Stock:</p>
                    {getStockBadge(product.calculated_stock || 0, product.unit_of_measurement)}
                  </div>
                  
                  {product.calculated_stock === 0 ? (
                    <Badge variant="destructive">No Stock Data</Badge>
                  ) : (
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium text-blue-900">
                          Total: {(product.calculated_stock || 0).toLocaleString()} {product.unit_of_measurement}
                        </span>
                      </div>
                      {product.warehouse_stocks && product.warehouse_stocks.length > 0 && (
                        <div className="space-y-1">
                          {product.warehouse_stocks.map((ws: any, index: number) => (
                            <div key={index} className="text-xs text-blue-800">
                              <span className="font-medium">{ws.warehouse_name}:</span> {ws.quantity.toLocaleString()}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Cost Price:</p>
                      <p className="font-medium">₹{product.cost_price}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Selling Price:</p>
                      <p className="font-medium text-green-600">₹{product.selling_price}</p>
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-gray-600 text-sm">Avg. Buying:</p>
                    <p className="font-medium">₹{product.average_buying_price || 0}</p>
                  </div>
                  
                  <div className="flex justify-between items-center text-sm pt-2 border-t">
                    <div className="text-center">
                      <p className="text-blue-600 text-lg font-bold">{product.total_purchases || 0}</p>
                      <p className="text-gray-600">Total Purchases</p>
                    </div>
                    <div className="text-center">
                      <p className="text-green-600 text-lg font-bold">{product.total_sales || 0}</p>
                      <p className="text-gray-600">Total Sales</p>
                    </div>
                  </div>
                  
                  <div className="pt-2 border-t">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Stock Value:</span>
                      <span className="font-bold text-green-600">
                        ₹ {(product.stock_value || 0).toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        
        {products?.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No products found. Add your first product to get started.
          </div>
        )}
      </CardContent>

      <AddProductDialog 
        open={showAddDialog} 
        onOpenChange={setShowAddDialog}
        onProductSaved={() => refetch()}
      />
    </Card>
  );
}
