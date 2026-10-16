import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Loader2, Package, RefreshCw, XCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { syncSmallBuys } from '@/hooks/useSmallBuysSync';
import { SmallBuysApprovalDialog } from './SmallBuysApprovalDialog';
import { getCurrentUserId } from '@/lib/system-action-logger';
import { ExchangeAccountBadge } from '@/components/shared/ExchangeAccountBadge';
import { cn } from '@/lib/utils';
import {
  BatchStatusChip,
  Chip,
  DialogBody,
  DialogFoot,
  DialogHead,
  Field,
  OrderNo,
  PanelMessage,
  PanelSkeleton,
  PanelToolbar,
  dialogContentClass,
  fmtAssetQty,
  fmtDate,
  fmtDateTime,
  fmtInr,
  fmtRate,
  fmtTime,
  safeDate,
} from '@/components/orders-ui';

/** Outline "Reject" in lists (no solid red buttons in rows). */
const REJECT_OUTLINE = 'border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive';

const plural = (n: unknown, one: string, many: string) => `${Number(n ?? 0).toLocaleString('en-IN')} ${Number(n) === 1 ? one : many}`;

/** "16 Oct 2026, 08:47 – 11:07" within a day, full date-times across days. */
function windowLabel(start: unknown, end: unknown) {
  const s = safeDate(start);
  const e = safeDate(end);
  if (s && e) return fmtDate(s) === fmtDate(e) ? `${fmtDateTime(s)} – ${fmtTime(e)}` : `${fmtDateTime(s)} – ${fmtDateTime(e)}`;
  if (s) return fmtDateTime(s);
  if (e) return `Until ${fmtDateTime(e)}`;
  return '—';
}

