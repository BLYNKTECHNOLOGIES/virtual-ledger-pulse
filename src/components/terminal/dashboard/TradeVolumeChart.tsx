import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, TrendingUp, TrendingDown } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { C2COrderHistoryItem } from '@/hooks/useBinanceOrders';
import { TimePeriod } from './TimePeriodFilter';

interface Props {
  orders: C2COrderHistoryItem[];
  isLoading: boolean;
  period: TimePeriod;
}

export function TradeVolumeChart({ orders, isLoading, period }: Props) {
  const { chartData, totalBuy, totalSell } = useMemo(() => {
    if (!orders.length) return { chartData: [], totalBuy: 0, totalSell: 0 };

    const completed = orders.filter(o => (o.orderStatus || '').toUpperCase().includes('COMPLETED'));
    const byDate = new Map<string, { buy: number; sell: number; dateKey: number }>();

    let totalBuy = 0, totalSell = 0;

    for (const o of completed) {
      const d = new Date(o.createTime);
      const dateKey = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const label = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      const entry = byDate.get(label) || { buy: 0, sell: 0, dateKey };
      const price = parseFloat(o.totalPrice || '0');
      if (o.tradeType === 'BUY') { entry.buy += price; totalBuy += price; }
      else { entry.sell += price; totalSell += price; }
      byDate.set(label, entry);
    }

    const sorted = Array.from(byDate.entries())
      .sort((a, b) => a[1].dateKey - b[1].dateKey)
      .map(([date, v]) => ({ date, buy: Math.round(v.buy), sell: Math.round(v.sell) }));

    return { chartData: sorted, totalBuy: Math.round(totalBuy), totalSell: Math.round(totalSell) };
  }, [orders]);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Trade Volume
          </CardTitle>
          {!isLoading && chartData.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-trade-buy flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> ₹{totalBuy.toLocaleString('en-IN')}
              </span>
              <span className="text-[10px] text-trade-sell flex items-center gap-1">
                <TrendingDown className="h-3 w-3" /> ₹{totalSell.toLocaleString('en-IN')}
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-52 w-full" />
        ) : chartData.length === 0 ? (
          <div className="h-52 flex flex-col items-center justify-center gap-2">
            <Activity className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">No completed trades in this period</p>
            <p className="text-[10px] text-muted-foreground/60">Trades will appear here once orders are completed</p>
          </div>
        ) : (
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="buyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="sellGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(0, 72%, 51%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(225, 15%, 17%)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(225, 10%, 48%)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(225, 10%, 48%)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(225, 18%, 14%)',
                    border: '1px solid hsl(225, 12%, 20%)',
                    borderRadius: '8px',
                    fontSize: '11px',
                    color: 'hsl(225, 20%, 90%)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  }}
                  formatter={(value: number, name: string) => [`₹${value.toLocaleString('en-IN')}`, name === 'buy' ? 'Buy Volume' : 'Sell Volume']}
                />
                <Legend
                  verticalAlign="top"
                  height={24}
                  iconType="circle"
                  iconSize={6}
                  formatter={(value) => <span style={{ color: 'hsl(225, 10%, 65%)', fontSize: '10px' }}>{value === 'buy' ? 'Buy' : 'Sell'}</span>}
                />
                <Area type="monotone" dataKey="buy" stroke="hsl(142, 76%, 36%)" fill="url(#buyGrad)" strokeWidth={2} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
                <Area type="monotone" dataKey="sell" stroke="hsl(0, 72%, 51%)" fill="url(#sellGrad)" strokeWidth={2} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
