import { ShoppingCart, Clock, TrendingUp, AlertTriangle, BarChart3, Percent, ArrowLeftRight, ArrowDownLeft, ArrowUpRight, Send } from 'lucide-react';

function formatVolume(v: number): string {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

interface MetricCardsProps {
  activeOrders: number;
  awaitingPayment: number;
  awaitingRelease: number;
  completedInPeriod: number;
  appeals: number;
  totalBuyVolume: number;
  totalSellVolume: number;
  avgOrderSize: number;
  completionRate: number;
  buySellRatio: string;
  isLoading: boolean;
  periodLabel?: string;
}

export function MetricCards({
  activeOrders, awaitingPayment, awaitingRelease, completedInPeriod, appeals,
  totalBuyVolume, totalSellVolume, avgOrderSize, completionRate, buySellRatio,
  isLoading, periodLabel,
}: MetricCardsProps) {
  const avg = avgOrderSize || 0;
  const rate = completionRate || 0;
  const ratio = buySellRatio || '0 / 0';
  const completedLabel = periodLabel ? `Completed · ${periodLabel}` : 'Completed';

  const cards = [
    { label: 'Active Orders', formatted: String(activeOrders || 0), icon: ShoppingCart, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Awaiting Payment', formatted: String(awaitingPayment || 0), icon: Clock, color: 'text-trade-pending', bg: 'bg-trade-pending/10' },
    { label: 'Awaiting Release', formatted: String(awaitingRelease || 0), icon: Send, color: 'text-warning', bg: 'bg-warning/10' },
    { label: completedLabel, formatted: String(completedInPeriod || 0), icon: TrendingUp, color: 'text-trade-buy', bg: 'bg-trade-buy/10' },
    { label: 'Appeals', formatted: String(appeals || 0), icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
    { label: 'Buy Volume', formatted: formatVolume(totalBuyVolume || 0), icon: ArrowDownLeft, color: 'text-trade-buy', bg: 'bg-trade-buy/10' },
    { label: 'Sell Volume', formatted: formatVolume(totalSellVolume || 0), icon: ArrowUpRight, color: 'text-trade-sell', bg: 'bg-trade-sell/10' },
    { label: 'Avg Order Size', formatted: `₹${avg.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, icon: BarChart3, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Completion Rate', formatted: `${rate.toFixed(1)}%`, icon: Percent, color: 'text-trade-buy', bg: 'bg-trade-buy/10' },
    { label: 'Buy / Sell', formatted: ratio, icon: ArrowLeftRight, color: 'text-muted-foreground', bg: 'bg-secondary' },
  ];

  return (
    <div className="t-stagger grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className="t-panel p-4 relative transition-[border-color,box-shadow] duration-200 hover:border-primary/30 hover:shadow-[var(--glow-primary)]"
        >
          <div className="flex items-center gap-2.5 mb-3">
            <div className={`h-8 w-8 rounded-md ${c.bg} flex items-center justify-center shrink-0`}>
              <c.icon className={`h-4 w-4 ${c.color}`} />
            </div>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground leading-tight">{c.label}</span>
          </div>
          {isLoading ? (
            <div className="t-shimmer h-8 w-20 rounded" />
          ) : (
            <p className="text-2xl font-semibold t-mono text-foreground tracking-tight">{c.formatted}</p>
          )}
        </div>
      ))}
    </div>
  );
}
