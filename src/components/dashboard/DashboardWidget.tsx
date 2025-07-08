
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  MoreVertical, 
  X, 
  Move, 
  BarChart3, 
  Users, 
  Package, 
  DollarSign, 
  TrendingUp, 
  Calendar, 
  FileText, 
  Activity, 
  PieChart,
  LineChart,
  ShoppingCart,
  CreditCard,
  Timer,
  Bell,
  Zap,
  Globe,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Building,
  UserCheck,
  Clock
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { ExchangeChart } from "./ExchangeChart";

interface Widget {
  id: string;
  name: string;
  description: string;
  icon: any;
  category: string;
  size: 'small' | 'medium' | 'large';
}

interface DashboardWidgetProps {
  widget: Widget;
  onRemove: (widgetId: string) => void;
  onMove: (widgetId: string, direction: 'up' | 'down') => void;
  metrics?: any;
}

const iconMap = {
  'revenue-chart': BarChart3,
  'total-clients': Users,
  'inventory-status': Package,
  'recent-orders': FileText,
  'daily-activity': Activity,
  'upcoming-tasks': Calendar,
  'profit-margin': TrendingUp,
  'customer-chart': LineChart,
  'earnings-rate': TrendingUp,
  'performance-overview': PieChart,
  'total-revenue': DollarSign,
  'conversion-rate': ArrowUpRight,
  'growth-rate': TrendingUp,
  'order-status': ShoppingCart,
  'expense-details': CreditCard,
  'live-notifications': Bell,
  'quick-stats': Zap,
  'real-time-data': Globe,
  'time-tracker': Timer,
  'team-status': UserCheck,
  'schedule-overview': Clock,
  'wallet-balance': Wallet,
  'payment-methods': CreditCard,
  'cash-flow': ArrowUpRight,
  'expense-trends': TrendingDown
};

