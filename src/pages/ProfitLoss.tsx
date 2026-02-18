import React, { useState } from 'react';
import { formatSmartDecimal } from '@/lib/format-smart-decimal';
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
  Activity,
  ShoppingCart,
  Wallet,
  Percent,
   ArrowRightLeft,
   Gauge,
   AlertTriangle
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { GrossProfitHistoryTab } from '@/components/financials/GrossProfitHistoryTab';
import { DateRange } from 'react-day-picker';
import { DateRangePicker, DateRangePreset, getDateRangeFromPreset } from '@/components/ui/date-range-picker';

interface PeriodMetrics {
  // Purchase metrics
  totalPurchaseValue: number;
  totalPurchaseQty: number;
  avgPurchaseRate: number;
  
  // Sales metrics
  totalSalesValue: number;
  totalSalesQty: number;
  avgSalesRate: number;
  
  // Profit metrics
  npm: number;
  grossProfit: number;
  netProfit: number;
  profitMargin: number;
  
  // Expense/Income
  totalExpenses: number;
  totalIncome: number;
   
   // USDT Fees & Effective Rate
   totalUsdtFees: number;
   effectivePurchaseRate: number | null;
   netPurchaseQty: number;

   // Conversion P&L
   conversionPnlUsdt: number;
   conversionPnlInr: number;
}

