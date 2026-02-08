
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Play, CheckCircle } from 'lucide-react';
import { OPStatusBadge } from './OPStatusBadge';
import { P2POrder } from './mockData';
import { useState } from 'react';
import { format } from 'date-fns';

interface OPOrderTableProps {
  orders: P2POrder[];
  showAssignedTo?: boolean;
  onAccept?: (orderId: string) => void;
  onComplete?: (orderId: string) => void;
}

export function OPOrderTable({ orders, showAssignedTo = false, onAccept, onComplete }: OPOrderTableProps) {
  const [search, setSearch] = useState('');

  const filtered = orders.filter(o =>
    o.orderId.toLowerCase().includes(search.toLowerCase()) ||
    o.buyerName.toLowerCase().includes(search.toLowerCase()) ||
    o.buyerEmail.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-gray-500" />
        <Input
          placeholder="Search by order ID, buyer name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 bg-gray-900/50 border-gray-700 text-gray-200 placeholder:text-gray-500"
        />
      </div>

      <div className="relative w-full overflow-auto rounded-lg border border-gray-800">
        <table className="w-full caption-bottom text-sm">
          <thead className="bg-gray-900/60">
            <tr className="border-b border-gray-800">
              <th className="h-12 px-4 text-left align-middle font-semibold text-gray-400 uppercase text-xs tracking-wider">Order ID</th>
              <th className="h-12 px-4 text-left align-middle font-semibold text-gray-400 uppercase text-xs tracking-wider">Amount</th>
              <th className="h-12 px-4 text-left align-middle font-semibold text-gray-400 uppercase text-xs tracking-wider">Buyer</th>
              <th className="h-12 px-4 text-left align-middle font-semibold text-gray-400 uppercase text-xs tracking-wider">Payment</th>
              <th className="h-12 px-4 text-left align-middle font-semibold text-gray-400 uppercase text-xs tracking-wider">Status</th>
              {showAssignedTo && <th className="h-12 px-4 text-left align-middle font-semibold text-gray-400 uppercase text-xs tracking-wider">Assigned To</th>}
              <th className="h-12 px-4 text-left align-middle font-semibold text-gray-400 uppercase text-xs tracking-wider">Time ↓</th>
              <th className="h-12 px-4 text-right align-middle font-semibold text-gray-400 uppercase text-xs tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((order) => (
              <tr key={order.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                <td className="p-4 align-middle font-mono text-gray-300">{order.orderId}</td>
                <td className="p-4 align-middle text-gray-200 font-medium">₹{order.amount.toLocaleString('en-IN')}</td>
                <td className="p-4 align-middle">
                  <div>
                    <div className="text-gray-200 font-medium">{order.buyerName}</div>
                    <div className="text-gray-500 text-xs">{order.buyerEmail}</div>
                  </div>
                </td>
                <td className="p-4 align-middle text-gray-300">{order.paymentMethod}</td>
                <td className="p-4 align-middle"><OPStatusBadge status={order.status} /></td>
                {showAssignedTo && <td className="p-4 align-middle text-gray-300">{order.assignedTo || '–'}</td>}
                <td className="p-4 align-middle text-gray-400 text-sm">{format(new Date(order.createdAt), 'dd MMM, HH:mm')}</td>
                <td className="p-4 align-middle text-right">
                  {order.status === 'Pending' && onAccept && (
                    <Button size="sm" variant="outline" className="border-emerald-600 text-emerald-400 hover:bg-emerald-600/20" onClick={() => onAccept(order.id)}>
                      <Play className="h-3 w-3 mr-1" /> Accept
                    </Button>
                  )}
                  {order.status === 'Processing' && onComplete && (
                    <Button size="sm" variant="outline" className="border-emerald-600 text-emerald-400 hover:bg-emerald-600/20" onClick={() => onComplete(order.id)}>
                      <CheckCircle className="h-3 w-3 mr-1" /> Complete
                    </Button>
                  )}
                  {order.status === 'Completed' && (
                    <span className="text-gray-500 text-sm">Completed</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={showAssignedTo ? 8 : 7} className="p-8 text-center text-gray-500">No orders found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
