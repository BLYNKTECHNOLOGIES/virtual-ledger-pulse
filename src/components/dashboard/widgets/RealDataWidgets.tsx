import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
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
            <p className="text-sm font-semibold text-gray-900">₹{Number(o.total_amount).toLocaleString()}</p>
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
export function QuickStatsWidget({ metrics }: { metrics?: any }) {
  const completionRate = metrics?.totalSalesOrders ? ((metrics.totalSalesOrders > 0 ? ((metrics.totalSalesOrders - (metrics.pendingOrders || 0)) / metrics.totalSalesOrders) * 100 : 0)).toFixed(0) : '—';

  return (
    <div className="p-4 grid grid-cols-2 gap-3">
      <div className="text-center p-3 bg-blue-50 rounded-lg">
        <div className="text-xl font-bold text-blue-600">{metrics?.totalSalesOrders || 0}</div>
        <p className="text-xs text-gray-600">Orders</p>
      </div>
      <div className="text-center p-3 bg-green-50 rounded-lg">
        <div className="text-xl font-bold text-green-600">{metrics?.verifiedClients || 0}</div>
        <p className="text-xs text-gray-600">Verified Clients</p>
      </div>
      <div className="text-center p-3 bg-purple-50 rounded-lg">
        <div className="text-xl font-bold text-purple-600">{metrics?.totalClients || 0}</div>
        <p className="text-xs text-gray-600">Total Clients</p>
      </div>
      <div className="text-center p-3 bg-orange-50 rounded-lg">
        <div className="text-xl font-bold text-orange-600">{metrics?.totalPurchases || 0}</div>
        <p className="text-xs text-gray-600">Purchases</p>
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

  if (isLoading) return <WidgetLoader />;

  const hasData = (data?.categories?.length || 0) > 0;

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{data?.month}</span>
        <span className="text-lg font-bold text-foreground">₹{(data?.totalExpense || 0).toLocaleString()}</span>
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
                    <span className="font-semibold text-foreground">₹{e.amount.toLocaleString()}</span>
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
                  <span className="font-medium text-foreground">₹{item.amount.toLocaleString()}</span>
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
          <p className="text-sm font-bold text-foreground">₹{(data?.totalRevenue || 0).toLocaleString()}</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-2">
          <p className="text-[10px] text-muted-foreground">Today</p>
          <p className="text-sm font-bold text-foreground">₹{(data?.todayRevenue || 0).toLocaleString()}</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-2">
          <p className="text-[10px] text-muted-foreground">Avg / Order</p>
          <p className="text-sm font-bold text-foreground">₹{Math.round(data?.avgOrderValue || 0).toLocaleString()}</p>
        </div>
      </div>

      {hasData ? (
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={data?.chartData || []}>
            <XAxis dataKey="name" fontSize={10} tick={{ fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis fontSize={10} tick={{ fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: any) => `₹${Number(v).toLocaleString()}`} contentStyle={{ fontSize: 11 }} />
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
        days.push({ label: format(d, 'EEE'), start: startOfDay(d).toISOString(), end: endOfDay(d).toISOString() });
      }
      const results = await Promise.all(days.map(async day => {
        const { data } = await supabase.from('sales_orders').select('total_amount').gte('created_at', day.start).lte('created_at', day.end);
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
        <div className="text-lg font-bold text-blue-600">₹{todayEarnings.toLocaleString()}</div>
        <p className="text-xs text-gray-500">Today's Sales</p>
      </div>
      <ResponsiveContainer width="100%" height={80}>
        <BarChart data={data || []}>
          <XAxis dataKey="name" fontSize={9} tick={{ fill: '#9ca3af' }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v: any) => `₹${Number(v).toLocaleString()}`} contentStyle={{ fontSize: 11 }} />
          <Bar dataKey="amount" fill="#3B82F6" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Profit Margin Widget ──
export function ProfitMarginWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['widget_profit_margin'],
    queryFn: async () => {
      const start = startOfDay(subDays(new Date(), 30)).toISOString();
      const [{ data: sales }, { data: purchases }] = await Promise.all([
        supabase.from('sales_orders').select('total_amount').gte('created_at', start),
        supabase.from('purchase_orders').select('total_amount').gte('created_at', start),
      ]);
      const totalSales = (sales || []).reduce((s, o: any) => s + Number(o.total_amount || 0), 0);
      const totalPurchases = (purchases || []).reduce((s, o: any) => s + Number(o.total_amount || 0), 0);
      const margin = totalSales > 0 ? ((totalSales - totalPurchases) / totalSales * 100) : 0;
      return { margin: margin.toFixed(1), totalSales, totalPurchases, profit: totalSales - totalPurchases };
    },
    staleTime: 60000,
  });

  if (isLoading) return <WidgetLoader />;

  return (
    <div className="text-center p-4">
      <div className={`text-3xl font-bold ${Number(data?.margin) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{data?.margin}%</div>
      <p className="text-sm text-gray-500 mt-1">Profit Margin (30d)</p>
      <p className="text-xs text-gray-400 mt-2">Profit: ₹{(data?.profit || 0).toLocaleString()}</p>
    </div>
  );
}

// ── Performance Overview Widget ──
export function PerformanceOverviewWidget({ metrics }: { metrics?: any }) {
  const pieData = [
    { name: 'Sales', value: metrics?.totalSales || 0 },
    { name: 'Purchases', value: metrics?.totalSpending || 0 },
    { name: 'Bank Balance', value: metrics?.bankBalance || 0 },
  ].filter(d => d.value > 0);

  return (
    <div className="p-4">
      {pieData.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">No data available</p>
      ) : (
        <div className="flex items-center gap-4">
          <ResponsiveContainer width="50%" height={140}>
            <RechartsPieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={35} outerRadius={60} dataKey="value" stroke="none">
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
            </RechartsPieChart>
          </ResponsiveContainer>
          <div className="space-y-2">
            {pieData.map((d, i) => (
              <div key={d.name} className="flex items-center gap-2 text-sm">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-gray-600">{d.name}</span>
                <span className="font-semibold text-gray-900">₹{(d.value / 100000).toFixed(1)}L</span>
              </div>
            ))}
          </div>
        </div>
      )}
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
export function GrowthRateWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['widget_growth_rate'],
    queryFn: async () => {
      const now = new Date();
      const thisMonthStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)).toISOString();
      const lastMonthStart = startOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 1)).toISOString();
      const lastMonthEnd = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0)).toISOString();

      const [{ data: thisSales }, { data: lastSales }] = await Promise.all([
        supabase.from('sales_orders').select('total_amount').gte('created_at', thisMonthStart),
        supabase.from('sales_orders').select('total_amount').gte('created_at', lastMonthStart).lte('created_at', lastMonthEnd),
      ]);

      const thisTotal = (thisSales || []).reduce((s, o: any) => s + Number(o.total_amount || 0), 0);
      const lastTotal = (lastSales || []).reduce((s, o: any) => s + Number(o.total_amount || 0), 0);
      const growth = lastTotal > 0 ? ((thisTotal - lastTotal) / lastTotal * 100) : 0;
      return { growth: growth.toFixed(1), thisTotal, lastTotal };
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
      <p className="text-sm text-gray-500 mt-1">Revenue Growth (MoM)</p>
      <div className="flex items-center justify-center gap-1 mt-2">
        {isPositive ? <TrendingUp className="h-4 w-4 text-green-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
        <span className="text-xs text-gray-400">vs last month</span>
      </div>
    </div>
  );
}

// ── Cash Flow Widget ──
export function CashFlowWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['widget_cash_flow'],
    queryFn: async () => {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = subDays(new Date(), i);
        days.push({ label: format(d, 'EEE'), date: format(d, 'yyyy-MM-dd') });
      }
      const { data: txns } = await supabase
        .from('bank_transactions')
        .select('amount, transaction_type, transaction_date, category')
        .gte('transaction_date', days[0].date)
        .lte('transaction_date', days[days.length - 1].date);
      
      const dayMap: Record<string, { income: number; expense: number }> = {};
      days.forEach(d => { dayMap[d.date] = { income: 0, expense: 0 }; });
      const excludeCats = ['Purchase', 'OPENING_BALANCE', 'ADJUSTMENT'];
      (txns || []).forEach((t: any) => {
        const entry = dayMap[t.transaction_date];
        if (!entry) return;
        if (t.transaction_type === 'INCOME' || t.transaction_type === 'TRANSFER_IN') entry.income += Math.abs(Number(t.amount));
        else if (t.transaction_type === 'EXPENSE' && !excludeCats.includes(t.category || '')) entry.expense += Math.abs(Number(t.amount));
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
          <p className="text-xs text-muted-foreground">Income</p>
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
            <Tooltip formatter={(v: any) => `₹${Number(v).toLocaleString()}`} contentStyle={{ fontSize: 11 }} />
            <Bar dataKey="income" fill="#10B981" radius={[3, 3, 0, 0]} name="Income" />
            <Bar dataKey="expense" fill="#EF4444" radius={[3, 3, 0, 0]} name="Expense" />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-6">No transactions in last 7 days</p>
      )}
    </div>
  );
}

// ── Expense Trends Widget ──
export function ExpenseTrendsWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['widget_expense_trends'],
    queryFn: async () => {
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const d = subMonths(new Date(), i);
        const s = format(startOfMonth(d), 'yyyy-MM-dd');
        const e = format(endOfMonth(d), 'yyyy-MM-dd');
        months.push({ label: format(d, 'MMM'), start: s, end: e });
      }
      const excludeCategories = ['Purchase', 'OPENING_BALANCE', 'ADJUSTMENT'];
      const results = await Promise.all(months.map(async m => {
        const { data } = await supabase.from('bank_transactions').select('amount, category').eq('transaction_type', 'EXPENSE').gte('transaction_date', m.start).lte('transaction_date', m.end);
        const total = (data || []).filter((t: any) => !excludeCategories.includes(t.category || '')).reduce((s: number, t: any) => s + Math.abs(Number(t.amount)), 0);
        return { name: m.label, expense: total };
      }));
      const currentMonth = results[results.length - 1]?.expense || 0;
      const prevMonth = results[results.length - 2]?.expense || 0;
      const change = prevMonth > 0 ? ((currentMonth - prevMonth) / prevMonth) * 100 : 0;
      return { chartData: results, currentMonth, change };
    },
    staleTime: 60000,
  });

  if (isLoading) return <WidgetLoader />;

  const hasData = (data?.chartData || []).some(d => d.expense > 0);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">This Month</p>
          <p className="text-lg font-bold text-foreground">₹{(data?.currentMonth || 0).toLocaleString()}</p>
        </div>
        {data?.change !== 0 && (
          <div className={`text-xs font-semibold px-2 py-1 rounded-full ${(data?.change || 0) > 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
            {(data?.change || 0) > 0 ? '↑' : '↓'} {Math.abs(data?.change || 0).toFixed(1)}%
          </div>
        )}
      </div>
      {hasData ? (
        <ResponsiveContainer width="100%" height={100}>
          <RechartsLineChart data={data?.chartData || []}>
            <XAxis dataKey="name" fontSize={10} tick={{ fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v: any) => `₹${Number(v).toLocaleString()}`} contentStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="expense" stroke="#EF4444" strokeWidth={2} dot={{ r: 3 }} />
          </RechartsLineChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-4">No expense data in last 6 months</p>
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
        <Badge className="bg-muted text-foreground border-border">₹{(data?.totalAmount || 0).toLocaleString()}</Badge>
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
            <p className="text-xs font-semibold text-foreground">₹{g.amount.toLocaleString()}</p>
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
          .select('check_in, check_out, attendance_status, hr_employees!hr_attendance_employee_id_fkey(first_name, last_name)')
          .eq('attendance_date', today),
      ]);
      const all = attendance || [];
      const present = all.filter((a: any) => a.attendance_status === 'present' || a.attendance_status === 'late').length;
      const absent = all.filter((a: any) => a.attendance_status === 'absent').length;
      const late = all.filter((a: any) => a.attendance_status === 'late').length;
      const activeNow = all
        .filter((a: any) => a.check_in && !a.check_out)
        .map((a: any) => ({
          name: `${a.hr_employees?.first_name || ''} ${a.hr_employees?.last_name || ''}`.trim(),
          checkIn: a.check_in,
        }));
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
    queryKey: ['widget_inventory_status'],
    queryFn: async () => {
      const { data: wallets } = await supabase.from('wallet_asset_balances').select('asset_code, balance');
      const totals: Record<string, number> = {};
      (wallets || []).forEach((w: any) => { totals[w.asset_code] = (totals[w.asset_code] || 0) + Number(w.balance || 0); });
      return Object.entries(totals).map(([code, balance]) => ({ code, balance })).sort((a, b) => b.balance - a.balance);
    },
    staleTime: 30000,
  });

  if (isLoading) return <WidgetLoader />;

  return (
    <div className="p-4 space-y-2.5">
      {(data || []).length === 0 && <p className="text-sm text-gray-400 text-center py-4">No assets</p>}
      {(data || []).slice(0, 5).map(a => (
        <div key={a.code} className="flex items-center justify-between">
          <span className="text-sm text-gray-700 font-medium">{a.code}</span>
          <span className="text-sm font-semibold text-gray-900">{a.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        </div>
      ))}
    </div>
  );
}

// ── Upcoming Tasks (Pending Approvals) ──
export function UpcomingTasksWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['widget_upcoming_tasks'],
    queryFn: async () => {
      const [{ count: pendingKyc }, { count: pendingLeave }, { count: pendingOnboard }] = await Promise.all([
        supabase.from('client_onboarding_approvals').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending'),
        supabase.from('hr_leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('hr_candidates').select('id', { count: 'exact', head: true }).eq('start_onboard', true).eq('hired', false),
      ]);
      return [
        { label: 'KYC Approvals', count: pendingKyc || 0, color: 'bg-red-500', urgency: pendingKyc && pendingKyc > 0 ? 'Urgent' : 'Clear' },
        { label: 'Leave Requests', count: pendingLeave || 0, color: 'bg-yellow-500', urgency: pendingLeave && pendingLeave > 0 ? 'Pending' : 'Clear' },
        { label: 'Onboarding', count: pendingOnboard || 0, color: 'bg-blue-500', urgency: 'In Progress' },
      ];
    },
    staleTime: 30000,
  });

  if (isLoading) return <WidgetLoader />;

  return (
    <div className="p-4 space-y-3">
      {(data || []).map(t => (
        <div key={t.label} className="flex items-center gap-3">
          <div className={`w-2 h-2 ${t.color} rounded-full flex-shrink-0`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">{t.label}</p>
            <p className="text-xs text-gray-500">{t.count > 0 ? `${t.count} ${t.urgency.toLowerCase()}` : 'All clear'}</p>
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
