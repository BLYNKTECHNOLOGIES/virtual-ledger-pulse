
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Filter, ShoppingCart } from 'lucide-react';
import { OPOrderTable } from './OPOrderTable';
import { mockOrders } from './mockData';
import { useToast } from '@/hooks/use-toast';

export function OPAllOrders() {
  const [orders, setOrders] = useState(mockOrders);
  const { toast } = useToast();

  const handleAccept = (id: string) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'Processing' as const } : o));
    toast({ title: 'Order accepted', description: 'Order moved to processing' });
  };

  const handleComplete = (id: string) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'Completed' as const } : o));
    toast({ title: 'Order completed' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 rounded-lg">
            <ShoppingCart className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-100">All Orders</h2>
            <p className="text-gray-400">Manage and monitor all P2P orders</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-gray-700 text-gray-300 hover:bg-gray-800">
            <Filter className="h-4 w-4 mr-2" /> Filters
          </Button>
          <Button variant="outline" className="border-gray-700 text-gray-300 hover:bg-gray-800">
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      <p className="text-sm text-gray-400">Showing {orders.length} of {orders.length} orders</p>

      <OPOrderTable
        orders={orders}
        showAssignedTo
        onAccept={handleAccept}
        onComplete={handleComplete}
      />
    </div>
  );
}