function DashboardWidget({ widget, onRemove, onMove, metrics }: DashboardWidgetProps) {
  const IconComponent = iconMap[widget.id as keyof typeof iconMap] || widget.icon;

  const getSizeClasses = (size: string) => {
    switch (size) {
      case 'small': return 'col-span-1';
      case 'medium': return 'col-span-1 md:col-span-2';
      case 'large': return 'col-span-1 md:col-span-2 lg:col-span-3';
      default: return 'col-span-1';
    }
  };

  const getCategoryGradient = (category: string) => {
    const gradients = {
      'Analytics': 'from-blue-500 to-cyan-500',
      'Metrics': 'from-green-500 to-emerald-500',
      'Operations': 'from-orange-500 to-red-500',
      'Activity': 'from-purple-500 to-pink-500',
      'Productivity': 'from-indigo-500 to-blue-500',
      'Financial': 'from-emerald-500 to-teal-500'
    };
    return gradients[category as keyof typeof gradients] || 'from-gray-500 to-gray-600';
  };

  const renderWidgetContent = () => {
    switch (widget.id) {
      case 'revenue-chart':
        return <ExchangeChart />;
      
      case 'customer-chart':
        return (
          <div className="p-4">
            <div className="h-32 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg flex items-center justify-center mb-4">
              <LineChart className="h-16 w-16 text-blue-500" />
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">+24.5%</div>
              <p className="text-sm text-gray-600">Customer Growth</p>
            </div>
          </div>
        );
      
      case 'total-clients':
        return (
          <div className="text-center p-6">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="h-8 w-8 text-white" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{metrics?.totalClients || 1247}</div>
            <p className="text-sm text-gray-600 mt-1">Active Clients</p>
            <Badge className="mt-3 bg-green-100 text-green-800 border-green-200">+3.2% this month</Badge>
          </div>
        );
      
      case 'total-revenue':
        return (
          <div className="text-center p-6">
            <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <DollarSign className="h-8 w-8 text-white" />
            </div>
            <div className="text-3xl font-bold text-gray-900">₹{((metrics?.totalRevenue || 850000) / 100000).toFixed(1)}L</div>
            <p className="text-sm text-gray-600 mt-1">This Month</p>
            <div className="flex items-center justify-center gap-1 mt-3">
              <ArrowUpRight className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-600 font-medium">+12.5%</span>
            </div>
          </div>
        );
      
      case 'inventory-status':
        return (
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-2xl font-bold">{metrics?.totalProducts || 2847}</div>
                <p className="text-sm text-gray-600">Total Products</p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-500 rounded-lg flex items-center justify-center">
                <Package className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">In Stock</span>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-2 bg-gray-200 rounded-full">
                    <div className="w-14 h-2 bg-green-500 rounded-full"></div>
                  </div>
                  <span className="text-sm font-medium text-green-600">85%</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Low Stock</span>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-2 bg-gray-200 rounded-full">
                    <div className="w-3 h-2 bg-yellow-500 rounded-full"></div>
                  </div>
                  <span className="text-sm font-medium text-yellow-600">12%</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Out of Stock</span>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-2 bg-gray-200 rounded-full">
                    <div className="w-1 h-2 bg-red-500 rounded-full"></div>
                  </div>
                  <span className="text-sm font-medium text-red-600">3%</span>
                </div>
              </div>
            </div>
          </div>
        );

      case 'earnings-rate':
        return (
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-gray-900">Earnings Rate</h4>
              <div className="flex gap-2">
                <Badge variant="outline" className="text-xs">Daily</Badge>
                <Badge className="text-xs bg-blue-600">Weekly</Badge>
              </div>
            </div>
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-lg font-bold text-blue-600">+₹6,127.80</div>
                <p className="text-xs text-gray-600">Today's Earnings</p>
              </div>
              <div className="h-16 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg flex items-end justify-center gap-1 p-2">
                {[40, 65, 45, 80, 60, 90, 75].map((height, i) => (
                  <div key={i} className="bg-gradient-to-t from-blue-500 to-purple-500 rounded-sm w-3" style={{ height: `${height}%` }}></div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'expense-details':
        return (
          <div className="p-4">
            <h4 className="font-semibold text-gray-900 mb-4">Expense Details</h4>
            <div className="space-y-3">
              {[
                { name: 'Online Shopping', desc: 'Vestibulum condimentum', amount: '₹1,780', color: 'bg-green-500' },
                { name: 'Coffee Shop', desc: 'Per inceptos himenaeos', amount: '₹470.00', color: 'bg-yellow-500' },
                { name: 'House Bills', desc: 'Proin pellentesque varius', amount: '₹1,200', color: 'bg-blue-500' },
                { name: 'Concert Ticket', desc: 'Turpis proin a porttitor', amount: '₹230.00', color: 'bg-purple-500' },
                { name: 'Car Expenses', desc: 'Vivamus sed dolor dictum', amount: '₹640.00', color: 'bg-cyan-500' }
              ].map((expense, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${expense.color}`}></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{expense.name}</p>
                    <p className="text-xs text-gray-500 truncate">{expense.desc}</p>
                  </div>
                  <div className="text-sm font-medium text-gray-900">{expense.amount}</div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'quick-stats':
        return (
          <div className="p-4">
            <h4 className="font-semibold text-gray-900 mb-4">Quick Stats</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-xl font-bold text-blue-600">24</div>
                <p className="text-xs text-gray-600">New Orders</p>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <div className="text-xl font-bold text-green-600">18</div>
                <p className="text-xs text-gray-600">Completed</p>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded-lg">
                <div className="text-xl font-bold text-purple-600">156</div>
                <p className="text-xs text-gray-600">Total Sales</p>
              </div>
              <div className="text-center p-3 bg-orange-50 rounded-lg">
                <div className="text-xl font-bold text-orange-600">92%</div>
                <p className="text-xs text-gray-600">Success Rate</p>
              </div>
            </div>
          </div>
        );

      case 'recent-orders':
        return (
          <div className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Order #1234</p>
                  <p className="text-sm text-gray-600">John Doe - ₹5,000</p>
                </div>
                <Badge variant="outline">Pending</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Order #1235</p>
                  <p className="text-sm text-gray-600">Jane Smith - ₹12,000</p>
                </div>
                <Badge className="bg-green-100 text-green-800">Completed</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Order #1236</p>
                  <p className="text-sm text-gray-600">Mike Johnson - ₹8,500</p>
                </div>
                <Badge variant="outline">Processing</Badge>
              </div>
            </div>
          </div>
        );
      
      case 'daily-activity':
        return (
          <div className="p-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-xl font-bold text-blue-600">{metrics?.totalSales || 0}</div>
                <p className="text-xs text-gray-600">Sales Today</p>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-green-600">{metrics?.totalPurchases || 0}</div>
                <p className="text-xs text-gray-600">Purchases</p>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-purple-600">15</div>
                <p className="text-xs text-gray-600">New Leads</p>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-orange-600">8</div>
                <p className="text-xs text-gray-600">Tasks Done</p>
              </div>
            </div>
          </div>
        );
      
      case 'upcoming-tasks':
        return (
          <div className="p-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                <div>
                  <p className="text-sm font-medium">KYC Review - Urgent</p>
                  <p className="text-xs text-gray-600">Due in 2 hours</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                <div>
                  <p className="text-sm font-medium">Client Meeting</p>
                  <p className="text-xs text-gray-600">Tomorrow 10:00 AM</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <div>
                  <p className="text-sm font-medium">Monthly Report</p>
                  <p className="text-xs text-gray-600">Due in 3 days</p>
                </div>
              </div>
            </div>
          </div>
        );
      
      case 'profit-margin':
        return (
          <div className="text-center p-4">
            <div className="text-3xl font-bold text-green-600">23.5%</div>
            <p className="text-sm text-gray-600 mt-1">Profit Margin</p>
            <Badge className="bg-green-100 text-green-800 mt-2">+2.1% vs last month</Badge>
          </div>
        );
      
      default:
        return (
          <div className="p-6 text-center">
            <div className={`w-16 h-16 bg-gradient-to-br ${getCategoryGradient(widget.category)} rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg`}>
              <IconComponent className="h-8 w-8 text-white" />
            </div>
            <h4 className="font-semibold text-gray-900 mb-2">{widget.name}</h4>
            <p className="text-sm text-gray-600">{widget.description}</p>
          </div>
        );
    }
  };

  return (
    <div className={getSizeClasses(widget.size)}>
      <Card className="h-full bg-white shadow-sm hover:shadow-md transition-all duration-300 border-0 shadow-gray-100">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-gradient-to-r from-gray-50 to-gray-100">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 bg-gradient-to-br ${getCategoryGradient(widget.category)} rounded-lg shadow-sm`}>
              <IconComponent className="h-4 w-4 text-white" />
            </div>
            <CardTitle className="text-sm font-semibold text-gray-900">{widget.name}</CardTitle>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-white/80">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => onMove(widget.id, 'up')}>
                <Move className="h-4 w-4 mr-2" />
                Move Up
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onMove(widget.id, 'down')}>
                <Move className="h-4 w-4 mr-2" />
                Move Down
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => onRemove(widget.id)}
                className="text-red-600 focus:text-red-700"
              >
                <X className="h-4 w-4 mr-2" />
                Remove Widget
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent className="p-0">
          {renderWidgetContent()}
        </CardContent>
      </Card>
    </div>
  );
}

export default DashboardWidget;
