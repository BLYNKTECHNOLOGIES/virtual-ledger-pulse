
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Edit, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AddProductDialog } from "./AddProductDialog";

export function ProductListingTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const queryClient = useQueryClient();

  const { data: products, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const filteredProducts = products?.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        <div className="flex items-center space-x-2">
          <Search className="h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8">Loading products...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 p-3 text-left">Product Code</th>
                  <th className="border border-gray-200 p-3 text-left">Product Name</th>
                  <th className="border border-gray-200 p-3 text-left">Category</th>
                  <th className="border border-gray-200 p-3 text-left">Stock Quantity</th>
                  <th className="border border-gray-200 p-3 text-left">Cost Price</th>
                  <th className="border border-gray-200 p-3 text-left">Selling Price</th>
                  <th className="border border-gray-200 p-3 text-left">Status</th>
                  <th className="border border-gray-200 p-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts?.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="border border-gray-200 p-3">{product.code}</td>
                    <td className="border border-gray-200 p-3 font-medium">{product.name}</td>
                    <td className="border border-gray-200 p-3">{product.category}</td>
                    <td className="border border-gray-200 p-3">
                      <span className={product.current_stock_quantity <= product.reorder_level ? "text-red-600 font-semibold" : ""}>
                        {product.current_stock_quantity} {product.unit_of_measurement}
                      </span>
                    </td>
                    <td className="border border-gray-200 p-3">₹{product.cost_price}</td>
                    <td className="border border-gray-200 p-3">₹{product.selling_price}</td>
                    <td className="border border-gray-200 p-3">
                      {product.current_stock_quantity <= product.reorder_level ? (
                        <Badge variant="destructive">Low Stock</Badge>
                      ) : (
                        <Badge variant="secondary">In Stock</Badge>
                      )}
                    </td>
                    <td className="border border-gray-200 p-3">
                      <div className="flex space-x-2">
                        <Button size="sm" variant="outline">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredProducts?.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No products found. Add your first product to get started.
              </div>
            )}
          </div>
        )}
      </CardContent>

      <AddProductDialog 
        open={showAddDialog} 
        onOpenChange={setShowAddDialog}
      />
    </Card>
  );
}
