
import { useState } from "react";
import { formatSmartDecimal } from "@/lib/format-smart-decimal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useConversionHistory, ConversionFilters } from "@/hooks/useProductConversions";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  PENDING_APPROVAL: "bg-amber-100 text-amber-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
};

export function ConversionHistoryTable() {
  const [filters, setFilters] = useState<ConversionFilters>({});
  const { data: conversions = [], isLoading } = useConversionHistory(filters);

  const { data: wallets = [] } = useQuery({
    queryKey: ['wallets-active'],
    queryFn: async () => {
      const { data } = await supabase.from('wallets').select('id, wallet_name').eq('is_active', true).order('wallet_name');
      return data || [];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Conversion History</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
            <Label className="text-xs">Side</Label>
            <Select value={filters.side || 'all'} onValueChange={(v) => setFilters(f => ({ ...f, side: v === 'all' ? undefined : v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="BUY">BUY</SelectItem>
                <SelectItem value="SELL">SELL</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={filters.status || 'all'} onValueChange={(v) => setFilters(f => ({ ...f, status: v === 'all' ? undefined : v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="PENDING_APPROVAL">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <p className="text-center py-8 text-muted-foreground">Loading...</p>
        ) : conversions.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">No records found</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ref No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Wallet</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Gross USD</TableHead>
                  <TableHead className="text-right">Fee</TableHead>
                  <TableHead className="text-right">Net Asset</TableHead>
                   <TableHead className="text-right">Net USDT</TableHead>
                  <TableHead className="text-right">Exec Rate</TableHead>
                  <TableHead className="text-right">Cost Out</TableHead>
                  <TableHead className="text-right">Realized P&L</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead>Approved/Rejected By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conversions.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{c.reference_no}</TableCell>
                    <TableCell className="text-xs">{format(new Date(c.created_at), 'dd MMM yyyy HH:mm')}</TableCell>
                    <TableCell className="text-xs">{c.wallets?.wallet_name || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={c.side === 'BUY' ? 'default' : 'secondary'} className="text-[10px]">
                        {c.side}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{c.asset_code}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{formatSmartDecimal(c.quantity)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">${formatSmartDecimal(c.price_usd, 9)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">${formatSmartDecimal(c.gross_usd_value)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {Number(c.fee_amount) > 0 ? `${formatSmartDecimal(c.fee_amount, 9)} ${c.fee_asset}` : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {c.side === 'BUY' ? '+' : '-'}{formatSmartDecimal(c.net_asset_change)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {c.side === 'BUY' ? '-' : '+'}{formatSmartDecimal(c.net_usdt_change)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {(c as any).execution_rate_usdt ? `$${formatSmartDecimal((c as any).execution_rate_usdt)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {c.side === 'SELL' && (c as any).cost_out_usdt ? `$${formatSmartDecimal((c as any).cost_out_usdt, 4)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.side === 'SELL' && (c as any).realized_pnl_usdt != null ? (
                        <span className={`font-mono text-xs ${Number((c as any).realized_pnl_usdt) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {Number((c as any).realized_pnl_usdt) >= 0 ? '+' : ''}${formatSmartDecimal((c as any).realized_pnl_usdt, 4)}
                        </span>
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] ${STATUS_COLORS[c.status] || ''}`} variant="outline">
                        {c.status === 'PENDING_APPROVAL' ? 'Pending' : c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{c.creator?.username || '—'}</TableCell>
                    <TableCell className="text-xs">
                      {c.status === 'APPROVED' && c.approver?.username
                        ? `${c.approver.username} (${c.approved_at ? format(new Date(c.approved_at), 'dd MMM HH:mm') : ''})`
                        : c.status === 'REJECTED' && c.rejector?.username
                        ? `${c.rejector.username} (${c.rejected_at ? format(new Date(c.rejected_at), 'dd MMM HH:mm') : ''})`
                        : '—'}
                      {c.rejection_reason && (
                        <span className="block text-[10px] text-red-500 mt-0.5">{c.rejection_reason}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
