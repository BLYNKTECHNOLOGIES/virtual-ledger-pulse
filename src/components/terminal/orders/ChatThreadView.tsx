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
    1: 'PENDING', 2: 'TRADING', 3: 'BUYER_PAYED', 4: 'BUYER_PAYED',
    5: 'COMPLETED', 6: 'CANCELLED', 7: 'CANCELLED', 8: 'APPEAL',
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
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground truncate">
              {c.counterpartyNickname}
            </span>
            <span className={`text-[10px] font-bold ${c.tradeType === 'BUY' ? 'text-trade-buy' : 'text-trade-sell'}`}>
              {c.tradeType}
            </span>
            <Badge variant="outline" className={`text-[8px] ${statusStyle.badgeClass}`}>
              {statusStyle.label}
            </Badge>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-muted-foreground">
              #{c.orderNumber.slice(-8)}
            </span>
            <span className="text-[10px] text-muted-foreground">
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
        />
      </div>
    </div>
  );
}
