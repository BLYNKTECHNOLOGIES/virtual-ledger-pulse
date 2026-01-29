import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, BarChart3, Users, Package, DollarSign, TrendingUp, Calendar, FileText, Activity, PieChart, LineChart, ShoppingCart, CreditCard, Timer, Bell, Zap, Globe, TrendingDown, ArrowUpRight, ArrowDownRight, Wallet, Building, UserCheck, Clock } from "lucide-react";

interface WidgetType {
  id: string;
  name: string;
  description: string;
  icon: any;
  category: string;
  size: 'small' | 'medium' | 'large';
}

const availableWidgets: WidgetType[] = [
  // Analytics Widgets
  {
    id: 'revenue-chart',
    name: 'Revenue Chart',
    description: 'Revenue trends and analytics',
    icon: BarChart3,
    category: 'Analytics',
    size: 'large'
  },
  {
    id: 'customer-chart',
    name: 'Customer Growth',
    description: 'Customer acquisition trends',
    icon: LineChart,
    category: 'Analytics',
    size: 'large'
  },
  {
    id: 'earnings-rate',
    name: 'Earnings Rate',
    description: 'Earnings overview',
    icon: TrendingUp,
    category: 'Analytics',
    size: 'medium'
  },
  {
    id: 'performance-overview',
    name: 'Performance Overview',
    description: 'Business performance metrics',
    icon: PieChart,
    category: 'Analytics',
    size: 'large'
  },
  
  // Metrics Widgets
  {
    id: 'total-clients',
    name: 'Total Clients',
    description: 'Client overview',
    icon: Users,
    category: 'Metrics',
    size: 'small'
  },
  {
    id: 'total-revenue',
    name: 'Total Revenue',
    description: 'Revenue overview',
    icon: DollarSign,
    category: 'Metrics',
    size: 'small'
  },
  {
    id: 'profit-margin',
    name: 'Profit Margin',
    description: 'Profit margins',
    icon: TrendingUp,
    category: 'Metrics',
    size: 'small'
  },
  {
    id: 'conversion-rate',
    name: 'Conversion Rate',
    description: 'Lead to customer conversion',
    icon: ArrowUpRight,
    category: 'Metrics',
    size: 'small'
  },
  {
    id: 'growth-rate',
    name: 'Growth Rate',
    description: 'Growth overview',
    icon: TrendingUp,
    category: 'Metrics',
    size: 'small'
  },
  
  // Operations Widgets
  {
    id: 'inventory-status',
    name: 'Inventory Status',
    description: 'Stock levels and alerts',
    icon: Package,
    category: 'Operations',
    size: 'medium'
  },
  {
    id: 'recent-orders',
    name: 'Recent Orders',
    description: 'Latest orders',
    icon: FileText,
    category: 'Operations',
    size: 'large'
  },
  {
    id: 'order-status',
    name: 'Order Status',
    description: 'Order processing status',
    icon: ShoppingCart,
    category: 'Operations',
    size: 'medium'
  },
  {
    id: 'expense-details',
    name: 'Expense Breakdown',
    description: 'Expense categories',
    icon: CreditCard,
    category: 'Operations',
    size: 'large'
  },
  
  // Activity Widgets
  {
    id: 'daily-activity',
    name: 'Daily Activity',
    description: 'Business activities',
    icon: Activity,
    category: 'Activity',
    size: 'medium'
  },
  {
    id: 'live-notifications',
    name: 'Live Notifications',
    description: 'System notifications',
    icon: Bell,
    category: 'Activity',
    size: 'medium'
  },
  {
    id: 'quick-stats',
    name: 'Quick Stats',
    description: 'Key performance indicators',
    icon: Zap,
    category: 'Activity',
    size: 'medium'
  },
  {
    id: 'real-time-data',
    name: 'Real-time Data',
    description: 'Live data feed',
    icon: Globe,
    category: 'Activity',
    size: 'large'
  },
  
  // Productivity Widgets
  {
    id: 'upcoming-tasks',
    name: 'Upcoming Tasks',
    description: 'Tasks and reminders',
    icon: Calendar,
    category: 'Productivity',
    size: 'medium'
  },
  {
    id: 'time-tracker',
    name: 'Time Tracker',
    description: 'Time tracking',
    icon: Timer,
    category: 'Productivity',
    size: 'medium'
  },
  {
    id: 'team-status',
    name: 'Team Status',
    description: 'Team availability',
    icon: UserCheck,
    category: 'Productivity',
    size: 'medium'
  },
  {
    id: 'schedule-overview',
    name: 'Schedule Overview',
    description: 'Schedule and appointments',
    icon: Clock,
    category: 'Productivity',
    size: 'large'
  },
  
  // Financial Widgets
  {
    id: 'wallet-balance',
    name: 'Wallet Balance',
    description: 'Account balances',
    icon: Wallet,
    category: 'Financial',
    size: 'small'
  },
  {
    id: 'payment-methods',
    name: 'Payment Methods',
    description: 'Payment options',
    icon: CreditCard,
    category: 'Financial',
    size: 'medium'
  },
  {
    id: 'cash-flow',
    name: 'Cash Flow',
    description: 'Income vs expenses',
    icon: ArrowUpRight,
    category: 'Financial',
    size: 'large'
  },
  {
    id: 'expense-trends',
    name: 'Expense Trends',
    description: 'Expense patterns',
    icon: TrendingDown,
    category: 'Financial',
    size: 'medium'
  }
];

