import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Hash, User, CreditCard } from 'lucide-react';
import { ChatPanel } from './ChatPanel';
import { ChatConversation } from './ChatInbox';
import { mapToOperationalStatus, getStatusStyle } from '@/lib/orderStatusMapper';

interface Props {
  conversation: ChatConversation;
  onBack: () => void;
}

/** Standalone chat thread view with order context sidebar */
export function ChatThreadView({ conversation: c, onBack }: Props) {
  const numStatusMap: Record<number, string> = {
    1: 'TRADING', 2: 'BUYER_PAYED', 3: 'BUYER_PAYED', 4: 'COMPLETED',
    5: 'APPEAL', 6: 'CANCELLED', 7: 'CANCELLED_BY_SYSTEM', 8: 'APPEAL',
  };
  const rawStatus = isNaN(Number(c.orderStatus))
    ? c.orderStatus
    : (numStatusMap[Number(c.orderStatus)] || c.orderStatus);
  const opStatus = mapToOperationalStatus(rawStatus, c.tradeType);
  const statusStyle = getStatusStyle(opStatus);

  return (
    <div className="flex flex-col h-full">
      {/* Header with order context */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-foreground truncate">
              {c.counterpartyNickname}
            </span>
            <span className={`text-[10px] t-mono uppercase font-bold ${c.tradeType === 'BUY' ? 'text-trade-buy' : 'text-trade-sell'}`}>
              {c.tradeType}
            </span>
            <Badge variant="outline" className={`text-[8px] gap-1 ${statusStyle.badgeClass}`}>
              {statusStyle.label}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] t-mono text-muted-foreground bg-secondary border border-border px-1.5 rounded">
              #{c.orderNumber.slice(-8)}
            </span>
            <span className="text-[10px] t-mono text-muted-foreground tabular-nums">
              {Number(c.amount).toFixed(2)} {c.asset} · ₹{Number(c.totalPrice).toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </div>


      {/* Chat panel — reuse existing */}
      <div className="flex-1 min-h-0">
        <ChatPanel
          orderId={c.orderNumber}
          orderNumber={c.orderNumber}
          counterpartyId={null}
          counterpartyNickname={c.counterpartyNickname}
          tradeType={c.tradeType}
          orderStatus={rawStatus}
        />
      </div>
    </div>
  );
}
