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
      console.log('🔄 Fetching assets with wallet stock for cards...');
      
      // Sync USDT stock with wallets to ensure accuracy
      console.log('🔄 Syncing USDT stock with wallets...');
      const { error: usdtSyncError } = await supabase.rpc('sync_usdt_stock');
      if (usdtSyncError) {
        console.error('❌ USDT sync failed:', usdtSyncError);
      } else {
        console.log('✅ USDT stock synced successfully');
      }
      
      console.log('✅ Stock sync completed');
      
      // Get all assets
      let query = supabase
        .from('products')
        .select('*');

      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%`);
      }

      const { data: productsData, error: productsError } = await query;
      
      if (productsError) throw productsError;

      // Get wallet stock data for USDT distribution
      console.log('🔄 Fetching wallet data...');
      const { data: wallets, error: walletsError } = await supabase
        .from('wallets')
        .select('*')
        .eq('is_active', true)
        .eq('wallet_type', 'USDT')
        .order('wallet_name');

      if (walletsError) {
        console.error('❌ Error fetching wallets:', walletsError);
        throw walletsError;
      }

      console.log('📊 Wallets data:', wallets);

      // Process each asset to calculate wallet distribution
      const processedAssets = productsData?.map(asset => {
        if (asset.code === 'USDT') {
          // For USDT, calculate total from wallets and wallet distribution
          let totalWalletStock = 0;
          const walletDistribution: any[] = [];
          
          wallets?.forEach(wallet => {
            const balance = wallet.current_balance || 0;
            totalWalletStock += balance;
            
            walletDistribution.push({
              wallet_id: wallet.id,
              wallet_name: wallet.wallet_name,
              quantity: balance,
              percentage: 0 // Will be calculated later
            });
          });
          
          // Calculate percentages and sort by balance (highest first)
          walletDistribution.forEach(dist => {
            dist.percentage = totalWalletStock > 0 ? (dist.quantity / totalWalletStock) * 100 : 0;
          });
          
          // Sort by quantity (highest balance first) and filter out zero balances for display
          walletDistribution.sort((a, b) => b.quantity - a.quantity);
          
          // Use the higher value between synced product stock and calculated wallet stock
          const calculated_stock = Math.max(asset.current_stock_quantity || 0, totalWalletStock);
          
          console.log(`💰 ${asset.name} stock calculation:`, {
            product_stock: asset.current_stock_quantity,
            wallet_total: totalWalletStock,
            calculated_stock,
            wallet_distribution: walletDistribution
          });
          
          return {
            ...asset,
            calculated_stock,
            wallet_stocks: walletDistribution,
            stock_value: calculated_stock * (asset.average_buying_price || asset.cost_price)
          };
        } else {
          // For other products, use current stock quantity
          return {
            ...asset,
            calculated_stock: asset.current_stock_quantity || 0,
            wallet_stocks: [],
            stock_value: (asset.current_stock_quantity || 0) * (asset.average_buying_price || asset.cost_price)
          };
        }
      }) || [];

      // Sort by calculated_stock in descending order (highest stock first)
      processedAssets.sort((a, b) => (b.calculated_stock || 0) - (a.calculated_stock || 0));

      return processedAssets;
    },
    refetchInterval: 10000, // Refetch every 10 seconds for real-time updates
    staleTime: 0, // Always refetch to ensure fresh data
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
                    
                    {/* Wallet Holdings */}
                    {asset.wallet_stocks && asset.wallet_stocks.length > 0 && (
                      <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-4 border border-blue-100">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="p-1.5 bg-blue-500 rounded-lg">
                            <Wallet className="h-3 w-3 text-white" />
                          </div>
                          <span className="font-semibold text-slate-800 text-sm">Portfolio Distribution</span>
                        </div>
                        
                        <div className="grid gap-2">
                          {asset.wallet_stocks
                            .filter((ws: any) => ws.quantity > 0) // Only show wallets with balance
                            .slice(0, 3)
                            .map((ws: any, index: number) => (
                            <div key={index} className="bg-white rounded-lg p-3 shadow-sm border border-blue-100">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 flex-1">
                                  <div className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500"></div>
                                   <div className="flex-1">
                                     <div className="font-medium text-slate-800 text-xs truncate">
                                       {ws.wallet_name}
                                     </div>
                                     <div className="flex items-center gap-1">
                                       <span className="text-slate-500 text-xs">Wallet</span>
                                       <div className="w-1 h-1 rounded-full bg-green-400"></div>
                                     </div>
                                   </div>
                                </div>
                                <div className="text-right">
                                  <div className="font-bold text-slate-800 text-sm">
                                    {parseFloat(ws.quantity.toString()).toLocaleString('en-IN', {
                                      minimumFractionDigits: 0,
                                      maximumFractionDigits: 2
                                    })}
                                  </div>
                                  <div className="text-slate-500 text-xs">
                                    {ws.percentage.toFixed(1)}%
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                          
                          {asset.wallet_stocks.filter((ws: any) => ws.quantity > 0).length > 3 && (
                             <div className="bg-white/50 rounded-lg p-2 text-center border border-blue-100">
                               <span className="text-slate-500 text-xs font-medium">
                                 +{asset.wallet_stocks.filter((ws: any) => ws.quantity > 0).length - 3} more wallets
                               </span>
                             </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Pricing Grid */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-center p-2 bg-red-50 rounded-lg">
                        <div className="text-red-600 text-xs font-medium">Avg Cost</div>
                        <div className="text-red-700 font-bold text-sm">₹{(asset.average_buying_price || asset.cost_price || 0).toFixed(1)}</div>
                      </div>
                      <div className="text-center p-2 bg-green-50 rounded-lg">
                        <div className="text-green-600 text-xs font-medium">Avg Selling</div>
                        <div className="text-green-700 font-bold text-sm">₹{(asset.selling_price || 0).toFixed(1)}</div>
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