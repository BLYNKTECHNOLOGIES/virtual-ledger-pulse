import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ShoppingCart, RefreshCw, Search, ArrowUpDown } from 'lucide-react';
import { useBinanceActiveOrders } from '@/hooks/useBinanceActions';
import { C2COrderHistoryItem } from '@/hooks/useBinanceOrders';
import { useP2POrders, useSyncOrders, P2POrderRecord } from '@/hooks/useP2PTerminal';
import { CounterpartyBadge } from '@/components/terminal/orders/CounterpartyBadge';
import { OrderDetailWorkspace } from '@/components/terminal/orders/OrderDetailWorkspace';
import { format } from 'date-fns';

/** Map listActiveOrders response items to C2COrderHistoryItem for sync */
function mapActiveOrderToHistoryItem(o: any): C2COrderHistoryItem {
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

/** Convert numeric orderStatus to string status */
function mapOrderStatusCode(code: number | string): string {
  if (typeof code === 'string') return code;
  const statusMap: Record<number, string> = {
    1: 'PENDING',
    2: 'TRADING',
    3: 'BUYER_PAYED',
    4: 'BUYER_PAYED',
    5: 'COMPLETED',
    6: 'APPEAL',
    7: 'CANCELLED',
    8: 'CANCELLED',
  };
  return statusMap[code] || 'TRADING';
}

export default function TerminalOrders() {
  const [tradeFilter, setTradeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<P2POrderRecord | null>(null);

  // Fetch active orders from Binance (working endpoint)
  const { data: activeOrdersData, isLoading: binanceLoading, refetch, isFetching } = useBinanceActiveOrders();

  // Sync to local DB
  const syncOrders = useSyncOrders();
  
  const binanceOrders: C2COrderHistoryItem[] = useMemo(() => {
    const rawOrders = activeOrdersData?.data || activeOrdersData || [];
    if (!Array.isArray(rawOrders)) return [];
    return rawOrders.map(mapActiveOrderToHistoryItem);
  }, [activeOrdersData]);

  useEffect(() => {
    if (binanceOrders.length > 0 && !syncOrders.isPending) {
      syncOrders.mutate(binanceOrders);
    }
  }, [binanceOrders.length]);

  // Local DB orders with filters
  const localFilters = useMemo(() => ({
    tradeType: tradeFilter !== 'all' ? tradeFilter : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    search: search || undefined,
  }), [tradeFilter, statusFilter, search]);

  const { data: orders = [], isLoading: localLoading } = useP2POrders(localFilters);
  const isLoading = binanceLoading || localLoading;

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
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Sync
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={tradeFilter} onValueChange={setTradeFilter}>
          <TabsList className="h-8 bg-secondary">
            <TabsTrigger value="all" className="text-[11px] h-6 px-3">All</TabsTrigger>
            <TabsTrigger value="BUY" className="text-[11px] h-6 px-3">Buy</TabsTrigger>
            <TabsTrigger value="SELL" className="text-[11px] h-6 px-3">Sell</TabsTrigger>
          </TabsList>
        </Tabs>

        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList className="h-8 bg-secondary">
            <TabsTrigger value="all" className="text-[11px] h-6 px-3">All Status</TabsTrigger>
            <TabsTrigger value="active" className="text-[11px] h-6 px-3">Active</TabsTrigger>
            <TabsTrigger value="COMPLETED" className="text-[11px] h-6 px-3">Completed</TabsTrigger>
            <TabsTrigger value="CANCEL" className="text-[11px] h-6 px-3">Cancelled</TabsTrigger>
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
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <ShoppingCart className="h-10 w-10 text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">No orders found</p>
              <p className="text-[11px] text-muted-foreground/60 mt-1">
                Orders will appear after syncing from Binance
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-[10px] text-muted-foreground font-medium w-[100px]">Side</TableHead>
                    <TableHead className="text-[10px] text-muted-foreground font-medium">Counterparty</TableHead>
                    <TableHead className="text-[10px] text-muted-foreground font-medium text-right">Amount</TableHead>
                    <TableHead className="text-[10px] text-muted-foreground font-medium text-right">Price</TableHead>
                    <TableHead className="text-[10px] text-muted-foreground font-medium">Payment</TableHead>
                    <TableHead className="text-[10px] text-muted-foreground font-medium">Status</TableHead>
                    <TableHead className="text-[10px] text-muted-foreground font-medium">Client</TableHead>
                    <TableHead className="text-[10px] text-muted-foreground font-medium text-right">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow
                      key={order.id}
                      className="border-border cursor-pointer hover:bg-secondary/50 transition-colors"
                      onClick={() => setSelectedOrder(order)}
                    >
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            order.trade_type === 'BUY'
                              ? 'border-trade-buy/30 text-trade-buy bg-trade-buy/5'
                              : 'border-trade-sell/30 text-trade-sell bg-trade-sell/5'
                          }`}
                        >
                          {order.trade_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-foreground font-medium">
                          {order.counterparty_nickname}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-xs text-foreground tabular-nums">
                          {Number(order.amount).toFixed(2)} {order.asset}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-xs text-foreground tabular-nums font-medium">
                          ₹{Number(order.total_price).toLocaleString('en-IN')}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-[11px] text-muted-foreground">
                          {order.pay_method_name || '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <OrderStatusBadge status={order.order_status} />
                      </TableCell>
                      <TableCell>
                        <CounterpartyBadge
                          isRepeat={order.is_repeat_client}
                          repeatCount={order.repeat_order_count}
                          tradeType={order.trade_type}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {order.binance_create_time
                            ? format(new Date(order.binance_create_time), 'dd MMM HH:mm')
                            : '—'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OrderStatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  let label = status;
  let className = 'border-muted-foreground/30 text-muted-foreground';

  if (s.includes('COMPLETED')) { label = 'Completed'; className = 'border-trade-buy/30 text-trade-buy bg-trade-buy/5'; }
  else if (s.includes('CANCEL')) { label = 'Cancelled'; className = 'border-muted-foreground/30 text-muted-foreground'; }
  else if (s.includes('APPEAL')) { label = 'Appeal'; className = 'border-destructive/30 text-destructive bg-destructive/5'; }
  else if (s.includes('BUYER_PAYED')) { label = 'Paid'; className = 'border-primary/30 text-primary bg-primary/5'; }
  else if (s.includes('TRADING')) { label = 'Trading'; className = 'border-trade-pending/30 text-trade-pending bg-trade-pending/5'; }

  return <Badge variant="outline" className={`text-[10px] ${className}`}>{label}</Badge>;
}
