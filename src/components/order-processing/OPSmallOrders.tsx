
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, TrendingDown } from 'lucide-react';
import { OPOrderTable } from './OPOrderTable';
import { mockOrders } from './mockData';
import { useToast } from '@/hooks/use-toast';

export function OPSmallOrders() {
  const [orders, setOrders] = useState(mockOrders.filter(o => o.orderType === 'small'));
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
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <TrendingDown className="h-6 w-6 text-blue-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-100">Small Orders</h2>
            <p className="text-gray-400">Orders below ₹500</p>
          </div>
        </div>
        <Button variant="outline" className="border-gray-700 text-gray-300 hover:bg-gray-800">
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Orders', value: orders.length },
          { label: 'Pending', value: pending, color: 'text-yellow-400' },
          { label: 'Processing', value: processing, color: 'text-blue-400' },
          { label: 'Completed', value: completed, color: 'text-emerald-400' },
        ].map((stat) => (
          <Card key={stat.label} className="bg-gray-900/60 border-gray-800">
            <CardContent className="pt-4 pb-4">
              <p className="text-sm text-gray-400">{stat.label}</p>
              <p className={`text-2xl font-bold mt-1 ${stat.color || 'text-gray-100'}`}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <OPOrderTable orders={orders} onAccept={handleAccept} onComplete={handleComplete} />
    </div>
  );
}
