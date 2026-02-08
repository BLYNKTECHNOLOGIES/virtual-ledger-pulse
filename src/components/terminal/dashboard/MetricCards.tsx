import { Card, CardContent } from '@/components/ui/card';
import { ShoppingCart, Clock, TrendingUp, AlertTriangle, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface MetricCardsProps {
  activeOrders: number;
  pendingPayments: number;
  completedToday: number;
  appeals: number;
  isLoading: boolean;
}

export function MetricCards({ activeOrders, pendingPayments, completedToday, appeals, isLoading }: MetricCardsProps) {
  const cards = [
    { label: 'Active Orders', value: activeOrders, icon: ShoppingCart, color: 'text-primary' },
    { label: 'Pending Payments', value: pendingPayments, icon: Clock, color: 'text-trade-pending' },
    { label: 'Completed Today', value: completedToday, icon: TrendingUp, color: 'text-trade-buy' },
    { label: 'Appeals', value: appeals, icon: AlertTriangle, color: 'text-destructive' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <Card key={c.label} className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <c.icon className={`h-4 w-4 ${c.color}`} />
            </div>
            {isLoading ? (
              <Skeleton className="h-8 w-16 mb-1" />
            ) : (
              <p className="text-2xl font-bold text-foreground tabular-nums">{c.value}</p>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">{c.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
