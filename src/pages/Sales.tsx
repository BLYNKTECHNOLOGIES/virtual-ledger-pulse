import { useEffect, useMemo, useRef, useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/PageHeader";
import { FilterChip } from "@/components/ui/filter-chip";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ClickableRow, useDeepLinkHighlight } from "@/components/transaction-detail";
import { CheckCircle2, Download, Edit, Eye, HandCoins, Link2, Package, Plus, Shield, ShoppingCart, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StepBySalesFlow } from "@/components/sales/StepBySalesFlow";
import { SalesOrderDetailsDialog } from "@/components/sales/SalesOrderDetailsDialog";
import { EditSalesOrderDialog } from "@/components/sales/EditSalesOrderDialog";
import { SalesEntryDialog } from "@/components/sales/SalesEntryDialog";
import { UserPayingStatusDialog } from "@/components/sales/UserPayingStatusDialog";
import { PaymentMethodSelectionDialog } from "@/components/sales/PaymentMethodSelectionDialog";
import { OrderCompletionForm } from "@/components/sales/OrderCompletionForm";
import { PermissionGate } from "@/components/PermissionGate";
import { TerminalSalesSyncTab } from "@/components/sales/TerminalSalesSyncTab";
import { SmallSalesSyncTab } from "@/components/sales/SmallSalesSyncTab";
import { TablePager } from "@/components/finance-ui/primitives";
import {
  DateRangeFilter,
  LIST_DENSITY,
  LIST_TABLE,
  ListNote,
  OrderNo,
  PanelMessage,
  PanelSkeleton,
  PanelToolbar,
  SUBNAV_LIST,
  SUBNAV_TRIGGER,
  SalesStatusChip,
  SearchField,
  TabCount,
  fmtAssetQty,
  fmtDate,
  fmtInr,
  fmtRate,
  fmtTime,
  personLabel,
  rowOpenHandlers,
  salesPaymentStatusMeta,
  useListPages,
  useNarrow,
} from "@/components/orders-ui";

import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useNavigateToClient } from "@/hooks/useNavigateToClient";
import { usePermissions } from "@/hooks/usePermissions";
import { useQuickAction } from "@/hooks/useQuickAction";
import { DEFAULT_ASSET_CODES } from "@/hooks/useAssetCodes";
import { fetchAllPaginated } from "@/lib/fetchAllRows";

const PAGE_SIZE = 25;
const STATUS_OPTIONS = ["PENDING", "USER_PAYING", "PAYMENT_DONE", "PARTIAL", "COMPLETED", "FAILED", "ORDER_CANCELLED"];

