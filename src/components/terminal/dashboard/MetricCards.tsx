import { Card, CardContent } from '@/components/ui/card';
import { ShoppingCart, Clock, TrendingUp, AlertTriangle, IndianRupee, BarChart3, Percent, ArrowLeftRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface MetricCardsProps {
  activeOrders: number;
  pendingPayments: number;
  completedToday: number;
  appeals: number;
  totalVolume: number;
  avgOrderSize: number;
  completionRate: number;
  buySellRatio: string;
  isLoading: boolean;
}

export function MetricCards({
  activeOrders, pendingPayments, completedToday, appeals,
  totalVolume, avgOrderSize, completionRate, buySellRatio,
  isLoading,
}: MetricCardsProps) {
  const cards = [
    { label: 'Active Orders', value: activeOrders, formatted: String(activeOrders), icon: ShoppingCart, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Pending Payments', value: pendingPayments, formatted: String(pendingPayments), icon: Clock, color: 'text-trade-pending', bg: 'bg-trade-pending/10' },
    { label: 'Completed Today', value: completedToday, formatted: String(completedToday), icon: TrendingUp, color: 'text-trade-buy', bg: 'bg-trade-buy/10' },
    { label: 'Appeals', value: appeals, formatted: String(appeals), icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
    { label: 'Total Volume', value: totalVolume, formatted: `₹${totalVolume >= 100000 ? (totalVolume / 100000).toFixed(1) + 'L' : totalVolume.toLocaleString('en-IN')}`, icon: IndianRupee, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Avg Order Size', value: avgOrderSize, formatted: `₹${avgOrderSize.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, icon: BarChart3, color: 'text-accent-foreground', bg: 'bg-accent/30' },
    { label: 'Completion Rate', value: completionRate, formatted: `${completionRate.toFixed(1)}%`, icon: Percent, color: 'text-trade-buy', bg: 'bg-trade-buy/10' },
    { label: 'Buy / Sell', value: 0, formatted: buySellRatio, icon: ArrowLeftRight, color: 'text-muted-foreground', bg: 'bg-secondary' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((c) => (
        <Card key={c.label} className="bg-card border-border hover:border-primary/20 transition-colors">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between mb-2.5">
              <div className={`h-7 w-7 rounded-md ${c.bg} flex items-center justify-center`}>
                <c.icon className={`h-3.5 w-3.5 ${c.color}`} />
              </div>
            </div>
            {isLoading ? (
              <Skeleton className="h-7 w-16 mb-1" />
            ) : (
              <p className="text-xl font-bold text-foreground tabular-nums tracking-tight">{c.formatted}</p>
            )}
            <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">{c.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
