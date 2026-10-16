
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { ClickableRow } from "@/components/transaction-detail";
import { Button, buttonVariants } from "@/components/ui/button";
import { format } from "date-fns";
import { AlertTriangle, Edit, Eye, ShoppingBag, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatSmartDecimal } from "@/lib/format-smart-decimal";
import { PurchaseOrderDetailsDialog } from "./PurchaseOrderDetailsDialog";
import { EditPurchaseOrderDialog } from "./EditPurchaseOrderDialog";
import { useNavigateToClient } from "@/hooks/useNavigateToClient";
import { usePermissions } from "@/hooks/usePermissions";
import { TablePager } from "@/components/finance-ui/primitives";
import { cn } from "@/lib/utils";
import {
  LIST_TABLE,
  ListNote,
  OrderNo,
  PanelMessage,
  PanelSkeleton,
  fmtAssetQty,
  fmtDate,
  fmtInr,
  fmtRate,
  fmtTime,
  personLabel,
  rowOpenHandlers,
  useListPages,
  useNarrow,
} from "@/components/orders-ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PURCHASE_ORDER_SELECT = `
  *,
  wallet:wallets!wallet_id(id, wallet_name),
  purchase_order_items (
    id,
    product_id,
    quantity,
    unit_price,
    total_price,
    warehouse_id,
    products (name, code)
  ),
  purchase_payment_method:purchase_payment_method_id(
    id,
    type,
    bank_account_name,
    upi_id,
    bank_accounts!purchase_payment_methods_bank_account_name_fkey(account_name)
  ),
  bank_account:bank_account_id(
    account_name,
    bank_name
  ),
  created_by_user:users!created_by(username, first_name, last_name)
