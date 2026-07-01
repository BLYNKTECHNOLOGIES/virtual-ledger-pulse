import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ShoppingCart, RefreshCw, Search, MessageSquare, Copy, ShieldAlert, UserPlus, User, Users, ArrowLeftRight, MessagesSquare, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { callBinanceAds, useBinanceActiveOrders, useBinanceOrderHistory } from '@/hooks/useBinanceActions';
import { useSyncOrders, P2POrderRecord } from '@/hooks/useP2PTerminal';
import { C2COrderHistoryItem } from '@/hooks/useBinanceOrders';
import { CounterpartyBadge } from '@/components/terminal/orders/CounterpartyBadge';
import { AccountBadge } from '@/components/exchange/AccountBadge';
import { OrderDetailWorkspace } from '@/components/terminal/orders/OrderDetailWorkspace';
import { ChatInbox, ChatConversation } from '@/components/terminal/orders/ChatInbox';
import { ChatThreadView } from '@/components/terminal/orders/ChatThreadView';
import { OrderAssignmentDialog } from '@/components/terminal/orders/OrderAssignmentDialog';
import { useTerminalJurisdiction } from '@/hooks/useTerminalJurisdiction';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';
import { format } from 'date-fns';
import { DateRangePicker, getDateRangeFromPreset, type DateRangePreset } from '@/components/ui/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { mapToOperationalStatus, getStatusStyle, normaliseBinanceStatus } from '@/lib/orderStatusMapper';
import { useAlternateUpiRequests } from '@/hooks/usePayerModule';
import { supabase } from '@/integrations/supabase/client';
import { useTerminalUserPrefs } from '@/hooks/useTerminalUserPrefs';
import { useInternalUnreadCounts } from '@/hooks/useInternalChat';
import { syncCompletedBuyOrders } from '@/hooks/useTerminalPurchaseSync';
import { syncCompletedSellOrders } from '@/hooks/useTerminalSalesSync';
import { isOrderChatRead, markOrderChatRead, subscribeToChatReadState } from '@/lib/chat-read-state';
import { useDebounce } from '@/hooks/useDebounce';


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

