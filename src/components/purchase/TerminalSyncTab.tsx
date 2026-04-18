import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, XCircle, Loader2, RefreshCw, Link2, User } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { TerminalPurchaseApprovalDialog } from "./TerminalPurchaseApprovalDialog";
import { syncCompletedBuyOrders } from "@/hooks/useTerminalPurchaseSync";
import { getCurrentUserId } from "@/lib/system-action-logger";
import { usePermissions } from "@/hooks/usePermissions";
import { useSyncOrderHistory } from "@/hooks/useBinanceOrderSync";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  synced_pending_approval: { label: "Pending Approval", variant: "default" },
  approved: { label: "Approved", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
  duplicate_blocked: { label: "Duplicate", variant: "secondary" },
  client_mapping_pending: { label: "Client Mapping", variant: "outline" },
};

const PENDING_SYNC_STATUSES = ['synced_pending_approval', 'client_mapping_pending'];

export function TerminalSyncTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const orderSyncMutation = useSyncOrderHistory();
  const [statusFilter, setStatusFilter] = useState("all");
  const [approvalRecord, setApprovalRecord] = useState<any>(null);
  const [rejectRecord, setRejectRecord] = useState<any>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState("");

  // Fetch sync records + reviewer usernames
  const { data: syncData = { records: [], userMap: {} as Record<string, string> }, isLoading, refetch } = useQuery({
    queryKey: ['terminal-purchase-sync', statusFilter],
    queryFn: async () => {
      // Show orders from the last 7 days to catch cross-day orders
      const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
      const cutoffTime = Date.now() - LOOKBACK_MS;

      let query = supabase
        .from('terminal_purchase_sync')
        .select('*, clients:client_id(pan_card_number)')
        .order('synced_at', { ascending: false })
        .limit(500);

      if (statusFilter === 'pending_queue') {
        query = query.in('sync_status', PENDING_SYNC_STATUSES);
      } else if (statusFilter !== 'all') {
        query = query.eq('sync_status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch small buys config to exclude small buys range orders
      const { getSmallBuysConfig } = await import('@/hooks/useSmallBuysSync');
      const sbConfig = await getSmallBuysConfig();

      // Filter client-side by order create_time (from order_data JSONB) — last 7 days
      // Also exclude orders that fall within the small buys range (they belong in Small Buys tab)
      const filtered = (data || []).filter(record => {
        const od = record.order_data as any;
        const createTime = od?.create_time ? Number(od.create_time) : 0;
        const timeOk = createTime === 0 || createTime >= cutoffTime;
        if (!timeOk) return false;

        // Exclude orders in small buys range
        if (sbConfig?.is_enabled) {
          const tp = parseFloat(od?.total_price || '0');
          if (tp >= sbConfig.min_amount && tp <= sbConfig.max_amount) return false;
        }
        return true;
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

  // Enrich missing verified names (called as part of Sync Now)
  async function enrichMissingNames() {
    const { data: freshRecords } = await supabase
      .from('terminal_purchase_sync')
      .select('id, binance_order_number, order_data, sync_status, counterparty_name')
      .in('sync_status', ['synced_pending_approval', 'client_mapping_pending']);

    const pendingRecords = (freshRecords || []).filter((r: any) => {
      const od = r.order_data as any;
      return !od?.verified_name;
    });

    let enriched = 0;
    for (const record of pendingRecords) {
      const orderNumber = record.binance_order_number;
      if (!orderNumber) continue;
      try {
        const { data: dbOrder } = await supabase
          .from('binance_order_history')
          .select('verified_name')
          .eq('order_number', orderNumber)
          .maybeSingle();

        let sellerName = dbOrder?.verified_name || null;

        if (!sellerName) {
          const { data } = await supabase.functions.invoke('binance-ads', {
            body: { action: 'getOrderDetail', orderNumber },
          });
          const apiResult = data?.data;
          const detail = apiResult?.data || apiResult;
          sellerName = detail?.sellerRealName || detail?.sellerName || null;

          if (sellerName) {
            await supabase
              .from('binance_order_history')
              .update({ verified_name: sellerName })
              .eq('order_number', orderNumber);
          }
        }

        if (sellerName) {
          const od = record.order_data as any;
          await supabase
            .from('terminal_purchase_sync')
            .update({
              counterparty_name: sellerName,
              order_data: { ...od, verified_name: sellerName },
            })
            .eq('id', record.id);
          enriched++;
        }
        await new Promise(r => setTimeout(r, 300));
      } catch { /* skip */ }
    }
    return enriched;
  }

  // Manual sync trigger — includes name enrichment
  const syncMutation = useMutation({
    mutationFn: async () => {
      toast({ title: "Syncing...", description: "Fetching latest orders from Binance, then syncing purchases..." });
      // Step 1: Pull fresh orders from Binance API into binance_order_history
      await orderSyncMutation.mutateAsync({ fullSync: false });
      // Step 2: Sync completed BUY orders from history to terminal_purchase_sync
      const result = await syncCompletedBuyOrders();
      // Step 3: Enrich any missing verified names
      const enriched = await enrichMissingNames();
      return { ...result, enriched };
    },
    onSuccess: ({ synced, duplicates, enriched }) => {
      const parts = [`${synced} new orders synced`, `${duplicates} duplicates skipped`];
      if (enriched > 0) parts.push(`${enriched} names verified`);
      toast({
        title: "Sync Complete",
        description: parts.join(', '),
      });
      queryClient.invalidateQueries({ queryKey: ['terminal-purchase-sync'] });
    },
    onError: (err: any) => {
      console.error('[TerminalSync] Sync error:', err);
      toast({ title: "Sync Error", description: err.message || "Unknown error occurred", variant: "destructive" });
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

  const pendingCount = syncRecords.filter((r: any) => PENDING_SYNC_STATUSES.includes(r.sync_status)).length;

  const pendingRecordsList = syncRecords.filter((r: any) => PENDING_SYNC_STATUSES.includes(r.sync_status));
  const allPendingSelected = pendingRecordsList.length > 0 && pendingRecordsList.every((r: any) => selectedIds.has(r.id));

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allPendingSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingRecordsList.map((r: any) => r.id)));
    }
  };

  // Bulk reject mutation
  const bulkRejectMutation = useMutation({
    mutationFn: async ({ ids, reason }: { ids: string[]; reason: string }) => {
      const userId = getCurrentUserId();
      const { error } = await supabase
        .from('terminal_purchase_sync')
        .update({
          sync_status: 'rejected',
          rejection_reason: reason,
          reviewed_by: userId || null,
          reviewed_at: new Date().toISOString(),
        })
        .in('id', ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      toast({ title: `${count} orders rejected` });
      queryClient.invalidateQueries({ queryKey: ['terminal-purchase-sync'] });
      setSelectedIds(new Set());
      setBulkRejectOpen(false);
      setBulkRejectReason("");
    },
  });

  return (
    <div className="space-y-4">
      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
          <Badge variant="secondary" className="text-xs">{selectedIds.size} selected</Badge>
          {hasPermission('terminal_destructive') && (
            <Button variant="destructive" size="sm" className="h-7 text-[10px]" onClick={() => setBulkRejectOpen(true)}>
              <XCircle className="h-3 w-3 mr-1" />
              Bulk Reject
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => setSelectedIds(new Set())}>
            Clear Selection
          </Button>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent className="bg-white border z-50">
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending_queue">Pending Queue</SelectItem>
              <SelectItem value="synced_pending_approval">Ready for Approval</SelectItem>
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
                <TableHead className="w-8">
                  <Checkbox
                    checked={allPendingSelected && pendingRecordsList.length > 0}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all pending"
                  />
                </TableHead>
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
                    <TableCell className="w-8">
                      {PENDING_SYNC_STATUSES.includes(record.sync_status) ? (
                        <Checkbox
                          checked={selectedIds.has(record.id)}
                          onCheckedChange={() => toggleSelect(record.id)}
                          aria-label={`Select order ${record.binance_order_number}`}
                        />
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs">
                      {isMaskedName ? (
                        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                          Awaiting Verified Name
                        </Badge>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <span>{sellerDisplay}</span>
                          {(() => {
                            const nick = (od?.counterparty_nickname || record.counterparty_name || '').toString().trim();
                            // Only show nickname row when nickname is a separate signal from the displayed verified name
                            return nick && !nick.includes('*') && nick !== sellerDisplay ? (
                              <span className="font-mono text-[10px] text-muted-foreground">@{nick}</span>
                            ) : null;
                          })()}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs font-medium">₹{Number(od?.total_price || 0).toLocaleString('en-IN')}</TableCell>
                    <TableCell className="text-xs">{Number(od?.amount || 0).toLocaleString('en-IN')}</TableCell>
                    <TableCell className="text-xs">₹{Number(od?.unit_price || 0).toLocaleString('en-IN')}</TableCell>
                    <TableCell className="text-xs">
                      {(() => {
                        const mappedClientPan = (record.clients as any)?.pan_card_number?.trim?.() || null;
                        const terminalPan = record.pan_number?.trim?.() || null;

                        // If client is mapped, show ONLY client master PAN to avoid cross-client PAN bleed.
                        // Use terminal PAN only for unmapped rows.
                        const pan = record.client_id ? mappedClientPan : terminalPan;

                        return pan ? (
                          <span className="font-mono">{pan}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        );
                      })()}
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
                          {hasPermission('terminal_destructive') && (
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-7 text-[10px] gap-1"
                              onClick={() => setRejectRecord(record)}
                            >
                              <XCircle className="h-3 w-3" />
                              Reject
                            </Button>
                          )}
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

      {/* Bulk Rejection Dialog */}
      <Dialog open={bulkRejectOpen} onOpenChange={(open) => { if (!open) { setBulkRejectOpen(false); setBulkRejectReason(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Bulk Reject {selectedIds.size} Orders</DialogTitle>
          </DialogHeader>
          <div>
            <Label className="text-xs">Rejection Reason (applies to all)</Label>
            <Textarea
              value={bulkRejectReason}
              onChange={(e) => setBulkRejectReason(e.target.value)}
              placeholder="Enter reason for rejection..."
              className="mt-1 text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setBulkRejectOpen(false); setBulkRejectReason(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => bulkRejectMutation.mutate({ ids: [...selectedIds], reason: bulkRejectReason })}
              disabled={!bulkRejectReason.trim() || bulkRejectMutation.isPending}
            >
              {bulkRejectMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Reject {selectedIds.size} Orders
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
