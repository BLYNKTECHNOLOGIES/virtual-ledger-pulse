
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Package, Search, Plus, TrendingUp, Building, DollarSign, AlertTriangle } from "lucide-react";
import { AddProductDialog } from "./AddProductDialog";
import { StockStatusBadge } from "./StockStatusBadge";
import { useProductStockWithCost } from "@/hooks/useWalletStockWithCost";
import { useBinanceBalances } from "@/hooks/useBinanceAssets";

export function ProductCardListingTab() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [, setSearchParams] = useSearchParams();
  
  const { data: productsWithStock, isLoading } = useProductStockWithCost();
  const { data: binanceBalances } = useBinanceBalances();

  // Build a map of Binance total balances by asset for reference comparison
  const binanceBalanceMap = new Map<string, number>();
  binanceBalances?.forEach(b => {
    binanceBalanceMap.set(b.asset, b.total_balance);
  });

  // Also fetch products that might not have stock yet  
  const { data: allProducts } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  // Combine products with stock data
  const combinedProducts = allProducts?.map(product => {
    const stockInfo = productsWithStock?.find(p => p.product_code === product.code);
    return {
      ...product,
      total_stock: stockInfo?.total_stock || 0,
      average_cost: stockInfo?.average_cost || 0,
      total_value: stockInfo?.total_value || 0,
      wallet_stocks: stockInfo?.wallet_stocks || []
    };
  }) || [];

  const filteredProducts = combinedProducts
    .filter(product =>
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.code.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => b.total_stock - a.total_stock);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Asset Inventory</h2>
          <p className="text-gray-600 mt-1">Manage your asset holdings and inventory levels</p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add New Asset
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          placeholder="Search assets by name or code..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProducts.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No assets found</h3>
            <p className="text-gray-500 mb-4">
              {searchQuery ? 'Try adjusting your search terms' : 'Start by adding your first asset'}
            </p>
            {!searchQuery && (
              <Button onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Asset
              </Button>
            )}
          </div>
        ) : (
          filteredProducts.map((product) => (
            <Card key={product.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg font-semibold text-gray-900">
                      {product.name}
                    </CardTitle>
                    <Badge variant="outline" className="text-xs">
                      #{product.code}
                    </Badge>
                  </div>
                <div className="flex flex-col items-end gap-1">
                  <StockStatusBadge currentStock={product.total_stock} />
                </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      In Stock
                    </span>
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-lg text-green-600">
                        {product.total_stock.toFixed(2)} {product.unit_of_measurement}
                      </p>
                      {(() => {
                        const binanceBalance = binanceBalanceMap.get(product.code);
                        if (binanceBalance === undefined) return null;
                        const diff = binanceBalance - product.total_stock;
                        if (Math.abs(diff) <= 5) return null;
                        return (
                          <Tooltip>
                            <TooltipTrigger>
                              <span className="text-xs font-bold text-red-500 animate-pulse">
                                {diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">API Balance: {binanceBalance.toFixed(2)}</p>
                              <p className="text-xs text-red-400">ERP vs Binance mismatch</p>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })()}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-500 flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      Avg Cost
                    </span>
                    <p className="font-semibold text-lg text-blue-600">
                      ₹{product.average_cost.toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Avg Selling:</span>
                    <span className="font-medium text-green-700">₹377.52</span>
                  </div>
                  <div className="flex justify-between items-center text-sm mt-1">
                    <span className="text-gray-500">Holdings Value:</span>
                    <span className="font-bold text-purple-600">₹{product.total_value.toFixed(0)}</span>
                  </div>
                </div>

                {product.wallet_stocks.length > 0 && (
                  <div className="border-t pt-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Building className="h-4 w-4 text-gray-500" />
                      <span className="text-sm font-medium text-gray-700">Portfolio Distribution</span>
                    </div>
                     <div className="space-y-1">
                      {product.wallet_stocks
                        .sort((a, b) => b.balance - a.balance) // Sort from highest to lowest stock
                        .map((wallet, index) => (
                        <div key={wallet.wallet_id} className="flex justify-between items-center text-xs">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                            <span className="text-gray-600">{wallet.wallet_name}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-medium">{wallet.balance.toFixed(2)}</span>
                            <span className="text-gray-500 ml-1">₹{wallet.value.toFixed(0)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2 border-t">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1"
                    onClick={() => setSearchParams({ tab: 'warehouse' })}
                  >
                    <TrendingUp className="h-3 w-3 mr-1" />
                    View Details
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <AddProductDialog 
        open={isAddDialogOpen} 
        onOpenChange={setIsAddDialogOpen}
      />
    </div>
  );
}
