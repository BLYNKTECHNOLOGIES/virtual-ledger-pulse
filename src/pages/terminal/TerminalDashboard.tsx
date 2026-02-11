import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Megaphone, ShoppingCart, ArrowUpRight, RefreshCw } from 'lucide-react';
import { MetricCards } from '@/components/terminal/dashboard/MetricCards';
import { TradeVolumeChart } from '@/components/terminal/dashboard/TradeVolumeChart';
import { AdPerformanceWidget } from '@/components/terminal/dashboard/AdPerformanceWidget';
import { OperationalAlerts } from '@/components/terminal/dashboard/OperationalAlerts';
import { OrderStatusBreakdown } from '@/components/terminal/dashboard/OrderStatusBreakdown';
import { computeOrderStats, C2COrderHistoryItem } from '@/hooks/useBinanceOrders';
import { useBinanceOrderHistory } from '@/hooks/useBinanceActions';

export default function TerminalDashboard() {
  const { data: rawOrders = [], isLoading: ordersLoading, refetch, isFetching } = useBinanceOrderHistory();

  // Map raw order data to C2COrderHistoryItem shape for computeOrderStats
  const orders: C2COrderHistoryItem[] = useMemo(() => {
    if (!Array.isArray(rawOrders)) return [];
    return rawOrders.map((o: any) => ({
      orderNumber: o.orderNumber || '',
      advNo: o.advNo || '',
      tradeType: o.tradeType || '',
      asset: o.asset || 'USDT',
      fiatUnit: o.fiat || o.fiatUnit || 'INR',
      orderStatus: String(o.orderStatus || ''),
      amount: String(o.amount || '0'),
      totalPrice: String(o.totalPrice || '0'),
      unitPrice: String(o.unitPrice || '0'),
      commission: String(o.commission || '0'),
      counterPartNickName: o.counterPartNickName || o.buyerNickname || o.sellerNickname || '',
      createTime: o.createTime || 0,
      payMethodName: o.payMethodName,
    }));
  }, [rawOrders]);

  const stats = useMemo(() => computeOrderStats(orders), [orders]);

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">P2P Trading Operations · Last 30 Days</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{orders.length} orders loaded</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Metric cards */}
      <MetricCards
        activeOrders={stats.activeOrders}
        pendingPayments={stats.pendingPayments}
        completedToday={stats.completedToday}
        appeals={stats.appeals}
        totalVolume={stats.totalVolume}
        avgOrderSize={stats.avgOrderSize}
        completionRate={stats.completionRate}
        buySellRatio={stats.buySellRatio}
        isLoading={ordersLoading}
      />

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TradeVolumeChart orders={orders} isLoading={ordersLoading} period="30d" />
        <OrderStatusBreakdown orders={orders} isLoading={ordersLoading} />
      </div>

      {/* Widgets row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AdPerformanceWidget />
        <OperationalAlerts orders={orders} isLoading={ordersLoading} />
      </div>

      {/* Quick access */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Link to="/terminal/ads">
          <Card className="bg-card border-border hover:border-primary/30 transition-colors cursor-pointer group">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Megaphone className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">Ads Manager</h3>
                <p className="text-[11px] text-muted-foreground">Create, edit & manage P2P ads</p>
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </CardContent>
          </Card>
        </Link>

        <Link to="/terminal/orders">
          <Card className="bg-card border-border hover:border-primary/30 transition-colors cursor-pointer group">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <ShoppingCart className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">Orders</h3>
                <p className="text-[11px] text-muted-foreground">View & manage P2P orders</p>
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
