import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Plus, BarChart3, Users, Package, DollarSign, TrendingUp, Calendar, FileText, 
  Activity, PieChart, LineChart, ShoppingCart, CreditCard, Timer, Bell, Zap, 
  Globe, TrendingDown, ArrowUpRight, Wallet, Building, UserCheck, Clock,
  Search, Scale, Shield, Banknote, Receipt, Target, Landmark, BarChart2,
  HandCoins, Calculator, Layers, AlertTriangle, Eye
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

export interface WidgetType {
  id: string;
  name: string;
  description: string;
  icon: any;
  category: string;
  size: 'small' | 'medium' | 'large';
  requiredPermissions?: string[]; // Any of these permissions grants access
}

const availableWidgets: WidgetType[] = [
  // ── Sales Widgets ──
  {
    id: 'total-revenue',
    name: 'Total Revenue',
    description: 'Total sales revenue for the selected period',
    icon: DollarSign,
    category: 'Sales',
    size: 'small',
    requiredPermissions: ['sales_view'],
  },
  {
    id: 'sales-orders-count',
    name: 'Sales Orders Count',
    description: 'Number of sales orders in the period',
    icon: ShoppingCart,
    category: 'Sales',
    size: 'small',
    requiredPermissions: ['sales_view'],
  },
  {
    id: 'revenue-chart',
    name: 'Revenue Chart',
    description: 'Revenue trends and analytics over time',
    icon: BarChart3,
    category: 'Sales',
    size: 'large',
    requiredPermissions: ['sales_view'],
  },
  {
    id: 'recent-orders',
    name: 'Recent Sales Orders',
    description: 'Latest sales orders and their status',
    icon: FileText,
    category: 'Sales',
    size: 'large',
    requiredPermissions: ['sales_view'],
  },

  // ── Purchase Widgets ──
  {
    id: 'total-purchases',
    name: 'Total Purchases',
    description: 'Total purchase spending for the selected period',
    icon: HandCoins,
    category: 'Purchase',
    size: 'small',
    requiredPermissions: ['purchase_view'],
  },
  {
    id: 'purchase-orders-count',
    name: 'Purchase Orders Count',
    description: 'Number of purchase orders in the period',
    icon: Receipt,
    category: 'Purchase',
    size: 'small',
    requiredPermissions: ['purchase_view'],
  },
  {
    id: 'pending-settlements',
    name: 'Pending Settlements',
    description: 'Purchase orders awaiting payment settlement',
    icon: Clock,
    category: 'Purchase',
    size: 'medium',
    requiredPermissions: ['purchase_view'],
  },

  // ── Clients Widgets ──
  {
    id: 'total-clients',
    name: 'Total Clients',
    description: 'Overview of all registered clients',
    icon: Users,
    category: 'Clients',
    size: 'small',
    requiredPermissions: ['clients_view'],
  },
  {
    id: 'verified-clients',
    name: 'Verified Clients',
    description: 'KYC-verified client count',
    icon: UserCheck,
    category: 'Clients',
    size: 'small',
    requiredPermissions: ['clients_view'],
  },
  {
    id: 'customer-chart',
    name: 'Customer Growth',
    description: 'Customer acquisition trends over time',
    icon: LineChart,
    category: 'Clients',
    size: 'large',
    requiredPermissions: ['clients_view'],
  },

  // ── Stock / Inventory Widgets ──
  {
    id: 'inventory-status',
    name: 'Asset Inventory',
    description: 'Current stock levels and wallet holdings',
    icon: Package,
    category: 'Stock',
    size: 'medium',
    requiredPermissions: ['stock_view'],
  },
  {
    id: 'stock-value',
    name: 'Stock Value (INR)',
    description: 'Total value of crypto holdings in INR',
    icon: Layers,
    category: 'Stock',
    size: 'small',
    requiredPermissions: ['stock_view'],
  },
  {
    id: 'wallet-balance',
    name: 'Wallet Balance',
    description: 'Aggregated wallet balances across all wallets',
    icon: Wallet,
    category: 'Stock',
    size: 'small',
    requiredPermissions: ['stock_view'],
  },

  // ── Banking / BAMS Widgets ──
  {
    id: 'bank-balance-total',
    name: 'Total Bank Balance',
    description: 'Combined balance across all active bank accounts',
    icon: Landmark,
    category: 'Banking',
    size: 'small',
    requiredPermissions: ['bams_view'],
  },
  {
    id: 'bank-balance-filter',
    name: 'Bank Balance Filter',
    description: 'View combined balance of selected active bank accounts',
    icon: Building,
    category: 'Banking',
    size: 'medium',
    requiredPermissions: ['bams_view'],
  },
  {
    id: 'total-cash',
    name: 'Total Cash',
    description: 'Banks + Stock combined value',
    icon: Banknote,
    category: 'Banking',
    size: 'small',
    requiredPermissions: ['bams_view'],
  },

  // ── PNL / Accounting Widgets ──
  {
    id: 'profit-margin',
    name: 'Profit Margin',
    description: 'Current profit margin percentage',
    icon: TrendingUp,
    category: 'PNL',
    size: 'small',
    requiredPermissions: ['accounting_view'],
  },
  {
    id: 'gross-profit',
    name: 'Gross Profit',
    description: 'Gross profit from sales vs purchase cost',
    icon: Target,
    category: 'PNL',
    size: 'small',
    requiredPermissions: ['accounting_view'],
  },
  {
    id: 'earnings-rate',
    name: 'Earnings Rate',
    description: 'Daily/weekly earnings overview with mini chart',
    icon: TrendingUp,
    category: 'PNL',
    size: 'medium',
    requiredPermissions: ['accounting_view'],
  },
  {
    id: 'cash-flow',
    name: 'Cash Flow',
    description: 'Income vs expenses over the selected period',
    icon: ArrowUpRight,
    category: 'PNL',
    size: 'large',
    requiredPermissions: ['accounting_view'],
  },
  {
    id: 'expense-trends',
    name: 'Expense Trends',
    description: 'Expense patterns and category breakdown',
    icon: TrendingDown,
    category: 'PNL',
    size: 'medium',
    requiredPermissions: ['accounting_view'],
  },
  {
    id: 'expense-details',
    name: 'Expense Breakdown',
    description: 'Detailed expense categories',
    icon: CreditCard,
    category: 'PNL',
    size: 'large',
    requiredPermissions: ['accounting_view'],
  },

  // ── Statistics Widgets ──
  {
    id: 'performance-overview',
    name: 'Performance Overview',
    description: 'Overall business performance metrics',
    icon: PieChart,
    category: 'Statistics',
    size: 'large',
    requiredPermissions: ['statistics_view'],
  },
  {
    id: 'conversion-rate',
    name: 'Conversion Rate',
    description: 'Lead to customer conversion rate',
    icon: ArrowUpRight,
    category: 'Statistics',
    size: 'small',
    requiredPermissions: ['statistics_view'],
  },
  {
    id: 'growth-rate',
    name: 'Growth Rate',
    description: 'Business growth rate overview',
    icon: TrendingUp,
    category: 'Statistics',
    size: 'small',
    requiredPermissions: ['statistics_view'],
  },

  // ── Activity / General Widgets (visible to all with dashboard_view) ──
  {
    id: 'daily-activity',
    name: 'Daily Activity',
    description: 'Today\'s business activity summary',
    icon: Activity,
    category: 'Activity',
    size: 'medium',
    requiredPermissions: ['dashboard_view'],
  },
  {
    id: 'quick-stats',
    name: 'Quick Stats',
    description: 'Key performance indicators at a glance',
    icon: Zap,
    category: 'Activity',
    size: 'medium',
    requiredPermissions: ['dashboard_view'],
  },
  {
    id: 'upcoming-tasks',
    name: 'Upcoming Tasks',
    description: 'Tasks and reminders',
    icon: Calendar,
    category: 'Activity',
    size: 'medium',
    requiredPermissions: ['dashboard_view'],
  },

  // ── Compliance Widgets ──
  {
    id: 'compliance-alerts',
    name: 'Compliance Alerts',
    description: 'Pending compliance items and alerts',
    icon: AlertTriangle,
    category: 'Compliance',
    size: 'medium',
    requiredPermissions: ['compliance_view'],
  },
  {
    id: 'kyc-overview',
    name: 'KYC Overview',
    description: 'KYC approval status summary',
    icon: Shield,
    category: 'Compliance',
    size: 'small',
    requiredPermissions: ['kyc_approvals_view'],
  },

  // ── HRMS Widgets ──
  {
    id: 'team-status',
    name: 'Team Status',
    description: 'Employee attendance and availability',
    icon: UserCheck,
    category: 'HRMS',
    size: 'medium',
    requiredPermissions: ['hrms_view'],
  },

  // ── Payroll Widgets ──
  {
    id: 'payroll-summary',
    name: 'Payroll Summary',
    description: 'Current month payroll overview',
    icon: Calculator,
    category: 'Payroll',
    size: 'medium',
    requiredPermissions: ['payroll_view'],
  },
];