export function SmallBuysSyncTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [rejectRecord, setRejectRecord] = useState<any>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Fetch sync records
  const { data: syncRecords, isLoading, isError, error } = useQuery({
    queryKey: ['small_buys_sync'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('small_buys_sync' as any)
        .select('*')
        .order('synced_at', { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const { data: lastSync } = useQuery({
    queryKey: ['small_buys_last_sync'],
    queryFn: async () => {
      const { data } = await supabase
        .from('small_buys_sync_log' as any)
        .select('*')
        .order('sync_started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as any;
    },
  });

  const { data: orderMaps } = useQuery({
    queryKey: ['small_buys_order_map', expandedId],
    enabled: !!expandedId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('small_buys_order_map' as any)
        .select('*')
        .eq('small_buys_sync_id', expandedId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncSmallBuys({ operatorInitiated: true, source: 'purchase_small_buys_tab' });
      toast({
        title: 'Small Buys Sync Complete',
        description: `${result.synced} entries created, ${result.duplicates} duplicates skipped`,
      });
      queryClient.invalidateQueries({ queryKey: ['small_buys_sync'] });
      queryClient.invalidateQueries({ queryKey: ['small_buys_last_sync'] });
    } catch (err: any) {
      toast({ title: 'Sync Error', description: err.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const userId = getCurrentUserId();
      const { error } = await supabase
        .from('small_buys_sync' as any)
        .update({
          sync_status: 'rejected',
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          rejection_reason: reason || 'Rejected by operator',
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Small Buys Entry Rejected' });
      queryClient.invalidateQueries({ queryKey: ['small_buys_sync'] });
      setRejectRecord(null);
      setRejectionReason('');
    },
  });

  /* ── Presentation ─────────────────────────────────────────────────────── */

  const pendingBatches = (syncRecords || []).filter((r: any) => r.sync_status === 'pending_approval').length;

  const renderOrders = (record: any) => (
    <div id={`small-buys-orders-${record.id}`} className="mt-3 max-w-3xl sm:ml-[4.25rem]">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        Included orders ({record.order_numbers?.length || 0})
      </p>
      <div className="max-h-60 overflow-y-auto rounded-md border border-border bg-card">
        {orderMaps && orderMaps.length > 0 ? (
          <table className="w-full border-separate border-spacing-0 text-left text-[12px] [&_td]:border-b [&_td]:border-border/60 [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:sticky [&_th]:top-0 [&_th]:z-[1] [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-[0.05em] [&_th]:text-muted-foreground [&_tr:last-child>td]:border-b-0 sm:[&_td:first-child]:pl-3 sm:[&_th:first-child]:pl-3 sm:[&_td:last-child]:pr-3 sm:[&_th:last-child]:pr-3">
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col" className="hidden md:table-cell">Time</th>
                <th scope="col" className="hidden text-right sm:table-cell">Quantity</th>
                <th scope="col" className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {orderMaps.map((m: any) => {
                const od = m.order_data as any;
                return (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap">
                      <OrderNo value={m.binance_order_number} tail={6} />
                    </td>
                    <td className="hidden whitespace-nowrap tabular-nums text-muted-foreground md:table-cell">{fmtTime(Number(od?.create_time) || null)}</td>
                    <td className="hidden whitespace-nowrap text-right tabular-nums sm:table-cell">{fmtAssetQty(od?.amount, od?.asset)}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">
                      <span className="font-medium text-foreground">{fmtInr(od?.total_price)}</span>
                      <span className="block text-muted-foreground sm:hidden">{fmtAssetQty(od?.amount, od?.asset)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="px-3 py-3 text-xs text-muted-foreground">Loading order details…</p>
        )}
      </div>
    </div>
  );

  return (
    <>
      <section className="min-w-0 rounded-lg border border-border bg-card shadow-[var(--shadow-xs)]" aria-label="Small buys batches">
        <PanelToolbar className="sm:flex-nowrap">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="!text-sm font-semibold text-foreground">Small buys batches</h2>
              {pendingBatches > 0 && <Chip tone="warning" className="tabular-nums">{pendingBatches} pending</Chip>}
            </div>
            {lastSync && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Last sync {fmtDateTime(lastSync.sync_started_at)} · {plural(lastSync.total_orders_processed, 'order', 'orders')} → {plural(lastSync.entries_created, 'entry', 'entries')}
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} className="h-9 shrink-0 gap-1.5">
            <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} />
            {syncing ? 'Syncing…' : 'Sync small buys'}
          </Button>
        </PanelToolbar>

        {isLoading ? (
          <PanelSkeleton rows={4} label="Loading small buys batches" />
        ) : !syncRecords || syncRecords.length === 0 ? (
          isError ? (
            <PanelMessage icon={AlertTriangle} tone="danger" title="Couldn't load small buys batches">
              {(error as any)?.message || 'Try again in a moment.'}
            </PanelMessage>
          ) : (
            <PanelMessage icon={Package} title="No small buys batches yet">
              Use “Sync small buys” to fetch and club eligible orders.
            </PanelMessage>
          )
        ) : (
          <ul className="divide-y divide-border">
            {syncRecords.map((record: any) => {
              const expanded = expandedId === record.id;
              return (
                <li key={record.id} className="px-3 py-3 sm:px-5">
                  <div className="flex items-start gap-3 sm:items-center">
                    <span
                      className="flex h-10 w-14 shrink-0 items-center justify-center self-start rounded-md border border-border bg-muted/50 text-[11px] font-semibold tracking-wide text-foreground"
                      title={`Asset ${record.asset_code}`}
                    >
                      {record.asset_code}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-2">
                      <div className="min-w-0 flex-1 basis-[15rem]">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[15px] font-semibold tabular-nums text-foreground">
                            {fmtAssetQty(record.total_quantity, record.asset_code)}
                          </span>
                          <BatchStatusChip status={record.sync_status} />
                          <ExchangeAccountBadge accountId={(record as any).exchange_account_id} />
                        </div>
                        <p className="mt-0.5 text-[13px] tabular-nums text-muted-foreground">
                          {plural(record.order_count, 'order', 'orders')} · {fmtInr(record.total_amount)} · avg {fmtRate(record.avg_price)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {windowLabel(record.time_window_start, record.time_window_end)} · {record.wallet_name || '—'}
                        </p>
                        {record.sync_status === 'rejected' && record.rejection_reason && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={record.rejection_reason}>
                            Reason: {record.rejection_reason}
                          </p>
                        )}
                      </div>
                      {record.sync_status === 'pending_approval' && (
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button size="sm" className="h-8 gap-1.5 px-2.5 text-xs" onClick={() => setSelectedRecord(record)}>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" className={cn('h-8 gap-1.5 px-2.5 text-xs', REJECT_OUTLINE)} onClick={() => setRejectRecord(record)}>
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-mr-1 h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                      aria-expanded={expanded}
                      aria-controls={expanded ? `small-buys-orders-${record.id}` : undefined}
                      aria-label="Show orders in this batch"
                      title={expanded ? 'Hide orders' : 'Show orders'}
                      onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
                    >
                      {expandedId === record.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>

                  {expandedId === record.id && renderOrders(record)}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Approval Dialog */}
      <SmallBuysApprovalDialog
        open={!!selectedRecord}
        onOpenChange={(open) => !open && setSelectedRecord(null)}
        record={selectedRecord}
      />

      {/* Rejection Dialog */}
      <Dialog open={!!rejectRecord} onOpenChange={(open) => { if (!open) { setRejectRecord(null); setRejectionReason(''); } }}>
        <DialogContent className={dialogContentClass('sm')}>
          <DialogHead title="Reject small buys batch" description="The batch leaves the approval queue. Its orders can be clubbed again by a later sync." />
          <DialogBody className="space-y-4">
            {rejectRecord && (
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md border border-border bg-muted/40 px-3 py-2 text-[13px] text-foreground">
                <span className="font-semibold tabular-nums">{fmtAssetQty(rejectRecord.total_quantity, rejectRecord.asset_code)}</span>
                <span className="text-muted-foreground" aria-hidden>·</span>
                <span className="tabular-nums">{plural(rejectRecord.order_count, 'order', 'orders')}</span>
                <span className="text-muted-foreground" aria-hidden>·</span>
                <span className="font-semibold tabular-nums">{fmtInr(rejectRecord.total_amount)}</span>
                <span className="w-full text-xs text-muted-foreground">{windowLabel(rejectRecord.time_window_start, rejectRecord.time_window_end)}</span>
              </div>
            )}
            <Field label="Rejection reason" htmlFor="small-buys-reject-reason" required hint="Saved on the batch and shown in the list.">
              <Textarea
                id="small-buys-reject-reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Why is this batch being rejected?"
                className="text-sm"
              />
            </Field>
          </DialogBody>
          <DialogFoot>
            <Button variant="outline" onClick={() => { setRejectRecord(null); setRejectionReason(''); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => rejectMutation.mutate({ id: rejectRecord.id, reason: rejectionReason })}
              disabled={!rejectionReason.trim() || rejectMutation.isPending}
            >
              {rejectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {rejectMutation.isPending ? 'Rejecting…' : 'Reject batch'}
            </Button>
          </DialogFoot>
        </DialogContent>
      </Dialog>
    </>
  );
}
