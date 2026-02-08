
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, TrendingUp, Users } from 'lucide-react';
import { OPOrderTable } from './OPOrderTable';
import { mockOrders, defaultSettings } from './mockData';
import { useToast } from '@/hooks/use-toast';

export function OPLargeOrders() {
  const [orders, setOrders] = useState(mockOrders.filter(o => o.orderType === 'large'));
  const [currentRotation] = useState(0);
  const { toast } = useToast();

  const pending = orders.filter(o => o.status === 'Pending').length;
  const processing = orders.filter(o => o.status === 'Processing').length;
  const completed = orders.filter(o => o.status === 'Completed').length;

  const handleAccept = (id: string) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'Processing' as const } : o));
    toast({ title: 'Order accepted' });
  };

  const handleComplete = (id: string) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'Completed' as const } : o));
    toast({ title: 'Order completed' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 rounded-xl">
            <TrendingUp className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground">Large Orders</h2>
            <p className="text-sm text-muted-foreground">Orders above ₹50,000</p>
          </div>
        </div>
        <Button variant="outline" className="border-border text-muted-foreground hover:bg-accent hover:text-foreground gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Orders', value: orders.length },
          { label: 'Pending', value: pending, color: 'text-yellow-500 dark:text-yellow-400' },
          { label: 'Processing', value: processing, color: 'text-blue-500 dark:text-blue-400' },
          { label: 'Completed', value: completed, color: 'text-emerald-500 dark:text-emerald-400' },
        ].map((stat) => (
          <Card key={stat.label} className="bg-card border-border shadow-none">
            <CardContent className="pt-5 pb-4">
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <p className={`text-3xl font-bold mt-1 ${stat.color || 'text-foreground'}`}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Round-Robin Assignment */}
      <Card className="bg-card border-border shadow-none">
        <CardContent className="pt-6 pb-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold text-foreground">Round-Robin Assignment</h3>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {defaultSettings.rotationOrder.map((name, i) => (
              <Badge
                key={name}
                variant="outline"
                className={i === currentRotation
                  ? 'bg-amber-500/15 text-amber-500 dark:text-amber-400 border-amber-500/30 px-4 py-2 text-sm'
                  : 'bg-secondary text-muted-foreground border-border px-4 py-2 text-sm'
                }
              >
                {i === currentRotation ? `NEXT → ${name} (Large Sales)` : `#${i + 1} ${name} (Large Sales)`}
              </Badge>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            New large orders will be assigned to <span className="text-amber-500 dark:text-amber-400 font-medium">{defaultSettings.rotationOrder[currentRotation]}</span> next.
          </p>
        </CardContent>
      </Card>

      <OPOrderTable orders={orders} showAssignedTo onAccept={handleAccept} onComplete={handleComplete} />
    </div>
  );
}
