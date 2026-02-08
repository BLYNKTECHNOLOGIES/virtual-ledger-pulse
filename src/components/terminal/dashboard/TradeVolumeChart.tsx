import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { C2COrderHistoryItem } from '@/hooks/useBinanceOrders';
import { TimePeriod } from './TimePeriodFilter';

interface Props {
  orders: C2COrderHistoryItem[];
  isLoading: boolean;
  period: TimePeriod;
}

export function TradeVolumeChart({ orders, isLoading, period }: Props) {
  const chartData = useMemo(() => {
    if (!orders.length) return [];

    // Group completed orders by date
    const completed = orders.filter(o => (o.orderStatus || '').toUpperCase().includes('COMPLETED'));
    const byDate = new Map<string, { buy: number; sell: number }>();

    for (const o of completed) {
      const date = new Date(o.createTime).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      const entry = byDate.get(date) || { buy: 0, sell: 0 };
      const price = parseFloat(o.totalPrice || '0');
      if (o.tradeType === 'BUY') entry.buy += price;
      else entry.sell += price;
      byDate.set(date, entry);
    }

    return Array.from(byDate.entries()).map(([date, v]) => ({
      date,
      buy: Math.round(v.buy),
      sell: Math.round(v.sell),
    }));
  }, [orders]);

  const totalVolume = chartData.reduce((s, d) => s + d.buy + d.sell, 0);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
            <Activity className="h-4 w-4 text-accent-yellow" />
            Trade Volume
          </CardTitle>
          {!isLoading && (
            <span className="text-xs text-muted-foreground tabular-nums">
              ₹{totalVolume.toLocaleString('en-IN')}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : chartData.length === 0 ? (
          <div className="h-48 flex items-center justify-center">
            <p className="text-xs text-muted-foreground">No completed trades in this period</p>
          </div>
        ) : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="buyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22C55E" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#22C55E" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="sellGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#EF4444" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#EF4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#232734" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6B7285' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#6B7285' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1E2230',
                    border: '1px solid #2A2F3A',
                    borderRadius: '6px',
                    fontSize: '11px',
                    color: '#E6EAF2',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  }}
                  formatter={(value: number, name: string) => [`₹${value.toLocaleString('en-IN')}`, name === 'buy' ? 'Buy' : 'Sell']}
                />
                <Area type="monotone" dataKey="buy" stroke="#22C55E" fill="url(#buyGrad)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="sell" stroke="#EF4444" fill="url(#sellGrad)" strokeWidth={1.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
