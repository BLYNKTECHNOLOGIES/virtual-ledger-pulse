import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { usePermissions } from "@/hooks/usePermissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { openTransaction } from "@/components/transaction-detail";
import { TerminalSalesApprovalDialog } from "@/components/sales/TerminalSalesApprovalDialog";
import { TerminalPurchaseApprovalDialog } from "@/components/purchase/TerminalPurchaseApprovalDialog";
import { format, subDays, startOfDay, endOfDay, subMonths, startOfMonth, endOfMonth } from "date-fns";
import {
  Users, TrendingUp, TrendingDown, ArrowUpRight, Package, DollarSign,
  Clock, FileText, Activity, Zap, Calendar, ShoppingCart, CreditCard,
  UserCheck, PieChart, BarChart3, Bell
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart as RechartsLineChart, Line, PieChart as RechartsPieChart, Pie, Cell } from "recharts";
import { chartSeriesColors, axisProps, tooltipProps, gridProps, chartColor } from "@/lib/dashboard/chartTheme";
import { WidgetSkeleton, WidgetEmpty, WidgetError } from "@/components/dashboard/primitives/WidgetShell";
import {
  WidgetMetric,
  WidgetList,
  WidgetListRow,
  WidgetStatGrid,
  WidgetProgressRow,
  WidgetStatus,
  WidgetChart,
} from "@/components/dashboard/primitives/WidgetAtoms";

// Categorical series palette resolved from design tokens (never raw hex).
const COLORS = chartSeriesColors();

const PAYOUT_GATEWAY_FEE_CATEGORY = 'Finance, Banking & Compliance > Payout Gateway Fee';

const normalizeExpenseCategory = (category?: string | null, description?: string | null) => {
  const descriptionText = String(description || '').toLowerCase();
  if (category === PAYOUT_GATEWAY_FEE_CATEGORY || descriptionText.includes('payout gateway fee')) {
    return 'Payout Gateway Fee';
  }
  return category || 'Uncategorized';
};

// ── Customer Growth Widget ──
export function CustomerGrowthWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['widget_customer_growth'],
    queryFn: async () => {
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const d = subMonths(new Date(), i);
        months.push({ label: format(d, 'MMM'), start: startOfDay(new Date(d.getFullYear(), d.getMonth(), 1)).toISOString(), end: endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0)).toISOString() });
      }
      const results = await Promise.all(months.map(async m => {
        const { count } = await supabase.from('clients').select('id', { count: 'exact', head: true }).lte('created_at', m.end);
        return { name: m.label, clients: count || 0 };
      }));
      return results;
    },
    staleTime: 60000,
  });

  if (isLoading) return <WidgetSkeleton variant="chart" />;
  const growth = data && data.length >= 2 ? ((data[data.length - 1].clients - data[data.length - 2].clients) / (data[data.length - 2].clients || 1) * 100) : 0;

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <WidgetMetric
        label="Total clients"
        value={data?.[data.length - 1]?.clients || 0}
        size="sm"
        delta={growth}
        helper="this month"
      />
      <WidgetChart height={120}>
        <RechartsLineChart data={data || []} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="name" {...axisProps} />
          <Tooltip {...tooltipProps} />
          <Line type="monotone" dataKey="clients" stroke={chartColor.primary()} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
        </RechartsLineChart>
      </WidgetChart>
    </div>
  );
}

// ── Recent Orders Widget ──
export function RecentOrdersWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['widget_recent_orders'],
    queryFn: async () => {
      const { data } = await supabase.from('sales_orders').select('id, order_number, client_name, total_amount, status, created_at').order('created_at', { ascending: false }).limit(5);
      return data || [];
    },
    refetchInterval: 30000,
  });

  if (isLoading) return <WidgetSkeleton variant="list" rows={5} />;

  const orders = data || [];
  if (orders.length === 0) return <WidgetEmpty icon={ShoppingCart} title="No recent orders" />;

  return (
    <div className="p-1.5">
      <WidgetList>
        {orders.map((o: any) => (
          <WidgetListRow
            key={o.id}
            icon={ShoppingCart}
            iconTone="primary"
            title={o.order_number}
            subtitle={`${o.client_name} · ${format(new Date(o.created_at), 'MMM dd')}`}
            value={`₹${Math.round(Number(o.total_amount)).toLocaleString('en-IN')}`}
            meta={o.status || 'Pending'}
            onClick={() => openTransaction({ type: 'sales_order', id: o.id })}
          />
        ))}
      </WidgetList>
    </div>
  );
}

// ── Daily Activity Widget ──
export function DailyActivityWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['widget_daily_activity'],
    queryFn: async () => {
      const today = new Date();
      const start = startOfDay(today).toISOString();
      const end = endOfDay(today).toISOString();
      const [{ count: salesCount }, { count: purchaseCount }, { count: newClients }] = await Promise.all([
        supabase.from('sales_orders').select('id', { count: 'exact', head: true }).gte('created_at', start).lte('created_at', end),
        supabase.from('purchase_orders').select('id', { count: 'exact', head: true }).gte('created_at', start).lte('created_at', end),
        supabase.from('clients').select('id', { count: 'exact', head: true }).gte('created_at', start).lte('created_at', end),
      ]);
      return { sales: salesCount || 0, purchases: purchaseCount || 0, newClients: newClients || 0 };
    },
    refetchInterval: 30000,
  });

  if (isLoading) return <WidgetSkeleton variant="stats" />;

  return (
    <div className="p-3">
      <WidgetStatGrid
        columns={3}
        items={[
          { label: 'Sales today', value: data?.sales || 0, tone: 'success' },
          { label: 'Purchases', value: data?.purchases || 0, tone: 'primary' },
          { label: 'New clients', value: data?.newClients || 0, tone: 'warning' },
        ]}
      />
    </div>
  );
}

// ── Quick Stats Widget ──
export function QuickStatsWidget({ metrics, dateRange }: { metrics?: any; dateRange?: { from?: Date; to?: Date } }) {
  const fromISO = dateRange?.from ? startOfDay(dateRange.from).toISOString() : undefined;
  const toISO = dateRange?.to ? endOfDay(dateRange.to).toISOString() : undefined;

  const { data, isLoading } = useQuery({
    queryKey: ['widget_quick_stats', fromISO, toISO],
    queryFn: async () => {
      let salesQuery = supabase.from('sales_orders').select('id', { count: 'exact', head: true });
      let purchaseQuery = supabase.from('purchase_orders').select('id', { count: 'exact', head: true });
      const verifiedQuery = supabase.from('clients').select('id', { count: 'exact', head: true }).eq('kyc_status', 'VERIFIED');
      const totalQuery = supabase.from('clients').select('id', { count: 'exact', head: true });

      if (fromISO && toISO) {
        salesQuery = salesQuery.gte('created_at', fromISO).lte('created_at', toISO);
        purchaseQuery = purchaseQuery.gte('created_at', fromISO).lte('created_at', toISO);
      }

      const [salesRes, purchaseRes, verifiedRes, totalRes] = await Promise.all([
        salesQuery, purchaseQuery, verifiedQuery, totalQuery,
      ]);
      return {
        orders: salesRes.count || 0,
        purchases: purchaseRes.count || 0,
        verifiedClients: verifiedRes.count || 0,
        totalClients: totalRes.count || 0,
      };
    },
    staleTime: 60000,
  });

  if (isLoading) return <WidgetSkeleton variant="stats" />;

  const stats = data || { orders: 0, purchases: 0, verifiedClients: 0, totalClients: 0 };

  return (
    <div className="p-3">
      <WidgetStatGrid
        columns={4}
        items={[
          { label: 'Orders', value: stats.orders.toLocaleString('en-IN') },
          { label: 'Verified clients', value: stats.verifiedClients.toLocaleString('en-IN'), tone: 'success' },
          { label: 'Total clients', value: stats.totalClients.toLocaleString('en-IN'), tone: 'primary' },
          { label: 'Purchases', value: stats.purchases.toLocaleString('en-IN'), tone: 'warning' },
        ]}
      />
    </div>
  );
}

