
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useRealizedPnlEvents, RealizedPnlFilters } from "@/hooks/useRealizedPnl";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatSmartDecimal } from "@/lib/format-smart-decimal";
import { format } from "date-fns";
import { DollarSign, TrendingUp, TrendingDown, Activity } from "lucide-react";

export function RealizedPnlReport() {
  const [filters, setFilters] = useState<RealizedPnlFilters>({});
  const { data: events = [], isLoading } = useRealizedPnlEvents(filters);

  const { data: wallets = [] } = useQuery({
    queryKey: ['wallets-active'],
    queryFn: async () => {
      const { data } = await supabase.from('wallets').select('id, wallet_name').eq('is_active', true).order('wallet_name');
      return data || [];
    },
  });

  const totals = events.reduce((acc, e) => ({
    sellQty: acc.sellQty + Number(e.sell_qty),
    proceedsNet: acc.proceedsNet + Number(e.proceeds_usdt_net),
    costOut: acc.costOut + Number(e.cost_out_usdt),
    pnl: acc.pnl + Number(e.realized_pnl_usdt),
  }), { sellQty: 0, proceedsNet: 0, costOut: 0, pnl: 0 });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Activity className="h-5 w-5" />
          Realized P&L Report
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={filters.dateFrom || ''} onChange={(e) => setFilters(f => ({ ...f, dateFrom: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={filters.dateTo || ''} onChange={(e) => setFilters(f => ({ ...f, dateTo: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Wallet</Label>
            <Select value={filters.walletId || 'all'} onValueChange={(v) => setFilters(f => ({ ...f, walletId: v === 'all' ? undefined : v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {wallets.map((w: any) => <SelectItem key={w.id} value={w.id}>{w.wallet_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Asset</Label>
            <Input placeholder="e.g. BTC" value={filters.assetCode || ''} onChange={(e) => setFilters(f => ({ ...f, assetCode: e.target.value.toUpperCase() || undefined }))} />
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-4 gap-4">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Total Proceeds (Net)</p>
            <p className="text-lg font-bold font-mono">${formatSmartDecimal(totals.proceedsNet, 4)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Total COGS</p>
            <p className="text-lg font-bold font-mono">${formatSmartDecimal(totals.costOut, 4)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Realized P&L</p>
            <p className={`text-lg font-bold font-mono ${totals.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {totals.pnl >= 0 ? '+' : ''}${formatSmartDecimal(totals.pnl, 4)}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Trades</p>
            <p className="text-lg font-bold">{events.length}</p>
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <p className="text-center py-8 text-muted-foreground">Loading...</p>
        ) : events.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">No realized P&L events found</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead className="text-right">Sell Qty</TableHead>
                  <TableHead className="text-right">Avg Cost</TableHead>
                  <TableHead className="text-right">Proceeds (Gross)</TableHead>
                  <TableHead className="text-right">Proceeds (Net)</TableHead>
                  <TableHead className="text-right">COGS</TableHead>
                  <TableHead className="text-right">Realized P&L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((e) => {
                  const pnl = Number(e.realized_pnl_usdt);
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs">{format(new Date(e.created_at), 'dd MMM yyyy HH:mm')}</TableCell>
                      <TableCell className="font-medium">{e.asset_code}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatSmartDecimal(e.sell_qty)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">${formatSmartDecimal(e.avg_cost_at_sale)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">${formatSmartDecimal(e.proceeds_usdt_gross, 4)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">${formatSmartDecimal(e.proceeds_usdt_net, 4)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">${formatSmartDecimal(e.cost_out_usdt, 4)}</TableCell>
                      <TableCell className="text-right">
                        <span className={`font-mono text-xs flex items-center justify-end gap-1 ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {pnl >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {pnl >= 0 ? '+' : ''}${formatSmartDecimal(pnl, 4)}
                        </span>
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
