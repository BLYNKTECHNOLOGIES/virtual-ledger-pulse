import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Inbox } from "lucide-react";
import { useErpEntryFeed, ErpEntryRow, ErpEntrySource } from "@/hooks/useErpEntryFeed";
import { EntryFilters, SourceFilter } from "@/components/erp-entry/EntryFilters";
import { EntryRow } from "@/components/erp-entry/EntryRow";
import { SyncAllButton } from "@/components/erp-entry/SyncAllButton";
import { SyncSmallMenu } from "@/components/erp-entry/SyncSmallMenu";
import { usePermissions } from "@/hooks/usePermissions";
import { useSyncAll } from "@/hooks/useErpEntrySyncAll";

// Reused dialogs — same components used by their original tabs
import { ActionSelectionDialog } from "@/components/dashboard/erp-actions/ActionSelectionDialog";
import { TerminalPurchaseApprovalDialog } from "@/components/purchase/TerminalPurchaseApprovalDialog";
import { TerminalSalesApprovalDialog } from "@/components/sales/TerminalSalesApprovalDialog";
import { SmallBuysApprovalDialog } from "@/components/purchase/SmallBuysApprovalDialog";
import { SmallSalesApprovalDialog } from "@/components/sales/SmallSalesApprovalDialog";
import { ConversionApprovalDialog } from "@/components/stock/conversion/ConversionApprovalDialog";

import { useRejectQueueItem } from "@/hooks/useErpActionQueue";
import { useRejectConversion, useApproveConversion } from "@/hooks/useProductConversions";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useErpEntryRejectedFeed } from "@/hooks/useErpEntryRejectedFeed";
import { RejectedEntryRow } from "@/components/erp-entry/RejectedEntryRow";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