// ── Expense Breakdown Widget (bank transactions by category) ──
export function ExpenseBreakdownWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['widget_expense_breakdown'],
    queryFn: async () => {
      const now = new Date();
      const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
      const { data } = await supabase
        .from('bank_transactions')
        .select('category, amount, description, transaction_date')
        .eq('transaction_type', 'EXPENSE')
        .gte('transaction_date', monthStart)
        .lte('transaction_date', monthEnd)
        .order('transaction_date', { ascending: false });
      const excludeCategories = ['Purchase', 'OPENING_BALANCE', 'ADJUSTMENT'];
      const catMap: Record<string, number> = {};
      (data || []).forEach((t: any) => {
        const cat = normalizeExpenseCategory(t.category, t.description);
        if (excludeCategories.includes(cat)) return;
        catMap[cat] = (catMap[cat] || 0) + Math.abs(Number(t.amount));
      });
      const categories = Object.entries(catMap).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 8);
      const totalExpense = Object.values(catMap).reduce((s, v) => s + v, 0);
      const recentItems = (data || []).filter((t: any) => !excludeCategories.includes(normalizeExpenseCategory(t.category, t.description))).slice(0, 5).map((t: any) => ({
        desc: t.description || t.category || 'Expense',
        amount: Math.abs(Number(t.amount)),
        date: t.transaction_date,
      }));
      return { categories, totalExpense, recentItems, month: format(now, 'MMMM yyyy') };
    },
    staleTime: 60000,
  });

  const navigate = useNavigate();

  if (isLoading) return <WidgetSkeleton variant="status" rows={5} />;

  const hasData = (data?.categories?.length || 0) > 0;

  return (
    <div
      className="flex h-full cursor-pointer flex-col"
      onClick={() => navigate('/statistics?tab=financial')}
      title="Open financial statistics"
    >
      <div className="border-b border-border px-3 py-2.5">
        <WidgetMetric
          label={data?.month}
          value={`₹${Math.round(data?.totalExpense || 0).toLocaleString('en-IN')}`}
          size="sm"
          helper="Operating expenses this month"
        />
      </div>
      {!hasData ? (
        <WidgetEmpty icon={PieChart} title="No expenses this month" />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="space-y-2">
            {data!.categories.map((e, i) => (
              <WidgetProgressRow
                key={e.name}
                label={e.name}
                value={`₹${Math.round(e.amount).toLocaleString('en-IN')}`}
                percent={data!.totalExpense > 0 ? (e.amount / data!.totalExpense) * 100 : 0}
                tone="primary"
                leading={
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                }
              />
            ))}
          </div>
          {(data?.recentItems?.length || 0) > 0 && (
            <div className="mt-3 border-t border-border pt-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Recent
              </p>
              {data!.recentItems.map((item, i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-1 text-[12px]">
                  <span className="min-w-0 truncate text-muted-foreground">{item.desc}</span>
                  <span className="shrink-0 font-medium tabular-nums text-foreground">
                    ₹{Math.round(item.amount).toLocaleString('en-IN')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Revenue Chart Widget (daily sales revenue for last 7 days) ──
export function RevenueChartWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['widget_revenue_chart'],
    queryFn: async () => {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = subDays(new Date(), i);
        days.push({ label: format(d, 'EEE'), date: format(d, 'yyyy-MM-dd') });
      }

      const orders = await fetchAllPaginated<any>(() =>
        supabase
          .from('sales_orders')
          .select('order_date, total_amount')
          .gte('order_date', days[0].date)
          .lte('order_date', days[days.length - 1].date));



      const dayMap: Record<string, { revenue: number; count: number }> = {};
      days.forEach((d) => {
        dayMap[d.date] = { revenue: 0, count: 0 };
      });

      (orders || []).forEach((o: any) => {
        if (!dayMap[o.order_date]) return;
        dayMap[o.order_date].revenue += Number(o.total_amount || 0);
        dayMap[o.order_date].count += 1;
      });

      const chartData = days.map((d) => ({
        name: d.label,
        revenue: dayMap[d.date].revenue,
        orders: dayMap[d.date].count,
      }));

      const totalRevenue = chartData.reduce((s, d) => s + d.revenue, 0);
      const totalOrders = chartData.reduce((s, d) => s + d.orders, 0);
      const todayRevenue = chartData[chartData.length - 1]?.revenue || 0;

      return {
        chartData,
        totalRevenue,
        totalOrders,
        todayRevenue,
        avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      };
    },
    staleTime: 60000,
    refetchInterval: 60000,
  });

  if (isLoading) return <WidgetSkeleton variant="chart" />;

  const hasData = (data?.totalRevenue || 0) > 0;

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <WidgetStatGrid
        columns={3}
        items={[
          { label: '7D revenue', value: `₹${Math.round(data?.totalRevenue || 0).toLocaleString('en-IN')}` },
          { label: 'Today', value: `₹${Math.round(data?.todayRevenue || 0).toLocaleString('en-IN')}` },
          { label: 'Avg / order', value: `₹${Math.round(data?.avgOrderValue || 0).toLocaleString('en-IN')}` },
        ]}
      />
      {hasData ? (
        <WidgetChart height={140}>
          <BarChart data={data?.chartData || []} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="name" {...axisProps} />
            <YAxis {...axisProps} width={44} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
            <Tooltip {...tooltipProps} formatter={(v: any) => `₹${Math.round(Number(v)).toLocaleString('en-IN')}`} />
            <Bar dataKey="revenue" fill={chartColor.success()} radius={[4, 4, 0, 0]} />
          </BarChart>
        </WidgetChart>
      ) : (
        <WidgetEmpty icon={BarChart3} title="No sales revenue in last 7 days" />
      )}
    </div>
  );
}

// ── Earnings Rate Widget (daily sales for last 7 days) ──
export function EarningsRateWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['widget_earnings_rate'],
    queryFn: async () => {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = subDays(new Date(), i);
        days.push({ label: format(d, 'EEE'), date: format(d, 'yyyy-MM-dd') });
      }
      const results = await Promise.all(days.map(async day => {
        const { data } = await supabase
          .from('sales_orders')
          .select('total_amount')
          .eq('status', 'COMPLETED')
          .eq('order_date', day.date);
        const total = (data || []).reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0);
        return { name: day.label, amount: total };
      }));
      return results;
    },
    staleTime: 60000,
  });

  if (isLoading) return <WidgetSkeleton variant="chart" />;
  const todayEarnings = data?.[data.length - 1]?.amount || 0;
  const weekTotal = (data || []).reduce((s, d) => s + d.amount, 0);

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <WidgetMetric
        label="Today's sales"
        value={`₹${Math.round(todayEarnings).toLocaleString('en-IN')}`}
        tone="primary"
        size="sm"
        helper={`₹${Math.round(weekTotal).toLocaleString('en-IN')} last 7 days`}
      />
      <WidgetChart height={90}>
        <BarChart data={data || []} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <XAxis dataKey="name" {...axisProps} />
          <Tooltip {...tooltipProps} formatter={(v: any) => `₹${Math.round(Number(v)).toLocaleString('en-IN')}`} />
          <Bar dataKey="amount" fill={chartColor.primary()} radius={[3, 3, 0, 0]} />
        </BarChart>
      </WidgetChart>
    </div>
  );
}

