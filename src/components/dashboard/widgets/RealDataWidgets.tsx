import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { format, subDays, startOfDay, endOfDay, subMonths } from "date-fns";
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
      const { data } = await supabase.from('bank_transactions').select('category, amount, transaction_type').eq('transaction_type', 'EXPENSE').order('created_at', { ascending: false }).limit(500);
      const catMap: Record<string, number> = {};
      (data || []).forEach((t: any) => {
        const cat = t.category || 'Uncategorized';
        catMap[cat] = (catMap[cat] || 0) + Math.abs(Number(t.amount));
      });
      return Object.entries(catMap).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 6);
    },
    staleTime: 60000,
  });

  if (isLoading) return <WidgetLoader />;

  return (
    <div className="p-4 space-y-2.5">
      {(data || []).length === 0 && <p className="text-sm text-gray-400 text-center py-4">No expense data</p>}
      {(data || []).map((e, i) => (
        <div key={e.name} className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{e.name}</p>
          </div>
          <div className="text-sm font-semibold text-gray-900">₹{e.amount.toLocaleString()}</div>
        </div>
      ))}
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
        days.push({ label: format(d, 'EEE'), start: startOfDay(d).toISOString(), end: endOfDay(d).toISOString() });
      }
      const results = await Promise.all(days.map(async day => {
        const { data: txns } = await supabase.from('bank_transactions').select('amount, transaction_type').gte('transaction_date', day.start.split('T')[0]).lte('transaction_date', day.end.split('T')[0]);
        let income = 0, expense = 0;
        (txns || []).forEach((t: any) => {
          if (t.transaction_type === 'INCOME' || t.transaction_type === 'TRANSFER_IN') income += Math.abs(Number(t.amount));
          else if (t.transaction_type === 'EXPENSE') expense += Math.abs(Number(t.amount));
        });
        return { name: day.label, income, expense };
      }));
      return results;
    },
    staleTime: 60000,
  });

  if (isLoading) return <WidgetLoader />;

  return (
    <div className="p-4">
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data || []}>
          <XAxis dataKey="name" fontSize={10} tick={{ fill: '#9ca3af' }} axisLine={false} tickLine={false} />
          <YAxis fontSize={10} tick={{ fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
          <Tooltip formatter={(v: any) => `₹${Number(v).toLocaleString()}`} contentStyle={{ fontSize: 11 }} />
          <Bar dataKey="income" fill="#10B981" radius={[3, 3, 0, 0]} name="Income" />
          <Bar dataKey="expense" fill="#EF4444" radius={[3, 3, 0, 0]} name="Expense" />
        </BarChart>
      </ResponsiveContainer>
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
        months.push({ label: format(d, 'MMM'), start: startOfDay(new Date(d.getFullYear(), d.getMonth(), 1)).toISOString().split('T')[0], end: endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0)).toISOString().split('T')[0] });
      }
      const results = await Promise.all(months.map(async m => {
        const { data } = await supabase.from('bank_transactions').select('amount').eq('transaction_type', 'EXPENSE').gte('transaction_date', m.start).lte('transaction_date', m.end);
        const total = (data || []).reduce((s: number, t: any) => s + Math.abs(Number(t.amount)), 0);
        return { name: m.label, expense: total };
      }));
      return results;
    },
    staleTime: 60000,
  });

  if (isLoading) return <WidgetLoader />;

  return (
    <div className="p-4">
      <ResponsiveContainer width="100%" height={120}>
        <RechartsLineChart data={data || []}>
          <XAxis dataKey="name" fontSize={10} tick={{ fill: '#9ca3af' }} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v: any) => `₹${Number(v).toLocaleString()}`} contentStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="expense" stroke="#EF4444" strokeWidth={2} dot={{ r: 3 }} />
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Pending Settlements Widget (real data) ──
export function PendingSettlementsWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['widget_pending_settlements'],
    queryFn: async () => {
      const { data, count } = await supabase.from('purchase_orders').select('id, order_number, supplier_name, total_amount, status', { count: 'exact' }).in('status', ['PENDING', 'APPROVED']).order('created_at', { ascending: false }).limit(5);
      return { orders: data || [], total: count || 0 };
    },
    refetchInterval: 30000,
  });

  if (isLoading) return <WidgetLoader />;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-600">Pending</span>
        <Badge className="bg-amber-100 text-amber-800">{data?.total || 0} orders</Badge>
      </div>
      <div className="space-y-2">
        {(data?.orders || []).length === 0 && <p className="text-xs text-gray-400 text-center py-2">No pending settlements</p>}
        {(data?.orders || []).map((o: any) => (
          <div key={o.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-900 truncate">{o.order_number}</p>
              <p className="text-[10px] text-gray-500 truncate">{o.supplier_name}</p>
            </div>
            <span className="text-xs font-semibold text-gray-900">₹{Number(o.total_amount).toLocaleString()}</span>
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
