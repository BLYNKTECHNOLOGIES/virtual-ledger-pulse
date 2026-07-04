
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
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { fetchActiveWalletsWithLedgerUsdtBalance } from "@/lib/wallet-ledger-balance";
import { isAdjustmentWallet } from "@/lib/adjustment-accounts";
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
      // Exclude audit/contra-entry adjustment wallets from totals
      return (data || []).filter((w: any) => !isAdjustmentWallet(w.wallet_name));
    },
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const totalBalance = (wallets || []).reduce((sum, w) => sum + (Number(w.current_balance) || 0), 0);

  if (isLoading) {
    return <div className="p-6 text-center text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="p-4 flex flex-col h-full w-full">
      <div className="text-center mb-3">
        <p className="text-2xl font-bold text-foreground">{totalBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT</p>
        <p className="text-xs text-muted-foreground mt-1">Total across {(wallets || []).length} wallets</p>
      </div>
      <div className="space-y-1 flex-1 overflow-y-auto w-full">
        {(wallets || []).filter(w => Number(w.current_balance) > 0).map((w: any) => (
          <div key={w.id} className="flex items-center justify-between text-sm px-4 py-2.5 rounded-lg bg-muted/50 w-full">
            <span className="text-muted-foreground font-medium truncate mr-4">{w.wallet_name}</span>
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
        <div className="text-3xl font-bold text-foreground">₹{Math.round(Number(gross)).toLocaleString('en-IN')}</div>
        <p className="text-sm text-muted-foreground mt-1">Gross Profit</p>
      </div>
    );
  };

  const ComplianceAlertsWidgetContent = () => (
    <div className="text-center p-4">
      <div className="text-3xl font-bold text-foreground">{metrics?.pendingActions || 0}</div>
      <p className="text-sm text-muted-foreground mt-1">Compliance Alerts</p>
    </div>
  );

  const PayrollSummaryWidgetContent = () => (
    <div className="text-center p-4">
      <div className="text-3xl font-bold text-foreground">{metrics?.employees || 0}</div>
      <p className="text-sm text-muted-foreground mt-1">Payroll Summary</p>
    </div>
  );

  const getCategoryGradient = (category: string) => {
    const gradients: Record<string, string> = {
      'Sales': 'from-success to-success',
      'Purchase': 'from-warning to-destructive',
      'Clients': 'from-info to-primary',
      'Stock': 'from-warning to-warning',
      'Banking': 'from-success to-success',
      'PNL': 'from-primary to-primary',
      'Statistics': 'from-primary to-info',
      'Compliance': 'from-destructive to-destructive',
      'HRMS': 'from-pink-500 to-destructive',
      'Payroll': 'from-teal-500 to-info',
    };
    return gradients[category] || 'from-muted to-muted';
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


      case 'recent-orders':
        return <RecentOrdersWidget />;

      case 'daily-activity':
        return <DailyActivityWidget />;

      case 'upcoming-tasks':
        return <UpcomingTasksWidget />;

      case 'profit-margin':
        return <ProfitMarginWidget dateRange={dateRange} />;

      case 'performance-overview':
        return <PerformanceOverviewWidget metrics={metrics} dateRange={dateRange} />;


      case 'growth-rate':
        return <GrowthRateWidget dateRange={dateRange} />;

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
            <div className="w-16 h-16 bg-gradient-to-br from-warning to-destructive rounded-full flex items-center justify-center mx-auto mb-4">
              <DollarSign className="h-8 w-8 text-primary-foreground" />
            </div>
            <div className="text-3xl font-bold text-foreground">₹{((metrics?.totalSpending || 0) / 100000).toFixed(1)}L</div>
            <p className="text-sm text-muted-foreground mt-1">Total Purchases</p>
          </div>
        );

      case 'purchase-orders-count':
        return (
          <div className="text-center p-6">
            <div className="w-16 h-16 bg-gradient-to-br from-warning to-warning rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="h-8 w-8 text-primary-foreground" />
            </div>
            <div className="text-3xl font-bold text-foreground">{metrics?.totalPurchases || 0}</div>
            <p className="text-sm text-muted-foreground mt-1">Purchase Orders</p>
            <Badge className="mt-3 bg-warning/10 text-warning border-warning/20">Selected Period</Badge>
          </div>
        );

      case 'pending-settlements':
        return <PendingSettlementsWidget />;


      case 'stock-value':
        return (
          <div className="text-center p-6">
            <div className="w-16 h-16 bg-gradient-to-br from-warning to-warning rounded-full flex items-center justify-center mx-auto mb-4">
              <Package className="h-8 w-8 text-primary-foreground" />
            </div>
            <div className="text-3xl font-bold text-foreground">₹{((metrics?.stockValue || 0) / 100000).toFixed(2)}L</div>
            <p className="text-sm text-muted-foreground mt-1">Stock Value (INR)</p>
          </div>
        );

      case 'bank-balance-total':
        return (
          <div className="text-center p-6">
            <div className="w-16 h-16 bg-gradient-to-br from-success to-success rounded-full flex items-center justify-center mx-auto mb-4">
              <Building className="h-8 w-8 text-primary-foreground" />
            </div>
            <div className="text-3xl font-bold text-foreground">₹{((metrics?.bankBalance || 0) / 100000).toFixed(2)}L</div>
            <p className="text-sm text-muted-foreground mt-1">Bank Balance</p>
            <Badge className="mt-3 bg-success/10 text-success border-success/20">Active Accounts</Badge>
          </div>
        );

      case 'total-cash':
        return (
          <div className="text-center p-6">
            <div className="w-16 h-16 bg-gradient-to-br from-info to-primary rounded-full flex items-center justify-center mx-auto mb-4">
              <Wallet className="h-8 w-8 text-primary-foreground" />
            </div>
            <div className="text-3xl font-bold text-foreground">₹{((metrics?.totalCash || 0) / 100000).toFixed(2)}L</div>
            <p className="text-sm text-muted-foreground mt-1">Total Cash (Banks + Stock)</p>
          </div>
        );

      case 'gross-profit':
        return <GrossProfitWidgetContent />;

      case 'compliance-alerts':
        return <ComplianceAlertsWidgetContent />;


      case 'payroll-summary':
        return <PayrollSummaryWidgetContent />;

      case 'shift-reconciliation':
        return <ShiftReconciliationWidget />;

      case 'wallet-balance':
        return <WalletBalanceWidgetContent />;

      default:
        return (
          <div className="p-6 text-center">
            <div className={`w-16 h-16 bg-gradient-to-br ${getCategoryGradient(widget.category)} rounded-xl flex items-center justify-center mx-auto mb-4 shadow-sm`}>
              {IconComponent && typeof IconComponent === 'function' ? (
                <IconComponent className="h-8 w-8 text-primary-foreground" />
              ) : (
                <BarChart3 className="h-8 w-8 text-primary-foreground" />
              )}
            </div>
            <h4 className="font-semibold text-foreground mb-2">{widget.name}</h4>
            <p className="text-sm text-muted-foreground">{widget.description}</p>
          </div>
        );
    }
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} className={`h-full ${getSizeClasses(widget.size)}`}>
      <Card className={`h-full bg-card shadow-sm hover:shadow-md transition-all duration-300 border-0 shadow-muted ${isDraggable ? 'ring-2 ring-info cursor-grab active:cursor-grabbing' : ''} ${isDragging ? 'shadow-sm' : ''}`}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-gradient-to-r from-muted to-muted">
          <div className="flex items-center gap-2">
            {isDraggable && (
              <div {...listeners} className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
            <div className={`p-1.5 bg-gradient-to-br ${getCategoryGradient(widget.category)} rounded-lg shadow-sm`}>
              {IconComponent && typeof IconComponent === 'function' ? (
                <IconComponent className="h-4 w-4 text-primary-foreground" />
              ) : (
                <BarChart3 className="h-4 w-4 text-primary-foreground" />
              )}
            </div>
            <CardTitle className="text-sm font-semibold text-foreground">{widget.name}</CardTitle>
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
                className="text-destructive focus:text-destructive"
              >
                <X className="h-4 w-4 mr-2" />
                Remove Widget
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent className={`p-0 ${widget.size === 'small' ? 'min-h-[180px] flex flex-col items-stretch justify-center' : ''}`}>
          <div className="w-full">{renderWidgetContent()}</div>
        </CardContent>
      </Card>
    </div>
  );
}

export { DashboardWidget };
export default DashboardWidget;
