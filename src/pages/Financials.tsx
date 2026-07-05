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
  Percent
} from "lucide-react";
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

export default function Financials() {
  const navigate = useNavigate();
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
      <div className="bg-card rounded-xl mb-6 shadow-sm border border-border">
        <div className="px-6 py-8">
          <PageHeader
            title={
              <span className="flex items-center gap-3">
                <span className="p-3 bg-success/10 rounded-xl shadow-sm">
                  <Calculator className="h-8 w-8 text-success" />
                </span>
                Financial Management
              </span>
            }
            description="Comprehensive financial overview and management"
            actions={
              <div className="flex flex-wrap items-center gap-2 print:hidden">
                <DateRangePicker
                  dateRange={dateRange}
                  onDateRangeChange={setDateRange}
                  preset={datePreset}
                  onPresetChange={handleDatePresetChange}
                  className="w-auto min-w-[200px]"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-card border border-success text-success hover:bg-success/10 shadow-md"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-card border border-success text-success hover:bg-success/10 shadow-md"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Transaction
                </Button>
              </div>
            }
          />

        </div>
      </div>

      {/* Key Financial Metrics - Clickable */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Total Revenue - Clickable to Sales */}
        <ClickableCard 
          to="/sales" 
          searchParams={buildTransactionFilters({ 
            dateFrom: startDate, 
            dateTo: endDate 
          })}
        >
          <Card className="bg-success text-primary-foreground border-0 shadow-sm hover:shadow-sm transition-all duration-300">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-success text-sm font-medium">Total Revenue</p>
                  <p className="text-2xl xl:text-3xl font-bold mt-2 truncate">
                    {formatCurrency(financialData?.totalRevenue || 0)}
                  </p>
                  <div className="flex items-center gap-1 mt-2">
                    <ArrowUpIcon className="h-4 w-4" />
                    <span className="text-sm font-medium">Click to view sales →</span>
                  </div>
                </div>
                <div className="bg-success p-3 rounded-xl shadow-sm flex-shrink-0">
                  <DollarSign className="h-8 w-8" />
                </div>
              </div>
            </CardContent>
          </Card>
        </ClickableCard>

        {/* Total Expenses - Clickable to BAMS Journal */}
        <ClickableCard 
          to="/bams" 
          searchParams={{ tab: 'journal' }}
        >
          <Card className="bg-destructive text-primary-foreground border-0 shadow-sm hover:shadow-sm transition-all duration-300">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-destructive text-sm font-medium">Total Expenses</p>
                  <p className="text-2xl xl:text-3xl font-bold mt-2 truncate">
                    {formatCurrency(financialData?.totalExpenses || 0)}
                  </p>
                  <div className="flex items-center gap-1 mt-2">
                    <ArrowDownIcon className="h-4 w-4" />
                    <span className="text-sm font-medium">Click to view transactions →</span>
                  </div>
                </div>
                <div className="bg-destructive p-3 rounded-xl shadow-sm flex-shrink-0">
                  <TrendingDown className="h-8 w-8" />
                </div>
              </div>
            </CardContent>
          </Card>
        </ClickableCard>

        {/* Total Asset Value */}
        <TotalAssetValueWidget />

        {/* Bank Balance - Clickable to BAMS */}
        <ClickableCard to="/bams">
          <Card className="bg-primary text-primary-foreground border-0 shadow-sm hover:shadow-sm transition-all duration-300">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-primary text-sm font-medium">Bank Balance</p>
                  <p className="text-2xl xl:text-3xl font-bold mt-2 truncate">
                    {formatCurrency(financialData?.totalBankBalance || 0)}
                  </p>
                  <div className="flex items-center gap-1 mt-2">
                    <Wallet className="h-4 w-4" />
                    <span className="text-sm font-medium">Click to view accounts →</span>
                  </div>
                </div>
                <div className="bg-primary p-3 rounded-xl shadow-sm flex-shrink-0">
                  <Wallet className="h-8 w-8" />
                </div>
              </div>
            </CardContent>
          </Card>
        </ClickableCard>
      </div>

      {/* Financial Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex w-full overflow-x-auto gap-1 md:grid md:grid-cols-6 print:hidden">
          <TabsTrigger value="overview" className="text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">Overview</TabsTrigger>
          <TabsTrigger value="accounts" className="text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">
            <span className="hidden sm:inline">Bank Accounts</span>
            <span className="sm:hidden">Banks</span>
          </TabsTrigger>
          <TabsTrigger value="transactions" className="text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">
            <span className="hidden sm:inline">Transactions</span>
            <span className="sm:hidden">Trans.</span>
          </TabsTrigger>
          <TabsTrigger value="platform-fees" className="flex items-center gap-1 text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">
            <Percent className="h-3 w-3" />
            <span className="hidden sm:inline">Platform Fees</span>
            <span className="sm:hidden">Fees</span>
          </TabsTrigger>
          <TabsTrigger value="asset-history" className="flex items-center gap-1 text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">
            <TrendingUp className="h-3 w-3" />
            <span className="hidden sm:inline">Asset Value History</span>
            <span className="sm:hidden">Assets</span>
          </TabsTrigger>
          <TabsTrigger value="reports" className="text-xs md:text-sm whitespace-nowrap px-2 md:px-4 min-w-fit">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Cash Flow Chart */}
            <Card className="bg-card border border-border shadow-sm">
              <CardHeader className="bg-success text-primary-foreground rounded-t-lg">
                <CardTitle className="flex items-center gap-3 text-xl">
                  <div className="p-2 bg-success rounded-lg shadow-md">
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
              <CardHeader className="bg-success text-primary-foreground rounded-t-lg">
                <CardTitle className="flex items-center gap-3 text-xl">
                  <div className="p-2 bg-success rounded-lg shadow-md">
                    <Target className="h-6 w-6" />
                  </div>
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <Button className="w-full bg-success hover:bg-success">
                  <Plus className="h-4 w-4 mr-2" />
                  Record Income
                </Button>
                <Button variant="outline" className="w-full border-success/20 text-success hover:bg-success/10">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Record Expense
                </Button>
                <Button variant="outline" className="w-full border-success/20 text-success hover:bg-success/10">
                  <FileText className="h-4 w-4 mr-2" />
                  Generate Report
                </Button>
                <Button variant="outline" className="w-full border-success/20 text-success hover:bg-success/10">
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
                <CardHeader className="bg-gradient-to-r from-info to-primary text-primary-foreground rounded-t-lg">
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
            <CardHeader className="bg-success text-primary-foreground rounded-t-lg">
              <CardTitle className="flex items-center gap-3 text-xl">
                <div className="p-2 bg-success rounded-lg shadow-md">
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
                <Button size="sm" className="bg-success hover:bg-success">
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
                <p className="text-sm text-muted-foreground mb-4">Assets, liabilities & equity</p>
                <Button size="sm" className="bg-primary hover:bg-primary">
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