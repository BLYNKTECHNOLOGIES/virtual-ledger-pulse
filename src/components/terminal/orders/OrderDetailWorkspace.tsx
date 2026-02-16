import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, History, User, BarChart3, ArrowLeft, CheckCircle2, Calendar, Shield, FileText } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { CounterpartyPanInput } from './CounterpartyPanInput';
import { CounterpartyContactInput } from './CounterpartyContactInput';
import { P2POrderRecord } from '@/hooks/useP2PTerminal';
import { OrderSummaryPanel } from './OrderSummaryPanel';
import { ChatPanel } from './ChatPanel';
import { PastInteractionsPanel } from './PastInteractionsPanel';
import { useP2PCounterparty, useP2PCounterpartyByNickname } from '@/hooks/useP2PTerminal';
import { useCounterpartyBinanceStats, useBinanceOrderDetail, useBinanceOrderLiveStatus, useCounterpartyCompletedOrderCount } from '@/hooks/useBinanceActions';

interface Props {
  order: P2POrderRecord;
  onClose: () => void;
}

export function OrderDetailWorkspace({ order, onClose }: Props) {
  const [rightPanel, setRightPanel] = useState<'profile' | 'history'>('profile');
  const [mobileTab, setMobileTab] = useState<'details' | 'chat' | 'profile'>('chat');
  const isMobile = useIsMobile();
  const { data: counterpartyById } = useP2PCounterparty(order.counterparty_id);
  const { data: counterpartyByNick } = useP2PCounterpartyByNickname(!order.counterparty_id ? order.counterparty_nickname : null);
  const counterparty = counterpartyById || counterpartyByNick;
  const { data: binanceStats } = useCounterpartyBinanceStats(order.binance_order_number);
  const { data: liveDetail } = useBinanceOrderDetail(order.binance_order_number);
  const { data: historyOrder } = useBinanceOrderLiveStatus(order.binance_order_number);

  const liveOrder = useMemo(() => {
    const numStatusMap: Record<number, string> = {
      1: 'PENDING', 2: 'TRADING', 3: 'BUYER_PAYED', 4: 'BUYER_PAYED',
      5: 'COMPLETED', 6: 'CANCELLED', 7: 'CANCELLED', 8: 'APPEAL',
    };
    let liveStatus = order.order_status;
    if (historyOrder?.orderStatus && typeof historyOrder.orderStatus === 'string') {
      liveStatus = historyOrder.orderStatus.toUpperCase();
    } else if (liveDetail?.data) {
      const detail = liveDetail.data;
      const raw = detail.orderStatus ?? detail.tradeStatus ?? detail.status;
      if (typeof raw === 'number') {
        liveStatus = numStatusMap[raw] || liveStatus;
      } else if (typeof raw === 'string' && raw.length > 0) {
        liveStatus = raw.toUpperCase();
      }
    }
    let unitPrice = order.unit_price;
    if (historyOrder?.unitPrice) {
      unitPrice = parseFloat(historyOrder.unitPrice) || unitPrice;
    }
    return { ...order, order_status: liveStatus, unit_price: unitPrice };
  }, [order, liveDetail, historyOrder]);

  const counterpartyVerifiedName = useMemo(() => {
    const detail = liveDetail?.data;
    if (!detail) return undefined;
    return order.trade_type === 'BUY' ? detail.sellerName : detail.buyerName;
  }, [liveDetail, order.trade_type]);

  const topBar = (
    <div className="flex items-center justify-between px-3 md:px-4 py-2 border-b border-border bg-card">
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
  );

  const chatContent = (
    <ChatPanel
      orderId={order.id}
      orderNumber={order.binance_order_number}
      counterpartyId={order.counterparty_id}
      counterpartyNickname={order.counterparty_nickname}
      tradeType={order.trade_type}
      counterpartyVerifiedName={counterpartyVerifiedName}
    />
  );

  const profileContent = (
    <>
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
        <CounterpartyProfile counterparty={counterparty} order={order} binanceStats={binanceStats} counterpartyNickname={order.counterparty_nickname} counterpartyVerifiedName={counterpartyVerifiedName} />
      ) : (
        <PastInteractionsPanel counterpartyId={order.counterparty_id} currentOrderId={order.id} />
      )}
    </>
  );

  // Mobile layout: tabbed single-panel view
  if (isMobile) {
    return (
      <div className="flex flex-col h-full">
        {topBar}
        <div className="px-2 py-1.5 border-b border-border bg-card shrink-0">
          <Tabs value={mobileTab} onValueChange={(v) => setMobileTab(v as any)}>
            <TabsList className="w-full h-8 bg-secondary">
              <TabsTrigger value="details" className="text-[10px] h-6 flex-1 gap-1">
                <FileText className="h-3 w-3" />
                Details
              </TabsTrigger>
              <TabsTrigger value="chat" className="text-[10px] h-6 flex-1 gap-1">
                <MessageSquare className="h-3 w-3" />
                Chat
              </TabsTrigger>
              <TabsTrigger value="profile" className="text-[10px] h-6 flex-1 gap-1">
                <User className="h-3 w-3" />
                Profile
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex-1 overflow-hidden flex flex-col">
          {mobileTab === 'details' && (
            <div className="h-full overflow-y-auto bg-card">
              <OrderSummaryPanel order={liveOrder} counterpartyVerifiedName={counterpartyVerifiedName} liveDetail={liveDetail?.data} />
            </div>
          )}
          {mobileTab === 'chat' && (
            <div className="h-full flex flex-col min-w-0 bg-background">
              {chatContent}
            </div>
          )}
          {mobileTab === 'profile' && (
            <div className="h-full overflow-hidden flex flex-col bg-card">
              {profileContent}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Desktop layout (unchanged 3-panel)
  return (
    <div className="flex flex-col h-full">
      {topBar}
      <div className="flex flex-1 overflow-hidden">
        <div className="w-[280px] border-r border-border overflow-y-auto bg-card shrink-0">
          <OrderSummaryPanel order={liveOrder} counterpartyVerifiedName={counterpartyVerifiedName} liveDetail={liveDetail?.data} />
        </div>
        <div className="flex-1 flex flex-col min-w-0 bg-background">
          {chatContent}
        </div>
        <div className="w-[280px] border-l border-border overflow-hidden bg-card shrink-0 flex flex-col">
          {profileContent}
        </div>
      </div>
    </div>
  );
}

function CounterpartyProfile({ counterparty, order, binanceStats, counterpartyNickname, counterpartyVerifiedName }: { counterparty: any; order: P2POrderRecord; binanceStats: any; counterpartyNickname: string; counterpartyVerifiedName?: string }) {
  const { data: completedWithUs } = useCounterpartyCompletedOrderCount(counterpartyVerifiedName, order.binance_order_number);
  // Parse Binance stats — API returns fields like completedOrderNum, finishRateLatest30Day, etc.
  const stats = binanceStats?.data || binanceStats;
  const hasApiStats = stats && (
    stats.completedOrderNum !== undefined ||
    stats.completedOrderNumOfLatest30day !== undefined ||
    stats.registerDays !== undefined
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* User identity */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
          <User className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{order.counterparty_nickname}</p>
          <p className="text-[10px] text-muted-foreground">Binance P2P User</p>
        </div>
      </div>

      {/* Registration & join info */}
      {hasApiStats && stats.registerDays !== undefined && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>Joined {stats.registerDays} days ago</span>
        </div>
      )}

      {/* Trade relationship with us */}
      {completedWithUs !== undefined && completedWithUs !== null && (
        <div className="bg-primary/5 border border-primary/20 rounded-md px-3 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-medium text-foreground">Orders Completed With Us</span>
          </div>
          <span className="text-sm font-bold text-primary tabular-nums">{completedWithUs}</span>
        </div>
      )}

      {/* Binance Trading Stats */}
      {hasApiStats && (
        <div className="space-y-3 pt-3 border-t border-border">
          <div className="flex items-center gap-1.5 mb-2">
            <BarChart3 className="h-3 w-3 text-primary" />
            <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">Trading Stats</span>
          </div>

          {/* Key stat cards */}
          <div className="grid grid-cols-2 gap-2">
            {stats.completedOrderNum !== undefined && (
              <StatCard
                label="All Trades"
                value={`${stats.completedOrderNum}`}
              />
            )}
            {stats.completedOrderNumOfLatest30day !== undefined && (
              <StatCard
                label="30d Trades"
                value={`${stats.completedOrderNumOfLatest30day}`}
              />
            )}
            {stats.finishRateLatest30Day !== undefined && (
              <StatCard label="30d Completion" value={`${(Number(stats.finishRateLatest30Day) * 100).toFixed(1)}%`} />
            )}
            {stats.finishRate !== undefined && (
              <StatCard label="Overall Rate" value={`${(Number(stats.finishRate) * 100).toFixed(1)}%`} />
            )}
          </div>

          {/* Timing stats */}
          <div className="space-y-2 pt-2">
            {stats.avgReleaseTimeOfLatest30day !== undefined && (
              <StatRow
                label="Avg Release (30d)"
                value={stats.avgReleaseTimeOfLatest30day === 0
                  ? '0 min'
                  : `${(stats.avgReleaseTimeOfLatest30day / 60).toFixed(1)} min`}
              />
            )}
            {stats.avgReleaseTime !== undefined && stats.avgReleaseTime > 0 && (
              <StatRow
                label="Avg Release (All)"
                value={`${(stats.avgReleaseTime / 60).toFixed(1)} min`}
              />
            )}
            {stats.avgPayTimeOfLatest30day !== undefined && (
              <StatRow
                label="Avg Pay Time (30d)"
                value={`${(stats.avgPayTimeOfLatest30day / 60).toFixed(1)} min`}
              />
            )}
            {stats.avgPayTime !== undefined && stats.avgPayTime > 0 && (
              <StatRow
                label="Avg Pay Time (All)"
                value={`${(stats.avgPayTime / 60).toFixed(1)} min`}
              />
            )}
          </div>

          {/* Relationship with us */}
          {stats.numberOfTradesWithCounterpartyCompleted30day !== undefined && (
            <div className="pt-2 border-t border-border/50">
              <StatRow
                label="Trades with us (30d)"
                value={String(stats.numberOfTradesWithCounterpartyCompleted30day)}
              />
            </div>
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

      {/* PAN Collection - only for BUY orders */}
      {order.trade_type === 'BUY' && (
        <CounterpartyPanInput counterpartyNickname={order.counterparty_nickname} />
      )}

      {/* Contact & State Collection */}
      <CounterpartyContactInput counterpartyNickname={order.counterparty_nickname} />
    </div>
  );
}

function StatCard({ label, value, subValues }: { label: string; value: string; subValues?: string }) {
  return (
    <div className="bg-secondary/50 rounded-md px-2.5 py-2 text-center">
      <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-bold text-foreground tabular-nums">{value}</p>
      {subValues && (
        <p className="text-[9px] text-muted-foreground mt-0.5 tabular-nums">{subValues}</p>
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
