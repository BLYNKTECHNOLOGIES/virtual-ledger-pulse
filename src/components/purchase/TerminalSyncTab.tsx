import { useState, useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, CheckCircle2, XCircle, Loader2, RefreshCw, Link2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TerminalPurchaseApprovalDialog } from "./TerminalPurchaseApprovalDialog";
import { syncCompletedBuyOrders } from "@/hooks/useTerminalPurchaseSync";
import { getCurrentUserId } from "@/lib/system-action-logger";
import { usePermissions } from "@/hooks/usePermissions";
import { syncTerminalOrdersForErp } from "@/hooks/useBinanceOrderSync";
import { ExchangeAccountBadge } from "@/components/shared/ExchangeAccountBadge";
import { cn } from "@/lib/utils";
import {
  Chip,
  DialogBody,
  DialogFoot,
  DialogHead,
  Field,
  LIST_DENSITY,
  LIST_TABLE,
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

/** Status filter: the values are the query's filter values; the labels follow the status chips. */
const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "pending_queue", label: "All pending" },
  ...["synced_pending_approval", "client_mapping_pending", "approved", "rejected", "duplicate_blocked"].map((value) => ({
    value,
    label: syncStatusMeta(value).label,
  })),
];

/** Outline "Reject" in lists (no solid red buttons in rows). */
const REJECT_OUTLINE = "border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive";

/** The record a confirmation acts on, in one quiet bordered line. */
function RecordLine({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md border border-border bg-muted/40 px-3 py-2 text-[13px] text-foreground">
      {children}
    </div>
  );
}

const Dot = () => <span className="text-muted-foreground" aria-hidden>·</span>;

const PENDING_SYNC_STATUSES = ['synced_pending_approval', 'client_mapping_pending'];

function extractSellerNameFromDetail(detail: any): string | null {
  const direct = detail?.sellerRealName || detail?.sellerName || detail?.sellerNickName || null;
  if (direct) return String(direct).trim();
  const methods = Array.isArray(detail?.payMethods) ? detail.payMethods : Array.isArray(detail?.tradeMethods) ? detail.tradeMethods : [];
  for (const method of methods) {
    const fields = Array.isArray(method?.fields) ? method.fields : [];
    const payee = fields.find((field: any) => String(field?.fieldContentType || '').toLowerCase() === 'payee' && String(field?.fieldValue || '').trim());
    if (payee) return String(payee.fieldValue).trim();
  }
  return null;
}

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

