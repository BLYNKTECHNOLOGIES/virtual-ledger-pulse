import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, History, User, BarChart3, ArrowLeft } from 'lucide-react';
import { P2POrderRecord } from '@/hooks/useP2PTerminal';
import { OrderSummaryPanel } from './OrderSummaryPanel';
import { ChatPanel } from './ChatPanel';
import { PastInteractionsPanel } from './PastInteractionsPanel';
import { useP2PCounterparty } from '@/hooks/useP2PTerminal';
import { useCounterpartyBinanceStats, useBinanceOrderDetail } from '@/hooks/useBinanceActions';

interface Props {
  order: P2POrderRecord;
  onClose: () => void;
}

export function OrderDetailWorkspace({ order, onClose }: Props) {
  const [rightPanel, setRightPanel] = useState<'profile' | 'history'>('profile');
  const { data: counterparty } = useP2PCounterparty(order.counterparty_id);
  const { data: binanceStats } = useCounterpartyBinanceStats(order.binance_order_number);
  const { data: liveDetail } = useBinanceOrderDetail(order.binance_order_number);

  // Use live status from order detail API if available, otherwise fall back to list status
  const liveOrder = useMemo(() => {
    if (!liveDetail?.data) return order;
    const detail = liveDetail.data;
    const statusMap: Record<number, string> = {
      1: 'PENDING', 2: 'TRADING', 3: 'BUYER_PAYED', 4: 'BUYER_PAYED',
      5: 'COMPLETED', 6: 'CANCELLED', 7: 'CANCELLED', 8: 'APPEAL',
    };
    const liveStatus = typeof detail.orderStatus === 'number'
      ? (statusMap[detail.orderStatus] || order.order_status)
      : (typeof detail.orderStatus === 'string' ? detail.orderStatus : order.order_status);
    return { ...order, order_status: liveStatus };
  }, [order, liveDetail]);

  // Extract counterparty verified name from live detail
  const counterpartyVerifiedName = useMemo(() => {
    const detail = liveDetail?.data;
    if (!detail) return undefined;
    // For BUY orders, counterparty is the seller; for SELL orders, counterparty is the buyer
    return order.trade_type === 'BUY' ? detail.sellerName : detail.buyerName;
  }, [liveDetail, order.trade_type]);

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs font-medium text-foreground">
            Order #{order.binance_order_number.slice(-8)}
          </span>
          <span className={`text-[10px] font-semibold ${order.trade_type === 'BUY' ? 'text-trade-buy' : 'text-trade-sell'}`}>
            {order.trade_type}
          </span>
        </div>
      </div>

      {/* 3-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Order Summary + Actions */}
        <div className="w-[280px] border-r border-border overflow-y-auto bg-card shrink-0">
          <OrderSummaryPanel order={liveOrder} counterpartyVerifiedName={counterpartyVerifiedName} />
        </div>

        {/* Middle: Chat */}
        <div className="flex-1 flex flex-col min-w-0 bg-background">
          <ChatPanel
            orderId={order.id}
            orderNumber={order.binance_order_number}
            counterpartyId={order.counterparty_id}
            counterpartyNickname={order.counterparty_nickname}
            tradeType={order.trade_type}
          />
        </div>

        {/* Right: Profile / Past Interactions toggle */}
        <div className="w-[280px] border-l border-border overflow-hidden bg-card shrink-0 flex flex-col">
          <div className="px-2 py-2 border-b border-border">
            <Tabs value={rightPanel} onValueChange={(v) => setRightPanel(v as any)}>
              <TabsList className="w-full h-8 bg-secondary">
                <TabsTrigger value="profile" className="text-[10px] h-6 flex-1 gap-1">
                  <User className="h-3 w-3" />
                  Profile
                </TabsTrigger>
                <TabsTrigger value="history" className="text-[10px] h-6 flex-1 gap-1">
                  <History className="h-3 w-3" />
                  History
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {rightPanel === 'profile' ? (
            <CounterpartyProfile counterparty={counterparty} order={order} binanceStats={binanceStats} />
          ) : (
            <PastInteractionsPanel
              counterpartyId={order.counterparty_id}
              currentOrderId={order.id}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function CounterpartyProfile({ counterparty, order, binanceStats }: { counterparty: any; order: P2POrderRecord; binanceStats: any }) {
  // Parse Binance stats from API response
  const stats = binanceStats?.data || binanceStats;
  const hasApiStats = stats && (stats.totalOrderCount !== undefined || stats.orderCount !== undefined || stats.monthFinishRate !== undefined);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
          <User className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{order.counterparty_nickname}</p>
          <p className="text-[10px] text-muted-foreground">Binance P2P User</p>
        </div>
      </div>

      {/* Binance API Stats */}
      {hasApiStats && (
        <div className="space-y-3 pt-3 border-t border-border">
          <div className="flex items-center gap-1.5 mb-2">
            <BarChart3 className="h-3 w-3 text-primary" />
            <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">Binance Stats</span>
          </div>
          {stats.totalOrderCount !== undefined && (
            <StatRow label="Total Orders" value={String(stats.totalOrderCount)} />
          )}
          {stats.orderCount !== undefined && (
            <StatRow label="Order Count" value={String(stats.orderCount)} />
          )}
          {stats.totalCompletedCount !== undefined && (
            <StatRow label="Completed" value={String(stats.totalCompletedCount)} />
          )}
          {stats.monthFinishRate !== undefined && (
            <StatRow label="30d Completion" value={`${(stats.monthFinishRate * 100).toFixed(1)}%`} />
          )}
          {stats.monthOrderCount !== undefined && (
            <StatRow label="30d Orders" value={String(stats.monthOrderCount)} />
          )}
          {stats.positiveRate !== undefined && (
            <StatRow label="Positive Rate" value={`${(stats.positiveRate * 100).toFixed(1)}%`} />
          )}
          {stats.avgReleaseTime !== undefined && (
            <StatRow label="Avg Release" value={`${Math.round(stats.avgReleaseTime / 60)}min`} />
          )}
          {stats.avgPayTime !== undefined && (
            <StatRow label="Avg Pay Time" value={`${Math.round(stats.avgPayTime / 60)}min`} />
          )}
        </div>
      )}

      {/* Local tracking stats */}
      {counterparty && (
        <div className="space-y-3 pt-3 border-t border-border">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Local Tracking</span>
          <StatRow label="Total Orders" value={String(counterparty.total_buy_orders + counterparty.total_sell_orders)} />
          <StatRow label="Buy Orders" value={String(counterparty.total_buy_orders)} />
          <StatRow label="Sell Orders" value={String(counterparty.total_sell_orders)} />
          <StatRow label="Total Volume" value={`₹${Number(counterparty.total_volume_inr).toLocaleString('en-IN')}`} />
          <StatRow label="First Seen" value={new Date(counterparty.first_seen_at).toLocaleDateString('en-IN')} />
          <StatRow label="Last Seen" value={new Date(counterparty.last_seen_at).toLocaleDateString('en-IN')} />
        </div>
      )}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground tabular-nums">{value}</span>
    </div>
  );
}
