import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  PieChart, 
  BarChart3, 
  Calendar,
  FileText,
  Download,
  Eye,
  ArrowUpIcon,
  ArrowDownIcon
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";

export default function ProfitLoss() {
  const [selectedPeriod, setSelectedPeriod] = useState("current_month");

  // Calculate date range based on selected period
  const getDateRange = () => {
    const now = new Date();
    switch (selectedPeriod) {
      case "current_month":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "last_month":
        const lastMonth = subDays(startOfMonth(now), 1);
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
      case "current_year":
        return { start: startOfYear(now), end: endOfYear(now) };
      case "last_year":
        const lastYear = new Date(now.getFullYear() - 1, 0, 1);
        return { start: startOfYear(lastYear), end: endOfYear(lastYear) };
      default:
        return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  };

  const { start: startDate, end: endDate } = getDateRange();

  // Fetch P&L data
  const { data: profitLossData, isLoading } = useQuery({
    queryKey: ['profit_loss_data', selectedPeriod],
    queryFn: async () => {
      // Get sales revenue
      const { data: salesData } = await supabase
        .from('sales_orders')
        .select('total_amount, order_date')
        .gte('order_date', format(startDate, 'yyyy-MM-dd'))
        .lte('order_date', format(endDate, 'yyyy-MM-dd'));

      // Get purchase costs
      const { data: purchaseData } = await supabase
        .from('purchase_orders')
        .select('total_amount, order_date')
        .gte('order_date', format(startDate, 'yyyy-MM-dd'))
        .lte('order_date', format(endDate, 'yyyy-MM-dd'));

      // Get employee costs
      const { data: payrollData } = await supabase
        .from('payslips')
        .select('net_salary, month_year')
        .like('month_year', `%${format(startDate, 'yyyy')}%`);

      const totalRevenue = salesData?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;
      const totalCOGS = purchaseData?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;
      const totalPayroll = payrollData?.reduce((sum, payslip) => sum + Number(payslip.net_salary), 0) || 0;
      
      const grossProfit = totalRevenue - totalCOGS;
      const operatingExpenses = totalPayroll + (totalRevenue * 0.15); // Estimate other expenses as 15% of revenue
      const netProfit = grossProfit - operatingExpenses;
      const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

      return {
        totalRevenue,
        totalCOGS,
        grossProfit,
        operatingExpenses,
        totalPayroll,
        netProfit,
        profitMargin,
        salesCount: salesData?.length || 0,
        purchaseCount: purchaseData?.length || 0
      };
    },
  });

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString()}`;
  };

  const getPeriodLabel = () => {
    switch (selectedPeriod) {
      case "current_month": return "Current Month";
      case "last_month": return "Last Month";
      case "current_year": return "Current Year";
      case "last_year": return "Last Year";
      default: return "Current Month";
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header */}
      <div className="relative overflow-hidden bg-indigo-600 text-white rounded-xl mb-6">
        <div className="relative px-6 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-indigo-700 rounded-xl shadow-lg">
                  <PieChart className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-white">
                    Profit & Loss Statement
                  </h1>
                  <p className="text-indigo-200 text-lg">
                    Monitor your company's financial performance
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
                  <SelectItem value="current_year">Current Year</SelectItem>
                  <SelectItem value="last_year">Last Year</SelectItem>
                </SelectContent>
              </Select>
              
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white border-2 border-indigo-400 text-indigo-600 hover:bg-indigo-50 shadow-md"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white border-2 border-indigo-400 text-indigo-600 hover:bg-indigo-50 shadow-md"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Detailed View
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="bg-emerald-600 text-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-emerald-100 text-sm font-medium">Total Revenue</p>
                <p className="text-2xl xl:text-3xl font-bold mt-2 truncate">
                  {formatCurrency(profitLossData?.totalRevenue || 0)}
                </p>
                <div className="flex items-center gap-1 mt-2">
                  <ArrowUpIcon className="h-4 w-4" />
                  <span className="text-sm font-medium">{getPeriodLabel()}</span>
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
                  {formatCurrency((profitLossData?.totalCOGS || 0) + (profitLossData?.operatingExpenses || 0))}
                </p>
                <div className="flex items-center gap-1 mt-2">
                  <ArrowDownIcon className="h-4 w-4" />
                  <span className="text-sm font-medium">{getPeriodLabel()}</span>
                </div>
              </div>
              <div className="bg-red-700 p-3 rounded-xl shadow-lg flex-shrink-0">
                <TrendingDown className="h-8 w-8" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-blue-600 text-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-blue-100 text-sm font-medium">Gross Profit</p>
                <p className="text-2xl xl:text-3xl font-bold mt-2 truncate">
                  {formatCurrency(profitLossData?.grossProfit || 0)}
                </p>
                <div className="flex items-center gap-1 mt-2">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-sm font-medium">{getPeriodLabel()}</span>
                </div>
              </div>
              <div className="bg-blue-700 p-3 rounded-xl shadow-lg flex-shrink-0">
                <BarChart3 className="h-8 w-8" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`${(profitLossData?.netProfit || 0) >= 0 ? 'bg-indigo-600' : 'bg-orange-600'} text-white border-0 shadow-xl hover:shadow-2xl transition-all duration-300`}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className={`${(profitLossData?.netProfit || 0) >= 0 ? 'text-indigo-100' : 'text-orange-100'} text-sm font-medium`}>Net Profit</p>
                <p className="text-2xl xl:text-3xl font-bold mt-2 truncate">
                  {formatCurrency(profitLossData?.netProfit || 0)}
                </p>
                <div className="flex items-center gap-1 mt-2">
                  {(profitLossData?.netProfit || 0) >= 0 ? 
                    <ArrowUpIcon className="h-4 w-4" /> : 
                    <ArrowDownIcon className="h-4 w-4" />
                  }
                  <span className="text-sm font-medium">{profitLossData?.profitMargin.toFixed(1)}% Margin</span>
                </div>
              </div>
              <div className={`${(profitLossData?.netProfit || 0) >= 0 ? 'bg-indigo-700' : 'bg-orange-700'} p-3 rounded-xl shadow-lg flex-shrink-0`}>
                <PieChart className="h-8 w-8" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed P&L Statement */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2">
          <Card className="bg-white border-2 border-gray-200 shadow-xl">
            <CardHeader className="bg-indigo-600 text-white rounded-t-lg">
              <CardTitle className="flex items-center gap-3 text-xl">
                <div className="p-2 bg-indigo-700 rounded-lg shadow-md">
                  <FileText className="h-6 w-6" />
                </div>
                Profit & Loss Statement - {getPeriodLabel()}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8">
              {isLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto"></div>
                  <p className="mt-2 text-gray-600">Loading financial data...</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Revenue Section */}
                  <div className="border-b pb-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Revenue</h3>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700">Sales Revenue</span>
                      <span className="font-semibold text-emerald-600">{formatCurrency(profitLossData?.totalRevenue || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-200">
                      <span className="font-semibold text-gray-900">Total Revenue</span>
                      <span className="font-bold text-emerald-600 text-lg">{formatCurrency(profitLossData?.totalRevenue || 0)}</span>
                    </div>
                  </div>

                  {/* Cost of Goods Sold */}
                  <div className="border-b pb-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Cost of Goods Sold</h3>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700">Purchase Costs</span>
                      <span className="font-semibold text-red-600">{formatCurrency(profitLossData?.totalCOGS || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-200">
                      <span className="font-semibold text-gray-900">Total COGS</span>
                      <span className="font-bold text-red-600 text-lg">{formatCurrency(profitLossData?.totalCOGS || 0)}</span>
                    </div>
                  </div>

                  {/* Gross Profit */}
                  <div className="border-b pb-4 bg-blue-50 p-4 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-gray-900 text-lg">Gross Profit</span>
                      <span className="font-bold text-blue-600 text-xl">{formatCurrency(profitLossData?.grossProfit || 0)}</span>
                    </div>
                  </div>

                  {/* Operating Expenses */}
                  <div className="border-b pb-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Operating Expenses</h3>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700">Employee Salaries</span>
                      <span className="font-semibold text-red-600">{formatCurrency(profitLossData?.totalPayroll || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-gray-700">Other Operating Expenses</span>
                      <span className="font-semibold text-red-600">{formatCurrency((profitLossData?.operatingExpenses || 0) - (profitLossData?.totalPayroll || 0))}</span>
                    </div>
                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-200">
                      <span className="font-semibold text-gray-900">Total Operating Expenses</span>
                      <span className="font-bold text-red-600 text-lg">{formatCurrency(profitLossData?.operatingExpenses || 0)}</span>
                    </div>
                  </div>

                  {/* Net Profit */}
                  <div className={`${(profitLossData?.netProfit || 0) >= 0 ? 'bg-indigo-50' : 'bg-orange-50'} p-4 rounded-lg`}>
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-gray-900 text-xl">Net Profit</span>
                      <span className={`font-bold text-2xl ${(profitLossData?.netProfit || 0) >= 0 ? 'text-indigo-600' : 'text-orange-600'}`}>
                        {formatCurrency(profitLossData?.netProfit || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-sm text-gray-600">Profit Margin</span>
                      <span className={`text-sm font-semibold ${(profitLossData?.netProfit || 0) >= 0 ? 'text-indigo-600' : 'text-orange-600'}`}>
                        {profitLossData?.profitMargin.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Summary & Quick Stats */}
        <div className="space-y-6">
          <Card className="bg-white border-2 border-gray-200 shadow-xl">
            <CardHeader className="bg-indigo-600 text-white rounded-t-lg">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Calendar className="h-5 w-5" />
                Period Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Period</span>
                  <Badge className="bg-indigo-100 text-indigo-800">{getPeriodLabel()}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Sales Orders</span>
                  <span className="font-semibold">{profitLossData?.salesCount || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Purchase Orders</span>
                  <span className="font-semibold">{profitLossData?.purchaseCount || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Profit Margin</span>
                  <Badge className={`${(profitLossData?.profitMargin || 0) >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                    {profitLossData?.profitMargin.toFixed(1)}%
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-2 border-gray-200 shadow-xl">
            <CardHeader className="bg-indigo-600 text-white rounded-t-lg">
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-3">
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700">
                <FileText className="h-4 w-4 mr-2" />
                Generate Full Report
              </Button>
              <Button variant="outline" className="w-full border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                <BarChart3 className="h-4 w-4 mr-2" />
                View Charts
              </Button>
              <Button variant="outline" className="w-full border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                <Download className="h-4 w-4 mr-2" />
                Export to Excel
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}