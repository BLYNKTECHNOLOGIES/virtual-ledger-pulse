import { Badge } from '@/components/ui/badge';
import { Repeat, UserPlus, Zap, User } from 'lucide-react';

interface Props {
  isRepeat: boolean;
  repeatCount: number;
  tradeType: string; // BUY or SELL
}

export function CounterpartyBadge({ isRepeat, repeatCount, tradeType }: Props) {
  if (!isRepeat) {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 border-primary/30 text-primary bg-primary/5">
        <UserPlus className="h-2.5 w-2.5" />
        First Order
      </Badge>
    );
  }

  if (repeatCount >= 10) {
    return (
      <Badge className="text-[10px] gap-1 bg-accent-yellow-tint text-accent-yellow border border-accent-yellow/30">
        <Zap className="h-2.5 w-2.5" />
        High Frequency
      </Badge>
    );
  }

  const label = tradeType === 'BUY' ? 'Repeat Buyer' : 'Repeat Seller';
  const colorClass = tradeType === 'BUY'
    ? 'bg-trade-buy/10 text-trade-buy border-trade-buy/30'
    : 'bg-trade-sell/10 text-trade-sell border-trade-sell/30';

  return (
    <Badge variant="outline" className={`text-[10px] gap-1 ${colorClass}`}>
      <Repeat className="h-2.5 w-2.5" />
      {label} ({repeatCount})
    </Badge>
  );
}
