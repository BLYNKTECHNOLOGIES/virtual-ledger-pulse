import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useWalletStock } from "@/hooks/useWalletStock";

export function ProductListingTab() {
  // Fetch products
  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ['products_with_wallet_stock'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *
        `)
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  // Use wallet stock data
  const { data: walletStock, isLoading: walletLoading } = useWalletStock();

  if (productsLoading || walletLoading) {
    return <div>Loading products and wallet data...</div>;
  }

  if (!products || products.length === 0) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Products Found</h3>
        <p className="text-gray-600">Add some products to get started.</p>
      </div>
    );
  }

  // Group wallet stock by product for USDT
  const getWalletStockForProduct = (productCode: string) => {
    if (productCode === 'USDT') {
      return walletStock || [];
    }
    return [];
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Product Inventory</h2>
      </div>
      
      <div className="grid gap-4">
        {products.map((product) => {
          const walletStocks = getWalletStockForProduct(product.code);
          const totalWalletStock = walletStocks.reduce((sum, w) => sum + w.current_balance, 0);
          
          return (
            <Card key={product.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{product.name} ({product.code})</span>
                  <div className="flex gap-2">
                    <Badge variant={product.current_stock_quantity > 0 ? "default" : "destructive"}>
                      Stock: {product.current_stock_quantity}
                    </Badge>
                    {product.code === 'USDT' && (
                      <Badge variant="outline">
                        Wallet Total: {totalWalletStock}
                      </Badge>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Unit:</span> {product.unit_of_measurement}
                  </div>
                  <div>
                    <span className="font-medium">Code:</span> {product.code}
                  </div>
                  <div>
                    <span className="font-medium">Cost Price:</span> ₹{product.cost_price}
                  </div>
                  <div>
                    <span className="font-medium">Selling Price:</span> ₹{product.selling_price}
                  </div>
                </div>

                {/* Show wallet distribution for USDT */}
                {product.code === 'USDT' && walletStocks.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-medium mb-2">Wallet Distribution:</h4>
                    <div className="grid gap-2">
                      {walletStocks.map((wallet) => (
                        <div key={wallet.wallet_id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                          <span className="text-sm">{wallet.wallet_name}</span>
                          <Badge variant="outline">
                            {wallet.current_balance} USDT
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}