function dayBucket(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function dayLabel(bucket: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = (today.getTime() - bucket) / (24 * 60 * 60 * 1000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return new Date(bucket).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

const ERP_ENTRY_REFRESH_KEYS = [
  ["erp-entry-feed"],
  ["erp-entry-rejected-feed"],
  ["terminal-purchase-sync"],
  ["terminal-sales-sync"],
  ["small_buys_sync"],
  ["small_sales_sync"],
  ["purchase_orders"],
  ["purchase_orders_summary"],
  ["sales_orders"],
  ["bank_transactions"],
  ["wallet_transactions"],
  ["wallet_asset_balances"],
  ["erp_conversions"],
];

const ERP_ENTRY_REALTIME_TABLES = [
  "erp_action_queue",
  "terminal_purchase_sync",
  "terminal_sales_sync",
  "small_buys_sync",
  "small_sales_sync",
  "erp_product_conversions",
  "purchase_orders",
  "sales_orders",
];

export default function ErpEntryManager() {
  const navigate = useNavigate();
  const { hasAnyPermission, isLoading: accessLoading } = usePermissions();
  const hasAccess = hasAnyPermission(["erp_entry_view", "erp_entry_manage"]);
  const { data: rows = [], isLoading } = useErpEntryFeed();
  const { toast } = useToast();
  const rejectQueue = useRejectQueueItem();
  const rejectConversion = useRejectConversion();
  const approveConversion = useApproveConversion();
  const queryClient = useQueryClient();
  const syncAll = useSyncAll();

  // Auto-sync the four "live" sources (deposits/withdrawals, terminal buys/sales,
  // conversions) every time the ERP Entry Manager mounts. Small buys/sales are
  // explicitly excluded — they only sync via the dedicated "Sync Small …" menu.
  useEffect(() => {
    if (!hasAccess) return;
    syncAll.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess]);

  const [view, setView] = useState<"pending" | "rejected">("pending");
  const [filter, setFilter] = useState<SourceFilter>("all");
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc"); // oldest pending at top per requirement
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [activeRow, setActiveRow] = useState<ErpEntryRow | null>(null);

  const { data: rejectedRows = [], isLoading: rejectedLoading } = useErpEntryRejectedFeed(view === "rejected");

  const refreshErpEntryCaches = useCallback(() => {
    ERP_ENTRY_REFRESH_KEYS.forEach((queryKey) => {
      queryClient.invalidateQueries({ queryKey });
    });
  }, [queryClient]);

  useEffect(() => {
    if (!hasAccess) return;

    const channel = ERP_ENTRY_REALTIME_TABLES.reduce(
      (ch, table) => ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        refreshErpEntryCaches
      ),
      supabase.channel("erp-entry-realtime-refresh")
    ).subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [hasAccess, refreshErpEntryCaches]);

  // Active source list depends on current view
  const sourceRows = view === "rejected" ? (rejectedRows as ErpEntryRow[]) : rows;
  const listLoading = view === "rejected" ? rejectedLoading : isLoading;

  // Counts per source for chip badges
  const counts = useMemo(() => {
    const c: Record<SourceFilter, number> = {
      all: sourceRows.length,
      deposit: 0,
      withdrawal: 0,
      terminal_buy: 0,
      terminal_sale: 0,
      small_buys: 0,
      small_sales: 0,
      conversion: 0,
    };
    for (const r of sourceRows) c[r.source]++;
    return c;
  }, [sourceRows]);

  // Filter + search + sort
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = sourceRows.filter((r) => filter === "all" || r.source === filter);
    if (q) {
      out = out.filter((r) =>
        [r.label, r.sublabel, r.asset, String(r.amount), r.raw?.binance_order_number, r.raw?.tx_id, r.raw?.reference_no, r.raw?.counterparty_name, (r as any).rejection_reason]
          .filter(Boolean)
          .some((v: any) => String(v).toLowerCase().includes(q))
      );
    }
    out.sort((a, b) => (sortDir === "asc" ? a.occurred_at - b.occurred_at : b.occurred_at - a.occurred_at));
    return out;
  }, [sourceRows, filter, search, sortDir]);

  // Group by day for sticky separators
  const grouped = useMemo(() => {
    const map = new Map<number, ErpEntryRow[]>();
    for (const r of visible) {
      const k = dayBucket(r.occurred_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return Array.from(map.entries()); // already in visible order
  }, [visible]);

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (activeRow) return; // don't interfere when a dialog is open
      if (!visible.length) return;
      const idx = Math.max(0, visible.findIndex((r) => r.id === focusedId));
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = visible[Math.min(visible.length - 1, idx + 1)];
        setFocusedId(next.id);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = visible[Math.max(0, idx - 1)];
        setFocusedId(prev.id);
      } else if (e.key === "Enter" && focusedId) {
        const row = visible.find((r) => r.id === focusedId);
        if (row) setActiveRow(row);
      } else if ((e.key === "r" || e.key === "R") && focusedId) {
        const row = visible.find((r) => r.id === focusedId);
        if (row) handleReject(row);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, focusedId, activeRow]);

  function handleReject(row: ErpEntryRow) {
    if (row.source === "deposit" || row.source === "withdrawal") {
      const reason = window.prompt("Reject this Binance movement?\nOptional reason:");
      if (reason === null) return;
      rejectQueue.mutate(
        { id: row.raw.id, reason: reason || undefined },
        {
          onSuccess: () => toast({ title: "Rejected", description: "Movement removed from queue." }),
        }
      );
      return;
    }
    if (row.source === "conversion") {
      const reason = window.prompt("Reject this conversion?\nOptional reason:");
      if (reason === null) return;
      rejectConversion.mutate({ conversionId: row.raw.id, reason: reason || undefined });
      return;
    }
    // Terminal Buy/Sale and Small batches: open the source dialog where reject lives
    setActiveRow(row);
  }

  if (accessLoading) {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center space-y-2">
            <h2 className="text-lg font-semibold">Access Restricted</h2>
            <p className="text-sm text-muted-foreground">
              You don't have permission to view ERP Entry Manager. Contact your administrator to request the
              <code className="mx-1 rounded bg-muted px-1">erp_entry_view</code> permission.
            </p>
            <Button variant="outline" onClick={() => navigate("/dashboard")}>Back to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 w-full">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                <Inbox className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">ERP Entry Manager</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {view === "rejected"
                    ? "All entries that have been rejected, across every source"
                    : "Unified chronological feed of every pending ERP entry"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {view === "pending" && (
                <>
                  <SyncSmallMenu />
                  <SyncAllButton />
                </>
              )}
            </div>
          </div>

          <Tabs
            value={view}
            onValueChange={(v) => {
              const next = v as "pending" | "rejected";
              setView(next);
              setFocusedId(null);
              setFilter("all");
              // Pending = oldest first (act on stale); Rejected = newest first (recent rejections)
              setSortDir(next === "pending" ? "asc" : "desc");
            }}
            className="mt-3"
          >
            <TabsList className="h-8">
              <TabsTrigger value="pending" className="text-xs h-6 px-3">Pending</TabsTrigger>
              <TabsTrigger value="rejected" className="text-xs h-6 px-3">Rejected</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="pt-0">
          <EntryFilters
            filter={filter}
            onFilterChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            sortDir={sortDir}
            onToggleSort={() => setSortDir((s) => (s === "asc" ? "desc" : "asc"))}
            counts={counts}
          />

          <div className="mt-4 text-xs text-muted-foreground">
            {listLoading ? "Loading…" : `${visible.length} entr${visible.length === 1 ? "y" : "ies"} shown`}
            {view === "pending"
              ? " · auto-refresh every 30s · ↑/↓ navigate · Enter open · R reject"
              : " · auto-refresh every 60s · read-only history"}
          </div>
        </CardContent>
      </Card>

      {listLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {view === "rejected" ? "No rejected entries to show." : "No pending entries. All caught up."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(([bucket, items]) => (
            <div key={bucket} className="space-y-2">
              <div className="sticky top-0 z-10 -mx-1 bg-background/95 backdrop-blur px-1 py-1 text-xs font-medium text-muted-foreground">
                {dayLabel(bucket)} · {items.length}
              </div>
              <div className="space-y-2">
                {items.map((row) =>
                  view === "rejected" ? (
                    <RejectedEntryRow key={row.id} row={row as any} />
                  ) : (
                    <EntryRow
                      key={row.id}
                      row={row}
                      isFocused={row.id === focusedId}
                      onFocus={() => setFocusedId(row.id)}
                      onOpen={() => {
                        if (row.source === "conversion") {
                          approveConversion.mutate(row.raw.id, {
                            onSuccess: refreshErpEntryCaches,
                          });
                          return;
                        }
                        setActiveRow(row);
                      }}
                      onReject={() => handleReject(row)}
                    />
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Source-specific dialogs — exact same components used by the original tabs */}
      {activeRow?.source === "deposit" || activeRow?.source === "withdrawal" ? (
        <ActionSelectionDialog
          item={activeRow.raw}
          open={true}
          onOpenChange={(o) => { if (!o) setActiveRow(null); }}
        />
      ) : null}

      {activeRow?.source === "terminal_buy" && (
        <TerminalPurchaseApprovalDialog
          open={true}
          onOpenChange={(o) => { if (!o) setActiveRow(null); }}
          syncRecord={activeRow.raw}
          onSuccess={() => { setActiveRow(null); refreshErpEntryCaches(); }}
        />
      )}

      {activeRow?.source === "terminal_sale" && (
        <TerminalSalesApprovalDialog
          open={true}
          onOpenChange={(o) => { if (!o) setActiveRow(null); }}
          syncRecord={activeRow.raw}
          onSuccess={() => { setActiveRow(null); refreshErpEntryCaches(); }}
        />
      )}

      {activeRow?.source === "small_buys" && (
        <SmallBuysApprovalDialog
          open={true}
          onOpenChange={(o) => { if (!o) setActiveRow(null); }}
          record={activeRow.raw}
        />
      )}

      {activeRow?.source === "small_sales" && (
        <SmallSalesApprovalDialog
          open={true}
          onOpenChange={(o) => { if (!o) setActiveRow(null); }}
          record={activeRow.raw}
        />
      )}

      {activeRow?.source === "conversion" && (
        <ConversionApprovalDialog
          record={activeRow.raw}
          onClose={() => setActiveRow(null)}
        />
      )}
    </div>
  );
}
