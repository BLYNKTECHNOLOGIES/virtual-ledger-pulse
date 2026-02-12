
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, XCircle, Clock, RefreshCw } from "lucide-react";
import { usePendingConversions, useApproveConversion } from "@/hooks/useProductConversions";
import { useUnsyncedSpotTrades, useSyncSpotTradesToConversions } from "@/hooks/useSpotTradeConversionSync";
import { ConversionApprovalDialog } from "./ConversionApprovalDialog";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function PendingConversionsTable() {
  const { data: conversions = [], isLoading } = usePendingConversions();
  const approveMutation = useApproveConversion();
  const [rejectRecord, setRejectRecord] = useState<any>(null);

  // Sync from Terminal
  const [syncWalletId, setSyncWalletId] = useState("");
  const { data: unsyncedTrades = [] } = useUnsyncedSpotTrades();
  const syncMutation = useSyncSpotTradesToConversions();

  const { data: wallets = [] } = useQuery({
    queryKey: ['wallets-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallets')
        .select('id, wallet_name')
        .eq('is_active', true)
        .order('wallet_name');
      if (error) throw error;
      return data || [];
    },
  });

  const unsyncedCount = unsyncedTrades.filter(t => !t.already_synced).length;

  const handleApprove = (id: string) => {
    approveMutation.mutate(id);
  };

  const handleSync = () => {
    if (!syncWalletId) return;
    syncMutation.mutate({
      walletId: syncWalletId,
      trades: unsyncedTrades,
    });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-32"><Clock className="h-5 w-5 animate-spin" /> Loading...</div>;
  }

  return (
    <>
      {/* Sync from Terminal */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Sync Spot Trades from Terminal</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={syncWalletId} onValueChange={setSyncWalletId}>
              <SelectTrigger className="w-[250px]">
                <SelectValue placeholder="Select target wallet" />
              </SelectTrigger>
              <SelectContent>
                {wallets.map((w: any) => (
                  <SelectItem key={w.id} value={w.id}>{w.wallet_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={handleSync}
              disabled={!syncWalletId || unsyncedCount === 0 || syncMutation.isPending}
              className="gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
              {syncMutation.isPending ? "Syncing..." : `Sync ${unsyncedCount} Trade(s)`}
            </Button>
            <span className="text-xs text-muted-foreground">
              {unsyncedCount} unsynced filled trade(s) found
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Pending Approval Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pending Approval ({conversions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {conversions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No pending conversions</p>
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
                    <TableHead className="text-right">Price USD</TableHead>
                    <TableHead className="text-right">Gross USD</TableHead>
                    <TableHead className="text-right">Fee</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Created By</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conversions.map((c) => {
                    const isFromSpotSync = c.metadata?.source === 'SPOT_TRADE_SYNC';
                    return (
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
                        <TableCell className="text-right font-mono text-xs">{Number(c.quantity).toFixed(6)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">${Number(c.price_usd).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">${Number(c.gross_usd_value).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {Number(c.fee_amount) > 0 ? `${Number(c.fee_amount).toFixed(6)} ${c.fee_asset}` : '—'}
                        </TableCell>
                        <TableCell>
                          {isFromSpotSync ? (
                            <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-300">
                              Terminal
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">Manual</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{c.creator?.username || '—'}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 text-[10px] gap-1"
                              onClick={() => handleApprove(c.id)}
                              disabled={approveMutation.isPending}
                            >
                              <CheckCircle className="h-3 w-3" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7 text-[10px] gap-1"
                              onClick={() => setRejectRecord(c)}
                            >
                              <XCircle className="h-3 w-3" />
                              Reject
                            </Button>
                          </div>
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

      <ConversionApprovalDialog
        record={rejectRecord}
        onClose={() => setRejectRecord(null)}
      />
    </>
  );
}
