
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useWalletAssetPositions } from "@/hooks/useWalletAssetPositions";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatSmartDecimal } from "@/lib/format-smart-decimal";
import { Briefcase, TrendingUp, TrendingDown } from "lucide-react";

export function PortfolioSnapshot() {
  const [walletId, setWalletId] = useState<string>("all");
  const [marketRates, setMarketRates] = useState<Record<string, string>>({});

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

  const getMarketRate = (assetCode: string) => parseFloat(marketRates[assetCode] || '0');

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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Briefcase className="h-5 w-5" />
            Portfolio Snapshot (WAC)
          </CardTitle>
          <div className="flex items-center gap-2">
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
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Total Cost Value</p>
            <p className="text-xl font-bold font-mono">${formatSmartDecimal(totals.costValue, 2)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Market Value</p>
            <p className="text-xl font-bold font-mono">${formatSmartDecimal(totals.marketValue, 2)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Unrealized P&L</p>
            <p className={`text-xl font-bold font-mono ${totals.unrealized >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {totals.unrealized >= 0 ? '+' : ''}{formatSmartDecimal(totals.unrealized, 2)}
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
                  <TableHead className="text-right">Cost Value</TableHead>
                  <TableHead className="w-[140px]">Market Rate</TableHead>
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

                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.asset_code}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatSmartDecimal(qty)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">${formatSmartDecimal(avgCost)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">${formatSmartDecimal(costValue, 4)}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="any"
                          placeholder="Enter rate"
                          className="h-7 text-xs"
                          value={marketRates[p.asset_code] || ''}
                          onChange={(e) => setMarketRates(prev => ({ ...prev, [p.asset_code]: e.target.value }))}
                        />
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {marketRate > 0 ? `$${formatSmartDecimal(marketValue, 4)}` : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {marketRate > 0 ? (
                          <span className={`font-mono text-xs flex items-center justify-end gap-1 ${unrealized >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {unrealized >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {unrealized >= 0 ? '+' : ''}{formatSmartDecimal(unrealized, 4)}
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
      </CardContent>
    </Card>
  );
}
