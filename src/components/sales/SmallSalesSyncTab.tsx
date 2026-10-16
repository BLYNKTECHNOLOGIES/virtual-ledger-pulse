import { useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, ChevronDown, Loader2, Package, RefreshCw, XCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { syncSmallSales } from '@/hooks/useSmallSalesSync';
import { SmallSalesApprovalDialog } from './SmallSalesApprovalDialog';
import { requireCurrentUserId } from '@/lib/system-action-logger';
import { ExchangeAccountBadge } from '@/components/shared/ExchangeAccountBadge';
import { cn } from '@/lib/utils';
import {
  BatchStatusChip,
  Chip,
  DialogBody,
  DialogFoot,
  DialogHead,
  Field,
  ListNote,
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
  useNarrow,
} from '@/components/orders-ui';

/** Reject in a list: outlined, red text — never a solid red button in a row. */
const REJECT_BTN = 'border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive';

/** Keeps the last value while a dialog animates closed, so its text doesn't jump (display only). */
function useLastWhile<T>(value: T, active: boolean): T {
  const last = useRef(value);
  if (active) last.current = value;
  return active ? value : last.current;
}

/** The record a confirmation acts on: what it is on the left, its amount on the right. */
function RecordLine({ title, detail, value, valueDetail }: { title: ReactNode; detail?: ReactNode; value: ReactNode; valueDetail?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-[13px] text-foreground">
      <div className="min-w-0">
        <div className="truncate font-medium">{title}</div>
        {detail && <div className="mt-0.5 min-w-0 text-xs tabular-nums text-muted-foreground">{detail}</div>}
      </div>
      <div className="shrink-0 text-right">
        <div className="font-semibold tabular-nums">{value}</div>
        {valueDetail && <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">{valueDetail}</div>}
      </div>
    </div>
  );
}

const plural = (n: number, one: string, many: string) => `${Number(n || 0).toLocaleString('en-IN')} ${Number(n) === 1 ? one : many}`;

/** "16 Oct 2026, 10:41 – 11:47", or with both dates when the window crosses midnight. */
function windowLabel(start: unknown, end: unknown) {
  const s = safeDate(start);
  const e = safeDate(end);
  if (s && e) {
    if (fmtDate(s) === fmtDate(e)) return `${fmtDate(s)}, ${fmtTime(s)} – ${fmtTime(e)}`;
    const sameYear = s.getFullYear() === e.getFullYear();
    return `${fmtDate(s, sameYear ? 'd MMM' : 'd MMM yyyy')}, ${fmtTime(s)} – ${fmtDateTime(e)}`;
  }
  if (s) return `From ${fmtDateTime(s)}`;
  if (e) return `Until ${fmtDateTime(e)}`;
  return '—';
}

export function SmallSalesSyncTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [rejectRecord, setRejectRecord] = useState<any>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: syncRecords, isLoading } = useQuery({
    queryKey: ['small_sales_sync'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('small_sales_sync')
        .select('*')
        .order('synced_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: lastSync } = useQuery({
    queryKey: ['small_sales_last_sync'],
    queryFn: async () => {
      const { data } = await supabase
        .from('small_sales_sync_log')
        .select('*')
        .order('sync_started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { data: orderMaps } = useQuery({
    queryKey: ['small_sales_order_map', expandedId],
    enabled: !!expandedId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('small_sales_order_map')
        .select('*')
        .eq('small_sales_sync_id', expandedId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncSmallSales({ operatorInitiated: true, source: 'sales_small_sales_tab' });
      toast({
        title: 'Small Sales Sync Complete',
        description: `${result.synced} entries created, ${result.duplicates} duplicates skipped`,
      });
      queryClient.invalidateQueries({ queryKey: ['small_sales_sync'] });
      queryClient.invalidateQueries({ queryKey: ['small_sales_last_sync'] });
    } catch (err: any) {
      toast({ title: 'Sync Error', description: err.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const userId = await requireCurrentUserId();
      const { error } = await supabase
        .from('small_sales_sync')
        .update({
          sync_status: 'rejected',
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          rejection_reason: reason,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Small Sales Entry Rejected' });
      queryClient.invalidateQueries({ queryKey: ['small_sales_sync'] });
      setRejectRecord(null);
      setRejectionReason('');
    },
  });

  const sortedSyncRecords = [...(syncRecords || [])].sort((a, b) => {
    const aPriority = a.sync_status === 'pending_approval' ? 0 : 1;
    const bPriority = b.sync_status === 'pending_approval' ? 0 : 1;

    if (aPriority !== bPriority) return aPriority - bPriority;

    return new Date(b.synced_at).getTime() - new Date(a.synced_at).getTime();
  });

  const pendingCount = sortedSyncRecords.filter((record) => record.sync_status === 'pending_approval').length;

  /* ── Presentation ─────────────────────────────────────────────────────── */

  // The included-orders table folds Quantity under Amount when the panel is phone-narrow.
  const { ref: panelRef, narrow } = useNarrow<HTMLElement>(600);
  const shownReject = useLastWhile<any>(rejectRecord, !!rejectRecord);

  const renderOrders = (record: any) => (
    <div className="border-t border-border/60 bg-muted/20 px-3 py-3 sm:px-5 sm:pl-20">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        Included orders ({record.order_numbers?.length || 0})
      </div>
      {orderMaps && orderMaps.length > 0 ? (
        <div className="max-h-64 max-w-2xl overflow-y-auto overscroll-contain rounded-md border border-border bg-card">
          <table className="w-full table-fixed border-separate border-spacing-0 text-left text-[13px] [&_td]:border-b [&_td]:border-border/60 [&_td]:px-3 [&_td]:py-1.5 [&_th]:sticky [&_th]:top-0 [&_th]:z-[1] [&_th]:border-b [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-[0.05em] [&_th]:text-muted-foreground [&_tbody_tr:last-child>td]:border-b-0">
            <colgroup>
              <col />
              {!narrow && <col className="w-[9rem]" />}
              <col className={narrow ? 'w-[8rem]' : 'w-[8.5rem]'} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Order number</th>
                {!narrow && <th scope="col" className="text-right">Quantity</th>}
                <th scope="col" className="text-right">{narrow ? 'Amount & qty' : 'Amount'}</th>
              </tr>
            </thead>
            <tbody>
              {orderMaps.map((m) => {
                const od = m.order_data as any;
                return (
                  <tr key={m.id}>
                    <td><OrderNo value={m.binance_order_number} tail={6} className="block truncate" /></td>
                    {!narrow && <td className="truncate text-right tabular-nums text-muted-foreground">{fmtAssetQty(od?.amount, od?.asset)}</td>}
                    <td className="text-right tabular-nums">
                      <div className="truncate font-medium text-foreground">{fmtInr(od?.total_price || 0)}</div>
                      {narrow && <div className="truncate text-xs text-muted-foreground">{fmtAssetQty(od?.amount, od?.asset)}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="max-w-2xl rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">Loading order details...</div>
      )}
    </div>
  );

  return (
    <section ref={panelRef} className="min-w-0 rounded-lg border border-border bg-card shadow-[var(--shadow-xs)]" aria-label="Small sales batches">
      <PanelToolbar>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="!text-sm font-semibold text-foreground">Small sales batches</h2>
            {pendingCount > 0 && <Chip tone="warning" className="tabular-nums">{pendingCount} pending</Chip>}
          </div>
          {lastSync && (
            <p className="t-secondary mt-0.5">
              Last sync {fmtDateTime(lastSync.sync_started_at)} · {plural(lastSync.total_orders_processed, 'order', 'orders')} clubbed into{' '}
              {plural(lastSync.entries_created, 'batch', 'batches')}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} className="h-9 gap-1.5 self-start sm:ml-auto sm:self-auto">
          <RefreshCw className={cn(syncing && 'animate-spin')} aria-hidden />
          {syncing ? 'Syncing…' : 'Sync small sales'}
        </Button>
      </PanelToolbar>

      {isLoading ? (
        <PanelSkeleton rows={5} label="Loading small sales batches" />
      ) : !syncRecords || syncRecords.length === 0 ? (
        <PanelMessage icon={Package} title="No small sales batches yet">
          Use “Sync small sales” to fetch and club eligible orders.
        </PanelMessage>
      ) : (
        <>
          <ListNote className="pb-2">
            {plural(sortedSyncRecords.length, 'batch', 'batches')} · pending batches are listed first.
          </ListNote>
          <ul className="divide-y divide-border border-t border-border/60">
            {sortedSyncRecords.map((record) => {
              const expanded = expandedId === record.id;
              return (
                <li key={record.id}>
                  <div className="flex items-start gap-3 px-3 py-3 sm:items-center sm:px-5">
                    <span className="mt-0.5 flex h-9 w-12 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50 text-[11px] font-semibold tracking-wide text-foreground sm:mt-0">
                      {record.asset_code}
                    </span>
                    <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[15px] font-semibold tabular-nums text-foreground">
                            {fmtAssetQty(record.total_quantity, record.asset_code)}
                          </span>
                          <BatchStatusChip status={record.sync_status} />
                          <ExchangeAccountBadge accountId={(record as any).exchange_account_id} />
                        </div>
                        <div className="mt-0.5 text-[13px] tabular-nums text-muted-foreground">
                          {plural(record.order_count, 'order', 'orders')} · {fmtInr(record.total_amount)} · avg {fmtRate(record.avg_price)}
                        </div>
                        <div className="text-xs tabular-nums text-muted-foreground">
                          {windowLabel(record.time_window_start, record.time_window_end)} · {record.wallet_name || '—'}
                        </div>
                      </div>
                      {record.sync_status === 'pending_approval' && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 sm:mt-0 sm:shrink-0">
                          <Button size="sm" className="h-8 gap-1.5 px-2.5" onClick={() => setSelectedRecord(record)}>
                            <CheckCircle2 aria-hidden />
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" className={cn('h-8 gap-1.5 px-2.5', REJECT_BTN)} onClick={() => setRejectRecord(record)}>
                            <XCircle aria-hidden />
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                      aria-expanded={expanded}
                      aria-label="Show orders in this batch"
                      title={expanded ? 'Hide orders' : 'Show orders'}
                      onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
                    >
                      <ChevronDown className={cn('transition-transform duration-150', expanded && 'rotate-180')} aria-hidden />
                    </Button>
                  </div>
                  {expanded && renderOrders(record)}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <SmallSalesApprovalDialog
        open={!!selectedRecord}
        onOpenChange={(open) => !open && setSelectedRecord(null)}
        record={selectedRecord}
      />

      <Dialog open={!!rejectRecord} onOpenChange={(open) => { if (!open) { setRejectRecord(null); setRejectionReason(''); } }}>
        <DialogContent className={dialogContentClass('sm')}>
          <DialogHead
            title="Reject small sales batch"
            description="Use this when the batch should not be posted as a sales order. Your reason is saved with it."
          />
          <DialogBody className="space-y-4">
            {shownReject && (
              <RecordLine
                title={<span className="tabular-nums">{fmtAssetQty(shownReject.total_quantity, shownReject.asset_code)}</span>}
                detail={windowLabel(shownReject.time_window_start, shownReject.time_window_end)}
                value={fmtInr(shownReject.total_amount)}
                valueDetail={plural(shownReject.order_count, 'order', 'orders')}
              />
            )}
            <Field label="Rejection reason" htmlFor="small-sales-reject-reason" required>
              <Textarea
                id="small-sales-reject-reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter reason for rejection..."
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
              {rejectMutation.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {rejectMutation.isPending ? 'Rejecting…' : 'Reject batch'}
            </Button>
          </DialogFoot>
        </DialogContent>
      </Dialog>
    </section>
  );
}