export default function Sales() {
  const navigate = useNavigate();
  const navigateToClient = useNavigateToClient();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const [showStepByStepFlow, setShowStepByStepFlow] = useState(false);
  const [showManualSalesEntry, setShowManualSalesEntry] = useState(false);

  // Alt+Shift+N opens the New Order dialog. Only fires for users who can reach
  // this page; the entry dialog itself enforces sales_manage.
  useQuickAction("new", () => setShowManualSalesEntry(true));
  
  const [showFilterDialog, setShowFilterDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<string>("");
  const [filterAssetType, setFilterAssetType] = useState<string>("");
  const [filterDateFrom, setFilterDateFrom] = useState<Date>();
  const [filterDateTo, setFilterDateTo] = useState<Date>();
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<any>(null);
  const [selectedOrderForEdit, setSelectedOrderForEdit] = useState<any>(null);
  const [selectedOrderForUserPaying, setSelectedOrderForUserPaying] = useState<any>(null);
  const [selectedOrderForAlternativeMethod, setSelectedOrderForAlternativeMethod] = useState<any>(null);
  const [selectedOrderForCompletion, setSelectedOrderForCompletion] = useState<any>(null);
  const [deleteOrderId, setDeleteOrderId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') || 'completed';
  });

  const getSalesOrderAsset = (order: any) => String(
    order.product?.code || order.product?.name || 'USDT'
  ).trim().toUpperCase();

  const { data: assetOptions = DEFAULT_ASSET_CODES } = useQuery({
    queryKey: ['sales_asset_filter_options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('code, name')
        .limit(5000);
      if (error) throw error;
      const codes = new Set(DEFAULT_ASSET_CODES);
      (data || []).forEach((product: any) => {
        [product.code, product.name].forEach((value) => {
          const code = String(value || '').trim().toUpperCase();
          if (code) codes.add(code);
        });
      });
      return Array.from(codes).sort();
    },
    staleTime: 300000,
  });

  // Fetch accurate counts for tab badges (not limited by default 1000 row cap)
  const { data: orderCounts } = useQuery({
    queryKey: ['sales_order_counts', searchTerm, filterPaymentStatus, filterDateFrom, filterDateTo, filterAssetType],
    queryFn: async () => {
      const buildBaseFilter = (q: any) => {
        if (searchTerm) q = q.or(`order_number.ilike.%${searchTerm}%,client_name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);
        if (filterPaymentStatus) q = q.eq('payment_status', filterPaymentStatus);
        if (filterDateFrom) q = q.gte('order_date', format(filterDateFrom, 'yyyy-MM-dd'));
        if (filterDateTo) q = q.lte('order_date', format(filterDateTo, 'yyyy-MM-dd'));
        return q;
      };

      const [completedRes] = await Promise.all([
        buildBaseFilter(
          supabase.from('sales_orders').select('id', { count: 'exact', head: true })
        ),
      ]);

      return {
        completed: completedRes.count ?? 0,
      };
    },
  });

  // Fetch sales orders from database
  const hasActiveFilters = Boolean(
    searchTerm || filterPaymentStatus || filterDateFrom || filterDateTo || filterAssetType
  );

  const { data: salesOrders, isLoading } = useQuery({
    queryKey: ['sales_orders', searchTerm, filterPaymentStatus, filterDateFrom, filterDateTo, filterAssetType],
    staleTime: 60_000,
    queryFn: async () => {
      let query = supabase
        .from('sales_orders')
        .select(`
          *,
          created_by_user:users!created_by(username, first_name, last_name),
          wallet:wallets!wallet_id(wallet_name),
          product:products!product_id(code, name)
        `)
        .order('created_at', { ascending: false });

      // Show all orders regardless of status

      if (searchTerm) {
        query = query.or(`order_number.ilike.%${searchTerm}%,client_name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);
      }

      if (filterPaymentStatus) {
        query = query.eq('payment_status', filterPaymentStatus);
      }

      if (filterDateFrom) {
        query = query.gte('order_date', format(filterDateFrom, 'yyyy-MM-dd'));
      }

      if (filterDateTo) {
        query = query.lte('order_date', format(filterDateTo, 'yyyy-MM-dd'));
      }

      // Performance: without an active filter, only load the most recent 500 orders
      // in a single request instead of paginating the entire history (thousands of rows).
      // Use date filters / search to reach older orders.
      let data: Record<string, unknown>[];
      if (hasActiveFilters) {
        data = await fetchAllPaginated<Record<string, unknown>>(() => query);
      } else {
        const { data: recent, error } = await query.range(0, 499);
        if (error) throw error;
        data = recent || [];
      }
      
      // Sort: description-only matches go to bottom
      if (searchTerm && data) {
        const term = searchTerm.toLowerCase();
        return data.sort((a: any, b: any) => {
          const aPrimary = a.order_number?.toLowerCase().includes(term) || a.client_name?.toLowerCase().includes(term);
          const bPrimary = b.order_number?.toLowerCase().includes(term) || b.client_name?.toLowerCase().includes(term);
          if (aPrimary && !bPrimary) return -1;
          if (!aPrimary && bPrimary) return 1;
          return 0;
        });
      }
      const selectedAsset = filterAssetType.toUpperCase();
      const filteredData = selectedAsset
        ? (data || []).filter((order: any) => getSalesOrderAsset(order) === selectedAsset)
        : (data || []);
      return filteredData;
    },
  });


  // All orders displayed in completed tab now
  const completedOrders = salesOrders || [];
  useDeepLinkHighlight(['orderId'], !isLoading);


  const deleteSalesOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.rpc('delete_sales_order_with_reversal', {
        p_order_id: orderId
      });

      if (error) throw error;
      return orderId;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Sales order deleted and all changes reverted successfully" });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      queryClient.invalidateQueries({ queryKey: ['bank_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['sales_payment_methods'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['stock_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['crypto_wallets'] });
    },
    onError: (error) => {
      console.error('Error deleting sales order:', error);
      toast({
        title: "Error",
        description: (error as any)?.message || "Failed to delete sales order",
        variant: "destructive",
      });
    }
  });

  const updateOrderStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      const { error } = await supabase
        .from('sales_orders')
        .update({ 
          payment_status: status,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (error) throw error;
      return { orderId, status };
    },
    onSuccess: (data) => {
      toast({ 
        title: "Success", 
        description: `Order status updated to ${data.status.replace('_', ' ').toLowerCase()}` 
      });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
    },
    onError: (error) => {
      console.error('Error updating order status:', error);
      toast({ 
        title: "Error", 
        description: "Failed to update order status", 
        variant: "destructive" 
      });
    }
  });

  const handleExportCSV = async () => {
    // Fetch ALL sales orders (paginated) so the export is never truncated by the
    // 1000-row Supabase default cap or the on-screen filter limit.
    const PAGE = 1000;
    let from = 0;
    const fetchedOrders: any[] = [];
    while (true) {
      const { data, error } = await supabase
        .from('sales_orders')
        .select(`
          *,
          created_by_user:users!created_by(username, first_name, last_name),
          wallet:wallets!wallet_id(wallet_name)
        `)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) {
        toast({ title: 'Export failed', description: error.message, variant: 'destructive' });
        return;
      }
      const batch = data || [];
      fetchedOrders.push(...batch);
      if (batch.length < PAGE) break;
      from += PAGE;
    }

    if (fetchedOrders.length === 0) {
      toast({ title: 'No data to export', description: 'There are no sales orders to export.', variant: 'destructive' });
      return;
    }

    const exportOrders = fetchedOrders;
    const orderIds = exportOrders.map(o => o.id);
    const orderNumbers = exportOrders.map(o => o.order_number).filter(Boolean);
    const CHUNK = 200;

    // Fallback wallet lookup — in case the embed didn't populate (stale cache, RLS edge cases, etc.)
    const walletIds = Array.from(new Set(
      exportOrders.map((o: any) => o.wallet_id).filter(Boolean)
    ));
    const walletNameById: Record<string, string> = {};
    if (walletIds.length > 0) {
      const { data: walletRows } = await supabase
        .from('wallets')
        .select('id, wallet_name')
        .in('id', walletIds);
      (walletRows || []).forEach((w: any) => {
        walletNameById[w.id] = (w.wallet_name || '').trim();
      });
    }
    
    let allSplits: any[] = [];
    for (let i = 0; i < orderIds.length; i += CHUNK) {
      const chunk = orderIds.slice(i, i + CHUNK);
      const { data } = await supabase
        .from('sales_order_payment_splits')
        .select('sales_order_id, amount, bank_account_id, is_gateway, bank_accounts:bank_account_id(account_name, bank_name), payment_method:payment_method_id(nickname)')
        .in('sales_order_id', chunk);
      if (data) allSplits = allSplits.concat(data);
    }

    // Fetch bank transactions as fallback (most sales don't have splits)
    let allBankTxns: any[] = [];
    for (let i = 0; i < orderNumbers.length; i += CHUNK) {
      const chunk = orderNumbers.slice(i, i + CHUNK);
      const { data } = await supabase
        .from('bank_transactions')
        .select('reference_number, amount, bank_account_id, bank_accounts:bank_account_id(account_name, bank_name)')
        .in('reference_number', chunk);
      if (data) allBankTxns = allBankTxns.concat(data);
    }

    // Fetch settlement bank info for gateway-settled sales (Terminal P2P, POS, etc.)
    // Source 1: payment_gateway_settlement_items -> payment_gateway_settlements.bank_account_id
    let allSettlementItems: any[] = [];
    for (let i = 0; i < orderIds.length; i += CHUNK) {
      const chunk = orderIds.slice(i, i + CHUNK);
      const { data } = await supabase
        .from('payment_gateway_settlement_items')
        .select('sales_order_id, amount, reversed_at, settlement:settlement_id(bank_account_id, bank_accounts:bank_account_id(account_name, bank_name))')
        .in('sales_order_id', chunk);
      if (data) allSettlementItems = allSettlementItems.concat(data);
    }

    // Source 2: pending_settlements (settled or pending) — has bank_account_id directly
    let allPending: any[] = [];
    for (let i = 0; i < orderIds.length; i += CHUNK) {
      const chunk = orderIds.slice(i, i + CHUNK);
      const { data } = await supabase
        .from('pending_settlements')
        .select('sales_order_id, settlement_amount, status, bank_account_id, bank_accounts:bank_account_id(account_name, bank_name)')
        .in('sales_order_id', chunk);
      if (data) allPending = allPending.concat(data);
    }

    const settlementByOrder: Record<string, Array<{ amount: number; bank_name: string; account_name: string }>> = {};
    (allSettlementItems || []).forEach((it: any) => {
      if (it.reversed_at) return;
      const oid = it.sales_order_id;
      const bn = it.settlement?.bank_accounts?.bank_name || '';
      const an = it.settlement?.bank_accounts?.account_name || '';
      if (!bn && !an) return;
      if (!settlementByOrder[oid]) settlementByOrder[oid] = [];
      settlementByOrder[oid].push({ amount: Number(it.amount) || 0, bank_name: bn, account_name: an });
    });
    (allPending || []).forEach((p: any) => {
      const oid = p.sales_order_id;
      const bn = p.bank_accounts?.bank_name || '';
      const an = p.bank_accounts?.account_name || '';
      if (!bn && !an) return;
      if (settlementByOrder[oid]) return; // prefer settled items over pending
      settlementByOrder[oid] = [{ amount: Number(p.settlement_amount) || 0, bank_name: bn, account_name: an }];
    });

    // Group splits by order id
    const splitsByOrder: Record<string, Array<{ amount: number; bank_name: string; account_name: string; nickname: string; is_gateway: boolean }>> = {};
    (allSplits || []).forEach((s: any) => {
      const oid = s.sales_order_id;
      if (!splitsByOrder[oid]) splitsByOrder[oid] = [];
      splitsByOrder[oid].push({
        amount: Number(s.amount) || 0,
        bank_name: s.bank_accounts?.bank_name || '',
        account_name: s.bank_accounts?.account_name || '',
        nickname: s.payment_method?.nickname || '',
        is_gateway: !!s.is_gateway,
      });
    });

    // Group bank transactions by order number as fallback
    const bankTxnsByOrderNo: Record<string, Array<{ amount: number; bank_name: string; account_name: string }>> = {};
    (allBankTxns || []).forEach((t: any) => {
      const ref = t.reference_number;
      if (!bankTxnsByOrderNo[ref]) bankTxnsByOrderNo[ref] = [];
      bankTxnsByOrderNo[ref].push({
        amount: Number(t.amount) || 0,
        bank_name: t.bank_accounts?.bank_name || '',
        account_name: t.bank_accounts?.account_name || '',
      });
    });

    const csvHeaders = [
      'Order Number',
      'Customer',
      'Phone',
      'State',
      'Platform', 
      'Amount',
      'Quantity',
      'Price Per Unit',
      'Fee Percentage',
      'Fee Amount',
      'Net Amount',
      'Status',
      'Payment Status',
      'Settlement Status',
      'Is Off Market',
      'Split Payment',
      'Bank Name',
      'Bank Account / Method',
      'Split Amount',
      'Description',
      'Risk Level',
      'Created By',
      'Date',
      'Created At'
    ];

    const csvData: any[][] = [];

    exportOrders.forEach(order => {
      // Priority: explicit splits > gateway settlement bank > bank_transactions match
      const splits = splitsByOrder[order.id];
      const settlements = settlementByOrder[order.id];
      const bankTxns = bankTxnsByOrderNo[order.order_number || ''];
      const hasSplitData = splits && splits.length > 0;
      const hasSettlementData = !hasSplitData && settlements && settlements.length > 0;
      const paymentSources = hasSplitData
        ? splits.map(s => ({ bank_name: s.bank_name, account_label: s.nickname || s.account_name, amount: s.amount }))
        : hasSettlementData
          ? settlements.map(s => ({ bank_name: s.bank_name, account_label: s.account_name, amount: s.amount }))
          : (bankTxns || []).map(t => ({ bank_name: t.bank_name, account_label: t.account_name, amount: t.amount }));
      const hasSplits = (order.is_split_payment && paymentSources.length > 1) || paymentSources.length > 1;

      const buildRow = (bankName: string, accountLabel: string, splitAmount: string, isSplit: string) => [
        order.order_number,
        order.client_name,
        order.client_phone || '',
        order.client_state || '',
        ((order as any).wallet?.wallet_name?.trim()) || walletNameById[(order as any).wallet_id] || order.platform || '',
        order.total_amount,
        order.quantity || 1,
        order.price_per_unit || order.total_amount,
        order.fee_percentage || 0,
        order.fee_amount || 0,
        order.net_amount || order.total_amount,
        order.status || '',
        order.payment_status || '',
        order.settlement_status || '',
        order.is_off_market ? 'Yes' : 'No',
        isSplit,
        bankName,
        accountLabel,
        splitAmount,
        order.description || '',
        order.risk_level || '',
        order.created_by_user 
          ? (order.created_by_user.first_name || order.created_by_user.username || '')
          : '',
        format(new Date(order.order_date), 'MMM dd, yyyy'),
        format(new Date(order.created_at), 'MMM dd, yyyy HH:mm')
      ];

      if (hasSplits) {
        paymentSources.forEach(src => {
          csvData.push(buildRow(
            src.bank_name,
            src.account_label,
            String(src.amount),
            'Yes'
          ));
        });
      } else {
        const single = paymentSources[0];
        csvData.push(buildRow(
          single?.bank_name || '',
          single?.account_label || '',
          single ? String(single.amount) : '',
          'No'
        ));
      }
    });

    const csvContent = [csvHeaders, ...csvData]
      .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales_orders_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  /** Runs the export once at a time and shows that it is working. */
  const runExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await handleExportCSV();
    } finally {
      setIsExporting(false);
    }
  };

  // The search box updates the query 300 ms after typing stops (one search per pause, not per keystroke).
  useEffect(() => {
    if (searchInput === searchTerm) return;
    const t = window.setTimeout(() => setSearchTerm(searchInput), 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const clearFilters = () => {
    setFilterPaymentStatus("");
    setFilterAssetType("");
    setFilterDateFrom(undefined);
    setFilterDateTo(undefined);
    setSearchTerm("");
    setSearchInput("");
    setShowFilterDialog(false);
  };

  const handleDeleteOrder = async (orderId: string) => {
    setDeleteOrderId(orderId);
  };

  /* ── Presentation ─────────────────────────────────────────────────────── */

  // One layout for the room the list really has: cards on phones, then progressively wider tables.
  const { ref: listRef, narrow, width: listWidth } = useNarrow<HTMLDivElement>(600);
  const wide = listWidth >= 1120; // separate "Created by" column
  const merged = listWidth < 880; // order and customer share one column
  const iconActions = listWidth < 1000; // View / Edit as icons only
  // Keeps the page across deletes and refetches; back to page 1 when the search or a filter changes.
  const paged = useListPages(
    completedOrders,
    PAGE_SIZE,
    `${searchTerm}|${filterPaymentStatus}|${filterAssetType}|${filterDateFrom?.getTime() ?? ""}|${filterDateTo?.getTime() ?? ""}`,
  );

  // A ?orderId= link lands on the page that holds the order (once), so the highlight can find it.
  const deepLinkOrderId = useMemo(() => new URLSearchParams(window.location.search).get("orderId"), []);
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (deepLinkDone.current || !deepLinkOrderId || !salesOrders) return;
    deepLinkDone.current = true;
    const i = salesOrders.findIndex((o: any) => o.id === deepLinkOrderId);
    if (i >= PAGE_SIZE) paged.setPage(Math.floor(i / PAGE_SIZE));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkOrderId, salesOrders]);

  const completedCount = filterAssetType ? completedOrders.length : orderCounts?.completed ?? completedOrders.length;
  const listTotal = completedOrders.reduce((sum: number, o: any) => sum + (Number(o.total_amount) || 0), 0);
  const filtersOn = Boolean(searchTerm.trim() || filterPaymentStatus || filterAssetType || filterDateFrom || filterDateTo);
  const orderToDelete: any = deleteOrderId ? completedOrders.find((o: any) => o.id === deleteOrderId) : null;
  const platformOf = (order: any) => order.wallet?.wallet_name || order.platform || "Off Market";
  const orderedAt = (order: any) => `${fmtDate(order.order_date)} · ${fmtTime(order.created_at || order.order_date)}`;
  const metaLine = (order: any) => `${orderedAt(order)} · ${platformOf(order)} · by ${personLabel(order.created_by_user) ?? "—"}`;
  const priceLine = (order: any) =>
    `${fmtAssetQty(order.quantity || 1, getSalesOrderAsset(order))} @ ${fmtRate(order.price_per_unit || order.total_amount)}`;

  const listNote = () => {
    if (isLoading) return null;
    const n = completedOrders.length;
    const noun = n === 1 ? "order" : "orders";
    if (hasActiveFilters) return `${n.toLocaleString("en-IN")} matching ${noun} · ${fmtInr(listTotal)}`;
    if (n >= 500) {
      const all = orderCounts?.completed;
      return `Latest 500${all ? ` of ${all.toLocaleString("en-IN")}` : ""} orders. Search or filter to reach older ones.`;
    }
    return `${n.toLocaleString("en-IN")} ${noun} · ${fmtInr(listTotal)}`;
  };

  const customerButton = (order: any, className?: string) => (
    <button
      type="button"
      onClick={() => navigateToClient(order.client_name)}
      className={cn("max-w-full truncate text-left font-medium text-primary hover:underline focus-visible:underline focus-visible:outline-none", className)}
      title={`Open ${order.client_name} in Clients`}
    >
      {order.client_name}
    </button>
  );

  const rowActions = (order: any, iconOnly = false) =>
    order.payment_status === 'USER_PAYING' ? (
      <PermissionGate permissions={["sales_manage"]} showFallback={false}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSelectedOrderForUserPaying(order)}
          className="h-8 gap-1.5 border-info/40 bg-info/10 px-2.5 text-xs text-info hover:bg-info/15 hover:text-info"
        >
          <HandCoins className="h-3.5 w-3.5" />
          Take action
        </Button>
      </PermissionGate>
    ) : (
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
        <PermissionGate permissions={["sales_manage"]} showFallback={false}>
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
              onClick={() => handleDeleteOrder(order.id)}
              disabled={deleteSalesOrderMutation.isPending}
              className="h-8 w-8 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label={`Delete order ${order.order_number}`}
              title="Delete order"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </PermissionGate>
      </>
    );

  const renderTable = () => (
    <table className={cn(LIST_TABLE, LIST_DENSITY[density], "table-fixed")}>
      <colgroup>
        <col className={merged ? undefined : "w-[15rem]"} />
        {!merged && <col />}
        <col className="w-[12.5rem]" />
        <col className="w-[8.5rem]" />
        {wide && <col className="w-[8rem]" />}
        <col className={iconActions ? "w-[7.25rem]" : "w-[12.5rem]"} />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">{merged ? "Order & customer" : "Order"}</th>
          {!merged && <th scope="col">Customer</th>}
          <th scope="col" className="text-right">Amount</th>
          <th scope="col">Status</th>
          {wide && <th scope="col">Created by</th>}
          <th scope="col" className="text-right"><span className="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        {paged.slice.map((order: any) => (
          <ClickableRow
            key={order.id}
            txType="sales_order"
            txId={order.id}
            aria-label={`Order ${order.order_number}, ${order.client_name}, ${fmtInr(order.total_amount)}`}
            {...rowOpenHandlers(() => setSelectedOrderForDetails(order))}
          >
            {merged ? (
              <td>
                <div className="flex min-w-0 flex-col">
                  {customerButton(order)}
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
                  <div className="mt-0.5 truncate text-xs text-muted-foreground" title={`${orderedAt(order)} · ${platformOf(order)}`}>
                    {orderedAt(order)} · {platformOf(order)}
                  </div>
                  {!wide && (
                    <div className="truncate text-xs text-muted-foreground">by {personLabel(order.created_by_user) ?? "—"}</div>
                  )}
                </td>
                <td>
                  <div className="flex min-w-0 flex-col">
                    {customerButton(order)}
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
            </td>
            <td>
              <SalesStatusChip status={order.payment_status} />
            </td>
            {wide && <td className="truncate text-muted-foreground">{personLabel(order.created_by_user) ?? "—"}</td>}
            <td>
              <div className="flex items-center justify-end gap-0.5">{rowActions(order, iconActions)}</div>
            </td>
          </ClickableRow>
        ))}
      </tbody>
    </table>
  );

  // Cards (narrow panels): the customer name is plain text, as on the old phone cards; the whole card opens the order.
  const renderCards = () => (
    <ul className="divide-y divide-border">
      {paged.slice.map((order: any) => (
        <li
          key={order.id}
          id={`tx-row-${order.id}`}
          data-tx-id={order.id}
          role="button"
          tabIndex={0}
          aria-label={`Order ${order.order_number}, ${order.client_name}, ${fmtInr(order.total_amount)}`}
          className="cursor-pointer px-3 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
          {...rowOpenHandlers(() => setSelectedOrderForDetails(order))}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[15px] font-medium text-foreground">{order.client_name}</span>
              <OrderNo value={order.order_number} selectable className="break-all text-muted-foreground" />
            </div>
            <SalesStatusChip status={order.payment_status} className="mt-0.5 shrink-0" />
          </div>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <span className="text-base font-semibold tabular-nums text-foreground">{fmtInr(order.total_amount)}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{priceLine(order)}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{metaLine(order)}</p>
          {order.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{order.description}</p>}
          <div className="mt-2.5 flex flex-wrap items-center gap-1">{rowActions(order)}</div>
        </li>
      ))}
    </ul>
  );

  return (
    <PermissionGate
      permissions={["sales_view"]}
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center p-6 page-mount">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-sm">
            <Shield className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="mt-3 text-lg font-semibold text-foreground">Access Denied</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              You don't have permission to access Sales Management.
            </p>
            <Button className="mt-4" onClick={() => navigate("/dashboard")}>
              Return to Dashboard
            </Button>
          </div>
        </div>
      }
    >
    <div className="mx-auto w-full max-w-[1440px] space-y-4 p-3 sm:space-y-5 sm:p-6">
      <PageHeader
        title="Sales orders"
        description="ERP sales orders, Terminal sales waiting for approval, and clubbed small sales."
        actions={
          <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <Button variant="outline" onClick={runExport} disabled={isExporting} size="sm" className="h-9 gap-1.5" aria-label="Export sales orders as CSV">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">{isExporting ? "Exporting…" : "Export"}</span>
            </Button>
            <PermissionGate permissions={["sales_manage"]} showFallback={false}>
              <Button variant="outline" onClick={() => setShowManualSalesEntry(true)} size="sm" className="h-9 gap-1.5">
                <Plus className="h-4 w-4" />
                Manual entry
              </Button>
              <Button onClick={() => setShowStepByStepFlow(true)} size="sm" className="h-9 gap-1.5">
                <Plus className="h-4 w-4" />
                New order
              </Button>
            </PermissionGate>
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className={SUBNAV_LIST}>
          <TabsTrigger value="completed" className={SUBNAV_TRIGGER}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            Completed
            {!isLoading && <TabCount value={completedCount} />}
          </TabsTrigger>
          <TabsTrigger value="terminal-sync" className={SUBNAV_TRIGGER}>
            <Link2 className="h-3.5 w-3.5" />
            Terminal sync
          </TabsTrigger>
          <TabsTrigger value="small-sales" className={SUBNAV_TRIGGER}>
            <Package className="h-3.5 w-3.5" />
            Small sales
          </TabsTrigger>
        </TabsList>

        <TabsContent value="completed" className="mt-0">
          <section className="min-w-0 rounded-lg border border-border bg-card shadow-[var(--shadow-xs)]" aria-label="Sales orders">
            <PanelToolbar>
              <SearchField
                value={searchInput}
                onValueChange={setSearchInput}
                label="Search sales orders"
                placeholder="Order no., customer or description"
                data-page-search
                containerClassName="sm:min-w-[240px] sm:flex-1"
              />
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                <Select value={filterPaymentStatus || "all"} onValueChange={(v) => setFilterPaymentStatus(v === "all" ? "" : v)}>
                  <SelectTrigger className="h-9 sm:w-[170px]" aria-label="Filter by payment status">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>{salesPaymentStatusMeta(s).label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterAssetType || "all"} onValueChange={(value) => setFilterAssetType(value === "all" ? "" : value)}>
                  <SelectTrigger className="h-9 sm:w-[140px]" aria-label="Filter by asset">
                    <SelectValue placeholder="All assets" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All assets</SelectItem>
                    {assetOptions.map((asset) => (
                      <SelectItem key={asset} value={asset}>{asset}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <DateRangeFilter
                  from={filterDateFrom}
                  to={filterDateTo}
                  onFromChange={setFilterDateFrom}
                  onToChange={setFilterDateTo}
                  className="col-span-2 sm:col-span-1 sm:w-[210px]"
                />
              </div>
            </PanelToolbar>

            {filtersOn && (
              <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2.5 sm:px-5">
                {searchTerm.trim() && (
                  <FilterChip label="Search:" value={searchTerm} onRemove={() => { setSearchTerm(""); setSearchInput(""); }} />
                )}
                {filterPaymentStatus && (
                  <FilterChip label="Status:" value={salesPaymentStatusMeta(filterPaymentStatus).label} onRemove={() => setFilterPaymentStatus("")} />
                )}
                {filterAssetType && (
                  <FilterChip label="Asset:" value={filterAssetType} onRemove={() => setFilterAssetType("")} />
                )}
                {filterDateFrom && (
                  <FilterChip label="From:" value={fmtDate(filterDateFrom)} onRemove={() => setFilterDateFrom(undefined)} />
                )}
                {filterDateTo && (
                  <FilterChip label="To:" value={fmtDate(filterDateTo)} onRemove={() => setFilterDateTo(undefined)} />
                )}
                <Button variant="link" size="sm" className="h-auto px-1 py-0 text-xs" onClick={clearFilters}>
                  Clear all
                </Button>
              </div>
            )}

            <div ref={listRef}>
              {isLoading ? (
                <PanelSkeleton rows={8} label="Loading sales orders" />
              ) : completedOrders.length === 0 ? (
                <PanelMessage icon={ShoppingCart} title={filtersOn ? "No orders match these filters" : "No sales orders yet"}>
                  {filtersOn && (
                    <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  )}
                </PanelMessage>
              ) : (
                <>
                  <div className="flex min-h-11 items-center justify-between gap-3 px-3 pb-1.5 pt-2 sm:px-5">
                    <ListNote className="p-0 sm:p-0">{listNote()}</ListNote>
                    {!narrow && (
                      // md+ only: below 768px a global rule forces every role=tablist to full width
                      <div className="hidden shrink-0 md:block">
                        <SegmentedControl
                          size="sm"
                          aria-label="Row density"
                          value={density}
                          onValueChange={(v) => setDensity(v as "comfortable" | "compact")}
                          options={[
                            { label: "Comfortable", value: "comfortable" },
                            { label: "Compact", value: "compact" },
                          ]}
                        />
                      </div>
                    )}
                  </div>
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
        </TabsContent>

        <TabsContent value="terminal-sync" className="mt-0">
          <TerminalSalesSyncTab />
        </TabsContent>

        <TabsContent value="small-sales" className="mt-0">
          <SmallSalesSyncTab />
        </TabsContent>
      </Tabs>


      {/* Step-by-Step Sales Flow */}
      <PermissionGate permissions={["sales_manage"]} showFallback={false}>
        <StepBySalesFlow 
          open={showStepByStepFlow}
          onOpenChange={setShowStepByStepFlow}
          queryClient={queryClient}
        />
      </PermissionGate>

      {/* Manual Sales Entry Dialog */}
      <PermissionGate permissions={["sales_manage"]} showFallback={false}>
        <SalesEntryDialog
          open={showManualSalesEntry}
          onOpenChange={setShowManualSalesEntry}
        />
      </PermissionGate>

      {/* Details Dialog */}
      <SalesOrderDetailsDialog
        open={!!selectedOrderForDetails}
        onOpenChange={(open) => !open && setSelectedOrderForDetails(null)}
        order={selectedOrderForDetails}
      />

      {/* Edit Dialog */}
      <PermissionGate permissions={["sales_manage"]} showFallback={false}>
        <EditSalesOrderDialog
          open={!!selectedOrderForEdit}
          onOpenChange={(open) => !open && setSelectedOrderForEdit(null)}
          order={selectedOrderForEdit}
        />
      </PermissionGate>

      {/* User Paying Status Dialog */}
      <PermissionGate permissions={["sales_manage"]} showFallback={false}>
        <UserPayingStatusDialog
          open={!!selectedOrderForUserPaying}
          onOpenChange={(open) => !open && setSelectedOrderForUserPaying(null)}
          clientName={selectedOrderForUserPaying?.client_name || ''}
          orderAmount={selectedOrderForUserPaying?.total_amount || 0}
          orderNumber={selectedOrderForUserPaying?.order_number}
          onStatusChange={(status) => {
            // Capture the order reference immediately before any state changes
            const orderToUpdate = selectedOrderForUserPaying;
            
            if (status === "PAYMENT_DONE") {
              // Show completion form instead of directly updating status
              setSelectedOrderForUserPaying(null);
              setSelectedOrderForCompletion(orderToUpdate);
            } else {
              // Handle other status changes (ORDER_CANCELLED)
              if (!orderToUpdate) return;

              if (status === "ORDER_CANCELLED") {
                // IMPORTANT: Some legacy DB triggers currently break UPDATE on sales_orders
                // with error: record "new" has no field "order_type".
                // To keep business logic intact (reversal + cleanup), cancel this pending order
                // using the existing reversal RPC (same behavior as normal deletion).
                deleteSalesOrderMutation.mutate(orderToUpdate.id);
                return;
              }

              updateOrderStatusMutation.mutate({
                orderId: orderToUpdate.id,
                status: status
              });
            }
          }}
          onAlternativeMethod={() => {
            setSelectedOrderForUserPaying(null);
            setSelectedOrderForAlternativeMethod(selectedOrderForUserPaying);
          }}
        />
      </PermissionGate>

      {/* Alternative Payment Method Dialog */}
      <PermissionGate permissions={["sales_manage"]} showFallback={false}>
        <PaymentMethodSelectionDialog
          open={!!selectedOrderForAlternativeMethod}
          onOpenChange={(open) => !open && setSelectedOrderForAlternativeMethod(null)}
          orderAmount={selectedOrderForAlternativeMethod?.total_amount || 0}
          clientName={selectedOrderForAlternativeMethod?.client_name || ''}
          orderId={selectedOrderForAlternativeMethod?.id || ''}
          riskCategory="MEDIUM"
          paymentType="UPI"
          onStatusChange={(status) => {
            if (selectedOrderForAlternativeMethod) {
              updateOrderStatusMutation.mutate({
                orderId: selectedOrderForAlternativeMethod.id,
                status: status
              });
              setSelectedOrderForAlternativeMethod(null);
            }
          }}
        />
      </PermissionGate>

      {/* Order Completion Form */}
      <PermissionGate permissions={["sales_manage"]} showFallback={false}>
        <OrderCompletionForm
          open={!!selectedOrderForCompletion}
          onOpenChange={(open) => !open && setSelectedOrderForCompletion(null)}
          order={selectedOrderForCompletion}
        />
      </PermissionGate>

      <AlertDialog open={!!deleteOrderId} onOpenChange={() => setDeleteOrderId(null)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this sales order?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                {orderToDelete && (
                  <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-foreground">
                    <span className="font-mono text-[12px]">{orderToDelete.order_number}</span>
                    <span className="mx-1.5 text-muted-foreground">·</span>
                    {orderToDelete.client_name}
                    <span className="mx-1.5 text-muted-foreground">·</span>
                    <span className="font-semibold tabular-nums">{fmtInr(orderToDelete.total_amount)}</span>
                  </p>
                )}
                <p>The order is deleted and all related changes are reverted (stock, wallet, bank and client entries). This can't be undone.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className={buttonVariants({ variant: "destructive" })} onClick={() => { if (deleteOrderId) { deleteSalesOrderMutation.mutate(deleteOrderId); setDeleteOrderId(null); } }}>Delete order</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </PermissionGate>
  );
}
