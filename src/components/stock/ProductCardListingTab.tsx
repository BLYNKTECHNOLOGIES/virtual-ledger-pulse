
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Package, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AddProductDialog } from "./AddProductDialog";

export function ProductCardListingTab() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch assets with actual wallet stock quantities
  const { data: assets, isLoading, refetch } = useQuery({
    queryKey: ['assets_with_wallet_stock_cards', searchTerm],
    queryFn: async () => {
      console.log('Fetching assets with wallet stock for cards...');
      
      // Sync stock data first
      await supabase.rpc('sync_product_warehouse_stock');
      
      // Get all assets
      let query = supabase
        .from('products')
        .select('*')
        .order('name');

      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%`);
      }

      const { data: assetsData, error: assetsError } = await query;
      
      if (assetsError) throw assetsError;

      // Get wallet stock movements to calculate actual stock breakdown
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

      // Calculate actual stock per asset per wallet
      const stockMap = new Map<string, Map<string, number>>();
      
      movements?.forEach(movement => {
        if (!stockMap.has(movement.product_id)) {
          stockMap.set(movement.product_id, new Map());
        }
        
        const assetStocks = stockMap.get(movement.product_id)!;
        const walletId = movement.warehouse_id;
        
        if (!assetStocks.has(walletId)) {
          assetStocks.set(walletId, 0);
        }
        
        const currentStock = assetStocks.get(walletId)!;
        
        if (movement.movement_type === 'IN' || movement.movement_type === 'ADJUSTMENT') {
          assetStocks.set(walletId, currentStock + movement.quantity);
        } else if (movement.movement_type === 'OUT' || movement.movement_type === 'TRANSFER') {
          assetStocks.set(walletId, Math.max(0, currentStock - movement.quantity));
        }
      });

      // Attach calculated stock breakdown to assets
      const assetsWithStock = assetsData?.map((asset) => {
        const assetStocks = stockMap.get(asset.id);
        const walletStocks: Array<{wallet_id: string, wallet_name: string, linked_to: string, quantity: number}> = [];
        
        if (assetStocks) {
          assetStocks.forEach((quantity, walletId) => {
            const wallet = movements?.find(m => m.warehouse_id === walletId)?.warehouses;
            walletStocks.push({
              wallet_id: walletId,
              wallet_name: wallet?.name || 'Unknown',
              linked_to: 'Exchange', // Default linking
              quantity
            });
          });
        }

        return {
          ...asset,
          calculated_stock: asset.current_stock_quantity, // Use synced value
          wallet_stocks: walletStocks,
          stock_value: asset.current_stock_quantity * (asset.average_buying_price || asset.cost_price)
        };
      }) || [];

      return assetsWithStock;
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
            <h1 className="text-4xl font-bold text-slate-800 mb-2">Asset Inventory</h1>
            <p className="text-slate-600 text-lg">Manage your asset holdings and inventory levels</p>
          </div>
          <Button 
            onClick={() => setShowAddDialog(true)} 
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
          >
            <Plus className="h-5 w-5 mr-2" />
            Add New Asset
          </Button>
        </div>
        
        {/* Search Section */}
        <div className="mb-8">
          <div className="relative max-w-lg">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 h-5 w-5" />
            <Input
              placeholder="Search assets by name or code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 py-4 bg-white border-slate-200 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Assets Grid */}
        {isLoading ? (
          <div className="text-center py-16">
            <div className="text-slate-500 text-lg">Loading assets...</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {assets?.map((asset) => {
              const stockStatus = getStockStatus(asset.calculated_stock || 0);
              return (
                <Card key={asset.id} className="bg-white rounded-xl shadow-md hover:shadow-lg transition-all duration-200 border-0 overflow-hidden group hover:scale-102">
                  <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50 pb-3 px-4 pt-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg font-bold text-slate-800 mb-1 group-hover:text-blue-600 transition-colors truncate">
                          {asset.name}
                        </CardTitle>
                        <p className="text-slate-500 text-xs font-medium">#{asset.code}</p>
                      </div>
                      <div className="p-2 bg-white rounded-lg shadow-sm ml-2 flex-shrink-0">
                        <Package className="h-4 w-4 text-blue-500" />
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="p-4 space-y-3">
                    {/* Stock Status */}
                    <div className="text-center">
                      <div className={`inline-flex items-center px-3 py-1 rounded-full border ${stockStatus.color} font-medium text-xs`}>
                        {stockStatus.label}
                      </div>
                      <div className="mt-2">
                        <span className="text-xl font-bold text-slate-800">
                          {parseFloat((asset.calculated_stock || 0).toString()).toLocaleString('en-IN', {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2
                          })}
                        </span>
                        <span className="text-slate-500 ml-1 text-sm">Nos</span>
                      </div>
                    </div>
                    
                    {/* Wallet Breakdown */}
                    {asset.wallet_stocks && asset.wallet_stocks.length > 0 && (
                      <div className="bg-slate-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Wallet className="h-3 w-3 text-slate-600" />
                          <span className="font-semibold text-slate-700 text-xs">Wallet Holdings</span>
                        </div>
                        <div className="space-y-1">
                          {asset.wallet_stocks.slice(0, 2).map((ws: any, index: number) => (
                            <div key={index} className="space-y-1">
                              <div className="flex justify-between items-center">
                                <span className="text-slate-600 text-xs truncate">Wallet: {ws.wallet_name}</span>
                                 <span className="font-semibold text-slate-800 text-xs">
                                   {parseFloat(ws.quantity.toString()).toLocaleString('en-IN', {
                                     minimumFractionDigits: 0,
                                     maximumFractionDigits: 2
                                   })}
                                 </span>
                              </div>
                              <div className="text-slate-500 text-xs">Linked to: {ws.linked_to}</div>
                            </div>
                          ))}
                          {asset.wallet_stocks.length > 2 && (
                            <div className="text-center text-slate-500 text-xs">
                              +{asset.wallet_stocks.length - 2} more wallets
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Pricing Grid */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-center p-2 bg-red-50 rounded-lg">
                        <div className="text-red-600 text-xs font-medium">Cost</div>
                        <div className="text-red-700 font-bold text-sm">₹{asset.cost_price}</div>
                      </div>
                      <div className="text-center p-2 bg-green-50 rounded-lg">
                        <div className="text-green-600 text-xs font-medium">Selling</div>
                        <div className="text-green-700 font-bold text-sm">₹{asset.selling_price}</div>
                      </div>
                    </div>
                    
                    {/* Trading Stats */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <TrendingDown className="h-3 w-3 text-blue-500" />
                          <span className="text-blue-600 font-semibold text-sm">{asset.total_purchases || 0}</span>
                        </div>
                        <div className="text-slate-500 text-xs">Buys</div>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <TrendingUp className="h-3 w-3 text-green-500" />
                          <span className="text-green-600 font-semibold text-sm">{asset.total_sales || 0}</span>
                        </div>
                        <div className="text-slate-500 text-xs">Sells</div>
                      </div>
                    </div>
                    
                    {/* Holdings Value */}
                    <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-2 text-center">
                      <div className="text-slate-600 text-xs font-medium">Holdings Value</div>
                      <div className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
                        ₹{(asset.stock_value || 0).toLocaleString('en-IN', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0
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
        {assets?.length === 0 && (
          <div className="text-center py-16">
            <div className="text-slate-400 text-xl">No assets found</div>
            <p className="text-slate-500 mt-2">Add your first asset to get started with portfolio management</p>
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