`;

const normalizeSearch = (value?: string) => (value || '').trim();
const DEFAULT_COMPLETED_LIMIT = 100;

const escapePostgrestOrValue = (value: string) =>
  value
    .replace(/[%_]/g, "\\$&")
    .replace(/[(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function CompletedPurchaseOrders({ searchTerm, dateFrom, dateTo, assetType, toolbar, totalCount, onClearFilters }: {
  searchTerm?: string;
  dateFrom?: Date;
  dateTo?: Date;
  assetType?: string;
  /** Search and filter controls, shown at the top of the list panel (presentation only). */
  toolbar?: ReactNode;
  /** All-time count of completed orders, for the "latest 100 of N" note. */
  totalCount?: number;
  onClearFilters?: () => void;
}) {
  const normalizedSearch = normalizeSearch(searchTerm);
  const normalizedAsset = (assetType || '').trim();
  // Asset filtering is applied client-side (derived from joined product fields),
  // so it must load the full history rather than only the recent 100 rows.
  const hasServerFilter = !!normalizedSearch || !!dateFrom || !!dateTo || !!normalizedAsset;

  // Fetch completed purchase orders
  const { data: completedOrders, isLoading, isError: isCompletedError, error: completedError } = useQuery({
    queryKey: ['purchase_orders', 'COMPLETED', 'recent'],
    enabled: !hasServerFilter,
    queryFn: async () => {
      // Default tab must stay fast: only load the latest visible orders.
      // Search/date filters use a separate server-side paginated query below
      // so older orders remain reachable without downloading all 4,516 rows.
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(PURCHASE_ORDER_SELECT)
        .eq('status', 'COMPLETED')
        .order('created_at', { ascending: false })
        .limit(DEFAULT_COMPLETED_LIMIT);

      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60,
  });

  const { data: searchedOrders, isLoading: isSearchLoading, isError: isSearchError, error: searchError } = useQuery({
    queryKey: [
      'purchase_orders',
      'COMPLETED',
      'server_search',
      normalizedSearch,
      dateFrom ? format(dateFrom, 'yyyy-MM-dd') : null,
      dateTo ? format(dateTo, 'yyyy-MM-dd') : null,
    ],
    enabled: hasServerFilter,
    queryFn: async () => {
      const term = escapePostgrestOrValue(normalizedSearch);

      return await fetchAllPaginated<any>(() => {
        let query = supabase
          .from('purchase_orders')
          .select(PURCHASE_ORDER_SELECT)
          .eq('status', 'COMPLETED')
          .order('created_at', { ascending: false });

        if (term) {
          query = query.or(`order_number.ilike.%${term}%,supplier_name.ilike.%${term}%,contact_number.ilike.%${term}%,description.ilike.%${term}%`);
        }

        if (dateFrom) query = query.gte('order_date', format(dateFrom, 'yyyy-MM-dd'));
        if (dateTo) query = query.lte('order_date', format(dateTo, 'yyyy-MM-dd'));

        return query;
      });
    },
  });

  // Fetch wallets for mapping wallet_id to wallet_name
  const { data: wallets } = useQuery({
    queryKey: ['wallets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wallets')
        .select('id, wallet_name');
      if (error) throw error;
      return data || [];
    },
    staleTime: 300000,
  });

  const { data: purchaseMethods } = useQuery({
    queryKey: ['purchase_payment_methods_all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_payment_methods')
        .select('id, type, bank_account_name, upi_id');
      if (error) throw error;
      return data || [];
    },
    staleTime: 300000,
  });

  const { toast } = useToast();
  const navigateToClient = useNavigateToClient();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<any>(null);
  const [selectedOrderForEdit, setSelectedOrderForEdit] = useState<any>(null);
  const [orderToDelete, setOrderToDelete] = useState<any>(null);

  const deleteMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase.rpc('delete_purchase_order_with_reversal', {
        order_id: orderId
      });
      
      if (error) throw error;
      
      const result = data as { success: boolean; error?: string; message?: string };
      
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to delete purchase order');
      }
      
      return result;
    },
    onMutate: async (orderId: string) => {
      toast({
        title: "Deleting…",
        description: "Reversing transactions and removing purchase order.",
      });

      await queryClient.cancelQueries({ queryKey: ['purchase_orders'] });
      const previous = queryClient.getQueryData<any[]>(['purchase_orders', 'COMPLETED']);

      // Optimistically remove from the completed list
      queryClient.setQueryData<any[]>(['purchase_orders', 'COMPLETED'], (old) =>
        (old || []).filter((o: any) => o.id !== orderId)
      );

      return { previous };
    },
    onSuccess: (data) => {
      toast({ 
        title: "Deleted Successfully", 
        description: data?.message || "Purchase order and all transactions have been reversed" 
      });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders_summary'] });
      queryClient.invalidateQueries({ queryKey: ['bank_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['stock_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['wallets'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_asset_balances'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_asset_balances_summary'] });
      queryClient.invalidateQueries({ queryKey: ['wallet_stock_summary'] });
    },
    onError: (error: any, orderId: string, context) => {
      // rollback optimistic update
      if (context?.previous) {
        queryClient.setQueryData(['purchase_orders', 'COMPLETED'], context.previous);
      }
      toast({ 
        title: "Error", 
        description: error.message || "Failed to delete purchase order", 
        variant: "destructive" 
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase_orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase_orders_summary'] });
    }
  });

  const sourceOrders = hasServerFilter ? (searchedOrders || []) : (completedOrders || []);
  const displayIsLoading = hasServerFilter ? isSearchLoading : isLoading;
  const displayError = hasServerFilter ? searchError : completedError;
  const displayIsError = hasServerFilter ? isSearchError : isCompletedError;

  const filteredOrders = sourceOrders.filter((order: any) => {
    const term = normalizedSearch.toLowerCase();
    const selectedAsset = (assetType || '').toUpperCase();
    const orderAsset = String(
      order.purchase_order_items?.[0]?.products?.code || order.product_category || order.product_name || 'USDT'
    ).trim().toUpperCase();
    const matchesSearch = !normalizedSearch || (
      order.order_number?.toLowerCase().includes(term) ||
      order.supplier_name?.toLowerCase().includes(term) ||
      (order.contact_number && String(order.contact_number).toLowerCase().includes(term)) ||
      (order.description && order.description.toLowerCase().includes(term))
    );
    const od = order.order_date ? new Date(order.order_date) : null;
    const inFrom = !dateFrom || (od && od >= new Date(dateFrom));
    const inTo = !dateTo || (od && od <= new Date(dateTo));
    const matchesAsset = !selectedAsset || orderAsset === selectedAsset;
    return matchesSearch && inFrom && inTo && matchesAsset;
  }).sort((a: any, b: any) => {
    if (normalizedSearch) {
      const term = normalizedSearch.toLowerCase();
      const aPrimary = a.order_number?.toLowerCase().includes(term) || a.supplier_name?.toLowerCase().includes(term);
      const bPrimary = b.order_number?.toLowerCase().includes(term) || b.supplier_name?.toLowerCase().includes(term);
      if (aPrimary && !bPrimary) return -1;
      if (!aPrimary && bPrimary) return 1;
    }
    // Strict date-wise ordering (newest first) using created_at, fallback to order_date
    const aTime = new Date(a.created_at || a.order_date || 0).getTime();
    const bTime = new Date(b.created_at || b.order_date || 0).getTime();
    return bTime - aTime;
  });

  // Helper to get wallet name
  const getWalletName = (order: any) => {
    // If is_off_market is true, show "Off Market"
    if (order.is_off_market) {
      return 'Off Market';
    }
    // First try direct wallet relationship, then fallback to items
    if (order.wallet?.wallet_name) {
      return order.wallet.wallet_name;
    }
    // Fallback to purchase_order_items warehouse_id
    const warehouseId = order.purchase_order_items?.[0]?.warehouse_id;
    if (warehouseId) {
      const wallet = wallets?.find(w => w.id === warehouseId);
      return wallet?.wallet_name || '-';
    }
    return '-';
  };

  /* ── Presentation ─────────────────────────────────────────────────────── */

  const PAGE_SIZE = 25;
  // One layout for the room the list really has: cards on phones, then progressively wider tables.
  const { ref: listRef, narrow, width: listWidth } = useNarrow<HTMLDivElement>(600);
  const wide = listWidth >= 1120; // separate "Created by" column
  const merged = listWidth < 880; // order and supplier share one column
  const iconActions = listWidth < 1000; // View / Edit as icons only

  // Keeps the page across deletes and refetches; back to page 1 when the search or a filter changes.
  const paged = useListPages(
    filteredOrders,
    PAGE_SIZE,
    `${normalizedSearch}|${normalizedAsset}|${dateFrom?.getTime() ?? ""}|${dateTo?.getTime() ?? ""}`,
  );

  // A ?orderId= link lands on the page that holds the order (once), so the page's highlight can find it.
  const deepLinkOrderId = useMemo(() => new URLSearchParams(window.location.search).get("orderId"), []);
  const sourceLength = sourceOrders.length;
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (deepLinkDone.current || !deepLinkOrderId || !sourceLength) return;
    deepLinkDone.current = true;
    const i = filteredOrders.findIndex((o: any) => o.id === deepLinkOrderId);
    if (i >= PAGE_SIZE) paged.setPage(Math.floor(i / PAGE_SIZE));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkOrderId, sourceLength]);

  const assetOf = (order: any) =>
    String(order.purchase_order_items?.[0]?.products?.code || order.product_category || order.product_name || 'USDT').trim().toUpperCase();
  const qtyOf = (order: any) =>
    order.purchase_order_items?.reduce((total: number, item: any) => total + item.quantity, 0) || order.quantity || 0;
  const unitPriceOf = (order: any) => order.purchase_order_items?.[0]?.unit_price || Number(order.price_per_unit || order.total_amount);
  const priceLine = (order: any) => `${fmtAssetQty(formatSmartDecimal(qtyOf(order)), assetOf(order))} @ ${fmtRate(unitPriceOf(order))}`;
  const orderedAt = (order: any) => `${fmtDate(order.order_date)} · ${fmtTime(order.created_at || order.order_date)}`;
  const metaLine = (order: any) => `${orderedAt(order)} · ${getWalletName(order)} · by ${personLabel(order.created_by_user) ?? "—"}`;
  const tdsLine = (order: any) =>
    order.tds_applied && Number(order.tds_amount) > 0
      ? `TDS ${fmtInr(order.tds_amount)} · paid ${fmtInr(order.net_payable_amount ?? order.total_amount)}`
      : null;
  const listTotal = filteredOrders.reduce((sum: number, o: any) => sum + (Number(o.total_amount) || 0), 0);

  const listNote = () => {
    const n = filteredOrders.length;
    const noun = n === 1 ? "order" : "orders";
    if (hasServerFilter) return `${n.toLocaleString("en-IN")} matching ${noun} · ${fmtInr(listTotal)}`;
    if (sourceOrders.length >= DEFAULT_COMPLETED_LIMIT) {
      return `Latest ${DEFAULT_COMPLETED_LIMIT}${totalCount ? ` of ${totalCount.toLocaleString("en-IN")}` : ""} completed orders. Search or filter to reach older ones.`;
    }
    return `${n.toLocaleString("en-IN")} ${noun} · ${fmtInr(listTotal)}`;
  };

  const supplierButton = (order: any, className?: string) => (
    <button
      type="button"
      onClick={() => navigateToClient(order.supplier_name)}
      className={cn("max-w-full truncate text-left font-medium text-primary hover:underline focus-visible:underline focus-visible:outline-none", className)}
      title={`Open ${order.supplier_name} in Clients`}
    >
      {order.supplier_name}
    </button>
  );

  /** View / Edit / Delete. */
  const rowActions = (order: any, { iconOnly = false } = {}) => (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setSelectedOrderForDetails(order)}
        className={cn("h-8 gap-1.5 text-xs", iconOnly ? "w-8 p-0" : "px-2.5")}
        aria-label={`View order ${order.order_number}`}
        title="View order"
      >
        <Eye className="h-3.5 w-3.5" />
        {!iconOnly && "View"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setSelectedOrderForEdit(order)}
        className={cn("h-8 gap-1.5 text-xs", iconOnly ? "w-8 p-0" : "px-2.5")}
        aria-label={`Edit order ${order.order_number}`}
        title="Edit order"
      >
        <Edit className="h-3.5 w-3.5" />
        {!iconOnly && "Edit"}
      </Button>
      {hasPermission('erp_destructive') && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setOrderToDelete(order);
            // As before: the old page showed this toast from its desktop table (md and up) only, not from the phone cards.
            if (window.matchMedia("(min-width: 768px)").matches) {
              toast({
                title: "Delete requested",
                description: `Confirm deletion for order ${order.order_number}.`,
              });
            }
          }}
          disabled={deleteMutation.isPending}
          className="h-8 w-8 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Delete order ${order.order_number}`}
          title="Delete order"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </>
  );

  const renderTable = () => (
    <table className={cn(LIST_TABLE, "table-fixed [&_tbody_td]:py-3")}>
      <colgroup>
        <col className={merged ? undefined : "w-[14rem]"} />
        {!merged && <col />}
        <col className="w-[14rem]" />
        {wide && <col className="w-[8rem]" />}
        <col className={iconActions ? "w-[7.25rem]" : "w-[12.5rem]"} />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">{merged ? "Order & supplier" : "Order"}</th>
          {!merged && <th scope="col">Supplier</th>}
          <th scope="col" className="text-right">Amount</th>
          {wide && <th scope="col">Created by</th>}
          <th scope="col" className="text-right"><span className="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        {paged.slice.map((order: any) => (
          <ClickableRow
            key={order.id}
            txType="purchase_order"
            txId={order.id}
            aria-label={`Order ${order.order_number}, ${order.supplier_name}, ${fmtInr(order.total_amount)}`}
            {...rowOpenHandlers(() => setSelectedOrderForDetails(order))}
          >
            {merged ? (
              <td>
                <div className="flex min-w-0 flex-col">
                  {supplierButton(order)}
                  {/* wraps instead of cutting: operators compare the last digits */}
                  <OrderNo value={order.order_number} selectable className="block whitespace-normal break-all" />
                  <span className="truncate text-xs text-muted-foreground" title={metaLine(order)}>
                    {metaLine(order)}
                  </span>
                  {order.description && (
                    <span className="truncate text-xs text-muted-foreground" title={order.description}>
                      {order.description}
                    </span>
                  )}
                </div>
              </td>
            ) : (
              <>
                <td>
                  <OrderNo value={order.order_number} selectable className="block truncate" />
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{orderedAt(order)}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {getWalletName(order)}{!wide && <> · by {personLabel(order.created_by_user) ?? "—"}</>}
                  </div>
                </td>
                <td>
                  <div className="flex min-w-0 flex-col">
                    {supplierButton(order)}
                    {order.description && (
                      <span className="truncate text-xs text-muted-foreground" title={order.description}>
                        {order.description}
                      </span>
                    )}
                  </div>
                </td>
              </>
            )}
            <td className="text-right">
              <div className="truncate font-semibold tabular-nums text-foreground">{fmtInr(order.total_amount)}</div>
              <div className="truncate text-xs tabular-nums text-muted-foreground" title={priceLine(order)}>{priceLine(order)}</div>
              {tdsLine(order) && <div className="truncate text-xs tabular-nums text-muted-foreground" title={tdsLine(order) ?? undefined}>{tdsLine(order)}</div>}
            </td>
            {wide && <td className="truncate text-muted-foreground">{personLabel(order.created_by_user) ?? "—"}</td>}
            <td>
              <div className="flex items-center justify-end gap-0.5">{rowActions(order, { iconOnly: iconActions })}</div>
            </td>
          </ClickableRow>
        ))}
      </tbody>
    </table>
  );

  // Cards (narrow panels): the supplier name is plain text, as on the old phone cards; the whole card opens the order.
  const renderCards = () => (
    <ul className="divide-y divide-border">
      {paged.slice.map((order: any) => (
        <li
          key={order.id}
          id={`tx-row-${order.id}`}
          data-tx-id={order.id}
          role="button"
          tabIndex={0}
          aria-label={`Order ${order.order_number}, ${order.supplier_name}, ${fmtInr(order.total_amount)}`}
          className="cursor-pointer px-3 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
          {...rowOpenHandlers(() => setSelectedOrderForDetails(order))}
        >
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[15px] font-medium text-foreground">{order.supplier_name}</span>
            <OrderNo value={order.order_number} selectable className="break-all text-muted-foreground" />
          </div>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <span className="text-base font-semibold tabular-nums text-foreground">{fmtInr(order.total_amount)}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{priceLine(order)}</span>
          </div>
          {tdsLine(order) && <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{tdsLine(order)}</p>}
          <p className="mt-1 text-xs text-muted-foreground">{metaLine(order)}</p>
          {order.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{order.description}</p>}
          <div className="mt-2.5 flex flex-wrap items-center gap-1">{rowActions(order)}</div>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-4">
      <section className="min-w-0 rounded-lg border border-border bg-card shadow-[var(--shadow-xs)]" aria-label="Completed purchase orders">
        {toolbar}
        <div ref={listRef}>
          {displayIsLoading ? (
            <PanelSkeleton rows={8} label={hasServerFilter ? 'Searching completed orders...' : 'Loading recent completed orders...'} />
          ) : displayIsError ? (
            <PanelMessage icon={AlertTriangle} tone="danger" title="Couldn't load completed purchase orders">
              {(displayError as Error)?.message || 'Unable to load completed purchase orders.'}
            </PanelMessage>
          ) : !filteredOrders || filteredOrders.length === 0 ? (
            <PanelMessage icon={ShoppingBag} title={hasServerFilter ? "No purchase orders match these filters" : "No completed orders found."}>
              {hasServerFilter && onClearFilters && (
                <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onClearFilters}>
                  Clear filters
                </Button>
              )}
            </PanelMessage>
          ) : (
            <>
              <ListNote className="pb-2">{listNote()}</ListNote>
              {narrow ? renderCards() : renderTable()}
              {paged.pages > 1 ? (
                <div className="px-3 pb-3 sm:px-5">
                  <TablePager page={paged.page} pages={paged.pages} total={paged.total} pageSize={paged.pageSize} setPage={paged.setPage} noun="orders" />
                </div>
              ) : (
                <div className="h-2" aria-hidden />
              )}
            </>
          )}
        </div>
      </section>

      <AlertDialog open={!!orderToDelete} onOpenChange={(open) => !open && setOrderToDelete(null)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete purchase order?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                {orderToDelete && (
                  <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-foreground">
                    <span className="font-mono text-[12px]">{orderToDelete.order_number}</span>
                    <span className="mx-1.5 text-muted-foreground">·</span>
                    {orderToDelete.supplier_name}
                    <span className="mx-1.5 text-muted-foreground">·</span>
                    <span className="font-semibold tabular-nums">{fmtInr(orderToDelete.total_amount)}</span>
                  </p>
                )}
                <p>
                  This will permanently delete <span className="font-medium text-foreground">{orderToDelete?.order_number}</span> and reverse related
                  transactions (bank, wallet, stock). Balances may go negative during reversal.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (!orderToDelete?.id) return;
                deleteMutation.mutate(orderToDelete.id);
                setOrderToDelete(null);
              }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PurchaseOrderDetailsDialog
        open={!!selectedOrderForDetails}
        onOpenChange={() => setSelectedOrderForDetails(null)}
        order={selectedOrderForDetails}
      />
      <EditPurchaseOrderDialog
        open={!!selectedOrderForEdit}
        onOpenChange={() => setSelectedOrderForEdit(null)}
        order={selectedOrderForEdit}
      />
    </div>
  );
}
