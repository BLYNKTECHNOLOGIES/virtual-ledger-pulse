import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ArrowLeft, User } from 'lucide-react';
import { ChatPanel } from './ChatPanel';
import { ChatConversation } from './ChatInbox';
import { CounterpartyDetailsPanel } from './CounterpartyDetailsPanel';
import { mapToOperationalStatus, getStatusStyle } from '@/lib/orderStatusMapper';

interface Props {
  conversation: ChatConversation;
  onBack: () => void;
}

/** Standalone chat thread view with order context sidebar */
export function ChatThreadView({ conversation: c, onBack }: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const numStatusMap: Record<number, string> = {
    1: 'TRADING', 2: 'BUYER_PAYED', 3: 'BUYER_PAYED', 4: 'COMPLETED',
    5: 'APPEAL', 6: 'CANCELLED', 7: 'CANCELLED_BY_SYSTEM', 8: 'APPEAL',
  };
  const rawStatus = isNaN(Number(c.orderStatus))
    ? c.orderStatus
    : (numStatusMap[Number(c.orderStatus)] || c.orderStatus);
  const opStatus = mapToOperationalStatus(rawStatus, c.tradeType);
  const statusStyle = getStatusStyle(opStatus);
  // Chats Binance delivers without an order behind them (ad enquiries) have no
  // side, status or amount to show.
  const isEnquiry = c.orderNumber.startsWith('INQ-');

  const details = (
    <CounterpartyDetailsPanel
      orderNumber={c.orderNumber}
      counterpartyNickname={c.counterpartyNickname}
      counterpartyVerifiedName={c.verifiedName}
      tradeType={c.tradeType}
      exchangeAccountId={c.exchangeAccountId}
      orderTotal={!c.fiatUnit || c.fiatUnit === 'INR' ? Number(c.totalPrice) || 0 : 0}
      orderCounts={!['Cancelled', 'Expired'].includes(opStatus)}
    />
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header with order context */}
      <div className="flex h-12 shrink-0 items-center gap-2 px-2 sm:px-4 border-b border-border bg-card">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onBack} aria-label="Back to chats" title="Back to chats">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[13px] font-medium text-foreground truncate">
              {c.counterpartyNickname}
            </span>
            {isEnquiry ? (
              <Badge variant="outline" className="h-5 shrink-0 px-2 text-[10px] font-medium text-muted-foreground">
                Enquiry · no order
              </Badge>
            ) : (
              <>
                <span className={`shrink-0 text-[10px] t-mono uppercase font-bold ${c.tradeType === 'BUY' ? 'text-trade-buy' : 'text-trade-sell'}`}>
                  {c.tradeType}
                </span>
                <Badge variant="outline" className={`h-5 shrink-0 gap-1 rounded-full px-2 text-[10px] font-medium ${statusStyle.badgeClass}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dotColor}`} />
                  {statusStyle.label}
                </Badge>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 min-w-0">
            {c.verifiedName && (
              <span className="hidden sm:inline truncate text-[11px] text-muted-foreground">{c.verifiedName}</span>
            )}
            {!isEnquiry && (
              <span
                className="min-w-0 truncate text-[11px] t-mono text-muted-foreground tabular-nums"
                title={`Order ${c.orderNumber}`}
              >
                ₹{Number(c.totalPrice).toLocaleString('en-IN')} · {Number(c.amount).toFixed(2)} {c.asset} · #{c.orderNumber.slice(-8)}
              </span>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0 text-xs gap-1.5 lg:hidden"
          onClick={() => setShowDetails(true)}
        >
          <User className="h-3.5 w-3.5" />
          Details
        </Button>
      </div>

      {/* Chat + counterparty details */}
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 min-h-0">
          <ChatPanel
            key={`${c.exchangeAccountId ?? 'default'}:${c.orderNumber}`}
            orderId={c.orderNumber}
            orderNumber={c.orderNumber}
            counterpartyId={null}
            counterpartyNickname={c.counterpartyNickname}
            tradeType={c.tradeType}
            orderStatus={rawStatus}
            orderAsset={c.asset}
            orderFiat="INR"
            orderQuantity={c.amount}
            orderType={null}
            exchangeAccountId={c.exchangeAccountId}
          />
        </div>
        <aside className="hidden lg:flex w-[320px] shrink-0 border-l border-border bg-card flex-col min-h-0">
          {details}
        </aside>
      </div>

      <Sheet open={showDetails} onOpenChange={setShowDetails}>
        <SheetContent side="right" className="w-[90vw] sm:w-[380px] p-0 bg-card">
          <SheetHeader className="px-4 py-3 border-b border-border">
            <SheetTitle className="text-sm">Counterparty details</SheetTitle>
          </SheetHeader>
          <div className="h-[calc(100%-45px)]">{details}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
