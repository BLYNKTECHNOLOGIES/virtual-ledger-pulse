
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
        <Badge className="bg-red-500 text-white font-medium px-3 py-1 text-sm">
          {stock} {unit}
        </Badge>
      );
    }
    return (
      <Badge className="bg-blue-500 text-white font-medium px-3 py-1 text-sm">
        {stock.toLocaleString()} {unit}
      </Badge>
    );
  };

  return (
    <div className="bg-gray-50 min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Product Listing</h1>
            <p className="text-gray-600">Manage your product inventory and stock levels</p>
          </div>
          <Button onClick={() => setShowAddDialog(true)} className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium">
            <Plus className="h-4 w-4 mr-2" />
            Add Product
          </Button>
        </div>
        
        {/* Search Bar */}
        <div className="mb-8">
          <div className="relative max-w-md">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <Input
              placeholder="Search products by name or code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 py-3 bg-white border-gray-200 rounded-lg"
            />
          </div>
        </div>

        {/* Products Grid */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="text-gray-500">Loading products...</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {products?.map((product) => (
              <Card key={product.id} className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-gray-900 mb-1">{product.name}</h3>
                      <p className="text-gray-600 text-sm">Code: {product.code}</p>
                    </div>
                    <Package className="h-8 w-8 text-gray-300" />
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  {/* Current Stock */}
                  <div>
                    <p className="text-gray-600 text-sm mb-2">Current Stock:</p>
                    {getStockBadge(product.calculated_stock || 0, product.unit_of_measurement)}
                  </div>
                  
                  {/* Stock Details */}
                  {product.calculated_stock === 0 ? (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <Badge className="bg-red-500 text-white w-full justify-center py-2">No Stock Data</Badge>
                    </div>
                  ) : (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="mb-3">
                        <Badge className="bg-blue-500 text-white w-full justify-center py-2 text-sm font-medium">
                          Total: {(product.calculated_stock || 0).toLocaleString()} {product.unit_of_measurement}
                        </Badge>
                      </div>
                      {product.warehouse_stocks && product.warehouse_stocks.length > 0 && (
                        <div className="space-y-1">
                          {product.warehouse_stocks.map((ws: any, index: number) => (
                            <div key={index} className="text-sm text-gray-700">
                              <span className="font-medium">{ws.warehouse_name}:</span> {ws.quantity.toLocaleString()}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Pricing Information */}
                  <div className="space-y-3 pt-2 border-t border-gray-100">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 text-sm">Cost Price:</span>
                      <span className="font-semibold text-gray-900">₹{product.cost_price}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 text-sm">Selling Price:</span>
                      <span className="font-semibold text-green-600">₹{product.selling_price}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 text-sm">Avg. Buying:</span>
                      <span className="font-semibold text-gray-900">₹{product.average_buying_price || 0}</span>
                    </div>
                  </div>
                  
                  {/* Statistics */}
                  <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{product.total_purchases || 0}</div>
                      <div className="text-xs text-gray-600">Total Purchases</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{product.total_sales || 0}</div>
                      <div className="text-xs text-gray-600">Total Sales</div>
                    </div>
                  </div>
                  
                  {/* Stock Value */}
                  <div className="pt-4 border-t border-gray-100">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 font-medium">Stock Value:</span>
                      <span className="font-bold text-green-600 text-lg">
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
          <div className="text-center py-12">
            <div className="text-gray-500 text-lg">No products found. Add your first product to get started.</div>
          </div>
        )}
      </div>

      <AddProductDialog 
        open={showAddDialog} 
        onOpenChange={setShowAddDialog}
        onProductSaved={() => refetch()}
      />
    </div>
  );
}
