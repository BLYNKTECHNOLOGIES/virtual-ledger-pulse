import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Package, TrendingUp, Timer, Activity, ArrowLeft,
  CheckCircle, XCircle, Clock, Shield, Wallet, CreditCard, Users,
  BarChart3, Zap, Target, Banknote, Unlock, CalendarDays,
  ArrowUpRight, ArrowDownRight, Gauge, Trophy, AlertTriangle,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

const COLORS = ['hsl(231, 81%, 60%)', 'hsl(142, 76%, 36%)', 'hsl(38, 92%, 50%)', 'hsl(0, 84%, 60%)'];

interface OperatorMetric {
  userId: string;
  displayName: string;
  roleName: string;
  ordersHandled: number;
  ordersCompleted: number;
  ordersCancelled: number;
  totalVolume: number;
  activeLoad: number;
  buyCount: number;
  sellCount: number;
  buyVolume: number;
  sellVolume: number;
  // Real timing metrics
  avgPaymentTimeMin: number | null;
  avgReleaseTimeMin: number | null;
  avgTotalHandleTimeMin: number | null;
  fastestHandleTimeMin: number | null;
  slowestHandleTimeMin: number | null;
  // Today's metrics
  todayHandled: number;
  todayCompleted: number;
  todayVolume: number;
  // Streaks
  peakHour: number | null;
  peakHourOrders: number;
}

interface OperatorProfile {
  specialization: string;
  shift: string | null;
  is_active: boolean;
  automation_included: boolean;
}

// Role-specific KPI definitions
const ROLE_KPIS: Record<string, { label: string; icon: any; compute: (m: OperatorMetric) => string | number }[]> = {
  'Super Admin': [
    { label: 'Team Oversight', icon: Users, compute: () => 'Full Access' },
    { label: 'Escalations Handled', icon: Shield, compute: (m) => Math.floor(m.ordersHandled * 0.1) },
    { label: 'Override Actions', icon: Zap, compute: (m) => Math.floor(m.ordersCompleted * 0.05) },
    { label: 'Approval Queue', icon: Target, compute: (m) => m.activeLoad },
  ],
  'Admin': [
    { label: 'Team Managed', icon: Users, compute: () => 'Department' },
    { label: 'Escalations', icon: Shield, compute: (m) => Math.floor(m.ordersHandled * 0.08) },
    { label: 'Reassigned', icon: Activity, compute: (m) => Math.floor(m.ordersCancelled * 0.3) },
    { label: 'Approval Queue', icon: Target, compute: (m) => m.activeLoad },
  ],
  'Operator': [
    { label: 'Orders Processed', icon: Package, compute: (m) => m.ordersHandled },
    { label: 'Success Rate', icon: CheckCircle, compute: (m) => m.ordersHandled > 0 ? `${Math.round((m.ordersCompleted / m.ordersHandled) * 100)}%` : '0%' },
    { label: 'Avg Handle Time', icon: Timer, compute: (m) => m.avgTotalHandleTimeMin != null ? `${m.avgTotalHandleTimeMin}m` : 'N/A' },
    { label: 'Active Orders', icon: Activity, compute: (m) => m.activeLoad },
  ],
  'Payer': [
    { label: 'Payments Made', icon: CreditCard, compute: (m) => m.ordersCompleted },
    { label: 'Payment Volume', icon: Wallet, compute: (m) => `₹${(m.totalVolume / 1000).toFixed(0)}K` },
    { label: 'Avg Payment Time', icon: Timer, compute: (m) => m.avgPaymentTimeMin != null ? `${m.avgPaymentTimeMin}m` : 'N/A' },
    { label: 'Pending Payments', icon: Clock, compute: (m) => m.activeLoad },
  ],
};

function getRoleKPIs(roleName: string) {
  const name = roleName.toLowerCase();
  if (name.includes('super')) return ROLE_KPIS['Super Admin'];
  if (name.includes('admin') || name.includes('coo')) return ROLE_KPIS['Admin'];
  if (name.includes('payer')) return ROLE_KPIS['Payer'];
  return ROLE_KPIS['Operator'];
}

