import { Card, CardContent } from '@/components/ui/card';
import { ShoppingCart, Clock, TrendingUp, AlertTriangle, IndianRupee, BarChart3, Percent, ArrowLeftRight, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

function formatVolume(v: number): string {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

interface MetricCardsProps {
  activeOrders: number;
  pendingPayments: number;
  completedToday: number;
  appeals: number;
  totalBuyVolume: number;
  totalSellVolume: number;
  avgOrderSize: number;
  completionRate: number;
  buySellRatio: string;
  isLoading: boolean;
}

export function MetricCards({
  activeOrders, pendingPayments, completedToday, appeals,
  totalBuyVolume, totalSellVolume, avgOrderSize, completionRate, buySellRatio,
  isLoading,
}: MetricCardsProps) {
  const avg = avgOrderSize || 0;
  const rate = completionRate || 0;
  const ratio = buySellRatio || '0 / 0';

  const cards = [
    { label: 'Active Orders', formatted: String(activeOrders || 0), icon: ShoppingCart, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Pending Payments', formatted: String(pendingPayments || 0), icon: Clock, color: 'text-trade-pending', bg: 'bg-trade-pending/10' },
    { label: 'Completed Today', formatted: String(completedToday || 0), icon: TrendingUp, color: 'text-trade-buy', bg: 'bg-trade-buy/10' },
    { label: 'Appeals', formatted: String(appeals || 0), icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
    { label: 'Buy Volume', formatted: formatVolume(totalBuyVolume || 0), icon: ArrowDownLeft, color: 'text-trade-buy', bg: 'bg-trade-buy/10' },
    { label: 'Sell Volume', formatted: formatVolume(totalSellVolume || 0), icon: ArrowUpRight, color: 'text-trade-sell', bg: 'bg-trade-sell/10' },
    { label: 'Avg Order Size', formatted: `₹${avg.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, icon: BarChart3, color: 'text-accent-foreground', bg: 'bg-accent/30' },
    { label: 'Completion Rate', formatted: `${rate.toFixed(1)}%`, icon: Percent, color: 'text-trade-buy', bg: 'bg-trade-buy/10' },
    { label: 'Buy / Sell', formatted: ratio, icon: ArrowLeftRight, color: 'text-muted-foreground', bg: 'bg-secondary' },
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
