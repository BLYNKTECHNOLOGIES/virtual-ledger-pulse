
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

  const statCards = [
    { title: 'Total Orders Today', value: mockOrders.length, icon: ShoppingCart, change: '+12% vs yesterday' },
    { title: 'Small Orders', value: smallOrders.length, icon: TrendingDown },
    { title: 'Large Orders', value: largeOrders.length, icon: TrendingUp },
    { title: 'Active Small Staff', value: smallStaff.length, icon: Users },
    { title: 'Active Large Staff', value: largeStaff.length, icon: Users },
    { title: 'Processing Rate', value: `${processingRate}%`, icon: Zap, change: '+3% vs yesterday' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-100">Admin Dashboard</h2>
        <p className="text-gray-400">Overview of all P2P order processing activities</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.title} className="bg-gray-900/60 border-gray-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">{stat.title}</p>
                  <p className="text-3xl font-bold text-gray-100 mt-1">{stat.value}</p>
                  {stat.change && <p className="text-xs text-emerald-400 mt-1">{stat.change}</p>}
                </div>
                <div className="p-3 bg-amber-500/10 rounded-lg">
                  <stat.icon className="h-6 w-6 text-amber-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-gray-900/60 border-gray-800">
          <CardHeader><CardTitle className="text-gray-100">Recent Orders</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {mockOrders.slice(0, 6).map((order) => (
              <div key={order.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${order.orderType === 'small' ? 'bg-blue-500/10' : 'bg-amber-500/10'}`}>
                    {order.orderType === 'small' ? <TrendingDown className="h-4 w-4 text-blue-400" /> : <TrendingUp className="h-4 w-4 text-amber-400" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-200">{order.orderId}</p>
                    <p className="text-xs text-gray-500">{order.buyerName}</p>
                  </div>
                </div>
                <div className="text-right flex items-center gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-200">₹{order.amount.toLocaleString('en-IN')}</p>
                    <p className="text-xs text-gray-500">{formatDistanceToNow(new Date(order.createdAt), { addSuffix: false })} ago</p>
                  </div>
                  <OPStatusBadge status={order.status} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-gray-900/60 border-gray-800">
          <CardHeader><CardTitle className="text-gray-100">Staff Activity</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {mockStaff.map((staff) => (
              <div key={staff.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-sm">
                    U
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-200">{staff.name}</p>
                    <p className="text-xs text-gray-500">{staff.role.replace('_', ' ')}</p>
                  </div>
                </div>
                <div className="text-right flex items-center gap-3">
                  <div>
                    <p className="text-sm text-gray-300">{staff.activeOrders} active</p>
                    <p className="text-xs text-gray-500">{staff.completedOrders} completed</p>
                  </div>
                  <div className={`w-3 h-3 rounded-full ${staff.isActive ? 'bg-emerald-400' : 'bg-gray-600'}`} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
