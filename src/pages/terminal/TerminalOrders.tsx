import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ShoppingCart, RefreshCw, Search, MessageSquare, Copy, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useBinanceActiveOrders, useBinanceOrderHistory } from '@/hooks/useBinanceActions';
import { useSyncOrders, P2POrderRecord } from '@/hooks/useP2PTerminal';
import { C2COrderHistoryItem } from '@/hooks/useBinanceOrders';
import { CounterpartyBadge } from '@/components/terminal/orders/CounterpartyBadge';
import { OrderDetailWorkspace } from '@/components/terminal/orders/OrderDetailWorkspace';
import { ChatInbox, ChatConversation } from '@/components/terminal/orders/ChatInbox';
import { ChatThreadView } from '@/components/terminal/orders/ChatThreadView';
import { format } from 'date-fns';
import { mapToOperationalStatus, getStatusStyle, normaliseBinanceStatus } from '@/lib/orderStatusMapper';

/** Convert numeric orderStatus to string */
function mapOrderStatusCode(code: number | string): string {
  if (typeof code === 'string') return code;
  const statusMap: Record<number, string> = {
    1: 'PENDING', 2: 'TRADING', 3: 'BUYER_PAYED', 4: 'BUYER_PAYED',
    5: 'COMPLETED', 6: 'CANCELLED', 7: 'CANCELLED', 8: 'APPEAL',
  };
  return statusMap[code] || 'TRADING';
}

