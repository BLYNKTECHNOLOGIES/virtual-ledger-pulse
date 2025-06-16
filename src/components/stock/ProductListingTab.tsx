
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Edit, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AddProductDialog } from "./AddProductDialog";

export function ProductListingTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', searchTerm],
    queryFn: async () => {
      let query = supabase
        .from('products')
        .select(`
          *,
          warehouses:warehouse_id(name, location)
        `)
        .order('name');

      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const getStockStatus = (currentStock: number) => {
    if (currentStock === 0) {
      return <Badge variant="destructive">Out of Stock</Badge>;
    } else if (currentStock <= 10) {
      return <Badge className="bg-yellow-100 text-yellow-800">Low Stock</Badge>;
    } else {
      return <Badge className="bg-green-100 text-green-800">In Stock</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Product Inventory</CardTitle>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2 mb-6">
            <Search className="h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search products by name or code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>

          {isLoading ? (
            <div className="text-center py-8">Loading products...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Product Code</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Product Name</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Warehouse</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Current Stock</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Avg Buying Price</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Avg Selling Price</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Total Purchases</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products?.map((product) => (
                    <tr key={product.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4 font-mono text-sm">{product.code}</td>
                      <td className="py-3 px-4 font-medium">{product.name}</td>
                      <td className="py-3 px-4">
                        {product.warehouses ? (
                          <div>
                            <div className="font-medium">{product.warehouses.name}</div>
                            <div className="text-sm text-gray-500">{product.warehouses.location}</div>
                          </div>
                        ) : (
                          <span className="text-gray-400">No warehouse assigned</span>
                        )}
                      </td>
                      <td className="py-3 px-4">{product.current_stock_quantity} {product.unit_of_measurement}</td>
                      <td className="py-3 px-4">₹{product.average_buying_price || product.cost_price}</td>
                      <td className="py-3 px-4">₹{product.average_selling_price || product.selling_price}</td>
                      <td className="py-3 px-4">{product.total_purchases || 0}</td>
                      <td className="py-3 px-4">
                        {getStockStatus(product.current_stock_quantity)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Trash2 className="h-4 w-4" />
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
      </Card>

      <AddProductDialog open={showAddDialog} onOpenChange={setShowAddDialog} />
    </div>
  );
}
