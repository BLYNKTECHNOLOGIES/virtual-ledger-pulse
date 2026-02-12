import { format } from 'date-fns';
import { ArrowUpDown } from 'lucide-react';

interface Props {
  orderNumber: string;
  tradeType: string;
  asset: string | null;
  totalPrice: string | null;
  fiatUnit: string | null;
  orderDate: number;
}

export function OrderChatSeparator({ orderNumber, tradeType, asset, totalPrice, fiatUnit, orderDate }: Props) {
  const dateStr = orderDate ? format(new Date(orderDate), 'dd MMM yyyy, HH:mm') : '';
  const amountStr = totalPrice && fiatUnit ? `${fiatUnit} ${Number(totalPrice).toLocaleString('en-IN')}` : '';

  return (
    <div className="flex items-center gap-2 py-3 my-2">
      <div className="flex-1 h-px bg-border" />
      <div className="flex items-center gap-1.5 bg-muted/50 border border-border/60 rounded-full px-3 py-1">
        <ArrowUpDown className="h-2.5 w-2.5 text-muted-foreground" />
        <span className="text-[9px] text-muted-foreground font-medium">
          Order #{orderNumber.slice(-8)}
        </span>
        <span className={`text-[9px] font-semibold ${tradeType === 'BUY' ? 'text-trade-buy' : 'text-trade-sell'}`}>
          {tradeType}
        </span>
        {asset && (
          <span className="text-[9px] text-muted-foreground">{asset}</span>
        )}
        {amountStr && (
          <span className="text-[9px] text-foreground font-medium">{amountStr}</span>
        )}
        {dateStr && (
          <span className="text-[9px] text-muted-foreground">• {dateStr}</span>
        )}
      </div>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}