export function TerminalSyncTab() {
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
  const { data: syncData = { records: [], userMap: {} as Record<string, string> }, isLoading, isFetching, isError, error, refetch } = useQuery({
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
        const { data: users } = await usersDirectory()
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
      .select('id, binance_order_number, exchange_account_id, order_data, sync_status, counterparty_name')
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
        let resolvedExchangeAccountId = record.exchange_account_id || null;

        if (!sellerName) {
          const { data } = await supabase.functions.invoke('binance-ads', {
            body: { action: 'getOrderDetail', orderNumber, exchange_account_id: record.exchange_account_id },
          });
          const apiResult = data?.data;
          const detail = apiResult?.data || apiResult;
          resolvedExchangeAccountId = apiResult?._resolvedExchangeAccountId || record.exchange_account_id || null;
          sellerName = extractSellerNameFromDetail(detail);

          if (sellerName) {
            await supabase
              .from('binance_order_history')
              .update({ verified_name: sellerName, exchange_account_id: resolvedExchangeAccountId })
              .eq('order_number', orderNumber);
          }
        }

        if (sellerName) {
          const od = record.order_data as any;
          const walletMapping = await resolveTerminalWalletMapping(resolvedExchangeAccountId);
          await supabase
            .from('terminal_purchase_sync')
            .update({
              counterparty_name: sellerName,
              exchange_account_id: resolvedExchangeAccountId,
              order_data: { ...od, verified_name: sellerName, ...(walletMapping || {}) },
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
      return (
        PENDING_SYNC_STATUSES.includes(r?.sync_status) && !od?.verified_name
      );
    });
    if (!hasMissingNames) return;
    autoEnrichDone.current = true;
    isEnrichingRef.current = true;
    (async () => {
      try {
        const enriched = await enrichMissingNames();
        if (enriched > 0) {
          queryClient.invalidateQueries({ queryKey: ['terminal-purchase-sync'] });
          queryClient.invalidateQueries({ queryKey: ['erp-entry-feed'] });
        }
      } catch (e) {
        console.warn('[TerminalSync] Auto-enrichment failed:', e);
      } finally {
        isEnrichingRef.current = false;
      }
    })();
  }, [syncRecords, queryClient]);



  // Manual sync trigger — includes name enrichment
  const syncMutation = useMutation({
    mutationFn: async () => {
      toast({ title: "Syncing...", description: "Fetching latest orders from Binance, then syncing purchases..." });
      // Step 1: Pull fresh orders from Binance API into binance_order_history
      await syncTerminalOrdersForErp({ forceGapFill: true });
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
      queryClient.invalidateQueries({ queryKey: ['erp-entry-feed'] });
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
      queryClient.invalidateQueries({ queryKey: ['erp-entry-feed'] });
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

  /* ── Presentation ─────────────────────────────────────────────────────── */

  // One layout for the room the list really has: cards on phones, then progressively wider tables.
  const { ref: listRef, narrow, width: listWidth } = useNarrow<HTMLDivElement>(600);
  const full = listWidth >= 1240; // separate PAN and Reviewed columns
  const merged = listWidth < 860; // order and seller share one column; the status sits under the amount
  const stackedActions = listWidth < 1000; // Approve above Reject

  /** Display values for one queue row (the same naming and PAN rules the queue has always used). */
  const rowView = (record: any) => {
    const od = record.order_data as any;
    const verifiedName = od?.verified_name;
    const rawCounterparty = (record.counterparty_name || '').toString().trim();
    const hasRealCounterparty = !!rawCounterparty && rawCounterparty !== 'Unknown' && !rawCounterparty.includes('*');
    const sellerDisplay = verifiedName || (hasRealCounterparty ? rawCounterparty : null);
    // A name is usable for approval if we have a Binance verified name OR a real (non-masked) counterparty name.
    const hasUsableName = !!verifiedName || hasRealCounterparty;
    const isPendingVerifiedName = !hasUsableName && PENDING_SYNC_STATUSES.includes(record.sync_status);
    const isMaskedName = !hasUsableName && (isPendingVerifiedName || record.counterparty_name?.includes('***'));
    const reviewerName = record.reviewed_by ? (userMap[record.reviewed_by] || record.reviewed_by.slice(0, 8) + '...') : null;
    // Prefer the unmasked nickname (terminal stores real nickname here for ASEC + Blynk)
    const nickRaw = (od?.counterparty_nickname_unmasked || od?.counterparty_nickname || record.counterparty_name || '').toString().trim();
    // Only show the nickname when it is a separate signal from the displayed verified name
    const nick = nickRaw && !nickRaw.includes('*') && nickRaw !== sellerDisplay ? nickRaw : null;
    const mappedClientPan = (record.clients as any)?.pan_card_number?.trim?.() || null;
    const terminalPan = record.pan_number?.trim?.() || null;
    // If client is mapped, show ONLY client master PAN to avoid cross-client PAN bleed.
    // Use terminal PAN only for unmapped rows.
    const pan: string | null = record.client_id ? mappedClientPan : terminalPan;
    return {
      od,
      sellerDisplay,
      hasUsableName,
      isMaskedName,
      reviewerName,
      nick,
      pan,
      asset: String(od?.asset || 'USDT').toUpperCase(),
      orderedAt: od?.create_time ? Number(od.create_time) : (record.synced_at || null),
    };
  };
  type RowView = ReturnType<typeof rowView>;

  const listNote = `${syncRecords.length.toLocaleString("en-IN")} ${syncRecords.length === 1 ? "order" : "orders"} from the last 7 days`;
  const selectedRecords = syncRecords.filter((r: any) => selectedIds.has(r.id));

  const sellerBlock = (v: RowView, withPan = false) => (
    <div className="flex min-w-0 flex-col items-start gap-0.5">
      {v.isMaskedName ? (
        <Chip tone="warning" title="Verified name required before approval">Awaiting verified name</Chip>
      ) : (
        <span className="max-w-full truncate font-medium text-foreground" title={v.sellerDisplay || undefined}>
          {v.sellerDisplay || "—"}
        </span>
      )}
      {!v.isMaskedName && v.nick && <span className="max-w-full truncate text-xs text-muted-foreground">@{v.nick}</span>}
      {withPan && <PanLine pan={v.pan} />}
    </div>
  );

  const orderBlock = (record: any, v: RowView) => (
    <div className="flex min-w-0 flex-col gap-0.5">
      <OrderNo value={record.binance_order_number} tail={6} className="block" />
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
        <span className="whitespace-nowrap tabular-nums">{fmtDateTime(v.orderedAt)}</span>
        <ExchangeAccountBadge accountId={record.exchange_account_id} />
      </div>
    </div>
  );

  /** Narrow tables: seller, order number and order facts in one cell. */
  const mergedBlock = (record: any, v: RowView) => (
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="flex min-w-0 items-baseline gap-1.5">
        {v.isMaskedName ? (
          <Chip tone="warning" title="Verified name required before approval">Awaiting verified name</Chip>
        ) : (
          <span className="min-w-0 truncate font-medium text-foreground" title={v.sellerDisplay || undefined}>
            {v.sellerDisplay || "—"}
          </span>
        )}
        {!v.isMaskedName && v.nick && <span className="min-w-[3rem] shrink-[3] truncate text-xs text-muted-foreground">@{v.nick}</span>}
      </div>
      <OrderNo value={record.binance_order_number} tail={6} className="block" />
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
        <span className="whitespace-nowrap tabular-nums">{fmtDateTime(v.orderedAt)}</span>
        <Dot />
        <PanLine pan={v.pan} />
        <ExchangeAccountBadge accountId={record.exchange_account_id} />
      </div>
    </div>
  );

  const amountBlock = (v: RowView) => (
    <div className="min-w-0 text-right">
      <div className="truncate font-semibold tabular-nums text-foreground">{fmtInr(v.od?.total_price)}</div>
      <div className="flex flex-wrap justify-end gap-x-1 text-xs tabular-nums text-muted-foreground">
        <span className="whitespace-nowrap">{fmtAssetQty(v.od?.amount, v.asset)}</span>
        <span className="whitespace-nowrap">@ {fmtRate(v.od?.unit_price)}</span>
      </div>
    </div>
  );

  const reasonLine = (record: any, className?: string) =>
    record.sync_status === 'rejected' && record.rejection_reason ? (
      <span className={cn("max-w-full truncate text-xs text-muted-foreground", className)} title={record.rejection_reason}>
        {record.rejection_reason}
      </span>
    ) : null;

  const statusBlock = (record: any, v: RowView, opts: { withReviewer?: boolean; alignEnd?: boolean } = {}) => (
    <div className={cn("flex min-w-0 flex-col gap-1", opts.alignEnd ? "items-end" : "items-start")}>
      <SyncStatusChip status={record.sync_status} />
      {reasonLine(record)}
      {opts.withReviewer && v.reviewerName && (
        <span className="max-w-full truncate text-xs text-muted-foreground" title={`Reviewed by ${v.reviewerName}`}>
          by {v.reviewerName}
        </span>
      )}
    </div>
  );

  const reviewedBlock = (record: any, v: RowView) =>
    v.reviewerName ? (
      <div className="min-w-0">
        <div className="truncate text-foreground" title={v.reviewerName}>{v.reviewerName}</div>
        {record.reviewed_at && <div className="truncate text-xs tabular-nums text-muted-foreground">{fmtDateTime(record.reviewed_at)}</div>}
      </div>
    ) : (
      <span className="text-muted-foreground">—</span>
    );

  const rowActions = (record: any, v: RowView, layout: "row" | "stack" | "card") =>
    (record.sync_status === 'synced_pending_approval' || record.sync_status === 'client_mapping_pending') ? (
      <div className={cn("flex gap-1.5", layout === "stack" ? "flex-col items-stretch" : "items-center", layout === "row" && "justify-end")}>
        <Button
          variant="default"
          size="sm"
          className={cn("gap-1.5 px-2.5 text-xs", layout === "card" ? "h-9 flex-1" : "h-8")}
          onClick={() => setApprovalRecord(record)}
          disabled={v.isMaskedName || !v.hasUsableName}
          title={v.isMaskedName || !v.hasUsableName ? 'Verified name required before approval' : ''}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Approve
        </Button>
        {hasPermission('terminal_destructive') && (
          <Button
            variant="outline"
            size="sm"
            className={cn("gap-1.5 px-2.5 text-xs", REJECT_OUTLINE, layout === "card" ? "h-9 flex-1" : "h-8")}
            onClick={() => setRejectRecord(record)}
          >
            <XCircle className="h-3.5 w-3.5" />
            Reject
          </Button>
        )}
      </div>
    ) : null;

  const rowCheckbox = (record: any, large = false) =>
    PENDING_SYNC_STATUSES.includes(record.sync_status) ? (
      <Checkbox
        checked={selectedIds.has(record.id)}
        onCheckedChange={() => toggleSelect(record.id)}
        aria-label={`Select order ${record.binance_order_number}`}
        className={cn(large && "relative h-5 w-5 before:absolute before:-inset-2 before:content-['']")}
      />
    ) : null;

  const selectAllCheckbox = (id?: string) => (
    <Checkbox
      id={id}
      checked={allPendingSelected && pendingRecordsList.length > 0}
      onCheckedChange={toggleSelectAll}
      aria-label="Select all pending"
    />
  );

  const renderTable = () => (
    <table className={cn(LIST_TABLE, LIST_DENSITY.comfortable, "table-fixed")}>
      <colgroup>
        <col className="w-12" />
        {merged ? (
          <>
            <col />
            <col className="w-[11.5rem]" />
          </>
        ) : (
          <>
            <col className="w-[12rem]" />
            <col />
            <col className={full ? "w-[11.5rem]" : "w-[10.5rem]"} />
            {full && <col className="w-[7.5rem]" />}
            <col className={full ? "w-[10.5rem]" : "w-[10rem]"} />
            {full && <col className="w-[9rem]" />}
          </>
        )}
        <col className={stackedActions ? "w-[7.75rem]" : "w-[13rem]"} />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">
            <div className="flex items-center">{selectAllCheckbox()}</div>
          </th>
          <th scope="col">{merged ? "Order & seller" : "Order"}</th>
          {!merged && <th scope="col">Seller</th>}
          <th scope="col" className="text-right">{merged ? "Amount & status" : "Amount"}</th>
          {full && <th scope="col">PAN</th>}
          {!merged && <th scope="col">Status</th>}
          {full && <th scope="col">Reviewed by</th>}
          <th scope="col" className="text-right"><span className="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        {syncRecords.map((record: any) => {
          const v = rowView(record);
          return (
            <tr
              key={record.id}
              data-state={selectedIds.has(record.id) ? "selected" : undefined}
              className="transition-colors hover:bg-muted/30 data-[state=selected]:bg-primary/[0.05]"
            >
              <td>
                <div className="flex items-center">{rowCheckbox(record)}</div>
              </td>
              {merged ? (
                <td>{mergedBlock(record, v)}</td>
              ) : (
                <>
                  <td>{orderBlock(record, v)}</td>
                  <td>{sellerBlock(v, !full)}</td>
                </>
              )}
              <td className="text-right">
                {amountBlock(v)}
                {merged && <div className="mt-1.5">{statusBlock(record, v, { withReviewer: true, alignEnd: true })}</div>}
              </td>
              {full && (
                <td>
                  <span className={cn("font-mono text-[12px]", v.pan ? "text-foreground" : "text-muted-foreground")}>{v.pan || "—"}</span>
                </td>
              )}
              {!merged && <td>{statusBlock(record, v, { withReviewer: !full })}</td>}
              {full && <td>{reviewedBlock(record, v)}</td>}
              <td>{rowActions(record, v, stackedActions ? "stack" : "row")}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const renderCards = () => (
    <ul className="divide-y divide-border">
      {syncRecords.map((record: any) => {
        const v = rowView(record);
        return (
          <li
            key={record.id}
            data-state={selectedIds.has(record.id) ? "selected" : undefined}
            className="flex gap-3 px-3 py-3 data-[state=selected]:bg-primary/[0.05] sm:px-5"
          >
            <div className="flex w-5 shrink-0 justify-center pt-0.5">{rowCheckbox(record, true)}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                {sellerBlock(v)}
                <SyncStatusChip status={record.sync_status} className="mt-0.5 shrink-0" />
              </div>
              <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="text-base font-semibold tabular-nums text-foreground">{fmtInr(v.od?.total_price)}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {fmtAssetQty(v.od?.amount, v.asset)} @ {fmtRate(v.od?.unit_price)}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                <OrderNo value={record.binance_order_number} tail={6} />
                <Dot />
                <span className="tabular-nums">{fmtDateTime(v.orderedAt)}</span>
                <ExchangeAccountBadge accountId={record.exchange_account_id} />
              </div>
              <div className="mt-1">
                <PanLine pan={v.pan} />
              </div>
              {v.reviewerName && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Reviewed by {v.reviewerName}
                  {record.reviewed_at ? `, ${fmtDateTime(record.reviewed_at)}` : ""}
                </p>
              )}
              {record.sync_status === 'rejected' && record.rejection_reason && (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{record.rejection_reason}</p>
              )}
              {(record.sync_status === 'synced_pending_approval' || record.sync_status === 'client_mapping_pending') && (
                <div className="mt-2.5">{rowActions(record, v, "card")}</div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );

  const rejectView = rejectRecord ? rowView(rejectRecord) : null;

  return (
    <>
      <section className="min-w-0 rounded-lg border border-border bg-card shadow-[var(--shadow-xs)]" aria-label="Terminal purchases">
        <PanelToolbar>
          <div className="flex min-w-0 items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 min-w-0 flex-1 sm:w-[190px] sm:flex-none" aria-label="Filter by status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {pendingCount > 0 && (
              <Chip tone="warning" className="shrink-0 tabular-nums">{pendingCount} pending</Chip>
            )}
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 flex-1 gap-1.5 sm:flex-none">
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              className="h-9 flex-1 gap-1.5 sm:flex-none"
            >
              {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {syncMutation.isPending ? "Syncing…" : "Sync now"}
            </Button>
          </div>
        </PanelToolbar>

        {/* Bulk actions */}
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-muted/40 px-3 py-2 sm:px-5">
            <span className="mr-1 text-[13px] font-medium tabular-nums text-foreground">{selectedIds.size} selected</span>
            {hasPermission('terminal_destructive') && (
              <Button variant="outline" size="sm" className={cn("h-8 gap-1.5 text-xs", REJECT_OUTLINE)} onClick={() => setBulkRejectOpen(true)}>
                <XCircle className="h-3.5 w-3.5" />
                Reject selected
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setSelectedIds(new Set())}>
              Clear selection
            </Button>
          </div>
        )}

        <div ref={listRef}>
          {isLoading ? (
            <PanelSkeleton rows={6} label="Loading Terminal purchases" />
          ) : syncRecords.length === 0 ? (
            isError ? (
              <PanelMessage icon={AlertTriangle} tone="danger" title="Couldn't load Terminal purchases">
                {(error as any)?.message || "Try Refresh in a moment."}
              </PanelMessage>
            ) : (
              <PanelMessage icon={Link2} title={statusFilter === "all" ? "No Terminal purchases to review" : "No orders with this status"}>
                {statusFilter === "all"
                  ? "Completed Binance buy orders from the last 7 days appear here."
                  : "Only orders from the last 7 days are listed. Pick another status to see more."}
              </PanelMessage>
            )
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 pb-2 pt-3 sm:px-5">
                <p className="text-xs text-muted-foreground">{listNote}</p>
                {narrow && (
                  <div className="flex items-center gap-2">
                    {selectAllCheckbox("terminal-sync-select-all")}
                    <label htmlFor="terminal-sync-select-all" className="cursor-pointer text-xs font-medium text-foreground">
                      Select all pending
                    </label>
                  </div>
                )}
              </div>
              {narrow ? renderCards() : renderTable()}
            </>
          )}
        </div>
      </section>

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
        <DialogContent className={dialogContentClass("sm")}>
          <DialogHead title="Reject Terminal order" description="The order leaves the approval queue and no purchase is created." />
          <DialogBody className="space-y-4">
            {rejectRecord && rejectView && (
              <RecordLine>
                <OrderNo value={rejectRecord.binance_order_number} tail={6} />
                <Dot />
                <span className="min-w-0 truncate">{rejectView.isMaskedName ? "Awaiting verified name" : rejectView.sellerDisplay || "—"}</span>
                <Dot />
                <span className="font-semibold tabular-nums">{fmtInr(rejectView.od?.total_price)}</span>
              </RecordLine>
            )}
            <Field label="Rejection reason" htmlFor="terminal-sync-reject-reason" required hint="Saved on the order and shown in the list.">
              <Textarea
                id="terminal-sync-reject-reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Why is this order being rejected?"
                className="text-sm"
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
              {rejectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {rejectMutation.isPending ? "Rejecting…" : "Reject order"}
            </Button>
          </DialogFoot>
        </DialogContent>
      </Dialog>

      {/* Bulk Rejection Dialog */}
      <Dialog open={bulkRejectOpen} onOpenChange={(open) => { if (!open) { setBulkRejectOpen(false); setBulkRejectReason(""); } }}>
        <DialogContent className={dialogContentClass("sm")}>
          <DialogHead
            title={`Reject ${selectedIds.size} selected ${selectedIds.size === 1 ? "order" : "orders"}`}
            description="Every selected order leaves the approval queue with the same reason. No purchases are created."
          />
          <DialogBody className="space-y-4">
            {selectedRecords.length > 0 && (
              <ul className="max-h-44 divide-y divide-border overflow-y-auto rounded-md border border-border bg-muted/30 text-[13px]">
                {selectedRecords.map((record: any) => {
                  const v = rowView(record);
                  return (
                    <li key={record.id} className="flex items-center gap-2 px-3 py-1.5">
                      <OrderNo value={record.binance_order_number} tail={6} className="shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-foreground">{v.isMaskedName ? "Awaiting verified name" : v.sellerDisplay || "—"}</span>
                      {!PENDING_SYNC_STATUSES.includes(record.sync_status) && <SyncStatusChip status={record.sync_status} className="shrink-0" />}
                      <span className="shrink-0 font-medium tabular-nums text-foreground">{fmtInr(v.od?.total_price)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {selectedIds.size > selectedRecords.length && (
              <p className="text-xs text-muted-foreground">
                {selectedIds.size - selectedRecords.length} selected {selectedIds.size - selectedRecords.length === 1 ? "order is" : "orders are"} not in the current list.
              </p>
            )}
            <Field label="Rejection reason" htmlFor="terminal-sync-bulk-reject-reason" required hint="Applies to every selected order.">
              <Textarea
                id="terminal-sync-bulk-reject-reason"
                value={bulkRejectReason}
                onChange={(e) => setBulkRejectReason(e.target.value)}
                placeholder="Why are these orders being rejected?"
                className="text-sm"
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
              {bulkRejectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {bulkRejectMutation.isPending ? "Rejecting…" : `Reject ${selectedIds.size} ${selectedIds.size === 1 ? "order" : "orders"}`}
            </Button>
          </DialogFoot>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** "PAN ABCDE1234F" (or "PAN —") as one muted line. */
function PanLine({ pan }: { pan: string | null }) {
  return (
    <span className="whitespace-nowrap text-xs text-muted-foreground">
      PAN <span className={cn("font-mono text-[12px]", pan ? "text-foreground/80" : undefined)}>{pan || "—"}</span>
    </span>
  );
}
