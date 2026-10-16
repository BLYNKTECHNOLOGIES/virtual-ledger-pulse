import { useState, useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, CloudDownload, Hourglass, Link2, Loader2, RefreshCw, UserSearch, XCircle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TerminalSalesApprovalDialog } from "./TerminalSalesApprovalDialog";
import { syncTerminalOrdersForErp } from "@/hooks/useBinanceOrderSync";
import { syncCompletedSellOrders } from "@/hooks/useTerminalSalesSync";
import { getSmallSalesConfig } from "@/hooks/useSmallSalesSync";
import { requireCurrentUserId } from "@/lib/system-action-logger";
import { usePermissions } from "@/hooks/usePermissions";
import { ExchangeAccountBadge } from "@/components/shared/ExchangeAccountBadge";
import { cn } from "@/lib/utils";
import {
  Chip,
  DialogBody,
  DialogFoot,
  DialogHead,
  Field,
  LIST_TABLE,
  ListNote,
  OrderNo,
  PanelMessage,
  PanelSkeleton,
  PanelToolbar,
  SyncStatusChip,
  dialogContentClass,
  fmtAssetQty,
  fmtDateTime,
  fmtInr,
  fmtRate,
  syncStatusMeta,
  useNarrow,
} from "@/components/orders-ui";

import { usersDirectory } from "@/lib/usersDirectory";

/** Status filter values (unchanged); the labels come from the shared sync-status wording. */
const STATUS_FILTERS = ["synced_pending_approval", "client_mapping_pending", "approved", "rejected", "duplicate_blocked"];

/** Reject in a list: outlined, red text — never a solid red button in a row. */
const REJECT_BTN = "border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive";

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
        {detail && <div className="mt-0.5 min-w-0">{detail}</div>}
      </div>
      <div className="shrink-0 text-right">
        <div className="font-semibold tabular-nums">{value}</div>
        {valueDetail && <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">{valueDetail}</div>}
      </div>
    </div>
  );
}

const Dot = () => <span className="text-muted-foreground" aria-hidden>·</span>;

const PENDING_STATUSES = ['synced_pending_approval', 'client_mapping_pending'];

async function resolveTerminalWalletMapping(accountId: string | null) {
  if (!accountId) return null;
  const { data: link } = await supabase
    .from('terminal_wallet_links')
    .select('wallet_id, fee_treatment, wallets:wallet_id(wallet_name)')
    .eq('platform_source', 'terminal')
    .eq('status', 'active')
    .eq('exchange_account_id', accountId)
    .maybeSingle();
  if (!link?.wallet_id) return null;
  return {
    wallet_id: link.wallet_id,
    wallet_name: (link.wallets as any)?.wallet_name || 'Terminal Wallet',
    fee_treatment: link.fee_treatment,
  };
}

