
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Package, DollarSign } from "lucide-react";
import { AddProductDialog } from "./AddProductDialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StockStatusBadge } from "./StockStatusBadge";
import { useProductStockSummary, useSyncProductStock } from "@/hooks/useWarehouseStock";

export function ProductListingTab() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const { data: productStockSummaries } = useProductStockSummary();
  const { syncStock } = useSyncProductStock();

  // Fetch products from database
  const { data: products, isLoading, refetch } = useQuery({
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

  // Auto-sync product stock with warehouse totals
  useEffect(() => {
    if (productStockSummaries && productStockSummaries.length > 0) {
      syncStock();
    }
  }, [productStockSummaries]);

  const getStockBadgeVariant = (stock: number) => {
    if (stock === 0) return "destructive";
    if (stock < 10) return "secondary";
    return "default";
  };

  const getTotalStock = (productId: string) => {
    const productStock = productStockSummaries?.find(p => p.product_id === productId);
    return productStock?.total_stock || 0;
  };

  const handleProductAdded = () => {
    refetch();
    setShowAddDialog(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Product Listing</h2>
          <p className="text-gray-600">Manage your product inventory and stock levels</p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Product
        </Button>
      </div>

      {/* Search Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-4">
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
        </CardContent>
      </Card>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full text-center py-8">Loading products...</div>
        ) : products?.length === 0 ? (
          <div className="col-span-full text-center py-8 text-gray-500">
            No products found. Add your first product to get started.
          </div>
        ) : (
          products?.map((product) => {
            const totalStock = getTotalStock(product.id);
            
            return (
              <Card key={product.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg font-semibold text-gray-900">
                        {product.name}
                      </CardTitle>
                      <p className="text-sm text-gray-500 mt-1">Code: {product.code}</p>
                    </div>
                    <Package className="h-5 w-5 text-gray-400" />
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  {/* Stock Information */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-600">Current Stock:</span>
                      <Badge variant={getStockBadgeVariant(totalStock)}>
                        {totalStock} {product.unit_of_measurement}
                      </Badge>
                    </div>
                    
                    {/* Warehouse Breakdown */}
                    <div className="mt-2">
                      <StockStatusBadge 
                        productId={product.id}
                        showWarehouseBreakdown={true}
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* Price Information */}
                  <div className="space-y-2 pt-3 border-t">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Cost Price:</span>
                      <span className="text-sm font-medium">₹{product.cost_price}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Selling Price:</span>
                      <span className="text-sm font-medium text-green-600">₹{product.selling_price}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Avg. Buying:</span>
                      <span className="text-sm font-medium">₹{product.average_buying_price || 0}</span>
                    </div>
                  </div>

                  {/* Statistics */}
                  <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                    <div className="text-center">
                      <p className="text-lg font-semibold text-blue-600">{product.total_purchases || 0}</p>
                      <p className="text-xs text-gray-500">Total Purchases</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold text-green-600">{product.total_sales || 0}</p>
                      <p className="text-xs text-gray-500">Total Sales</p>
                    </div>
                  </div>

                  {/* Stock Value */}
                  <div className="flex items-center justify-between pt-3 border-t">
                    <span className="text-sm font-medium text-gray-600">Stock Value:</span>
                    <div className="flex items-center gap-1">
                      <DollarSign className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-semibold text-green-600">
                        ₹{(totalStock * (product.average_buying_price || product.cost_price)).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <AddProductDialog 
        open={showAddDialog} 
        onOpenChange={setShowAddDialog}
      />
    </div>
  );
}
