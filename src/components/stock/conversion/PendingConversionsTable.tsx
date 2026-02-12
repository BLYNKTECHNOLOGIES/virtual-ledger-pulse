
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Clock } from "lucide-react";
import { usePendingConversions, useApproveConversion } from "@/hooks/useProductConversions";
import { ConversionApprovalDialog } from "./ConversionApprovalDialog";
import { format } from "date-fns";

export function PendingConversionsTable() {
  const { data: conversions = [], isLoading } = usePendingConversions();
  const approveMutation = useApproveConversion();
  const [rejectRecord, setRejectRecord] = useState<any>(null);

  const handleApprove = (id: string) => {
    approveMutation.mutate(id);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-32"><Clock className="h-5 w-5 animate-spin" /> Loading...</div>;
  }

  return (
    <>
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
                    <TableHead>Created By</TableHead>
                    <TableHead>Actions</TableHead>
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
                      <TableCell className="text-right font-mono text-xs">{Number(c.quantity).toFixed(6)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">${Number(c.price_usd).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">${Number(c.gross_usd_value).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {Number(c.fee_amount) > 0 ? `${Number(c.fee_amount).toFixed(6)} ${c.fee_asset}` : '—'}
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
                  ))}
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
