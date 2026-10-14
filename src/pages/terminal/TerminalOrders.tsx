import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ShoppingCart, RefreshCw, Search, MessageSquare, Copy, ShieldAlert, UserPlus, User, Users, ArrowLeftRight, MessagesSquare, AlertTriangle, ListChecks, LayoutList, LayoutGrid, ChevronRight, Timer } from 'lucide-react';
import { toast } from 'sonner';
import { callBinanceAds, useBinanceActiveOrders, useBinanceOrderHistory } from '@/hooks/useBinanceActions';
import { useSyncOrders, useSyncOrdersBatch, P2POrderRecord } from '@/hooks/useP2PTerminal';
import { C2COrderHistoryItem } from '@/hooks/useBinanceOrders';
import { CounterpartyBadge } from '@/components/terminal/orders/CounterpartyBadge';
import { AccountBadge } from '@/components/exchange/AccountBadge';
import { OrderDetailWorkspace } from '@/components/terminal/orders/OrderDetailWorkspace';
import { ChatInbox, ChatConversation } from '@/components/terminal/orders/ChatInbox';
import { useChatInboxUnread } from '@/hooks/useChatInboxUnread';
import { ChatThreadView } from '@/components/terminal/orders/ChatThreadView';
import { QueueMode } from '@/components/terminal/orders/QueueMode';
import { OrderAssignmentDialog } from '@/components/terminal/orders/OrderAssignmentDialog';
import { ReleaseCoinAction } from '@/components/terminal/orders/OrderActions';
import { useTerminalJurisdiction } from '@/hooks/useTerminalJurisdiction';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';
import { format } from 'date-fns';
import { DateRangePicker, getDateRangeFromPreset, type DateRangePreset } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { mapToOperationalStatus, getStatusStyle, normaliseBinanceStatus } from '@/lib/orderStatusMapper';
import { getOptimisticOrderStatus, clearOptimisticOrderStatus, useOptimisticOrderStatusVersion } from '@/lib/optimisticOrderStatus';
import { useAlternateUpiRequests } from '@/hooks/usePayerModule';
import { supabase } from '@/integrations/supabase/client';
import { useExchangeAccount } from '@/contexts/ExchangeAccountContext';
import { useTerminalUserPrefs } from '@/hooks/useTerminalUserPrefs';
import { useInternalUnreadCounts } from '@/hooks/useInternalChat';
import { syncCompletedBuyOrders } from '@/hooks/useTerminalPurchaseSync';
import { syncCompletedSellOrders } from '@/hooks/useTerminalSalesSync';
import { isOrderChatRead, markOrderChatRead, subscribeToChatReadState } from '@/lib/chat-read-state';
import { useDebounce } from '@/hooks/useDebounce';
import { useTerminalAlerts } from '@/hooks/useTerminalAlerts';
import { subscribeTerminalContextKey } from '@/hooks/useTerminalHotkeys';
import { focusPageSearch } from '@/lib/focus-page-search';
import { pollWhenVisible } from '@/lib/poll-when-visible';
import { useTerminalCollectorState, isCollectorStale, triggerCollectorTick } from '@/hooks/useTerminalCollector';
import { useIsMobile } from '@/hooks/use-mobile';


/** Convert numeric orderStatus to string */
function mapOrderStatusCode(code: number | string): string {
  return normaliseBinanceStatus(code);
}

function extractAppealStatusFromRaw(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const status = (raw as Record<string, unknown>).orderStatus;
  const statusText = status === undefined || status === null ? '' : String(status).toUpperCase();
  return statusText.includes('APPEAL') || statusText.includes('DISPUTE') || statusText.includes('COMPLAINT')
    ? normaliseBinanceStatus(status as string | number)
    : undefined;
}

/** Convert raw Binance active order to display-ready P2POrderRecord shape */
function binanceToOrderRecord(o: any): P2POrderRecord & { _notifyPayEndTime?: number; _notifyPayedExpireMinute?: number } {
  const status = mapOrderStatusCode(o.orderStatus);
  return {
    id: o.orderNumber,
    binance_order_number: o.orderNumber,
    binance_adv_no: o.advNo || null,
    counterparty_id: null,
    counterparty_nickname: o.tradeType === 'BUY' ? (o.sellerNickname || '') : (o.buyerNickname || ''),
    trade_type: o.tradeType,
    asset: o.asset || 'USDT',
    fiat_unit: o.fiat || 'INR',
    amount: parseFloat(o.amount || '0'),
    total_price: parseFloat(o.totalPrice || '0'),
    unit_price: parseFloat(o.unitPrice || o.price || '0') || (parseFloat(o.totalPrice || '0') / parseFloat(o.amount || '1')),
    commission: parseFloat(o.commission || '0'),
    order_status: status,
    pay_method_name: o.payMethodName || null,
    binance_create_time: o.createTime || null,
    is_repeat_client: false,
    repeat_order_count: 0,
    assigned_operator_id: null,
    order_type: null,
    synced_at: new Date().toISOString(),
    completed_at: null,
    cancelled_at: null,
    created_at: new Date().toISOString(),
    additional_kyc_verify: o.additionalKycVerify ?? 0,
    _notifyPayEndTime: o.notifyPayEndTime || undefined,
    _notifyPayedExpireMinute: o.notifyPayedExpireMinute || undefined,
  };
}

/** Convert to C2COrderHistoryItem for sync */
function toSyncItem(o: any): C2COrderHistoryItem {
  return {
    orderNumber: o.orderNumber,
    advNo: o.advNo || '',
    tradeType: o.tradeType,
    asset: o.asset || 'USDT',
    fiatUnit: o.fiat || 'INR',
    orderStatus: mapOrderStatusCode(o.orderStatus),
    amount: o.amount || '0',
    totalPrice: o.totalPrice || '0',
    unitPrice: o.unitPrice || '0',
    commission: o.commission || '0',
    counterPartNickName: o.tradeType === 'BUY' ? o.sellerNickname : o.buyerNickname,
    createTime: o.createTime || 0,
    payMethodName: o.payMethodName || undefined,
  };
}

import { TerminalPermissionGate } from '@/components/terminal/TerminalPermissionGate';

/* ---- Orders list presentation (UI only) ---- */
// Segmented filter controls share one look; min-h-0 cancels the TabsList default height.
const SEG_LIST = 'h-8 min-h-0 flex-nowrap gap-0.5 rounded-md border border-border bg-secondary/60 p-0.5';
const SEG_TRIGGER = 'h-7 gap-1.5 rounded-[5px] px-2.5 py-0 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm';
const SEG_COUNT = 't-mono min-w-[18px] rounded px-1 text-center text-[10px] tabular-nums';
const ROW_ICON_BTN = 'relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const COUNT_BADGE = 'pointer-events-none absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground ring-2 ring-card';
const FLAG_CHIP = 'inline-flex h-5 w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-1.5 text-[10px] font-medium';
const fmtUnitPrice = (v: number | string) => Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Session-scoped memory of where the operator was on the Orders page.
 * Navigating to another Terminal page unmounts this route, which previously
 * closed the open order/chat. We remember the open order (and Queue Mode) for
 * the browser session and restore it on the way back.
 */
const ORDERS_SESSION_KEY = 'terminal_orders_open_state';

interface OrdersSessionState {
  orderNumber?: string;
  /** Full snapshot of the open order so a remount restores it instantly. */
  order?: P2POrderRecord | null;
  queueMode?: boolean;
  showChatInbox?: boolean;
  activeChatConv?: ChatConversation | null;
}