function TerminalOrdersContent() {
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [datePreset, setDatePreset] = useState<DateRangePreset>('allTime');
  const [selectedOrder, setSelectedOrder] = useState<P2POrderRecord | null>(null);
  const [showChatInbox, setShowChatInbox] = useState(false);
  const [activeChatConv, setActiveChatConv] = useState<ChatConversation | null>(null);
  const [chatReadVersion, setChatReadVersion] = useState(0);
  const [visibleCount, setVisibleCount] = useState(50);
  const [assignDialogOrder, setAssignDialogOrder] = useState<P2POrderRecord | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkHandledRef = useRef(false);

  const { hasPermission, isTerminalAdmin, userId } = useTerminalAuth();
  const canChat = hasPermission('terminal_orders_chat') || isTerminalAdmin;
  const canEscalate = hasPermission('terminal_orders_escalate') || isTerminalAdmin;
  const canExport = hasPermission('terminal_orders_export') || isTerminalAdmin;
  const canSyncApprove = hasPermission('terminal_orders_sync_approve') || isTerminalAdmin;
  const queryClient = useQueryClient();

  // Persisted per-user filter preferences
  const ORDER_PREF_DEFAULTS = { tradeFilter: 'all' as string, statusFilter: 'all' as string, assignmentFilter: 'all' as string };
  const [orderPrefs, setOrderPref] = useTerminalUserPrefs(userId, 'orders', ORDER_PREF_DEFAULTS);
  const tradeFilter = orderPrefs.tradeFilter;
  const statusFilter = orderPrefs.statusFilter;
  const assignmentFilter = orderPrefs.assignmentFilter;
  const setTradeFilter = (v: string) => setOrderPref('tradeFilter', v);
  const setStatusFilter = (v: string) => setOrderPref('statusFilter', v);
  const setAssignmentFilter = (v: string) => setOrderPref('assignmentFilter', v);

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
    staleTime: 10 * 1000,
    refetchInterval: 15 * 1000, // Poll every 15s for recent status transitions
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
    queryKey: ['binance-direct-order-lookup', lookupOrderNumber],
    // Deep links must always verify the exact order/account before opening chat.
    enabled: isFullOrderNumber && (!!deepLinkedOrderNumber || !alreadyLoaded),
    staleTime: 30 * 1000,
    retry: false,
    queryFn: async () => {
      try {
        const response = await callBinanceAds('getOrderDetail', { orderNumber: lookupOrderNumber });
        const detail = response?.data?.data || response?.data || response;
        if (!detail || detail.error) return null;
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
          _exchangeAccountId: response?._resolvedExchangeAccountId ?? response?._exchangeAccountId ?? detail._exchangeAccountId ?? null,
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

  // Internal chat unread counts

  // Background sync to local DB (fire-and-forget)
  useEffect(() => {
    if (rawOrders.length > 0 && !syncOrders.isPending) {
      syncOrders.mutate(rawOrders.map(toSyncItem));
    }
  }, [rawOrders.length]);

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
    const maxOrders = 30;
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
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000, // Recheck every 30s for faster stale resolution
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

      // Prefer the most advanced status from any source
      const candidates = [
        { status: liveStatus, rank: getRank(liveStatus) },
        ...(recentStatus ? [{ status: recentStatus, rank: getRank(recentStatus) }] : []),
        ...(historyStatus ? [{ status: historyStatus, rank: getRank(historyStatus) }] : []),
        ...(staleDetailStatus ? [{ status: staleDetailStatus, rank: getRank(staleDetailStatus) }] : []),
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
  }, [rawOrders, tradeFilter, statusFilter, assignmentFilter, search, lookupOrderNumber, directOrder, dateRange, historyStatusMap, recentStatusMap, staleDetailStatusMap, getOrderVisibility, isTerminalAdmin, userSizeRanges, userAdIdAssignments]);

  // Reset visible count when filters change
  useEffect(() => { setVisibleCount(50); }, [tradeFilter, statusFilter, search, dateRange]);

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
    refetchInterval: 30000,
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

  // Helper: open chat for an order row directly — opens the full workspace
  const openChatForOrder = (order: P2POrderRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    markOrderChatRead(order.binance_order_number);
    callBinanceAds('markOrderMessagesRead', { orderNo: order.binance_order_number }).catch((err) => {
      console.warn('Failed to mark Binance chat read:', err);
    });
    setSelectedOrder(order);
  };

  useEffect(() => subscribeToChatReadState(() => setChatReadVersion(v => v + 1)), []);

  // ---- View routing ----
  if (activeChatConv) {
    return (
      <div className="h-[calc(100vh-48px)]">
        <ChatThreadView conversation={activeChatConv} onBack={() => setActiveChatConv(null)} />
      </div>
    );
  }

  if (showChatInbox) {
    return (
      <div className="h-[calc(100vh-48px)]">
        <ChatInbox
          onClose={() => setShowChatInbox(false)}
          onOpenChat={(conv) => { setShowChatInbox(false); setActiveChatConv(conv); }}
        />
      </div>
    );
  }

  if (selectedOrder) {
    return (
      <div className="h-[calc(100vh-48px)]">
        <OrderDetailWorkspace
          order={selectedOrder}
          onClose={async () => {
            setSelectedOrder(null);
            // Ensure list reflects the latest terminal status after viewing an order
            await Promise.all([refetchActive(), refetchHistory(), refetchRecent()]);
          }}
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <ShoppingCart className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Orders</h1>
            <p className="text-xs text-muted-foreground">P2P Trade Order Management</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            {visibleOrders.length} of {displayOrders.length} orders
          </Badge>
          {canChat && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 relative"
              onClick={() => setShowChatInbox(true)}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Chat
              {totalUnread > 0 && (
                <span className="absolute -top-1.5 -right-1.5 h-4 min-w-[16px] rounded-full bg-destructive flex items-center justify-center px-1">
                  <span className="text-[9px] font-bold text-destructive-foreground">{totalUnread}</span>
                </span>
              )}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={async () => {
              await Promise.all([refetchActive(), refetchHistory(), refetchRecent()]);
            }}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={tradeFilter} onValueChange={setTradeFilter}>
          <TabsList className="h-8 bg-secondary">
            <TabsTrigger value="all" className="text-[11px] h-6 px-3">All ({rawOrders.length})</TabsTrigger>
            <TabsTrigger value="BUY" className="text-[11px] h-6 px-3">Buy ({rawOrders.filter(o => o.tradeType === 'BUY').length})</TabsTrigger>
            <TabsTrigger value="SELL" className="text-[11px] h-6 px-3">Sell ({rawOrders.filter(o => o.tradeType === 'SELL').length})</TabsTrigger>
          </TabsList>
        </Tabs>

        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList className="h-8 bg-secondary">
            <TabsTrigger value="all" className="text-[11px] h-6 px-3">All Status</TabsTrigger>
            <TabsTrigger value="active" className="text-[11px] h-6 px-3">Active</TabsTrigger>
            <TabsTrigger value="completed" className="text-[11px] h-6 px-3">Completed</TabsTrigger>
            <TabsTrigger value="cancelled" className="text-[11px] h-6 px-3">Cancelled</TabsTrigger>
          </TabsList>
        </Tabs>

        <Tabs value={assignmentFilter} onValueChange={setAssignmentFilter}>
          <TabsList className="h-8 bg-secondary">
            <TabsTrigger value="all" className="text-[11px] h-6 px-3">All</TabsTrigger>
            <TabsTrigger value="mine" className="text-[11px] h-6 px-3 gap-1">
              <User className="h-3 w-3" /> My Orders
            </TabsTrigger>
            <TabsTrigger value="team" className="text-[11px] h-6 px-3 gap-1">
              <Users className="h-3 w-3" /> Team
            </TabsTrigger>
            <TabsTrigger value="unassigned" className="text-[11px] h-6 px-3">Unassigned</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or order ID..."
            className="h-8 pl-8 text-xs bg-secondary border-border"
          />
        </div>

        <DateRangePicker
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          preset={datePreset}
          onPresetChange={setDatePreset}
          align="end"
          className="h-8 text-xs bg-secondary border-border"
        />
      </div>


      {/* Orders Table */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : displayOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <ShoppingCart className="h-10 w-10 text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">
                {isFetchingHistory ? 'Loading orders...' : 'No orders found'}
              </p>
              <p className="text-[11px] text-muted-foreground/60 mt-1">
                {isFetchingHistory
                  ? 'Fetching complete order history from database'
                  : rawOrders.length > 0 ? 'No orders match current filters' : 'Orders will appear after syncing from Binance'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-[10px] text-muted-foreground font-medium">Type/Date</TableHead>
                    <TableHead className="text-[10px] text-muted-foreground font-medium">Order number</TableHead>
                    <TableHead className="text-[10px] text-muted-foreground font-medium">Price</TableHead>
                    <TableHead className="text-[10px] text-muted-foreground font-medium">Fiat / Crypto Amount</TableHead>
                    <TableHead className="text-[10px] text-muted-foreground font-medium">Counterparty</TableHead>
                    <TableHead className="text-[10px] text-muted-foreground font-medium">Assigned</TableHead>
                    <TableHead className="text-[10px] text-muted-foreground font-medium">Status</TableHead>
                    <TableHead className="text-[10px] text-muted-foreground font-medium text-right">Chat</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleOrders.map((order) => {
                    const opStatus = mapToOperationalStatus((order as any)._resolvedStatus || order.order_status, order.trade_type);
                    const isActive = !['Completed', 'Cancelled', 'Expired'].includes(opStatus);
                    // For sell orders needing verification (kyc=1), show "Verification Pending" instead of "Pending Payment"
                    const needsKycVerification = order.trade_type === 'SELL' && order.additional_kyc_verify === 1 && opStatus === 'Pending Payment';
                    const displayStatus = needsKycVerification ? 'Verification Pending' : opStatus;
                    const style = needsKycVerification
                      ? { label: 'Verification Pending', badgeClass: 'border-purple-500/30 text-purple-500 bg-purple-500/5', dotColor: 'bg-purple-500' }
                      : getStatusStyle(opStatus);
                    const unread = unreadMap.get(order.binance_order_number) || 0;
                    const hasAltUpiRequest = pendingAltUpiOrderNumbers.has(order.binance_order_number);
                    // Only surface release/complaint alerts on still-active orders.
                    // The monitor log persists after an order settles, so without
                    // this guard a Completed/Cancelled order keeps showing a stale
                    // "Seller Release Overdue" badge.
                    const releaseAlert = isActive ? releaseMonitorByOrder.get(order.binance_order_number) : undefined;

                    return (
                      <TableRow
                        key={order.id}
                        className={`border-border cursor-pointer hover:bg-secondary/50 transition-colors ${hasAltUpiRequest ? 'bg-amber-500/5 border-l-2 border-l-amber-500' : ''}`}
                        onClick={() => setSelectedOrder(order)}>

                        {/* Type/Date */}
                        <TableCell className="py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs">
                              <span className={`font-semibold ${order.trade_type === 'BUY' ? 'text-trade-buy' : 'text-trade-sell'}`}>
                                {order.trade_type === 'BUY' ? 'Buy' : 'Sell'}
                              </span>
                              {' '}
                              <span className="text-foreground font-medium">{order.asset}</span>
                            </span>
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {order.binance_create_time
                                ? format(new Date(order.binance_create_time), 'yyyy-MM-dd HH:mm')
                                : '—'}
                            </span>
                          </div>
                        </TableCell>

                        {/* Order number */}
                        <TableCell className="py-3">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-foreground font-mono underline decoration-muted-foreground/30 underline-offset-2">
                                {order.binance_order_number}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(order.binance_order_number);
                                  toast.success('Order number copied');
                                }}
                                className="text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <Copy className="h-3 w-3" />
                              </button>
                            </div>
                            <AccountBadge accountId={(order as any).exchange_account_id} className="w-fit" />
                            {order.additional_kyc_verify === 1 && isActive && (
                              <Badge variant="outline" className="text-[9px] w-fit border-amber-500/30 text-amber-500 bg-amber-500/5 gap-0.5">
                                <ShieldAlert className="h-2.5 w-2.5" />
                                Requires Verification
                              </Badge>
                            )}
                            {hasAltUpiRequest && (
                              <Badge variant="outline" className="text-[9px] w-fit border-amber-500/30 text-amber-600 bg-amber-500/10 gap-0.5 animate-pulse">
                                <ArrowLeftRight className="h-2.5 w-2.5" />
                                Alternate UPI Requested
                              </Badge>
                            )}
                            {releaseAlert && (
                              <Badge variant="outline" className={`text-[9px] w-fit gap-0.5 ${releaseAlert.status === 'complaint_window_expired' ? 'border-destructive/30 text-destructive bg-destructive/5' : 'border-amber-500/30 text-amber-500 bg-amber-500/5'}`}>
                                <AlertTriangle className="h-2.5 w-2.5" />
                                {releaseAlert.status === 'complaint_window_closing'
                                  ? 'Complaint Window Closing'
                                  : releaseAlert.status === 'complaint_window_expired'
                                    ? 'Complaint Window Expired'
                                    : 'Seller Release Overdue'}
                              </Badge>
                            )}
                          </div>
                        </TableCell>

                        {/* Price */}
                        <TableCell className="py-3">
                          <span className="text-xs text-foreground tabular-nums">
                            {Number(order.unit_price).toLocaleString('en-IN', { maximumFractionDigits: 2 })} {order.fiat_unit}
                          </span>
                        </TableCell>

                        {/* Fiat / Crypto Amount */}
                        <TableCell className="py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs text-foreground tabular-nums font-medium">
                              {Number(order.total_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })} {order.fiat_unit}
                            </span>
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {Number(order.amount).toFixed(order.amount < 1 ? 4 : 2)} {order.asset}
                            </span>
                          </div>
                        </TableCell>

                        {/* Counterparty */}
                        <TableCell className="py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs text-foreground font-medium truncate max-w-[140px]">
                              {order.counterparty_nickname}
                            </span>
                          </div>
                        </TableCell>

                        {/* Assignment */}
                        <TableCell className="py-3">
                          {(() => {
                            const vis = getOrderVisibility(order.binance_order_number);
                            const assignment = getOrderAssignment(order.binance_order_number);
                            if (vis === 'assigned_to_me') {
                              return <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">You</Badge>;
                            }
                            if (vis === 'assigned_to_team' && assignment) {
                              return <Badge variant="outline" className="text-[10px] bg-cyan-500/10 text-cyan-400 border-cyan-500/30">Team</Badge>;
                            }
                            if (canManageOrders) {
                              return (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setAssignDialogOrder(order); }}
                                  className="text-[10px] text-muted-foreground hover:text-primary border border-dashed border-border rounded px-1.5 py-0.5 flex items-center gap-0.5 transition-colors"
                                >
                                  <UserPlus className="h-2.5 w-2.5" /> Assign
                                </button>
                              );
                            }
                            return <span className="text-[10px] text-muted-foreground/50">—</span>;
                          })()}
                        </TableCell>

                        {/* Status */}
                        <TableCell className="py-3">
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className={`text-[10px] w-fit ${style.badgeClass}`}>
                              {style.label}
                            </Badge>
                            {isActive && order.binance_create_time && (
                              <OrderRowTimer
                                createTime={typeof order.binance_create_time === 'number' ? order.binance_create_time : new Date(order.binance_create_time).getTime()}
                                notifyPayEndTime={(order as any)._notifyPayEndTime}
                                notifyPayedExpireMinute={(order as any)._notifyPayedExpireMinute}
                              />
                            )}
                          </div>
                        </TableCell>

                        {/* Chat */}
                        <TableCell className="py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={(e) => openChatForOrder(order, e)}
                              className="relative inline-flex items-center gap-1 text-[10px] text-muted-foreground border border-border rounded px-2 py-0.5 hover:bg-secondary transition-colors"
                            >
                              <MessageSquare className="h-3 w-3" />
                              {unread > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 h-3.5 min-w-[14px] rounded-full bg-destructive flex items-center justify-center px-0.5">
                                  <span className="text-[8px] font-bold text-destructive-foreground">{unread}</span>
                                </span>
                              )}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setSelectedOrder(order); }}
                              className="relative inline-flex items-center gap-1 text-[10px] text-muted-foreground border border-border rounded px-2 py-0.5 hover:bg-secondary transition-colors"
                              title="Internal Chat"
                            >
                              <Users className="h-3 w-3" />
                              {(internalUnreadMap[order.binance_order_number] || 0) > 0 && (
                                <span className="absolute -top-1.5 -right-1.5 h-3.5 min-w-[14px] rounded-full bg-destructive flex items-center justify-center px-0.5">
                                  <span className="text-[8px] font-bold text-destructive-foreground">{internalUnreadMap[order.binance_order_number]}</span>
                                </span>
                              )}
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {/* Infinite scroll sentinel */}
              <div ref={loadMoreRef} className="h-4" />
              {visibleCount < displayOrders.length && (
                <div className="text-center py-3 text-xs text-muted-foreground">
                  Loading more orders...
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
    ? { label: 'Verification Pending', badgeClass: 'border-purple-500/30 text-purple-500 bg-purple-500/5' }
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
    return <span className="text-[10px] text-muted-foreground tabular-nums">{format(new Date(createTime), 'HH:mm')}</span>;
  }

  const urgencyClass = isExpired
    ? 'text-red-500 font-semibold'
    : remaining && parseInt(remaining) <= 2
      ? 'text-red-500 animate-pulse'
      : remaining && parseInt(remaining) <= 5
        ? 'text-yellow-500'
        : 'text-muted-foreground';

  return (
    <span className={`text-[10px] tabular-nums ${urgencyClass}`}>
      ⏱ {remaining}
    </span>
  );
}
