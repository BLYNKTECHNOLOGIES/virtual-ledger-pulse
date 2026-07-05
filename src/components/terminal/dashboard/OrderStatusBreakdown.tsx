import { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { C2COrderHistoryItem } from '@/hooks/useBinanceOrders';

interface Props {
  orders: C2COrderHistoryItem[];
  isLoading: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  Completed: 'hsl(var(--trade-buy))',
  Cancelled: 'hsl(var(--muted-foreground))',
  'Auto-Cancelled': 'hsl(var(--muted-foreground) / 0.6)',
  Appeal: 'hsl(var(--destructive))',
  Paid: 'hsl(var(--chart-1))',
  Trading: 'hsl(var(--trade-pending))',
  Pending: 'hsl(var(--warning))',
  Expired: 'hsl(var(--chart-4))',
};

export function OrderStatusBreakdown({ orders, isLoading }: Props) {
  const data = useMemo(() => {
    if (!orders.length) return [];

    const statusMap = new Map<string, number>();
    for (const o of orders) {
      const status = normalizeStatus(o.orderStatus || 'UNKNOWN');
      statusMap.set(status, (statusMap.get(status) || 0) + 1);
    }

    return Array.from(statusMap.entries())
      .map(([status, count]) => ({ status, count, color: STATUS_COLORS[status] || 'hsl(var(--chart-3))' }))
      .sort((a, b) => b.count - a.count);
  }, [orders]);

  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <div className="t-panel flex flex-col">
      <div className="t-panel-head">
        <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="t-panel-head-title">Order Status Breakdown</span>
        {!isLoading && total > 0 && (
          <span className="ml-auto text-[10px] text-muted-foreground t-mono">{total} orders</span>
        )}
      </div>
      <div className="p-3">
        {isLoading ? (
          <div className="t-shimmer h-52 w-full rounded-md" />
        ) : data.length === 0 ? (
          <div className="h-52 flex flex-col items-center justify-center gap-2">
            <BarChart3 className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">No order data available</p>
            <p className="text-[10px] text-muted-foreground/60">Status distribution appears once orders exist</p>
          </div>
        ) : (
          <div className="h-52 flex items-center gap-4">
            <div className="w-1/2 h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="count"
                    nameKey="status"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                    stroke="hsl(var(--card))"
                    strokeWidth={2}
                  >
                    {data.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                      color: 'hsl(var(--foreground))',
                    }}
                    labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                    cursor={{ fill: 'hsla(0 0% 100% / 0.03)' }}
                    formatter={(value: number, name: string) => [value, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-1/2 flex flex-col justify-center gap-2">
              {data.map((d) => (
                <div key={d.status} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="text-muted-foreground">{d.status}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-foreground font-medium t-mono">{d.count}</span>
                    <span className="text-[10px] text-muted-foreground t-mono w-8 text-right">
                      {((d.count / total) * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function normalizeStatus(raw: string): string {
  const s = raw.toUpperCase();
  if (s.includes('COMPLETED') || s.includes('RELEASED')) return 'Completed';
  if (s.includes('CANCELLED_BY_SYSTEM') || s.includes('CANCELED_BY_SYSTEM')) return 'Auto-Cancelled';
  if (s.includes('CANCEL')) return 'Cancelled';
  if (s.includes('APPEAL') || s.includes('DISPUTE') || s.includes('COMPLAINT')) return 'Appeal';
  if (s.includes('BUYER_PAYED') || s.includes('BUYER_PAID')) return 'Paid';
  if (s.includes('TRADING')) return 'Trading';
  if (s.includes('PENDING')) return 'Pending';
  if (s.includes('EXPIRED') || s.includes('TIMEOUT')) return 'Expired';
  return raw;
}