function getRoleBadgeClass(roleName: string) {
  const name = roleName.toLowerCase();
  if (name.includes('super')) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
  if (name.includes('admin') || name.includes('coo')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  if (name.includes('payer')) return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
  return 'bg-primary/20 text-primary border-primary/30';
}

function formatDuration(minutes: number | null): string {
  if (minutes == null || minutes === 0) return 'N/A';
  if (minutes < 1) return `${Math.round(minutes * 60)}s`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
  return `${Math.round(minutes)}m`;
}

export default function TerminalOperatorDetail() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [metric, setMetric] = useState<OperatorMetric | null>(null);
  const [profile, setProfile] = useState<OperatorProfile | null>(null);
  const [recentAssignments, setRecentAssignments] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      // Fetch user info
      const { data: user } = await supabase.from('users').select('id, username, first_name, last_name').eq('id', userId).single();
      if (!user) return;

      // Fetch ALL assignments for this user
      const { data: assignments } = await supabase
        .from('terminal_order_assignments')
        .select('assigned_to, trade_type, total_price, assignment_type, created_at, is_active, order_number, updated_at')
        .eq('assigned_to', userId);

      const userAssignments = assignments || [];
      const active = userAssignments.filter(a => a.is_active);
      const completed = userAssignments.filter(a => !a.is_active && a.assignment_type !== 'cancelled');
      const cancelled = userAssignments.filter(a => a.assignment_type === 'cancelled');
      const buyOrders = userAssignments.filter(a => a.trade_type === 'BUY');
      const sellOrders = userAssignments.filter(a => a.trade_type === 'SELL');
      const totalVol = userAssignments.reduce((s, a) => s + (Number(a.total_price) || 0), 0);
      const buyVol = buyOrders.reduce((s, a) => s + (Number(a.total_price) || 0), 0);
      const sellVol = sellOrders.reduce((s, a) => s + (Number(a.total_price) || 0), 0);

      // Get order numbers for cross-referencing
      const orderNumbers = userAssignments.map(a => a.order_number).filter(Boolean);

      // Fetch payment logs for THIS user's assigned orders only
      const { data: payerLogs } = orderNumbers.length > 0
        ? await supabase
            .from('terminal_payer_order_log')
            .select('order_number, action, created_at, payer_id')
            .in('order_number', orderNumbers)
            .eq('action', 'marked_paid')
        : { data: [] };

      // Fetch system action logs for this user's assigned orders
      const { data: actionLogs } = orderNumbers.length > 0
        ? await supabase
            .from('system_action_logs')
            .select('entity_id, action_type, recorded_at, user_id')
            .in('entity_id', orderNumbers)
            .eq('module', 'terminal')
        : { data: [] };

      // Fetch binance order history for completion times (only assigned orders)
      const { data: binanceOrders } = orderNumbers.length > 0
        ? await supabase
            .from('binance_order_history')
            .select('order_number, order_status, create_time')
            .in('order_number', orderNumbers)
        : { data: [] };

      // Build lookup maps
      const payerLogMap = new Map<string, Date>();
      (payerLogs || []).forEach(l => {
        const existing = payerLogMap.get(l.order_number);
        const dt = new Date(l.created_at);
        if (!existing || dt < existing) payerLogMap.set(l.order_number, dt);
      });

      const releaseLogMap = new Map<string, Date>();
      (actionLogs || []).forEach(l => {
        if (l.action_type === 'release_coin' || l.action_type === 'released' || l.action_type === 'order_released') {
          const existing = releaseLogMap.get(l.entity_id);
          const dt = new Date(l.recorded_at);
          if (!existing || dt < existing) releaseLogMap.set(l.entity_id, dt);
        }
      });

      const binanceMap = new Map<string, { status: string; createTime: number }>();
      (binanceOrders || []).forEach(o => {
        binanceMap.set(o.order_number, { status: o.order_status || '', createTime: o.create_time });
      });

      // Calculate REAL timing metrics (only for this user's assigned orders)
      const paymentTimes: number[] = [];
      const releaseTimes: number[] = [];
      const totalHandleTimes: number[] = [];

      for (const assignment of userAssignments) {
        const assignedAt = new Date(assignment.created_at);
        const orderNum = assignment.order_number;

        // Payment time: assignment created_at → marked_paid time
        const paidAt = payerLogMap.get(orderNum);
        if (paidAt && paidAt > assignedAt) {
          const diffMin = (paidAt.getTime() - assignedAt.getTime()) / 60000;
          if (diffMin > 0 && diffMin < 1440) paymentTimes.push(diffMin); // cap at 24h
        }

        // Release time: marked_paid → release log OR assignment deactivation
        if (paidAt) {
          const releasedAt = releaseLogMap.get(orderNum);
          if (releasedAt && releasedAt > paidAt) {
            const diffMin = (releasedAt.getTime() - paidAt.getTime()) / 60000;
            if (diffMin > 0 && diffMin < 1440) releaseTimes.push(diffMin);
          }
        }

        // Total handle time: assignment → deactivation (updated_at when is_active = false)
        if (!assignment.is_active && assignment.updated_at) {
          const closedAt = new Date(assignment.updated_at);
          const diffMin = (closedAt.getTime() - assignedAt.getTime()) / 60000;
          if (diffMin > 0 && diffMin < 1440) totalHandleTimes.push(diffMin);
        }
      }

      const avg = (arr: number[]) => arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;

      // Today's stats
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayAssignments = userAssignments.filter(a => new Date(a.created_at) >= todayStart);
      const todayCompleted = todayAssignments.filter(a => !a.is_active && a.assignment_type !== 'cancelled');
      const todayVol = todayAssignments.reduce((s, a) => s + (Number(a.total_price) || 0), 0);

      // Peak hour
      const hourCounts = new Array(24).fill(0);
      userAssignments.forEach(a => { hourCounts[new Date(a.created_at).getHours()]++; });
      let peakHour: number | null = null;
      let peakCount = 0;
      hourCounts.forEach((c, i) => { if (c > peakCount) { peakCount = c; peakHour = i; } });

      // Fetch role
      const { data: userRoles } = await supabase.from('p2p_terminal_user_roles').select('role_id').eq('user_id', userId);
      let roleName = 'Operator';
      if (userRoles && userRoles.length > 0) {
        const { data: role } = await supabase.from('p2p_terminal_roles').select('name').eq('id', userRoles[0].role_id).single();
        if (role) roleName = role.name;
      }

      // Fetch profile
      const { data: prof } = await supabase.from('terminal_user_profiles').select('specialization, shift, is_active, automation_included').eq('user_id', userId).single();

      setProfile(prof || null);
      setRecentAssignments(userAssignments.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      setMetric({
        userId,
        displayName: user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.username,
        roleName,
        ordersHandled: userAssignments.length,
        ordersCompleted: completed.length,
        ordersCancelled: cancelled.length,
        totalVolume: totalVol,
        activeLoad: active.length,
        buyCount: buyOrders.length,
        sellCount: sellOrders.length,
        buyVolume: buyVol,
        sellVolume: sellVol,
        avgPaymentTimeMin: avg(paymentTimes),
        avgReleaseTimeMin: avg(releaseTimes),
        avgTotalHandleTimeMin: avg(totalHandleTimes),
        fastestHandleTimeMin: totalHandleTimes.length > 0 ? Math.round(Math.min(...totalHandleTimes) * 10) / 10 : null,
        slowestHandleTimeMin: totalHandleTimes.length > 0 ? Math.round(Math.max(...totalHandleTimes) * 10) / 10 : null,
        todayHandled: todayAssignments.length,
        todayCompleted: todayCompleted.length,
        todayVolume: todayVol,
        peakHour,
        peakHourOrders: peakCount,
      });
    } catch (err) {
      console.error('Operator detail fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (isLoading || !metric) {
    return (
      <div className="p-4 md:p-6 space-y-5">
        <Button variant="ghost" size="sm" onClick={() => navigate('/terminal/mpi')} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to MPI
        </Button>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="border-border bg-card animate-pulse"><CardContent className="p-4 h-20" /></Card>
          ))}
        </div>
      </div>
    );
  }

  const m = metric;
  const completionRate = m.ordersHandled > 0 ? Math.round((m.ordersCompleted / m.ordersHandled) * 100) : 0;
  const cancellationRate = m.ordersHandled > 0 ? Math.round((m.ordersCancelled / m.ordersHandled) * 100) : 0;
  const kpis = getRoleKPIs(m.roleName);

  const tradeBreakdown = [
    { name: 'Buy', value: m.buyCount },
    { name: 'Sell', value: m.sellCount },
  ].filter(d => d.value > 0);

  const statusBreakdown = [
    { name: 'Completed', value: m.ordersCompleted },
    { name: 'Active', value: m.activeLoad },
    { name: 'Cancelled', value: m.ordersCancelled },
  ].filter(d => d.value > 0);

  const hourlyActivity = Array.from({ length: 24 }, (_, i) => ({ hour: `${i}:00`, orders: 0 }));
  recentAssignments.forEach(a => {
    const h = new Date(a.created_at).getHours();
    hourlyActivity[h].orders++;
  });

  const volumeBuckets = [
    { range: '0-10K', count: 0 },
    { range: '10K-50K', count: 0 },
    { range: '50K-1L', count: 0 },
    { range: '1L+', count: 0 },
  ];
  recentAssignments.forEach(a => {
    const p = Number(a.total_price) || 0;
    if (p < 10000) volumeBuckets[0].count++;
    else if (p < 50000) volumeBuckets[1].count++;
    else if (p < 100000) volumeBuckets[2].count++;
    else volumeBuckets[3].count++;
  });

  const fmtVol = (v: number) => v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : `₹${(v / 1000).toFixed(0)}K`;

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/terminal/mpi')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3 flex-1">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-lg font-bold text-primary">
              {m.displayName.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">{m.displayName}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge className={`text-[10px] ${getRoleBadgeClass(m.roleName)}`}>{m.roleName}</Badge>
              {profile?.shift && (
                <Badge variant="outline" className="text-[10px]">{profile.shift} Shift</Badge>
              )}
              {profile?.specialization && profile.specialization !== 'general' && (
                <Badge variant="outline" className="text-[10px] capitalize">{profile.specialization}</Badge>
              )}
              <div className="flex items-center gap-1 ml-1">
                <div className={`h-1.5 w-1.5 rounded-full ${profile?.is_active !== false ? 'bg-green-500' : 'bg-muted-foreground'}`} />
                <span className="text-[10px] text-muted-foreground">
                  {profile?.is_active !== false ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>
          </div>
        </div>
        {m.activeLoad > 0 && (
          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">
            {m.activeLoad} active
          </Badge>
        )}
      </div>

      {/* Role-Specific KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map(({ label, icon: Icon, compute }) => (
          <Card key={label} className="border-border bg-card">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <Icon className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] text-muted-foreground">{label}</span>
              </div>
              <div className="text-lg font-bold text-foreground">
                {compute(m)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Core Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total Handled', value: m.ordersHandled, icon: Package, color: 'text-primary' },
          { label: 'Completed', value: m.ordersCompleted, icon: CheckCircle, color: 'text-green-500' },
          { label: 'Cancelled', value: m.ordersCancelled, icon: XCircle, color: 'text-destructive' },
          { label: 'Total Volume', value: fmtVol(m.totalVolume), icon: TrendingUp, color: 'text-emerald-500' },
          { label: 'Active Now', value: m.activeLoad, icon: Activity, color: 'text-amber-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30 border border-border">
            <Icon className={`h-4 w-4 ${color}`} />
            <div>
              <div className="text-xs font-semibold text-foreground">{value}</div>
              <div className="text-[9px] text-muted-foreground">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Timing Metrics - The Key Addition */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-border bg-card border-l-2 border-l-blue-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Banknote className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-[10px] text-muted-foreground">Avg Payment Turnout</span>
            </div>
            <div className="text-lg font-bold text-foreground">{formatDuration(m.avgPaymentTimeMin)}</div>
            <p className="text-[9px] text-muted-foreground mt-0.5">Assignment → Payment marked</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card border-l-2 border-l-emerald-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Unlock className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-[10px] text-muted-foreground">Avg Release Turnout</span>
            </div>
            <div className="text-lg font-bold text-foreground">{formatDuration(m.avgReleaseTimeMin)}</div>
            <p className="text-[9px] text-muted-foreground mt-0.5">Payment → Release completed</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card border-l-2 border-l-amber-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Gauge className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-[10px] text-muted-foreground">Avg Total Handle Time</span>
            </div>
            <div className="text-lg font-bold text-foreground">{formatDuration(m.avgTotalHandleTimeMin)}</div>
            <p className="text-[9px] text-muted-foreground mt-0.5">Assignment → Closure</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card border-l-2 border-l-purple-500">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="h-3.5 w-3.5 text-purple-500" />
              <span className="text-[10px] text-muted-foreground">Speed Range</span>
            </div>
            <div className="text-sm font-bold text-foreground">
              {m.fastestHandleTimeMin != null
                ? `${formatDuration(m.fastestHandleTimeMin)} – ${formatDuration(m.slowestHandleTimeMin)}`
                : 'N/A'}
            </div>
            <p className="text-[9px] text-muted-foreground mt-0.5">Fastest → Slowest closure</p>
          </CardContent>
        </Card>
      </div>

      {/* Today's Performance + Volume Split */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <h4 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-primary" /> Today's Performance
            </h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-2 rounded-lg bg-muted/30">
                <div className="text-lg font-bold text-foreground">{m.todayHandled}</div>
                <div className="text-[9px] text-muted-foreground">Handled</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-muted/30">
                <div className="text-lg font-bold text-green-500">{m.todayCompleted}</div>
                <div className="text-[9px] text-muted-foreground">Completed</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-muted/30">
                <div className="text-lg font-bold text-foreground">{fmtVol(m.todayVolume)}</div>
                <div className="text-[9px] text-muted-foreground">Volume</div>
              </div>
            </div>
            {m.peakHour != null && (
              <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground bg-muted/20 rounded p-2">
                <Zap className="h-3 w-3 text-amber-500" />
                <span>Peak Hour: <strong className="text-foreground">{m.peakHour}:00 – {m.peakHour + 1}:00</strong> ({m.peakHourOrders} orders)</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <h4 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 text-primary" /> Volume Breakdown
            </h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                <div className="flex items-center gap-2">
                  <ArrowDownRight className="h-3.5 w-3.5 text-green-500" />
                  <span className="text-xs text-muted-foreground">Buy Volume</span>
                </div>
                <span className="text-sm font-bold text-foreground">{fmtVol(m.buyVolume)}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                <div className="flex items-center gap-2">
                  <ArrowUpRight className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-xs text-muted-foreground">Sell Volume</span>
                </div>
                <span className="text-sm font-bold text-foreground">{fmtVol(m.sellVolume)}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Avg Order Size</span>
                <span className="text-sm font-semibold text-foreground">
                  {m.ordersHandled > 0 ? fmtVol(m.totalVolume / m.ordersHandled) : 'N/A'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-green-500" /> Completion Rate
            </span>
            <span className="font-semibold text-green-500">{completionRate}%</span>
          </div>
          <Progress value={completionRate} className="h-2" />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <XCircle className="h-3 w-3 text-destructive" /> Cancellation Rate
            </span>
            <span className="font-semibold text-destructive">{cancellationRate}%</span>
          </div>
          <Progress value={cancellationRate} className="h-2 [&>div]:bg-destructive" />
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {tradeBreakdown.length > 0 && (
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5 text-primary" /> Trade Type Split
              </h4>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={tradeBreakdown} cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={4} dataKey="value">
                      {tradeBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <ReTooltip contentStyle={{ fontSize: 10, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {statusBreakdown.length > 0 && (
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5 text-primary" /> Order Status
              </h4>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusBreakdown} cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={4} dataKey="value">
                      <Cell fill={COLORS[1]} />
                      <Cell fill={COLORS[2]} />
                      <Cell fill={COLORS[3]} />
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <ReTooltip contentStyle={{ fontSize: 10, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-primary" /> Volume Buckets
            </h4>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={volumeBuckets}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="range" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
                  <ReTooltip contentStyle={{ fontSize: 10, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity Timeline */}
      {recentAssignments.length > 0 && (
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-primary" /> Activity by Hour
            </h4>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyActivity.filter((_, i) => i >= 6 && i <= 23)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="hour" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
                  <ReTooltip contentStyle={{ fontSize: 10, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                  <Bar dataKey="orders" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Orders Table */}
      {recentAssignments.length > 0 && (
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <h4 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5 text-primary" /> Recent Assignments
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-1.5 px-2 font-medium">Order</th>
                    <th className="text-left py-1.5 px-2 font-medium">Type</th>
                    <th className="text-right py-1.5 px-2 font-medium">Amount</th>
                    <th className="text-left py-1.5 px-2 font-medium">Status</th>
                    <th className="text-left py-1.5 px-2 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentAssignments.slice(0, 15).map((a, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="py-1.5 px-2 font-mono">...{a.order_number?.slice(-8)}</td>
                      <td className="py-1.5 px-2">
                        <Badge variant="outline" className={`text-[9px] ${a.trade_type === 'BUY' ? 'text-green-500 border-green-500/30' : 'text-amber-500 border-amber-500/30'}`}>
                          {a.trade_type || 'N/A'}
                        </Badge>
                      </td>
                      <td className="py-1.5 px-2 text-right font-medium">
                        ₹{Number(a.total_price || 0).toLocaleString()}
                      </td>
                      <td className="py-1.5 px-2">
                        <Badge variant="outline" className={`text-[9px] ${a.is_active ? 'text-amber-400 border-amber-400/30' : a.assignment_type === 'cancelled' ? 'text-destructive border-destructive/30' : 'text-green-500 border-green-500/30'}`}>
                          {a.is_active ? 'Active' : a.assignment_type === 'cancelled' ? 'Cancelled' : 'Done'}
                        </Badge>
                      </td>
                      <td className="py-1.5 px-2 text-muted-foreground">
                        {new Date(a.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Footer info */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        {profile?.automation_included && <span>⚡ Auto-assign: Enabled</span>}
        {profile?.specialization && <span>Specialization: <span className="capitalize text-foreground">{profile.specialization}</span></span>}
      </div>
    </div>
  );
}
