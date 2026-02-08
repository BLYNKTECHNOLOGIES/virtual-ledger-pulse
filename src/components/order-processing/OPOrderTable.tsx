
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
          className="pl-10 bg-[#111827] border-gray-800 text-gray-200 placeholder:text-gray-600 h-11 focus:border-amber-500/50 focus:ring-amber-500/20"
        />
      </div>

      <div className="rounded-xl border border-gray-800/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#0d1321] border-b border-gray-800/60">
              <th className="h-11 px-5 text-left font-semibold text-gray-500 uppercase text-[11px] tracking-widest">Order ID</th>
              <th className="h-11 px-5 text-left font-semibold text-gray-500 uppercase text-[11px] tracking-widest">Amount</th>
              <th className="h-11 px-5 text-left font-semibold text-gray-500 uppercase text-[11px] tracking-widest">Buyer</th>
              <th className="h-11 px-5 text-left font-semibold text-gray-500 uppercase text-[11px] tracking-widest">Payment</th>
              <th className="h-11 px-5 text-left font-semibold text-gray-500 uppercase text-[11px] tracking-widest">Status</th>
              {showAssignedTo && <th className="h-11 px-5 text-left font-semibold text-gray-500 uppercase text-[11px] tracking-widest">Assigned To</th>}
              <th className="h-11 px-5 text-left font-semibold text-gray-500 uppercase text-[11px] tracking-widest">Time ↓</th>
              <th className="h-11 px-5 text-right font-semibold text-gray-500 uppercase text-[11px] tracking-widest">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((order) => (
              <tr key={order.id} className="border-b border-gray-800/30 hover:bg-[#111827]/60 transition-colors">
                <td className="py-4 px-5 font-mono text-gray-300 text-[13px]">{order.orderId}</td>
                <td className="py-4 px-5 text-gray-100 font-semibold">₹{order.amount.toLocaleString('en-IN')}</td>
                <td className="py-4 px-5">
                  <div>
                    <p className="text-gray-200 font-medium text-[13px]">{order.buyerName}</p>
                    <p className="text-gray-600 text-xs">{order.buyerEmail}</p>
                  </div>
                </td>
                <td className="py-4 px-5 text-gray-400">{order.paymentMethod}</td>
                <td className="py-4 px-5"><OPStatusBadge status={order.status} /></td>
                {showAssignedTo && <td className="py-4 px-5 text-gray-400">{order.assignedTo || '–'}</td>}
                <td className="py-4 px-5 text-gray-500 text-[13px]">{format(new Date(order.createdAt), 'dd MMM, HH:mm')}</td>
                <td className="py-4 px-5 text-right">
                  {order.status === 'Pending' && onAccept && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-emerald-600/60 text-emerald-400 hover:bg-emerald-500/10 h-8 px-4 text-xs font-medium gap-1.5"
                      onClick={() => onAccept(order.id)}
                    >
                      <Play className="h-3 w-3" /> Accept
                    </Button>
                  )}
                  {order.status === 'Processing' && onComplete && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-emerald-600/60 text-emerald-400 hover:bg-emerald-500/10 h-8 px-4 text-xs font-medium gap-1.5"
                      onClick={() => onComplete(order.id)}
                    >
                      <CheckCircle className="h-3 w-3" /> Complete
                    </Button>
                  )}
                  {order.status === 'Completed' && (
                    <span className="text-gray-600 text-xs">Completed</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={showAssignedTo ? 8 : 7} className="py-12 text-center text-gray-600">No orders found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
