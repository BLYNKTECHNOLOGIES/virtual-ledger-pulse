
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useWalletAssetPositions } from "@/hooks/useWalletAssetPositions";
import { fetchCoinMarketRate } from "@/hooks/useCoinMarketRate";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatSmartDecimal } from "@/lib/format-smart-decimal";
import { Briefcase, TrendingUp, TrendingDown, RefreshCw, Loader2 } from "lucide-react";

export function PortfolioSnapshot() {
  const [walletId, setWalletId] = useState<string>("all");

  const { data: positions = [], isLoading } = useWalletAssetPositions(
    walletId === "all" ? undefined : walletId
  );

  const { data: wallets = [] } = useQuery({
    queryKey: ['wallets-active'],
    queryFn: async () => {
      const { data } = await supabase.from('wallets').select('id, wallet_name').eq('is_active', true).order('wallet_name');
      return data || [];
    },
  });

  const activePositions = positions.filter(p => Number(p.qty_on_hand) > 0);

  // Auto-fetch live market rates for all unique assets
  const uniqueAssets = [...new Set(activePositions.map(p => p.asset_code))];

  const { data: liveRates = {}, isLoading: ratesLoading, refetch: refetchRates } = useQuery({
    queryKey: ['live-market-rates', uniqueAssets.join(',')],
    queryFn: async () => {
      const rates: Record<string, number> = {};
      await Promise.all(
        uniqueAssets.map(async (asset) => {
          rates[asset] = await fetchCoinMarketRate(asset);
        })
      );
      return rates;
    },
    enabled: uniqueAssets.length > 0,
    refetchInterval: 30000, // Refresh every 30s
    staleTime: 15000,
  });

  const getMarketRate = (assetCode: string) => liveRates[assetCode] || 0;

  const totals = activePositions.reduce((acc, p) => {
    const qty = Number(p.qty_on_hand);
    const avgCost = Number(p.avg_cost_usdt);
    const costValue = qty * avgCost;
    const marketRate = getMarketRate(p.asset_code);
    const marketValue = marketRate > 0 ? qty * marketRate : 0;
    const unrealized = marketRate > 0 ? marketValue - costValue : 0;

    return {
      costValue: acc.costValue + costValue,
      marketValue: acc.marketValue + (marketRate > 0 ? marketValue : costValue),
      unrealized: acc.unrealized + unrealized,
    };
  }, { costValue: 0, marketValue: 0, unrealized: 0 });

  const unrealizedPct = totals.costValue > 0 ? (totals.unrealized / totals.costValue) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Briefcase className="h-5 w-5" />
            Portfolio Snapshot (Mark-to-Market)
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchRates()}
              disabled={ratesLoading}
              className="gap-1"
            >
              {ratesLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
            <Label className="text-xs">Wallet</Label>
            <Select value={walletId} onValueChange={setWalletId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All wallets" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Wallets</SelectItem>
                {wallets.map((w: any) => (
                  <SelectItem key={w.id} value={w.id}>{w.wallet_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {ratesLoading && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Fetching live rates from Binance...
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Inventory Cost (USDT)</p>
            <p className="text-xl font-bold font-mono">${formatSmartDecimal(totals.costValue, 2)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Market Value (USDT)</p>
            <p className="text-xl font-bold font-mono">${formatSmartDecimal(totals.marketValue, 2)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Unrealized P&L</p>
            <p className={`text-xl font-bold font-mono ${totals.unrealized >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {totals.unrealized >= 0 ? '+' : ''}${formatSmartDecimal(totals.unrealized, 2)}
              <span className="text-sm ml-1">({unrealizedPct >= 0 ? '+' : ''}{unrealizedPct.toFixed(2)}%)</span>
            </p>
          </div>
        </div>

        {isLoading ? (
          <p className="text-center py-8 text-muted-foreground">Loading...</p>
        ) : activePositions.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">No active positions</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead className="text-right">Qty On Hand</TableHead>
                  <TableHead className="text-right">Avg Cost (USDT)</TableHead>
                  <TableHead className="text-right">Cost Basis</TableHead>
                  <TableHead className="text-right">Live Rate</TableHead>
                  <TableHead className="text-right">Market Value</TableHead>
                  <TableHead className="text-right">Unrealized P&L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activePositions.map((p) => {
                  const qty = Number(p.qty_on_hand);
                  const avgCost = Number(p.avg_cost_usdt);
                  const costValue = qty * avgCost;
                  const marketRate = getMarketRate(p.asset_code);
                  const marketValue = marketRate > 0 ? qty * marketRate : 0;
                  const unrealized = marketRate > 0 ? marketValue - costValue : 0;
                  const pctChange = costValue > 0 ? (unrealized / costValue) * 100 : 0;

                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        {p.asset_code}
                        {p.asset_code === 'USDT' && <Badge variant="outline" className="ml-2 text-[10px]">Stable</Badge>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatSmartDecimal(qty)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">${formatSmartDecimal(avgCost)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">${formatSmartDecimal(costValue, 4)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {marketRate > 0 ? (
                          <span className="text-blue-600">${formatSmartDecimal(marketRate)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {marketRate > 0 ? `$${formatSmartDecimal(marketValue, 4)}` : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {marketRate > 0 ? (
                          <span className={`font-mono text-xs flex items-center justify-end gap-1 ${unrealized >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {unrealized >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {unrealized >= 0 ? '+' : ''}${formatSmartDecimal(unrealized, 4)}
                            <span className="text-[10px] opacity-70">({pctChange >= 0 ? '+' : ''}{pctChange.toFixed(2)}%)</span>
                          </span>
                        ) : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground text-right">
          Live rates auto-refresh every 30s • Unrealized P&L is display-only, not booked to ledger
        </p>
      </CardContent>
    </Card>
  );
}
