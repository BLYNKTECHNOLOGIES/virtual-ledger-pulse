
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Edit, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AddProductDialog } from "./AddProductDialog";
import { useToast } from "@/hooks/use-toast";

export function ProductListingTab() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const { toast } = useToast();

  // Fetch products and sync USDT stock
  const { data: products, isLoading, refetch } = useQuery({
    queryKey: ['products_listing_force_refresh', searchTerm, Date.now()], // Force refresh with timestamp
    queryFn: async () => {
      console.log('🔄 Fetching products...');
      
      // Sync USDT stock first
      console.log('🔄 Syncing USDT stock...');
      const { error: syncError } = await supabase.rpc('sync_usdt_stock');
      if (syncError) {
        console.error('❌ Error syncing USDT stock:', syncError);
      } else {
        console.log('✅ USDT stock synced successfully');
      }
      
      // Fetch all products
      console.log('🔄 Fetching products from database...');
      let query = supabase
        .from('products')
        .select('*')
        .order('name');

      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%`);
      }

      const { data: productsData, error: productsError } = await query;
      
      if (productsError) {
        console.error('❌ Error fetching products:', productsError);
        throw productsError;
      }

      console.log('📊 Raw products data:', productsData);

      // Log USDT product specifically
      const usdtProduct = productsData?.find(p => p.code === 'USDT');
      if (usdtProduct) {
        console.log('💰 USDT Product:', {
          current_stock_quantity: usdtProduct.current_stock_quantity,
          updated_at: usdtProduct.updated_at
        });
      }

      // Get warehouse stock movements for warehouse distribution display
      console.log('🔄 Fetching warehouse movements...');
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
        console.error('❌ Error fetching movements:', movementsError);
        // Don't throw error, just continue without warehouse data
      }

      // Calculate warehouse distribution for display
      const warehouseDistribution = new Map<string, Array<{warehouse_id: string, warehouse_name: string, quantity: number}>>();
      
      movements?.forEach(movement => {
        if (!warehouseDistribution.has(movement.product_id)) {
          warehouseDistribution.set(movement.product_id, []);
        }
        
        const existingEntry = warehouseDistribution.get(movement.product_id)!
          .find(entry => entry.warehouse_id === movement.warehouse_id);
        
        if (existingEntry) {
          if (movement.movement_type === 'IN' || movement.movement_type === 'ADJUSTMENT') {
            existingEntry.quantity += movement.quantity;
          } else if (movement.movement_type === 'OUT' || movement.movement_type === 'TRANSFER') {
            existingEntry.quantity = Math.max(0, existingEntry.quantity - movement.quantity);
          }
        } else {
          const warehouse = movements?.find(m => m.warehouse_id === movement.warehouse_id)?.warehouses;
          const quantity = (movement.movement_type === 'IN' || movement.movement_type === 'ADJUSTMENT') 
            ? movement.quantity 
            : -movement.quantity;
          
          warehouseDistribution.get(movement.product_id)!.push({
            warehouse_id: movement.warehouse_id,
            warehouse_name: warehouse?.name || 'Unknown',
            quantity: Math.max(0, quantity)
          });
        }
      });

      // Attach warehouse distribution to products
      const productsWithDistribution = productsData?.map(product => ({
        ...product,
        warehouse_stocks: warehouseDistribution.get(product.id) || []
      })) || [];

      console.log('✅ Final products with distribution:', productsWithDistribution);
      return productsWithDistribution;
    },
    refetchInterval: 5000, // Refetch every 5 seconds
    staleTime: 0, // Always consider data stale to force fresh fetches
    gcTime: 0, // Don't cache at all (new name for cacheTime)
  });

  const handleEdit = (product: any) => {
    setEditingProduct(product);
    setShowAddDialog(true);
  };

  const handleDelete = async (productId: string) => {
    if (confirm('Are you sure you want to delete this product?')) {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId);
      
      if (error) {
        toast({
          title: "Error",
          description: "Failed to delete product.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: "Product deleted successfully.",
        });
        refetch();
      }
    }
  };

  const getStockStatus = (stock: number) => {
    if (stock === 0) return <Badge variant="destructive">Out of Stock</Badge>;
    if (stock < 10) return <Badge variant="secondary">Low Stock</Badge>;
    return <Badge className="bg-green-100 text-green-800">In Stock</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Product Inventory</CardTitle>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Product
          </Button>
        </div>
        
        <div className="flex gap-2">
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
      </CardHeader>
      
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8">Loading products...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Product Code</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Name</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Cost Price</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Selling Price</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Current Stock</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Warehouse Distribution</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Unit</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products?.map((product) => (
                  <tr key={product.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4 font-mono text-sm">{product.code}</td>
                    <td className="py-3 px-4 font-medium">{product.name}</td>
                    <td className="py-3 px-4">₹{product.cost_price}</td>
                    <td className="py-3 px-4">₹{product.selling_price}</td>
                    <td className="py-3 px-4 font-semibold">
                      {parseFloat((product.current_stock_quantity || 0).toString()).toLocaleString('en-IN', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 3
                      })} {product.unit_of_measurement}
                    </td>
                    <td className="py-3 px-4">
                      {product.warehouse_stocks && product.warehouse_stocks.length > 0 ? (
                        <div className="space-y-1">
                          {product.warehouse_stocks.map((ws: any, index: number) => (
                            <div key={index} className="text-xs">
                              <span className="font-medium">{ws.warehouse_name}:</span> {parseFloat(ws.quantity.toString()).toLocaleString('en-IN', {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 3
                              })}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400">No stock</span>
                      )}
                    </td>
                    <td className="py-3 px-4">{product.unit_of_measurement}</td>
                    <td className="py-3 px-4">{getStockStatus(product.current_stock_quantity || 0)}</td>
                    <td className="py-3 px-4">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(product)}>
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(product.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
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

      <AddProductDialog 
        open={showAddDialog} 
        onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) {
            setEditingProduct(null);
          }
        }}
        editingProduct={editingProduct}
        onProductSaved={() => {
          refetch();
          setEditingProduct(null);
        }}
      />
    </Card>
  );
}