// Export for use in DashboardWidget
export { availableWidgets };

interface AddWidgetDialogProps {
  onAddWidget: (widget: WidgetType) => void;
  existingWidgets: string[];
}

export function AddWidgetDialog({ onAddWidget, existingWidgets }: AddWidgetDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const { hasAnyPermission, permissions } = usePermissions();

  // Filter widgets by permissions first
  const permittedWidgets = availableWidgets.filter(widget => {
    if (!widget.requiredPermissions || widget.requiredPermissions.length === 0) return true;
    return hasAnyPermission(widget.requiredPermissions);
  });

  const categories = ['All', ...Array.from(new Set(permittedWidgets.map(w => w.category)))];
  
  const filteredWidgets = permittedWidgets.filter(widget => 
    (selectedCategory === 'All' || widget.category === selectedCategory) &&
    !existingWidgets.includes(widget.id) &&
    (searchQuery === '' || 
      widget.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      widget.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      widget.category.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const handleAddWidget = (widget: WidgetType) => {
    onAddWidget(widget);
    setOpen(false);
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'Sales': 'bg-green-100 text-green-700 border-green-200',
      'Purchase': 'bg-orange-100 text-orange-700 border-orange-200',
      'Clients': 'bg-blue-100 text-blue-700 border-blue-200',
      'Stock': 'bg-amber-100 text-amber-700 border-amber-200',
      'Banking': 'bg-emerald-100 text-emerald-700 border-emerald-200',
      'PNL': 'bg-purple-100 text-purple-700 border-purple-200',
      'Statistics': 'bg-indigo-100 text-indigo-700 border-indigo-200',
      'Activity': 'bg-cyan-100 text-cyan-700 border-cyan-200',
      'Compliance': 'bg-red-100 text-red-700 border-red-200',
      'HRMS': 'bg-pink-100 text-pink-700 border-pink-200',
      'Payroll': 'bg-teal-100 text-teal-700 border-teal-200',
    };
    return colors[category] || 'bg-gray-100 text-gray-700 border-gray-200';
  };

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, any> = {
      'Sales': DollarSign,
      'Purchase': HandCoins,
      'Clients': Users,
      'Stock': Package,
      'Banking': Landmark,
      'PNL': BarChart2,
      'Statistics': PieChart,
      'Activity': Activity,
      'Compliance': Shield,
      'HRMS': UserCheck,
      'Payroll': Calculator,
    };
    return icons[category] || BarChart3;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="flex items-center gap-2 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-700">
          <Plus className="h-4 w-4" />
          Add Widget
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[95vw] lg:max-w-[1100px] max-h-[85vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="text-xl font-bold text-foreground">
            Add Dashboard Widget
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Widgets are filtered based on your role permissions. {permittedWidgets.length} widgets available.
          </p>
          {/* Search */}
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search widgets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Category Filter */}
          <div className="flex gap-2 flex-wrap mb-6">
            {categories.map((category) => {
              const CatIcon = category !== 'All' ? getCategoryIcon(category) : Eye;
              const count = category === 'All' 
                ? permittedWidgets.filter(w => !existingWidgets.includes(w.id)).length
                : permittedWidgets.filter(w => w.category === category && !existingWidgets.includes(w.id)).length;
              return (
                <Button
                  key={category}
                  variant={selectedCategory === category ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(category)}
                  className={`gap-1.5 ${selectedCategory === category ? 
                    "bg-primary text-primary-foreground" : 
                    "hover:bg-accent"
                  }`}
                >
                  <CatIcon className="h-3.5 w-3.5" />
                  {category}
                  <span className="text-xs opacity-70">({count})</span>
                </Button>
              );
            })}
          </div>

          {/* Widget Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
                {searchQuery ? "No matching widgets" : 
                  existingWidgets.length >= permittedWidgets.length 
                    ? "All widgets added!" 
                    : "No widgets found"
                }
              </h3>
              <p className="text-sm text-muted-foreground">
                {searchQuery ? "Try a different search term or category" :
                  existingWidgets.length >= permittedWidgets.length 
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
