import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { History, ExternalLink } from 'lucide-react';
import { useCounterpartyOrders, P2POrderRecord } from '@/hooks/useP2PTerminal';
import { format } from 'date-fns';
import { mapToOperationalStatus, getStatusStyle } from '@/lib/orderStatusMapper';

interface Props {
  counterpartyId: string | null;
  currentOrderId: string;
  onSelectOrder?: (orderId: string) => void;
}

export function PastInteractionsPanel({ counterpartyId, currentOrderId, onSelectOrder }: Props) {
  const { data: pastOrders = [], isLoading } = useCounterpartyOrders(counterpartyId, currentOrderId);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <History className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-foreground">Past Interactions</span>
        <Badge variant="outline" className="text-[9px] ml-auto">
          {pastOrders.length} orders
        </Badge>
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-4 text-xs text-muted-foreground">Loading...</div>
        ) : pastOrders.length === 0 ? (
          <div className="p-6 text-center">
            <History className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No previous interactions</p>
          </div>
        ) : (
          <div className="p-2 space-y-1.5">
            {pastOrders.map((order) => (
              <PastOrderCard
                key={order.id}
                order={order}
                onClick={() => onSelectOrder?.(order.id)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function PastOrderCard({ order, onClick }: { order: P2POrderRecord; onClick: () => void }) {
  const op = mapToOperationalStatus(order.order_status, order.trade_type);
  const style = getStatusStyle(op);
  const tradeColor = order.trade_type === 'BUY' ? 'text-trade-buy' : 'text-trade-sell';

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 rounded-md bg-secondary/50 hover:bg-secondary transition-colors group"
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-semibold ${tradeColor}`}>{order.trade_type}</span>
          <span className="text-[10px] text-muted-foreground">
            #{order.binance_order_number.slice(-8)}
          </span>
        </div>
        <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground tabular-nums">
          ₹{Number(order.total_price).toLocaleString('en-IN')}
        </span>
        <Badge variant="outline" className={`text-[9px] ${style.badgeClass}`}>
          {style.label}
        </Badge>
      </div>

      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[10px] text-muted-foreground">
          {order.amount} {order.asset}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {order.binance_create_time
            ? format(new Date(order.binance_create_time), 'dd MMM yy')
            : '—'}
        </span>
      </div>
    </button>
  );
}