interface AddWidgetDialogProps {
  onAddWidget: (widget: WidgetType) => void;
  existingWidgets: string[];
}

export function AddWidgetDialog({ onAddWidget, existingWidgets }: AddWidgetDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const categories = ['All', ...Array.from(new Set(availableWidgets.map(w => w.category)))];
  
  const filteredWidgets = availableWidgets.filter(widget => 
    (selectedCategory === 'All' || widget.category === selectedCategory) &&
    !existingWidgets.includes(widget.id)
  );

  const handleAddWidget = (widget: WidgetType) => {
    onAddWidget(widget);
    setOpen(false);
  };

  const getCategoryColor = (category: string) => {
    const colors = {
      'Analytics': 'bg-blue-100 text-blue-700 border-blue-200',
      'Metrics': 'bg-green-100 text-green-700 border-green-200',
      'Operations': 'bg-orange-100 text-orange-700 border-orange-200',
      'Activity': 'bg-purple-100 text-purple-700 border-purple-200',
      'Productivity': 'bg-indigo-100 text-indigo-700 border-indigo-200',
      'Financial': 'bg-emerald-100 text-emerald-700 border-emerald-200'
    };
    return colors[category as keyof typeof colors] || 'bg-gray-100 text-gray-700 border-gray-200';
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
          <Plus className="h-4 w-4" />
          Add Widget
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Add Dashboard Widget
          </DialogTitle>
          <p className="text-gray-600 mt-2">Choose from our collection of widgets to customize your dashboard</p>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Category Filter */}
          <div className="flex gap-2 flex-wrap">
            {categories.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(category)}
                className={selectedCategory === category ? 
                  "bg-gradient-to-r from-blue-600 to-purple-600 text-white" : 
                  "hover:bg-blue-50"
                }
              >
                {category}
              </Button>
            ))}
          </div>

          {/* Widget Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredWidgets.map((widget) => {
              const IconComponent = widget.icon;
              return (
                <Card 
                  key={widget.id} 
                  className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:scale-105 border-0 shadow-sm hover:shadow-blue-100"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl shadow-lg">
                          <IconComponent className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <CardTitle className="text-sm font-semibold text-gray-900">{widget.name}</CardTitle>
                          <Badge 
                            variant="outline" 
                            className={`text-xs mt-1 ${getCategoryColor(widget.category)}`}
                          >
                            {widget.category}
                          </Badge>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-600">
                        {widget.size}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-gray-600 mb-4 line-clamp-2">{widget.description}</p>
                    <Button
                      size="sm"
                      className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-sm"
                      onClick={() => handleAddWidget(widget)}
                    >
                      Add Widget
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filteredWidgets.length === 0 && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Package className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {existingWidgets.length === availableWidgets.length 
                  ? "All widgets added!" 
                  : "No widgets found"
                }
              </h3>
              <p className="text-gray-500">
                {existingWidgets.length === availableWidgets.length 
                  ? "You've added all available widgets to your dashboard"
                  : "Try selecting a different category to see more widgets"
                }
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
