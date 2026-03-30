import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TerminalSalesApprovalDialog } from "@/components/sales/TerminalSalesApprovalDialog";
import { TerminalPurchaseApprovalDialog } from "@/components/purchase/TerminalPurchaseApprovalDialog";
import { format, subDays, startOfDay, endOfDay, subMonths, startOfMonth, endOfMonth } from "date-fns";
import {
  Users, TrendingUp, TrendingDown, ArrowUpRight, Package, DollarSign,
  Clock, FileText, Activity, Zap, Calendar, ShoppingCart, CreditCard,
  UserCheck, PieChart, BarChart3, Bell
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart as RechartsLineChart, Line, PieChart as RechartsPieChart, Pie, Cell } from "recharts";

const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316"];

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

  if (isLoading) return <WidgetLoader />;
  const growth = data && data.length >= 2 ? ((data[data.length - 1].clients - data[data.length - 2].clients) / (data[data.length - 2].clients || 1) * 100).toFixed(1) : '0';

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-2xl font-bold text-gray-900">{data?.[data.length - 1]?.clients || 0}</div>
          <p className="text-xs text-gray-500">Total Clients</p>
        </div>
        <Badge className={`${Number(growth) >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {Number(growth) >= 0 ? '+' : ''}{growth}% this month
        </Badge>
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <RechartsLineChart data={data || []}>
          <XAxis dataKey="name" fontSize={10} tick={{ fill: '#9ca3af' }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="clients" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} />
        </RechartsLineChart>
      </ResponsiveContainer>
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

  if (isLoading) return <WidgetLoader />;

  return (
    <div className="p-4 space-y-2.5">
      {(data || []).length === 0 && <p className="text-sm text-gray-400 text-center py-4">No recent orders</p>}
      {(data || []).map((o: any) => (
        <div key={o.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{o.order_number}</p>
            <p className="text-xs text-gray-500 truncate">{o.client_name} · {format(new Date(o.created_at), 'MMM dd')}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-sm font-semibold text-gray-900">₹{Math.round(Number(o.total_amount)).toLocaleString('en-IN')}</p>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{o.status || 'Pending'}</Badge>
          </div>
        </div>
      ))}
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

  if (isLoading) return <WidgetLoader />;

  const stats = [
    { label: 'Sales Today', value: data?.sales || 0, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Purchases', value: data?.purchases || 0, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'New Clients', value: data?.newClients || 0, color: 'text-purple-600', bg: 'bg-purple-50' },
  ];

  return (
    <div className="p-4 grid grid-cols-3 gap-3">
      {stats.map(s => (
        <div key={s.label} className={`text-center p-3 ${s.bg} rounded-lg`}>
          <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
          <p className="text-[10px] text-gray-600 mt-0.5">{s.label}</p>
        </div>
      ))}
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

  if (isLoading) return <WidgetLoader />;

  const stats = data || { orders: 0, purchases: 0, verifiedClients: 0, totalClients: 0 };

  return (
    <div className="p-4 grid grid-cols-2 gap-3">
      <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
        <div className="text-xl font-bold text-blue-600">{stats.orders.toLocaleString('en-IN')}</div>
        <p className="text-xs text-muted-foreground">Orders</p>
      </div>
      <div className="text-center p-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
        <div className="text-xl font-bold text-green-600">{stats.verifiedClients.toLocaleString('en-IN')}</div>
        <p className="text-xs text-muted-foreground">Verified Clients</p>
      </div>
      <div className="text-center p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg">
        <div className="text-xl font-bold text-purple-600">{stats.totalClients.toLocaleString('en-IN')}</div>
        <p className="text-xs text-muted-foreground">Total Clients</p>
      </div>
      <div className="text-center p-3 bg-orange-50 dark:bg-orange-950/30 rounded-lg">
        <div className="text-xl font-bold text-orange-600">{stats.purchases.toLocaleString('en-IN')}</div>
        <p className="text-xs text-muted-foreground">Purchases</p>
      </div>
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
        const cat = t.category || 'Uncategorized';
        if (excludeCategories.includes(cat)) return;
        catMap[cat] = (catMap[cat] || 0) + Math.abs(Number(t.amount));
      });
      const categories = Object.entries(catMap).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 8);
      const totalExpense = Object.values(catMap).reduce((s, v) => s + v, 0);
      const recentItems = (data || []).filter((t: any) => !excludeCategories.includes(t.category || '')).slice(0, 5).map((t: any) => ({
        desc: t.description || t.category || 'Expense',
        amount: Math.abs(Number(t.amount)),
        date: t.transaction_date,
      }));
      return { categories, totalExpense, recentItems, month: format(now, 'MMMM yyyy') };
    },
    staleTime: 60000,
  });

  const navigate = useNavigate();

  if (isLoading) return <WidgetLoader />;

  const hasData = (data?.categories?.length || 0) > 0;

  return (
    <div className="p-4 space-y-3 cursor-pointer" onClick={() => navigate('/statistics?tab=financial')}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{data?.month}</span>
        <span className="text-lg font-bold text-foreground">₹{Math.round(data?.totalExpense || 0).toLocaleString('en-IN')}</span>
      </div>
      {!hasData && <p className="text-sm text-muted-foreground text-center py-4">No expenses this month</p>}
      {hasData && (
        <>
          <div className="space-y-2">
            {data!.categories.map((e, i) => {
              const pct = data!.totalExpense > 0 ? (e.amount / data!.totalExpense) * 100 : 0;
              return (
                <div key={e.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="font-medium text-foreground truncate max-w-[140px]">{e.name}</span>
                    </div>
                    <span className="font-semibold text-foreground">₹{Math.round(e.amount).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                  </div>
                </div>
              );
            })}
          </div>
          {(data?.recentItems?.length || 0) > 0 && (
            <div className="pt-2 border-t border-border">
              <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">RECENT</p>
              {data!.recentItems.map((item, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1">
                  <span className="text-muted-foreground truncate max-w-[60%]">{item.desc}</span>
                  <span className="font-medium text-foreground">₹{Math.round(item.amount).toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          )}
        </>
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

      const { data: orders, error } = await supabase
        .from('sales_orders')
        .select('order_date, total_amount')
        .gte('order_date', days[0].date)
        .lte('order_date', days[days.length - 1].date);

      if (error) throw error;

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

  if (isLoading) return <WidgetLoader />;

  const hasData = (data?.totalRevenue || 0) > 0;

  return (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-muted/50 p-2">
          <p className="text-[10px] text-muted-foreground">7D Revenue</p>
          <p className="text-sm font-bold text-foreground">₹{Math.round(data?.totalRevenue || 0).toLocaleString('en-IN')}</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-2">
          <p className="text-[10px] text-muted-foreground">Today</p>
          <p className="text-sm font-bold text-foreground">₹{Math.round(data?.todayRevenue || 0).toLocaleString('en-IN')}</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-2">
          <p className="text-[10px] text-muted-foreground">Avg / Order</p>
          <p className="text-sm font-bold text-foreground">₹{Math.round(data?.avgOrderValue || 0).toLocaleString('en-IN')}</p>
        </div>
      </div>

      {hasData ? (
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={data?.chartData || []}>
            <XAxis dataKey="name" fontSize={10} tick={{ fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis fontSize={10} tick={{ fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: any) => `₹${Math.round(Number(v)).toLocaleString('en-IN')}`} contentStyle={{ fontSize: 11 }} />
            <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-6">No sales revenue in last 7 days</p>
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

  if (isLoading) return <WidgetLoader />;
  const todayEarnings = data?.[data.length - 1]?.amount || 0;

  return (
    <div className="p-4">
      <div className="text-center mb-3">
        <div className="text-lg font-bold text-blue-600">₹{Math.round(todayEarnings).toLocaleString('en-IN')}</div>
        <p className="text-xs text-muted-foreground">Today's Sales</p>
      </div>
      <ResponsiveContainer width="100%" height={80}>
        <BarChart data={data || []}>
          <XAxis dataKey="name" fontSize={9} tick={{ fill: '#9ca3af' }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v: any) => `₹${Math.round(Number(v)).toLocaleString('en-IN')}`} contentStyle={{ fontSize: 11 }} />
          <Bar dataKey="amount" fill="#3B82F6" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
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

  if (isLoading) return <WidgetLoader />;

  return (
    <div className="text-center p-4">
      <div className={`text-3xl font-bold ${Number(data?.margin) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{data?.margin}%</div>
      <p className="text-sm text-muted-foreground mt-1">Profit Margin ({data?.periodLabel})</p>
      <p className="text-xs text-muted-foreground mt-2">Profit: ₹{Math.round(data?.profit || 0).toLocaleString('en-IN')}</p>
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

      // Fetch current & previous period data in parallel
      const [
        { data: thisSales },
        { data: lastSales },
        { data: thisPurchaseOrders },
        { data: lastPurchaseOrders },
        { data: thisUsdtFees },
        { data: lastUsdtFees },
        { count: totalClients },
        { count: activeClients },
      ] = await Promise.all([
        supabase.from('sales_orders').select('quantity, price_per_unit, total_amount').eq('status', 'COMPLETED').gte('order_date', startStr).lte('order_date', endStr),
        supabase.from('sales_orders').select('quantity, price_per_unit, total_amount').eq('status', 'COMPLETED').gte('order_date', prevStartStr).lte('order_date', prevEndStr),
        supabase.from('purchase_orders').select('id, market_rate_usdt').eq('status', 'COMPLETED').gte('order_date', startStr).lte('order_date', endStr),
        supabase.from('purchase_orders').select('id, market_rate_usdt').eq('status', 'COMPLETED').gte('order_date', prevStartStr).lte('order_date', prevEndStr),
        supabase.from('wallet_transactions').select('amount').eq('transaction_type', 'DEBIT')
          .in('reference_type', ['PLATFORM_FEE', 'TRANSFER_FEE', 'SALES_ORDER_FEE', 'PURCHASE_ORDER_FEE'])
          .gte('created_at', startStr).lte('created_at', endStr + 'T23:59:59'),
        supabase.from('wallet_transactions').select('amount').eq('transaction_type', 'DEBIT')
          .in('reference_type', ['PLATFORM_FEE', 'TRANSFER_FEE', 'SALES_ORDER_FEE', 'PURCHASE_ORDER_FEE'])
          .gte('created_at', prevStartStr).lte('created_at', prevEndStr + 'T23:59:59'),
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('is_deleted', false),
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('is_deleted', false).gte('created_at', thirtyDaysAgo),
      ]);

      // Helper: compute gross profit using P&L logic (NPM * Sales Qty)
      const computeGrossProfit = async (
        salesData: any[] | null,
        purchaseOrders: any[] | null,
        usdtFees: any[] | null
      ) => {
        const sales = salesData || [];
        const totalSalesValue = sales.reduce((s: number, o: any) => s + (Number(o.quantity || 0) * Number(o.price_per_unit || 0)), 0);
        const totalSalesQty = sales.reduce((s: number, o: any) => s + Number(o.quantity || 0), 0);
        const avgSalesRate = totalSalesQty > 0 ? totalSalesValue / totalSalesQty : 0;

        // Fetch purchase items
        const poIds = (purchaseOrders || []).map((po: any) => po.id).filter((id: string) => !excludedOrderIds.includes(id));
        let totalPurchaseValue = 0;
        let totalPurchaseQty = 0;

        if (poIds.length > 0) {
          const { data: items } = await supabase.from('purchase_order_items')
            .select('purchase_order_id, quantity, unit_price, products!inner(code)')
            .in('purchase_order_id', poIds);
          (items || []).forEach((item: any) => {
            const qty = Number(item.quantity || 0);
            const unitPrice = Number(item.unit_price || 0);
            totalPurchaseValue += qty * unitPrice;
            totalPurchaseQty += qty;
          });
        }

        // Effective purchase rate (adjusted for USDT fees)
        const totalFees = (usdtFees || []).reduce((s: number, f: any) => s + Number(f.amount || 0), 0);
        const netPurchaseQty = totalPurchaseQty - totalFees;
        const avgPurchaseRate = totalPurchaseQty > 0 ? totalPurchaseValue / totalPurchaseQty : 0;
        const effectivePurchaseRate = netPurchaseQty > 0 ? totalPurchaseValue / netPurchaseQty : avgPurchaseRate;

        // NPM-based gross profit (matching P&L)
        const npm = avgSalesRate - effectivePurchaseRate;
        const grossProfit = npm * totalSalesQty;
        const profitMargin = totalSalesValue > 0 ? (grossProfit / totalSalesValue) * 100 : 0;

        return { totalSalesValue, totalSalesQty, grossProfit, profitMargin };
      };

      const thisResult = await computeGrossProfit(thisSales, thisPurchaseOrders as any, thisUsdtFees);
      const lastResult = await computeGrossProfit(lastSales, lastPurchaseOrders as any, lastUsdtFees);

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
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'Gross Profit',
      value: `₹${((data?.thisGrossProfit || 0) / 100000).toFixed(1)}L`,
      change: Number(profitGrowth),
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      label: 'Profit Margin',
      value: `${(data?.profitMargin || 0).toFixed(1)}%`,
      change: null,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      label: 'Volume Traded',
      value: `${((data?.thisSalesQty || 0)).toLocaleString('en-IN', { maximumFractionDigits: 0 })} USDT`,
      change: (data?.lastSalesQty || 0) > 0 ? (((data?.thisSalesQty || 0) - (data?.lastSalesQty || 0)) / (data?.lastSalesQty || 1)) * 100 : null,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
  ];

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 gap-3">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={`${kpi.bgColor} rounded-lg p-3`}>
            <p className="text-xs text-muted-foreground mb-1">{kpi.label}</p>
            <p className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</p>
            {kpi.change !== null && (
              <div className="flex items-center gap-1 mt-1">
                {kpi.change >= 0 ? (
                  <TrendingUp className="h-3 w-3 text-green-500" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-500" />
                )}
                <span className={`text-xs ${kpi.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {kpi.change >= 0 ? '+' : ''}{kpi.change.toFixed(1)}% MoM
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground border-t pt-2">
        <span>{data?.orderCount || 0} orders this month</span>
        <span>{data?.totalClients || 0} clients ({data?.newClients || 0} new in 30d)</span>
      </div>
    </div>
  );
}

// ── Conversion Rate Widget ──
export function ConversionRateWidget({ metrics }: { metrics?: any }) {
  const rate = metrics?.totalClients > 0 ? ((metrics.verifiedClients / metrics.totalClients) * 100).toFixed(1) : '0';
  return (
    <div className="text-center p-4">
      <div className="text-3xl font-bold text-blue-600">{rate}%</div>
      <p className="text-sm text-gray-500 mt-1">KYC Conversion Rate</p>
      <p className="text-xs text-gray-400 mt-2">{metrics?.verifiedClients || 0} verified of {metrics?.totalClients || 0}</p>
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

      const [{ data: currentSales }, { data: previousSales }] = await Promise.all([
        supabase.from('sales_orders').select('total_amount').eq('status', 'COMPLETED').gte('order_date', startStr).lte('order_date', endStr),
        supabase.from('sales_orders').select('total_amount').eq('status', 'COMPLETED').gte('order_date', prevStartStr).lte('order_date', prevEndStr),
      ]);

      const currentTotal = (currentSales || []).reduce((s, o: any) => s + Number(o.total_amount || 0), 0);
      const previousTotal = (previousSales || []).reduce((s, o: any) => s + Number(o.total_amount || 0), 0);
      const growth = previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : 0;
      const periodLabel = dateRange?.from ? `${format(periodStart, 'dd MMM')} - ${format(periodEnd, 'dd MMM')}` : 'This Month';

      return { growth: growth.toFixed(1), currentTotal, previousTotal, periodLabel };
    },
    staleTime: 60000,
  });

  if (isLoading) return <WidgetLoader />;
  const isPositive = Number(data?.growth) >= 0;

  return (
    <div className="text-center p-4">
      <div className={`text-3xl font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        {isPositive ? '+' : ''}{data?.growth}%
      </div>
      <p className="text-sm text-gray-500 mt-1">Revenue Growth ({data?.periodLabel})</p>
      <div className="flex items-center justify-center gap-1 mt-2">
        {isPositive ? <TrendingUp className="h-4 w-4 text-green-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
        <span className="text-xs text-gray-400">vs previous period</span>
      </div>
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
        .select('amount, transaction_type, transaction_date, category')
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
        if (!excludeExpenseCats.includes(t.category || '')) {
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

  if (isLoading) return <WidgetLoader />;

  const hasData = (data?.totalIncome || 0) > 0 || (data?.totalExpense || 0) > 0;

  return (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-green-50 rounded-lg p-2">
          <p className="text-xs text-muted-foreground">Gross Profit</p>
          <p className="text-sm font-bold text-green-600">₹{((data?.totalIncome || 0) / 1000).toFixed(1)}k</p>
        </div>
        <div className="bg-red-50 rounded-lg p-2">
          <p className="text-xs text-muted-foreground">Expense</p>
          <p className="text-sm font-bold text-red-600">₹{((data?.totalExpense || 0) / 1000).toFixed(1)}k</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-2">
          <p className="text-xs text-muted-foreground">Net</p>
          <p className={`text-sm font-bold ${(data?.net || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {(data?.net || 0) >= 0 ? '+' : ''}₹{((data?.net || 0) / 1000).toFixed(1)}k
          </p>
        </div>
      </div>
      {hasData ? (
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={data?.chartData || []}>
            <XAxis dataKey="name" fontSize={10} tick={{ fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis fontSize={10} tick={{ fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: any) => `₹${Math.round(Number(v)).toLocaleString('en-IN')}`} contentStyle={{ fontSize: 11 }} />
            <Bar dataKey="income" fill="#10B981" radius={[3, 3, 0, 0]} name="Gross Profit" />
            <Bar dataKey="expense" fill="#EF4444" radius={[3, 3, 0, 0]} name="Expense" />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-6">No data in last 7 days</p>
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
          const { data } = await supabase.from('bank_transactions').select('amount, category').eq('transaction_type', 'EXPENSE').gte('transaction_date', m.start).lte('transaction_date', m.end);
          const total = (data || []).filter((t: any) => !excludeCategories.includes(t.category || '')).reduce((s: number, t: any) => s + Math.abs(Number(t.amount)), 0);
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
          const { data } = await supabase.from('bank_transactions').select('amount, category').eq('transaction_type', 'EXPENSE').eq('transaction_date', day.start);
          const total = (data || []).filter((t: any) => !excludeCategories.includes(t.category || '')).reduce((s: number, t: any) => s + Math.abs(Number(t.amount)), 0);
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

  if (isLoading) return <WidgetLoader />;

  const hasData = (data?.chartData || []).some(d => d.expense > 0);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{data?.periodLabel || 'This Month'}</p>
          <p className="text-lg font-bold text-foreground">₹{Math.round(data?.currentValue || 0).toLocaleString('en-IN')}</p>
        </div>
        <div className="flex items-center gap-2">
          {data?.change !== 0 && (
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${(data?.change || 0) > 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
              {(data?.change || 0) > 0 ? '↑' : '↓'} {Math.abs(data?.change || 0).toFixed(1)}%
            </span>
          )}
          <div className="flex rounded-md border border-border overflow-hidden text-[10px]">
            <button
              onClick={() => setViewMode('month')}
              className={`px-2 py-0.5 transition-colors ${viewMode === 'month' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
            >
              Month
            </button>
            <button
              onClick={() => setViewMode('day')}
              className={`px-2 py-0.5 transition-colors ${viewMode === 'day' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
            >
              Day
            </button>
          </div>
        </div>
      </div>
      {hasData ? (
        <ResponsiveContainer width="100%" height={100}>
          <RechartsLineChart data={data?.chartData || []}>
            <XAxis dataKey="name" fontSize={10} tick={{ fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v: any) => `₹${Number(v).toLocaleString('en-IN')}`} contentStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="expense" stroke="#EF4444" strokeWidth={2} dot={{ r: 3 }} />
          </RechartsLineChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-4">No expense data available</p>
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

  if (isLoading) return <WidgetLoader />;

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Pending settlements</p>
          <p className="text-lg font-bold text-foreground">{data?.total || 0}</p>
        </div>
        <Badge className="bg-muted text-foreground border-border">₹{(data?.totalAmount || 0).toLocaleString('en-IN')}</Badge>
      </div>

      <div className="space-y-2 max-h-40 overflow-y-auto">
        {(data?.groups || []).length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-3">No pending settlements</p>
        )}

        {(data?.groups || []).map((g, i) => (
          <div key={i} className="flex items-center justify-between rounded-md bg-muted/40 px-2 py-1.5">
            <div className="min-w-0 flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-primary" />
              <div>
                <p className="text-xs font-semibold text-foreground truncate">{g.name}</p>
                <p className="text-[10px] text-muted-foreground">{g.count} order{g.count !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <p className="text-xs font-semibold text-foreground">₹{g.amount.toLocaleString('en-IN')}</p>
          </div>
        ))}
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

  if (isLoading) return <WidgetLoader />;

  return (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-4 gap-2">
        <div className="text-center p-2 bg-blue-50 rounded-lg">
          <div className="text-lg font-bold text-blue-600">{data?.total || 0}</div>
          <p className="text-[10px] text-muted-foreground">Total</p>
        </div>
        <div className="text-center p-2 bg-green-50 rounded-lg">
          <div className="text-lg font-bold text-green-600">{data?.present || 0}</div>
          <p className="text-[10px] text-muted-foreground">Present</p>
        </div>
        <div className="text-center p-2 bg-red-50 rounded-lg">
          <div className="text-lg font-bold text-red-600">{data?.absent || 0}</div>
          <p className="text-[10px] text-muted-foreground">Absent</p>
        </div>
        <div className="text-center p-2 bg-amber-50 rounded-lg">
          <div className="text-lg font-bold text-amber-600">{data?.late || 0}</div>
          <p className="text-[10px] text-muted-foreground">Late</p>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-semibold text-foreground">Currently In Office ({data?.activeNow?.length || 0})</span>
        </div>
        <div className="max-h-32 overflow-y-auto space-y-1">
          {(data?.activeNow || []).length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">No one currently checked in</p>
          ) : (
            (data?.activeNow || []).map((emp: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs px-2 py-1.5 bg-muted/50 rounded">
                <span className="font-medium text-foreground">{emp.name || 'Unknown'}</span>
                <span className="text-muted-foreground">{emp.checkIn?.slice(0, 5)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Inventory Status Widget ──
export function InventoryStatusWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['widget_inventory_status_inr'],
    queryFn: async () => {
      const [{ data: wallets }, { data: positions }] = await Promise.all([
        supabase.from('wallet_asset_balances').select('asset_code, balance'),
        supabase.from('wallet_asset_positions' as any).select('asset_code, avg_cost_usdt'),
      ]);

      // Get USDT/INR rate
      let usdtInrRate = 84.5;
      try {
        const { data: rateData } = await supabase.functions.invoke('fetch-usdt-rate');
        if (rateData?.rate) usdtInrRate = rateData.rate;
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

  if (isLoading) return <WidgetLoader />;

  return (
    <div className="p-4 space-y-2.5">
      {(data || []).length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No assets</p>}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-semibold uppercase tracking-wide pb-1 border-b border-border">
        <span>Asset</span>
        <div className="flex gap-6">
          <span className="w-20 text-right">Qty</span>
          <span className="w-24 text-right">Value (₹)</span>
        </div>
      </div>
      {(data || []).slice(0, 6).map(a => (
        <div key={a.code} className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">{a.code}</span>
          <div className="flex gap-6">
            <span className="text-sm font-semibold text-foreground w-20 text-right">{a.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            <span className="text-sm text-muted-foreground w-24 text-right">₹{Math.round(a.inrValue).toLocaleString('en-IN')}</span>
          </div>
        </div>
      ))}
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
          color: 'bg-red-500',
          urgency: pendingKyc && pendingKyc > 0 ? 'Urgent' : 'Clear',
        });
      }

      if (hasHrmsView) {
        const [{ count: pendingLeave }, { count: pendingOnboard }] = await Promise.all([
          supabase.from('hr_leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('hr_employee_onboarding').select('id', { count: 'exact', head: true }).not('status', 'in', '("completed","cancelled")'),
        ]);
        items.push(
          { label: 'Leave Requests', count: pendingLeave || 0, color: 'bg-yellow-500', urgency: pendingLeave && pendingLeave > 0 ? 'Pending' : 'Clear' },
          { label: 'Onboarding', count: pendingOnboard || 0, color: 'bg-blue-500', urgency: pendingOnboard && pendingOnboard > 0 ? 'In Progress' : 'Clear' },
        );
      }

      return items;
    },
    staleTime: 30000,
    enabled: hasClientsView || hasHrmsView,
  });

  if (isLoading) return <WidgetLoader />;

  if (!data || data.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        No pending actions for your role
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {data.map(t => (
        <div key={t.label} className="flex items-center gap-3">
          <div className={`w-2 h-2 ${t.color} rounded-full flex-shrink-0`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">{t.label}</p>
            <p className="text-xs text-muted-foreground">{t.count > 0 ? `${t.count} ${t.urgency.toLowerCase()}` : 'All clear'}</p>
          </div>
          {t.count > 0 && <Badge variant="outline" className="text-[10px]">{t.count}</Badge>}
        </div>
      ))}
    </div>
  );
}

// ── Shared loader ──
function WidgetLoader() {
  return (
    <div className="p-6 text-center">
      <div className="animate-pulse space-y-3">
        <div className="h-4 bg-gray-200 rounded w-3/4 mx-auto" />
        <div className="h-8 bg-gray-200 rounded w-1/2 mx-auto" />
        <div className="h-3 bg-gray-200 rounded w-2/3 mx-auto" />
      </div>
    </div>
  );
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

  if (isLoading) return <WidgetLoader />;

  return (
    <div className="p-4 space-y-3">
      <div
        className="flex items-center justify-between rounded-lg px-3 py-2 bg-muted/50 cursor-pointer hover:bg-muted transition-colors"
        onClick={() => navigate('/sales?tab=terminal-sync')}
      >
        <span className="text-sm font-medium text-foreground">Pending Approval</span>
        <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-sm font-bold">{data?.pending || 0}</Badge>
      </div>
      {(data?.recentPending?.length || 0) > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Recent Pending</p>
          {data?.recentPending.map((r: any) => {
            const orderData = typeof r.order_data === 'string' ? JSON.parse(r.order_data) : r.order_data;
            const amount = orderData?.total_price || orderData?.totalPrice || orderData?.amount || '—';
            return (
              <div key={r.id} className="flex items-center justify-between text-xs border rounded px-2 py-1.5">
                <span className="font-medium truncate max-w-[100px]">{r.counterparty_name || 'Unknown'}</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">₹{Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px] text-green-700 border-green-300 hover:bg-green-50"
                    onClick={(e) => { e.stopPropagation(); setApprovalRecord(r); }}
                  >
                    Approve
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
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

  if (isLoading) return <WidgetLoader />;

  return (
    <div className="p-4 space-y-3">
      <div
        className="flex items-center justify-between rounded-lg px-3 py-2 bg-muted/50 cursor-pointer hover:bg-muted transition-colors"
        onClick={() => navigate('/purchase?tab=terminal_sync')}
      >
        <span className="text-sm font-medium text-foreground">Pending Approval</span>
        <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-sm font-bold">{data?.pending || 0}</Badge>
      </div>
      {(data?.recentPending?.length || 0) > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Recent Pending</p>
          {data?.recentPending.map((r: any) => {
            const orderData = typeof r.order_data === 'string' ? JSON.parse(r.order_data) : r.order_data;
            const amount = orderData?.total_price || orderData?.totalPrice || orderData?.amount || '—';
            return (
              <div key={r.id} className="flex items-center justify-between text-xs border rounded px-2 py-1.5">
                <span className="font-medium truncate max-w-[100px]">{r.counterparty_name || 'Unknown'}</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">₹{Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px] text-green-700 border-green-300 hover:bg-green-50"
                    onClick={(e) => { e.stopPropagation(); setApprovalRecord(r); }}
                  >
                    Approve
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
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
