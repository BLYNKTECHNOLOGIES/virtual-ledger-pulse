
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
import { useBinanceBalancesByWallet } from "@/hooks/useBinanceAssets";
import { useCoinMarketRates, isStableCoin } from "@/hooks/useCoinMarketRates";
import { useUSDTRate } from "@/hooks/useUSDTRate";

import { isAdjustmentWallet } from "@/lib/adjustment-accounts";

export function ProductCardListingTab() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [, setSearchParams] = useSearchParams();
  
  const { data: productsWithStock, isLoading } = useProductStockWithCost();
  // Live per-wallet Binance balances (funding + spot) for API-linked wallets,
  // keyed by wallet_id. Refreshed every ~15 min (reference-only, never patches).
  const { data: walletApiBalances } = useBinanceBalancesByWallet();
  const { data: marketRates } = useCoinMarketRates();
  const { data: usdtRate } = useUSDTRate();

  // INR value per unit for a given asset:
  // - Stablecoins (USDT/USDC): keep weighted-average cost
  // - Other coins: actual market value = coinUSDTprice × USDT→INR rate
  const usdtInr = usdtRate?.rate || 0;
  const getUnitValueINR = (code: string, avgCost: number): number => {
    if (isStableCoin(code)) return avgCost;
    const marketUsdt = marketRates?.[code.toUpperCase()];
    if (marketUsdt && usdtInr > 0) return marketUsdt * usdtInr;
    return avgCost; // fallback when market/INR rate unavailable
  };

  // Names of API-linked wallets (wallet_id → wallet_name) for injected rows.
  const { data: linkedWalletLinks } = useQuery({
    queryKey: ['terminal-wallet-links-active'],
    queryFn: async () => {
      const { data: links, error } = await supabase
        .from('terminal_wallet_links')
        .select('wallet_id')
        .eq('status', 'active');
      if (error) throw error;
      const ids = (links || []).map((l) => l.wallet_id).filter(Boolean) as string[];
      if (ids.length === 0) return [] as { wallet_id: string; wallet_name: string }[];
      const { data: wallets, error: wErr } = await supabase
        .from('wallets')
        .select('id, wallet_name')
        .in('id', ids);
      if (wErr) throw wErr;
      const nameById = new Map((wallets || []).map((w) => [w.id, w.wallet_name]));
      return ids.map((id) => ({ wallet_id: id, wallet_name: nameById.get(id) || 'API WALLET' }));
    },
  });
  const linkedWalletNames: Record<string, string> = {};
  (linkedWalletLinks || []).forEach((l) => {
    if (l.wallet_id) linkedWalletNames[l.wallet_id] = l.wallet_name || 'API WALLET';
  });

  // All API-linked wallet ids (each maps to a Binance exchange account, e.g.
  // BINANCE BLYNK and BINANCE ASEC). Used to know which wallets get a diff badge.
  const apiLinkedWalletIds = Object.keys(walletApiBalances || {});

  // Live Binance balance for a specific wallet + asset (funding + spot combined).
  const getWalletApiBalance = (walletId: string | undefined, code: string): number | undefined => {
    if (!walletId || !walletApiBalances) return undefined;
    const byAsset = walletApiBalances[walletId];
    if (!byAsset) return undefined;
    return byAsset[code.toUpperCase()] ?? byAsset[code];
  };


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

  // Combine products with stock data — exclude the Balance Adjustment Wallet
  // everywhere except the Wallets tab in Stock Management.
  const combinedProducts = allProducts?.map(product => {
    const stockInfo = productsWithStock?.find(p => p.product_code === product.code);

    // Per-unit INR value: market value for non-stablecoins, avg cost otherwise.
    const unitValueINR = getUnitValueINR(product.code, stockInfo?.average_cost || 0);

    const filteredWalletStocks = (stockInfo?.wallet_stocks || [])
      .filter(w => !isAdjustmentWallet(w.wallet_name))
      .map(w => {
        const balance = Math.abs(w.balance) < 1e-10 ? 0 : w.balance;
        return {
          ...w,
          balance,
          value: balance * unitValueINR,
        };
      });

    // Recompute totals from filtered wallets so adjustment wallet
    // doesn't inflate stock / holdings value shown on the card.
    const recomputedStock = filteredWalletStocks.reduce((s, w) => s + (w.balance || 0), 0);
    const recomputedValue = filteredWalletStocks.reduce((s, w) => s + (w.value || 0), 0);
    const clampedStock = Math.abs(recomputedStock) < 1e-10 ? 0 : Math.max(0, recomputedStock);

    return {
      ...product,
      total_stock: clampedStock,
      average_cost: stockInfo?.average_cost || 0,
      total_value: clampedStock === 0 ? 0 : recomputedValue,
      wallet_stocks: filteredWalletStocks,
    };
  }) || [];

  const filteredProducts = combinedProducts
    .filter(product =>
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.code.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => b.total_stock - a.total_stock);

  // Valuation summary (merged from the former Valuation tab) — computed from the
  // same useProductStockWithCost hook so the figures are byte-identical.
  const valuationProducts = productsWithStock || [];
  const activeValuationProducts = valuationProducts.filter((p) => p.total_stock > 0);
  const totalInventoryValue = activeValuationProducts.reduce((sum, p) => sum + p.total_value, 0);
  const totalValuationUnits = activeValuationProducts.reduce((sum, p) => sum + p.total_stock, 0);
  const lowStockItems = activeValuationProducts.filter((p) => p.total_stock <= 10 && p.total_stock > 0).length;
  const zeroStockItems = valuationProducts.length - activeValuationProducts.length;


  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-info/20"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Asset Inventory</h2>
          <p className="text-muted-foreground mt-1">Manage your asset holdings and inventory levels</p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add New Asset
        </Button>
      </div>

      {/* Valuation summary cards (merged from the former Valuation tab) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Inventory Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{totalInventoryValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground">Based on average buying price</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{valuationProducts.length}</div>
            <p className="text-xs text-muted-foreground">
              {totalValuationUnits.toLocaleString(undefined, { maximumFractionDigits: 4 })} total units across {activeValuationProducts.length} active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stock Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{zeroStockItems}</div>
            <p className="text-xs text-muted-foreground">{lowStockItems} low stock items</p>
          </CardContent>
        </Card>
      </div>


      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
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
            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No assets found</h3>
            <p className="text-muted-foreground mb-4">
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
            <Card key={product.id} className="hover:shadow-sm transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg font-semibold text-foreground">
                      {product.name}
                    </CardTitle>
                  </div>
                <div className="flex flex-col items-end gap-1">
                  <StockStatusBadge currentStock={product.total_stock} />
                </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      In Stock
                    </span>
                    <p className="font-semibold text-lg text-success">
                      {product.total_stock.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      Avg Cost
                    </span>
                    <p className="font-semibold text-lg text-info">
                      ₹{product.average_cost.toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Holdings Value:</span>
                    <span className="font-bold text-primary">₹{product.total_value.toFixed(2)}</span>
                  </div>
                </div>

                {/* Portfolio Distribution */}
                {(() => {
                  const walletStocks = [...(product.wallet_stocks || [])];

                  // For each API-linked wallet that holds this asset on Binance but
                  // isn't present in the ERP wallet list yet, inject it with balance
                  // 0 so the diff badge still surfaces the discrepancy.
                  apiLinkedWalletIds.forEach((linkedId) => {
                    const apiBal = getWalletApiBalance(linkedId, product.code);
                    const inList = walletStocks.some((w) => w.wallet_id === linkedId);
                    if (apiBal && apiBal > 0.00001 && !inList) {
                      walletStocks.push({
                        wallet_id: linkedId,
                        wallet_name: linkedWalletNames[linkedId] || 'API WALLET',
                        balance: 0,
                        value: 0,
                      });
                    }
                  });

                  if (walletStocks.length === 0) return null;
                  
                  return (
                    <div className="border-t pt-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Building className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground">Wallet Distribution</span>
                      </div>
                      <div className="space-y-1">
                        {walletStocks
                          .sort((a, b) => b.balance - a.balance)
                          .map((wallet) => (
                          <div key={wallet.wallet_id} className="flex justify-between items-center text-xs">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-info"></div>
                              <span className="text-muted-foreground">{wallet.wallet_name}</span>
                            </div>
                            <div className="text-right flex items-center gap-1.5">
                              {(() => {
                                const bBal = getWalletApiBalance(wallet.wallet_id, product.code);
                                if (bBal === undefined) return null;
                                const diff = bBal - wallet.balance;
                                // For USDT, ignore small discrepancies below 10; other assets use a tiny epsilon.
                                const minDiff = product.code.toUpperCase() === 'USDT' ? 10 : 0.00001;
                                if (Math.abs(diff) < minDiff) return null;
                                return (
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <span className={`text-[10px] font-bold ${diff > 0 ? 'text-warning' : 'text-destructive'}`}>
                                        {diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2)}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs">Binance Balance: {bBal.toFixed(2)}</p>
                                      <p className="text-xs">ERP Balance: {(Number(wallet.balance) || 0).toFixed(2)}</p>
                                      <p className="text-xs text-warning">Difference from Binance API (funding + spot)</p>
                                    </TooltipContent>
                                  </Tooltip>
                                );
                              })()}
                              <span className="font-medium">{wallet.balance.toFixed(2)}</span>
                              <span className="text-muted-foreground ml-1">₹{wallet.value.toFixed(2)}</span>
                            </div>

                          </div>
                        ))}

                      </div>
                    </div>
                  );
                })()}

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