export function TerminalSalesSyncTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const [statusFilter, setStatusFilter] = useState("all");
  const [approvalRecord, setApprovalRecord] = useState<any>(null);
  const [rejectRecord, setRejectRecord] = useState<any>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState("");

  // Fetch sync records + reviewer usernames
  const { data: syncData = { records: [], userMap: {} as Record<string, string> }, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['terminal-sales-sync', statusFilter],
    queryFn: async () => {
      // Show last 7 days to catch cross-day orders
      const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
      const cutoffTime = Date.now() - LOOKBACK_MS;

      let query = supabase
        .from('terminal_sales_sync')
        .select('*')
        .order('synced_at', { ascending: false })
        .limit(1000);

      if (statusFilter !== 'all') {
        query = query.eq('sync_status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch small sales config to exclude small-range orders from terminal sync view
      const smallConfig = await getSmallSalesConfig();

      // Filter: for approved/rejected show last 7 days; for pending statuses show ALL (no time cutoff)
      const PENDING_STATUSES = ['synced_pending_approval', 'client_mapping_pending'];
      const filtered = (data || []).filter(r => {
        const od = r.order_data as any;
        const createTime = Number(od?.create_time || 0);
        // Never hide pending records — they need action regardless of age
        const isPending = PENDING_STATUSES.includes(r.sync_status);
        if (!isPending && createTime > 0 && createTime < cutoffTime) return false;

        // Exclude orders in small sales range — they belong in Small Sales tab
        if (smallConfig?.is_enabled) {
          const tp = parseFloat(od?.total_price || '0');
          if (tp >= smallConfig.min_amount && tp <= smallConfig.max_amount) return false;
        }
        return true;
      });

      // Sort by order creation time (latest first)
      const sorted = filtered.sort((a, b) => {
        const timeA = Number((a.order_data as any)?.create_time || 0);
        const timeB = Number((b.order_data as any)?.create_time || 0);
        return timeB - timeA;
      });

      // Fetch reviewer usernames for records that have reviewed_by
      const reviewerIds = [...new Set(sorted.map((r: any) => r.reviewed_by).filter(Boolean))];
      let userMap: Record<string, string> = {};
      if (reviewerIds.length > 0) {
        const { data: users } = await usersDirectory()
          .select('id, username, first_name, last_name')
          .in('id', reviewerIds as string[]);
        for (const u of (users || [])) {
          const displayName = u.first_name ? `${u.first_name} ${u.last_name || ''}`.trim() : u.username;
          userMap[u.id] = displayName;
        }
      }

      return { records: sorted, userMap };
    },
  });

  const syncRecords = syncData.records;
  const userMap = syncData.userMap;

  // Enrich missing verified names
  const enrichMutation = useMutation({
    mutationFn: async () => {
      const pendingRecords = syncRecords.filter((r: any) => {
        const od = r.order_data as any;
        return !od?.verified_name && (r.sync_status === 'synced_pending_approval' || r.sync_status === 'client_mapping_pending');
      });
      let enriched = 0;
      for (const record of pendingRecords) {
        const orderNumber = (record.order_data as any)?.order_number || record.binance_order_number;
        if (!orderNumber) continue;
        try {
          const { data } = await supabase.functions.invoke('binance-ads', {
            body: { action: 'getOrderDetail', orderNumber, exchange_account_id: record.exchange_account_id },
          });
          const apiResult = data?.data;
          const detail = apiResult?.data || apiResult;
          const resolvedExchangeAccountId = apiResult?._resolvedExchangeAccountId || record.exchange_account_id || null;
          const buyerName = detail?.buyerRealName || detail?.buyerName || null;
          if (buyerName) {
            const od = record.order_data as any;
            const walletMapping = await resolveTerminalWalletMapping(resolvedExchangeAccountId);
            await supabase
              .from('terminal_sales_sync')
              .update({
                counterparty_name: buyerName,
              exchange_account_id: resolvedExchangeAccountId,
              order_data: { ...od, verified_name: buyerName, ...(walletMapping || {}) },
              })
              .eq('id', record.id);
            enriched++;
          }
          await new Promise(r => setTimeout(r, 300));
        } catch { /* skip */ }
      }
      return enriched;
    },
    onSuccess: (enriched) => {
      toast({
        title: "Name Enrichment Complete",
        description: `${enriched} buyer names verified from Binance`,
      });
      queryClient.invalidateQueries({ queryKey: ['terminal-sales-sync'] });
    },
  });

  // Auto-enrich names for records missing verified_name
  async function enrichMissingNamesAuto() {
    const { data: freshRecords } = await supabase
      .from('terminal_sales_sync')
      .select('*')
      .in('sync_status', ['synced_pending_approval', 'client_mapping_pending'])
      .order('synced_at', { ascending: false })
      .limit(200);

    if (!freshRecords?.length) return 0;

    const pending = freshRecords.filter((r: any) => !(r.order_data as any)?.verified_name);
    let enriched = 0;
    for (const record of pending) {
      const orderNumber = (record.order_data as any)?.order_number || record.binance_order_number;
      if (!orderNumber) continue;
      try {
        const { data } = await supabase.functions.invoke('binance-ads', {
            body: { action: 'getOrderDetail', orderNumber, exchange_account_id: record.exchange_account_id },
        });
        const apiResult = data?.data;
        const detail = apiResult?.data || apiResult;
          const resolvedExchangeAccountId = apiResult?._resolvedExchangeAccountId || record.exchange_account_id || null;
        const buyerName = detail?.buyerRealName || detail?.buyerName || null;
        if (buyerName) {
          const od = record.order_data as any;
          const walletMapping = await resolveTerminalWalletMapping(resolvedExchangeAccountId);
          await supabase
            .from('terminal_sales_sync')
            .update({
              counterparty_name: buyerName,
                exchange_account_id: resolvedExchangeAccountId,
                order_data: { ...od, verified_name: buyerName, ...(walletMapping || {}) },
            })
            .eq('id', record.id);
          enriched++;
        }
        await new Promise(r => setTimeout(r, 300));
      } catch { /* skip */ }
    }
    return enriched;
  }

  // Auto-trigger name enrichment on load when pending rows are missing verified names
  const autoEnrichDone = useRef(false);
  const isEnrichingRef = useRef(false);
  useEffect(() => {
    if (autoEnrichDone.current || isEnrichingRef.current) return;
    const hasMissingNames = syncRecords.some((r: any) => {
      const od = r?.order_data as any;
      return PENDING_STATUSES.includes(r?.sync_status) && !od?.verified_name;
    });
    if (!hasMissingNames) return;
    autoEnrichDone.current = true;
    isEnrichingRef.current = true;
    (async () => {
      try {
        const enriched = await enrichMissingNamesAuto();
        if (enriched > 0) {
          queryClient.invalidateQueries({ queryKey: ['terminal-sales-sync'] });
          queryClient.invalidateQueries({ queryKey: ['erp-entry-feed'] });
        }
      } catch (e) {
        console.warn('[TerminalSalesSync] Auto-enrichment failed:', e);
      } finally {
        isEnrichingRef.current = false;
      }
    })();
  }, [syncRecords, queryClient]);



  // Manual sync trigger — now also auto-fetches names
  const syncMutation = useMutation({
    mutationFn: async () => {
      await syncTerminalOrdersForErp({ forceGapFill: true });
      const syncResult = await syncCompletedSellOrders();
      // Invalidate so we get fresh records before enrichment
      await queryClient.invalidateQueries({ queryKey: ['terminal-sales-sync'] });
      // Auto-enrich names
      const enriched = await enrichMissingNamesAuto();
      return { ...syncResult, enriched };
    },
    onSuccess: ({ synced, duplicates, enriched }) => {
      toast({
        title: "Sales Sync Complete",
        description: `${synced} synced, ${duplicates} duplicates skipped, ${enriched} names fetched`,
      });
      queryClient.invalidateQueries({ queryKey: ['terminal-sales-sync'] });
      queryClient.invalidateQueries({ queryKey: ['erp-entry-feed'] });
    },
    onError: (err: any) => {
      toast({ title: "Sync Error", description: err.message, variant: "destructive" });
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const userId = await requireCurrentUserId();
      const { error } = await supabase
        .from('terminal_sales_sync')
        .update({
          sync_status: 'rejected',
          rejection_reason: reason,
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Sell Order Rejected" });
      queryClient.invalidateQueries({ queryKey: ['terminal-sales-sync'] });
      queryClient.invalidateQueries({ queryKey: ['erp-entry-feed'] });
      setRejectRecord(null);
      setRejectionReason("");
    },
  });

  const pendingCount = syncRecords.filter((r: any) => PENDING_STATUSES.includes(r.sync_status)).length;
  const pendingRecordsList = syncRecords.filter((r: any) => PENDING_STATUSES.includes(r.sync_status));
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

  const bulkRejectMutation = useMutation({
    mutationFn: async ({ ids, reason }: { ids: string[]; reason: string }) => {
      const userId = await requireCurrentUserId();
      const { error } = await supabase
        .from('terminal_sales_sync')
        .update({
          sync_status: 'rejected',
          rejection_reason: reason,
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
        })
        .in('id', ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      toast({ title: `${count} orders rejected` });
      queryClient.invalidateQueries({ queryKey: ['terminal-sales-sync'] });
      setSelectedIds(new Set());
      setBulkRejectOpen(false);
      setBulkRejectReason("");
    },
  });

  /* ── Presentation ─────────────────────────────────────────────────────── */

  // One layout for the room the list really has: cards on phones, then progressively wider tables.
  const { ref: listRef, narrow, width: listWidth } = useNarrow<HTMLDivElement>(600);
  const wide = listWidth >= 1180; // separate "Reviewed by" column
  const merged = listWidth < 1000; // order and buyer share one column
  const stacked = listWidth < 900; // Approve above Reject, without icons
  const compact = listWidth < 700; // status folds under the amount

  const canReject = hasPermission('terminal_destructive');
  const showFetchNames = syncRecords.some((r: any) => !(r.order_data as any)?.verified_name && (r.sync_status === 'synced_pending_approval' || r.sync_status === 'client_mapping_pending'));
  const shownReject = useLastWhile<any>(rejectRecord, !!rejectRecord);
  // What the bulk dialog lists: the selected orders this view can show (a selection can outlive a filter change).
  const shownBulk = useLastWhile(
    { count: selectedIds.size, rows: bulkRejectOpen ? syncRecords.filter((r: any) => selectedIds.has(r.id)) : [] },
    bulkRejectOpen,
  );
  const shownBulkCount = shownBulk.count;
  const selectedRows: any[] = shownBulk.rows;
  const selectedElsewhere = Math.max(0, shownBulk.count - selectedRows.length);
  const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

  const rowInfo = (record: any) => {
    const od = record.order_data as any;
    const verifiedName = od?.verified_name;
    const rawCounterparty = (od?.counterparty_nickname || record.counterparty_name || '').toString().trim();
    const hasRealCounterparty = !!rawCounterparty && rawCounterparty !== 'Unknown' && !rawCounterparty.includes('*');
    const buyerDisplay: string | null = verifiedName || (hasRealCounterparty ? rawCounterparty : null);
    const hasUsableName = !!verifiedName || hasRealCounterparty;
    const isPendingVerifiedName = !hasUsableName && PENDING_STATUSES.includes(record.sync_status);
    const reviewerName: string | null = record.reviewed_by ? (userMap[record.reviewed_by] || record.reviewed_by.slice(0, 8) + '...') : null;
    // Prefer the unmasked nickname (terminal stores real nickname here for ASEC + Blynk)
    const nick = (od?.counterparty_nickname_unmasked || od?.counterparty_nickname || record.counterparty_name || '').toString().trim();
    const showNick = !!buyerDisplay && !!nick && !nick.includes('*') && nick !== buyerDisplay;
    const actionable = record.sync_status === 'synced_pending_approval' || record.sync_status === 'client_mapping_pending';
    return { od, buyerDisplay, nick, showNick, isPendingVerifiedName, reviewerName, actionable };
  };
  type RowInfo = ReturnType<typeof rowInfo>;

  const orderTime = (record: any) => {
    const od = record.order_data as any;
    return od?.create_time ? fmtDateTime(Number(od.create_time)) : (record.synced_at ? fmtDateTime(record.synced_at) : '—');
  };
  const priceLine = (od: any) => `${fmtAssetQty(od?.amount || 0, od?.asset)} @ ${fmtRate(od?.unit_price || 0)}`;
  const rejectedReason = (record: any): string | null => (record.sync_status === 'rejected' && record.rejection_reason ? record.rejection_reason : null);

  const rowCheckbox = (record: any) => (
    <Checkbox
      checked={selectedIds.has(record.id)}
      onCheckedChange={() => toggleSelect(record.id)}
      aria-label={`Select order ${record.binance_order_number}`}
    />
  );

  const buyerBlock = (info: RowInfo, nameClass?: string) =>
    info.buyerDisplay ? (
      <div className="flex min-w-0 flex-col">
        <span className={cn("truncate font-medium text-foreground", nameClass)} title={info.buyerDisplay}>{info.buyerDisplay}</span>
        {info.showNick && <span className="truncate font-mono text-[12px] text-muted-foreground">@{info.nick}</span>}
      </div>
    ) : (
      <Chip tone="warning" className="w-fit" title="The buyer's verified name hasn't been fetched from Binance yet">Name pending</Chip>
    );

  const orderMeta = (record: any) => (
    <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
      <span className="truncate text-xs tabular-nums text-muted-foreground">{orderTime(record)}</span>
      <ExchangeAccountBadge accountId={record.exchange_account_id} className="shrink-0" />
    </div>
  );

  const statusBlock = (record: any, info: RowInfo, withReviewer: boolean) => {
    const reason = rejectedReason(record);
    return (
      <div className="flex min-w-0 flex-col items-start gap-1">
        <SyncStatusChip status={record.sync_status} />
        {reason && (
          <span className="w-full truncate text-xs text-muted-foreground" title={reason}>{reason}</span>
        )}
        {withReviewer && info.reviewerName && (
          <span className="w-full truncate text-xs text-muted-foreground" title={`Reviewed by ${info.reviewerName}`}>by {info.reviewerName}</span>
        )}
      </div>
    );
  };

  const rowActions = (record: any, info: RowInfo, stacked = false) => (
    <div className={cn("flex gap-1.5", stacked ? "flex-col items-stretch" : "flex-wrap items-center justify-end")}>
      {info.isPendingVerifiedName ? (
        <span
          className={cn("inline-flex h-8 items-center gap-1.5 whitespace-nowrap text-xs font-medium text-muted-foreground", stacked && "justify-center")}
          title="Approve becomes available once Binance returns the buyer's name. Use Fetch names to try again."
        >
          {!stacked && <Hourglass className="h-3.5 w-3.5 shrink-0" aria-hidden />}
          Awaiting name
        </span>
      ) : (
        <Button
          variant="default"
          size="sm"
          className="h-8 gap-1.5 px-2.5"
          onClick={() => setApprovalRecord(record)}
        >
          {!stacked && <CheckCircle2 aria-hidden />}
          Approve
        </Button>
      )}
      {canReject && (
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 gap-1.5 px-2.5", REJECT_BTN)}
          onClick={() => setRejectRecord(record)}
        >
          {!stacked && <XCircle aria-hidden />}
          Reject
        </Button>
      )}
    </div>
  );

  const listNote = () => {
    const n = syncRecords.length;
    return `${plural(n, "order", "orders")} · pending orders stay until they are reviewed; others are listed for 7 days.`;
  };

  const renderTable = () => (
    <table className={cn(LIST_TABLE, "table-fixed [&_tbody_td]:py-3")}>
      <colgroup>
        <col className="w-10" />
        <col className={merged ? undefined : "w-[14.5rem]"} />
        {!merged && <col />}
        <col className="w-[11.5rem]" />
        {!compact && <col className="w-[10.5rem]" />}
        {wide && <col className="w-[9rem]" />}
        <col className={stacked ? "w-[7.5rem]" : "w-[14.5rem]"} />
      </colgroup>
      <thead>
        <tr>
          <th scope="col" className="!pr-0">
            <Checkbox
              checked={allPendingSelected && pendingRecordsList.length > 0}
              onCheckedChange={toggleSelectAll}
              aria-label="Select all pending"
            />
          </th>
          <th scope="col">{merged ? "Order & buyer" : "Order"}</th>
          {!merged && <th scope="col">Buyer</th>}
          <th scope="col" className="text-right">{compact ? "Amount & status" : "Amount"}</th>
          {!compact && <th scope="col">Status</th>}
          {wide && <th scope="col">Reviewed by</th>}
          <th scope="col" className="text-right"><span className="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        {syncRecords.map((record: any) => {
          const info = rowInfo(record);
          const reason = rejectedReason(record);
          return (
            <tr key={record.id} className={cn(selectedIds.has(record.id) && "bg-primary/[0.04]")}>
              <td className="!pr-0">{PENDING_STATUSES.includes(record.sync_status) ? rowCheckbox(record) : null}</td>
              {merged ? (
                <td>
                  <div className="flex min-w-0 flex-col gap-1">
                    {buyerBlock(info)}
                    <div className="min-w-0">
                      <OrderNo value={record.binance_order_number} tail={6} className="block truncate" />
                      {orderMeta(record)}
                    </div>
                  </div>
                </td>
              ) : (
                <>
                  <td>
                    <OrderNo value={record.binance_order_number} tail={6} className="block truncate" />
                    {orderMeta(record)}
                  </td>
                  <td>{buyerBlock(info)}</td>
                </>
              )}
              <td className="text-right">
                <div className="truncate font-semibold tabular-nums text-foreground">{fmtInr(info.od?.total_price || 0)}</div>
                <div className="truncate text-xs tabular-nums text-muted-foreground" title={priceLine(info.od)}>{priceLine(info.od)}</div>
                {compact && (
                  <div className="mt-1 flex min-w-0 flex-col items-end gap-0.5">
                    <SyncStatusChip status={record.sync_status} />
                    {reason && <span className="w-full truncate text-xs text-muted-foreground" title={reason}>{reason}</span>}
                    {info.reviewerName && <span className="w-full truncate text-xs text-muted-foreground">by {info.reviewerName}</span>}
                  </div>
                )}
              </td>
              {!compact && <td>{statusBlock(record, info, !wide)}</td>}
              {wide && <td className="truncate text-muted-foreground">{info.reviewerName ?? "—"}</td>}
              <td>{info.actionable && rowActions(record, info, stacked)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const renderCards = () => (
    <ul className="divide-y divide-border">
      {syncRecords.map((record: any) => {
        const info = rowInfo(record);
        const reason = rejectedReason(record);
        const selectable = PENDING_STATUSES.includes(record.sync_status);
        return (
          <li key={record.id} className={cn("px-3 py-3 sm:px-5", selectedIds.has(record.id) && "bg-primary/[0.04]")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">{buyerBlock(info, "text-[15px]")}</div>
              <SyncStatusChip status={record.sync_status} className="mt-0.5 shrink-0" />
            </div>
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="text-base font-semibold tabular-nums text-foreground">{fmtInr(info.od?.total_price || 0)}</span>
              <span className="text-xs tabular-nums text-muted-foreground">{priceLine(info.od)}</span>
            </div>
            <OrderNo value={record.binance_order_number} tail={6} className="mt-1.5 block truncate" />
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
              <span className="tabular-nums">{orderTime(record)}</span>
              <ExchangeAccountBadge accountId={record.exchange_account_id} />
              {info.reviewerName && (
                <>
                  <Dot />
                  <span>by {info.reviewerName}</span>
                </>
              )}
            </div>
            {reason && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground" title={reason}>{reason}</div>}
            {(selectable || info.actionable) && (
              <div className="mt-2.5 flex items-center gap-2">
                {selectable && (
                  <label className="-ml-1.5 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-muted">
                    {rowCheckbox(record)}
                  </label>
                )}
                {info.actionable && rowActions(record, info)}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <section className="min-w-0 rounded-lg border border-border bg-card shadow-[var(--shadow-xs)]" aria-label="Terminal sales waiting for approval">
      <PanelToolbar>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="terminal-sales-status-filter" className="text-[13px] font-medium text-muted-foreground">
            Status
          </label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger id="terminal-sales-status-filter" className="h-9 w-[172px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUS_FILTERS.map((s) => (
                <SelectItem key={s} value={s}>{syncStatusMeta(s).label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {pendingCount > 0 && (
            <Chip tone="warning" className="tabular-nums">{pendingCount} pending</Chip>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 gap-1.5">
            <RefreshCw className={cn(isFetching && !isLoading && "animate-spin")} aria-hidden />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending || enrichMutation.isPending} className="h-9 gap-1.5">
            {syncMutation.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <CloudDownload aria-hidden />}
            {syncMutation.isPending ? 'Syncing & fetching names…' : 'Sync now'}
          </Button>
          {showFetchNames && (
            <Button variant="outline" size="sm" onClick={() => enrichMutation.mutate()} disabled={enrichMutation.isPending} className="h-9 gap-1.5">
              {enrichMutation.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <UserSearch aria-hidden />}
              {enrichMutation.isPending ? 'Fetching names…' : 'Fetch names'}
            </Button>
          )}
        </div>
      </PanelToolbar>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/70 bg-primary/[0.04] px-3 py-2 sm:px-5" role="region" aria-label="Selected orders">
          <span className="text-[13px] font-medium tabular-nums text-foreground">{selectedIds.size} selected</span>
          {canReject && (
            <Button variant="outline" size="sm" className={cn("h-8 gap-1.5", REJECT_BTN)} onClick={() => setBulkRejectOpen(true)}>
              <XCircle aria-hidden />
              Reject selected
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-8" onClick={() => setSelectedIds(new Set())}>
            Clear selection
          </Button>
        </div>
      )}

      <div ref={listRef}>
        {isLoading ? (
          <PanelSkeleton rows={8} label="Loading Terminal sales" />
        ) : syncRecords.length === 0 ? (
          <PanelMessage
            icon={Link2}
            title={statusFilter === 'all' ? "No Terminal sales to review" : `No orders with status “${syncStatusMeta(statusFilter).label}”`}
          >
            {statusFilter === 'all' ? (
              "Completed SELL orders from Terminal appear here after a sync."
            ) : (
              <>
                Pending orders are listed at any age; other statuses only from the last 7 days.{" "}
                <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setStatusFilter("all")}>
                  Show all statuses
                </Button>
              </>
            )}
          </PanelMessage>
        ) : (
          <>
            {narrow ? (
              <div className="flex min-h-11 items-center justify-between gap-3 px-3 pt-2 sm:px-5">
                {pendingRecordsList.length > 0 ? (
                  <label className="-ml-1.5 flex cursor-pointer items-center gap-2 rounded-md py-1.5 pl-1.5 pr-2 text-[13px] text-foreground hover:bg-muted">
                    <Checkbox
                      checked={allPendingSelected && pendingRecordsList.length > 0}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all pending"
                    />
                    Select all pending
                  </label>
                ) : <span />}
                <span className="text-xs tabular-nums text-muted-foreground">{plural(syncRecords.length, "order", "orders")}</span>
              </div>
            ) : (
              <ListNote className="pb-2">{listNote()}</ListNote>
            )}
            {narrow ? renderCards() : renderTable()}
          </>
        )}
      </div>

      {/* Approval Dialog */}
      {approvalRecord && (
        <TerminalSalesApprovalDialog
          open={!!approvalRecord}
          onOpenChange={(open) => { if (!open) setApprovalRecord(null); }}
          syncRecord={approvalRecord}
          onSuccess={() => {
            setApprovalRecord(null);
            queryClient.invalidateQueries({ queryKey: ['terminal-sales-sync'] });
          }}
        />
      )}

      {/* Rejection Dialog */}
      <Dialog open={!!rejectRecord} onOpenChange={(open) => { if (!open) { setRejectRecord(null); setRejectionReason(""); } }}>
        <DialogContent className={dialogContentClass("sm")}>
          <DialogHead
            title="Reject Terminal sell order"
            description="Use this when the order should not become an ERP sales order. Your reason is saved with it."
          />
          <DialogBody className="space-y-4">
            {shownReject && (() => {
              const info = rowInfo(shownReject);
              return (
                <RecordLine
                  title={info.buyerDisplay ?? <span className="text-muted-foreground">Name pending</span>}
                  detail={<OrderNo value={shownReject.binance_order_number} tail={6} className="block truncate" />}
                  value={fmtInr(info.od?.total_price || 0)}
                  valueDetail={fmtAssetQty(info.od?.amount || 0, info.od?.asset)}
                />
              );
            })()}
            <Field label="Rejection reason" htmlFor="terminal-sale-reject-reason" required>
              <Textarea
                id="terminal-sale-reject-reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter reason for rejection..."
              />
            </Field>
          </DialogBody>
          <DialogFoot>
            <Button variant="outline" onClick={() => { setRejectRecord(null); setRejectionReason(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => rejectMutation.mutate({ id: rejectRecord.id, reason: rejectionReason })}
              disabled={!rejectionReason.trim() || rejectMutation.isPending}
            >
              {rejectMutation.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {rejectMutation.isPending ? "Rejecting…" : "Reject order"}
            </Button>
          </DialogFoot>
        </DialogContent>
      </Dialog>

      {/* Bulk Rejection Dialog */}
      <Dialog open={bulkRejectOpen} onOpenChange={(open) => { if (!open) { setBulkRejectOpen(false); setBulkRejectReason(""); } }}>
        <DialogContent className={dialogContentClass("sm")}>
          <DialogHead
            title={`Reject ${plural(shownBulkCount, "selected order", "selected orders")}`}
            description="Use this when these orders should not become ERP sales orders. The same reason is saved with each one."
          />
          <DialogBody className="space-y-4">
            {(selectedRows.length > 0 || selectedElsewhere > 0) && (
              <div className="overflow-hidden rounded-lg border border-border">
                {selectedRows.length > 0 && (
                  <ul className="max-h-44 divide-y divide-border/70 overflow-y-auto overscroll-contain text-[13px]">
                    {selectedRows.map((r: any) => {
                      const info = rowInfo(r);
                      return (
                        <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                          <span className="flex min-w-0 items-center gap-2">
                            <OrderNo value={r.binance_order_number} tail={6} className="shrink-0" />
                            <span className={cn("truncate", info.buyerDisplay ? "text-foreground" : "text-muted-foreground")}>{info.buyerDisplay ?? "Name pending"}</span>
                          </span>
                          <span className="shrink-0 font-medium tabular-nums">{fmtInr(info.od?.total_price || 0)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {selectedElsewhere > 0 && (
                  <p className={cn("bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground", selectedRows.length > 0 && "border-t border-border/70")}>
                    {selectedElsewhere === 1 ? "1 selected order isn't in the current view." : `${selectedElsewhere.toLocaleString("en-IN")} selected orders aren't in the current view.`}
                  </p>
                )}
              </div>
            )}
            <Field label="Rejection reason" htmlFor="terminal-sale-bulk-reject-reason" required hint="Applies to every selected order.">
              <Textarea
                id="terminal-sale-bulk-reject-reason"
                value={bulkRejectReason}
                onChange={(e) => setBulkRejectReason(e.target.value)}
                placeholder="Enter reason for rejection..."
              />
            </Field>
          </DialogBody>
          <DialogFoot>
            <Button variant="outline" onClick={() => { setBulkRejectOpen(false); setBulkRejectReason(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => bulkRejectMutation.mutate({ ids: [...selectedIds], reason: bulkRejectReason })}
              disabled={!bulkRejectReason.trim() || bulkRejectMutation.isPending}
            >
              {bulkRejectMutation.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {bulkRejectMutation.isPending ? "Rejecting…" : `Reject ${plural(shownBulkCount, "order", "orders")}`}
            </Button>
          </DialogFoot>
        </DialogContent>
      </Dialog>
    </section>
  );
}