/** Convert raw Binance active order to display-ready P2POrderRecord shape */
function binanceToOrderRecord(o: any): P2POrderRecord {
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

export default function TerminalOrders() {
  const [tradeFilter, setTradeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<P2POrderRecord | null>(null);
  const [showChatInbox, setShowChatInbox] = useState(false);
  const [activeChatConv, setActiveChatConv] = useState<ChatConversation | null>(null);
  const [visibleCount, setVisibleCount] = useState(50);

  const { data: activeOrdersData, isLoading: activeLoading, refetch, isFetching } = useBinanceActiveOrders();
  const { data: historyOrders = [], isLoading: historyLoading } = useBinanceOrderHistory();
  const syncOrders = useSyncOrders();

  // Only show loading if BOTH sources are still loading
  const isLoading = activeLoading && historyLoading;

  // Merge active orders + history orders, deduplicating by orderNumber
  const rawOrders: any[] = useMemo(() => {
    const orderMap = new Map<string, any>();

    // Active orders first (they have richer data like chatUnreadCount)
    const d = activeOrdersData?.data || activeOrdersData;
    const activeList = Array.isArray(d) ? d : [];
    for (const o of activeList) {
      if (o.orderNumber) orderMap.set(o.orderNumber, o);
    }

    // Then fill in from history (won't overwrite active orders)
    if (Array.isArray(historyOrders)) {
      for (const o of historyOrders as any[]) {
        if (o.orderNumber && !orderMap.has(o.orderNumber)) {
          orderMap.set(o.orderNumber, {
            orderNumber: o.orderNumber,
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
          });
        }
      }
    }

    // Sort by createTime descending
    return Array.from(orderMap.values()).sort((a, b) => (b.createTime || 0) - (a.createTime || 0));
  }, [activeOrdersData, historyOrders]);

  // Build a map of order history statuses for enrichment
  const historyStatusMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of historyOrders) {
      if (o.orderNumber && o.orderStatus) {
        map.set(o.orderNumber, String(o.orderStatus).toUpperCase());
      }
    }
    return map;
  }, [historyOrders]);

  // Build a map of unread chat counts from active orders
  const unreadMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of rawOrders) {
      if (o.chatUnreadCount > 0) {
        map.set(o.orderNumber, o.chatUnreadCount);
      }
    }
    return map;
  }, [rawOrders]);

  const totalUnread = useMemo(() =>
    Array.from(unreadMap.values()).reduce((s, v) => s + v, 0), [unreadMap]);

  // Background sync to local DB (fire-and-forget)
  useEffect(() => {
    if (rawOrders.length > 0 && !syncOrders.isPending) {
      syncOrders.mutate(rawOrders.map(toSyncItem));
    }
  }, [rawOrders.length]);

  // Convert to display records, enrich with history status, and apply filters
  const displayOrders: P2POrderRecord[] = useMemo(() => {
    let enriched = rawOrders.map(o => {
      const historyStatus = historyStatusMap.get(o.orderNumber);
      return { ...o, _resolvedStatus: historyStatus || mapOrderStatusCode(o.orderStatus) };
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

    const allRecords = enriched.map(o => {
      const record = binanceToOrderRecord(o);
      record.order_status = o._resolvedStatus;
      return record;
    });
    return allRecords;
  }, [rawOrders, tradeFilter, statusFilter, search, historyStatusMap]);

  // Reset visible count when filters change
  useEffect(() => { setVisibleCount(50); }, [tradeFilter, statusFilter, search]);

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

  // Helper: open chat for an order row directly — opens the full workspace
  const openChatForOrder = (order: P2POrderRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedOrder(order);
  };

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
        <OrderDetailWorkspace order={selectedOrder} onClose={() => setSelectedOrder(null)} />
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
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
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

        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or order ID..."
            className="h-8 pl-8 text-xs bg-secondary border-border"
          />
        </div>
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
              <p className="text-sm text-muted-foreground">No orders found</p>
              <p className="text-[11px] text-muted-foreground/60 mt-1">
                {rawOrders.length > 0 ? 'No orders match current filters' : 'Orders will appear after syncing from Binance'}
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
                    <TableHead className="text-[10px] text-muted-foreground font-medium">Status</TableHead>
                    <TableHead className="text-[10px] text-muted-foreground font-medium text-right">Chat</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleOrders.map((order) => {
                    const opStatus = mapToOperationalStatus(order.order_status, order.trade_type);
                    const isActive = !['Completed', 'Cancelled', 'Expired'].includes(opStatus);
                    // For sell orders needing verification (kyc=1), show "Verification Pending" instead of "Pending Payment"
                    const needsKycVerification = order.trade_type === 'SELL' && order.additional_kyc_verify === 1 && opStatus === 'Pending Payment';
                    const displayStatus = needsKycVerification ? 'Verification Pending' : opStatus;
                    const style = needsKycVerification
                      ? { label: 'Verification Pending', badgeClass: 'border-purple-500/30 text-purple-500 bg-purple-500/5', dotColor: 'bg-purple-500' }
                      : getStatusStyle(opStatus);
                    const unread = unreadMap.get(order.binance_order_number) || 0;

                    return (
                      <TableRow
                        key={order.id}
                        className="border-border cursor-pointer hover:bg-secondary/50 transition-colors"
                        onClick={() => setSelectedOrder(order)}
                      >
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
                            {order.additional_kyc_verify === 1 && (
                              <Badge variant="outline" className="text-[9px] w-fit border-amber-500/30 text-amber-500 bg-amber-500/5 gap-0.5">
                                <ShieldAlert className="h-2.5 w-2.5" />
                                Requires Verification
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

                        {/* Status */}
                        <TableCell className="py-3">
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className={`text-[10px] w-fit ${style.badgeClass}`}>
                              {style.label}
                            </Badge>
                            {isActive && order.binance_create_time && (
                              <OrderRowTimer createTime={typeof order.binance_create_time === 'number' ? order.binance_create_time : new Date(order.binance_create_time).getTime()} />
                            )}
                          </div>
                        </TableCell>

                        {/* Chat */}
                        <TableCell className="py-3 text-right">
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
    </div>
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
function OrderRowTimer({ createTime }: { createTime: number }) {
  const timeStr = format(new Date(createTime), 'HH:mm');
  return (
    <span className="text-[10px] text-muted-foreground tabular-nums">{timeStr}</span>
  );
}
