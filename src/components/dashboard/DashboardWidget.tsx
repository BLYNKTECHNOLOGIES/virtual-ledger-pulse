
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
  Wallet,
  Building,
  UserCheck,
  Clock,
  GripVertical
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { BankBalanceFilterWidget } from "@/components/widgets/BankBalanceFilterWidget";
import { ShiftReconciliationWidget } from "./ShiftReconciliationWidget";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchActiveWalletsWithLedgerUsdtBalance } from "@/lib/wallet-ledger-balance";
import {
  CustomerGrowthWidget, RecentOrdersWidget, DailyActivityWidget, QuickStatsWidget,
  ExpenseBreakdownWidget, EarningsRateWidget, ProfitMarginWidget, PerformanceOverviewWidget,
  ConversionRateWidget, GrowthRateWidget, CashFlowWidget, ExpenseTrendsWidget,
  PendingSettlementsWidget, TeamStatusWidget, InventoryStatusWidget, UpcomingTasksWidget,
  RevenueChartWidget, TerminalSalesApprovalWidget, TerminalPurchaseApprovalWidget
} from "./widgets/RealDataWidgets";
import type { WidgetType } from "./AddWidgetDialog";

function WalletBalanceWidgetContent() {
  const { data: wallets, isLoading } = useQuery({
    queryKey: ['dashboard_wallet_balance_widget'],
    queryFn: async () => {
      const data = await fetchActiveWalletsWithLedgerUsdtBalance('id, wallet_name, current_balance');
      return data || [];
    },
    refetchInterval: 15000,
  });

  const totalBalance = (wallets || []).reduce((sum, w) => sum + (Number(w.current_balance) || 0), 0);

  if (isLoading) {
    return <div className="p-6 text-center text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="p-4 flex flex-col h-full">
      <div className="text-center mb-3">
        <p className="text-2xl font-bold text-foreground">{totalBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT</p>
        <p className="text-xs text-muted-foreground mt-1">Total across {(wallets || []).length} wallets</p>
      </div>
      <div className="space-y-1 flex-1 overflow-y-auto">
        {(wallets || []).filter(w => Number(w.current_balance) > 0).map((w: any) => (
          <div key={w.id} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-muted/50">
            <span className="text-muted-foreground font-medium truncate mr-2">{w.wallet_name}</span>
            <span className="font-semibold text-foreground whitespace-nowrap">{Number(w.current_balance || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface DashboardWidgetProps {
  widget: WidgetType;
  onRemove: (widgetId: string) => void;
  onMove: (widgetId: string, direction: "up" | "down") => void;
  metrics?: any;
  isDraggable?: boolean;
  dateRange?: { from?: Date; to?: Date };
}

const widgetIconMap: Record<string, any> = {
  "revenue-chart": BarChart3,
  "pending-settlements": Clock,
  "cash-flow": ArrowUpRight,
  "expense-trends": TrendingDown,
  "wallet-balance": Wallet,
  "team-status": UserCheck,
};

const getSizeClasses = (size: WidgetType["size"]) => {
  if (size === "small") return "col-span-12 sm:col-span-6 lg:col-span-3";
  if (size === "medium") return "col-span-12 lg:col-span-6";
  return "col-span-12";
};

const DashboardWidget = ({ widget, onRemove, onMove, metrics, isDraggable = true, dateRange }: DashboardWidgetProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
    disabled: !isDraggable,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const IconComponent = widget.icon || widgetIconMap[widget.id] || BarChart3;

  const GrossProfitWidgetContent = () => {
    const gross = (metrics?.totalRevenue || metrics?.totalSales || 0) - (metrics?.totalSpending || 0);
    return (
      <div className="text-center p-4">
        <div className="text-3xl font-bold text-gray-900">₹{Number(gross).toLocaleString('en-IN')}</div>
        <p className="text-sm text-gray-600 mt-1">Gross Profit</p>
      </div>
    );
  };

  const ComplianceAlertsWidgetContent = () => (
    <div className="text-center p-4">
      <div className="text-3xl font-bold text-gray-900">{metrics?.pendingActions || 0}</div>
      <p className="text-sm text-gray-600 mt-1">Compliance Alerts</p>
    </div>
  );

  const PayrollSummaryWidgetContent = () => (
    <div className="text-center p-4">
      <div className="text-3xl font-bold text-gray-900">{metrics?.employees || 0}</div>
      <p className="text-sm text-gray-600 mt-1">Payroll Summary</p>
    </div>
  );

  const getCategoryGradient = (category: string) => {
    const gradients: Record<string, string> = {
      'Sales': 'from-green-500 to-emerald-500',
      'Purchase': 'from-orange-500 to-red-500',
      'Clients': 'from-blue-500 to-indigo-500',
      'Stock': 'from-amber-500 to-yellow-500',
      'Banking': 'from-emerald-500 to-green-500',
      'PNL': 'from-purple-500 to-violet-500',
      'Statistics': 'from-indigo-500 to-blue-500',
      'Compliance': 'from-red-500 to-rose-500',
      'HRMS': 'from-pink-500 to-rose-500',
      'Payroll': 'from-teal-500 to-cyan-500',
    };
    return gradients[category] || 'from-gray-500 to-gray-600';
  };

  const renderWidgetContent = () => {
    switch (widget.id) {
      case 'revenue-chart':
        return <RevenueChartWidget />;

      case 'customer-chart':
        return <CustomerGrowthWidget />;



      case 'inventory-status':
        return <InventoryStatusWidget />;


      case 'expense-details':
        return <ExpenseBreakdownWidget />;

      case 'quick-stats':
        return <QuickStatsWidget metrics={metrics} dateRange={dateRange} />;

      case 'recent-orders':
        return <RecentOrdersWidget />;

      case 'daily-activity':
        return <DailyActivityWidget />;

      case 'upcoming-tasks':
        return <UpcomingTasksWidget />;

      case 'profit-margin':
        return <ProfitMarginWidget />;

      case 'performance-overview':
        return <PerformanceOverviewWidget metrics={metrics} dateRange={dateRange} />;


      case 'growth-rate':
        return <GrowthRateWidget />;

      case 'cash-flow':
        return <CashFlowWidget />;

      case 'expense-trends':
        return <ExpenseTrendsWidget />;

      case 'team-status':
        return <TeamStatusWidget />;

      case 'terminal-sales-approval':
        return <TerminalSalesApprovalWidget />;

      case 'terminal-purchase-approval':
        return <TerminalPurchaseApprovalWidget />;

      case 'bank-balance-filter':
        return <BankBalanceFilterWidget compact className="border-0 shadow-none bg-transparent" />;


      case 'total-purchases':
        return (
          <div className="text-center p-6">
            <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <DollarSign className="h-8 w-8 text-white" />
            </div>
            <div className="text-3xl font-bold text-gray-900">₹{((metrics?.totalSpending || 0) / 100000).toFixed(1)}L</div>
            <p className="text-sm text-gray-600 mt-1">Total Purchases</p>
          </div>
        );

      case 'purchase-orders-count':
        return (
          <div className="text-center p-6">
            <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="h-8 w-8 text-white" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{metrics?.totalPurchases || 0}</div>
            <p className="text-sm text-gray-600 mt-1">Purchase Orders</p>
            <Badge className="mt-3 bg-orange-100 text-orange-800 border-orange-200">Selected Period</Badge>
          </div>
        );

      case 'pending-settlements':
        return <PendingSettlementsWidget />;


      case 'stock-value':
        return (
          <div className="text-center p-6">
            <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Package className="h-8 w-8 text-white" />
            </div>
            <div className="text-3xl font-bold text-gray-900">₹{((metrics?.stockValue || 0) / 100000).toFixed(2)}L</div>
            <p className="text-sm text-gray-600 mt-1">Stock Value (INR)</p>
          </div>
        );

      case 'bank-balance-total':
        return (
          <div className="text-center p-6">
            <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Building className="h-8 w-8 text-white" />
            </div>
            <div className="text-3xl font-bold text-gray-900">₹{((metrics?.bankBalance || 0) / 100000).toFixed(2)}L</div>
            <p className="text-sm text-gray-600 mt-1">Bank Balance</p>
            <Badge className="mt-3 bg-green-100 text-green-800 border-green-200">Active Accounts</Badge>
          </div>
        );

      case 'total-cash':
        return (
          <div className="text-center p-6">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <Wallet className="h-8 w-8 text-white" />
            </div>
            <div className="text-3xl font-bold text-gray-900">₹{((metrics?.totalCash || 0) / 100000).toFixed(2)}L</div>
            <p className="text-sm text-gray-600 mt-1">Total Cash (Banks + Stock)</p>
          </div>
        );

      case 'gross-profit':
        return <GrossProfitWidgetContent />;

      case 'compliance-alerts':
        return <ComplianceAlertsWidgetContent />;

      case 'kyc-overview':
        return (
          <div className="text-center p-6">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <UserCheck className="h-8 w-8 text-white" />
            </div>
            <div className="text-3xl font-bold text-gray-900">{metrics?.verifiedClients || 0}</div>
            <p className="text-sm text-gray-600 mt-1">KYC Verified</p>
          </div>
        );

      case 'payroll-summary':
        return <PayrollSummaryWidgetContent />;

      case 'shift-reconciliation':
        return <ShiftReconciliationWidget />;

      case 'wallet-balance':
        return <WalletBalanceWidgetContent />;

      default:
        return (
          <div className="p-6 text-center">
            <div className={`w-16 h-16 bg-gradient-to-br ${getCategoryGradient(widget.category)} rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg`}>
              {IconComponent && typeof IconComponent === 'function' ? (
                <IconComponent className="h-8 w-8 text-white" />
              ) : (
                <BarChart3 className="h-8 w-8 text-white" />
              )}
            </div>
            <h4 className="font-semibold text-gray-900 mb-2">{widget.name}</h4>
            <p className="text-sm text-gray-600">{widget.description}</p>
          </div>
        );
    }
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} className={`h-full ${getSizeClasses(widget.size)}`}>
      <Card className={`h-full bg-white shadow-sm hover:shadow-md transition-all duration-300 border-0 shadow-gray-100 ${isDraggable ? 'ring-2 ring-blue-200 cursor-grab active:cursor-grabbing' : ''} ${isDragging ? 'shadow-xl' : ''}`}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-gradient-to-r from-gray-50 to-gray-100">
          <div className="flex items-center gap-2">
            {isDraggable && (
              <div {...listeners} className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
            <div className={`p-1.5 bg-gradient-to-br ${getCategoryGradient(widget.category)} rounded-lg shadow-sm`}>
              {IconComponent && typeof IconComponent === 'function' ? (
                <IconComponent className="h-4 w-4 text-white" />
              ) : (
                <BarChart3 className="h-4 w-4 text-white" />
              )}
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
        <CardContent className={`p-0 ${widget.size === 'small' ? 'min-h-[180px] flex items-center justify-center' : ''}`}>
          {renderWidgetContent()}
        </CardContent>
      </Card>
    </div>
  );
}

export { DashboardWidget };
export default DashboardWidget;
