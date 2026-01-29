import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area } from "recharts";
import { 
  TrendingUp, Users, DollarSign, ShoppingCart, Building, 
  FileBarChart, UserCheck, Download, BarChart3, ArrowUp, ArrowDown, Briefcase
} from "lucide-react";
import { DateRange } from "react-day-picker";
import { DateRangePicker, DateRangePreset, getDateRangeFromPreset } from "@/components/ui/date-range-picker";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";

export function StatisticsTab() {
  const [datePreset, setDatePreset] = useState<DateRangePreset>("last30days");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(getDateRangeFromPreset("last30days"));

  const getDateRange = () => {
    if (dateRange?.from && dateRange?.to) {
      return { startDate: dateRange.from, endDate: dateRange.to };
    }
    const now = new Date();
    return { startDate: startOfMonth(now), endDate: endOfMonth(now) };
  };

  // Fetch real statistics data
  const { data: statsData, isLoading } = useQuery({
    queryKey: ['statistics_dashboard', dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async () => {
      const { startDate, endDate } = getDateRange();
      const startStr = format(startDate, 'yyyy-MM-dd');
      const endStr = format(endDate, 'yyyy-MM-dd');

      // Get previous period for comparison
      const periodDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const prevStartDate = new Date(startDate);
      prevStartDate.setDate(prevStartDate.getDate() - periodDays);
      const prevEndDate = new Date(startDate);
      prevEndDate.setDate(prevEndDate.getDate() - 1);
      const prevStartStr = format(prevStartDate, 'yyyy-MM-dd');
      const prevEndStr = format(prevEndDate, 'yyyy-MM-dd');

      // Fetch sales orders (current period)
      const { data: salesOrders } = await supabase
        .from('sales_orders')
        .select('id, total_amount, order_date, status, payment_status')
        .gte('order_date', startStr)
        .lte('order_date', endStr);

      // Fetch sales orders (previous period)
      const { data: prevSalesOrders } = await supabase
        .from('sales_orders')
        .select('id, total_amount')
        .gte('order_date', prevStartStr)
        .lte('order_date', prevEndStr);

      // Fetch purchase orders (current period)
      const { data: purchaseOrders } = await supabase
        .from('purchase_orders')
        .select('id, total_amount, order_date, status')
        .gte('order_date', startStr)
        .lte('order_date', endStr);

      // Fetch clients
      const { data: clients } = await supabase
        .from('clients')
        .select('id, created_at, kyc_status');

      // Fetch employees
      const { data: employees } = await supabase
        .from('employees')
        .select('id, department, status, salary, created_at');

      // Fetch expenses
      const { data: expenses } = await supabase
        .from('bank_transactions')
        .select('id, amount, category, transaction_date')
        .eq('transaction_type', 'EXPENSE')
        .gte('transaction_date', startStr)
        .lte('transaction_date', endStr);

      // Fetch income
      const { data: income } = await supabase
        .from('bank_transactions')
        .select('id, amount, category, transaction_date')
        .eq('transaction_type', 'INCOME')
        .gte('transaction_date', startStr)
        .lte('transaction_date', endStr);

      // Calculate KPIs
      const currentRevenue = salesOrders?.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) || 0;
      const prevRevenue = prevSalesOrders?.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) || 0;
      const revenueChange = prevRevenue > 0 ? ((currentRevenue - prevRevenue) / prevRevenue) * 100 : 0;

      const totalTrades = (salesOrders?.length || 0) + (purchaseOrders?.length || 0);
      const totalClients = clients?.length || 0;
      const totalEmployees = employees?.filter(e => e.status === 'ACTIVE')?.length || 0;

      const totalExpenses = expenses?.reduce((sum, e) => sum + Number(e.amount || 0), 0) || 0;
      const totalIncome = income?.reduce((sum, i) => sum + Number(i.amount || 0), 0) || 0;

      // Calculate purchase costs for profit
      const purchaseCosts = purchaseOrders?.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) || 0;
      const grossProfit = currentRevenue - purchaseCosts;
      const netProfit = grossProfit - totalExpenses + totalIncome;

      // Monthly data for charts (last 6 months)
      const monthlyData = [];
      for (let i = 5; i >= 0; i--) {
        const monthStart = startOfMonth(subMonths(new Date(), i));
        const monthEnd = endOfMonth(subMonths(new Date(), i));
        const monthStartStr = format(monthStart, 'yyyy-MM-dd');
        const monthEndStr = format(monthEnd, 'yyyy-MM-dd');
        
        const monthSales = salesOrders?.filter(o => 
          o.order_date >= monthStartStr && o.order_date <= monthEndStr
        ) || [];
        const monthPurchases = purchaseOrders?.filter(o => 
          o.order_date >= monthStartStr && o.order_date <= monthEndStr
        ) || [];
        const monthExpenses = expenses?.filter(e => 
          e.transaction_date >= monthStartStr && e.transaction_date <= monthEndStr
        ) || [];

        const monthRevenue = monthSales.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
        const monthPurchaseCost = monthPurchases.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
        const monthExpenseTotal = monthExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
        const monthNetProfit = monthRevenue - monthPurchaseCost - monthExpenseTotal;

        monthlyData.push({
          month: format(monthStart, 'MMM'),
          trades: monthSales.length + monthPurchases.length,
          revenue: monthRevenue,
          netProfit: monthNetProfit,
          expenses: monthExpenseTotal
        });
      }

      // KYC Status breakdown
      const kycApproved = clients?.filter(c => c.kyc_status === 'VERIFIED' || c.kyc_status === 'APPROVED')?.length || 0;
      const kycPending = clients?.filter(c => c.kyc_status === 'PENDING')?.length || 0;
      const kycRejected = clients?.filter(c => c.kyc_status === 'REJECTED')?.length || 0;

      // Department distribution
      const departmentCounts = new Map<string, number>();
      employees?.filter(e => e.status === 'ACTIVE')?.forEach(emp => {
        const dept = emp.department || 'Other';
        departmentCounts.set(dept, (departmentCounts.get(dept) || 0) + 1);
      });
      const departmentData = Array.from(departmentCounts.entries()).map(([name, count]) => ({
        name,
        count
      }));

      // Expense breakdown by category
      const expenseByCategory = new Map<string, number>();
      expenses?.forEach(exp => {
        const cat = exp.category || 'Other';
        expenseByCategory.set(cat, (expenseByCategory.get(cat) || 0) + Number(exp.amount || 0));
      });
      const expenseBreakdown = Array.from(expenseByCategory.entries())
        .map(([category, amount]) => ({
          category,
          amount,
          percentage: totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0
        }))
        .sort((a, b) => b.amount - a.amount);

      // Top clients by trade volume
      const clientVolumes = new Map<string, { name: string; volume: number; trades: number }>();
      salesOrders?.forEach(order => {
        // We don't have client_name directly, so we'll use order counts
      });

      return {
        kpi: {
          revenue: currentRevenue,
          revenueChange,
          clients: totalClients,
          trades: totalTrades,
          employees: totalEmployees,
          profit: netProfit
        },
        monthlyData,
        kyc: {
          approved: kycApproved,
          pending: kycPending,
          rejected: kycRejected
        },
        departmentData,
        expenseBreakdown,
        totalExpenses,
        totalSalary: employees?.filter(e => e.status === 'ACTIVE')?.reduce((sum, e) => sum + Number(e.salary || 0), 0) || 0
      };
    },
  });

  const formatCurrency = (value: number) => {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)}Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(2)}L`;
    if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
    return `₹${value.toFixed(2)}`;
  };

  const formatNumber = (value: number) => {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toString();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading statistics...</p>
        </div>
      </div>
    );
  }

  const { kpi, monthlyData, kyc, departmentData, expenseBreakdown, totalExpenses, totalSalary } = statsData || {
    kpi: { revenue: 0, revenueChange: 0, clients: 0, trades: 0, employees: 0, profit: 0 },
    monthlyData: [],
    kyc: { approved: 0, pending: 0, rejected: 0 },
    departmentData: [],
    expenseBreakdown: [],
    totalExpenses: 0,
    totalSalary: 0
  };

  return (
    <div className="min-h-screen bg-background p-6 space-y-8">
      {/* Header with Title and Date Filter */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <BarChart3 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Statistics & Analytics</h1>
            <p className="text-muted-foreground">Real-time business insights and performance metrics</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <DateRangePicker
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            preset={datePreset}
            onPresetChange={setDatePreset}
            className="min-w-[200px]"
          />
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-8">
        <Card className="shadow-lg border-0 bg-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Revenue</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(kpi.revenue)}</p>
                <div className="flex items-center mt-1">
                  {kpi.revenueChange >= 0 ? (
                    <>
                      <ArrowUp className="h-3 w-3 text-green-600 mr-1" />
                      <span className="text-xs font-medium text-green-600">+{kpi.revenueChange.toFixed(1)}%</span>
                    </>
                  ) : (
                    <>
                      <ArrowDown className="h-3 w-3 text-red-600 mr-1" />
                      <span className="text-xs font-medium text-red-600">{kpi.revenueChange.toFixed(1)}%</span>
                    </>
                  )}
                </div>
              </div>
              <div className="p-2 bg-green-500/10 rounded-lg">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-0 bg-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Clients</p>
                <p className="text-2xl font-bold text-foreground">{formatNumber(kpi.clients)}</p>
                <p className="text-xs text-muted-foreground mt-1">Total registered</p>
              </div>
              <div className="p-2 bg-primary/10 rounded-lg">
                <Users className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-0 bg-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Trades</p>
                <p className="text-2xl font-bold text-foreground">{formatNumber(kpi.trades)}</p>
                <p className="text-xs text-muted-foreground mt-1">In period</p>
              </div>
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <ShoppingCart className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-0 bg-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Employees</p>
                <p className="text-2xl font-bold text-foreground">{kpi.employees}</p>
                <p className="text-xs text-muted-foreground mt-1">Active</p>
              </div>
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <Briefcase className="h-5 w-5 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-0 bg-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Net Profit</p>
                <p className={`text-2xl font-bold ${kpi.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(kpi.profit)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">In period</p>
              </div>
              <div className="p-2 bg-green-500/10 rounded-lg">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Trading Volume */}
        <Card className="shadow-lg border-0 bg-card">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg font-semibold">Trading Volume (Last 6 Months)</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {monthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px"
                    }}
                  />
                  <Area type="monotone" dataKey="trades" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} name="Trades" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No trading data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Revenue & Profit */}
        <Card className="shadow-lg border-0 bg-card">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              <CardTitle className="text-lg font-semibold">Revenue & Profit (Last 6 Months)</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {monthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" tickFormatter={(value) => formatCurrency(value)} />
                  <Tooltip 
                    formatter={(value) => formatCurrency(Number(value))}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px"
                    }}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} name="Revenue" />
                  <Line type="monotone" dataKey="netProfit" stroke="hsl(142, 76%, 36%)" strokeWidth={2} name="Net Profit" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No financial data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* KYC Status Breakdown */}
        <Card className="shadow-lg border-0 bg-card">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-lg font-semibold">KYC Status</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {(kyc.approved + kyc.pending + kyc.rejected) > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={[
                      { name: "Approved", value: kyc.approved },
                      { name: "Pending", value: kyc.pending },
                      { name: "Rejected", value: kyc.rejected }
                    ].filter(d => d.value > 0)}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  >
                    <Cell fill="hsl(142, 76%, 36%)" />
                    <Cell fill="hsl(45, 93%, 47%)" />
                    <Cell fill="hsl(0, 84%, 60%)" />
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No KYC data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Department Distribution */}
        <Card className="shadow-lg border-0 bg-card">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Building className="h-5 w-5 text-orange-600" />
              <CardTitle className="text-lg font-semibold">Department Distribution</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {departmentData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={departmentData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px"
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" name="Employees" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No employee data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tables Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Expense Breakdown */}
        <Card className="shadow-lg border-0 bg-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileBarChart className="h-5 w-5 text-red-600" />
                <CardTitle className="text-lg font-semibold">Expense Breakdown</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground">Total: {formatCurrency(totalExpenses)}</p>
            </div>
          </CardHeader>
          <CardContent>
            {expenseBreakdown.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenseBreakdown.slice(0, 8).map((expense) => (
                    <TableRow key={expense.category}>
                      <TableCell className="font-medium">{expense.category}</TableCell>
                      <TableCell className="text-right">{formatCurrency(expense.amount)}</TableCell>
                      <TableCell className="text-right">{expense.percentage}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                No expenses in selected period
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <Card className="shadow-lg border-0 bg-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg font-semibold">Period Summary</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-xl font-bold">{formatCurrency(kpi.revenue)}</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">Total Expenses</p>
                <p className="text-xl font-bold">{formatCurrency(totalExpenses)}</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">Net Profit</p>
                <p className={`text-xl font-bold ${kpi.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(kpi.profit)}
                </p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">Total Trades</p>
                <p className="text-xl font-bold">{kpi.trades}</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">Monthly Salary</p>
                <p className="text-xl font-bold">{formatCurrency(totalSalary)}</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">Active Employees</p>
                <p className="text-xl font-bold">{kpi.employees}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