interface TradeEntry {
  id: string;
  date: string;
  asset: string;
  type: 'Buy' | 'Sell';
  quantity: number;
  rate: number;
  total: number;
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
  const [datePreset, setDatePreset] = useState<DateRangePreset>(() => {
    const saved = localStorage.getItem('pnl_date_preset');
    return (saved as DateRangePreset) || 'today';
  });
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const saved = localStorage.getItem('pnl_date_preset');
    return getDateRangeFromPreset((saved as DateRangePreset) || 'today');
  });

  const handleDatePresetChange = (preset: DateRangePreset) => {
    setDatePreset(preset);
    localStorage.setItem('pnl_date_preset', preset);
    // CRITICAL: also update dateRange so the query re-runs with fresh dates.
    // Without this, switching to "today" keeps the stale previous range.
    const newRange = getDateRangeFromPreset(preset);
    setDateRange(newRange);
  };
  const [selectedAsset, setSelectedAsset] = useState<string>('all');

  const getDateRange = () => {
    // For time-sensitive presets (today, yesterday, last7days etc.), always recompute
    // a fresh date range so that if the page was loaded before midnight the dates
    // don't become stale. Only for "custom" do we rely on the dateRange state.
    if (datePreset && datePreset !== 'custom' && datePreset !== 'allTime') {
      const freshRange = getDateRangeFromPreset(datePreset);
      if (freshRange?.from && freshRange?.to) {
        return { startDate: freshRange.from, endDate: freshRange.to };
      }
    }
    if (dateRange?.from && dateRange?.to) {
      return { startDate: dateRange.from, endDate: dateRange.to };
    }
    const now = new Date();
    return { startDate: startOfMonth(now), endDate: endOfMonth(now) };
  };


  // Fetch comprehensive P&L data with period-based calculations
  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['period_based_pl_dashboard', datePreset, dateRange?.from?.toISOString(), dateRange?.to?.toISOString(), selectedAsset],
    queryFn: async () => {
      const { startDate, endDate } = getDateRange();
      const startStr = format(startDate, 'yyyy-MM-dd');
      const endStr = format(endDate, 'yyyy-MM-dd');

      // Fetch completed sales orders within period - sales have quantity/price directly on the order
      const { data: salesOrders } = await supabase
        .from('sales_orders')
        .select(`
          id, 
          total_amount, 
          order_date,
          quantity,
          price_per_unit,
          client_name
        `)
        .eq('status', 'COMPLETED')
        .gte('order_date', startStr)
        .lte('order_date', endStr);

      // Convert sales orders to items format (since quantity/price is on the order itself)
      const salesItems = salesOrders?.map(order => ({
        sales_order_id: order.id,
        quantity: Number(order.quantity) || 0,
        unit_price: Number(order.price_per_unit) || 0
      })) || [];

      // Fetch completed purchase orders within period (date-filtered)
      const { data: purchaseOrders } = await supabase
        .from('purchase_orders')
        .select(`
          id,
          order_date,
          total_amount,
          market_rate_usdt
        `)
        .eq('status', 'COMPLETED')
        .gte('order_date', startStr)
        .lte('order_date', endStr);

      // Fetch purchase order items for period purchases
      const periodPurchaseOrderIds = purchaseOrders?.map(order => order.id) || [];
      
      // Exclude specific legacy non-USDT orders that were created before the WAC system
      const excludedOrderIds = [
        '1fd66952-bf77-4bf4-a183-4c0fbc34510f', // SHIB order
        '937f087e-6b2a-4328-a2dd-0166e0682c5b', // BTC order
        '4f90519e-6d47-43c4-8206-9278927c788f', // BTC order
      ];
      const filteredPurchaseOrderIds = periodPurchaseOrderIds.filter(id => !excludedOrderIds.includes(id));

      let purchaseItems: any[] = [];
      if (filteredPurchaseOrderIds.length > 0) {
        let purchaseQuery = supabase
          .from('purchase_order_items')
          .select('purchase_order_id, product_id, quantity, unit_price, products!inner(code)')
          .in('purchase_order_id', filteredPurchaseOrderIds);
        
        if (selectedAsset !== 'all') {
          purchaseQuery = purchaseQuery.eq('products.code', selectedAsset);
        }
        
        const { data: items } = await purchaseQuery;
        purchaseItems = items || [];
      }

      // For "All Assets" mode, fetch USDT conversion rates for non-USDT assets
      // so we can convert all purchases to USDT-equivalent for like-for-like comparison
      let assetUsdtRates: Record<string, number> = {};
      if (selectedAsset === 'all') {
        const { data: positions } = await supabase
          .from('wallet_asset_positions')
          .select('asset_code, avg_cost_usdt');
        positions?.forEach((p: any) => {
          if (p.avg_cost_usdt > 0) {
            assetUsdtRates[p.asset_code] = Number(p.avg_cost_usdt);
          }
        });
      }

      // Fetch operating expenses (excluding core trading operations like Purchase/Sales)
      const { data: expenseData } = await supabase
        .from('bank_transactions')
        .select('id, amount, category, description, transaction_date')
        .eq('transaction_type', 'EXPENSE')
        .not('category', 'in', '("Purchase","Sales","Stock Purchase","Stock Sale","Trade","Trading")')
        .gte('transaction_date', startStr)
        .lte('transaction_date', endStr);

      // Fetch operating income (excluding core trading operations and settlements which are part of sales cycle)
      const { data: incomeData } = await supabase
        .from('bank_transactions')
        .select('id, amount, category, description, transaction_date')
        .eq('transaction_type', 'INCOME')
        .not('category', 'in', '("Purchase","Sales","Stock Purchase","Stock Sale","Trade","Trading","Payment Gateway Settlement","Settlement")')
        .gte('transaction_date', startStr)
        .lte('transaction_date', endStr);

       // Fetch ALL USDT fees from wallet_transactions within the period
       const { data: usdtFeesData } = await supabase
         .from('wallet_transactions')
         .select('id, amount, reference_type, created_at')
         .eq('transaction_type', 'DEBIT')
         .in('reference_type', ['PLATFORM_FEE', 'TRANSFER_FEE', 'SALES_ORDER_FEE', 'PURCHASE_ORDER_FEE'])
         .gte('created_at', startStr)
         .lte('created_at', endStr + 'T23:59:59');

       // Fetch realized P&L events (conversion coin price gains/losses) within period
       const { data: realizedPnlData } = await supabase
         .from('realized_pnl_events')
         .select('realized_pnl_usdt')
         .gte('created_at', startStr)
         .lte('created_at', endStr + 'T23:59:59');

       // Fetch USDT/INR rate for converting USDT P&L to INR
       let usdtInrRate = 84.5; // fallback
       try {
         const { data: rateData } = await supabase.functions.invoke('fetch-usdt-rate');
         if (rateData?.rate) usdtInrRate = rateData.rate;
       } catch {}

      // Calculate period-based metrics
      // For "All Assets" mode, convert non-USDT purchases to USDT-equivalent:
      // If market_rate_usdt is stored on the purchase order, use it for conversion
      // Otherwise fall back to WAC from wallet_asset_positions
      let totalPurchaseValue = 0;
      let totalPurchaseQtyUsdtEquiv = 0;

      purchaseItems.forEach((item: any) => {
        const assetCode = item.products?.code || 'USDT';
        const qty = item.quantity;
        const unitPriceInr = item.unit_price;

        // Find the parent purchase order for this item to get market_rate_usdt
        const parentOrder = purchaseOrders?.find((po: any) => po.id === item.purchase_order_id);
        const storedMarketRate = parentOrder?.market_rate_usdt ? Number(parentOrder.market_rate_usdt) : null;

        if (assetCode === 'USDT' || selectedAsset !== 'all') {
          // USDT or specific asset filter: use raw values
          totalPurchaseValue += qty * unitPriceInr;
          totalPurchaseQtyUsdtEquiv += qty;
        } else {
          // Non-USDT in "All Assets" mode: convert to USDT-equivalent
          // Prefer stored market_rate_usdt (snapshot at purchase time), fall back to WAC
          const conversionRate = storedMarketRate && storedMarketRate > 0
            ? storedMarketRate
            : assetUsdtRates[assetCode];

          if (conversionRate && conversionRate > 0) {
            const usdtEquivQty = qty * conversionRate;
            totalPurchaseValue += qty * unitPriceInr; // INR spent is the same
            totalPurchaseQtyUsdtEquiv += usdtEquivQty;
          }
          // Skip assets with no known USDT rate to avoid distortion
        }
      });

      const avgPurchaseRate = totalPurchaseQtyUsdtEquiv > 0 
        ? totalPurchaseValue / totalPurchaseQtyUsdtEquiv : 0;
      
      const totalSalesValue = salesItems.reduce(
        (sum, item) => sum + (item.quantity * item.unit_price), 0
      );
      const totalSalesQty = salesItems.reduce(
        (sum, item) => sum + item.quantity, 0
      );
      const avgSalesRate = totalSalesQty > 0 
        ? totalSalesValue / totalSalesQty : 0;
      
       // Calculate Total USDT Fees (all types)
       const totalUsdtFees = usdtFeesData?.reduce((sum, fee) => sum + Number(fee.amount), 0) || 0;
       
       // Calculate Effective Purchase Rate
       // Formula: Total Purchase Amount (INR) / (Total Quantity Purchased - Total USDT Fees)
       const netPurchaseQty = totalPurchaseQtyUsdtEquiv - totalUsdtFees;
       let effectivePurchaseRate: number | null = null;
       
       if (totalPurchaseQtyUsdtEquiv > 0 && netPurchaseQty > 0) {
          effectivePurchaseRate = totalPurchaseValue / netPurchaseQty;
        } else if (netPurchaseQty <= 0 && totalPurchaseQtyUsdtEquiv > 0) {
         // Fees exceed or equal purchased quantity - edge case
         effectivePurchaseRate = null;
       }

       // Profit calculations based on Effective Purchase Rate (adjusted for all USDT fees)
       // Use effective purchase rate when available, fall back to avg purchase rate
       const purchaseRateForProfit = effectivePurchaseRate ?? avgPurchaseRate;
       const npm = avgSalesRate - purchaseRateForProfit;
      const grossProfit = npm * totalSalesQty;
      
      const totalExpenses = expenseData?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;
      const totalIncome = incomeData?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;

      // Conversion P&L from realized_pnl_events (coin price gains/losses)
      const conversionPnlUsdt = realizedPnlData?.reduce((sum, item) => sum + Number(item.realized_pnl_usdt || 0), 0) || 0;
      const conversionPnlInr = conversionPnlUsdt * usdtInrRate;
      
      const netProfit = grossProfit - totalExpenses + totalIncome + conversionPnlInr;
      const profitMargin = totalSalesValue > 0 
        ? (netProfit / totalSalesValue) * 100 : 0;

      const periodMetrics: PeriodMetrics = {
        totalPurchaseValue,
        totalPurchaseQty: totalPurchaseQtyUsdtEquiv,
        avgPurchaseRate,
        totalSalesValue,
        totalSalesQty,
        avgSalesRate,
        npm,
        grossProfit,
        netProfit,
        profitMargin,
        totalExpenses,
         totalIncome,
         totalUsdtFees,
         effectivePurchaseRate,
         netPurchaseQty,
         conversionPnlUsdt,
         conversionPnlInr,
      };

      // Create trade entries for table
      const tradeEntries: TradeEntry[] = [];
      
      // Add buy orders
      purchaseItems.forEach(item => {
        const order = purchaseOrders?.find(po => po.id === item.purchase_order_id);
        tradeEntries.push({
          id: item.purchase_order_id,
          date: order?.order_date || '',
          asset: 'USDT',
          type: 'Buy',
          quantity: item.quantity,
          rate: item.unit_price,
          total: item.quantity * item.unit_price
        });
      });

      // Add sell orders
      salesItems.forEach(item => {
        const order = salesOrders?.find(so => so.id === item.sales_order_id);
        tradeEntries.push({
          id: item.sales_order_id,
          date: order?.order_date || '',
          asset: 'USDT',
          type: 'Sell',
          quantity: item.quantity,
          rate: item.unit_price,
          total: item.quantity * item.unit_price
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

      return {
        periodMetrics,
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
          <p className="text-muted-foreground">Loading P&L Dashboard...</p>
        </div>
      </div>
    );
  }

  const { periodMetrics, tradeEntries, expenseIncomeEntries } = dashboardData || {
    periodMetrics: {} as PeriodMetrics,
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
                  <CardTitle className="text-2xl">Profit & Loss Dashboard</CardTitle>
                  <CardDescription>
                    Period-based trading performance analytics
                  </CardDescription>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <DateRangePicker
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
                preset={datePreset}
                onPresetChange={handleDatePresetChange}
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

      {/* Period Summary Widget */}
      <Card className="border-2 border-primary/20">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <PieChart className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Period Summary</CardTitle>
              <CardDescription>{getPeriodLabel()}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Row 1: Revenue, Expenses, Income */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-blue-500/10 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-medium text-muted-foreground">Total Revenue</span>
              </div>
              <p className="text-2xl font-bold">{formatCurrency(periodMetrics?.totalSalesValue || 0)}</p>
            </div>
            <div className="p-4 bg-red-500/10 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="h-4 w-4 text-red-500" />
                <span className="text-sm font-medium text-muted-foreground">Total Expenses</span>
              </div>
              <p className="text-2xl font-bold">{formatCurrency(periodMetrics?.totalExpenses || 0)}</p>
            </div>
            <div className="p-4 bg-green-500/10 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium text-muted-foreground">Total Income</span>
              </div>
              <p className="text-2xl font-bold">{formatCurrency(periodMetrics?.totalIncome || 0)}</p>
            </div>
          </div>

          <Separator />

          {/* Row 2: Avg Purchase Rate, Avg Sales Rate, NPM */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-orange-500/10 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <ShoppingCart className="h-4 w-4 text-orange-500" />
                <span className="text-sm font-medium text-muted-foreground">Avg Purchase Rate</span>
              </div>
              <p className="text-2xl font-bold">{formatCurrency(periodMetrics?.avgPurchaseRate || 0)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {(periodMetrics?.totalPurchaseQty || 0).toFixed(2)} units bought
              </p>
            </div>
             <TooltipProvider>
               <Tooltip>
                 <TooltipTrigger asChild>
                   <div className="p-4 bg-amber-500/10 rounded-lg cursor-help">
                     <div className="flex items-center gap-2 mb-2">
                       <Gauge className="h-4 w-4 text-amber-600" />
                       <span className="text-sm font-medium text-muted-foreground">Effective Purchase Rate</span>
                       <Info className="h-3 w-3 text-muted-foreground" />
                     </div>
                     {periodMetrics?.effectivePurchaseRate !== null ? (
                       <>
                         <p className="text-2xl font-bold">{formatCurrency(periodMetrics?.effectivePurchaseRate || 0)}</p>
                         <p className="text-xs text-muted-foreground mt-1">
                           Net qty: {(periodMetrics?.netPurchaseQty || 0).toFixed(4)} USDT
                         </p>
                       </>
                     ) : periodMetrics?.totalPurchaseQty === 0 ? (
                       <p className="text-xl font-medium text-muted-foreground">—</p>
                     ) : (
                       <div className="flex items-center gap-2">
                         <AlertTriangle className="h-4 w-4 text-amber-600" />
                         <p className="text-sm font-medium text-amber-600">Fees exceed quantity</p>
                       </div>
                     )}
                   </div>
                 </TooltipTrigger>
                 <TooltipContent className="max-w-xs p-3">
                   <p className="font-medium mb-1">Effective Purchase Rate</p>
                   <p className="text-xs mt-2 text-muted-foreground">
                     Total USDT Fees: {(periodMetrics?.totalUsdtFees || 0).toFixed(4)} USDT
                   </p>
                 </TooltipContent>
               </Tooltip>
             </TooltipProvider>
            <div className="p-4 bg-cyan-500/10 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="h-4 w-4 text-cyan-500" />
                <span className="text-sm font-medium text-muted-foreground">Avg Sales Rate</span>
              </div>
              <p className="text-2xl font-bold">{formatCurrency(periodMetrics?.avgSalesRate || 0)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {(periodMetrics?.totalSalesQty || 0).toFixed(2)} units sold
              </p>
            </div>
            <div className="p-4 bg-purple-500/10 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <ArrowRightLeft className="h-4 w-4 text-purple-500" />
                <span className="text-sm font-medium text-muted-foreground">NPM (per unit)</span>
              </div>
              <p className={`text-2xl font-bold ${(periodMetrics?.npm || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(periodMetrics?.npm || 0)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Avg Sales Rate - Avg Purchase Rate
              </p>
            </div>
          </div>

          <Separator />

          {/* Row 3: Gross Profit, Conversion P&L, Net Profit, Profit Margin */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-emerald-500/10 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-4 w-4 text-emerald-500" />
                <span className="text-sm font-medium text-muted-foreground">Gross Profit</span>
              </div>
              <p className={`text-2xl font-bold ${(periodMetrics?.grossProfit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(periodMetrics?.grossProfit || 0)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                NPM × Total Sales Qty
              </p>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="p-4 bg-violet-500/10 rounded-lg cursor-help">
                    <div className="flex items-center gap-2 mb-2">
                      <ArrowRightLeft className="h-4 w-4 text-violet-500" />
                      <span className="text-sm font-medium text-muted-foreground">Conversion P&L</span>
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <p className={`text-2xl font-bold ${(periodMetrics?.conversionPnlInr || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(periodMetrics?.conversionPnlInr || 0)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatSmartDecimal(periodMetrics?.conversionPnlUsdt || 0, 4)} USDT
                    </p>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs p-3">
                  <p className="font-medium mb-1">Conversion P&L</p>
                  <p className="text-xs text-muted-foreground">
                    Realized gains/losses from coin price movements during asset conversions (e.g., TRX→USDT). 
                    Tracked via WAC system in wallet_asset_positions.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="p-4 bg-indigo-500/10 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Calculator className="h-4 w-4 text-indigo-500" />
                <span className="text-sm font-medium text-muted-foreground">Net Profit</span>
              </div>
              <p className={`text-2xl font-bold ${(periodMetrics?.netProfit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(periodMetrics?.netProfit || 0)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Gross + Conv. P&L - Expenses + Income
              </p>
            </div>
            <div className="p-4 bg-pink-500/10 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Percent className="h-4 w-4 text-pink-500" />
                <span className="text-sm font-medium text-muted-foreground">Profit Margin</span>
              </div>
              <p className={`text-2xl font-bold ${(periodMetrics?.profitMargin || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {(periodMetrics?.profitMargin || 0).toFixed(2)}%
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Net Profit / Revenue × 100
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top Summary Cards - Quick Glance */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col">
              <p className="text-xs font-medium text-muted-foreground">Revenue</p>
              <p className="text-lg font-bold">{formatCurrency(periodMetrics?.totalSalesValue || 0)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col">
              <p className="text-xs font-medium text-muted-foreground">Expenses</p>
              <p className="text-lg font-bold">{formatCurrency(periodMetrics?.totalExpenses || 0)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col">
              <p className="text-xs font-medium text-muted-foreground">Income</p>
              <p className="text-lg font-bold">{formatCurrency(periodMetrics?.totalIncome || 0)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col">
              <p className="text-xs font-medium text-muted-foreground">Gross Profit</p>
              <p className={`text-lg font-bold ${(periodMetrics?.grossProfit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(periodMetrics?.grossProfit || 0)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col">
              <p className="text-xs font-medium text-muted-foreground">Net Profit</p>
              <p className={`text-lg font-bold ${(periodMetrics?.netProfit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(periodMetrics?.netProfit || 0)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col">
              <p className="text-xs font-medium text-muted-foreground">Margin</p>
              <p className={`text-lg font-bold ${(periodMetrics?.profitMargin || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {(periodMetrics?.profitMargin || 0).toFixed(2)}%
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trade Table - Simplified */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Period Trade Summary
          </CardTitle>
          <CardDescription>
            All buy and sell transactions within the selected period
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tradeEntries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No trades found in the selected period
            </div>
          ) : (
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tradeEntries?.slice(0, 15).map((entry, idx) => (
                    <TableRow key={`${entry.id}-${idx}`}>
                      <TableCell>{entry.date ? format(new Date(entry.date), 'dd MMM yyyy') : '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{entry.asset}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={entry.type === 'Buy' ? 'secondary' : 'default'}>
                          {entry.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{entry.quantity.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{entry.rate.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(entry.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
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
          {expenseIncomeEntries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No expenses or income found in the selected period
            </div>
          ) : (
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
          )}
        </CardContent>
      </Card>

      {/* Gross Profit History */}
      <GrossProfitHistoryTab />
    </div>
  );
}
