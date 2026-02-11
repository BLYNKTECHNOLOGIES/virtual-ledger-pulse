import { useState } from "react";
import { useBinanceBalances, useBinanceTickerPrices, COIN_COLORS } from "@/hooks/useBinanceAssets";
import { useProductStockWithCost } from "@/hooks/useWalletStockWithCost";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Eye, EyeOff, AlertTriangle, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AssetDetailPanel } from "./AssetDetailPanel";

export function AssetOverview() {
  const { data: balances, isLoading, error } = useBinanceBalances();
  const { data: prices } = useBinanceTickerPrices();
  const { data: erpProducts } = useProductStockWithCost();
  const [showValues, setShowValues] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);

  // Build ERP stock map by product code
  const erpStockMap = new Map<string, number>();
  erpProducts?.forEach(p => erpStockMap.set(p.product_code, p.total_stock));

  // Calculate USDT equivalent for each asset
  const priceList = Array.isArray(prices) ? prices : [];

  const getUsdtValue = (asset: string, amount: number) => {
    if (asset === "USDT") return amount;
    if (priceList.length === 0) return null;
    const ticker = priceList.find((p) => p.symbol === `${asset}USDT`);
    if (ticker) return amount * parseFloat(ticker.price);
    return null;
  };

  const balanceList = Array.isArray(balances) ? balances : [];

  const totalValue = balanceList.reduce((sum, b) => {
    const val = getUsdtValue(b.asset, b.total_balance);
    return sum + (val || 0);
  }, 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading balances from Binance...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="py-8 text-center">
          <AlertTriangle className="h-8 w-8 mx-auto text-destructive mb-2" />
          <p className="text-sm text-destructive">Failed to load balances: {error.message}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Total Value Header */}
      <Card className="bg-card border-border">
        <CardContent className="py-5 px-5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">Est. Total Value</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setShowValues(!showValues)}
            >
              {showValues ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground tabular-nums">
              {showValues ? totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "****"}
            </span>
            <span className="text-sm text-muted-foreground">USDT</span>
          </div>
        </CardContent>
      </Card>

      {/* Asset List */}
      <Card className="bg-card border-border">
        <CardHeader className="py-3 px-4 border-b border-border">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Crypto Assets</CardTitle>
            <span className="text-[10px] text-muted-foreground">{balanceList.length} assets</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {balanceList.map((asset) => {
              const usdtVal = getUsdtValue(asset.asset, asset.total_balance);
              const color = COIN_COLORS[asset.asset] || "#888";

              return (
                <button
                  key={asset.asset}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/5 transition-colors text-left"
                  onClick={() => setSelectedAsset(asset.asset)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ backgroundColor: color }}
                    >
                      {asset.asset.slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{asset.asset}</p>
                      {asset.total_locked > 0 && (
                        <p className="text-[10px] text-amber-400">
                          🔒 {asset.total_locked.toFixed(8)} locked
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-foreground tabular-nums">
                      {showValues ? asset.total_balance.toFixed(8) : "****"}
                    </p>
                    <p className="text-[10px] text-muted-foreground tabular-nums">
                      {showValues
                        ? asset.asset === "USDT"
                          ? `≈ ${asset.total_balance.toFixed(4)} USDT`
                          : usdtVal !== null
                            ? `≈ ${usdtVal.toFixed(4)} USDT`
                            : "≈ -- USDT"
                        : "****"}
                    </p>
                    {showValues && (() => {
                      const erpStock = erpStockMap.get(asset.asset);
                      if (erpStock === undefined) return null;
                      const diff = erpStock - asset.total_balance;
                      const hasMismatch = Math.abs(diff) > 0.001;
                      return (
                        <Tooltip>
                          <TooltipTrigger>
                            <p className={`text-[9px] tabular-nums flex items-center justify-end gap-0.5 ${hasMismatch ? 'text-amber-400' : 'text-muted-foreground/60'}`}>
                              <Package className="h-2.5 w-2.5" />
                              ERP: {erpStock.toFixed(4)}
                              {hasMismatch && (
                                <span className={diff > 0 ? 'text-green-400' : 'text-red-400'}>
                                  ({diff > 0 ? '+' : ''}{diff.toFixed(4)})
                                </span>
                              )}
                            </p>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">ERP Inventory: {erpStock.toFixed(4)}</p>
                            <p className="text-xs">Binance API: {asset.total_balance.toFixed(4)}</p>
                            {hasMismatch && <p className="text-xs text-amber-400">Difference: {diff.toFixed(4)}</p>}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })()}
                  </div>
                </button>
              );
            })}
            {balanceList.length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No assets found
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Asset Detail Panel */}
      {selectedAsset && (
        <AssetDetailPanel
          asset={selectedAsset}
          balances={balanceList}
          onClose={() => setSelectedAsset(null)}
        />
      )}
    </div>
  );
}