// ── Profit Margin Widget ──
export function ProfitMarginWidget({ dateRange }: { dateRange?: { from?: Date; to?: Date } }) {
  const { data, isLoading } = useQuery({
    queryKey: ['widget_profit_margin', dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async () => {
      const now = new Date();
      const periodStart = dateRange?.from ? startOfDay(dateRange.from) : startOfDay(subDays(now, 30));
      const periodEnd = dateRange?.to ? endOfDay(dateRange.to) : endOfDay(now);
      const start = periodStart.toISOString();
      const end = periodEnd.toISOString();

      const fetchAllAmounts = async (table: 'sales_orders' | 'purchase_orders') => {
        let allData: any[] = [];
        let from = 0;
        const batchSize = 1000;
        while (true) {
          const { data: batch } = await supabase
            .from(table)
            .select('total_amount')
            .gte('created_at', start)
            .lte('created_at', end)
            .eq('status', 'COMPLETED')
            .range(from, from + batchSize - 1);
          if (!batch || batch.length === 0) break;
          allData = allData.concat(batch);
          if (batch.length < batchSize) break;
          from += batchSize;
        }
        return allData;
      };

      const [sales, purchases] = await Promise.all([
        fetchAllAmounts('sales_orders'),
        fetchAllAmounts('purchase_orders'),
      ]);

      const totalSales = sales.reduce((s, o: any) => s + Number(o.total_amount || 0), 0);
      const totalPurchases = purchases.reduce((s, o: any) => s + Number(o.total_amount || 0), 0);
      const profit = totalSales - totalPurchases;
      const margin = totalSales > 0 ? (profit / totalSales * 100) : 0;
      const periodLabel = dateRange?.from ? `${format(periodStart, 'dd MMM')} - ${format(periodEnd, 'dd MMM')}` : 'Last 30d';
      return { margin: margin.toFixed(1), totalSales, totalPurchases, profit, periodLabel };
    },
    staleTime: 60000,
  });

  if (isLoading) return <WidgetSkeleton variant="metric" />;

  const positive = Number(data?.margin) >= 0;

  return (
    <div className="flex h-full flex-col justify-center gap-3 p-3">
      <WidgetMetric
        label={`Profit margin · ${data?.periodLabel || ''}`}
        value={`${data?.margin}%`}
        tone={positive ? 'success' : 'destructive'}
        size="lg"
        helper={`Profit ₹${Math.round(data?.profit || 0).toLocaleString('en-IN')}`}
      />
      <WidgetStatGrid
        columns={2}
        items={[
          { label: 'Sales', value: `₹${Math.round(data?.totalSales || 0).toLocaleString('en-IN')}` },
          { label: 'Purchases', value: `₹${Math.round(data?.totalPurchases || 0).toLocaleString('en-IN')}` },
        ]}
      />
    </div>
  );
}

// ── Performance Overview Widget ──
export function PerformanceOverviewWidget({ metrics, dateRange }: { metrics?: any; dateRange?: { from?: Date; to?: Date } }) {
  const { data, isLoading } = useQuery({
    queryKey: ['widget_performance_overview_v3', dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async () => {
      const now = new Date();
      const periodStart = dateRange?.from ? startOfDay(dateRange.from) : startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
      const periodEnd = dateRange?.to ? endOfDay(dateRange.to) : endOfDay(now);
      const startStr = format(periodStart, 'yyyy-MM-dd');
      const endStr = format(periodEnd, 'yyyy-MM-dd');

      // Previous period of equal length
      const periodMs = periodEnd.getTime() - periodStart.getTime();
      const prevEnd = new Date(periodStart.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - periodMs);
      const prevStartStr = format(prevStart, 'yyyy-MM-dd');
      const prevEndStr = format(prevEnd, 'yyyy-MM-dd');

      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

      // Excluded legacy non-USDT orders (same as P&L)
      const excludedOrderIds = [
        '1fd66952-bf77-4bf4-a183-4c0fbc34510f',
        '937f087e-6b2a-4328-a2dd-0166e0682c5b',
        '4f90519e-6d47-43c4-8206-9278927c788f',
      ];

      // Fetch current & previous period data in parallel.
      // NOTE: Gross profit uses the SAME realized-P&L methodology as ProfitLoss.tsx
      // (the source of truth): normalized USDT-equivalent sales/purchase values
      // (effective_usdt_qty/rate) and NPM = avgSalesRate − effectivePurchaseRate.
      // The previous implementation summed raw purchase_order_items quantities and
      // INR unit_prices across mixed assets (USDT, BTC, ETH…), which corrupted the
      // average purchase rate and could make gross profit negative even when every
      // trade was profitable.
      const [
        thisSales,
        lastSales,
        thisPurchaseOrders,
        lastPurchaseOrders,
        thisFeeDeductions,
        lastFeeDeductions,
        thisConvFees,
        lastConvFees,
        thisTransferFees,
        lastTransferFees,
        { count: totalClients },
        { count: activeClients },
      ] = await Promise.all([
        fetchAllPaginated<any>(() => supabase.from('sales_orders').select('quantity, price_per_unit, effective_usdt_qty, effective_usdt_rate').eq('status', 'COMPLETED').gte('order_date', startStr).lte('order_date', endStr)),
        fetchAllPaginated<any>(() => supabase.from('sales_orders').select('quantity, price_per_unit, effective_usdt_qty, effective_usdt_rate').eq('status', 'COMPLETED').gte('order_date', prevStartStr).lte('order_date', prevEndStr)),
        fetchAllPaginated<any>(() => supabase.from('purchase_orders').select('id, total_amount, effective_usdt_qty').eq('status', 'COMPLETED').gte('order_date', startStr).lte('order_date', endStr)),
        fetchAllPaginated<any>(() => supabase.from('purchase_orders').select('id, total_amount, effective_usdt_qty').eq('status', 'COMPLETED').gte('order_date', prevStartStr).lte('order_date', prevEndStr)),
        // USDT fees (same authoritative sources as ProfitLoss.tsx)
        fetchAllPaginated<any>(() => supabase.from('wallet_fee_deductions').select('fee_usdt_amount').gte('created_at', startStr).lte('created_at', endStr + 'T23:59:59')),
        fetchAllPaginated<any>(() => supabase.from('wallet_fee_deductions').select('fee_usdt_amount').gte('created_at', prevStartStr).lte('created_at', prevEndStr + 'T23:59:59')),
        fetchAllPaginated<any>(() => supabase.from('erp_product_conversions').select('fee_amount').eq('status', 'APPROVED').gte('approved_at', startStr).lte('approved_at', endStr + 'T23:59:59')),
        fetchAllPaginated<any>(() => supabase.from('erp_product_conversions').select('fee_amount').eq('status', 'APPROVED').gte('approved_at', prevStartStr).lte('approved_at', prevEndStr + 'T23:59:59')),
        fetchAllPaginated<any>(() => supabase.from('wallet_transactions').select('amount').eq('transaction_type', 'DEBIT').eq('reference_type', 'TRANSFER_FEE').eq('asset_code', 'USDT').gte('created_at', startStr).lte('created_at', endStr + 'T23:59:59')),
        fetchAllPaginated<any>(() => supabase.from('wallet_transactions').select('amount').eq('transaction_type', 'DEBIT').eq('reference_type', 'TRANSFER_FEE').eq('asset_code', 'USDT').gte('created_at', prevStartStr).lte('created_at', prevEndStr + 'T23:59:59')),
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('is_deleted', false),
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('is_deleted', false).gte('created_at', thirtyDaysAgo),
      ]);

      // Sum USDT fees from the three authoritative sources (matches ProfitLoss.tsx)
      const sumFees = (
        deductions: any[] | null,
        conversions: any[] | null,
        transfers: any[] | null,
      ) =>
        (deductions || []).reduce((s: number, f: any) => s + Number(f.fee_usdt_amount || 0), 0) +
        (conversions || []).reduce((s: number, f: any) => s + Number(f.fee_amount || 0), 0) +
        (transfers || []).reduce((s: number, f: any) => s + Number(f.amount || 0), 0);

      const thisTotalFees = sumFees(thisFeeDeductions, thisConvFees, thisTransferFees);
      const lastTotalFees = sumFees(lastFeeDeductions, lastConvFees, lastTransferFees);

      // Helper: compute gross profit using the ProfitLoss.tsx realized-P&L method.
      // Values are normalized to USDT-equivalent so multi-asset trades compare
      // like-for-like. Gross profit = (avgSalesRate − effectivePurchaseRate) × salesQty.
      const computeGrossProfit = (
        salesData: any[] | null,
        purchaseOrders: any[] | null,
        totalFees: number,
      ) => {
        const sales = salesData || [];
        const totalSalesValue = sales.reduce(
          (s: number, o: any) =>
            s + Number(o.effective_usdt_qty || o.quantity || 0) * Number(o.effective_usdt_rate || o.price_per_unit || 0),
          0,
        );
        const totalSalesQty = sales.reduce(
          (s: number, o: any) => s + Number(o.effective_usdt_qty || o.quantity || 0),
          0,
        );
        const avgSalesRate = totalSalesQty > 0 ? totalSalesValue / totalSalesQty : 0;

        // Purchases: use normalized effective_usdt_qty and total_amount straight
        // from purchase_orders (same as ProfitLoss.tsx "All Assets" mode).
        let totalPurchaseValue = 0;
        let totalPurchaseQty = 0;
        (purchaseOrders || [])
          .filter((po: any) => !excludedOrderIds.includes(po.id))
          .forEach((po: any) => {
            const effQty = Number(po.effective_usdt_qty || 0);
            if (effQty > 0) {
              totalPurchaseQty += effQty;
              totalPurchaseValue += Number(po.total_amount || 0);
            }
          });

        const avgPurchaseRate = totalPurchaseQty > 0 ? totalPurchaseValue / totalPurchaseQty : 0;
        // Effective purchase rate adjusts qty down by USDT fees consumed
        const netPurchaseQty = totalPurchaseQty - totalFees;
        const effectivePurchaseRate =
          totalPurchaseQty > 0 && netPurchaseQty > 0 ? totalPurchaseValue / netPurchaseQty : avgPurchaseRate;

        // NPM-based gross profit (matching P&L)
        const npm = avgSalesRate - effectivePurchaseRate;
        const grossProfit = npm * totalSalesQty;
        const profitMargin = totalSalesValue > 0 ? (grossProfit / totalSalesValue) * 100 : 0;

        return { totalSalesValue, totalSalesQty, grossProfit, profitMargin };
      };


      const thisResult = computeGrossProfit(thisSales, thisPurchaseOrders as any, thisTotalFees);
      const lastResult = computeGrossProfit(lastSales, lastPurchaseOrders as any, lastTotalFees);

      const revenueGrowth = lastResult.totalSalesValue > 0
        ? ((thisResult.totalSalesValue - lastResult.totalSalesValue) / lastResult.totalSalesValue) * 100 : 0;

      return {
        thisSalesTotal: thisResult.totalSalesValue,
        thisGrossProfit: thisResult.grossProfit,
        lastGrossProfit: lastResult.grossProfit,
        profitMargin: thisResult.profitMargin,
        revenueGrowth,
        thisSalesQty: thisResult.totalSalesQty,
        lastSalesQty: lastResult.totalSalesQty,
        orderCount: (thisSales || []).length,
        totalClients: totalClients || 0,
        newClients: activeClients || 0,
      };
    },
    staleTime: 60000,
  });

  if (isLoading) return <WidgetLoader />;

  // For MoM growth on gross profit, use absolute value of last period as denominator
  // to avoid misleading percentages when base is negative or near-zero
  const lastGP = data?.lastGrossProfit || 0;
  const thisGP = data?.thisGrossProfit || 0;
  const gpDenominator = Math.abs(lastGP);
  const profitGrowth = gpDenominator > 0
    ? (((thisGP - lastGP) / gpDenominator) * 100).toFixed(1)
    : (thisGP !== 0 ? (thisGP > 0 ? '100.0' : '-100.0') : '0.0');

  const kpis = [
    {
      label: 'Revenue',
      value: `₹${((data?.thisSalesTotal || 0) / 100000).toFixed(1)}L`,
      change: data?.revenueGrowth || 0,
      color: 'text-info',
      bgColor: 'bg-info/10',
    },
    {
      label: 'Gross Profit',
      value: `₹${((data?.thisGrossProfit || 0) / 100000).toFixed(1)}L`,
      change: Number(profitGrowth),
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
    {
      label: 'Profit Margin',
      value: `${(data?.profitMargin || 0).toFixed(1)}%`,
      change: null,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      label: 'Volume Traded',
      value: `${((data?.thisSalesQty || 0)).toLocaleString('en-IN', { maximumFractionDigits: 0 })} USDT`,
      change: (data?.lastSalesQty || 0) > 0 ? (((data?.thisSalesQty || 0) - (data?.lastSalesQty || 0)) / (data?.lastSalesQty || 1)) * 100 : null,
      color: 'text-warning',
      bgColor: 'bg-warning/10',
    },
  ];

  const toneOf = (label: string) =>
    label === 'Gross Profit' ? 'success' : label === 'Profit Margin' ? 'primary' : label === 'Volume Traded' ? 'warning' : 'neutral';

  return (
    <div className="flex h-full flex-col p-3">
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 @[22rem]:grid-cols-2">
        {kpis.map((kpi) => (
          <WidgetMetric
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            tone={toneOf(kpi.label) as any}
            size="sm"
            delta={kpi.change}
            helper={kpi.change !== null ? 'MoM' : undefined}
          />
        ))}
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
        <span>{data?.orderCount || 0} orders this period</span>
        <span>{data?.totalClients || 0} clients · {data?.newClients || 0} new in 30d</span>
      </div>
    </div>
  );
}

// ── Conversion Rate Widget ──
export function ConversionRateWidget({ metrics }: { metrics?: any }) {
  const pct = metrics?.totalClients > 0 ? (metrics.verifiedClients / metrics.totalClients) * 100 : 0;
  return (
    <div className="flex h-full flex-col justify-center gap-3 p-3">
      <WidgetMetric
        label="KYC conversion rate"
        value={`${pct.toFixed(1)}%`}
        tone="primary"
        size="lg"
        helper={`${metrics?.verifiedClients || 0} verified of ${metrics?.totalClients || 0}`}
      />
      <WidgetProgressRow label="Verified clients" value={`${pct.toFixed(1)}%`} percent={pct} tone="primary" />
    </div>
  );
}

// ── Growth Rate Widget ──
export function GrowthRateWidget({ dateRange }: { dateRange?: { from?: Date; to?: Date } }) {
  const { data, isLoading } = useQuery({
    queryKey: ['widget_growth_rate', dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async () => {
      const now = new Date();
      const periodStart = dateRange?.from ? startOfDay(dateRange.from) : startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
      const periodEnd = dateRange?.to ? endOfDay(dateRange.to) : endOfDay(now);
      const startStr = format(periodStart, 'yyyy-MM-dd');
      const endStr = format(periodEnd, 'yyyy-MM-dd');

      const periodMs = periodEnd.getTime() - periodStart.getTime();
      const prevEnd = new Date(periodStart.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - periodMs);
      const prevStartStr = format(prevStart, 'yyyy-MM-dd');
      const prevEndStr = format(prevEnd, 'yyyy-MM-dd');

      const [currentSales, previousSales] = await Promise.all([
        fetchAllPaginated<any>(() => supabase.from('sales_orders').select('total_amount').eq('status', 'COMPLETED').gte('order_date', startStr).lte('order_date', endStr)),
        fetchAllPaginated<any>(() => supabase.from('sales_orders').select('total_amount').eq('status', 'COMPLETED').gte('order_date', prevStartStr).lte('order_date', prevEndStr)),
      ]);

      const currentTotal = (currentSales || []).reduce((s, o: any) => s + Number(o.total_amount || 0), 0);
      const previousTotal = (previousSales || []).reduce((s, o: any) => s + Number(o.total_amount || 0), 0);
      const growth = previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : 0;
      const periodLabel = dateRange?.from ? `${format(periodStart, 'dd MMM')} - ${format(periodEnd, 'dd MMM')}` : 'This Month';

      return { growth: growth.toFixed(1), currentTotal, previousTotal, periodLabel };
    },
    staleTime: 60000,
  });

  if (isLoading) return <WidgetSkeleton variant="metric" />;
  const growth = Number(data?.growth || 0);
  const isPositive = growth >= 0;

  return (
    <div className="flex h-full flex-col justify-center gap-3 p-3">
      <WidgetMetric
        label={`Revenue growth · ${data?.periodLabel || ''}`}
        value={`${isPositive ? '+' : ''}${data?.growth}%`}
        tone={isPositive ? 'success' : 'destructive'}
        size="lg"
        helper="vs previous period"
      />
      <WidgetStatGrid
        columns={2}
        items={[
          { label: 'This period', value: `₹${Math.round(data?.currentTotal || 0).toLocaleString('en-IN')}` },
          { label: 'Previous', value: `₹${Math.round(data?.previousTotal || 0).toLocaleString('en-IN')}` },
        ]}
      />
    </div>
  );
}

// ── Cash Flow Widget ──
// Income = Gross Profit from PNL (daily_gross_profit_history), Expense = operational bank expenses
export function CashFlowWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['widget_cash_flow_pnl'],
    queryFn: async () => {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = subDays(new Date(), i);
        days.push({ label: format(d, 'EEE'), date: format(d, 'yyyy-MM-dd') });
      }

      // Fetch gross profit (income) from daily_gross_profit_history
      const { data: gpData } = await supabase
        .from('daily_gross_profit_history')
        .select('snapshot_date, gross_profit')
        .gte('snapshot_date', days[0].date)
        .lte('snapshot_date', days[days.length - 1].date);

      // Fetch expenses from bank_transactions
      const { data: txns } = await supabase
        .from('bank_transactions')
        .select('amount, transaction_type, transaction_date, category, description')
        .eq('transaction_type', 'EXPENSE')
        .gte('transaction_date', days[0].date)
        .lte('transaction_date', days[days.length - 1].date);

      const dayMap: Record<string, { income: number; expense: number }> = {};
      days.forEach(d => { dayMap[d.date] = { income: 0, expense: 0 }; });

      // Map gross profit as income
      (gpData || []).forEach((gp: any) => {
        const entry = dayMap[gp.snapshot_date];
        if (entry) entry.income += Math.max(0, Number(gp.gross_profit) || 0);
      });

      // Map operational expenses (excluding Purchase, OPENING_BALANCE, ADJUSTMENT)
      const excludeExpenseCats = ['Purchase', 'OPENING_BALANCE', 'ADJUSTMENT'];
      (txns || []).forEach((t: any) => {
        const entry = dayMap[t.transaction_date];
        if (!entry) return;
        if (!excludeExpenseCats.includes(normalizeExpenseCategory(t.category, t.description))) {
          entry.expense += Math.abs(Number(t.amount));
        }
      });

      const chartData = days.map(d => ({ name: d.label, income: dayMap[d.date].income, expense: dayMap[d.date].expense }));
      const totalIncome = chartData.reduce((s, d) => s + d.income, 0);
      const totalExpense = chartData.reduce((s, d) => s + d.expense, 0);
      return { chartData, totalIncome, totalExpense, net: totalIncome - totalExpense };
    },
    staleTime: 60000,
  });

  if (isLoading) return <WidgetSkeleton variant="chart" />;

  const hasData = (data?.totalIncome || 0) > 0 || (data?.totalExpense || 0) > 0;
  const net = data?.net || 0;

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <WidgetStatGrid
        columns={3}
        items={[
          { label: 'Gross profit', value: `₹${((data?.totalIncome || 0) / 1000).toFixed(1)}k`, tone: 'success' },
          { label: 'Expense', value: `₹${((data?.totalExpense || 0) / 1000).toFixed(1)}k`, tone: 'destructive' },
          { label: 'Net', value: `${net >= 0 ? '+' : ''}₹${(net / 1000).toFixed(1)}k`, tone: net >= 0 ? 'success' : 'destructive' },
        ]}
      />
      {hasData ? (
        <WidgetChart height={140}>
          <BarChart data={data?.chartData || []} margin={{ top: 4, right: 4, bottom: 0, left: -12 }} barGap={2}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="name" {...axisProps} />
            <YAxis {...axisProps} width={44} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
            <Tooltip {...tooltipProps} formatter={(v: any) => `₹${Math.round(Number(v)).toLocaleString('en-IN')}`} />
            <Bar dataKey="income" fill={chartColor.success()} radius={[3, 3, 0, 0]} name="Gross Profit" />
            <Bar dataKey="expense" fill={chartColor.destructive()} radius={[3, 3, 0, 0]} name="Expense" />
          </BarChart>
        </WidgetChart>
      ) : (
        <WidgetEmpty icon={BarChart3} title="No data in last 7 days" />
      )}
    </div>
  );
}

