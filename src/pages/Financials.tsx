import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Target
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";

export default function Financials() {
  const [selectedPeriod, setSelectedPeriod] = useState("current_month");

  // Calculate date range
  const getDateRange = () => {
    const now = new Date();
    switch (selectedPeriod) {
      case "current_month":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "last_month":
        const lastMonth = subDays(startOfMonth(now), 1);
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
      default:
        return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  };

  const { start: startDate, end: endDate } = getDateRange();

  // Fetch financial data
  const { data: financialData, isLoading } = useQuery({
    queryKey: ['financial_data', selectedPeriod],
    queryFn: async () => {
      // Get revenue data
      const { data: salesData } = await supabase
        .from('sales_orders')
        .select('total_amount, order_date, created_at')
        .gte('order_date', format(startDate, 'yyyy-MM-dd'))
        .lte('order_date', format(endDate, 'yyyy-MM-dd'))
        .order('order_date', { ascending: true });

      // Get expense data
      const { data: purchaseData } = await supabase
        .from('purchase_orders')
        .select('total_amount, order_date, created_at')
        .gte('order_date', format(startDate, 'yyyy-MM-dd'))
        .lte('order_date', format(endDate, 'yyyy-MM-dd'))
        .order('order_date', { ascending: true });

      // Get bank balances
      const { data: bankData } = await supabase
        .from('bank_accounts')
        .select('account_name, balance, bank_name')
        .eq('status', 'ACTIVE');

      // Get recent transactions
      const { data: transactionsData } = await supabase
        .from('bank_transactions')
        .select('amount, transaction_type, description, transaction_date, bank_account_id')
        .gte('transaction_date', format(startDate, 'yyyy-MM-dd'))
        .lte('transaction_date', format(endDate, 'yyyy-MM-dd'))
        .order('transaction_date', { ascending: false })
        .limit(10);

      const totalRevenue = salesData?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;
      const totalExpenses = purchaseData?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;
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
    return `₹${Math.abs(amount).toLocaleString()}`;
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 text-white rounded-xl mb-6">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="relative px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-emerald-700 rounded-xl shadow-lg">
                  <Calculator className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-white">
                    Financial Management
                  </h1>
                  <p className="text-emerald-200 text-lg">
                    Comprehensive financial overview and management
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-48 bg-white text-gray-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current_month">Current Month</SelectItem>
                  <SelectItem value="last_month">Last Month</SelectItem>
                </SelectContent>
              </Select>
              
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white border-2 border-emerald-400 text-emerald-600 hover:bg-emerald-50 shadow-md"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white border-2 border-emerald-400 text-emerald-600 hover:bg-emerald-50 shadow-md"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Transaction
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Key Financial Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="bg-emerald-600 text-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-emerald-100 text-sm font-medium">Total Revenue</p>
                <p className="text-2xl xl:text-3xl font-bold mt-2 truncate">
                  {formatCurrency(financialData?.totalRevenue || 0)}
                </p>
                <div className="flex items-center gap-1 mt-2">
                  <ArrowUpIcon className="h-4 w-4" />
                  <span className="text-sm font-medium">This Period</span>
                </div>
              </div>
              <div className="bg-emerald-700 p-3 rounded-xl shadow-lg flex-shrink-0">
                <DollarSign className="h-8 w-8" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-red-600 text-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-red-100 text-sm font-medium">Total Expenses</p>
                <p className="text-2xl xl:text-3xl font-bold mt-2 truncate">
                  {formatCurrency(financialData?.totalExpenses || 0)}
                </p>
                <div className="flex items-center gap-1 mt-2">
                  <ArrowDownIcon className="h-4 w-4" />
                  <span className="text-sm font-medium">This Period</span>
                </div>
              </div>
              <div className="bg-red-700 p-3 rounded-xl shadow-lg flex-shrink-0">
                <TrendingDown className="h-8 w-8" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-indigo-600 text-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-indigo-100 text-sm font-medium">Net Cash Flow</p>
                <p className="text-2xl xl:text-3xl font-bold mt-2 truncate">
                  {financialData?.netCashFlow && financialData.netCashFlow >= 0 ? '+' : '-'}
                  {formatCurrency(financialData?.netCashFlow || 0)}
                </p>
                <div className="flex items-center gap-1 mt-2">
                  {(financialData?.netCashFlow || 0) >= 0 ? 
                    <ArrowUpIcon className="h-4 w-4" /> : 
                    <ArrowDownIcon className="h-4 w-4" />
                  }
                  <span className="text-sm font-medium">This Period</span>
                </div>
              </div>
              <div className="bg-indigo-700 p-3 rounded-xl shadow-lg flex-shrink-0">
                <TrendingUp className="h-8 w-8" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-purple-600 text-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-purple-100 text-sm font-medium">Bank Balance</p>
                <p className="text-2xl xl:text-3xl font-bold mt-2 truncate">
                  {formatCurrency(financialData?.totalBankBalance || 0)}
                </p>
                <div className="flex items-center gap-1 mt-2">
                  <Wallet className="h-4 w-4" />
                  <span className="text-sm font-medium">Total Available</span>
                </div>
              </div>
              <div className="bg-purple-700 p-3 rounded-xl shadow-lg flex-shrink-0">
                <Wallet className="h-8 w-8" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Financial Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="accounts">Bank Accounts</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Cash Flow Chart */}
            <Card className="bg-white border-2 border-gray-200 shadow-xl">
              <CardHeader className="bg-emerald-600 text-white rounded-t-lg">
                <CardTitle className="flex items-center gap-3 text-xl">
                  <div className="p-2 bg-emerald-700 rounded-lg shadow-md">
                    <BarChart3 className="h-6 w-6" />
                  </div>
                  Cash Flow Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={[
                      { name: 'Revenue', value: financialData?.totalRevenue || 0, fill: '#059669' },
                      { name: 'Expenses', value: financialData?.totalExpenses || 0, fill: '#dc2626' }
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis tickFormatter={(value) => `₹${(value / 1000)}K`} />
                      <Tooltip formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Amount']} />
                      <Area type="monotone" dataKey="value" stroke="#059669" fill="#059669" fillOpacity={0.6} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card className="bg-white border-2 border-gray-200 shadow-xl">
              <CardHeader className="bg-emerald-600 text-white rounded-t-lg">
                <CardTitle className="flex items-center gap-3 text-xl">
                  <div className="p-2 bg-emerald-700 rounded-lg shadow-md">
                    <Target className="h-6 w-6" />
                  </div>
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700">
                  <Plus className="h-4 w-4 mr-2" />
                  Record Income
                </Button>
                <Button variant="outline" className="w-full border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Record Expense
                </Button>
                <Button variant="outline" className="w-full border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                  <FileText className="h-4 w-4 mr-2" />
                  Generate Report
                </Button>
                <Button variant="outline" className="w-full border-emerald-200 text-emerald-700 hover:bg-emerald-50">
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
              <Card key={index} className="bg-white border-2 border-gray-200 shadow-xl hover:shadow-2xl transition-all duration-300">
                <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-lg">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Building className="h-5 w-5" />
                    {account.account_name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Bank</span>
                      <span className="font-semibold">{account.bank_name}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Balance</span>
                      <span className="text-xl font-bold text-emerald-600">
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
              <div className="col-span-full text-center py-12 text-gray-500">
                <Building className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="font-medium">No bank accounts found</p>
                <p className="text-sm">Add bank accounts to track balances</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="transactions" className="space-y-6">
          <Card className="bg-white border-2 border-gray-200 shadow-xl">
            <CardHeader className="bg-emerald-600 text-white rounded-t-lg">
              <CardTitle className="flex items-center gap-3 text-xl">
                <div className="p-2 bg-emerald-700 rounded-lg shadow-md">
                  <CreditCard className="h-6 w-6" />
                </div>
                Recent Transactions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                {financialData?.recentTransactions.map((transaction, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        transaction.transaction_type === 'INCOME' ? 'bg-emerald-100' : 'bg-red-100'
                      }`}>
                        {transaction.transaction_type === 'INCOME' ? (
                          <ArrowUpIcon className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <ArrowDownIcon className="h-4 w-4 text-red-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-gray-900">
                          {transaction.description || 'Transaction'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {format(new Date(transaction.transaction_date), "MMM dd, yyyy")}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold text-sm ${
                        transaction.transaction_type === 'INCOME' ? 'text-emerald-600' : 'text-red-600'
                      }`}>
                        {transaction.transaction_type === 'INCOME' ? '+' : '-'}
                        {formatCurrency(Number(transaction.amount))}
                      </p>
                    </div>
                  </div>
                )) || (
                  <div className="text-center py-12 text-gray-500">
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
            <Card className="bg-white border-2 border-gray-200 shadow-xl hover:shadow-2xl transition-all duration-300 cursor-pointer">
              <CardContent className="p-6 text-center">
                <div className="w-16 h-16 bg-emerald-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <FileText className="h-8 w-8 text-emerald-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">Profit & Loss</h3>
                <p className="text-sm text-gray-600 mb-4">Comprehensive P&L statement</p>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                  Generate Report
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-white border-2 border-gray-200 shadow-xl hover:shadow-2xl transition-all duration-300 cursor-pointer">
              <CardContent className="p-6 text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <BarChart3 className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">Cash Flow</h3>
                <p className="text-sm text-gray-600 mb-4">Detailed cash flow analysis</p>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                  Generate Report
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-white border-2 border-gray-200 shadow-xl hover:shadow-2xl transition-all duration-300 cursor-pointer">
              <CardContent className="p-6 text-center">
                <div className="w-16 h-16 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <PieChart className="h-8 w-8 text-purple-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">Balance Sheet</h3>
                <p className="text-sm text-gray-600 mb-4">Assets, liabilities & equity</p>
                <Button size="sm" className="bg-purple-600 hover:bg-purple-700">
                  Generate Report
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}