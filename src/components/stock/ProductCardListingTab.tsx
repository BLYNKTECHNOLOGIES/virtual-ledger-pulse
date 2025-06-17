
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Package, TrendingUp, TrendingDown, Warehouse } from "lucide-react";
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

      // Attach calculated stock to products and sync with database
      const productsWithStock = await Promise.all(productsData?.map(async (product) => {
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

        // Update the product's current_stock_quantity to match calculated total
        await supabase
          .from('products')
          .update({ current_stock_quantity: totalStock })
          .eq('id', product.id);

        return {
          ...product,
          calculated_stock: totalStock,
          current_stock_quantity: totalStock, // Ensure consistency
          warehouse_stocks: warehouseStocks,
          stock_value: totalStock * (product.average_buying_price || product.cost_price)
        };
      }) || []);

      return productsWithStock;
    },
    refetchInterval: 30000, // Refetch every 30 seconds to keep stock updated
  });

  const getStockStatus = (stock: number) => {
    if (stock === 0) return { color: "bg-red-100 text-red-700 border-red-200", label: "Out of Stock" };
    if (stock < 10) return { color: "bg-yellow-100 text-yellow-700 border-yellow-200", label: "Low Stock" };
    return { color: "bg-green-100 text-green-700 border-green-200", label: "In Stock" };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold text-slate-800 mb-2">Product Inventory</h1>
            <p className="text-slate-600 text-lg">Manage your product stock and inventory levels</p>
          </div>
          <Button 
            onClick={() => setShowAddDialog(true)} 
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
          >
            <Plus className="h-5 w-5 mr-2" />
            Add New Product
          </Button>
        </div>
        
        {/* Search Section */}
        <div className="mb-8">
          <div className="relative max-w-lg">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 h-5 w-5" />
            <Input
              placeholder="Search products by name or code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 py-4 bg-white border-slate-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Products Grid */}
        {isLoading ? (
          <div className="text-center py-16">
            <div className="text-slate-500 text-lg">Loading products...</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
            {products?.map((product) => {
              const stockStatus = getStockStatus(product.calculated_stock || 0);
              return (
                <Card key={product.id} className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border-0 overflow-hidden group hover:scale-105">
                  <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50 pb-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <CardTitle className="text-xl font-bold text-slate-800 mb-1 group-hover:text-blue-600 transition-colors">
                          {product.name}
                        </CardTitle>
                        <p className="text-slate-500 text-sm font-medium">#{product.code}</p>
                      </div>
                      <div className="p-3 bg-white rounded-xl shadow-sm">
                        <Package className="h-6 w-6 text-blue-500" />
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="p-6 space-y-6">
                    {/* Stock Status */}
                    <div className="text-center">
                      <div className={`inline-flex items-center px-4 py-2 rounded-full border ${stockStatus.color} font-medium text-sm`}>
                        {stockStatus.label}
                      </div>
                      <div className="mt-3">
                        <span className="text-3xl font-bold text-slate-800">
                          {(product.calculated_stock || 0).toLocaleString()}
                        </span>
                        <span className="text-slate-500 ml-2">{product.unit_of_measurement}</span>
                      </div>
                    </div>
                    
                    {/* Warehouse Breakdown */}
                    {product.warehouse_stocks && product.warehouse_stocks.length > 0 && (
                      <div className="bg-slate-50 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Warehouse className="h-4 w-4 text-slate-600" />
                          <span className="font-semibold text-slate-700 text-sm">Warehouse Stock</span>
                        </div>
                        <div className="space-y-2">
                          {product.warehouse_stocks.slice(0, 3).map((ws: any, index: number) => (
                            <div key={index} className="flex justify-between items-center">
                              <span className="text-slate-600 text-sm truncate">{ws.warehouse_name}</span>
                              <span className="font-semibold text-slate-800">{ws.quantity.toLocaleString()}</span>
                            </div>
                          ))}
                          {product.warehouse_stocks.length > 3 && (
                            <div className="text-center text-slate-500 text-xs">
                              +{product.warehouse_stocks.length - 3} more warehouses
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Pricing Grid */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-3 bg-red-50 rounded-xl">
                        <div className="text-red-600 text-sm font-medium">Cost Price</div>
                        <div className="text-red-700 font-bold text-lg">₹{product.cost_price}</div>
                      </div>
                      <div className="text-center p-3 bg-green-50 rounded-xl">
                        <div className="text-green-600 text-sm font-medium">Selling Price</div>
                        <div className="text-green-700 font-bold text-lg">₹{product.selling_price}</div>
                      </div>
                    </div>
                    
                    {/* Sales & Purchase Stats */}
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <TrendingDown className="h-4 w-4 text-blue-500" />
                          <span className="text-blue-600 font-semibold text-2xl">{product.total_purchases || 0}</span>
                        </div>
                        <div className="text-slate-500 text-xs">Purchases</div>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <TrendingUp className="h-4 w-4 text-green-500" />
                          <span className="text-green-600 font-semibold text-2xl">{product.total_sales || 0}</span>
                        </div>
                        <div className="text-slate-500 text-xs">Sales</div>
                      </div>
                    </div>
                    
                    {/* Stock Value */}
                    <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-4 text-center">
                      <div className="text-slate-600 text-sm font-medium mb-1">Total Stock Value</div>
                      <div className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
                        ₹{(product.stock_value || 0).toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        
        {/* Empty State */}
        {products?.length === 0 && (
          <div className="text-center py-16">
            <div className="text-slate-400 text-xl">No products found</div>
            <p className="text-slate-500 mt-2">Add your first product to get started with inventory management</p>
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
