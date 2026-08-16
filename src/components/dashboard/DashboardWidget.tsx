
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WidgetShell, WidgetHeader, WidgetBody, WidgetMenu, WidgetEmpty, WidgetSkeleton } from "./primitives/WidgetShell";
import { WidgetMetric, WidgetList, WidgetListRow } from "./primitives/WidgetAtoms";
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
    return <WidgetSkeleton variant="list" rows={3} />;
  }

  const funded = (wallets || []).filter((w: any) => Number(w.current_balance) > 0);

  return (
    <div className="flex w-full flex-col px-3 py-2.5">
      <WidgetMetric
        label="Wallet Balance"
        value={`${totalBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT`}
        helper={`Across ${(wallets || []).length} wallets`}
        className="mb-2 px-1"
      />
      {funded.length === 0 ? (
        <WidgetEmpty icon={Wallet} title="No funded wallets" />
      ) : (
        <WidgetList className="min-w-0 flex-1 overflow-y-auto">
          {funded.map((w: any) => (
            <WidgetListRow
              key={w.id}
              title={w.wallet_name}
              value={Number(w.current_balance || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            />
          ))}
        </WidgetList>
      )}
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
  // Drag/sort is owned by the tile wrapper (DraggableDashboardSection); this
  // component only renders the standardized widget shell + content.


  const IconComponent = widget.icon || widgetIconMap[widget.id] || BarChart3;

  const GrossProfitWidgetContent = () => {
    // Gross Profit must match the P&L page (source of truth):
    // NPM × Total Sales Qty, where NPM = Avg Sales Rate − Effective Purchase Rate
    // (effective purchase rate is adjusted for USDT fees). All values normalized to
    // USDT-equivalent via effective_usdt_qty / effective_usdt_rate.
    const toDateStr = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    const now = new Date();
    const startStr = toDateStr(dateRange?.from ?? new Date(now.getFullYear(), now.getMonth(), 1));
    const endStr = toDateStr(dateRange?.to ?? now);

    const { data: gross, isLoading } = useQuery({
      queryKey: ['dashboard_gross_profit_pnl', startStr, endStr],
      queryFn: async () => {
        // Legacy non-USDT orders excluded from WAC (same list as P&L)
        const excludedOrderIds = [
          '1fd66952-bf77-4bf4-a183-4c0fbc34510f',
          '937f087e-6b2a-4328-a2dd-0166e0682c5b',
          '4f90519e-6d47-43c4-8206-9278927c788f',
        ];

        const [salesOrders, purchaseOrders, feeDeductionsData, conversionFeesData, transferFeesData] = await Promise.all([
          fetchAllPaginated<any>(() => supabase.from('sales_orders')
            .select('quantity, price_per_unit, effective_usdt_qty, effective_usdt_rate')
            .eq('status', 'COMPLETED').gte('order_date', startStr).lte('order_date', endStr)),
          fetchAllPaginated<any>(() => supabase.from('purchase_orders')
            .select('id, total_amount, effective_usdt_qty')
            .eq('status', 'COMPLETED').gte('order_date', startStr).lte('order_date', endStr)),
          fetchAllPaginated<any>(() => supabase.from('wallet_fee_deductions')
            .select('fee_usdt_amount').gte('created_at', startStr).lte('created_at', endStr + 'T23:59:59')),
          fetchAllPaginated<any>(() => supabase.from('erp_product_conversions')
            .select('fee_amount').eq('status', 'APPROVED').gte('approved_at', startStr).lte('approved_at', endStr + 'T23:59:59')),
          fetchAllPaginated<any>(() => supabase.from('wallet_transactions')
            .select('amount').eq('transaction_type', 'DEBIT').eq('reference_type', 'TRANSFER_FEE').eq('asset_code', 'USDT')
            .gte('created_at', startStr).lte('created_at', endStr + 'T23:59:59')),
        ]);

        // Sales — USDT-equivalent
        const totalSalesValue = (salesOrders || []).reduce((s: number, o: any) =>
          s + (Number(o.effective_usdt_qty || o.quantity) || 0) * (Number(o.effective_usdt_rate || o.price_per_unit) || 0), 0);
        const totalSalesQty = (salesOrders || []).reduce((s: number, o: any) =>
          s + (Number(o.effective_usdt_qty || o.quantity) || 0), 0);
        const avgSalesRate = totalSalesQty > 0 ? totalSalesValue / totalSalesQty : 0;

        // Purchases — USDT-equivalent (all-assets mode uses effective_usdt_qty + total_amount)
        let totalPurchaseValue = 0;
        let totalPurchaseQty = 0;
        (purchaseOrders || [])
          .filter((po: any) => !excludedOrderIds.includes(po.id))
          .forEach((po: any) => {
            const effQty = Number(po.effective_usdt_qty || 0);
            const totalAmt = Number(po.total_amount || 0);
            if (effQty > 0) {
              totalPurchaseQty += effQty;
              totalPurchaseValue += totalAmt;
            }
          });
        const avgPurchaseRate = totalPurchaseQty > 0 ? totalPurchaseValue / totalPurchaseQty : 0;

        // Total USDT fees from authoritative sources
        const totalUsdtFees =
          (feeDeductionsData || []).reduce((s: number, f: any) => s + Number(f.fee_usdt_amount || 0), 0) +
          (conversionFeesData || []).reduce((s: number, f: any) => s + Number(f.fee_amount || 0), 0) +
          (transferFeesData || []).reduce((s: number, f: any) => s + Number(f.amount || 0), 0);

        const netPurchaseQty = totalPurchaseQty - totalUsdtFees;
        const effectivePurchaseRate = (totalPurchaseQty > 0 && netPurchaseQty > 0)
          ? totalPurchaseValue / netPurchaseQty
          : avgPurchaseRate;

        const npm = avgSalesRate - effectivePurchaseRate;
        return npm * totalSalesQty;
      },
      staleTime: 60000,
    });

    if (isLoading) return <WidgetSkeleton variant="metric" />;

    return (
      <div className="px-3 py-2.5">
        <WidgetMetric
          label="Gross Profit"
          value={`₹${Math.round(Number(gross || 0)).toLocaleString('en-IN')}`}
          tone={Number(gross || 0) >= 0 ? 'neutral' : 'destructive'}
          helper="Selected period"
        />
      </div>
    );
  };

  const ComplianceAlertsWidgetContent = () => (
    <div className="px-3 py-2.5">
      <WidgetMetric label="Compliance Alerts" value={metrics?.pendingActions || 0} />
    </div>
  );

  const PayrollSummaryWidgetContent = () => (
    <div className="px-3 py-2.5">
      <WidgetMetric label="Payroll Summary" value={metrics?.employees || 0} helper="Employees" />
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
          <div className="px-3 py-2.5">
            <WidgetMetric
              label="Total Purchases"
              value={`₹${((metrics?.totalSpending || 0) / 100000).toFixed(1)}L`}
              helper="Selected period"
            />
          </div>
        );

      case 'purchase-orders-count':
        return (
          <div className="px-3 py-2.5">
            <WidgetMetric
              label="Purchase Orders"
              value={(metrics?.totalPurchases || 0).toLocaleString('en-IN')}
              helper="Selected period"
            />
          </div>
        );

      case 'pending-settlements':
        return <PendingSettlementsWidget />;


      case 'stock-value':
        return (
          <div className="px-3 py-2.5">
            <WidgetMetric
              label="Stock Value"
              value={`₹${((metrics?.stockValue || 0) / 100000).toFixed(2)}L`}
              helper="INR equivalent"
            />
          </div>
        );

      case 'bank-balance-total':
        return (
          <div className="px-3 py-2.5">
            <WidgetMetric
              label="Bank Balance"
              value={`₹${((metrics?.bankBalance || 0) / 100000).toFixed(2)}L`}
              helper="Active accounts"
            />
          </div>
        );

      case 'total-cash':
        return (
          <div className="px-3 py-2.5">
            <WidgetMetric
              label="Total Cash"
              value={`₹${((metrics?.totalCash || 0) / 100000).toFixed(2)}L`}
              helper="Banks + Stock"
            />
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
          <WidgetEmpty
            icon={IconComponent && typeof IconComponent === 'function' ? IconComponent : BarChart3}
            title={widget.name}
            description={widget.description}
          />
        );
    }
  };

  return (
    <div>
      <WidgetShell>
        <WidgetHeader
          title={widget.name}
          icon={IconComponent && typeof IconComponent === 'function' ? IconComponent : BarChart3}
          actions={
            <WidgetMenu
              title={widget.name}
              onMoveUp={() => onMove(widget.id, 'up')}
              onMoveDown={() => onMove(widget.id, 'down')}
              onRemove={() => onRemove(widget.id)}
            />
          }
        />
        <WidgetBody padded={false} className={widget.size === 'small' ? 'flex flex-col justify-center' : undefined}>
          <div className="w-full">{renderWidgetContent()}</div>
        </WidgetBody>
      </WidgetShell>
    </div>
  );
}

export { DashboardWidget };
export default DashboardWidget;
