import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { C2COrderHistoryItem } from '@/hooks/useBinanceOrders';

interface Props {
  orders: C2COrderHistoryItem[];
  isLoading: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  Completed: 'hsl(142, 76%, 36%)',
  Cancelled: 'hsl(220, 9%, 46%)',
  Appeal: 'hsl(0, 84%, 60%)',
  Paid: 'hsl(217, 91%, 60%)',
  Trading: 'hsl(38, 92%, 50%)',
  Pending: 'hsl(45, 93%, 47%)',
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
      .map(([status, count]) => ({ status, count, color: STATUS_COLORS[status] || 'hsl(225, 10%, 40%)' }))
      .sort((a, b) => b.count - a.count);
  }, [orders]);

  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Order Status Breakdown
          </CardTitle>
          {!isLoading && total > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">{total} orders</span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-52 w-full" />
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
                    strokeWidth={0}
                  >
                    {data.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(225, 18%, 14%)',
                      border: '1px solid hsl(225, 12%, 20%)',
                      borderRadius: '8px',
                      fontSize: '11px',
                      color: 'hsl(225, 20%, 90%)',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                    }}
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
                    <span className="text-foreground font-medium tabular-nums">{d.count}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-right">
                      {((d.count / total) * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function normalizeStatus(raw: string): string {
  const s = raw.toUpperCase();
  if (s.includes('COMPLETED')) return 'Completed';
  if (s.includes('CANCELLED')) return 'Cancelled';
  if (s.includes('APPEAL')) return 'Appeal';
  if (s.includes('BUYER_PAYED')) return 'Paid';
  if (s.includes('TRADING')) return 'Trading';
  if (s.includes('PENDING')) return 'Pending';
  return raw;
}
