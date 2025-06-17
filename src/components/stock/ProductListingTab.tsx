
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Edit, Trash2, Package } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AddProductDialog } from "./AddProductDialog";
import { StockStatusBadge } from "./StockStatusBadge";
import { useProductStockSummary } from "@/hooks/useWarehouseStock";

export function ProductListingTab() {
  const [showAddProductDialog, setShowAddProductDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const queryClient = useQueryClient();

  // Fetch products
  const { data: products, isLoading } = useQuery({
    queryKey: ['products', searchTerm],
    queryFn: async () => {
      let query = supabase
        .from('products')
        .select('*')
        .order('name');

      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const { data: productStockSummaries } = useProductStockSummary();

  // Update product stock mutation to sync with warehouse movements
  const updateProductStockMutation = useMutation({
    mutationFn: async (productId: string) => {
      // Calculate total stock from warehouse movements
      const { data: movements, error } = await supabase
        .from('warehouse_stock_movements')
        .select('movement_type, quantity')
        .eq('product_id', productId);

      if (error) throw error;

      let totalStock = 0;
      movements?.forEach(movement => {
        if (movement.movement_type === 'IN' || movement.movement_type === 'ADJUSTMENT') {
          totalStock += movement.quantity;
        } else if (movement.movement_type === 'OUT' || movement.movement_type === 'TRANSFER') {
          totalStock -= movement.quantity;
        }
      });

      // Update product current_stock_quantity to match warehouse movements
      const { error: updateError } = await supabase
        .from('products')
        .update({ current_stock_quantity: totalStock })
        .eq('id', productId);

      if (updateError) throw updateError;
      return totalStock;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse_stock_summary'] });
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: async (productId: string) => {
      const { data, error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse_stock_summary'] });
      toast.success("Product deleted successfully");
    },
    onError: (error) => {
      toast.error("Failed to delete product");
      console.error("Error deleting product:", error);
    }
  });

  const getProductStock = (productId: string) => {
    return productStockSummaries?.find(p => p.product_id === productId);
  };

  const getActualStock = (product: any) => {
    const stockSummary = getProductStock(product.id);
    return stockSummary?.total_stock || 0;
  };

  // Function to sync all product stocks
  const syncAllStocks = async () => {
    if (!products) return;
    
    toast.info("Syncing stock levels...");
    
    for (const product of products) {
      await updateProductStockMutation.mutateAsync(product.id);
    }
    
    toast.success("All stock levels synced successfully");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Product Inventory Management</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" onClick={syncAllStocks}>
                Sync Stock Levels
              </Button>
              <Button onClick={() => setShowAddProductDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Product
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-6">
            <div className="flex-1">
              <Input
                placeholder="Search products by name or code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button variant="outline">
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
          </div>

          {isLoading ? (
            <div className="text-center py-8">Loading products...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Product</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Code</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Unit</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Cost Price</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Selling Price</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Current Stock</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Warehouse Distribution</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products?.map((product) => {
                    const stockSummary = getProductStock(product.id);
                    const actualStock = getActualStock(product);
                    const isStockMismatched = product.current_stock_quantity !== actualStock;
                    
                    return (
                      <tr key={product.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 text-gray-400" />
                            <span className="font-medium">{product.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-sm">{product.code}</td>
                        <td className="py-3 px-4">{product.unit_of_measurement}</td>
                        <td className="py-3 px-4">₹{product.cost_price}</td>
                        <td className="py-3 px-4">₹{product.selling_price}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant={actualStock <= 0 ? "destructive" : actualStock <= 10 ? "secondary" : "default"}
                              className={isStockMismatched ? "border-orange-500" : ""}
                            >
                              {actualStock} {product.unit_of_measurement}
                            </Badge>
                            {isStockMismatched && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => updateProductStockMutation.mutate(product.id)}
                                className="text-orange-600 hover:text-orange-700"
                              >
                                Sync
                              </Button>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {stockSummary?.warehouse_stocks.length ? (
                            <div className="flex flex-wrap gap-1">
                              {stockSummary.warehouse_stocks.map((ws) => (
                                <Badge key={ws.warehouse_id} variant="outline" className="text-xs">
                                  {ws.warehouse_name}: {ws.quantity}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-400 text-sm">No stock</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteProductMutation.mutate(product.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {products?.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No products found. Add your first product to get started.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AddProductDialog
        open={showAddProductDialog}
        onOpenChange={setShowAddProductDialog}
      />
    </div>
  );
}
