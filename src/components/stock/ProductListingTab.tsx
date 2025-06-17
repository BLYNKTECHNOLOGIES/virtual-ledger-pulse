
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

  // Fetch products with actual warehouse stock quantities
  const { data: products, isLoading, refetch } = useQuery({
    queryKey: ['products_with_warehouse_stock', searchTerm],
    queryFn: async () => {
      console.log('Fetching products with warehouse stock...');
      
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

      console.log('Raw movements data:', movements);

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
          warehouse_stocks: warehouseStocks
        };
      });

      console.log('Products with calculated stock:', productsWithStock);
      return productsWithStock || [];
    },
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
                      {product.calculated_stock || 0} {product.unit_of_measurement}
                    </td>
                    <td className="py-3 px-4">
                      {product.warehouse_stocks && product.warehouse_stocks.length > 0 ? (
                        <div className="space-y-1">
                          {product.warehouse_stocks.map((ws: any, index: number) => (
                            <div key={index} className="text-xs">
                              <span className="font-medium">{ws.warehouse_name}:</span> {ws.quantity}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400">No stock</span>
                      )}
                    </td>
                    <td className="py-3 px-4">{product.unit_of_measurement}</td>
                    <td className="py-3 px-4">{getStockStatus(product.calculated_stock || 0)}</td>
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