// ── Expense Trends Widget ──
export function ExpenseTrendsWidget() {
  const [viewMode, setViewMode] = useState<'month' | 'day'>('month');

  const { data, isLoading } = useQuery({
    queryKey: ['widget_expense_trends', viewMode],
    queryFn: async () => {
      const excludeCategories = ['Purchase', 'OPENING_BALANCE', 'ADJUSTMENT'];

      if (viewMode === 'month') {
        const months = [];
        for (let i = 5; i >= 0; i--) {
          const d = subMonths(new Date(), i);
          const s = format(startOfMonth(d), 'yyyy-MM-dd');
          const e = format(endOfMonth(d), 'yyyy-MM-dd');
          months.push({ label: format(d, 'MMM'), start: s, end: e });
        }
        const results = await Promise.all(months.map(async m => {
          const data = await fetchAllPaginated<any>(() => supabase.from('bank_transactions').select('amount, category, description').eq('transaction_type', 'EXPENSE').gte('transaction_date', m.start).lte('transaction_date', m.end));
          const total = (data || []).filter((t: any) => !excludeCategories.includes(normalizeExpenseCategory(t.category, t.description))).reduce((s: number, t: any) => s + Math.abs(Number(t.amount)), 0);
          return { name: m.label, expense: total };
        }));
        const currentMonth = results[results.length - 1]?.expense || 0;
        const prevMonth = results[results.length - 2]?.expense || 0;
        const change = prevMonth > 0 ? ((currentMonth - prevMonth) / prevMonth) * 100 : 0;
        return { chartData: results, currentValue: currentMonth, change, periodLabel: 'This Month' };
      } else {
        // Daily view: last 14 days
        const days = [];
        for (let i = 13; i >= 0; i--) {
          const d = subDays(new Date(), i);
          const dateStr = format(d, 'yyyy-MM-dd');
          days.push({ label: format(d, 'dd MMM'), start: dateStr, end: dateStr });
        }
        const results = await Promise.all(days.map(async day => {
          const data = await fetchAllPaginated<any>(() => supabase.from('bank_transactions').select('amount, category, description').eq('transaction_type', 'EXPENSE').eq('transaction_date', day.start));
          const total = (data || []).filter((t: any) => !excludeCategories.includes(normalizeExpenseCategory(t.category, t.description))).reduce((s: number, t: any) => s + Math.abs(Number(t.amount)), 0);
          return { name: day.label, expense: total };
        }));
        const today = results[results.length - 1]?.expense || 0;
        const yesterday = results[results.length - 2]?.expense || 0;
        const change = yesterday > 0 ? ((today - yesterday) / yesterday) * 100 : 0;
        return { chartData: results, currentValue: today, change, periodLabel: 'Today' };
      }
    },
    staleTime: 60000,
  });

  if (isLoading) return <WidgetSkeleton variant="chart" />;

  const hasData = (data?.chartData || []).some(d => d.expense > 0);
  const change = data?.change || 0;

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-start justify-between gap-3">
        <WidgetMetric
          label={data?.periodLabel || 'This Month'}
          value={`₹${Math.round(data?.currentValue || 0).toLocaleString('en-IN')}`}
          size="sm"
          helper={
            change !== 0 ? (
              <span className={change > 0 ? 'font-semibold text-destructive' : 'font-semibold text-success'}>
                {change > 0 ? '+' : ''}{change.toFixed(1)}% vs previous
              </span>
            ) : 'vs previous'
          }
        />
        <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-border text-[11px]">
          {(['month', 'day'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-2.5 py-1 font-medium capitalize transition-colors ${viewMode === mode ? 'bg-primary text-primary-foreground' : 'bg-transparent text-muted-foreground hover:bg-muted'}`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
      {hasData ? (
        <WidgetChart height={110}>
          <RechartsLineChart data={data?.chartData || []} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <XAxis dataKey="name" {...axisProps} />
            <Tooltip {...tooltipProps} formatter={(v: any) => `₹${Number(v).toLocaleString('en-IN')}`} />
            <Line type="monotone" dataKey="expense" stroke={chartColor.destructive()} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
          </RechartsLineChart>
        </WidgetChart>
      ) : (
        <WidgetEmpty icon={BarChart3} title="No expense data available" />
      )}
    </div>
  );
}

// ── Pending Settlements Widget (grouped by payment gateway) ──
export function PendingSettlementsWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['widget_pending_settlements'],
    queryFn: async () => {
      const { data: orders, error } = await supabase
        .from('sales_orders')
        .select('id, total_amount, sales_payment_method_id, sales_payment_methods!sales_orders_sales_payment_method_id_fkey(type, nickname, payment_gateway)')
        .eq('settlement_status', 'PENDING');

      if (error) throw error;

      // Only include orders linked to a payment gateway method
      const gwOrders = (orders || []).filter((o: any) => o.sales_payment_methods?.payment_gateway === true);
      const totalAmount = gwOrders.reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0);

      // Group by payment gateway
      const groupMap: Record<string, { name: string; count: number; amount: number }> = {};
      gwOrders.forEach((o: any) => {
        const pm = o.sales_payment_methods;
        const key = o.sales_payment_method_id || '_unknown';
        const label = pm?.nickname || pm?.type || 'Gateway';
        if (!groupMap[key]) {
          groupMap[key] = { name: label, count: 0, amount: 0 };
        }
        groupMap[key].count += 1;
        groupMap[key].amount += Number(o.total_amount || 0);
      });

      const groups = Object.values(groupMap).sort((a, b) => b.amount - a.amount);
      return { groups, total: gwOrders.length, totalAmount };
    },
    refetchInterval: 30000,
    staleTime: 30000,
  });

  if (isLoading) return <WidgetSkeleton variant="list" rows={4} />;

  const groups = data?.groups || [];
  const totalAmount = data?.totalAmount || 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
        <WidgetMetric
          label="Pending settlements"
          value={data?.total || 0}
          size="sm"
          helper={`across ${groups.length} gateway${groups.length === 1 ? '' : 's'}`}
        />
        <WidgetMetric
          label="Value"
          value={`₹${Math.round(totalAmount).toLocaleString('en-IN')}`}
          size="sm"
          align="center"
          tone="warning"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {groups.length === 0 ? (
          <WidgetEmpty icon={CreditCard} title="No pending settlements" />
        ) : (
          <div className="space-y-2.5">
            {groups.map((g, i) => (
              <WidgetProgressRow
                key={i}
                label={g.name}
                value={`₹${Math.round(g.amount).toLocaleString('en-IN')}`}
                percent={totalAmount > 0 ? (g.amount / totalAmount) * 100 : 0}
                tone="primary"
                leading={<span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{g.count}x</span>}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Team Status Widget ──
export function TeamStatusWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['widget_team_status'],
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const [{ count: totalEmp }, { data: attendance }] = await Promise.all([
        supabase.from('hr_employees').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('hr_attendance')
          .select('employee_id, check_in, check_out, attendance_status, hr_employees!hr_attendance_employee_id_fkey(first_name, last_name)')
          .eq('attendance_date', today),
      ]);
      const all = attendance || [];

      // Consolidate multiple punches per employee: first check-in, last check-out
      const byEmployee = new Map<string, { name: string; firstCheckIn: string | null; lastCheckOut: string | null; statuses: string[] }>();
      for (const a of all as any[]) {
        const empId = a.employee_id;
        if (!empId) continue;
        const existing = byEmployee.get(empId);
        const name = `${a.hr_employees?.first_name || ''} ${a.hr_employees?.last_name || ''}`.trim();
        if (!existing) {
          byEmployee.set(empId, {
            name,
            firstCheckIn: a.check_in || null,
            lastCheckOut: a.check_out || null,
            statuses: a.attendance_status ? [a.attendance_status] : [],
          });
        } else {
          // Keep earliest check-in
          if (a.check_in && (!existing.firstCheckIn || a.check_in < existing.firstCheckIn)) {
            existing.firstCheckIn = a.check_in;
          }
          // Keep latest check-out
          if (a.check_out && (!existing.lastCheckOut || a.check_out > existing.lastCheckOut)) {
            existing.lastCheckOut = a.check_out;
          }
          if (a.attendance_status) existing.statuses.push(a.attendance_status);
        }
      }

      const consolidated = Array.from(byEmployee.values());
      const present = consolidated.filter(e => e.statuses.includes('present') || e.statuses.includes('late')).length;
      const absent = consolidated.filter(e => e.statuses.includes('absent') && !e.statuses.includes('present') && !e.statuses.includes('late')).length;
      const late = consolidated.filter(e => e.statuses.includes('late')).length;
      // Currently in office: has checked in but last check-out is null (still inside)
      const activeNow = consolidated
        .filter(e => e.firstCheckIn && !e.lastCheckOut)
        .map(e => ({ name: e.name, checkIn: e.firstCheckIn }));

      return { total: totalEmp || 0, present, absent, late, activeNow };
    },
    staleTime: 30000,
    refetchInterval: 60000,
  });

  if (isLoading) return <WidgetSkeleton variant="stats" />;

  const active = data?.activeNow || [];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-3 py-2.5">
        <WidgetStatGrid
          columns={4}
          items={[
            { label: 'Total', value: data?.total || 0 },
            { label: 'Present', value: data?.present || 0, tone: 'success' },
            { label: 'Absent', value: data?.absent || 0, tone: 'destructive' },
            { label: 'Late', value: data?.late || 0, tone: 'warning' },
          ]}
        />
      </div>
      <div className="flex items-center justify-between px-3 pt-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Currently in office
        </p>
        <WidgetStatus tone={active.length > 0 ? 'success' : 'neutral'}>{active.length}</WidgetStatus>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {active.length === 0 ? (
          <WidgetEmpty icon={UserCheck} title="No one currently checked in" />
        ) : (
          <WidgetList>
            {active.map((emp: any, i: number) => (
              <WidgetListRow
                key={i}
                icon={UserCheck}
                iconTone="success"
                title={emp.name || 'Unknown'}
                subtitle="Checked in"
                value={emp.checkIn?.slice(0, 5)}
              />
            ))}
          </WidgetList>
        )}
      </div>
    </div>
  );
}

// ── Inventory Status Widget ──
export function InventoryStatusWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['widget_inventory_status_inr'],
    queryFn: async () => {
      const [wallets, positions] = await Promise.all([
        fetchAllPaginated<any>(() => supabase.from('wallet_asset_balances').select('asset_code, balance')),
        fetchAllPaginated<any>(() => supabase.from('wallet_asset_positions' as any).select('asset_code, avg_cost_usdt')),
      ]);

      // Get USDT/INR rate
      let usdtInrRate = 0;
      try {
        const { data: rateData } = await supabase.functions.invoke('fetch-usdt-rate');
        if (rateData?.rate && rateData?.source !== 'Fallback') usdtInrRate = rateData.rate;
      } catch (err) { console.warn('[RealDataWidgets] Failed to fetch USDT rate:', err); }

      // Aggregate balances
      const totals: Record<string, number> = {};
      (wallets || []).forEach((w: any) => { totals[w.asset_code] = (totals[w.asset_code] || 0) + Number(w.balance || 0); });

      // Build WAC map (avg across wallets per asset)
      const wacMap: Record<string, number> = {};
      (positions || []).forEach((p: any) => {
        if (!wacMap[p.asset_code] && Number(p.avg_cost_usdt) > 0) {
          wacMap[p.asset_code] = Number(p.avg_cost_usdt);
        }
      });

      return Object.entries(totals)
        .map(([code, balance]) => {
          let inrValue = 0;
          if (code === 'USDT') {
            inrValue = balance * usdtInrRate;
          } else {
            const avgCostUsdt = wacMap[code] || 0;
            inrValue = balance * avgCostUsdt * usdtInrRate;
          }
          return { code, balance, inrValue };
        })
        .sort((a, b) => b.inrValue - a.inrValue);
    },
    staleTime: 30000,
  });

  if (isLoading) return <WidgetSkeleton variant="table" rows={5} />;

  const rows = data || [];
  if (rows.length === 0) return <WidgetEmpty icon={Package} title="No assets in inventory" />;

  const totalValue = rows.reduce((s, a) => s + a.inrValue, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-3 py-2.5">
        <WidgetMetric
          label="Inventory value"
          value={`₹${Math.round(totalValue).toLocaleString('en-IN')}`}
          size="sm"
          helper={`${rows.length} asset${rows.length === 1 ? '' : 's'}`}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-1.5 text-left font-semibold">Asset</th>
              <th className="px-3 py-1.5 text-right font-semibold">Qty</th>
              <th className="px-3 py-1.5 text-right font-semibold">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.slice(0, 8).map(a => (
              <tr key={a.code} className="transition-colors hover:bg-muted/50">
                <td className="px-3 py-1.5 font-medium text-foreground">{a.code}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-foreground">
                  {a.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                  ₹{Math.round(a.inrValue).toLocaleString('en-IN')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Upcoming Tasks (Pending Approvals) ──
export function UpcomingTasksWidget() {
  const { permissions } = usePermissions();

  const hasClientsView = permissions.includes('clients_view');
  const hasHrmsView = permissions.includes('hrms_view');

  const { data, isLoading } = useQuery({
    queryKey: ['widget_upcoming_tasks', hasClientsView, hasHrmsView],
    queryFn: async () => {
      const items: { label: string; count: number; color: string; urgency: string }[] = [];

      if (hasClientsView) {
        const { count: pendingKyc } = await supabase
          .from('client_onboarding_approvals')
          .select('id', { count: 'exact', head: true })
          .eq('approval_status', 'pending');
        items.push({
          label: 'KYC Approvals',
          count: pendingKyc || 0,
          color: 'bg-destructive',
          urgency: pendingKyc && pendingKyc > 0 ? 'Urgent' : 'Clear',
        });
      }

      if (hasHrmsView) {
        const [{ count: pendingLeave }, { count: pendingOnboard }] = await Promise.all([
          supabase.from('hr_leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('hr_employee_onboarding').select('id', { count: 'exact', head: true }).not('status', 'in', '("completed","cancelled")'),
        ]);
        items.push(
          { label: 'Leave Requests', count: pendingLeave || 0, color: 'bg-warning', urgency: pendingLeave && pendingLeave > 0 ? 'Pending' : 'Clear' },
          { label: 'Onboarding', count: pendingOnboard || 0, color: 'bg-info', urgency: pendingOnboard && pendingOnboard > 0 ? 'In Progress' : 'Clear' },
        );
      }

      return items;
    },
    staleTime: 30000,
    enabled: hasClientsView || hasHrmsView,
  });

  if (isLoading) return <WidgetSkeleton variant="list" rows={3} />;

  if (!data || data.length === 0) {
    return <WidgetEmpty icon={Bell} title="No pending actions for your role" />;
  }

  const toneFor = (color: string): 'destructive' | 'warning' | 'primary' =>
    color === 'bg-destructive' ? 'destructive' : color === 'bg-warning' ? 'warning' : 'primary';

  return (
    <div className="p-1.5">
      <WidgetList>
        {data.map(t => {
          const tone = t.count > 0 ? toneFor(t.color) : 'neutral';
          return (
            <WidgetListRow
              key={t.label}
              icon={t.label === 'Leave Requests' ? Calendar : t.label === 'Onboarding' ? UserCheck : FileText}
              iconTone={tone}
              title={t.label}
              subtitle={t.count > 0 ? `${t.count} ${t.urgency.toLowerCase()}` : 'All clear'}
              trailing={
                <WidgetStatus tone={tone}>{t.count > 0 ? String(t.count) : 'Clear'}</WidgetStatus>
              }
            />
          );
        })}
      </WidgetList>
    </div>
  );
}

// ── Shared loader ──
function WidgetLoader() {
  return <WidgetSkeleton variant="metric" />;
}

// ── Terminal Sales Approval Widget ──
export function TerminalSalesApprovalWidget() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [approvalRecord, setApprovalRecord] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['widget_terminal_sales_approval'],
    queryFn: async () => {
      // Fetch all pending records, then apply same filters as TerminalSalesSyncTab
      const { data: allPending } = await supabase
        .from('terminal_sales_sync' as any)
        .select('*')
        .eq('sync_status', 'synced_pending_approval')
        .order('synced_at', { ascending: false });

      const { getSmallSalesConfig } = await import('@/hooks/useSmallSalesSync');
      const smallConfig = await getSmallSalesConfig();
      const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
      const cutoffTime = Date.now() - LOOKBACK_MS;

      const filtered = (allPending || []).filter((r: any) => {
        const od = typeof r.order_data === 'string' ? JSON.parse(r.order_data) : r.order_data;
        const createTime = Number(od?.create_time || 0);
        if (createTime > 0 && createTime < cutoffTime) return false;
        if (smallConfig?.is_enabled) {
          const tp = parseFloat(od?.total_price || '0');
          if (tp >= smallConfig.min_amount && tp <= smallConfig.max_amount) return false;
        }
        return true;
      });

      return { pending: filtered.length, recentPending: filtered.slice(0, 5) as any[] };
    },
    staleTime: 30000,
    refetchInterval: 30000,
  });

  if (isLoading) return <WidgetSkeleton variant="list" rows={3} />;

  const pending = data?.pending || 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
        <WidgetMetric
          label="Pending approval"
          value={pending}
          tone={pending > 0 ? 'warning' : 'neutral'}
          size="sm"
          helper={pending === 1 ? 'sell order' : 'sell orders'}
        />
        <Button variant="ghost" size="sm" onClick={() => navigate('/sales?tab=terminal-sync')}>
          Open queue
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {(data?.recentPending?.length || 0) === 0 ? (
          <WidgetEmpty icon={ShoppingCart} title="No sell orders awaiting approval" />
        ) : (
          <WidgetList>
            {data?.recentPending.map((r: any) => {
              const orderData = typeof r.order_data === 'string' ? JSON.parse(r.order_data) : r.order_data;
              const amount = orderData?.total_price || orderData?.totalPrice || orderData?.amount || '—';
              return (
                <WidgetListRow
                  key={r.id}
                  icon={ShoppingCart}
                  iconTone="warning"
                  title={r.counterparty_name || 'Unknown'}
                  subtitle="Awaiting approval"
                  value={`₹${Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                  trailing={
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-1 h-7 shrink-0 px-2 text-[11px]"
                      onClick={(e) => { e.stopPropagation(); setApprovalRecord(r); }}
                    >
                      Approve
                    </Button>
                  }
                />
              );
            })}
          </WidgetList>
        )}
      </div>
      {approvalRecord && (
        <TerminalSalesApprovalDialog
          open={!!approvalRecord}
          onOpenChange={(open) => { if (!open) setApprovalRecord(null); }}
          syncRecord={approvalRecord}
          onSuccess={() => {
            setApprovalRecord(null);
            queryClient.invalidateQueries({ queryKey: ['widget_terminal_sales_approval'] });
          }}
        />
      )}
    </div>
  );
}

