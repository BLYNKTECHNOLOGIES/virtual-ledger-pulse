
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShoppingCart, TrendingDown, TrendingUp, Users, Zap } from 'lucide-react';
import { mockOrders, mockStaff } from './mockData';
import { OPStatusBadge } from './OPStatusBadge';
import { formatDistanceToNow } from 'date-fns';

export function OPDashboard() {
  const smallOrders = mockOrders.filter(o => o.orderType === 'small');
  const largeOrders = mockOrders.filter(o => o.orderType === 'large');
  const smallStaff = mockStaff.filter(s => s.role === 'SMALL_SALES' && s.isActive);
  const largeStaff = mockStaff.filter(s => s.role === 'LARGE_SALES' && s.isActive);
  const completedCount = mockOrders.filter(o => o.status === 'Completed').length;
  const processingRate = Math.round((completedCount / mockOrders.length) * 100) || 0;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-100">Admin Dashboard</h2>
        <p className="text-gray-500 text-sm">Overview of all P2P order processing activities</p>
      </div>

      {/* Row 1: 3 cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Card className="bg-[#111827] border-gray-800/60 shadow-none">
          <CardContent className="pt-6 pb-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 font-medium">Total Orders Today</p>
                <p className="text-4xl font-bold text-gray-100 mt-2">{mockOrders.length}</p>
                <p className="text-xs text-emerald-400 mt-2">+12% vs yesterday</p>
              </div>
              <div className="p-3 bg-amber-500/10 rounded-xl">
                <ShoppingCart className="h-6 w-6 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#111827] border-gray-800/60 shadow-none">
          <CardContent className="pt-6 pb-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 font-medium">Small Orders</p>
                <p className="text-4xl font-bold text-gray-100 mt-2">{smallOrders.length}</p>
              </div>
              <div className="p-3 bg-amber-500/10 rounded-xl">
                <TrendingDown className="h-6 w-6 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#111827] border-gray-800/60 shadow-none">
          <CardContent className="pt-6 pb-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 font-medium">Large Orders</p>
                <p className="text-4xl font-bold text-gray-100 mt-2">{largeOrders.length}</p>
              </div>
              <div className="p-3 bg-amber-500/10 rounded-xl">
                <TrendingUp className="h-6 w-6 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: 3 cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Card className="bg-[#111827] border-gray-800/60 shadow-none">
          <CardContent className="pt-6 pb-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 font-medium">Active Small Staff</p>
                <p className="text-4xl font-bold text-gray-100 mt-2">{smallStaff.length}</p>
              </div>
              <div className="p-3 bg-amber-500/10 rounded-xl">
                <Users className="h-6 w-6 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#111827] border-gray-800/60 shadow-none">
          <CardContent className="pt-6 pb-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 font-medium">Active Large Staff</p>
                <p className="text-4xl font-bold text-gray-100 mt-2">{largeStaff.length}</p>
              </div>
              <div className="p-3 bg-amber-500/10 rounded-xl">
                <Users className="h-6 w-6 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#111827] border-gray-800/60 shadow-none">
          <CardContent className="pt-6 pb-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 font-medium">Processing Rate</p>
                <p className="text-4xl font-bold text-gray-100 mt-2">{processingRate}%</p>
                <p className="text-xs text-emerald-400 mt-2">+3% vs yesterday</p>
              </div>
              <div className="p-3 bg-amber-500/10 rounded-xl">
                <Zap className="h-6 w-6 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom: Recent Orders + Staff Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-[#111827] border-gray-800/60 shadow-none">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold text-gray-100">Recent Orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {mockOrders.slice(0, 6).map((order) => (
              <div key={order.id} className="flex items-center justify-between py-3 border-b border-gray-800/40 last:border-0">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${order.orderType === 'small' ? 'bg-blue-500/10' : 'bg-amber-500/10'}`}>
                    {order.orderType === 'small'
                      ? <TrendingDown className="h-4 w-4 text-blue-400" />
                      : <TrendingUp className="h-4 w-4 text-amber-400" />
                    }
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-200">{order.orderId}</p>
                    <p className="text-xs text-gray-500">{order.buyerName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-200">₹{order.amount.toLocaleString('en-IN')}</p>
                    <p className="text-xs text-gray-500">{formatDistanceToNow(new Date(order.createdAt), { addSuffix: false })} ago</p>
                  </div>
                  <OPStatusBadge status={order.status} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-[#111827] border-gray-800/60 shadow-none">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold text-gray-100">Staff Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {mockStaff.map((staff) => (
              <div key={staff.id} className="flex items-center justify-between py-3 border-b border-gray-800/40 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center text-amber-400 font-bold text-sm border border-amber-500/20">
                    U
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-200">{staff.name}</p>
                    <p className="text-xs text-gray-500 uppercase tracking-wider">{staff.role.replace('_', ' ')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm text-gray-300">{staff.activeOrders} active</p>
                    <p className="text-xs text-gray-500">{staff.completedOrders} completed</p>
                  </div>
                  <div className={`w-2.5 h-2.5 rounded-full ${staff.isActive ? 'bg-emerald-400' : 'bg-gray-600'}`} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
