import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  FileText,
  Download,
  Calculator
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";

interface ProfitLossData {
  totalRevenue: number;
  totalExpense: number;
  totalIncome: number;
  grossProfit: number;
  netProfit: number;
  profitMargin: number;
  salesCount: number;
  npmTotal: number;
  totalCOGS?: number;
  totalOtherExpenses?: number;
}

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

  // Calculate NPM using FIFO logic
  const calculateNPMWithFIFO = (salesData: any[], purchaseData: any[]) => {
    // Group purchases by product and sort by date (FIFO)
    const purchasesByProduct = new Map();
    
    purchaseData.forEach(purchase => {
      if (!purchasesByProduct.has(purchase.product_id)) {
        purchasesByProduct.set(purchase.product_id, []);
      }
      purchasesByProduct.get(purchase.product_id).push({
        quantity: purchase.quantity,
        unit_price: purchase.unit_price,
        date: purchase.created_at,
        remaining: purchase.quantity
      });
    });

    // Sort purchases by date for FIFO
    purchasesByProduct.forEach((purchases, productId) => {
      purchases.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    });

    let totalNPM = 0;

    // Calculate NPM for each sale using FIFO
    salesData.forEach(sale => {
      const productPurchases = purchasesByProduct.get(sale.product_id) || [];
      let saleQuantity = sale.quantity;
      let totalCost = 0;

      // Use FIFO to calculate cost basis
      for (let purchase of productPurchases) {
        if (saleQuantity <= 0) break;
        
        const quantityToUse = Math.min(saleQuantity, purchase.remaining);
        totalCost += quantityToUse * purchase.unit_price;
        purchase.remaining -= quantityToUse;
        saleQuantity -= quantityToUse;
      }

      const saleRevenue = sale.quantity * sale.unit_price;
      const npm = saleRevenue - totalCost;
      totalNPM += npm;
    });

    return totalNPM;
  };

  // Fetch P&L data with proper NPM calculation using FIFO
  const { data: profitLossData, isLoading } = useQuery({
    queryKey: ['profit_loss_npm', selectedPeriod],
    queryFn: async () => {
      // Get sales orders data
      const { data: salesOrders } = await supabase
        .from('sales_orders')
        .select('id, total_amount, order_date')
        .gte('order_date', format(startDate, 'yyyy-MM-dd'))
        .lte('order_date', format(endDate, 'yyyy-MM-dd'));

      // Get sales order items separately
      const { data: salesItems } = await supabase
        .from('sales_order_items')
        .select('sales_order_id, product_id, quantity, unit_price');

      // Get all purchase order items for FIFO calculation (ordered by creation)
      const { data: purchaseItems } = await supabase
        .from('purchase_order_items')
        .select('product_id, quantity, unit_price, purchase_order_id')
        .order('id', { ascending: true });

      // Get purchase orders to link with items
      const { data: purchaseOrders } = await supabase
        .from('purchase_orders')
        .select('id, order_date')
        .order('order_date', { ascending: true });

      // Get other expenses from bank transactions (excluding purchase category)
      const { data: expenseData } = await supabase
        .from('bank_transactions')
        .select('amount')
        .eq('transaction_type', 'EXPENSE')
        .neq('category', 'Purchase')  // Exclude purchase transactions
        .gte('transaction_date', format(startDate, 'yyyy-MM-dd'))
        .lte('transaction_date', format(endDate, 'yyyy-MM-dd'));

      // Get income from bank transactions
      const { data: incomeData } = await supabase
        .from('bank_transactions')
        .select('amount')
        .eq('transaction_type', 'INCOME')
        .gte('transaction_date', format(startDate, 'yyyy-MM-dd'))
        .lte('transaction_date', format(endDate, 'yyyy-MM-dd'));

      // Create purchase items with dates for proper FIFO
      const purchaseItemsWithDates = purchaseItems?.map(item => {
        const order = purchaseOrders?.find(po => po.id === item.purchase_order_id);
        return {
          ...item,
          date: order?.order_date || '1970-01-01',
          remaining: item.quantity
        };
      }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) || [];

      // Calculate COGS and NPM using FIFO logic for actual sales
      let totalCOGS = 0;
      let totalQuantitySold = 0;
      const purchasesByProduct = new Map();

      // Group purchases by product
      purchaseItemsWithDates.forEach(purchase => {
        if (!purchasesByProduct.has(purchase.product_id)) {
          purchasesByProduct.set(purchase.product_id, []);
        }
        purchasesByProduct.get(purchase.product_id).push(purchase);
      });

      // Filter sales items for period sales orders
      const periodSalesOrderIds = salesOrders?.map(order => order.id) || [];
      const periodSalesItems = salesItems?.filter(item => 
        periodSalesOrderIds.includes(item.sales_order_id)
      ) || [];

      // Calculate COGS for each sale using FIFO
      periodSalesItems.forEach(item => {
        const productPurchases = purchasesByProduct.get(item.product_id) || [];
        let remainingQty = item.quantity;
        let itemCOGS = 0;

        // Use FIFO to calculate cost basis for this sale
        for (let purchase of productPurchases) {
          if (remainingQty <= 0) break;
          
          const qtyToUse = Math.min(remainingQty, purchase.remaining);
          itemCOGS += qtyToUse * purchase.unit_price;
          purchase.remaining -= qtyToUse;
          remainingQty -= qtyToUse;
        }

        totalCOGS += itemCOGS;
        totalQuantitySold += item.quantity;
      });

      // Calculate metrics
      const totalRevenue = salesOrders?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;
      const totalOtherExpenses = expenseData?.reduce((sum, transaction) => sum + Number(transaction.amount), 0) || 0;
      const totalIncome = incomeData?.reduce((sum, transaction) => sum + Number(transaction.amount), 0) || 0;
      
      // NPM = Revenue - COGS (using FIFO)
      const grossProfit = totalRevenue - totalCOGS;
      
      // Net profit = Gross Profit - Other Expenses + Other Income  
      const netProfit = grossProfit - totalOtherExpenses + totalIncome;
      const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

      return {
        totalRevenue,
        totalExpense: totalOtherExpenses, // Only actual expenses, not COGS
        totalIncome,
        grossProfit,
        netProfit,
        profitMargin,
        salesCount: salesOrders?.length || 0,
        npmTotal: grossProfit, // NPM is the gross profit using FIFO
        totalCOGS,
        totalOtherExpenses
      } as ProfitLossData;
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
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="px-6 py-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <Calculator className="h-6 w-6 text-gray-700" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    Profit & Loss Statement
                  </h1>
                  <p className="text-gray-600">
                    NPM-based financial performance analysis
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current_month">Current Month</SelectItem>
                  <SelectItem value="last_month">Last Month</SelectItem>
                  <SelectItem value="current_year">Current Year</SelectItem>
                  <SelectItem value="last_year">Last Year</SelectItem>
                </SelectContent>
              </Select>
              
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export PDF
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="bg-white border border-gray-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {formatCurrency(profitLossData?.totalRevenue || 0)}
                </p>
                <p className="text-sm text-gray-500 mt-1">{getPeriodLabel()}</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-full">
                <DollarSign className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border border-gray-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Expenses</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {formatCurrency(profitLossData?.totalExpense || 0)}
                </p>
                <p className="text-sm text-gray-500 mt-1">From expense entries</p>
              </div>
              <div className="p-3 bg-red-50 rounded-full">
                <TrendingDown className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border border-gray-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Gross Profit (NPM)</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {formatCurrency(profitLossData?.grossProfit || 0)}
                </p>
                <p className="text-sm text-gray-500 mt-1">From operations only</p>
              </div>
              <div className="p-3 bg-green-50 rounded-full">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border border-gray-200 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Net Profit</p>
                <p className={`text-2xl font-bold mt-1 ${(profitLossData?.netProfit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(profitLossData?.netProfit || 0)}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {profitLossData?.profitMargin?.toFixed(1)}% margin
                </p>
              </div>
              <div className={`p-3 rounded-full ${(profitLossData?.netProfit || 0) >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                <Calculator className={`h-5 w-5 ${(profitLossData?.netProfit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed P&L Statement */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2">
          <Card className="bg-white border border-gray-200 shadow-sm">
            <CardHeader className="border-b border-gray-200">
              <CardTitle className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-gray-700" />
                Profit & Loss Statement - {getPeriodLabel()}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {isLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300 mx-auto"></div>
                  <p className="mt-2 text-gray-600">Loading financial data...</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Revenue Section */}
                  <div className="border-b border-gray-200 pb-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Revenue</h3>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700">Total Sales Revenue</span>
                      <span className="font-semibold text-gray-900">{formatCurrency(profitLossData?.totalRevenue || 0)}</span>
                    </div>
                  </div>

                  {/* Cost of Goods Sold Section */}
                  <div className="border-b border-gray-200 pb-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Cost of Goods Sold</h3>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700">Purchase Orders (COGS)</span>
                      <span className="font-semibold text-red-600">-{formatCurrency(profitLossData?.totalCOGS || 0)}</span>
                    </div>
                  </div>

                  {/* NPM/Gross Profit Section */}
                  <div className="border-b border-gray-200 pb-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Gross Profit (NPM)</h3>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700">Revenue - COGS</span>
                      <span className="font-semibold text-green-600">{formatCurrency(profitLossData?.grossProfit || 0)}</span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {profitLossData?.npmTotal !== 0 ? 'Calculated using FIFO logic' : 'Simple Revenue - COGS calculation'}
                    </p>
                  </div>

                  {/* Other Income & Expenses */}
                  <div className="border-b border-gray-200 pb-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Other Income & Expenses</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-700">Other Income</span>
                        <span className="font-semibold text-green-600">+{formatCurrency(profitLossData?.totalIncome || 0)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-700">Other Expenses</span>
                        <span className="font-semibold text-red-600">-{formatCurrency(profitLossData?.totalOtherExpenses || 0)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Net Profit */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-gray-900 text-lg">Net Profit</span>
                      <span className={`font-bold text-xl ${(profitLossData?.netProfit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(profitLossData?.netProfit || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-sm text-gray-600">Calculation: Gross Profit - Expenses + Income</span>
                      <span className="text-sm font-medium text-gray-700">
                        Margin: {profitLossData?.profitMargin?.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Summary Panel */}
        <div>
          <Card className="bg-white border border-gray-200 shadow-sm">
            <CardHeader className="border-b border-gray-200">
              <CardTitle className="text-lg">Period Summary</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Period</span>
                  <span className="font-medium text-gray-900">{getPeriodLabel()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Sales Orders</span>
                  <span className="font-medium text-gray-900">{profitLossData?.salesCount || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Calculation Method</span>
                  <span className="font-medium text-gray-900">FIFO (NPM)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Profit Margin</span>
                  <span className={`font-medium ${(profitLossData?.profitMargin || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {profitLossData?.profitMargin?.toFixed(1)}%
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <div className="mt-6">
            <Card className="bg-white border border-gray-200 shadow-sm">
              <CardHeader className="border-b border-gray-200">
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-3">
                <Button className="w-full">
                  <FileText className="h-4 w-4 mr-2" />
                  Generate Report
                </Button>
                <Button variant="outline" className="w-full">
                  <Download className="h-4 w-4 mr-2" />
                  Export to Excel
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
