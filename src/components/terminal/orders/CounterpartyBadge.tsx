import { Badge } from '@/components/ui/badge';
import { Repeat, UserPlus, Zap, LoaderCircle, CircleHelp } from 'lucide-react';

interface Props {
  repeatCount?: number;
  tradeType: string; // BUY or SELL
  isLoading?: boolean;
  isUnavailable?: boolean;
}

export function CounterpartyBadge({ repeatCount, tradeType, isLoading = false, isUnavailable = false }: Props) {
  if (isLoading) {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 border-border text-muted-foreground bg-muted/30">
        <LoaderCircle className="h-2.5 w-2.5 animate-spin" />
        Checking History
      </Badge>
    );
  }

  if (isUnavailable || repeatCount === undefined) {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 border-border text-muted-foreground bg-muted/30">
        <CircleHelp className="h-2.5 w-2.5" />
        History Unavailable
      </Badge>
    );
  }

  if (repeatCount === 0) {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 border-primary/30 text-primary bg-primary/5">
        <UserPlus className="h-2.5 w-2.5" />
        First Order
      </Badge>
    );
  }

  if (repeatCount >= 10) {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 border-border text-foreground bg-muted/30">
        <Zap className="h-2.5 w-2.5" />
        Completed {repeatCount}×
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-[10px] gap-1 border-border text-foreground bg-muted/30">
      <Repeat className="h-2.5 w-2.5" />
      Completed {repeatCount}×
    </Badge>
  );
}
