import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2, XCircle, Loader2, RefreshCw, Link2, User } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { TerminalPurchaseApprovalDialog } from "./TerminalPurchaseApprovalDialog";
import { syncCompletedBuyOrders } from "@/hooks/useTerminalPurchaseSync";
import { getCurrentUserId } from "@/lib/system-action-logger";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  synced_pending_approval: { label: "Pending Approval", variant: "default" },
  approved: { label: "Approved", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
  duplicate_blocked: { label: "Duplicate", variant: "secondary" },
  client_mapping_pending: { label: "Client Mapping", variant: "outline" },
};

export function TerminalSyncTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [approvalRecord, setApprovalRecord] = useState<any>(null);
  const [rejectRecord, setRejectRecord] = useState<any>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  // Fetch sync records + reviewer usernames
  const { data: syncData = { records: [], userMap: {} as Record<string, string> }, isLoading, refetch } = useQuery({
    queryKey: ['terminal-purchase-sync', statusFilter],
    queryFn: async () => {
      // Show orders from the last 7 days to catch cross-day orders
      const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
      const cutoffTime = Date.now() - LOOKBACK_MS;

      let query = supabase
        .from('terminal_purchase_sync')
        .select('*')
        .order('synced_at', { ascending: false })
        .limit(500);

      if (statusFilter !== 'all') {
        query = query.eq('sync_status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Filter client-side by order create_time (from order_data JSONB) — last 7 days
      const filtered = (data || []).filter(record => {
        const od = record.order_data as any;
        const createTime = od?.create_time ? Number(od.create_time) : 0;
        return createTime === 0 || createTime >= cutoffTime;
      });

      // Fetch reviewer usernames for records that have reviewed_by
      const reviewerIds = [...new Set(filtered.map((r: any) => r.reviewed_by).filter(Boolean))];
      let userMap: Record<string, string> = {};
      if (reviewerIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, username, first_name, last_name')
          .in('id', reviewerIds as string[]);
        for (const u of (users || [])) {
          const displayName = u.first_name ? `${u.first_name} ${u.last_name || ''}`.trim() : u.username;
          userMap[u.id] = displayName;
        }
      }

      return { records: filtered, userMap };
    },
  });

  const syncRecords = syncData.records;
  const userMap = syncData.userMap;

  // Manual sync trigger
  const syncMutation = useMutation({
    mutationFn: syncCompletedBuyOrders,
    onSuccess: ({ synced, duplicates }) => {
      toast({
        title: "Sync Complete",
        description: `${synced} new orders synced, ${duplicates} duplicates skipped`,
      });
      queryClient.invalidateQueries({ queryKey: ['terminal-purchase-sync'] });
    },
    onError: (err: any) => {
      toast({ title: "Sync Error", description: err.message, variant: "destructive" });
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const userId = getCurrentUserId();
      const { error } = await supabase
        .from('terminal_purchase_sync')
        .update({
          sync_status: 'rejected',
          rejection_reason: reason,
          reviewed_by: userId || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Order Rejected" });
      queryClient.invalidateQueries({ queryKey: ['terminal-purchase-sync'] });
      setRejectRecord(null);
      setRejectionReason("");
    },
  });

  const pendingCount = syncRecords.filter((r: any) => r.sync_status === 'synced_pending_approval' || r.sync_status === 'client_mapping_pending').length;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent className="bg-white border z-50">
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="synced_pending_approval">Pending Approval</SelectItem>
              <SelectItem value="client_mapping_pending">Client Mapping</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="duplicate_blocked">Duplicate</SelectItem>
            </SelectContent>
          </Select>
          {pendingCount > 0 && (
            <Badge variant="default" className="text-xs">{pendingCount} Pending</Badge>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} className="gap-1">
            {syncMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
            Sync Now
          </Button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : syncRecords.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">No terminal sync records found.</p>
            <p className="text-xs text-muted-foreground mt-1">Completed BUY orders from Terminal will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Order #</TableHead>
                <TableHead className="text-xs">Seller</TableHead>
                <TableHead className="text-xs">Amount (₹)</TableHead>
                <TableHead className="text-xs">Qty (USDT)</TableHead>
                <TableHead className="text-xs">Price</TableHead>
                <TableHead className="text-xs">PAN</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Reviewed By</TableHead>
                <TableHead className="text-xs">Order Time</TableHead>
                <TableHead className="text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {syncRecords.map((record: any) => {
                const od = record.order_data as any;
                const statusCfg = STATUS_CONFIG[record.sync_status] || { label: record.sync_status, variant: "secondary" as const };
                const verifiedName = od?.verified_name;
                const sellerDisplay = verifiedName || record.counterparty_name;
                const isMaskedName = !verifiedName && (record.counterparty_name?.includes('***'));
                const reviewerName = record.reviewed_by ? (userMap[record.reviewed_by] || record.reviewed_by.slice(0, 8) + '...') : null;

                return (
                  <TableRow key={record.id}>
                    <TableCell className="text-xs font-mono">{record.binance_order_number?.slice(-10)}</TableCell>
                    <TableCell className="text-xs">
                      {isMaskedName ? (
                        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                          Awaiting Verified Name
                        </Badge>
                      ) : (
                        sellerDisplay
                      )}
                    </TableCell>
                    <TableCell className="text-xs font-medium">₹{Number(od?.total_price || 0).toLocaleString('en-IN')}</TableCell>
                    <TableCell className="text-xs">{Number(od?.amount || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">₹{Number(od?.unit_price || 0).toLocaleString('en-IN')}</TableCell>
                    <TableCell className="text-xs">
                      {record.pan_number ? (
                        <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
                          {record.pan_number}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <Badge variant={statusCfg.variant} className="text-[10px] w-fit">
                          {statusCfg.label}
                        </Badge>
                        {record.sync_status === 'rejected' && record.rejection_reason && (
                          <span className="text-[9px] text-muted-foreground max-w-[100px] truncate" title={record.rejection_reason}>
                            {record.rejection_reason}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {reviewerName ? (
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span className="text-muted-foreground">{reviewerName}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {od?.create_time ? format(new Date(Number(od.create_time)), 'dd MMM HH:mm') : (record.synced_at ? format(new Date(record.synced_at), 'dd MMM HH:mm') : '—')}
                    </TableCell>
                    <TableCell>
                      {(record.sync_status === 'synced_pending_approval' || record.sync_status === 'client_mapping_pending') && (
                        <div className="flex gap-1">
                          <Button
                            variant="default"
                            size="sm"
                            className="h-7 text-[10px] gap-1"
                            onClick={() => setApprovalRecord(record)}
                            disabled={isMaskedName || !verifiedName}
                            title={isMaskedName || !verifiedName ? 'Verified name required before approval' : ''}
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Approve
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-7 text-[10px] gap-1"
                            onClick={() => setRejectRecord(record)}
                          >
                            <XCircle className="h-3 w-3" />
                            Reject
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Approval Dialog */}
      {approvalRecord && (
        <TerminalPurchaseApprovalDialog
          open={!!approvalRecord}
          onOpenChange={(open) => { if (!open) setApprovalRecord(null); }}
          syncRecord={approvalRecord}
          onSuccess={() => {
            setApprovalRecord(null);
            queryClient.invalidateQueries({ queryKey: ['terminal-purchase-sync'] });
          }}
        />
      )}

      {/* Rejection Dialog */}
      <Dialog open={!!rejectRecord} onOpenChange={(open) => { if (!open) { setRejectRecord(null); setRejectionReason(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Reject Terminal Order</DialogTitle>
          </DialogHeader>
          <div>
            <Label className="text-xs">Rejection Reason</Label>
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter reason for rejection..."
              className="mt-1 text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setRejectRecord(null); setRejectionReason(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => rejectMutation.mutate({ id: rejectRecord.id, reason: rejectionReason })}
              disabled={!rejectionReason.trim() || rejectMutation.isPending}
            >
              {rejectMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
