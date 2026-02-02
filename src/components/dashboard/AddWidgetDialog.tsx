import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, BarChart3, Users, Package, DollarSign, TrendingUp, Calendar, FileText, Activity, PieChart, LineChart, ShoppingCart, CreditCard, Timer, Bell, Zap, Globe, TrendingDown, ArrowUpRight, Wallet, Building, UserCheck, Clock } from "lucide-react";

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
  },
  {
    id: 'bank-balance-filter',
    name: 'Bank Balance Filter',
    description: 'View combined balance of selected active bank accounts',
    icon: Building,
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
        <Button className="flex items-center gap-2 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-700">
          <Plus className="h-4 w-4" />
          Add Widget
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[900px] max-h-[85vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="text-xl font-bold text-foreground">
            Add Dashboard Widget
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Choose from our collection of widgets to customize your dashboard
          </p>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Category Filter */}
          <div className="flex gap-2 flex-wrap mb-6">
            {categories.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(category)}
                className={selectedCategory === category ? 
                  "bg-primary text-primary-foreground" : 
                  "hover:bg-accent"
                }
              >
                {category}
              </Button>
            ))}
          </div>

          {/* Widget Grid - Fixed 3 columns for desktop */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredWidgets.map((widget) => {
              const IconComponent = widget.icon;
              return (
                <Card 
                  key={widget.id} 
                  className="flex flex-col border border-border bg-card hover:shadow-md transition-all duration-200 hover:border-primary/30"
                >
                  <CardHeader className="pb-3 pt-4 px-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 bg-primary/10 rounded-lg flex-shrink-0">
                        <IconComponent className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-sm font-semibold text-card-foreground leading-tight mb-2">
                          {widget.name}
                        </CardTitle>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge 
                            variant="outline" 
                            className={`text-[10px] px-1.5 py-0 h-5 ${getCategoryColor(widget.category)}`}
                          >
                            {widget.category}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-muted text-muted-foreground">
                            {widget.size}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col pt-0 pb-4 px-4">
                    <p className="text-xs text-muted-foreground mb-3 leading-relaxed flex-1">
                      {widget.description}
                    </p>
                    <Button
                      size="sm"
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-8 text-xs"
                      onClick={() => handleAddWidget(widget)}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add Widget
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filteredWidgets.length === 0 && (
            <div className="text-center py-12 px-4">
              <div className="w-14 h-14 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Package className="h-7 w-7 text-muted-foreground" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1">
                {existingWidgets.length === availableWidgets.length 
                  ? "All widgets added!" 
                  : "No widgets found"
                }
              </h3>
              <p className="text-sm text-muted-foreground">
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