// ── Terminal Purchase Approval Widget ──
export function TerminalPurchaseApprovalWidget() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [approvalRecord, setApprovalRecord] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['widget_terminal_purchase_approval'],
    queryFn: async () => {
      // Fetch all pending records, then apply same filters as TerminalSyncTab (purchase)
      const { data: allPending } = await supabase
        .from('terminal_purchase_sync' as any)
        .select('*')
        .eq('sync_status', 'synced_pending_approval')
        .order('synced_at', { ascending: false });

      const { getSmallBuysConfig } = await import('@/hooks/useSmallBuysSync');
      const sbConfig = await getSmallBuysConfig();
      const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
      const cutoffTime = Date.now() - LOOKBACK_MS;

      const filtered = (allPending || []).filter((r: any) => {
        const od = typeof r.order_data === 'string' ? JSON.parse(r.order_data) : r.order_data;
        const createTime = Number(od?.create_time || 0);
        if (createTime > 0 && createTime < cutoffTime) return false;
        if (sbConfig?.is_enabled) {
          const tp = parseFloat(od?.total_price || '0');
          if (tp >= sbConfig.min_amount && tp <= sbConfig.max_amount) return false;
        }
        return true;
      });

      return { pending: filtered.length, recentPending: filtered.slice(0, 5) as any[] };
    },
    staleTime: 30000,
    refetchInterval: 30000,
  });

  if (isLoading) return <WidgetSkeleton variant="list" rows={3} />;

  const pending = data?.pending || 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
        <WidgetMetric
          label="Pending approval"
          value={pending}
          tone={pending > 0 ? 'warning' : 'neutral'}
          size="sm"
          helper={pending === 1 ? 'buy order' : 'buy orders'}
        />
        <Button variant="ghost" size="sm" onClick={() => navigate('/purchase?tab=terminal_sync')}>
          Open queue
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {(data?.recentPending?.length || 0) === 0 ? (
          <WidgetEmpty icon={Package} title="No buy orders awaiting approval" />
        ) : (
          <WidgetList>
            {data?.recentPending.map((r: any) => {
              const orderData = typeof r.order_data === 'string' ? JSON.parse(r.order_data) : r.order_data;
              const amount = orderData?.total_price || orderData?.totalPrice || orderData?.amount || '—';
              return (
                <WidgetListRow
                  key={r.id}
                  icon={Package}
                  iconTone="warning"
                  title={r.counterparty_name || 'Unknown'}
                  subtitle="Awaiting approval"
                  value={`₹${Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                  trailing={
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-1 h-7 shrink-0 px-2 text-[11px]"
                      onClick={(e) => { e.stopPropagation(); setApprovalRecord(r); }}
                    >
                      Approve
                    </Button>
                  }
                />
              );
            })}
          </WidgetList>
        )}
      </div>
      {approvalRecord && (
        <TerminalPurchaseApprovalDialog
          open={!!approvalRecord}
          onOpenChange={(open) => { if (!open) setApprovalRecord(null); }}
          syncRecord={approvalRecord}
          onSuccess={() => {
            setApprovalRecord(null);
            queryClient.invalidateQueries({ queryKey: ['widget_terminal_purchase_approval'] });
          }}
        />
      )}
    </div>
  );
}