function readOrdersSession(): OrdersSessionState {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.sessionStorage.getItem(ORDERS_SESSION_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function writeOrdersSession(state: OrdersSessionState) {
  if (typeof window === 'undefined') return;
  try {
    if (!state.orderNumber && !state.queueMode && !state.showChatInbox && !state.activeChatConv) {
      window.sessionStorage.removeItem(ORDERS_SESSION_KEY);
    } else {
      window.sessionStorage.setItem(ORDERS_SESSION_KEY, JSON.stringify(state));
    }
  } catch {
    // storage unavailable — persistence is best-effort
  }
}

function TerminalOrdersContent() {
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [datePreset, setDatePreset] = useState<DateRangePreset>('allTime');
  // The open order is restored synchronously from its stored snapshot, so a
  // remount (tab-focus auth revalidation) never drops the operator back to the
  // order list while a network lookup runs.
  const [selectedOrder, setSelectedOrder] = useState<P2POrderRecord | null>(
    () => readOrdersSession().order || null,
  );
  // Chat surfaces restore synchronously from session storage so a remount
  // (tab-focus auth revalidation, internal navigation) re-opens the exact
  // chat the operator was in — no spinner, no trip back to the order list.
  const [showChatInbox, setShowChatInbox] = useState(() => !!readOrdersSession().showChatInbox);
  const [queueMode, setQueueMode] = useState(() => !!readOrdersSession().queueMode);
  const [activeChatConv, setActiveChatConv] = useState<ChatConversation | null>(() => readOrdersSession().activeChatConv || null);
  const [chatReadVersion, setChatReadVersion] = useState(0);
  // Bumps when a just-released order gets an optimistic COMPLETED status.
  const optimisticStatusVersion = useOptimisticOrderStatusVersion();
  const [visibleCount, setVisibleCount] = useState(50);
  const [assignDialogOrder, setAssignDialogOrder] = useState<P2POrderRecord | null>(null);
  const [focusedOrderId, setFocusedOrderId] = useState<string | null>(null);
  // The orders panel's width picks the list layout (compact rows below 52rem, table from 52rem),
  // so only one layout is mounted. Measured before paint, then kept in sync while it resizes.
  const [ordersPanelEl, setOrdersPanelEl] = useState<HTMLDivElement | null>(null);
  const [ordersPanelWide, setOrdersPanelWide] = useState(true);
  useLayoutEffect(() => {
    if (!ordersPanelEl) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const apply = (width: number) => {
      if (width > 0) setOrdersPanelWide(width >= 52 * rem);
    };
    apply(ordersPanelEl.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => apply(entries[0]?.contentRect.width ?? 0));
    observer.observe(ordersPanelEl);
    return () => observer.disconnect();
  }, [ordersPanelEl]);
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkHandledRef = useRef(false);
  const restoreHandledRef = useRef(false);
  // True once a session restore has either completed or there was nothing to
  // restore. Until then, the write-effect must NOT wipe the saved order number
  // — a remount (e.g. auth revalidation on tab focus) starts with
  // selectedOrder=null, and clearing the key before the deep-link fetch
  // finishes would permanently forget where the operator was.
  const restoreSettledRef = useRef(false);

  // Restore the previously-open order by reusing the existing ?order deep-link
  // machinery (which also resolves orders outside the loaded window). With the
  // snapshot restore above this is only a freshness top-up.
  useEffect(() => {
    if (restoreHandledRef.current) return;
    restoreHandledRef.current = true;
    const saved = readOrdersSession().orderNumber;
    if (!saved || searchParams.get('order')) {
      restoreSettledRef.current = true;
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.set('order', saved);
    setSearchParams(next, { replace: true });
    // Safety net: if the deep-link restore can't resolve the order (e.g. the
    // Binance lookup failed), settle after a grace period so the stored key
    // doesn't linger forever and normal open/close tracking resumes.
    const settleTimer = setTimeout(() => { restoreSettledRef.current = true; }, 15000);
    return () => clearTimeout(settleTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Remember the current open order / queue mode / chat surfaces for this
  // browser session.
  useEffect(() => {
    if (selectedOrder) restoreSettledRef.current = true;
    const previous = readOrdersSession();
    writeOrdersSession({
      orderNumber: selectedOrder
        ? String(selectedOrder.binance_order_number)
        // Before the restore settles, a null selection just means "freshly
        // mounted" — keep the previously saved order so a double remount
        // (tab-focus auth revalidation) doesn't erase it mid-restore.
        : (restoreSettledRef.current ? undefined : previous.orderNumber),
      order: selectedOrder ?? (restoreSettledRef.current ? null : previous.order ?? null),
      queueMode,
      showChatInbox,
      activeChatConv,
    });
  }, [selectedOrder, queueMode, showChatInbox, activeChatConv]);



  const { hasPermission, isTerminalAdmin, userId } = useTerminalAuth();
  const isMobile = useIsMobile();
  const { activeAccountId, isAllAccounts, accountsToQuery } = useExchangeAccount();
  // Server-side order collector heartbeat — stale means the terminal has
  // silently fallen back to per-browser Binance polling.
  const { data: collectorState } = useTerminalCollectorState();
  const collectorStale = isCollectorStale(collectorState);

  const canChat = hasPermission('terminal_orders_chat') || isTerminalAdmin;
  const canEscalate = hasPermission('terminal_orders_escalate') || isTerminalAdmin;
  const canExport = hasPermission('terminal_orders_export') || isTerminalAdmin;
  const canSyncApprove = hasPermission('terminal_orders_sync_approve') || isTerminalAdmin;
  const canOrderActions = hasPermission('terminal_orders_actions') || isTerminalAdmin;
  const queryClient = useQueryClient();

  // Persisted per-user filter preferences
  const ORDER_PREF_DEFAULTS = { tradeFilter: 'all' as string, statusFilter: 'active' as string, activeSubFilter: 'all' as string, assignmentFilter: 'all' as string, mobileView: 'list' as string };
  const [orderPrefs, setOrderPref] = useTerminalUserPrefs(userId, 'orders', ORDER_PREF_DEFAULTS);
  const tradeFilter = orderPrefs.tradeFilter;
  const statusFilter = orderPrefs.statusFilter;
  const assignmentFilter = orderPrefs.assignmentFilter;
  const mobileView = orderPrefs.mobileView === 'cards' ? 'cards' : 'list';
  const setTradeFilter = (v: string) => setOrderPref('tradeFilter', v);
  const setStatusFilter = (v: string) => {
    setOrderPref('statusFilter', v);
    // Sub-filter defaults back to "All" whenever the status tab changes
    setOrderPref('activeSubFilter', 'all');
  };
  const activeSubFilter = orderPrefs.activeSubFilter || 'all';
  const setActiveSubFilter = (v: string) => setOrderPref('activeSubFilter', v);
  const activeSubCountsRef = useRef({ all: 0, unpaid: 0, paid: 0, appeal: 0 });
  const setAssignmentFilter = (v: string) => setOrderPref('assignmentFilter', v);
  const setMobileView = (v: 'list' | 'cards') => setOrderPref('mobileView', v);

  const canManageOrders = hasPermission('terminal_orders_manage') || isTerminalAdmin;
  const {
    canViewOrder, getOrderVisibility, getOrderAssignment, orderAssignments,
    refetch: refetchJurisdiction,
  } = useTerminalJurisdiction();

  // Fetch user's assigned size ranges & ad IDs for order filtering
  // Check terminal_user_size_range_mappings, terminal_payer_assignments, AND terminal_operator_assignments
  const { data: userSizeRanges } = useQuery({
    queryKey: ['user-assigned-size-ranges', userId],
    queryFn: async () => {
      if (!userId) return null;

      // Check if user has select_all_size_ranges enabled
      const { data: profileData } = await supabase
        .from('terminal_user_profiles')
        .select('select_all_size_ranges')
        .eq('user_id', userId)
        .maybeSingle();

      if (profileData?.select_all_size_ranges) {
        // User has "Select All" — return ALL active size ranges (bypasses individual mappings)
        const { data: allRanges } = await supabase
          .from('terminal_order_size_ranges')
          .select('id, name, min_amount, max_amount')
          .eq('is_active', true);
        return allRanges && allRanges.length > 0 ? allRanges : null;
      }

      // Source 1: terminal_user_size_range_mappings (set via User Config dialog)
      const { data: directMappings } = await supabase
        .from('terminal_user_size_range_mappings')
        .select('size_range_id')
        .eq('user_id', userId);

      // Source 2: terminal_payer_assignments (set via Payer Assignment manager)
      const { data: payerAssignments } = await supabase
        .from('terminal_payer_assignments')
        .select('size_range_id')
        .eq('payer_user_id', userId)
        .eq('assignment_type', 'size_range')
        .eq('is_active', true);

      // Source 3: terminal_operator_assignments (set via Operator Assignment manager)
      const { data: operatorAssignments } = await supabase
        .from('terminal_operator_assignments' as any)
        .select('size_range_id')
        .eq('operator_user_id', userId)
        .eq('assignment_type', 'size_range')
        .eq('is_active', true);

      const rangeIdSet = new Set<string>();
      (directMappings || []).forEach(m => { if (m.size_range_id) rangeIdSet.add(m.size_range_id); });
      (payerAssignments || []).forEach(a => { if (a.size_range_id) rangeIdSet.add(a.size_range_id); });
      ((operatorAssignments as any[]) || []).forEach(a => { if (a.size_range_id) rangeIdSet.add(a.size_range_id); });

      if (rangeIdSet.size === 0) return null;

      const { data: ranges } = await supabase
        .from('terminal_order_size_ranges')
        .select('id, name, min_amount, max_amount')
        .in('id', Array.from(rangeIdSet));

      return ranges && ranges.length > 0 ? ranges : null;
    },
    enabled: !!userId,
    staleTime: 60 * 1000,
  });

  // Fetch user's ad ID assignments from operator assignments
  const { data: userAdIdAssignments } = useQuery({
    queryKey: ['user-operator-ad-assignments', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase
        .from('terminal_operator_assignments' as any)
        .select('ad_id')
        .eq('operator_user_id', userId)
        .eq('assignment_type', 'ad_id')
        .eq('is_active', true);
      const adIds = ((data as any[]) || []).map((a: any) => a.ad_id).filter(Boolean) as string[];
      return adIds.length > 0 ? adIds : null;
    },
    enabled: !!userId,
    staleTime: 60 * 1000,
  });

  const {
    data: activeOrdersData,
    isLoading: activeLoading,
    refetch: refetchActive,
    isFetching: isFetchingActive,
  } = useBinanceActiveOrders();

  const {
    data: historyOrders = [],
    isLoading: historyLoading,
    refetch: refetchHistory,
    isFetching: isFetchingHistory,
  } = useBinanceOrderHistory();

  const syncOrders = useSyncOrders();
  const syncOrdersBatch = useSyncOrdersBatch();
  const syncFingerprintRef = useRef<Map<string, string>>(new Map());

  // Fetch pending alternate UPI requests for highlighting
  const { data: pendingAltUpiRequests = [] } = useAlternateUpiRequests('pending');
  const pendingAltUpiOrderNumbers = useMemo(() => {
    return new Set(pendingAltUpiRequests.map((r: any) => r.order_number));
  }, [pendingAltUpiRequests]);

  // Derive a minimal time window from ACTIVE orders.
  // Reason: Binance can keep returning an order in listOrders with numeric status=4
  // even after it is COMPLETED in listUserOrderHistory. We must use history as source-of-truth.
  const activeOldestCreateTime = useMemo(() => {
    const d = (activeOrdersData as any)?.data ?? activeOrdersData;
    const list = Array.isArray(d) ? d : [];
    let min = Number.POSITIVE_INFINITY;
    for (const o of list) {
      const t = typeof o?.createTime === 'number' ? o.createTime : Number(o?.createTime);
      if (Number.isFinite(t) && t > 0) min = Math.min(min, t);
    }
    return Number.isFinite(min) ? min : null;
  }, [activeOrdersData]);

  const recentHistoryWindowStart = useMemo(() => {
    // pull a small buffer before the oldest active order so we always catch it in history
    // IMPORTANT: keep this window as tight as possible; too-broad windows can push relevant rows
    // out of paginated history fetches and leave stale statuses unresolved.
    const fallback = Date.now() - 7 * 24 * 60 * 60 * 1000;
    if (!activeOldestCreateTime) return fallback;
    return Math.max(activeOldestCreateTime - 6 * 60 * 60 * 1000, fallback);
  }, [activeOldestCreateTime]);

  // Lightweight history fetch (multi-page) to catch terminal statuses for the currently active window.
  const { data: recentHistory = [], refetch: refetchRecent, isFetching: isFetchingRecent } = useQuery({
    queryKey: ['binance-order-history-recent', Math.floor(recentHistoryWindowStart / (60 * 60 * 1000))],
    queryFn: async () => {
      const startTimestamp = recentHistoryWindowStart;
      const endTimestamp = Date.now();

      // Robust extraction: the edge function may return different wrappers depending on action.
      const extractItems = (response: unknown): any[] => {
        if (!response || typeof response !== 'object') return [];
        if (Array.isArray(response)) return response;
        const r = response as Record<string, any>;
        if (Array.isArray(r.data)) return r.data;
        if (Array.isArray(r.items)) return r.items;
        if (Array.isArray(r.results)) return r.results;
        if (r.data && typeof r.data === 'object') {
          const d = r.data as Record<string, any>;
          if (Array.isArray(d.data)) return d.data;
          if (Array.isArray(d.items)) return d.items;
          if (Array.isArray(d.results)) return d.results;
        }
        return [];
      };

      const maxPages = 3; // Reduced from 10 – covers most active-window statuses
      const rows = 50;
      const all: any[] = [];
      const seen = new Set<string>();

      for (let page = 1; page <= maxPages; page++) {
        const data = await callBinanceAds('getOrderHistory', {
          rows,
          page,
          startTimestamp,
          endTimestamp,
        });
        const items = extractItems(data);
        if (!Array.isArray(items) || items.length === 0) break;

        for (const o of items) {
          const orderNumber = o?.orderNumber === undefined || o?.orderNumber === null ? '' : String(o.orderNumber);
          if (!orderNumber) continue;
          if (seen.has(orderNumber)) continue;
          seen.add(orderNumber);
          all.push({ ...o, orderNumber });
        }

        if (items.length < rows) break;
        await new Promise(r => setTimeout(r, 50));
      }

      return all;
    },
    staleTime: 25 * 1000,
    // Each run walks up to 3 pages of Binance history. At 15s that queued up
    // behind the 5s active-order poll on the same proxy and made the page
    // stutter; 30s (paused when hidden) keeps statuses fresh without the churn.
    refetchInterval: pollWhenVisible(30 * 1000),
    placeholderData: (prev: any) => prev,
  });

  // Only show loading if BOTH sources are still loading
  const isLoading = activeLoading && historyLoading;
  const isRefreshing = isFetchingActive || isFetchingHistory || isFetchingRecent;

  // Merge active orders + history orders, deduplicating by orderNumber
  // NOTE: Binance order numbers exceed JS safe integer range, so ALWAYS treat them as strings.
  const rawOrders: any[] = useMemo(() => {
    const orderMap = new Map<string, any>();

    const normalizeOrderNumber = (v: unknown) => (v === undefined || v === null ? '' : String(v));

    // Active orders first (they have richer data like chatUnreadCount)
    // Filter out truly finalized status codes that Binance may still return in listOrders
    // Binance C2C numeric status codes (verified against live API):
    //   1=TRADING/PENDING, 2=BUYER_PAYED, 4=COMPLETED, 5=APPEAL,
    //   6=CANCELLED, 7=CANCELLED_BY_SYSTEM
    // Only 4 (COMPLETED) and 6/7 (CANCELLED) are truly finalized.
    // Status 1/2 (active) and 5 (APPEAL) must remain visible in the terminal.
    const FINALIZED_CODES = new Set(['4', '6', '7']);
    const d = (activeOrdersData as any)?.data ?? activeOrdersData;
    const activeList = Array.isArray(d) ? d : [];
    for (const o of activeList) {
      const orderNumber = normalizeOrderNumber(o?.orderNumber);
      if (!orderNumber) continue;
      // Skip only truly finalized statuses (Completed=4, Cancelled=6/7); keep appeals (5)
      if (FINALIZED_CODES.has(String(o.orderStatus))) continue;
      // Keep a string-typed orderNumber on the object to avoid Map/key mismatches later
      orderMap.set(orderNumber, { ...o, orderNumber, _isActiveOrder: true });
    }

    // Then fill in from history (won't overwrite active orders)
    if (Array.isArray(historyOrders)) {
      for (const o of historyOrders as any[]) {
        const orderNumber = normalizeOrderNumber(o?.orderNumber);
        if (!orderNumber || orderMap.has(orderNumber)) continue;

        orderMap.set(orderNumber, {
          orderNumber,
          advNo: o.advNo,
          tradeType: o.tradeType,
          asset: o.asset || 'USDT',
          fiat: o.fiat || o.fiatUnit || 'INR',
          amount: o.amount,
          totalPrice: o.totalPrice,
          unitPrice: o.unitPrice,
          commission: o.commission,
          orderStatus: o.orderStatus,
          createTime: o.createTime,
          payMethodName: o.payMethodName,
          counterPartNickName: o.counterPartNickName,
          buyerNickname: o.tradeType === 'SELL' ? o.counterPartNickName : undefined,
          sellerNickname: o.tradeType === 'BUY' ? o.counterPartNickName : undefined,
          additionalKycVerify: o.additionalKycVerify ?? 0,
          _exchangeAccountId: o._exchangeAccountId ?? null,
        });
      }
    }

    // Finally merge the LIVE recent-history feed (polled every 15s). This is the
    // authoritative, up-to-the-minute source for orders that just reached a terminal
    // state (completed/cancelled/appeal) but are NOT yet in the locally-synced DB
    // (binance_order_history is only refreshed by the dashboard background sync).
    // Without this, freshly finalized orders don't reflect on the Orders page until
    // that 5-minute sync runs. Merging here surfaces them within ~15s.
    if (Array.isArray(recentHistory)) {
      for (const o of recentHistory as any[]) {
        const orderNumber = normalizeOrderNumber(o?.orderNumber);
        if (!orderNumber || orderMap.has(orderNumber)) continue;

        orderMap.set(orderNumber, {
          orderNumber,
          advNo: o.advNo,
          tradeType: o.tradeType,
          asset: o.asset || 'USDT',
          fiat: o.fiat || o.fiatUnit || 'INR',
          amount: o.amount,
          totalPrice: o.totalPrice,
          unitPrice: o.unitPrice,
          commission: o.commission,
          orderStatus: o.orderStatus,
          createTime: o.createTime,
          payMethodName: o.payMethodName,
          counterPartNickName: o.counterPartNickName,
          buyerNickname: o.tradeType === 'SELL' ? o.counterPartNickName : undefined,
          sellerNickname: o.tradeType === 'BUY' ? o.counterPartNickName : undefined,
          additionalKycVerify: o.additionalKycVerify ?? 0,
          _exchangeAccountId: o._exchangeAccountId ?? null,
        });
      }
    }

    // Sort by createTime descending
    return Array.from(orderMap.values()).sort((a, b) => (b.createTime || 0) - (a.createTime || 0));
  }, [activeOrdersData, historyOrders, recentHistory]);

  // ---- On-demand direct order lookup ----
  // The local search only filters over the currently-loaded set (active orders +
  // recent/synced history within a limited window). When an operator pastes a full
  // Binance order number that is older than that window (or already terminal), it
  // simply won't be present locally and the page shows "No orders found".
  // To fix this at the root, when the search term is a full numeric order number
  // that is NOT already loaded, fetch it directly from Binance via getOrderDetail
  // (which already searches across all configured accounts) and merge it in,
  // bypassing the status/date/trade filters so it always surfaces.
  const debouncedSearch = useDebounce(search.trim(), 400);
  const deepLinkedOrderNumber = searchParams.get('order')?.trim() || '';
  const lookupOrderNumber = /^\d{12,}$/.test(deepLinkedOrderNumber) ? deepLinkedOrderNumber : debouncedSearch;
  const isFullOrderNumber = /^\d{12,}$/.test(lookupOrderNumber);
  const alreadyLoaded = useMemo(
    () => rawOrders.some((o: any) => String(o.orderNumber) === lookupOrderNumber),
    [rawOrders, lookupOrderNumber],
  );
  const { data: directOrder, isFetching: isFetchingDirectOrder } = useQuery({
    queryKey: ['binance-direct-order-lookup', lookupOrderNumber, activeAccountId],
    // Deep links must always verify the exact order/account before opening chat.
    enabled: isFullOrderNumber && (!!deepLinkedOrderNumber || !alreadyLoaded),
    staleTime: 30 * 1000,
    retry: false,
    queryFn: async () => {
      try {
        // Scope the lookup to the currently-selected account. When a specific
        // Binance account is active (not "All"), only query that account so an
        // order that belongs to another account never surfaces in the terminal.
        const scopedAccountId = isAllAccounts ? undefined : activeAccountId;
        const response = await callBinanceAds('getOrderDetail', { orderNumber: lookupOrderNumber }, scopedAccountId);
        const detail = response?.data?.data || response?.data || response;
        if (!detail || detail.error) return null;
        const resolvedAccountId = response?._resolvedExchangeAccountId ?? response?._exchangeAccountId ?? detail._exchangeAccountId ?? null;
        // Hard guard: if a specific account is active and the order actually
        // belongs to a different account, drop it. It must only reflect under
        // its own Binance ID (or when "All accounts" is selected).
        if (!isAllAccounts && resolvedAccountId && resolvedAccountId !== activeAccountId) {
          return null;
        }
        const orderNumber = String(detail.orderNumber ?? lookupOrderNumber);
        const nick = detail.counterPartNickName
          || (detail.tradeType === 'BUY' ? (detail.sellerNickName || detail.sellerNickname) : (detail.buyerNickName || detail.buyerNickname));
        return {
          orderNumber,
          advNo: detail.advNo || detail.advOrderNumber || null,
          tradeType: detail.tradeType,
          asset: detail.asset || 'USDT',
          fiat: detail.fiatUnit || detail.fiat || 'INR',
          amount: detail.amount,
          totalPrice: detail.totalPrice,
          unitPrice: detail.unitPrice || detail.price,
          commission: detail.commission,
          orderStatus: detail.orderStatus,
          createTime: detail.createTime,
          payMethodName: detail.payMethodName || detail.selectedPayId || null,
          counterPartNickName: nick,
          buyerNickname: detail.tradeType === 'SELL' ? nick : undefined,
          sellerNickname: detail.tradeType === 'BUY' ? nick : undefined,
          additionalKycVerify: detail.additionalKycVerify ?? 0,
          raw_data: detail,
          _exchangeAccountId: resolvedAccountId,
          _isDirectLookup: true,
        };
      } catch {
        return null;
      }
    },
  });



  // Build a map of order history statuses for enrichment
  const historyStatusMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of historyOrders as any[]) {
      const orderNumber = o?.orderNumber === undefined || o?.orderNumber === null ? '' : String(o.orderNumber);
      if (orderNumber && o?.orderStatus !== undefined && o?.orderStatus !== null) {
        map.set(orderNumber, normaliseBinanceStatus(o.orderStatus));
      }
    }
    return map;
  }, [historyOrders]);

  // Build a map of unread chat counts from active orders
  const unreadMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of rawOrders) {
      if (o.chatUnreadCount > 0 && !isOrderChatRead(o.orderNumber)) {
        map.set(o.orderNumber, o.chatUnreadCount);
      }
    }
    return map;
  }, [rawOrders, chatReadVersion]);

  const totalUnread = useMemo(() =>
    Array.from(unreadMap.values()).reduce((s, v) => s + v, 0), [unreadMap]);

  // Chat button badge: use the inbox's own unread thread count so enquiries and
  // older/closed-order chats are reflected, not only the loaded live orders.
  const inboxUnread = useChatInboxUnread();
  const chatBadgeCount = Math.max(inboxUnread, unreadMap.size);

  // Internal chat unread counts

  // Background sync to local DB (fire-and-forget) — change-detected + batched.
  // Only orders whose full payload fingerprint is new/changed are sent, in ONE
  // batch RPC. First mount (empty map) syncs the full list once, matching the
  // previous behavior. Dep is [rawOrders] (array identity) not [rawOrders.length]
  // so status changes with unchanged count are no longer missed.
  useEffect(() => {
    if (rawOrders.length === 0 || syncOrdersBatch.isPending) return;

    const items = rawOrders.map(toSyncItem);
    const map = syncFingerprintRef.current;
    const changed: typeof items = [];
    const nextFingerprints: Array<[string, string]> = [];

    for (const it of items) {
      const fp = [
        it.orderNumber,
        it.advNo || null,
        it.counterPartNickName || 'Unknown',
        it.tradeType,
        it.asset || 'USDT',
        it.fiatUnit || 'INR',
        parseFloat(it.amount || '0'),
        parseFloat(it.totalPrice || '0'),
        parseFloat(it.unitPrice || '0'),
        parseFloat(it.commission || '0'),
        it.orderStatus || 'TRADING',
        it.payMethodName || null,
        it.createTime || 0,
      ].join('|');
      const key = String(it.orderNumber);
      nextFingerprints.push([key, fp]);
      if (map.get(key) !== fp) changed.push(it);
    }

    if (changed.length === 0) return;

    syncOrdersBatch.mutate(changed);
    for (const [key, fp] of nextFingerprints) map.set(key, fp);
  }, [rawOrders]);


  // Sync recentHistory status updates to local binance_order_history table
  // This fixes stale statuses where orders completed but the local DB wasn't updated
  const recentHistoryRef = useRef<any[]>([]);
  useEffect(() => {
    const items = recentHistory as any[];
    if (!items || items.length === 0) return;
    // Only run when recentHistory actually changes (compare length + first item)
    if (items.length === recentHistoryRef.current.length && items[0]?.orderNumber === recentHistoryRef.current[0]?.orderNumber) return;
    recentHistoryRef.current = items;

    // Fire-and-forget: update binance_order_history for any status that progressed
    (async () => {
      let completedUpdates = 0;
      for (const o of items) {
        const orderNumber = String(o?.orderNumber || '');
        const newStatus = normaliseBinanceStatus(o?.orderStatus);
        if (!orderNumber || !newStatus) continue;
        // Only update if status is terminal (COMPLETED, CANCELLED, APPEAL) — avoid unnecessary writes
        if (!['COMPLETED', 'CANCELLED', 'APPEAL'].includes(newStatus)) continue;
        try {
          const { count } = await supabase
            .from('binance_order_history')
            .update({ order_status: newStatus, synced_at: new Date().toISOString() })
            .eq('order_number', orderNumber)
            .neq('order_status', newStatus);
          // Check if we got a response (update happened)
          if (newStatus === 'COMPLETED') completedUpdates++;
        } catch {
          // Ignore — best-effort sync
        }
      }
      // If any orders transitioned to COMPLETED, trigger ERP sync
      if (completedUpdates > 0) {
        try {
          await syncCompletedBuyOrders();
          await syncCompletedSellOrders();
          queryClient.invalidateQueries({ queryKey: ['terminal-purchase-sync'] });
          queryClient.invalidateQueries({ queryKey: ['terminal-sales-sync'] });
          queryClient.invalidateQueries({ queryKey: ['terminal-sync-pending-count'] });
          queryClient.invalidateQueries({ queryKey: ['terminal-sales-sync-pending-count'] });
        } catch {
          // Best-effort ERP sync
        }
      }
    })();
  }, [recentHistory]);

  // Build a map of *recent* order history statuses (fast) for enrichment
  const recentStatusMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of recentHistory as any[]) {
      if (o?.orderNumber && o?.orderStatus !== undefined && o?.orderStatus !== null) {
        map.set(String(o.orderNumber), normaliseBinanceStatus(o.orderStatus));
      }
    }
    return map;
  }, [recentHistory]);

  // Some Binance "active" rows can remain stale for older orders.
  // Revalidate older active-like orders via getOrderDetail (authoritative single-order status).
  const staleRecheckCandidates = useMemo(() => {
    const now = Date.now();
    const maxOrders = 12;
    const minAgeMs = 30 * 60 * 1000; // 30 minutes (reduced from 6h to catch stale statuses faster)

    const activeLike = rawOrders.filter((o: any) => {
      const status = mapOrderStatusCode(o?.orderStatus);
      const upper = (status || '').toUpperCase();
      const isActiveLike =
        upper.includes('PENDING') ||
        upper.includes('TRADING') ||
        upper.includes('BUYER_PAYED') ||
        upper.includes('BUYER_PAID') ||
        upper.includes('RELEASING') ||
        upper.includes('APPEAL') ||
        upper.includes('DISPUTE');
      if (!isActiveLike) return false;
      const created = typeof o?.createTime === 'number' ? o.createTime : Number(o?.createTime || 0);
      return Number.isFinite(created) && created > 0 && now - created >= minAgeMs;
    });

    return activeLike
      .sort((a: any, b: any) => (a?.createTime || 0) - (b?.createTime || 0))
      .slice(0, maxOrders)
      .map((o: any) => ({
        orderNumber: String(o.orderNumber),
        createTime: Number(o?.createTime || 0),
        tradeType: (String(o?.tradeType || '').toUpperCase() === 'SELL' ? 'SELL' : 'BUY') as 'BUY' | 'SELL',
      }));
  }, [rawOrders]);

  const { data: staleDetailStatusMap = {} } = useQuery({
    queryKey: ['binance-stale-active-status-recheck', staleRecheckCandidates.map(c => `${c.orderNumber}:${c.createTime}`).join(',')],
    queryFn: async () => {
      const next: Record<string, string> = {};
      const stillActiveLike: Array<{ orderNumber: string; createTime: number; tradeType: 'BUY' | 'SELL' }> = [];

      for (const candidate of staleRecheckCandidates) {
        const { orderNumber } = candidate;
        try {
          const response = await callBinanceAds('getOrderDetail', { orderNumber });
          const detail = response?.data || response;
          const rawStatus = detail?.orderStatus ?? detail?.status;
          if (rawStatus === undefined || rawStatus === null) continue;
          const normalised = normaliseBinanceStatus(rawStatus);
          next[orderNumber] = normalised;
          // getOrderDetail can stay stale (BUYER_PAYED/APPEAL) for appeal-resolved orders.
          // Track these for targeted cross-verification via order history API.
          if (normalised === 'BUYER_PAYED' || normalised === 'BUYER_PAID' || normalised === 'APPEAL' || normalised === 'DISPUTE') {
            stillActiveLike.push(candidate);
          }
        } catch {
          // Best-effort recheck only
        }

        await new Promise((resolve) => setTimeout(resolve, 120));
      }

      // Cross-verify stale active-like orders against listUserOrderHistory using
      // tight per-order time windows. This catches old appeal-resolved orders
      // that are no longer present in first-page history.
      if (stillActiveLike.length > 0) {
        try {
          for (const candidate of stillActiveLike) {
            const windows = [
              {
                startTimestamp: Math.max(0, candidate.createTime - 6 * 60 * 60 * 1000),
                endTimestamp: candidate.createTime + 6 * 60 * 60 * 1000,
              },
              {
                startTimestamp: Math.max(0, candidate.createTime - 24 * 60 * 60 * 1000),
                endTimestamp: candidate.createTime + 24 * 60 * 60 * 1000,
              },
            ];

            let matched = false;

            for (const w of windows) {
              const histResp = await callBinanceAds('getOrderHistory', {
                tradeType: candidate.tradeType,
                page: 1,
                rows: 50,
                startTimestamp: w.startTimestamp,
                endTimestamp: w.endTimestamp,
              });

              const histData = histResp?.data || histResp;
              const orders = Array.isArray(histData) ? histData : (histData?.data || []);
              const hit = (orders || []).find((ho: any) => String(ho?.orderNumber || '') === candidate.orderNumber);

              if (hit) {
                const hs = normaliseBinanceStatus(hit?.orderStatus);
                if (hs.includes('COMPLETED') || hs.includes('CANCEL') || hs.includes('EXPIRED') || hs.includes('APPEAL') || hs.includes('DISPUTE')) {
                  next[candidate.orderNumber] = hs;
                }
                matched = true;
                break;
              }

              await new Promise((r) => setTimeout(r, 120));
            }

            if (!matched) {
              // Fallback: check first page without timestamps in case API ignores narrow windows
              const histResp = await callBinanceAds('getOrderHistory', {
                tradeType: candidate.tradeType,
                page: 1,
                rows: 50,
              });
              const histData = histResp?.data || histResp;
              const orders = Array.isArray(histData) ? histData : (histData?.data || []);
              const hit = (orders || []).find((ho: any) => String(ho?.orderNumber || '') === candidate.orderNumber);
              if (hit) {
                const hs = normaliseBinanceStatus(hit?.orderStatus);
                if (hs.includes('COMPLETED') || hs.includes('CANCEL') || hs.includes('EXPIRED') || hs.includes('APPEAL') || hs.includes('DISPUTE')) {
                  next[candidate.orderNumber] = hs;
                }
              }
            }

            await new Promise((r) => setTimeout(r, 120));
          }
        } catch {
          // Best-effort cross-verification
        }
      }

      return next;
    },
    enabled: staleRecheckCandidates.length > 0,
    staleTime: 2 * 60 * 1000,
    // This is by far the heaviest poll: one getOrderDetail per candidate plus
    // history cross-checks. Every 30s it saturated the proxy. Stale statuses are
    // an edge case, so recheck every 3 minutes and only while the tab is visible.
    refetchInterval: pollWhenVisible(3 * 60 * 1000),
    placeholderData: (prev: any) => prev,
  });

  // Persist authoritative terminal statuses discovered by stale recheck.
  useEffect(() => {
    const entries = Object.entries(staleDetailStatusMap || {}).filter(([, status]) => {
      const upper = (status || '').toUpperCase();
      return upper.includes('COMPLETED') || upper.includes('CANCEL') || upper.includes('APPEAL') || upper.includes('EXPIRED');
    });
    if (entries.length === 0) return;

    (async () => {
      for (const [orderNumber, status] of entries) {
        try {
          await supabase
            .from('binance_order_history')
            .update({ order_status: status, synced_at: new Date().toISOString() })
            .eq('order_number', orderNumber)
            .neq('order_status', status);

          await supabase
            .from('p2p_order_records')
            .update({ order_status: status, synced_at: new Date().toISOString() })
            .eq('binance_order_number', orderNumber)
            .neq('order_status', status);
        } catch {
          // Best-effort persistence
        }
      }
    })();
  }, [staleDetailStatusMap]);

  // Convert to display records, enrich with history status, and apply filters
  const displayOrders: P2POrderRecord[] = useMemo(() => {
    const TERMINAL_STATUSES = ['COMPLETED', 'CANCELLED', 'APPEAL', 'EXPIRED'];
    // Define status progression order — higher index = more advanced
      const STATUS_RANK: Record<string, number> = {
      'PENDING': 0,
      'TRADING': 1,
      'BUYER_PAYED': 2,
      'BUYER_PAID': 2,
        'APPEAL': 2,
        'DISPUTE': 2,
        'COMPLETED': 3,
        'CANCELLED': 3,
        'EXPIRED': 3,
    };
    const getRank = (s: string): number => {
      const upper = (s || '').toUpperCase();
      for (const [key, rank] of Object.entries(STATUS_RANK)) {
        if (upper.includes(key)) return rank;
      }
      return 0;
    };

    let enriched = rawOrders.map(o => {
      const orderNumber = o?.orderNumber === undefined || o?.orderNumber === null ? '' : String(o.orderNumber);

      const liveStatus = extractAppealStatusFromRaw(o.raw_data) || mapOrderStatusCode(o.orderStatus);
      const recentStatus = orderNumber ? recentStatusMap.get(orderNumber) : undefined;
      const historyStatus = orderNumber ? historyStatusMap.get(orderNumber) : undefined;
      const staleDetailStatus = orderNumber ? staleDetailStatusMap[orderNumber] : undefined;
      // Locally recorded status from an authoritative action we just performed
      // (e.g. a successful release) — used only until the live feed catches up.
      const optimisticStatus = orderNumber ? getOptimisticOrderStatus(orderNumber) : undefined;
      if (optimisticStatus) {
        const liveRank = Math.max(
          getRank(liveStatus),
          recentStatus ? getRank(recentStatus) : 0,
          historyStatus ? getRank(historyStatus) : 0,
          staleDetailStatus ? getRank(staleDetailStatus) : 0,
        );
        if (liveRank >= getRank(optimisticStatus)) clearOptimisticOrderStatus(orderNumber);
      }

      // Prefer the most advanced status from any source
      const candidates = [
        { status: liveStatus, rank: getRank(liveStatus) },
        ...(recentStatus ? [{ status: recentStatus, rank: getRank(recentStatus) }] : []),
        ...(historyStatus ? [{ status: historyStatus, rank: getRank(historyStatus) }] : []),
        ...(staleDetailStatus ? [{ status: staleDetailStatus, rank: getRank(staleDetailStatus) }] : []),
        ...(optimisticStatus ? [{ status: optimisticStatus, rank: getRank(optimisticStatus) }] : []),
      ];
      // Pick the candidate with the highest rank (most progressed in lifecycle)
      const best = candidates.reduce((a, b) => b.rank > a.rank ? b : a, candidates[0]);
      const resolvedStatus = best.status;

      return { ...o, orderNumber, _resolvedStatus: resolvedStatus };
    });

    if (tradeFilter !== 'all') {
      enriched = enriched.filter(o => o.tradeType === tradeFilter);
    }

    if (statusFilter !== 'all') {
      enriched = enriched.filter(o => {
        const op = mapToOperationalStatus(o._resolvedStatus, o.tradeType || 'BUY');
        if (statusFilter === 'active') return op !== 'Completed' && op !== 'Cancelled' && op !== 'Expired';
        if (statusFilter === 'completed') return op === 'Completed';
        if (statusFilter === 'cancelled') return op === 'Cancelled';
        return true;
      });
    }

    // Active sub-filter + counts are applied at the END (after search, date
    // range, scope and assignment filters) so the tab badges always match the
    // orders the operator can actually see.

    if (search) {
      const q = search.toLowerCase();
      enriched = enriched.filter(o => {
        const nick = o.tradeType === 'BUY' ? o.sellerNickname : o.buyerNickname;
        return (nick || '').toLowerCase().includes(q) || (o.orderNumber || '').includes(q);
      });
    }

    // Filter by selected date range (based on Binance order create time)
    if (dateRange?.from) {
      const fromMs = new Date(dateRange.from.getFullYear(), dateRange.from.getMonth(), dateRange.from.getDate()).getTime();
      const toRef = dateRange.to ?? dateRange.from;
      const toMs = new Date(toRef.getFullYear(), toRef.getMonth(), toRef.getDate(), 23, 59, 59, 999).getTime();
      enriched = enriched.filter(o => {
        const t = Number(o.createTime) || 0;
        return t >= fromMs && t <= toMs;
      });
    }

    const allRecords = enriched.map(o => {
      const record = binanceToOrderRecord(o);
      record.order_status = o._resolvedStatus;
      (record as any).exchange_account_id = o._exchangeAccountId ?? null;
      return record;
    });

    let filtered = allRecords;

    // Filter by user's assigned size ranges and/or ad IDs (non-admins only)
    if (!isTerminalAdmin && (userSizeRanges?.length || userAdIdAssignments?.length)) {
      filtered = filtered.filter(r => {
        // Check size range match
        if (userSizeRanges && userSizeRanges.length > 0) {
          const price = r.total_price || 0;
          const rangeMatch = userSizeRanges.some(range => {
            const min = range.min_amount ?? 0;
            const max = range.max_amount;
            return price >= min && (max === null || max === undefined || price <= max);
          });
          if (rangeMatch) return true;
        }
        // Check ad ID match
        if (userAdIdAssignments && userAdIdAssignments.length > 0) {
          const advNo = r.binance_adv_no || '';
          if (userAdIdAssignments.includes(advNo)) return true;
        }
        return false;
      });
    }

    // Apply jurisdiction + assignment filter
    if (assignmentFilter !== 'all') {
      filtered = filtered.filter(r => {
        const vis = getOrderVisibility(r.binance_order_number);
        if (assignmentFilter === 'mine') {
          // Show explicitly assigned orders AND scope-matched orders (fallback)
          if (vis === 'assigned_to_me') return true;
          // If unassigned, check if it falls within my operator scope (size range or ad ID)
          if (vis === 'unassigned' && !isTerminalAdmin) {
            const price = r.total_price || 0;
            const advNo = r.binance_adv_no || '';
            const scopeMatch = (userSizeRanges && userSizeRanges.length > 0 && userSizeRanges.some(range => {
              const min = range.min_amount ?? 0;
              const max = range.max_amount;
              return price >= min && (max === null || max === undefined || price <= max);
            })) || (userAdIdAssignments && userAdIdAssignments.length > 0 && userAdIdAssignments.includes(advNo));
            return !!scopeMatch;
          }
          return false;
        }
        if (assignmentFilter === 'team') return vis === 'assigned_to_team';
        if (assignmentFilter === 'unassigned') return vis === 'unassigned';
        return true;
      });
    }

    // Tally Active sub-filter counts from the fully filtered list (search,
    // date range, scope and assignment all applied) so badges match the rows.
    if (statusFilter === 'active') {
      const counts = { all: filtered.length, unpaid: 0, paid: 0, appeal: 0 };
      for (const r of filtered) {
        const op = mapToOperationalStatus(r.order_status || '', r.trade_type || 'BUY');
        if (op === 'Pending Payment') counts.unpaid++;
        else if (op === 'Releasing' || op === 'Pending Release') counts.paid++;
        else if (op === 'Under Appeal') counts.appeal++;
      }
      activeSubCountsRef.current = counts;
    }

    // Active sub-filter: Unpaid (Pending Payment), Paid (buyer paid, awaiting release), Appeal
    if (statusFilter === 'active' && activeSubFilter !== 'all') {
      filtered = filtered.filter(r => {
        const op = mapToOperationalStatus(r.order_status || '', r.trade_type || 'BUY');
        if (activeSubFilter === 'unpaid') return op === 'Pending Payment';
        if (activeSubFilter === 'paid') return op === 'Releasing' || op === 'Pending Release';
        if (activeSubFilter === 'appeal') return op === 'Under Appeal';
        return true;
      });
    }

    // Sort: appeal/dispute orders go to the bottom; rest stay chronological (newest first)
    if (statusFilter === 'active' || statusFilter === 'all') {
      filtered.sort((a, b) => {
        const aIsAppeal = (a.order_status || '').toUpperCase().includes('APPEAL') || (a.order_status || '').toUpperCase().includes('DISPUTE');
        const bIsAppeal = (b.order_status || '').toUpperCase().includes('APPEAL') || (b.order_status || '').toUpperCase().includes('DISPUTE');
        if (aIsAppeal && !bIsAppeal) return 1;
        if (!aIsAppeal && bIsAppeal) return -1;
        return 0;
      });
    }

    // Merge in the on-demand direct order lookup result when searching for a full
    // order number that isn't present locally. Bypasses status/date/trade filters so
    // the operator always sees the order they explicitly searched for.
    if (directOrder && lookupOrderNumber && !filtered.some(r => r.binance_order_number === directOrder.orderNumber)) {
      const record = binanceToOrderRecord(directOrder);
      record.order_status = extractAppealStatusFromRaw(directOrder.raw_data) || mapOrderStatusCode(directOrder.orderStatus);
      (record as any).exchange_account_id = directOrder._exchangeAccountId ?? null;
      filtered = [record, ...filtered];
    }

    return filtered;
  }, [rawOrders, tradeFilter, statusFilter, activeSubFilter, assignmentFilter, search, lookupOrderNumber, directOrder, dateRange, historyStatusMap, recentStatusMap, staleDetailStatusMap, optimisticStatusVersion, getOrderVisibility, isTerminalAdmin, userSizeRanges, userAdIdAssignments]);

  // Reset visible count when filters change
  useEffect(() => { setVisibleCount(50); }, [tradeFilter, statusFilter, activeSubFilter, search, dateRange]);

  // Infinite scroll: load more when scrolling near bottom
  const loadMoreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && visibleCount < displayOrders.length) {
          setVisibleCount(prev => Math.min(prev + 50, displayOrders.length));
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visibleCount, displayOrders.length]);

  const visibleOrders = useMemo(() => displayOrders.slice(0, visibleCount), [displayOrders, visibleCount]);

  // Actionable / appeal order IDs (derived from already-computed displayOrders) —
  // feed the tab-scoped alert engine. Reuses the same "active" predicate as the
  // Active status tab (op is not Completed/Cancelled/Expired).
  const actionableOrderIds = useMemo(
    () => displayOrders
      .filter((o) => {
        const op = mapToOperationalStatus((o as any)._resolvedStatus || o.order_status, o.trade_type);
        return !['Completed', 'Cancelled', 'Expired'].includes(op);
      })
      .map((o) => o.binance_order_number),
    [displayOrders],
  );
  const appealOrderIds = useMemo(
    () => displayOrders
      .filter((o) => {
        const s = (o.order_status || '').toUpperCase();
        return s.includes('APPEAL') || s.includes('DISPUTE');
      })
      .map((o) => o.binance_order_number),
    [displayOrders],
  );
  useTerminalAlerts({ actionableOrderIds, appealOrderIds, unreadMessageCount: totalUnread });

  // Deep-link: when arriving with ?order=<orderNumber> (e.g. from the dashboard
  // Operational Alerts), auto-open that order's workspace once it's loaded.
  useEffect(() => {
    if (deepLinkHandledRef.current) return;
    const target = searchParams.get('order');
    if (!target) return;
    if (/^\d{12,}$/.test(target) && isFetchingDirectOrder) return;
    const directMatch = directOrder && String(directOrder.orderNumber) === target ? (() => {
      const record = binanceToOrderRecord(directOrder);
      record.order_status = extractAppealStatusFromRaw(directOrder.raw_data) || mapOrderStatusCode(directOrder.orderStatus);
      (record as any).exchange_account_id = directOrder._exchangeAccountId ?? null;
      return record;
    })() : null;
    const match = directMatch || displayOrders.find(
      o => String(o.binance_order_number) === target || String((o as any).orderNumber) === target,
    );
    if (match) {
      deepLinkHandledRef.current = true;
      restoreSettledRef.current = true;
      setSelectedOrder(match);
      // Strip the param so navigating back to the list doesn't re-open it.
      searchParams.delete('order');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, displayOrders, directOrder, isFetchingDirectOrder, setSearchParams]);


  const { data: releaseMonitorLogs = [] } = useQuery({
    queryKey: ['terminal-release-monitor-latest'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('p2p_release_deadline_monitor_log' as any)
        .select('order_number,status,minutes_overdue,confirm_pay_end_time,complain_freeze_time,checked_at,message')
        .order('checked_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as any[];
    },
    refetchInterval: pollWhenVisible(60000),
    placeholderData: (prev: any) => prev,
  });

  const releaseMonitorByOrder = useMemo(() => {
    const activeStatuses = new Set(['overdue', 'release_overdue', 'complaint_window_closing', 'complaint_window_expired', 'detail_unavailable']);
    const map = new Map<string, any>();
    for (const log of releaseMonitorLogs as any[]) {
      if (!log.order_number || map.has(log.order_number)) continue;
      if (activeStatuses.has(log.status)) map.set(log.order_number, log);
    }
    return map;
  }, [releaseMonitorLogs]);

  // Internal chat unread counts
  const internalChatOrderNumbers = useMemo(() => visibleOrders.map(o => o.binance_order_number), [visibleOrders]);
  const { data: internalUnreadMap = {} } = useInternalUnreadCounts(internalChatOrderNumbers);

  // Verified counterparty names (KYC) for the visible orders, keyed by order number.
  const verifiedNameOrderKey = useMemo(() => internalChatOrderNumbers.join(','), [internalChatOrderNumbers]);
  const { data: storedVerifiedNames = {} } = useQuery({
    queryKey: ['cp-verified-names', verifiedNameOrderKey, isAllAccounts ? 'all' : accountsToQuery.join(',')],
    enabled: internalChatOrderNumbers.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const map: Record<string, string> = {};
      // Chunk to stay within PostgREST `in` limits
      for (let i = 0; i < internalChatOrderNumbers.length; i += 100) {
        const chunk = internalChatOrderNumbers.slice(i, i + 100);
        let q = supabase
          .from('cp_order_identity')
          .select('order_number, verified_name, nickname')
          .in('order_number', chunk);
        if (!isAllAccounts && accountsToQuery.length > 0) {
          q = q.in('exchange_account_id', accountsToQuery);
        }
        const { data, error } = await q;
        if (error) { console.warn('Verified-name lookup failed:', error.message); continue; }
        for (const row of data || []) {
          const name = (row.verified_name || '').trim();
          if (name) map[row.order_number] = name;
        }
      }
      return map;
    },
  });

  // Freshly created orders are enriched by a background job, so their verified
  // KYC name can be missing from the database for several minutes. Resolve those
  // few rows straight from Binance order detail so the list never falls back to
  // showing only a nickname.
  const missingVerifiedOrders = useMemo(() => {
    const seen = new Set<string>();
    const out: { orderNumber: string; accountId?: string }[] = [];
    for (const order of visibleOrders) {
      const num = order.binance_order_number;
      if (!num || seen.has(num) || storedVerifiedNames[num]) continue;
      seen.add(num);
      out.push({ orderNumber: num, accountId: (order as any).exchange_account_id || undefined });
      if (out.length >= 8) break;
    }
    return out;
  }, [visibleOrders, storedVerifiedNames]);

  const { data: liveVerifiedNames = {} } = useQuery({
    queryKey: ['cp-verified-names-live', missingVerifiedOrders.map(o => o.orderNumber).join(',')],
    enabled: missingVerifiedOrders.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 0,
    queryFn: async () => {
      const map: Record<string, string> = {};
      const results = await Promise.allSettled(
        missingVerifiedOrders.map(async ({ orderNumber, accountId }) => {
          const response = await callBinanceAds('getOrderDetail', { orderNumber }, accountId);
          const detail = (response as any)?.data?.data ?? (response as any)?.data ?? response;
          const value = detail?.buyerRealName ?? detail?.buyerName ?? detail?.sellerRealName ?? detail?.sellerName ?? null;
          const name = typeof value === 'string' ? value.trim() : '';
          return { orderNumber, name };
        }),
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.name) map[r.value.orderNumber] = r.value.name;
      }
      return map;
    },
  });

  const verifiedNameMap = useMemo(
    () => ({ ...liveVerifiedNames, ...storedVerifiedNames }),
    [liveVerifiedNames, storedVerifiedNames],
  );


  // Helper: open chat for an order row directly — opens the full workspace
  const openChatForOrder = (order: P2POrderRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    markOrderChatRead(order.binance_order_number);
    supabase.rpc('mark_terminal_binance_chat_read', {
      p_order_number: order.binance_order_number,
      p_source: 'operator',
    }).then(({ error }) => {
      if (error) console.warn('Failed to record team chat read:', error.message);
    });
    callBinanceAds('markOrderMessagesRead', { orderNo: order.binance_order_number }).catch((err) => {
      console.warn('Failed to mark Binance chat read:', err);
    });
    setSelectedOrder(order);
  };

  useEffect(() => subscribeToChatReadState(() => setChatReadVersion(v => v + 1)), []);

  // Step to the prev/next order within the CURRENT filtered list and open its chat.
  const stepSelectedOrder = useCallback((direction: 1 | -1) => {
    setSelectedOrder((current) => {
      if (!current) return current;
      const idx = visibleOrders.findIndex(
        o => String(o.binance_order_number) === String(current.binance_order_number),
      );
      if (idx === -1) return current;
      const nextIdx = idx + direction;
      if (nextIdx < 0 || nextIdx >= visibleOrders.length) return current;
      const next = visibleOrders[nextIdx];
      markOrderChatRead(next.binance_order_number);
      supabase.rpc('mark_terminal_binance_chat_read', {
        p_order_number: next.binance_order_number,
        p_source: 'operator',
      }).then(({ error }) => {
        if (error) console.warn('Failed to record team chat read:', error.message);
      });
      callBinanceAds('markOrderMessagesRead', { orderNo: next.binance_order_number }).catch(() => {});
      return next;
    });
  }, [visibleOrders]);

  // Honor the ?view=queue param (used by the "g q" go-to sequence) to open Queue Mode.
  useEffect(() => {
    if (searchParams.get('view') === 'queue') {
      setQueueMode(true);
      const next = new URLSearchParams(searchParams);
      next.delete('view');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);



  // Central terminal context-key bus (from TerminalShortcutsProvider). No parallel
  // keydown listener — we react to already-filtered, page-scoped context keys.
  // Every handler only navigates, focuses, copies, or fires an existing
  // non-destructive click. Nothing money-moving is bound here.
  useEffect(() => subscribeTerminalContextKey((key) => {
    // Order-detail scope (an order is open).
    if (selectedOrder) {
      switch (key) {
        case 'detail-copy-order':
          navigator.clipboard.writeText(String(selectedOrder.binance_order_number));
          toast.success('Order number copied');
          return;
        case 'detail-copy-fiat':
          navigator.clipboard.writeText(String(selectedOrder.total_price));
          toast.success('Fiat amount copied');
          return;
        case 'detail-internal-chat': {
          const el = document.querySelector('[data-terminal-internal-chat-input]') as HTMLElement | null;
          el?.focus();
          return;
        }
        case 'detail-actions': {
          const btn = document.querySelector('[data-order-actions] button:not([disabled])') as HTMLElement | null;
          if (btn) { btn.scrollIntoView({ block: 'center', behavior: 'smooth' }); btn.focus(); }
          return;
        }
        case 'orders-back':
          setSelectedOrder(null);
          return;
        case 'orders-down':
          stepSelectedOrder(1);
          return;
        case 'orders-up':
          stepSelectedOrder(-1);
          return;
        default:
          return;
      }
    }

    if (queueMode) {
      if (key === 'orders-back') setQueueMode(false);
      return;
    }

    // Orders-list scope (no order open, not in queue/inbox views).
    if (showChatInbox || activeChatConv) return;
    const list = visibleOrders;
    switch (key) {
      case 'orders-down': {
        if (list.length === 0) return;
        const i = list.findIndex(o => String(o.id) === focusedOrderId);
        const next = list[Math.min(i + 1, list.length - 1)] ?? list[0];
        setFocusedOrderId(String(next.id));
        return;
      }
      case 'orders-up': {
        if (list.length === 0) return;
        const i = list.findIndex(o => String(o.id) === focusedOrderId);
        const prev = list[Math.max(i - 1, 0)] ?? list[0];
        setFocusedOrderId(String(prev.id));
        return;
      }
      case 'orders-open': {
        const target = list.find(o => String(o.id) === focusedOrderId);
        if (target) setSelectedOrder(target);
        return;
      }
      case 'orders-prev-tab':
      case 'orders-next-tab': {
        const tabs = ['all', 'active', 'completed', 'cancelled'];
        const i = tabs.indexOf(statusFilter);
        const dir = key === 'orders-next-tab' ? 1 : -1;
        setStatusFilter(tabs[(i + dir + tabs.length) % tabs.length]);
        return;
      }
      case 'orders-search':
        focusPageSearch();
        return;
      case 'orders-refresh':
        Promise.all([refetchActive(), refetchHistory(), refetchRecent()]);
        return;
      case 'orders-back':
        setSelectedOrder(null);
        return;
      default:
        return;
    }
  }), [selectedOrder, queueMode, showChatInbox, activeChatConv, visibleOrders, focusedOrderId, statusFilter, refetchActive, refetchHistory, refetchRecent]);


  // ---- View routing ----
  if (activeChatConv) {
    return (
      <div className="h-[calc(100vh-48px)]" data-testid="terminal-chat-thread">
        <ChatThreadView
          conversation={activeChatConv}
          onBack={() => {
            // A chat opened from the Chats inbox must return to the inbox,
            // never to the orders list.
            const cameFromInbox = activeChatConv.fromInbox !== false;
            setActiveChatConv(null);
            if (cameFromInbox) setShowChatInbox(true);
          }}
        />
      </div>
    );
  }

  if (showChatInbox) {
    return (
      <div className="h-[calc(100vh-48px)]" data-testid="terminal-chat-inbox">
        <ChatInbox
          onClose={() => setShowChatInbox(false)}
          onOpenChat={(conv) => { setShowChatInbox(false); setActiveChatConv({ ...conv, fromInbox: true }); }}
        />
      </div>
    );
  }


  if (queueMode) {
    return (
      <div className="h-[calc(100vh-48px)]">
        <QueueMode orders={displayOrders} onClose={() => setQueueMode(false)} />
      </div>
    );
  }

  if (selectedOrder) {
    return (
      <div className="h-[calc(100vh-48px)]">
        <OrderDetailWorkspace
          order={selectedOrder}
          onStepOrder={stepSelectedOrder}
          onClose={async () => {
            setSelectedOrder(null);
            // Ensure list reflects the latest terminal status after viewing an order
            await Promise.all([refetchActive(), refetchHistory(), refetchRecent()]);
          }}
        />

      </div>
    );
  }

  // ---- Row presentation helpers (pure; same predicates the rows always used) ----
  const rowView = (order: P2POrderRecord) => {
    const opStatus = mapToOperationalStatus((order as any)._resolvedStatus || order.order_status, order.trade_type);
    const isActive = !['Completed', 'Cancelled', 'Expired'].includes(opStatus);
    // For sell orders needing verification (kyc=1), show "Verification Pending" instead of "Pending Payment"
    const needsKycVerification = order.trade_type === 'SELL' && order.additional_kyc_verify === 1 && opStatus === 'Pending Payment';
    const style = needsKycVerification
      ? { label: 'Verification Pending', badgeClass: 'border-primary/30 text-primary bg-primary/5', dotColor: 'bg-primary' }
      : getStatusStyle(opStatus);
    const createMs = order.binance_create_time
      ? (typeof order.binance_create_time === 'number' ? order.binance_create_time : new Date(order.binance_create_time).getTime())
      : null;
    return {
      opStatus,
      isActive,
      needsKycVerification,
      style,
      createMs,
      unread: unreadMap.get(order.binance_order_number) || 0,
      internalUnread: internalUnreadMap[order.binance_order_number] || 0,
      hasAltUpiRequest: pendingAltUpiOrderNumbers.has(order.binance_order_number),
      // Only surface release/complaint alerts on still-active orders.
      // The monitor log persists after an order settles, so without
      // this guard a Completed/Cancelled order keeps showing a stale
      // "Seller Release Overdue" badge.
      releaseAlert: isActive ? releaseMonitorByOrder.get(order.binance_order_number) : undefined,
      verifiedName: verifiedNameMap[order.binance_order_number],
      visibility: getOrderVisibility(order.binance_order_number),
      assignment: getOrderAssignment(order.binance_order_number),
      canRelease: canOrderActions && opStatus === 'Pending Release' && order.trade_type === 'SELL',
    };
  };

  const copyOrderNumber = (order: P2POrderRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(order.binance_order_number);
    toast.success('Order number copied');
  };

  const sideChip = (tradeType: string, asset: string) => (
    <span className={`inline-flex h-5 shrink-0 items-center rounded px-1.5 t-mono text-[10px] font-semibold uppercase tracking-wide ${tradeType === 'BUY' ? 'bg-[hsl(var(--trade-buy,var(--success))/0.1)] text-trade-buy' : 'bg-[hsl(var(--trade-sell,var(--destructive))/0.1)] text-trade-sell'}`}>
      {tradeType === 'BUY' ? 'Buy' : 'Sell'} {asset}
    </span>
  );

  const statusBadge = (v: ReturnType<typeof rowView>) => (
    <Badge variant="outline" className={`h-5 w-fit shrink-0 gap-1 whitespace-nowrap rounded-full px-2 text-[10px] font-medium ${v.style.badgeClass}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${(v.style as any).dotColor || 'bg-current'}`} />
      {v.style.label}
    </Badge>
  );

  const releaseAlertLabel = (status: string) => (
    status === 'complaint_window_closing'
      ? 'Complaint Window Closing'
      : status === 'complaint_window_expired'
        ? 'Complaint Window Expired'
        : 'Seller Release Overdue'
  );

  const flagChips = (order: P2POrderRecord, v: ReturnType<typeof rowView>, kycFlag: boolean) => (
    <>
      {kycFlag && (
        <span className={FLAG_CHIP + ' border-warning/30 bg-warning/5 text-warning'}>
          <ShieldAlert className="h-2.5 w-2.5" /> Requires Verification
        </span>
      )}
      {v.hasAltUpiRequest && (
        <span className={FLAG_CHIP + ' border-warning/30 bg-warning/10 text-warning'}>
          <ArrowLeftRight className="h-2.5 w-2.5" /> Alternate UPI Requested
        </span>
      )}
      {v.releaseAlert && (
        <span className={`${FLAG_CHIP} ${v.releaseAlert.status === 'complaint_window_expired' ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-warning/30 bg-warning/5 text-warning'}`}>
          <AlertTriangle className="h-2.5 w-2.5" /> {releaseAlertLabel(v.releaseAlert.status)}
        </span>
      )}
    </>
  );

  const assignmentNode = (order: P2POrderRecord, v: ReturnType<typeof rowView>) => {
    if (v.visibility === 'assigned_to_me') {
      return <Badge variant="outline" className="h-5 rounded-full border-primary/30 bg-primary/10 px-2 text-[10px] font-medium text-primary">You</Badge>;
    }
    if (v.visibility === 'assigned_to_team' && v.assignment) {
      return <Badge variant="outline" className="h-5 rounded-full border-info/30 bg-info/10 px-2 text-[10px] font-medium text-info">Team</Badge>;
    }
    if (canManageOrders) {
      return (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setAssignDialogOrder(order); }}
          className="inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-dashed border-border px-2 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          <UserPlus className="h-3 w-3" /> Assign
        </button>
      );
    }
    return <span className="text-[11px] text-muted-foreground/60">—</span>;
  };

  const rowActions = (order: P2POrderRecord, v: ReturnType<typeof rowView>) => (
    <div className="inline-flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
      {/* Inline release — opens Fund Password for small sales, Authenticator otherwise */}
      {v.canRelease && (
        <ReleaseCoinAction
          compact
          orderNumber={order.binance_order_number}
          exchangeAccountId={(order as any).exchange_account_id}
          totalPrice={order.total_price}
          fiatUnit={order.fiat_unit}
          counterpartyName={v.verifiedName}
        />
      )}
      <button
        type="button"
        onClick={(e) => openChatForOrder(order, e)}
        className={ROW_ICON_BTN}
        aria-label={v.unread > 0 ? `Open chat, ${v.unread} unread` : 'Open chat'}
        title="Open chat"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        {v.unread > 0 && <span className={COUNT_BADGE} aria-hidden="true">{v.unread}</span>}
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setSelectedOrder(order); }}
        className={ROW_ICON_BTN}
        aria-label={v.internalUnread > 0 ? `Internal chat, ${v.internalUnread} unread` : 'Internal chat'}
        title="Internal Chat"
      >
        <Users className="h-3.5 w-3.5" />
        {v.internalUnread > 0 && <span className={COUNT_BADGE} aria-hidden="true">{v.internalUnread}</span>}
      </button>
    </div>
  );

  const sideStripe = (tradeType: string) => (
    tradeType === 'BUY' ? 'shadow-[inset_3px_0_0_hsl(var(--trade-buy))]' : 'shadow-[inset_3px_0_0_hsl(var(--trade-sell))]'
  );

  // Compact row: phones in List view, and narrow work areas (e.g. an expanded sidebar on a small laptop).
  const renderCompactRow = (order: P2POrderRecord) => {
    const v = rowView(order);
    const kycFlag = order.additional_kyc_verify === 1 && v.isActive;
    const isAssigned = v.visibility === 'assigned_to_me' || (v.visibility === 'assigned_to_team' && !!v.assignment);
    return (
      <div
        key={order.id}
        role="button"
        tabIndex={0}
        onClick={() => setSelectedOrder(order)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setSelectedOrder(order);
          }
        }}
        className={`cursor-pointer py-2.5 pl-4 pr-3 transition-colors hover:bg-secondary/40 active:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${sideStripe(order.trade_type)} ${v.hasAltUpiRequest ? 'bg-warning/5' : ''} ${focusedOrderId === String(order.id) ? 'ring-2 ring-inset ring-primary' : ''}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
              {sideChip(order.trade_type, order.asset)}
              <span className="t-mono text-[11px] tabular-nums text-muted-foreground">
                {v.createMs ? format(new Date(v.createMs), 'dd MMM yyyy, HH:mm') : '—'}
              </span>
            </div>
            <p className="mt-1 truncate text-[13px] font-medium text-foreground">{order.counterparty_nickname || 'Counterparty'}</p>
            {v.verifiedName && <p className="truncate text-[11px] text-muted-foreground">{v.verifiedName}</p>}
          </div>
          <div className="shrink-0 text-right">
            <p className="t-mono text-[13px] font-semibold tabular-nums text-foreground">
              {Number(order.total_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })} {order.fiat_unit}
            </p>
            <p className="t-mono text-[11px] tabular-nums text-muted-foreground">
              {Number(order.amount).toFixed(order.amount < 1 ? 4 : 2)} {order.asset} @ {fmtUnitPrice(order.unit_price)}
            </p>
          </div>
        </div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
          <span className="inline-flex items-center gap-0.5">
            <span className="whitespace-nowrap t-mono text-[12px] tabular-nums text-foreground">{order.binance_order_number}</span>
            <button
              type="button"
              onClick={(e) => copyOrderNumber(order, e)}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Copy order number"
              title="Copy order number"
            >
              <Copy className="h-3 w-3" />
            </button>
          </span>
          <AccountBadge accountId={(order as any).exchange_account_id} className="w-fit" />
        </div>
        <div className="mt-2 flex items-end justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {statusBadge(v)}
            {v.isActive && order.binance_create_time && (
              <OrderRowTimer
                createTime={v.createMs as number}
                notifyPayEndTime={(order as any)._notifyPayEndTime}
                notifyPayedExpireMinute={(order as any)._notifyPayedExpireMinute}
              />
            )}
            {isAssigned ? assignmentNode(order, v) : null}
            {flagChips(order, v, kycFlag)}
          </div>
          <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {!isAssigned && canManageOrders && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setAssignDialogOrder(order); }}
                className={ROW_ICON_BTN}
                aria-label="Assign"
                title="Assign"
              >
                <UserPlus className="h-3.5 w-3.5" />
              </button>
            )}
            {rowActions(order, v)}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      {/* Command strip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg border border-primary/20 shrink-0">
            <ShoppingCart className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight text-foreground">Orders</h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="hidden sm:inline">P2P trade management</span>
              <span className="hidden sm:inline text-muted-foreground/50" aria-hidden="true">·</span>
              <span className="t-mono tabular-nums" title="Orders shown · orders matching the filters">
                {visibleOrders.length === displayOrders.length
                  ? `${displayOrders.length} ${displayOrders.length === 1 ? 'order' : 'orders'}`
                  : `${visibleOrders.length} of ${displayOrders.length} shown`}
              </span>
              {totalUnread > 0 && (
                <span className="inline-flex h-5 items-center gap-1 rounded-full border border-destructive/25 bg-destructive/10 px-2 t-mono text-[10px] font-medium text-destructive">
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden="true" />
                  {totalUnread} unread
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 relative"
            onClick={() => setQueueMode(true)}
            title="Step through actionable orders one at a time"
          >
            <ListChecks className="h-3.5 w-3.5" />
            Queue
            {actionableOrderIds.length > 0 && (
              <span className="inline-flex items-center justify-center h-4 min-w-[16px] rounded-full bg-primary/15 text-primary t-mono text-[10px] font-semibold px-1">
                {actionableOrderIds.length}
              </span>
            )}
          </Button>
          {canChat && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 relative"
              onClick={() => setShowChatInbox(true)}
              title={chatBadgeCount > 0 ? `${chatBadgeCount} unread ${chatBadgeCount === 1 ? 'chat' : 'chats'}` : 'Chats'}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Chat
              {chatBadgeCount > 0 && (
                <span aria-hidden="true" className="absolute -top-1.5 -right-1.5 h-4 min-w-[16px] rounded-full bg-destructive ring-2 ring-background flex items-center justify-center px-1">
                  <span className="text-[10px] font-bold leading-none text-destructive-foreground">{chatBadgeCount}</span>
                </span>
              )}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 active:scale-[0.98] transition-transform duration-150"
            onClick={async () => {
              // Ask the server collector for an immediate Binance tick, then
              // re-read the cache + history.
              await triggerCollectorTick().catch(() => undefined);
              await Promise.all([refetchActive(), refetchHistory(), refetchRecent()]);
            }}
            disabled={isRefreshing}
            title="Refresh from Binance"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Collector staleness banner — visible warning when the server-side
          order collector stops reporting, so a dead collector never silently
          blinds the terminal (the hook falls back to live Binance polling). */}
      {collectorStale && (
        <div role="status" className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-xs text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-px" />
          <span>
            Live order feed is delayed — showing the last synced data and refreshing directly.
            {collectorState?.last_tick_at && (
              <span className="text-muted-foreground"> Last server update: {format(new Date(collectorState.last_tick_at), 'HH:mm:ss')}</span>
            )}
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={tradeFilter} onValueChange={setTradeFilter} className="shrink-0">
            <TabsList className={SEG_LIST}>
              <TabsTrigger value="all" className={SEG_TRIGGER}>
                All <span className={`${SEG_COUNT} bg-muted text-muted-foreground`}>{rawOrders.length}</span>
              </TabsTrigger>
              <TabsTrigger value="BUY" className={SEG_TRIGGER}>
                Buy <span className={`${SEG_COUNT} bg-[hsl(var(--trade-buy,var(--success))/0.1)] text-trade-buy`}>{rawOrders.filter(o => o.tradeType === 'BUY').length}</span>
              </TabsTrigger>
              <TabsTrigger value="SELL" className={SEG_TRIGGER}>
                Sell <span className={`${SEG_COUNT} bg-[hsl(var(--trade-sell,var(--destructive))/0.1)] text-trade-sell`}>{rawOrders.filter(o => o.tradeType === 'SELL').length}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Tabs value={statusFilter} onValueChange={setStatusFilter} className="shrink-0">
            <TabsList className={SEG_LIST}>
              <TabsTrigger value="all" className={SEG_TRIGGER}>All Status</TabsTrigger>
              <TabsTrigger value="active" className={SEG_TRIGGER}>Active</TabsTrigger>
              <TabsTrigger value="completed" className={SEG_TRIGGER}>Completed</TabsTrigger>
              <TabsTrigger value="cancelled" className={SEG_TRIGGER}>Cancelled</TabsTrigger>
            </TabsList>
          </Tabs>

          {statusFilter === 'active' && (
            <Tabs value={activeSubFilter} onValueChange={setActiveSubFilter} className="shrink-0">
              <TabsList className={SEG_LIST}>
                <TabsTrigger value="all" className={SEG_TRIGGER}>
                  All <span className={`${SEG_COUNT} bg-muted text-muted-foreground`}>{activeSubCountsRef.current.all}</span>
                </TabsTrigger>
                <TabsTrigger value="unpaid" className={SEG_TRIGGER}>
                  Unpaid <span className={`${SEG_COUNT} bg-muted text-muted-foreground`}>{activeSubCountsRef.current.unpaid}</span>
                </TabsTrigger>
                <TabsTrigger value="paid" className={SEG_TRIGGER}>
                  Paid <span className={`${SEG_COUNT} bg-muted text-muted-foreground`}>{activeSubCountsRef.current.paid}</span>
                </TabsTrigger>
                <TabsTrigger value="appeal" className={SEG_TRIGGER}>
                  Appeal <span className={`${SEG_COUNT} ${activeSubCountsRef.current.appeal > 0 ? 'bg-purple-500/10 text-purple-500' : 'bg-muted text-muted-foreground'}`}>{activeSubCountsRef.current.appeal}</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          <Tabs value={assignmentFilter} onValueChange={setAssignmentFilter} className="shrink-0">
            <TabsList className={SEG_LIST}>
              <TabsTrigger value="all" className={SEG_TRIGGER}>All</TabsTrigger>
              <TabsTrigger value="mine" className={SEG_TRIGGER}>
                <User className="h-3 w-3" /> My Orders
              </TabsTrigger>
              <TabsTrigger value="team" className={SEG_TRIGGER}>
                <Users className="h-3 w-3" /> Team
              </TabsTrigger>
              <TabsTrigger value="unassigned" className={SEG_TRIGGER}>Unassigned</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 md:min-w-[340px]">
          <div className="relative min-w-[8.5rem] flex-1 md:max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or order ID..."
              data-page-search
              aria-label="Search orders by name or order ID"
              className="h-8 pl-8 text-xs bg-secondary border-border"
            />
          </div>

          <DateRangePicker
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            preset={datePreset}
            onPresetChange={setDatePreset}
            align="start"
            className="h-8 text-xs bg-secondary border-border"
          />

          <div className="ml-auto inline-flex h-8 shrink-0 items-center rounded-md border border-border bg-secondary/60 p-0.5 md:hidden" aria-label="Mobile order view">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={mobileView === 'list'}
              aria-label="List"
              onClick={() => setMobileView('list')}
              className={`h-7 w-8 rounded-[5px] p-0 ${mobileView === 'list' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
            >
              <LayoutList className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={mobileView === 'cards'}
              aria-label="Cards"
              onClick={() => setMobileView('cards')}
              className={`h-7 w-8 rounded-[5px] p-0 ${mobileView === 'cards' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>


      {/* Orders */}
      <div ref={setOrdersPanelEl} className="t-panel overflow-hidden @container">
        {isLoading ? (
          <div className="divide-y divide-border">
            {[1, 2, 3, 4, 5, 6, 7].map(i => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <div className="flex flex-col gap-1.5 w-40">
                  <div className="t-shimmer h-3 w-32 rounded" />
                  <div className="t-shimmer h-2.5 w-24 rounded" />
                </div>
                <div className="flex flex-col gap-1.5 w-28">
                  <div className="t-shimmer h-3 w-20 rounded" />
                  <div className="t-shimmer h-2.5 w-14 rounded" />
                </div>
                <div className="t-shimmer h-3 w-24 rounded" />
                <div className="t-shimmer h-5 w-24 rounded-full ml-auto" />
                <div className="t-shimmer h-7 w-20 rounded" />
              </div>
            ))}
          </div>
        ) : displayOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-secondary">
              <ShoppingCart className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">
              {isFetchingHistory ? 'Loading orders...' : 'No orders found'}
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              {isFetchingHistory
                ? 'Fetching complete order history from database'
                : rawOrders.length > 0 ? 'No orders match current filters' : 'Orders will appear after syncing from Binance'}
            </p>
          </div>
        ) : (

          <>
          {isMobile && mobileView === 'cards' && (
            <div className="space-y-3 p-3">
              {visibleOrders.map((order) => {
                const v = rowView(order);

                return (
                  <article
                    key={order.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedOrder(order)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedOrder(order);
                      }
                    }}
                    className={`overflow-hidden rounded-lg border border-border bg-card text-left transition-colors active:bg-secondary/60 ${sideStripe(order.trade_type)} ${v.hasAltUpiRequest ? 'bg-warning/5' : ''} ${focusedOrderId === String(order.id) ? 'ring-2 ring-primary' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3 px-3.5 pt-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          {sideChip(order.trade_type, order.asset)}
                          <AccountBadge accountId={(order as any).exchange_account_id} className="w-fit" />
                        </div>
                        <p className="text-[11px] text-muted-foreground t-mono tabular-nums">
                          {order.binance_create_time ? format(new Date(order.binance_create_time), 'dd MMM yyyy · HH:mm') : '—'}
                        </p>
                      </div>
                      {statusBadge(v)}
                    </div>

                    <div className="space-y-3 px-3.5 py-3">
                      <div className="flex items-end justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {order.counterparty_nickname || 'Counterparty'}
                          </p>
                          {v.verifiedName && <p className="truncate text-[11px] text-muted-foreground">{v.verifiedName}</p>}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-base font-semibold text-foreground t-mono tabular-nums leading-tight">
                            {Number(order.total_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })} {order.fiat_unit}
                          </p>
                          <p className="text-[11px] text-muted-foreground t-mono tabular-nums">
                            {Number(order.amount).toFixed(order.amount < 1 ? 4 : 2)} {order.asset} @ {fmtUnitPrice(order.unit_price)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 rounded-md bg-secondary/50 px-2.5 py-1.5">
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Order number</p>
                          <p className="truncate text-[12px] text-foreground t-mono">{order.binance_order_number}</p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground"
                          title="Copy order number"
                          aria-label="Copy order number"
                          onClick={(event) => copyOrderNumber(order, event)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {v.isActive && order.binance_create_time && (
                          <OrderRowTimer
                            createTime={v.createMs as number}
                            notifyPayEndTime={(order as any)._notifyPayEndTime}
                            notifyPayedExpireMinute={(order as any)._notifyPayedExpireMinute}
                          />
                        )}
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Assigned</span>
                        {assignmentNode(order, v)}
                        {flagChips(order, v, v.needsKycVerification)}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 border-t border-border bg-secondary/20 px-3 py-2" onClick={(event) => event.stopPropagation()}>
                      {v.canRelease && (
                        <ReleaseCoinAction
                          compact
                          orderNumber={order.binance_order_number}
                          exchangeAccountId={(order as any).exchange_account_id}
                          totalPrice={order.total_price}
                          fiatUnit={order.fiat_unit}
                          counterpartyName={v.verifiedName}
                        />
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="relative h-8 gap-1.5 px-2.5 text-xs"
                        aria-label={v.unread > 0 ? `Chat, ${v.unread} unread` : 'Chat'}
                        onClick={(event) => openChatForOrder(order, event)}
                      >
                        <MessageSquare className="h-3.5 w-3.5" /> Chat
                        {v.unread > 0 && (
                          <span aria-hidden="true" className={COUNT_BADGE}>{v.unread}</span>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="relative h-8 gap-1.5 px-2.5 text-xs"
                        title="Internal Chat"
                        aria-label={v.internalUnread > 0 ? `Team chat, ${v.internalUnread} unread` : 'Team chat'}
                        onClick={() => setSelectedOrder(order)}
                      >
                        <Users className="h-3.5 w-3.5" /> Team
                        {v.internalUnread > 0 && (
                          <span aria-hidden="true" className={COUNT_BADGE}>{v.internalUnread}</span>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-8 gap-1 px-2 text-xs text-muted-foreground"
                        onClick={() => setSelectedOrder(order)}
                      >
                        Open <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {(!isMobile || mobileView === 'list') && (
            (isMobile || !ordersPanelWide) ? (
              /* Compact rows — phones, and work areas too narrow for the full table */
              <div className="divide-y divide-border">
                {visibleOrders.map((order) => renderCompactRow(order))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="w-[30%] pl-4 text-[10px] font-medium text-muted-foreground">Order</TableHead>
                    <TableHead className="text-[10px] font-medium text-muted-foreground">Amount</TableHead>
                    <TableHead className="text-[10px] font-medium text-muted-foreground">Counterparty</TableHead>
                    <TableHead className="text-[10px] font-medium text-muted-foreground">Status</TableHead>
                    <TableHead className="hidden @[60rem]:table-cell text-[10px] font-medium text-muted-foreground">Assigned</TableHead>
                    <TableHead className="w-px whitespace-nowrap pr-4 text-right text-[10px] font-medium text-muted-foreground">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleOrders.map((order) => {
                    const v = rowView(order);

                    return (
                      <TableRow
                        key={order.id}
                        className={`border-border cursor-pointer hover:bg-secondary/50 transition-colors ${sideStripe(order.trade_type)} ${v.hasAltUpiRequest ? 'bg-warning/5' : ''} ${focusedOrderId === String(order.id) ? 'ring-2 ring-inset ring-primary bg-secondary/40' : ''}`}
                        onClick={() => setSelectedOrder(order)}>

                        {/* Order: side, number, time, account, flags */}
                        <TableCell className="py-2.5 pl-4 align-top">
                          <div className="flex min-w-0 flex-col gap-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                              {sideChip(order.trade_type, order.asset)}
                              <span className="inline-flex items-center gap-0.5">
                                <span className="whitespace-nowrap t-mono text-[12px] text-foreground">{order.binance_order_number}</span>
                                <button
                                  type="button"
                                  onClick={(e) => copyOrderNumber(order, e)}
                                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                                  aria-label="Copy order number"
                                  title="Copy order number"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] text-muted-foreground t-mono tabular-nums">
                                {order.binance_create_time
                                  ? format(new Date(order.binance_create_time), 'dd MMM yyyy, HH:mm')
                                  : '—'}
                              </span>
                              <AccountBadge accountId={(order as any).exchange_account_id} className="w-fit" />
                              {flagChips(order, v, order.additional_kyc_verify === 1 && v.isActive)}
                            </div>
                          </div>
                        </TableCell>

                        {/* Amount */}
                        <TableCell className="py-2.5 align-top">
                          <div className="flex flex-col items-start gap-0.5 whitespace-nowrap">
                            <span className="text-[13px] text-foreground t-mono tabular-nums font-semibold">
                              {Number(order.total_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })} {order.fiat_unit}
                            </span>
                            <span className="text-[11px] text-muted-foreground t-mono tabular-nums">
                              {Number(order.amount).toFixed(order.amount < 1 ? 4 : 2)} {order.asset} @ {fmtUnitPrice(order.unit_price)}
                            </span>
                          </div>
                        </TableCell>

                        {/* Counterparty */}
                        <TableCell className="py-2.5 align-top">
                          <div className="flex min-w-0 max-w-[220px] flex-col gap-0.5">
                            <span className="truncate text-[13px] font-medium text-foreground">{order.counterparty_nickname}</span>
                            {v.verifiedName && (
                              <span className="truncate text-[11px] text-muted-foreground">{v.verifiedName}</span>
                            )}
                            <span className="mt-0.5 @[60rem]:hidden">{assignmentNode(order, v)}</span>
                          </div>
                        </TableCell>

                        {/* Status */}
                        <TableCell className="py-2.5 align-top">
                          <div className="flex flex-col items-start gap-1">
                            {statusBadge(v)}
                            {v.isActive && order.binance_create_time && (
                              <OrderRowTimer
                                createTime={v.createMs as number}
                                notifyPayEndTime={(order as any)._notifyPayEndTime}
                                notifyPayedExpireMinute={(order as any)._notifyPayedExpireMinute}
                              />
                            )}
                          </div>
                        </TableCell>

                        {/* Assignment */}
                        <TableCell className="hidden @[60rem]:table-cell py-2.5 align-top">
                          {assignmentNode(order, v)}
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="whitespace-nowrap py-2.5 pr-4 text-right align-top">
                          {rowActions(order, v)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )
          )}

          {/* Infinite scroll sentinel (both list and mobile card views) */}
          <div ref={loadMoreRef} className="h-4" />
          {visibleCount < displayOrders.length && (
            <div className="text-center py-3 text-xs text-muted-foreground">
              Loading more orders...
            </div>
          )}

          </>
        )}
      </div>


      {/* Order Assignment Dialog */}
      {assignDialogOrder && (
        <OrderAssignmentDialog
          open={!!assignDialogOrder}
          onOpenChange={(open) => { if (!open) setAssignDialogOrder(null); }}
          orderNumber={assignDialogOrder.binance_order_number}
          tradeType={assignDialogOrder.trade_type}
          totalPrice={assignDialogOrder.total_price}
          asset={assignDialogOrder.asset}
          currentAssignee={getOrderAssignment(assignDialogOrder.binance_order_number)?.assigned_to || null}
          onAssigned={() => refetchJurisdiction()}
        />
      )}
    </div>
  );
}

export default function TerminalOrders() {
  return (
    <TerminalPermissionGate permissions={['terminal_orders_view']}>
      <TerminalOrdersContent />
    </TerminalPermissionGate>
  );
}

function OrderStatusBadge({ status, tradeType, additionalKycVerify }: { status: string; tradeType: string; additionalKycVerify?: number }) {
  const operational = mapToOperationalStatus(status, tradeType);
  const needsKyc = tradeType === 'SELL' && additionalKycVerify === 1 && operational === 'Pending Payment';
  const style = needsKyc
    ? { label: 'Verification Pending', badgeClass: 'border-primary/30 text-primary bg-primary/5' }
    : getStatusStyle(operational);
  return <Badge variant="outline" className={`text-[10px] ${style.badgeClass}`}>{style.label}</Badge>;
}

/** Show the actual order creation time (e.g. "16:09") */
function OrderRowTimer({ createTime, notifyPayEndTime, notifyPayedExpireMinute }: { createTime: number; notifyPayEndTime?: number; notifyPayedExpireMinute?: number }) {
  const [remaining, setRemaining] = useState('');
  const [isExpired, setIsExpired] = useState(false);

  // Calculate the expiry time: prefer notifyPayEndTime, then compute from createTime + expireMinutes
  const expiryTime = useMemo(() => {
    if (notifyPayEndTime && notifyPayEndTime > 0) return notifyPayEndTime;
    if (notifyPayedExpireMinute && notifyPayedExpireMinute > 0) return createTime + notifyPayedExpireMinute * 60 * 1000;
    return null;
  }, [createTime, notifyPayEndTime, notifyPayedExpireMinute]);

  useEffect(() => {
    if (!expiryTime) return;
    const tick = () => {
      const diff = expiryTime - Date.now();
      if (diff <= 0) {
        setRemaining('0:00');
        setIsExpired(true);
        return;
      }
      setIsExpired(false);
      const totalSecs = Math.floor(diff / 1000);
      const mins = Math.floor(totalSecs / 60);
      const secs = totalSecs % 60;
      setRemaining(`${mins}:${secs.toString().padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiryTime]);

  if (!expiryTime) {
    // Fallback: just show creation time
    return <span className="text-[11px] text-muted-foreground t-mono tabular-nums">{format(new Date(createTime), 'HH:mm')}</span>;
  }

  const urgencyClass = isExpired
    ? 'text-destructive font-semibold'
    : remaining && parseInt(remaining) <= 2
      ? 'text-destructive'
      : remaining && parseInt(remaining) <= 5
        ? 'text-warning'
        : 'text-trade-pending';

  return (
    <span className={`inline-flex items-center gap-1 text-[11px] t-mono tabular-nums ${urgencyClass}`} title="Order timer">
      <Timer className="h-3 w-3" aria-hidden="true" />
      {remaining}
    </span>
  );
}
