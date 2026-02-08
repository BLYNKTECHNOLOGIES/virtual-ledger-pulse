import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { C2COrderHistoryItem } from '@/hooks/useBinanceOrders';

interface Props {
  orders: C2COrderHistoryItem[];
  isLoading: boolean;
}

export function OrderStatusBreakdown({ orders, isLoading }: Props) {
  const data = useMemo(() => {
    if (!orders.length) return [];

    const statusMap = new Map<string, number>();
    for (const o of orders) {
      const status = normalizeStatus(o.orderStatus || 'UNKNOWN');
      statusMap.set(status, (statusMap.get(status) || 0) + 1);
    }

    return Array.from(statusMap.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  }, [orders]);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          Order Status Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : data.length === 0 ? (
          <div className="h-48 flex items-center justify-center">
            <p className="text-xs text-muted-foreground">No order data available</p>
          </div>
        ) : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#232734" vertical={false} />
                <XAxis dataKey="status" tick={{ fontSize: 9, fill: '#6B7285' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#6B7285' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1E2230',
                    border: '1px solid #2A2F3A',
                    borderRadius: '6px',
                    fontSize: '11px',
                    color: '#E6EAF2',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {data.map((entry, idx) => (
                    <Cell key={idx} fill={getStatusColor(entry.status)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
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

function getStatusColor(status: string): string {
  switch (status) {
    case 'Completed': return '#22C55E';
    case 'Cancelled': return '#6B7280';
    case 'Appeal': return '#EF4444';
    case 'Paid': return '#3B82F6';
    case 'Trading': return '#F59E0B';
    case 'Pending': return '#FBBF24';
    default: return '#6B7285';
  }
}
