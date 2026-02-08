import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, History, User } from 'lucide-react';
import { P2POrderRecord } from '@/hooks/useP2PTerminal';
import { OrderSummaryPanel } from './OrderSummaryPanel';
import { ChatPanel } from './ChatPanel';
import { PastInteractionsPanel } from './PastInteractionsPanel';
import { useP2PCounterparty } from '@/hooks/useP2PTerminal';

interface Props {
  order: P2POrderRecord;
  onClose: () => void;
}

export function OrderDetailWorkspace({ order, onClose }: Props) {
  const [rightPanel, setRightPanel] = useState<'profile' | 'history'>('profile');
  const { data: counterparty } = useP2PCounterparty(order.counterparty_id);

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">
            Order #{order.binance_order_number.slice(-8)}
          </span>
          <span className={`text-[10px] font-semibold ${order.trade_type === 'BUY' ? 'text-trade-buy' : 'text-trade-sell'}`}>
            {order.trade_type}
          </span>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClose}>
          Close
        </Button>
      </div>

      {/* 3-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Order Summary */}
        <div className="w-[280px] border-r border-border overflow-y-auto bg-card shrink-0">
          <OrderSummaryPanel order={order} />
        </div>

        {/* Middle: Chat */}
        <div className="flex-1 flex flex-col min-w-0 bg-background">
          <ChatPanel
            orderId={order.id}
            counterpartyId={order.counterparty_id}
            counterpartyNickname={order.counterparty_nickname}
          />
        </div>

        {/* Right: Profile / Past Interactions toggle */}
        <div className="w-[280px] border-l border-border overflow-hidden bg-card shrink-0 flex flex-col">
          {/* Toggle */}
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
            <CounterpartyProfile counterparty={counterparty} order={order} />
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

function CounterpartyProfile({ counterparty, order }: { counterparty: any; order: P2POrderRecord }) {
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

      {counterparty && (
        <div className="space-y-3 pt-3 border-t border-border">
          <StatRow label="Total Orders" value={String(counterparty.total_buy_orders + counterparty.total_sell_orders)} />
          <StatRow label="Buy Orders" value={String(counterparty.total_buy_orders)} />
          <StatRow label="Sell Orders" value={String(counterparty.total_sell_orders)} />
          <StatRow label="Total Volume" value={`₹${Number(counterparty.total_volume_inr).toLocaleString('en-IN')}`} />
          <StatRow label="First Seen" value={new Date(counterparty.first_seen_at).toLocaleDateString('en-IN')} />
          <StatRow label="Last Seen" value={new Date(counterparty.last_seen_at).toLocaleDateString('en-IN')} />
        </div>
      )}

      <div className="pt-3 border-t border-border">
        <p className="text-[9px] text-muted-foreground/60 leading-relaxed">
          ⚠ Binance C2C SAPI does not expose counterparty profile details (completion rate, trade count, merchant badge). Data shown is from local tracking only.
        </p>
      </div>
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
