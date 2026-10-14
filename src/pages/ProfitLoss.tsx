import { countsInExpenseStats } from "@/lib/operatingExpense";
import { isReversalTransaction } from "@/lib/isReversalTransaction";
import { StatGridSkeleton, ChartSkeleton, TableSkeleton } from "@/components/shared/skeletons";
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ClickableRow } from '@/components/transaction-detail';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import {
  Download,
  TrendingUp,
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  Receipt,
  Scale,
  Shield,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { fetchAllPaginated } from '@/lib/fetchAllRows';
import { resolveCarriedPurchaseRate } from '@/lib/carryForwardPurchaseRate';
import { GrossProfitHistoryTab } from '@/components/financials/GrossProfitHistoryTab';
import { DateRange } from 'react-day-picker';
import { DateRangePicker, DateRangePreset, getDateRangeFromPreset } from '@/components/ui/date-range-picker';
import { cn } from '@/lib/utils';
import {
  Panel,
  KpiTile,
  ValueRow,
  InfoTip,
  ShareBar,
  StatusChip,
  TablePager,
  UpdatingPill,
  usePaged,
  rowOpenProps,
  downloadWorkbook,
  formatCompactINR,
  formatExactINR,
  inr,
  rate as fmtRate,
  qty as fmtQty,
  count as fmtCount,
  splitCategory,
} from '@/components/finance-ui';

const PAYOUT_GATEWAY_FEE_CATEGORY = 'Finance, Banking & Compliance > Payout Gateway Fee';

const normalizeExpenseCategory = (category?: string | null, description?: string | null) => {
  const descriptionText = String(description || '').toLowerCase();
  if (category === PAYOUT_GATEWAY_FEE_CATEGORY || descriptionText.includes('payout gateway fee')) {
    return 'Payout Gateway Fee';
  }
  return category || 'General';
};

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

   // Carry-forward cost basis (used when the period had zero purchases)
   carriedPurchaseRate: number | null;
   carriedFromDate: string | null;
   costBasisUnavailable: boolean;
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
  const { hasAnyPermission, isLoading: permissionsLoading } = usePermissions();
  const canViewProfitLoss = hasAnyPermission(["profit_loss_view"]);

  const [datePreset, setDatePreset] = useState<DateRangePreset>(() => {
    const saved = localStorage.getItem('pnl_date_preset') as DateRangePreset | null;
    // If "custom" was saved but we can't restore the range, fall back to "allTime"
    if (saved === 'custom') {
      const savedRange = localStorage.getItem('pnl_custom_date_range');
      if (!savedRange) return 'allTime';
      try {
        const parsed = JSON.parse(savedRange);
        if (parsed.from && parsed.to) return 'custom';
      } catch { return 'allTime'; }
    }
    return saved || 'today';
  });

  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const saved = localStorage.getItem('pnl_date_preset') as DateRangePreset | null;
    if (saved === 'custom') {
      const savedRange = localStorage.getItem('pnl_custom_date_range');
      if (savedRange) {
        try {
          const parsed = JSON.parse(savedRange);
          if (parsed.from && parsed.to) {
            return { from: new Date(parsed.from), to: new Date(parsed.to) };
          }
        } catch { /* fall through */ }
      }
      // Custom range lost — will fall back to allTime via datePreset init
      return undefined;
    }
    const preset = saved || 'today';
    return getDateRangeFromPreset(preset);
  });

  const handleDatePresetChange = (preset: DateRangePreset) => {
    setDatePreset(preset);
    localStorage.setItem('pnl_date_preset', preset);
    if (preset !== 'custom') {
      // Clear saved custom range when switching away
      localStorage.removeItem('pnl_custom_date_range');
      const newRange = getDateRangeFromPreset(preset);
      setDateRange(newRange);
    }
  };

  // When dateRange changes with custom preset, persist the range
  const handleDateRangeChange = (range: DateRange | undefined) => {
    setDateRange(range);
    if (range?.from && range?.to) {
      localStorage.setItem('pnl_custom_date_range', JSON.stringify({
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      }));
    }
  };

  const [selectedAsset, setSelectedAsset] = useState<string>('all');

  // Centralized date computation — single source of truth for both query and labels
  const getDateRange = () => {
    if (datePreset === 'allTime') {
      return { startDate: new Date(2020, 0, 1), endDate: new Date() };
    }
    // Named presets: always recompute fresh dates (prevents stale midnight crossover)
    if (datePreset && datePreset !== 'custom') {
      const freshRange = getDateRangeFromPreset(datePreset);
      if (freshRange?.from && freshRange?.to) {
        return { startDate: freshRange.from, endDate: freshRange.to };
      }
    }
    // Custom range
    if (dateRange?.from && dateRange?.to) {
      return { startDate: dateRange.from, endDate: dateRange.to };
    }
    // Single-day custom selection (only `from` chosen) — treat as one-day range,
    // not as "All Time". Prevents silent fallback that pulled lifetime data.
    if (dateRange?.from && !dateRange?.to) {
      return { startDate: dateRange.from, endDate: dateRange.from };
    }
    // Final fallback — treat as allTime if nothing else matches
    return { startDate: new Date(2020, 0, 1), endDate: new Date() };
  };

  // Compute date strings OUTSIDE queryFn — stable, deterministic, in query key
  const { startDate: _startDate, endDate: _endDate } = getDateRange();
  const computedStartStr = format(_startDate, 'yyyy-MM-dd');
  const computedEndStr = format(_endDate, 'yyyy-MM-dd');

  // Fetch comprehensive P&L data with period-based calculations
  const { data: dashboardData, isLoading, isFetching, isPlaceholderData, refetch } = useQuery({
    queryKey: ['period_based_pl_dashboard_v2', computedStartStr, computedEndStr, selectedAsset],
    staleTime: 0, // Always re-fetch — P&L data is time-sensitive
    // Keep the previous period on screen (dimmed) while a new period loads.
    placeholderData: (prev) => prev,
    queryFn: async () => {
      // Use the pre-computed strings passed via queryKey to avoid closure issues entirely
      const startStr = computedStartStr;
      const endStr = computedEndStr;

      // Fetch completed sales orders within period - paginated to handle >1000 rows
      const salesOrders = await fetchAllPaginated<any>(
        () => supabase
          .from('sales_orders')
          .select(`
            id, 
            total_amount, 
            order_date,
            quantity,
            price_per_unit,
            client_name,
            effective_usdt_qty,
            effective_usdt_rate,
            products:product_id(code)
          `)
          .eq('status', 'COMPLETED')
          .gte('order_date', startStr)
          .lte('order_date', endStr)
      );

      // Convert sales orders to items format using effective USDT values
      const salesItems = salesOrders?.map(order => ({
        sales_order_id: order.id,
        quantity: Number(order.effective_usdt_qty || order.quantity) || 0,
        unit_price: Number(order.effective_usdt_rate || order.price_per_unit) || 0
      })) || [];

      // Fetch completed purchase orders within period - paginated
      const purchaseOrders = await fetchAllPaginated<any>(
        () => supabase
          .from('purchase_orders')
          .select(`
            id,
            order_date,
            total_amount,
            market_rate_usdt,
            effective_usdt_qty,
            effective_usdt_rate
          `)
          .eq('status', 'COMPLETED')
          .gte('order_date', startStr)
          .lte('order_date', endStr)
      );

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
        for (let i = 0; i < filteredPurchaseOrderIds.length; i += 200) {
          const chunk = filteredPurchaseOrderIds.slice(i, i + 200);
          const items = await fetchAllPaginated<any>(() => {
            let purchaseQuery = supabase
              .from('purchase_order_items')
              .select('purchase_order_id, product_id, quantity, unit_price, products!inner(code)')
              .in('purchase_order_id', chunk);
            if (selectedAsset !== 'all') {
              purchaseQuery = purchaseQuery.eq('products.code', selectedAsset);
            }
            return purchaseQuery;
          });
          purchaseItems.push(...items);
        }
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

      // Fetch operating expenses (excluding core trading operations like Purchase/Sales,
      // and settlement-related entries — settlements/settlement reversals are part of the
      // sales cycle and are excluded from income, so they must be excluded from expenses too) — paginated
      const expenseDataRaw = await fetchAllPaginated<any>(
        () => supabase
          .from('bank_transactions')
          .select('id, amount, category, description, transaction_date, reference_number')
          .eq('transaction_type', 'EXPENSE')
          .not('category', 'in', '("Purchase","Sales","Stock Purchase","Stock Sale","Trade","Trading","OPENING_BALANCE","ADJUSTMENT","Manual Baseline Reset","Payment Gateway Settlement","Settlement")')
          .gte('transaction_date', startStr)
          .lte('transaction_date', endStr)
      );
      // Reversal / contra entries (incl. settlement reversals) are ledger corrections, not expenses.
      const expenseData = (expenseDataRaw || []).filter((t: any) => !isReversalTransaction(t) && countsInExpenseStats(t));

      // Fetch operating income (excluding core trading operations and settlements which are part of sales cycle) — paginated
      const incomeData = await fetchAllPaginated<any>(
        () => supabase
          .from('bank_transactions')
          .select('id, amount, category, description, transaction_date')
          .eq('transaction_type', 'INCOME')
          .not('category', 'in', '("Purchase","Sales","Stock Purchase","Stock Sale","Trade","Trading","Payment Gateway Settlement","Settlement")')
          .gte('transaction_date', startStr)
          .lte('transaction_date', endStr)
      );

       // Fetch USDT fees from authoritative sources:
       // 1. wallet_fee_deductions (sales/purchase order fees) - fee_usdt_amount
       // 2. erp_product_conversions (conversion fees)
       const feeDeductionsData = await fetchAllPaginated<any>(
         () => supabase
           .from('wallet_fee_deductions')
           .select('fee_usdt_amount')
           .gte('created_at', startStr)
           .lte('created_at', endStr + 'T23:59:59')
       );

       const conversionFeesData = await fetchAllPaginated<any>(
         () => supabase
           .from('erp_product_conversions')
           .select('fee_amount')
           .eq('status', 'APPROVED')
           .gte('approved_at', startStr)
           .lte('approved_at', endStr + 'T23:59:59')
       );

       // Also fetch transfer fees from wallet_transactions (not in fee_deductions) — paginated
       const transferFeesData = await fetchAllPaginated<any>(
         () => supabase
           .from('wallet_transactions')
           .select('amount')
           .eq('transaction_type', 'DEBIT')
           .eq('reference_type', 'TRANSFER_FEE')
           .eq('asset_code', 'USDT')
           .gte('created_at', startStr)
           .lte('created_at', endStr + 'T23:59:59')
       );




       let usdtInrRate = 0;
       try {
         const { data: rateData } = await supabase.functions.invoke('fetch-usdt-rate');
         if (rateData?.rate && rateData?.source !== 'Fallback') usdtInrRate = rateData.rate;
       } catch (err) { console.warn('[ProfitLoss] Failed to fetch USDT rate:', err); }

      // Calculate period-based purchase metrics using effective USDT values
      // effective_usdt_qty and effective_usdt_rate normalize all assets to USDT-equivalent
      let totalPurchaseValue = 0;
      let totalPurchaseQty = 0;

      if (selectedAsset === 'all') {
        // "All Assets" mode: use effective_usdt_qty/rate from purchase_orders directly
        // This includes ALL assets (USDT, BTC, ETH, etc.) normalized to USDT-equivalent
        const filteredPOs = purchaseOrders?.filter((po: any) => !excludedOrderIds.includes(po.id)) || [];
        filteredPOs.forEach((po: any) => {
          const effQty = Number(po.effective_usdt_qty || 0);
          const totalAmt = Number(po.total_amount || 0);
          if (effQty > 0) {
            totalPurchaseQty += effQty;
            totalPurchaseValue += totalAmt;
          }
        });
      } else {
        // Specific asset filter: use purchase_order_items as before
        purchaseItems.forEach((item: any) => {
          const qty = item.quantity;
          const unitPriceInr = item.unit_price;
          totalPurchaseValue += qty * unitPriceInr;
          totalPurchaseQty += qty;
        });
      }

      const avgPurchaseRate = totalPurchaseQty > 0 
        ? totalPurchaseValue / totalPurchaseQty : 0;
      
      const totalSalesValue = salesItems.reduce(
        (sum, item) => sum + (item.quantity * item.unit_price), 0
      );
      const totalSalesQty = salesItems.reduce(
        (sum, item) => sum + item.quantity, 0
      );
      const avgSalesRate = totalSalesQty > 0 
        ? totalSalesValue / totalSalesQty : 0;
      
       // Calculate Total USDT Fees from all authoritative sources
       const feeDeductionsTotal = feeDeductionsData?.reduce((sum, f) => sum + Number(f.fee_usdt_amount || 0), 0) || 0;
       const conversionFeesTotal = conversionFeesData?.reduce((sum, f) => sum + Number(f.fee_amount || 0), 0) || 0;
       const transferFeesTotal = transferFeesData?.reduce((sum, f) => sum + Number(f.amount || 0), 0) || 0;
       const totalUsdtFees = feeDeductionsTotal + conversionFeesTotal + transferFeesTotal;
       
       // Calculate Effective Purchase Rate
       // Formula: Total Purchase Amount (INR) / (Total Quantity Purchased - Total USDT Fees)
       const netPurchaseQty = totalPurchaseQty - totalUsdtFees;
       let effectivePurchaseRate: number | null = null;
       
       if (totalPurchaseQty > 0 && netPurchaseQty > 0) {
          effectivePurchaseRate = totalPurchaseValue / netPurchaseQty;
        } else if (netPurchaseQty <= 0 && totalPurchaseQty > 0) {
         // Fees exceed or equal purchased quantity - edge case
         effectivePurchaseRate = null;
       }

       // Profit calculations based on Effective Purchase Rate (adjusted for all USDT fees).
       // When the period had NO purchases at all, a zero cost basis would make the whole
       // sale value read as profit — carry forward the last purchase day's effective rate.
       let carriedPurchaseRate: number | null = null;
       let carriedFromDate: string | null = null;
       let costBasisUnavailable = false;

       if (totalPurchaseQty <= 0) {
         const carried = await resolveCarriedPurchaseRate(startStr, selectedAsset);
         if (carried) {
           carriedPurchaseRate = carried.rate;
           carriedFromDate = carried.sourceDate;
         } else {
           costBasisUnavailable = true;
         }
       }

       const purchaseRateForProfit =
         carriedPurchaseRate ?? effectivePurchaseRate ?? avgPurchaseRate;
       const npm = costBasisUnavailable ? 0 : avgSalesRate - purchaseRateForProfit;
      const grossProfit = costBasisUnavailable ? 0 : npm * totalSalesQty;
      
      const totalExpenses = expenseData?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;
      const totalIncome = incomeData?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;

      
      const netProfit = grossProfit - totalExpenses + totalIncome;
      const profitMargin = totalSalesValue > 0 
        ? (netProfit / totalSalesValue) * 100 : 0;

      const periodMetrics: PeriodMetrics = {
        totalPurchaseValue,
        totalPurchaseQty,
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
         carriedPurchaseRate,
         carriedFromDate,
         costBasisUnavailable,
      };

      // Create trade entries for table
      const tradeEntries: TradeEntry[] = [];
      
      // Add buy orders - show actual asset and USDT-equivalent quantity
      purchaseItems.forEach(item => {
        const order = purchaseOrders?.find(po => po.id === item.purchase_order_id);
        const assetCode = item.products?.code || 'USDT';
        const rawQty = item.quantity;

        // Calculate USDT-equivalent quantity for non-USDT assets
        let usdtEquivQty = rawQty;
        if (assetCode !== 'USDT') {
          const storedMarketRate = order?.market_rate_usdt ? Number(order.market_rate_usdt) : null;
          const convRate = (storedMarketRate && storedMarketRate > 0)
            ? storedMarketRate
            : assetUsdtRates[assetCode];
          if (convRate && convRate > 0) {
            usdtEquivQty = rawQty * convRate;
          }
        }

        tradeEntries.push({
          id: item.purchase_order_id,
          date: order?.order_date || '',
          asset: assetCode,
          type: 'Buy',
          quantity: usdtEquivQty,
          rate: item.unit_price,
          total: rawQty * item.unit_price
        });
      });

      // Add sell orders
      salesItems.forEach(item => {
        const order = salesOrders?.find(so => so.id === item.sales_order_id);
        tradeEntries.push({
          id: item.sales_order_id,
          date: order?.order_date || '',
          asset: (order as any)?.products?.code || 'USDT',
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
          category: normalizeExpenseCategory(item.category, item.description),
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
    enabled: canViewProfitLoss && !permissionsLoading,
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(amount);
  };

  const getPeriodLabel = () => {
    if (datePreset === 'allTime') return 'All Time';
    // Use the actual computed dates (same as query) for the label
    if (computedStartStr === computedEndStr) {
      return format(_startDate, 'MMM dd, yyyy');
    }
    return `${format(_startDate, 'MMM dd')} - ${format(_endDate, 'MMM dd, yyyy')}`;
  };

  // ── Presentation state (display only — never feeds back into the figures) ──
  const [tradeSide, setTradeSide] = useState<'all' | 'Buy' | 'Sell'>('all');
  const [ledgerType, setLedgerType] = useState<'Expense' | 'Income'>('Expense');
  const [headFilter, setHeadFilter] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const allTrades: TradeEntry[] = dashboardData?.tradeEntries ?? [];
  const allEntries: ExpenseIncomeEntry[] = dashboardData?.expenseIncomeEntries ?? [];
  const periodKey = `${computedStartStr}|${computedEndStr}|${selectedAsset}`;

  const tradeCounts = useMemo(() => {
    let buys = 0, sells = 0;
    allTrades.forEach((t) => { if (t.type === 'Buy') buys++; else sells++; });
    return { buys, sells };
  }, [allTrades]);

  const visibleTrades = useMemo(
    () => (tradeSide === 'all' ? allTrades : allTrades.filter((t) => t.type === tradeSide)),
    [allTrades, tradeSide]
  );
  const visibleTradeTotals = useMemo(() => visibleTrades.reduce(
    (acc, t) => ({ qty: acc.qty + (Number(t.quantity) || 0), value: acc.value + (Number(t.total) || 0) }),
    { qty: 0, value: 0 }
  ), [visibleTrades]);
  const tradePager = usePaged(visibleTrades, 25, `${tradeSide}|${periodKey}`);

  const ledgerCounts = useMemo(() => {
    let expense = 0, income = 0;
    allEntries.forEach((e) => { if (e.type === 'Expense') expense++; else income++; });
    return { expense, income };
  }, [allEntries]);

  const heads = useMemo(() => {
    const map = new Map<string, { head: string; amount: number; count: number }>();
    allEntries.filter((e) => e.type === ledgerType).forEach((e) => {
      const { head } = splitCategory(e.category);
      const cur = map.get(head) || { head, amount: 0, count: 0 };
      cur.amount += Number(e.amount) || 0;
      cur.count += 1;
      map.set(head, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [allEntries, ledgerType]);
  const headMax = heads.reduce((m, h) => Math.max(m, h.amount), 0);
  const headTotal = heads.reduce((s, h) => s + h.amount, 0);

  const ledgerRows = useMemo(
    () => allEntries.filter((e) => e.type === ledgerType && (!headFilter || splitCategory(e.category).head === headFilter)),
    [allEntries, ledgerType, headFilter]
  );
  const ledgerPager = usePaged(ledgerRows, 10, `${ledgerType}|${headFilter}|${periodKey}`);
  // A head picked for one period may not exist in the next one.
  useEffect(() => { setHeadFilter(null); }, [periodKey]);

  if (permissionsLoading) {
    return (
      <div className="min-h-screen bg-background p-6 space-y-6 page-mount">
        <StatGridSkeleton count={4} />
        <ChartSkeleton height={280} />
      </div>
    );
  }

  if (!canViewProfitLoss) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <div className="max-w-md w-full rounded-lg border border-border bg-card p-6 text-center">
          <Shield className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 text-xl font-semibold">Access Denied</h2>
          <p className="text-muted-foreground mt-2">You don't have permission to access P&L.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6 space-y-6">
        <StatGridSkeleton count={4} />
        <ChartSkeleton height={280} />
        <TableSkeleton rows={6} columns={6} />
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="min-h-screen bg-background p-6">
        <ErrorState
          title="Couldn't load the P&L"
          description="The figures for this period didn't load. Please try again."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const { periodMetrics, tradeEntries, expenseIncomeEntries } = dashboardData || {
    periodMetrics: {} as PeriodMetrics,
    tradeEntries: [],
    expenseIncomeEntries: []
  };
  const pm = periodMetrics || ({} as PeriodMetrics);

  // Derived display figures — every one is arithmetic on the metrics above.
  const revenue = pm.totalSalesValue || 0;
  const grossProfit = pm.grossProfit || 0;
  const netProfit = pm.netProfit || 0;
  const expenses = pm.totalExpenses || 0;
  const otherIncome = pm.totalIncome || 0;
  const unavailable = !!pm.costBasisUnavailable;
  const carried = !!pm.carriedFromDate && pm.carriedPurchaseRate != null;
  const hasBuys = (pm.totalPurchaseQty || 0) > 0;
  // Same precedence the profit calculation uses: carried → effective → average.
  const rateUsed = pm.carriedPurchaseRate ?? pm.effectivePurchaseRate ?? pm.avgPurchaseRate ?? 0;
  const costOfSales = unavailable ? null : revenue - grossProfit;
  const grossMarginPct = revenue > 0 && !unavailable ? (grossProfit / revenue) * 100 : null;
  const feeDragPerUnit = hasBuys && pm.effectivePurchaseRate != null ? pm.effectivePurchaseRate - (pm.avgPurchaseRate || 0) : null;
  const stockChange = (pm.totalPurchaseQty || 0) - (pm.totalSalesQty || 0);
  // Sales are always the USDT-equivalent of every completed sale (the asset filter
  // only narrows purchases), so sold quantities are labelled USDT; bought
  // quantities are in the selected asset's own units.
  const assetMode = selectedAsset !== 'all';
  const unitLabel = assetMode ? 'unit' : 'USDT';
  const soldUnit = 'USDT';
  const boughtUnit = assetMode ? selectedAsset : 'USDT';
  const rateUsedLabel = carried
    ? `carried-forward buy rate (${pm.carriedFromDate})`
    : pm.effectivePurchaseRate != null ? 'effective buy rate' : 'average buy rate';
  const netTone = netProfit > 0 ? 'positive' : netProfit < 0 ? 'negative' : 'default';
  // Same branch order as the original Effective Purchase Rate card.
  const effState: 'value' | 'carried' | 'unavailable' | 'none' | 'feesExceed' =
    pm.effectivePurchaseRate !== null && pm.effectivePurchaseRate !== undefined ? 'value'
    : pm.carriedPurchaseRate ? 'carried'
    : pm.costBasisUnavailable ? 'unavailable'
    : pm.totalPurchaseQty === 0 ? 'none'
    : 'feesExceed';
  const updating = !!isPlaceholderData && isFetching;

  const handleExport = async () => {
    try {
      setExporting(true);
      const statement = [
        { Line: 'Period', Amount: null, Detail: getPeriodLabel() },
        { Line: 'Asset filter', Amount: null, Detail: selectedAsset === 'all' ? 'All assets (USDT-equivalent)' : selectedAsset },
        { Line: 'Sales revenue', Amount: +revenue.toFixed(2), Detail: `${fmtQty(pm.totalSalesQty || 0)} ${soldUnit} at avg ${fmtRate(pm.avgSalesRate || 0)}` },
        { Line: 'Cost of stock sold', Amount: costOfSales == null ? null : -+costOfSales.toFixed(2), Detail: unavailable ? 'Unavailable — no purchase history' : `${fmtQty(pm.totalSalesQty || 0)} ${soldUnit} × ${fmtRate(rateUsed)} (${rateUsedLabel})` },
        { Line: 'Gross profit', Amount: unavailable ? null : +grossProfit.toFixed(2), Detail: unavailable ? 'Unavailable' : `NPM ${fmtRate(pm.npm || 0)} per ${unitLabel}` },
        { Line: 'Operating expenses', Amount: -+expenses.toFixed(2), Detail: `${ledgerCounts.expense} entries` },
        { Line: 'Other income', Amount: +otherIncome.toFixed(2), Detail: `${ledgerCounts.income} entries` },
        { Line: 'Net profit', Amount: +netProfit.toFixed(2), Detail: `Margin ${(pm.profitMargin || 0).toFixed(2)}%` },
        { Line: 'Avg purchase rate', Amount: +(pm.avgPurchaseRate || 0).toFixed(4), Detail: `${fmtQty(pm.totalPurchaseQty || 0)} bought` },
        { Line: 'Effective purchase rate', Amount: pm.effectivePurchaseRate == null ? null : +pm.effectivePurchaseRate.toFixed(4), Detail: `USDT fees ${fmtQty(pm.totalUsdtFees || 0, 4)}` },
        { Line: 'Avg sales rate', Amount: +(pm.avgSalesRate || 0).toFixed(4), Detail: `${fmtQty(pm.totalSalesQty || 0)} sold` },
      ];
      await downloadWorkbook(`pnl_${computedStartStr}_to_${computedEndStr}_${selectedAsset}`, [
        { name: 'Statement', rows: statement },
        {
          name: 'Trades',
          rows: tradeEntries.map((t) => ({
            Date: t.date, Side: t.type, Asset: t.asset,
            'Qty (USDT eq.)': +Number(t.quantity).toFixed(4), 'Rate (₹)': +Number(t.rate).toFixed(4), 'Total (₹)': +Number(t.total).toFixed(2), 'Order id': t.id,
          })),
        },
        {
          name: 'Expenses & income',
          rows: expenseIncomeEntries.map((e) => {
            const { head, sub } = splitCategory(e.category);
            return { Date: e.date, Type: e.type === 'Income' ? 'Other income' : 'Expense', Head: head, Category: sub || head, Description: e.description, 'Amount (₹)': +Number(e.amount).toFixed(2), 'Entry id': e.id };
          }),
        },
      ]);
    } finally {
      setExporting(false);
    }
  };

  // Bridge: gross profit → net profit (comparable magnitudes, unlike revenue).
  const bridge = [
    { key: 'gp', label: 'Gross profit', value: unavailable ? 0 : grossProfit, display: unavailable ? 'Unavailable' : inr(grossProfit) },
    { key: 'opex', label: 'Operating expenses', value: -expenses, display: `−${inr(expenses)}` },
    { key: 'inc', label: 'Other income', value: otherIncome, display: `+${inr(otherIncome)}` },
    { key: 'net', label: 'Net profit', value: netProfit, display: inr(netProfit), strong: true },
  ];
  const bridgeMax = Math.max(1, ...bridge.map((b) => Math.abs(b.value)));

  // Rate ladder geometry (avg buy → effective buy → avg sell).
  const ladderPoints = [
    { key: 'buy', label: 'Avg buy', value: hasBuys ? pm.avgPurchaseRate : null },
    { key: 'eff', label: carried ? 'Carried buy' : 'Effective buy', value: unavailable ? null : rateUsed },
    { key: 'sell', label: 'Avg sell', value: (pm.totalSalesQty || 0) > 0 ? pm.avgSalesRate : null },
  ].filter((p) => p.value != null && isFinite(Number(p.value)) && Number(p.value) > 0) as { key: string; label: string; value: number }[];
  const ladderMin = ladderPoints.length ? Math.min(...ladderPoints.map((p) => p.value)) : 0;
  const ladderMax = ladderPoints.length ? Math.max(...ladderPoints.map((p) => p.value)) : 0;
  const ladderPad = Math.max((ladderMax - ladderMin) * 0.25, ladderMax * 0.002, 0.01);
  const ladderPos = (v: number) => ((v - (ladderMin - ladderPad)) / ((ladderMax + ladderPad) - (ladderMin - ladderPad))) * 100;
  const sellPoint = ladderPoints.find((p) => p.key === 'sell');
  const costPoint = ladderPoints.find((p) => p.key === 'eff');

  const volumeMax = Math.max(pm.totalPurchaseQty || 0, pm.totalSalesQty || 0, 1);

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-5">
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            <span className="p-2 bg-muted rounded-md border border-border">
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
            </span>
            Profit &amp; Loss
          </span>
        }
        description={<span className="flex flex-wrap items-center gap-2">Trading spread, costs and net result · {getPeriodLabel()} <UpdatingPill show={updating} /></span>}
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <DateRangePicker
              dateRange={dateRange}
              onDateRangeChange={handleDateRangeChange}
              preset={datePreset}
              onPresetChange={handleDatePresetChange}
              className="w-52"
            />
            <Select value={selectedAsset} onValueChange={setSelectedAsset}>
              <SelectTrigger className="w-32" aria-label="Asset">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Assets</SelectItem>
                <SelectItem value="USDT">USDT</SelectItem>
                <SelectItem value="BTC">BTC</SelectItem>
                <SelectItem value="ETH">ETH</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleExport} disabled={exporting || !dashboardData || updating}>
              <Download className="h-4 w-4 mr-2" />
              {exporting ? 'Preparing…' : 'Export'}
            </Button>
          </div>
        }
      />

      <div className={cn('space-y-5 transition-opacity', updating && 'opacity-60')}>
        {/* Headline figures */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <KpiTile
            label="Net profit"
            value={formatCompactINR(netProfit)}
            exact={formatExactINR(netProfit)}
            tone={netTone}
            emphasis
            sub="Gross profit − expenses + income"
          />
          <KpiTile
            label="Gross profit"
            value={unavailable ? 'Unavailable' : formatCompactINR(grossProfit)}
            exact={unavailable ? undefined : formatExactINR(grossProfit)}
            tone={unavailable ? 'muted' : grossProfit >= 0 ? 'positive' : 'negative'}
            sub={unavailable ? 'No purchase history to derive a cost basis' : `NPM ${fmtRate(pm.npm || 0)} per ${unitLabel}`}
            info="NPM × total sales qty. NPM = average sales rate − the purchase rate used for the period (fee-adjusted, or carried forward when nothing was bought)."
          />
          <KpiTile
            label="Revenue"
            value={formatCompactINR(revenue)}
            exact={formatExactINR(revenue)}
            sub={`${fmtQty(pm.totalSalesQty || 0)} ${soldUnit} sold`}
          />
          <KpiTile
            label="Profit margin"
            value={`${(pm.profitMargin || 0).toFixed(2)}%`}
            tone={(pm.profitMargin || 0) >= 0 ? 'default' : 'negative'}
            sub="Net profit / revenue × 100"
          />
        </div>

        {carried && !unavailable && (
          <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-foreground">
              No stock was bought in this period, so the cost basis is carried forward from the last purchase day ({pm.carriedFromDate}) at {fmtRate(pm.carriedPurchaseRate || 0)} per unit.
            </p>
          </div>
        )}

        {unavailable && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-foreground">
              Cost basis unavailable: there were no purchases in this period and no earlier purchase day exists, so gross profit cannot be derived and is shown as unavailable.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          {/* Statement */}
          <Panel
            className="xl:col-span-7"
            icon={Receipt}
            title="Statement"
            description={`How ${getPeriodLabel()} turned into net profit`}
          >
            <div className="divide-y divide-border/70">
              <ValueRow
                label="Sales revenue"
                value={inr(revenue)}
                hint={`${fmtQty(pm.totalSalesQty || 0)} ${soldUnit} sold at avg ${fmtRate(pm.avgSalesRate || 0)}`}
              />
              <ValueRow
                label="Cost of stock sold"
                value={costOfSales == null ? 'Unavailable' : `−${inr(costOfSales)}`}
                tone={costOfSales == null ? 'muted' : 'default'}
                hint={costOfSales == null
                  ? 'No purchase history to derive a cost basis'
                  : `${fmtQty(pm.totalSalesQty || 0)} ${soldUnit} × ${fmtRate(rateUsed)} ${rateUsedLabel}`}
                info="Revenue − gross profit: the sold quantity valued at the purchase rate the profit calculation used."
              />
              <ValueRow
                strong
                label="Gross profit"
                value={unavailable ? 'Unavailable' : inr(grossProfit)}
                tone={unavailable ? 'muted' : grossProfit >= 0 ? 'positive' : 'negative'}
                hint={unavailable ? 'No purchase history to derive a cost basis' : `NPM × Total Sales Qty · ${grossMarginPct == null ? '—' : `${grossMarginPct.toFixed(2)}% of revenue`}`}
              />
              <ValueRow
                label="Operating expenses"
                value={`−${inr(expenses)}`}
                hint={`${fmtCount(ledgerCounts.expense)} ${ledgerCounts.expense === 1 ? 'entry' : 'entries'} · bank expenses outside trading and settlements`}
              />
              <ValueRow
                label="Other income"
                value={`+${inr(otherIncome)}`}
                hint={`${fmtCount(ledgerCounts.income)} ${ledgerCounts.income === 1 ? 'entry' : 'entries'} · bank income outside trading and settlements`}
              />
              <ValueRow
                strong
                className="pt-3"
                label="Net profit"
                value={inr(netProfit)}
                tone={netTone}
                hint={`Gross Profit - Expenses + Income · ${(pm.profitMargin || 0).toFixed(2)}% margin`}
              />
            </div>

            {/* Gross profit → net profit bridge */}
            <div className="mt-4 rounded-md border border-border/70 bg-muted/30 p-3">
              <p className="t-label mb-2">Gross profit to net profit</p>
              <div className="space-y-1.5">
                {bridge.map((b) => {
                  const w = (Math.abs(b.value) / bridgeMax) * 50;
                  const positive = b.value >= 0;
                  return (
                    <div key={b.key} className="grid grid-cols-[minmax(0,8.5rem)_1fr_minmax(0,7.5rem)] items-center gap-2 text-xs">
                      <span className={cn('truncate', b.strong ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{b.label}</span>
                      <div className="relative h-4">
                        <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
                        <div
                          className={cn(
                            'absolute top-0.5 bottom-0.5 rounded-[3px]',
                            b.key === 'net' ? (positive ? 'bg-success' : 'bg-destructive') : positive ? 'bg-success/60' : 'bg-destructive/60',
                          )}
                          style={positive ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }}
                        />
                      </div>
                      <span className={cn('text-right font-mono text-[12px] tabular-nums', b.strong ? 'font-semibold text-foreground' : 'text-foreground')}>{b.display}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Panel>

          {/* Unit economics */}
          <Panel
            className="xl:col-span-5"
            icon={Scale}
            title="Spread per unit"
            description={`What each ${unitLabel} earned, after fees`}
          >
            <div className="divide-y divide-border/70">
              <ValueRow
                label="Avg purchase rate"
                value={hasBuys ? fmtRate(pm.avgPurchaseRate || 0) : fmtRate(pm.carriedPurchaseRate || 0)}
                hint={hasBuys
                  ? `${fmtQty(pm.totalPurchaseQty || 0)} units bought`
                  : pm.carriedFromDate
                    ? `No purchases — carried forward from ${pm.carriedFromDate}`
                    : 'No purchases — cost basis unavailable'}
              />
              <ValueRow
                label="Effective purchase rate"
                value={effState === 'value'
                  ? fmtRate(pm.effectivePurchaseRate as number)
                  : effState === 'carried' ? fmtRate(pm.carriedPurchaseRate as number)
                  : effState === 'unavailable' ? 'Cost basis unavailable'
                  : effState === 'none' ? '—' : 'Fees exceed quantity'}
                tone={effState === 'unavailable' ? 'negative' : effState === 'feesExceed' ? 'warning' : effState === 'none' ? 'muted' : 'default'}
                hint={effState === 'value'
                  ? `Net qty: ${(pm.netPurchaseQty || 0).toFixed(4)} USDT${feeDragPerUnit != null ? ` · fees add ${fmtRate(feeDragPerUnit)} per unit` : ''}`
                  : effState === 'carried' ? `Carried forward from ${pm.carriedFromDate}` : undefined}
                info={
                  <span>
                    Total purchase amount ÷ (quantity bought − USDT fees).<br />
                    Total USDT Fees: {(pm.totalUsdtFees || 0).toFixed(4)} USDT
                    {pm.carriedFromDate && <><br />No stock was bought in this period, so the cost basis is carried forward from the last purchase day ({pm.carriedFromDate}).</>}
                    {pm.costBasisUnavailable && <><br />No purchases in this period and no earlier purchase day exists, so gross profit cannot be derived and is shown as unavailable.</>}
                  </span>
                }
              />
              <ValueRow
                label="Avg sales rate"
                value={fmtRate(pm.avgSalesRate || 0)}
                hint={`${fmtQty(pm.totalSalesQty || 0)} units sold`}
              />
              <ValueRow
                strong
                label="NPM (per unit)"
                value={unavailable ? 'Unavailable' : fmtRate(pm.npm || 0)}
                tone={unavailable ? 'muted' : (pm.npm || 0) >= 0 ? 'positive' : 'negative'}
                hint={carried ? `Avg sales rate − carried purchase rate (${pm.carriedFromDate})` : `Avg sales rate − ${rateUsedLabel}`}
              />
            </div>

            {ladderPoints.length >= 2 && (
              <div className="mt-4" aria-label="Rate ladder">
                <div className="relative h-10">
                  <div className="absolute left-0 right-0 top-5 h-px bg-border" />
                  {costPoint && sellPoint && (
                    <div
                      className={cn('absolute top-[17px] h-[7px] rounded-full', sellPoint.value >= costPoint.value ? 'bg-success/25' : 'bg-destructive/25')}
                      style={{ left: `${Math.min(ladderPos(costPoint.value), ladderPos(sellPoint.value))}%`, width: `${Math.abs(ladderPos(sellPoint.value) - ladderPos(costPoint.value))}%` }}
                    />
                  )}
                  {ladderPoints.map((p, i) => (
                    <div key={p.key} className="absolute top-0 -translate-x-1/2 text-center" style={{ left: `${ladderPos(p.value)}%` }}>
                      <div className={cn('mx-auto mt-[15px] h-[11px] w-[11px] rounded-full border-2 border-card', p.key === 'sell' ? 'bg-success' : p.key === 'eff' ? 'bg-foreground' : 'bg-muted-foreground')} />
                      <span className={cn('absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-muted-foreground', i % 2 === 0 ? '-top-1' : 'top-7')}>
                        {p.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 space-y-2">
              <p className="t-label">Volume in the period</p>
              {assetMode ? (
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">Bought</span><span className="font-mono tabular-nums text-foreground">{fmtQty(pm.totalPurchaseQty || 0)} {boughtUnit}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">Sold (all assets)</span><span className="font-mono tabular-nums text-foreground">{fmtQty(pm.totalSalesQty || 0)} USDT eq.</span></div>
                </div>
              ) : (
                <>
                  {[
                    { key: 'b', label: 'Bought', value: pm.totalPurchaseQty || 0, cls: 'bg-muted-foreground/50' },
                    { key: 's', label: 'Sold', value: pm.totalSalesQty || 0, cls: 'bg-primary/70' },
                  ].map((v) => (
                    <div key={v.key} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-2 text-xs">
                      <span className="text-muted-foreground">{v.label}</span>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className={cn('h-full rounded-full', v.cls)} style={{ width: `${(v.value / volumeMax) * 100}%` }} />
                      </div>
                      <span className="font-mono tabular-nums text-foreground">{fmtQty(v.value)} USDT</span>
                    </div>
                  ))}
                  <p className="pt-1 text-xs text-muted-foreground">
                    Net stock change{' '}
                    <span className="font-mono font-semibold tabular-nums text-foreground">
                      {stockChange > 0 ? '+' : stockChange < 0 ? '−' : ''}{fmtQty(Math.abs(stockChange))} USDT
                    </span>{' '}
                    ({stockChange > 0 ? 'bought more than sold' : stockChange < 0 ? 'sold more than bought' : 'bought as much as sold'})
                  </p>
                </>
              )}
            </div>
          </Panel>
        </div>

        {/* Trades */}
        <Panel
          icon={Activity}
          title="Trades"
          description="All buy and sell transactions within the selected period"
          actions={
            <SegmentedControl
              size="sm"
              aria-label="Trade side"
              value={tradeSide}
              onValueChange={(v) => setTradeSide(v as 'all' | 'Buy' | 'Sell')}
              options={[
                { value: 'all', label: `All ${fmtCount(allTrades.length)}` },
                { value: 'Buy', label: `Buys ${fmtCount(tradeCounts.buys)}` },
                { value: 'Sell', label: `Sells ${fmtCount(tradeCounts.sells)}` },
              ]}
            />
          }
          bodyClassName="p-0 sm:p-0"
        >
          {visibleTrades.length === 0 ? (
            <EmptyState icon={ArrowRightLeft} title="No trades found in the selected period" />
          ) : (
            <div className="px-4 pb-4 pt-2 sm:px-5">
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead className="hidden sm:table-cell">Asset</TableHead>
                    <TableHead className="text-right">Qty (USDT eq.)</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Rate (₹)</TableHead>
                    <TableHead className="text-right">Total (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tradePager.slice.map((entry, idx) => (
                    <ClickableRow
                      key={`${entry.id}-${idx}`}
                      txType={entry.type === 'Buy' ? 'purchase_order' : 'sales_order'}
                      txId={entry.id}
                      className="hover:bg-muted/40"
                      {...rowOpenProps(entry.type === 'Buy' ? 'purchase_order' : 'sales_order', entry.id)}
                    >
                      <TableCell className="whitespace-nowrap text-sm">{entry.date ? format(new Date(entry.date), 'dd MMM yyyy') : '-'}</TableCell>
                      <TableCell>
                        <StatusChip tone={entry.type === 'Buy' ? 'neutral' : 'info'}>{entry.type}</StatusChip>
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{entry.asset}</TableCell>
                      <TableCell className="text-right font-mono text-[13px] tabular-nums">{entry.quantity.toFixed(2)}</TableCell>
                      <TableCell className="hidden text-right font-mono text-[13px] tabular-nums md:table-cell">{entry.rate.toFixed(2)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right font-medium font-mono text-[13px] tabular-nums">{formatCurrency(entry.total)}</TableCell>
                    </ClickableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs">
                <span className="text-muted-foreground">
                  {tradeSide === 'all' ? 'All trades' : tradeSide === 'Buy' ? 'Buys' : 'Sells'} in view
                </span>
                <span className="tabular-nums text-foreground">
                  {fmtQty(visibleTradeTotals.qty)} USDT eq. · <span className="font-semibold">{formatCurrency(visibleTradeTotals.value)}</span>
                </span>
              </div>
              <TablePager {...tradePager} noun="trades" />
            </div>
          )}
        </Panel>

        {/* Expenses & other income */}
        <Panel
          icon={Receipt}
          title="Expenses & other income"
          description="Operational expenses and additional income streams, grouped by head"
          actions={
            <SegmentedControl
              size="sm"
              aria-label="Entry type"
              value={ledgerType}
              onValueChange={(v) => { setLedgerType(v as 'Expense' | 'Income'); setHeadFilter(null); }}
              options={[
                { value: 'Expense', label: `Expenses ${fmtCount(ledgerCounts.expense)}` },
                { value: 'Income', label: `Other income ${fmtCount(ledgerCounts.income)}` },
              ]}
            />
          }
        >
          {allEntries.filter((e) => e.type === ledgerType).length === 0 ? (
            <EmptyState icon={Receipt} title={ledgerType === 'Expense' ? 'No expenses found in the selected period' : 'No other income found in the selected period'} />
          ) : (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="t-label">By head</p>
                  <span className="text-xs text-muted-foreground tabular-nums">{inr(headTotal)}</span>
                </div>
                <div className="space-y-1">
                  {heads.map((h) => {
                    const active = headFilter === h.head;
                    return (
                      <button
                        key={h.head}
                        type="button"
                        onClick={() => setHeadFilter(active ? null : h.head)}
                        aria-pressed={active}
                        className={cn(
                          'w-full rounded-md px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          active ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-muted/60',
                        )}
                      >
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate text-foreground">{h.head}</span>
                          <span className="shrink-0 tabular-nums font-medium text-foreground">{inr(h.amount)}</span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <ShareBar value={h.amount} max={headMax} tone={ledgerType === 'Expense' ? 'negative' : 'positive'} />
                          <span className="w-16 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">
                            {headTotal > 0 ? `${((h.amount / headTotal) * 100).toFixed(1)}%` : '—'} · {h.count}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="min-w-0 lg:col-span-7">
                <div className="mb-2 flex min-h-[1.5rem] flex-wrap items-center justify-between gap-2">
                  <p className="t-label">Entries</p>
                  {headFilter && (
                    <button
                      type="button"
                      onClick={() => setHeadFilter(null)}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[11px] text-foreground hover:bg-muted"
                    >
                      {headFilter}
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <Table density="compact">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Amount (₹)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledgerPager.slice.map((entry) => {
                      const { head, sub } = splitCategory(entry.category);
                      return (
                        <ClickableRow key={entry.id} txType="bank_transaction" txId={entry.id} className="hover:bg-muted/40" {...rowOpenProps('bank_transaction', entry.id)}>
                          <TableCell className="whitespace-nowrap align-top text-sm">{format(new Date(entry.date), 'dd MMM yyyy')}</TableCell>
                          <TableCell className="align-top">
                            <p className="text-sm text-foreground">{sub || head}</p>
                            <p className="text-xs text-muted-foreground">
                              {sub ? head : null}{sub && entry.description ? ' · ' : ''}{entry.description || (sub ? '' : '-')}
                            </p>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right align-top font-mono text-[13px] tabular-nums">
                            <span className={entry.type === 'Expense' ? 'text-destructive' : 'text-success'}>
                              {entry.type === 'Expense' ? '−' : '+'}{formatCurrency(entry.amount)}
                            </span>
                          </TableCell>
                        </ClickableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <TablePager {...ledgerPager} noun="entries" />
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* Gross Profit History */}
      <GrossProfitHistoryTab />
    </div>
  );
}
