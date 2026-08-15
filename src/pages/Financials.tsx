import { useState } from "react";
import { isAdjustmentBank } from "@/lib/adjustment-accounts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  PieChart, 
  BarChart3, 
  CreditCard,
  Wallet,
  Calculator,
  FileText,
  ArrowUpIcon,
  ArrowDownIcon,
  Eye,
  Download,
  Plus,
  Building,
  Calendar,
  Target,
  Shield,
  Percent,
  ChevronRight
} from "lucide-react";
import { StatTile } from "@/components/financials/StatTile";
import { formatCompactINR, formatExactINR } from "@/lib/formatCompactCurrency";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { format, subDays, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { PermissionGate } from "@/components/PermissionGate";
import { useNavigate } from "react-router-dom";
import { DateRange } from "react-day-picker";
import { DateRangePicker, DateRangePreset, getDateRangeFromPreset } from "@/components/ui/date-range-picker";
import { PlatformFeesSummary } from "@/components/financials/PlatformFeesSummary";
import { TotalAssetValueWidget } from "@/components/financials/TotalAssetValueWidget";
import { AssetValueHistoryTab } from "@/components/financials/AssetValueHistoryTab";
import { ClickableCard, buildTransactionFilters } from "@/components/ui/clickable-card";
import { BalanceSheetDialog } from "@/components/financials/BalanceSheetDialog";

export default function Financials() {
  const navigate = useNavigate();
  const [balanceSheetOpen, setBalanceSheetOpen] = useState(false);
  const [datePreset, setDatePreset] = useState<DateRangePreset>(() => {
    const saved = localStorage.getItem('financials_date_preset');
    return (saved as DateRangePreset) || 'today';
  });
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const saved = localStorage.getItem('financials_date_preset');
    return getDateRangeFromPreset((saved as DateRangePreset) || 'today');
  });

  const handleDatePresetChange = (preset: DateRangePreset) => {
    setDatePreset(preset);
    localStorage.setItem('financials_date_preset', preset);
  };

  // Calculate date range based on selected range
  const getDateRangeValues = () => {
    if (dateRange?.from && dateRange?.to) {
      return { start: dateRange.from, end: dateRange.to };
    }
    // Fallback to current month
    const now = new Date();
    return { start: startOfMonth(now), end: endOfMonth(now) };
  };

  const { start: startDate, end: endDate } = getDateRangeValues();

  // Fetch financial data
  const { data: financialData, isLoading } = useQuery({
    queryKey: ['financial_data', dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async () => {
      // Get revenue data from sales orders (paginated — ranges can exceed 1000 rows)
      const salesData = await fetchAllPaginated<any>(() =>
        supabase
          .from('sales_orders')
          .select('total_amount, order_date, created_at')
          .gte('order_date', format(startDate, 'yyyy-MM-dd'))
          .lte('order_date', format(endDate, 'yyyy-MM-dd'))
          .order('order_date', { ascending: true }));

      // Get purchase orders for reference (COGS, not expenses)
      const purchaseData = await fetchAllPaginated<any>(() =>
        supabase
          .from('purchase_orders')
          .select('total_amount, order_date, created_at')
          .gte('order_date', format(startDate, 'yyyy-MM-dd'))
          .lte('order_date', format(endDate, 'yyyy-MM-dd'))
          .order('order_date', { ascending: true }));

      // Get OPERATING expenses from bank_transactions (excluding Purchase/Sales which are COGS/Revenue)
      const operatingExpenses = await fetchAllPaginated<any>(() =>
        supabase
          .from('bank_transactions')
          .select('amount, transaction_date, category')
          .eq('transaction_type', 'EXPENSE')
          .not('category', 'in', '("Purchase","Sales","Stock Purchase","Stock Sale","Trade","Trading","Payment Gateway Settlement","Settlement")')
          .gte('transaction_date', format(startDate, 'yyyy-MM-dd'))
          .lte('transaction_date', format(endDate, 'yyyy-MM-dd')));


      // Get bank balances (exclude audit/adjustment buckets)
      const { data: bankDataRaw } = await supabase
        .from('bank_accounts')
        .select('account_name, balance, bank_name')
        .eq('status', 'ACTIVE');
      const bankData = (bankDataRaw || []).filter(b => !isAdjustmentBank(b.account_name));

      // Get recent transactions
      const { data: transactionsData } = await supabase
        .from('bank_transactions')
        .select('amount, transaction_type, description, transaction_date, bank_account_id')
        .gte('transaction_date', format(startDate, 'yyyy-MM-dd'))
        .lte('transaction_date', format(endDate, 'yyyy-MM-dd'))
        .order('transaction_date', { ascending: false })
        .limit(10);

      const totalRevenue = salesData?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;
      // Total Expenses = Operating Expenses only (NOT including purchases which are COGS)
      const totalExpenses = operatingExpenses?.reduce((sum, exp) => sum + Number(exp.amount), 0) || 0;
      const totalBankBalance = bankData?.reduce((sum, account) => sum + Number(account.balance), 0) || 0;
      const netCashFlow = totalRevenue - totalExpenses;

      return {
        totalRevenue,
        totalExpenses,
        netCashFlow,
        totalBankBalance,
        bankAccounts: bankData || [],
        recentTransactions: transactionsData || [],
        salesData: salesData || [],
        purchaseData: purchaseData || []
      };
    },
  });

  const formatCurrency = (amount: number) => {
    return `${amount < 0 ? '-' : ''}₹${Math.abs(amount).toLocaleString('en-IN')}`;
  };

  return (
    <PermissionGate
      permissions={["accounting_view"]}
      fallback={
        <div className="min-h-screen bg-muted/50 p-6 flex items-center justify-center page-mount">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <Shield className="h-12 w-12 text-muted-foreground" />
                <div>
                  <h2 className="text-xl font-semibold">Access Denied</h2>
                  <p className="text-muted-foreground mt-2">
                    You don't have permission to access Financials.
                  </p>
                </div>
                <Button onClick={() => navigate("/dashboard")}>
                  Return to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      }
    >
    <div className="min-h-screen bg-muted/50 p-6">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="p-2 bg-card border border-border rounded-lg shrink-0">
            <Calculator className="h-5 w-5 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-foreground leading-tight truncate">
              Financial Management
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              Comprehensive financial overview and management
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <DateRangePicker
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            preset={datePreset}
            onPresetChange={handleDatePresetChange}
            className="w-auto"
          />
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New Transaction
          </Button>
        </div>
      </div>


      {/* Key Financial Metrics - Clickable */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 items-stretch">
        {/* Total Revenue - Clickable to Sales */}
        <ClickableCard 
          to="/sales" 
          searchParams={buildTransactionFilters({ 
            dateFrom: startDate, 
            dateTo: endDate 
          })}
          className="h-full"
        >
          <StatTile
            label="Total Revenue"
            value={formatCompactINR(financialData?.totalRevenue || 0)}
            exactValue={formatExactINR(financialData?.totalRevenue || 0)}
            hint={<><span>View sales</span><ChevronRight className="h-3.5 w-3.5" /></>}
            icon={<DollarSign className="h-5 w-5 text-success" />}
            iconClassName="bg-success/10"
            interactive
          />
        </ClickableCard>

        {/* Total Expenses - Clickable to BAMS Journal */}
        <ClickableCard 
          to="/bams" 
          searchParams={{ tab: 'journal' }}
          className="h-full"
        >
          <StatTile
            label="Total Expenses"
            value={formatCompactINR(financialData?.totalExpenses || 0)}
            exactValue={formatExactINR(financialData?.totalExpenses || 0)}
            hint={<><span>View transactions</span><ChevronRight className="h-3.5 w-3.5" /></>}
            icon={<TrendingDown className="h-5 w-5 text-destructive" />}
            iconClassName="bg-destructive/10"
            interactive
          />
        </ClickableCard>

        {/* Total Asset Value */}
        <TotalAssetValueWidget />

        {/* Bank Balance - Clickable to BAMS */}
        <ClickableCard to="/bams" className="h-full">
          <StatTile
            label="Bank Balance"
            value={formatCompactINR(financialData?.totalBankBalance || 0)}
            exactValue={formatExactINR(financialData?.totalBankBalance || 0)}
            hint={<><span>View accounts</span><ChevronRight className="h-3.5 w-3.5" /></>}
            icon={<Wallet className="h-5 w-5 text-primary" />}
            iconClassName="bg-primary/10"
            interactive
          />
        </ClickableCard>
      </div>


      {/* Financial Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex w-full flex-wrap gap-1 h-auto justify-start bg-transparent p-0 mb-4 border-b border-border rounded-none print:hidden">
          {[
            { value: 'overview', label: 'Overview', short: 'Overview' },
            { value: 'accounts', label: 'Bank Accounts', short: 'Banks' },
            { value: 'transactions', label: 'Transactions', short: 'Trans.' },
            { value: 'platform-fees', label: 'Platform Fees', short: 'Fees', icon: <Percent className="h-3.5 w-3.5" /> },
            { value: 'asset-history', label: 'Asset Value History', short: 'Assets', icon: <TrendingUp className="h-3.5 w-3.5" /> },
            { value: 'reports', label: 'Reports', short: 'Reports' },
          ].map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="flex items-center gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-3 py-2 text-xs md:text-sm font-medium text-muted-foreground whitespace-nowrap shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
            >
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.short}</span>
            </TabsTrigger>
          ))}
        </TabsList>


        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Cash Flow Chart */}
            <Card className="bg-card border border-border shadow-sm">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-3 text-xl">
                  <div className="p-2 bg-muted rounded-lg">
                    <BarChart3 className="h-6 w-6" />
                  </div>
                  Cash Flow Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={[
                      { name: 'Revenue', value: financialData?.totalRevenue || 0, fill: 'hsl(var(--success))' },
                      { name: 'Expenses', value: financialData?.totalExpenses || 0, fill: 'hsl(var(--destructive))' }
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis tickFormatter={(value) => `₹${(value / 1000)}K`} />
                      <Tooltip formatter={(value: number) => [`₹${value.toLocaleString('en-IN')}`, 'Amount']} />
                      <Area type="monotone" dataKey="value" stroke="hsl(var(--success))" fill="hsl(var(--success))" fillOpacity={0.6} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card className="bg-card border border-border shadow-sm">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-3 text-xl">
                  <div className="p-2 bg-muted rounded-lg">
                    <Target className="h-6 w-6" />
                  </div>
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <Button className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Record Income
                </Button>
                <Button variant="outline" className="w-full">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Record Expense
                </Button>
                <Button variant="outline" className="w-full">
                  <FileText className="h-4 w-4 mr-2" />
                  Generate Report
                </Button>
                <Button variant="outline" className="w-full">
                  <Calculator className="h-4 w-4 mr-2" />
                  Financial Calculator
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="accounts" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {financialData?.bankAccounts.map((account, index) => (
              <Card key={index} className="bg-card border border-border shadow-sm hover:shadow-sm transition-all duration-300">
                <CardHeader className="border-b border-border">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Building className="h-5 w-5" />
                    {account.account_name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Bank</span>
                      <span className="font-semibold">{account.bank_name}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Balance</span>
                      <span className="text-xl font-bold text-success">
                        {formatCurrency(Number(account.balance))}
                      </span>
                    </div>
                    <div className="pt-3 border-t">
                      <Button size="sm" variant="outline" className="w-full">
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )) || (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                <Building className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="font-medium">No bank accounts found</p>
                <p className="text-sm">Add bank accounts to track balances</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="transactions" className="space-y-6">
          <Card className="bg-card border border-border shadow-sm">
            <CardHeader className="border-b border-border">
              <CardTitle className="flex items-center gap-3 text-xl">
                <div className="p-2 bg-muted rounded-lg">
                  <CreditCard className="h-6 w-6" />
                </div>
                Recent Transactions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                {financialData?.recentTransactions.map((transaction, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        transaction.transaction_type === 'INCOME' ? 'bg-success/10' : 'bg-destructive/10'
                      }`}>
                        {transaction.transaction_type === 'INCOME' ? (
                          <ArrowUpIcon className="h-4 w-4 text-success" />
                        ) : (
                          <ArrowDownIcon className="h-4 w-4 text-destructive" />
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-foreground">
                          {transaction.description || 'Transaction'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(transaction.transaction_date), "MMM dd, yyyy")}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold text-sm ${
                        transaction.transaction_type === 'INCOME' ? 'text-success' : 'text-destructive'
                      }`}>
                        {transaction.transaction_type === 'INCOME' ? '+' : '-'}
                        {formatCurrency(Number(transaction.amount))}
                      </p>
                    </div>
                  </div>
                )) || (
                  <div className="text-center py-12 text-muted-foreground">
                    <CreditCard className="h-16 w-16 mx-auto mb-4 opacity-50" />
                    <p className="font-medium">No transactions found</p>
                    <p className="text-sm">Transactions will appear here</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="bg-card border border-border shadow-sm hover:shadow-sm transition-all duration-300 cursor-pointer">
              <CardContent className="p-6 text-center">
                <div className="w-16 h-16 bg-success/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <FileText className="h-8 w-8 text-success" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Profit & Loss</h3>
                <p className="text-sm text-muted-foreground mb-4">Comprehensive P&L statement</p>
                <Button size="sm" >
                  Generate Report
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-card border border-border shadow-sm hover:shadow-sm transition-all duration-300 cursor-pointer">
              <CardContent className="p-6 text-center">
                <div className="w-16 h-16 bg-info/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <BarChart3 className="h-8 w-8 text-info" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Cash Flow</h3>
                <p className="text-sm text-muted-foreground mb-4">Detailed cash flow analysis</p>
                <Button size="sm" className="bg-info hover:bg-info">
                  Generate Report
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-card border border-border shadow-sm hover:shadow-sm transition-all duration-300 cursor-pointer">
              <CardContent className="p-6 text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <PieChart className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Balance Sheet</h3>
                <p className="text-sm text-muted-foreground mb-4">Company-wise, ledger-supported</p>
                <Button size="sm" onClick={() => setBalanceSheetOpen(true)}>
                  Generate Report
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Platform Fees Tab */}
        <TabsContent value="platform-fees" className="space-y-6">
          <PlatformFeesSummary startDate={startDate} endDate={endDate} />
        </TabsContent>

        {/* Asset Value History Tab */}
        <TabsContent value="asset-history" className="space-y-6">
          <AssetValueHistoryTab />
        </TabsContent>
      </Tabs>
    </div>
    </PermissionGate>
  );
}