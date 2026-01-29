import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  CalendarIcon, 
  Download, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  PieChart, 
  BarChart3, 
  Info,
  FileText,
  Calculator,
  Target,
  Activity
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { DateRangePicker, DateRangePreset, getDateRangeFromPreset } from '@/components/ui/date-range-picker';

interface ProfitLossData {
  totalRevenue: number;
  totalCOGS: number;
  totalOtherExpenses: number;
  totalIncome: number;
  grossProfit: number;
  netProfit: number;
  profitMargin: number;
}

interface FIFOMatch {
  saleId: string;
  buyId: string;
  saleDate: string;
  buyDate: string;
  quantity: number;
  buyRate: number;
  sellRate: number;
  npm: number;
  profit: number;
  asset: string;
}

interface TradeEntry {
  id: string;
  date: string;
  asset: string;
  type: 'Buy' | 'Sell';
  quantity: number;
  rate: number;
  total: number;
  npm?: number;
  profit?: number;
  matchedOrderRef?: string;
}

interface ExpenseIncomeEntry {
  id: string;
  date: string;
  category: string;
  type: 'Expense' | 'Income';
  amount: number;
  description: string;
}

export default function ProfitLoss() {
  const [datePreset, setDatePreset] = useState<DateRangePreset>('thisMonth');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(getDateRangeFromPreset('thisMonth'));
  const [selectedAsset, setSelectedAsset] = useState<string>('all');
  const [selectedCurrency, setSelectedCurrency] = useState<string>('INR');

  const getDateRange = () => {
    if (dateRange?.from && dateRange?.to) {
      return { startDate: dateRange.from, endDate: dateRange.to };
    }
    // Fallback to current month
    const now = new Date();
    return { startDate: startOfMonth(now), endDate: endOfMonth(now) };
  };

  const calculateFIFOMatches = (salesItems: any[], purchaseItems: any[]) => {
    const fifoMatches: FIFOMatch[] = [];
    let totalGrossProfit = 0;
    let totalQuantitySold = 0;

    // Group purchases by company (bank_account_holder_name)
    const purchasesByCompany = new Map<string, any[]>();
    purchaseItems.forEach(item => {
      const company = item.bank_account_holder_name || 'UNKNOWN';
      if (!purchasesByCompany.has(company)) {
        purchasesByCompany.set(company, []);
      }
      purchasesByCompany.get(company)!.push({
        ...item,
        remaining_quantity: item.quantity
      });
    });

    // Sort purchases by date within each company
    purchasesByCompany.forEach((purchases, company) => {
      purchases.sort((a, b) => 
        new Date(a.order_date).getTime() - new Date(b.order_date).getTime()
      );
    });

    // Group sales by company
    const salesByCompany = new Map<string, any[]>();
    salesItems.forEach(item => {
      const company = item.bank_account_holder_name || 'UNKNOWN';
      if (!salesByCompany.has(company)) {
        salesByCompany.set(company, []);
      }
      salesByCompany.get(company)!.push(item);
    });

    // Process FIFO for each company independently
    salesByCompany.forEach((sales, company) => {
      const purchaseQueue = purchasesByCompany.get(company) || [];
      
      sales.forEach(saleItem => {
        let remainingQtyToSell = saleItem.quantity;
        
        while (remainingQtyToSell > 0 && purchaseQueue.length > 0) {
          const earliestPurchase = purchaseQueue[0];
          
          if (earliestPurchase.remaining_quantity <= 0) {
            purchaseQueue.shift();
            continue;
          }

          const qtyToUse = Math.min(remainingQtyToSell, earliestPurchase.remaining_quantity);
          const npm = saleItem.unit_price - earliestPurchase.unit_price;
          const profit = npm * qtyToUse;
          
          fifoMatches.push({
            saleId: saleItem.sales_order_id,
            buyId: earliestPurchase.purchase_order_id,
            saleDate: saleItem.sales_order_date || new Date().toISOString(),
            buyDate: earliestPurchase.order_date,
            quantity: qtyToUse,
            buyRate: earliestPurchase.unit_price,
            sellRate: saleItem.unit_price,
            npm: npm,
            profit: profit,
            asset: 'USDT'
          });

          totalGrossProfit += profit;
          totalQuantitySold += qtyToUse;
          
          remainingQtyToSell -= qtyToUse;
          earliestPurchase.remaining_quantity -= qtyToUse;
          
          if (earliestPurchase.remaining_quantity <= 0) {
            purchaseQueue.shift();
          }
        }
      });
    });

    return { fifoMatches, totalGrossProfit, totalQuantitySold };
  };

  // Fetch comprehensive P&L data
  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['vaspcorp_pl_dashboard', dateRange?.from?.toISOString(), dateRange?.to?.toISOString(), selectedAsset],
    queryFn: async () => {
      const { startDate, endDate } = getDateRange();
      const startStr = format(startDate, 'yyyy-MM-dd');
      const endStr = format(endDate, 'yyyy-MM-dd');

      // Fetch sales orders with bank account info through payment method
      const { data: salesOrders } = await supabase
        .from('sales_orders')
        .select(`
          id, 
          total_amount, 
          order_date,
          sales_payment_method_id,
          sales_payment_methods:sales_payment_method_id(
            bank_account_id,
            bank_accounts:bank_account_id(bank_account_holder_name)
          )
        `)
        .gte('order_date', startStr)
        .lte('order_date', endStr);

      // Fetch sales order items
      const { data: salesItems } = await supabase
        .from('sales_order_items')
        .select('sales_order_id, product_id, quantity, unit_price');

      // Fetch purchase order items with order data and bank account info
      const { data: purchaseItems } = await supabase
        .from('purchase_order_items')
        .select(`
          product_id, 
          quantity, 
          unit_price, 
          purchase_order_id,
          purchase_orders!inner(
            id, 
            order_date, 
            supplier_name,
            bank_account_id,
            bank_accounts:bank_account_id(bank_account_holder_name)
          )
        `)
        .order('id', { ascending: true });

      // Fetch expenses (excluding Purchase category)
      const { data: expenseData } = await supabase
        .from('bank_transactions')
        .select('id, amount, category, description, transaction_date')
        .eq('transaction_type', 'EXPENSE')
        .neq('category', 'Purchase')
        .gte('transaction_date', startStr)
        .lte('transaction_date', endStr);

      // Fetch income
      const { data: incomeData } = await supabase
        .from('bank_transactions')
        .select('id, amount, category, description, transaction_date')
        .eq('transaction_type', 'INCOME')
        .gte('transaction_date', startStr)
        .lte('transaction_date', endStr);

      // Process data
      const periodSalesOrderIds = salesOrders?.map(order => order.id) || [];
      
      // Map sales order to bank account holder name
      const salesOrderToCompany = new Map<string, string>();
      salesOrders?.forEach(order => {
        const holderName = order.sales_payment_methods?.bank_accounts?.bank_account_holder_name || 'UNKNOWN';
        salesOrderToCompany.set(order.id, holderName);
      });
      
      const periodSalesItems = salesItems?.filter(item => 
        periodSalesOrderIds.includes(item.sales_order_id)
      ).map(item => ({
        ...item,
        bank_account_holder_name: salesOrderToCompany.get(item.sales_order_id) || 'UNKNOWN',
        sales_order_date: salesOrders?.find(o => o.id === item.sales_order_id)?.order_date
      })) || [];

      // Prepare purchase items with dates and company info
      const purchaseItemsWithDates = purchaseItems?.map(item => ({
        ...item,
        order_date: item.purchase_orders.order_date,
        supplier_name: item.purchase_orders.supplier_name,
        bank_account_holder_name: item.purchase_orders.bank_accounts?.bank_account_holder_name || 'UNKNOWN'
      })) || [];

      // Calculate FIFO matches and get total quantities
      const { fifoMatches, totalGrossProfit, totalQuantitySold } = calculateFIFOMatches(
        periodSalesItems, 
        purchaseItemsWithDates
      );

      // Calculate average selling and buying prices
      const totalSoldValue = periodSalesItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
      const avgSellingPrice = totalQuantitySold > 0 ? totalSoldValue / totalQuantitySold : 0;
      
      const totalBoughtValue = purchaseItemsWithDates.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
      const totalQuantityBought = purchaseItemsWithDates.reduce((sum, item) => sum + item.quantity, 0);
      const avgBuyingPrice = totalQuantityBought > 0 ? totalBoughtValue / totalQuantityBought : 0;
      
      // Correct Gross Profit = Total Qty sold * (Avg Selling price - Avg Buying price)
      const correctedGrossProfit = totalQuantitySold * (avgSellingPrice - avgBuyingPrice);

      // Create trade entries for table
      const tradeEntries: TradeEntry[] = [];
      
      // Add buy orders
      purchaseItemsWithDates.forEach(item => {
        tradeEntries.push({
          id: item.purchase_order_id,
          date: item.order_date,
          asset: 'USDT',
          type: 'Buy',
          quantity: item.quantity,
          rate: item.unit_price,
          total: item.quantity * item.unit_price
        });
      });

      // Add sell orders with NPM data
      periodSalesItems.forEach(item => {
        const salesOrder = salesOrders?.find(order => order.id === item.sales_order_id);
        const relatedMatches = fifoMatches.filter(match => match.saleId === item.sales_order_id);
        const totalNPM = relatedMatches.reduce((sum, match) => sum + match.npm, 0) / relatedMatches.length || 0;
        const totalProfit = relatedMatches.reduce((sum, match) => sum + match.profit, 0);

        tradeEntries.push({
          id: item.sales_order_id,
          date: salesOrder?.order_date || '',
          asset: 'USDT',
          type: 'Sell',
          quantity: item.quantity,
          rate: item.unit_price,
          total: item.quantity * item.unit_price,
          npm: totalNPM,
          profit: totalProfit,
          matchedOrderRef: relatedMatches.map(m => m.buyId.slice(-8)).join(', ')
        });
      });

      // Create expense/income entries
      const expenseIncomeEntries: ExpenseIncomeEntry[] = [
        ...(expenseData?.map(item => ({
          id: item.id,
          date: item.transaction_date,
          category: item.category || 'General',
          type: 'Expense' as const,
          amount: item.amount,
          description: item.description || ''
        })) || []),
        ...(incomeData?.map(item => ({
          id: item.id,
          date: item.transaction_date,
          category: item.category || 'General',
          type: 'Income' as const,
          amount: item.amount,
          description: item.description || ''
        })) || [])
      ];

      // Calculate totals
      const totalRevenue = salesOrders?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;
      const totalOtherExpenses = expenseData?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;
      const totalIncome = incomeData?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;
      const grossProfit = correctedGrossProfit; // Use corrected calculation
      const netProfit = grossProfit - totalOtherExpenses + totalIncome; // Net Profit = Gross Profit - All Expenses + All Incomes
      const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

      return {
        profitLossData: {
          totalRevenue,
          totalCOGS: totalRevenue - totalGrossProfit, // Calculated from FIFO
          totalOtherExpenses,
          totalIncome,
          grossProfit,
          netProfit,
          profitMargin
        } as ProfitLossData,
        fifoMatches,
        tradeEntries: tradeEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        expenseIncomeEntries: expenseIncomeEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      };
    },
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(amount);
  };

  const getPeriodLabel = () => {
    if (dateRange?.from && dateRange?.to) {
      if (format(dateRange.from, 'yyyy-MM-dd') === format(dateRange.to, 'yyyy-MM-dd')) {
        return format(dateRange.from, 'MMM dd, yyyy');
      }
      return `${format(dateRange.from, 'MMM dd')} - ${format(dateRange.to, 'MMM dd, yyyy')}`;
    }
    return 'All Time';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading VASPCorp P&L Dashboard...</p>
        </div>
      </div>
    );
  }

  const { profitLossData, fifoMatches, tradeEntries, expenseIncomeEntries } = dashboardData || {
    profitLossData: {} as ProfitLossData,
    fifoMatches: [],
    tradeEntries: [],
    expenseIncomeEntries: []
  };

  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      {/* Header Section */}
      <Card>
        <CardHeader>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <BarChart3 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-2xl">VASPCorp Profit & Loss Dashboard</CardTitle>
                  <CardDescription>
                    Analytics-driven P2P trading performance using FIFO methodology
                  </CardDescription>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <DateRangePicker
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
                preset={datePreset}
                onPresetChange={setDatePreset}
                className="w-52"
              />

              <Select value={selectedAsset} onValueChange={setSelectedAsset}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Assets</SelectItem>
                  <SelectItem value="USDT">USDT</SelectItem>
                  <SelectItem value="BTC">BTC</SelectItem>
                  <SelectItem value="ETH">ETH</SelectItem>
                </SelectContent>
              </Select>
              
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Top Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold">{formatCurrency(profitLossData?.totalRevenue || 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">Sales volume</p>
              </div>
              <DollarSign className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Expenses</p>
                <p className="text-2xl font-bold">{formatCurrency(profitLossData?.totalOtherExpenses || 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">Operational costs</p>
              </div>
              <TrendingDown className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Income</p>
                <p className="text-2xl font-bold">{formatCurrency(profitLossData?.totalIncome || 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">Other income</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Gross Profit</p>
                <p className={`text-2xl font-bold ${(profitLossData?.grossProfit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(profitLossData?.grossProfit || 0)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">From operations</p>
              </div>
              <Target className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Net Profit</p>
                <p className={`text-2xl font-bold ${(profitLossData?.netProfit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(profitLossData?.netProfit || 0)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {profitLossData?.profitMargin?.toFixed(1)}% margin
                </p>
              </div>
              <Calculator className={`h-8 w-8 ${(profitLossData?.netProfit || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trade-wise FIFO Profit Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Trade-wise FIFO Profit Analysis
          </CardTitle>
          <CardDescription>
            Every sale matched with earliest buy orders using First-In-First-Out logic
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Rate (₹)</TableHead>
                  <TableHead className="text-right">Total (₹)</TableHead>
                  <TableHead className="text-right">NPM (₹)</TableHead>
                  <TableHead className="text-right">Profit (₹)</TableHead>
                  <TableHead>Matched Order</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tradeEntries?.slice(0, 10).map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{format(new Date(entry.date), 'dd MMM yyyy')}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{entry.asset}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={entry.type === 'Buy' ? 'secondary' : 'default'}>
                        {entry.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{entry.quantity.toFixed(4)}</TableCell>
                    <TableCell className="text-right">{entry.rate.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(entry.total)}</TableCell>
                    <TableCell className="text-right">
                      {entry.npm ? (
                        <span className={entry.npm >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {entry.npm.toFixed(2)}
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {entry.profit ? (
                        <span className={entry.profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {formatCurrency(entry.profit)}
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {entry.matchedOrderRef || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Buy Order Matching Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="h-5 w-5" />
            FIFO Order Matching Details
          </CardTitle>
          <CardDescription>
            Transparency view showing how each sale maps to specific buy orders
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Buy Date</TableHead>
                  <TableHead>Sale Date</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead className="text-right">Quantity Used</TableHead>
                  <TableHead className="text-right">Buy Rate (₹)</TableHead>
                  <TableHead className="text-right">Sell Rate (₹)</TableHead>
                  <TableHead className="text-right">NPM (₹)</TableHead>
                  <TableHead className="text-right">Profit (₹)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fifoMatches?.slice(0, 10).map((match, index) => (
                  <TableRow key={index}>
                    <TableCell>{format(new Date(match.buyDate), 'dd MMM yyyy')}</TableCell>
                    <TableCell>{format(new Date(match.saleDate), 'dd MMM yyyy')}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{match.asset}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{match.quantity.toFixed(4)}</TableCell>
                    <TableCell className="text-right">{match.buyRate.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{match.sellRate.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <span className={match.npm >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {match.npm.toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={match.profit >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {formatCurrency(match.profit)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Expense & Income Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Expense & Income Breakdown
          </CardTitle>
          <CardDescription>
            Detailed view of operational expenses and additional income streams
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount (₹)</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenseIncomeEntries?.slice(0, 10).map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{format(new Date(entry.date), 'dd MMM yyyy')}</TableCell>
                    <TableCell>{entry.category}</TableCell>
                    <TableCell>
                      <Badge variant={entry.type === 'Expense' ? 'destructive' : 'default'}>
                        {entry.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={entry.type === 'Expense' ? 'text-red-600' : 'text-green-600'}>
                        {formatCurrency(entry.amount)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {entry.description || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Formula Reference Footer */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Formula Reference
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div className="space-y-2">
              <h4 className="font-semibold">NPM Calculation</h4>
              <p className="text-muted-foreground">NPM = Sell Rate - Buy Rate</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold">Profit Calculation</h4>
              <p className="text-muted-foreground">Profit = NPM × Quantity</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold">Gross Profit</h4>
              <p className="text-muted-foreground">Sum of all FIFO-matched profits</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold">Net Profit</h4>
              <p className="text-muted-foreground">Gross Profit - Expenses + Income</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}