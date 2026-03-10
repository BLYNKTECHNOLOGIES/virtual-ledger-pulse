import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Package, TrendingUp, Timer, Activity, ArrowLeft,
  CheckCircle, XCircle, Clock, Shield, Wallet, CreditCard, Users,
  BarChart3, Zap, Target, Banknote, Unlock, CalendarDays,
  ArrowUpRight, ArrowDownRight, Gauge, Trophy, AlertTriangle,
  MessageSquare, RefreshCw, Star, UserCheck, Lock,
  ClipboardList, Link2, Hash,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, AreaChart, Area,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

const COLORS = ['hsl(231, 81%, 60%)', 'hsl(142, 76%, 36%)', 'hsl(38, 92%, 50%)', 'hsl(0, 84%, 60%)', 'hsl(262, 83%, 48%)'];

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
  avgPaymentTimeMin: number | null;
  avgReleaseTimeMin: number | null;
  avgTotalHandleTimeMin: number | null;
  fastestHandleTimeMin: number | null;
  slowestHandleTimeMin: number | null;
  medianHandleTimeMin: number | null;
  todayHandled: number;
  todayCompleted: number;
  todayVolume: number;
  peakHour: number | null;
  peakHourOrders: number;
  // Action counts
  paymentsMade: number;
  releasesPerformed: number;
  chatMessagesSent: number;
  escalationsHandled: number;
  approvalActions: number;
  // Efficiency
  efficiencyScore: number;
  completionRate: number;
  cancellationRate: number;
}

interface DailyTrend {
  date: string;
  orders: number;
  volume: number;
  completed: number;
  cancelled: number;
}

interface ActionDetail {
  action_type: string;
  count: number;
  label: string;
  icon: any;
  color: string;
}

interface OperatorProfile {
  specialization: string;
  shift: string | null;
  is_active: boolean;
  automation_included: boolean;
}

function getRoleBadgeClass(roleName: string) {
  const name = roleName.toLowerCase();
  if (name.includes('super')) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
  if (name.includes('admin') || name.includes('coo')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  if (name.includes('payer') && name.includes('operator')) return 'bg-pink-500/20 text-pink-400 border-pink-500/30';
  if (name.includes('payer')) return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
  return 'bg-primary/20 text-primary border-primary/30';
}

function formatDuration(minutes: number | null): string {
  if (minutes == null || minutes === 0) return 'N/A';
  if (minutes < 1) return `${Math.round(minutes * 60)}s`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
  return `${Math.round(minutes * 10) / 10}m`;
}

function getScoreColor(score: number) {
  if (score >= 80) return 'text-green-500';
  if (score >= 60) return 'text-amber-500';
  if (score >= 40) return 'text-orange-500';
  return 'text-destructive';
}

function computeEfficiencyScore(m: {
  completionRate: number;
  avgTotalHandleTimeMin: number | null;
  ordersHandled: number;
  ordersCancelled: number;
}): number {
  let score = 0;
  score += m.completionRate * 0.4;
  if (m.avgTotalHandleTimeMin != null && m.avgTotalHandleTimeMin > 0) {
    score += Math.max(0, Math.min(100, 100 - ((m.avgTotalHandleTimeMin - 5) / 25) * 100)) * 0.3;
  } else if (m.ordersHandled > 0) {
    score += 50 * 0.3;
  }
  score += Math.min(100, (m.ordersHandled / 20) * 100) * 0.2;
  const cancelRate = m.ordersHandled > 0 ? (m.ordersCancelled / m.ordersHandled) * 100 : 0;
  score += Math.max(0, 100 - cancelRate * 5) * 0.1;
  return Math.round(Math.max(0, Math.min(100, score)));
}

const fmtVol = (v: number) => v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : `₹${(v / 1000).toFixed(0)}K`;

export default function TerminalOperatorDetail() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [metric, setMetric] = useState<OperatorMetric | null>(null);
  const [profile, setProfile] = useState<OperatorProfile | null>(null);
  const [recentAssignments, setRecentAssignments] = useState<any[]>([]);
  const [dailyTrends, setDailyTrends] = useState<DailyTrend[]>([]);
  const [actionDetails, setActionDetails] = useState<ActionDetail[]>([]);
  const [payerAssignData, setPayerAssignData] = useState<any[]>([]);
  const [operatorAssignData, setOperatorAssignData] = useState<any[]>([]);
  const [payerLockData, setPayerLockData] = useState<any[]>([]);
  const [sizeRangeNames, setSizeRangeNames] = useState<Map<string, string>>(new Map());
  const [activeTab, setActiveTab] = useState('overview');
  const [trendDays, setTrendDays] = useState('7');

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      // Parallel fetch core data
      const [userRes, assignmentsRes, payerLogsRes, actionLogsRes, userRolesRes, profileRes, payerAssignRes, operatorAssignRes, payerLocksRes, sizeRangesRes] = await Promise.all([
        supabase.from('users').select('id, username, first_name, last_name').eq('id', userId).single(),
        supabase.from('terminal_order_assignments')
          .select('assigned_to, trade_type, total_price, assignment_type, created_at, is_active, order_number, updated_at')
          .eq('assigned_to', userId),
        supabase.from('terminal_payer_order_log')
          .select('order_number, action, created_at, payer_id')
          .eq('payer_id', userId),
        supabase.from('system_action_logs')
          .select('entity_id, action_type, recorded_at, user_id, module')
          .eq('module', 'terminal')
          .eq('user_id', userId),
        supabase.from('p2p_terminal_user_roles').select('role_id').eq('user_id', userId),
        supabase.from('terminal_user_profiles').select('specialization, shift, is_active, automation_included').eq('user_id', userId).single(),
        supabase.from('terminal_payer_assignments').select('*').eq('payer_user_id', userId),
        supabase.from('terminal_operator_assignments').select('*').eq('operator_user_id', userId),
        supabase.from('terminal_payer_order_locks').select('*').eq('payer_user_id', userId),
        supabase.from('terminal_order_size_ranges').select('id, name, min_amount, max_amount'),
      ]);

      const user = userRes.data;
      if (!user) return;

      const userAssignments = assignmentsRes.data || [];
      const payerLogs = payerLogsRes.data || [];
      const actionLogs = actionLogsRes.data || [];

      // Get role name
      let roleName = 'Operator';
      if (userRolesRes.data && userRolesRes.data.length > 0) {
        const roleIds = userRolesRes.data.map(r => r.role_id);
        const { data: roles } = await supabase.from('p2p_terminal_roles').select('name').in('id', roleIds);
        if (roles && roles.length > 0) {
          roleName = roles.map(r => r.name).filter(n => n.toLowerCase() !== 'viewer').join('/') || roles[0].name;
        }
      }

      // Core stats
      const active = userAssignments.filter(a => a.is_active);
      const completed = userAssignments.filter(a => !a.is_active && a.assignment_type !== 'cancelled');
      const cancelled = userAssignments.filter(a => a.assignment_type === 'cancelled');
      const buyOrders = userAssignments.filter(a => a.trade_type === 'BUY');
      const sellOrders = userAssignments.filter(a => a.trade_type === 'SELL');
      const totalVol = userAssignments.reduce((s, a) => s + (Number(a.total_price) || 0), 0);
      const buyVol = buyOrders.reduce((s, a) => s + (Number(a.total_price) || 0), 0);
      const sellVol = sellOrders.reduce((s, a) => s + (Number(a.total_price) || 0), 0);

      // Order numbers for cross-referencing
      const orderNumbers = userAssignments.map(a => a.order_number).filter(Boolean);

      // Index payer logs by order
      const payerLogByOrder = new Map<string, Date>();
      payerLogs.forEach(l => {
        if (l.action === 'marked_paid') {
          const dt = new Date(l.created_at);
          const existing = payerLogByOrder.get(l.order_number);
          if (!existing || dt < existing) payerLogByOrder.set(l.order_number, dt);
        }
      });

      // Index action logs by order
      const releaseLogByOrder = new Map<string, Date>();
      actionLogs.forEach(l => {
        if (['release_coin', 'released', 'order_released'].includes(l.action_type)) {
          const dt = new Date(l.recorded_at);
          const existing = releaseLogByOrder.get(l.entity_id);
          if (!existing || dt < existing) releaseLogByOrder.set(l.entity_id, dt);
        }
      });

      // Timing metrics
      const paymentTimes: number[] = [];
      const releaseTimes: number[] = [];
      const handleTimes: number[] = [];

      for (const assignment of userAssignments) {
        const assignedAt = new Date(assignment.created_at);
        const orderNum = assignment.order_number;

        const paidAt = payerLogByOrder.get(orderNum);
        if (paidAt && paidAt > assignedAt) {
          const diffMin = (paidAt.getTime() - assignedAt.getTime()) / 60000;
          if (diffMin > 0 && diffMin < 1440) paymentTimes.push(diffMin);
        }

        if (paidAt) {
          const releasedAt = releaseLogByOrder.get(orderNum);
          if (releasedAt && releasedAt > paidAt) {
            const diffMin = (releasedAt.getTime() - paidAt.getTime()) / 60000;
            if (diffMin > 0 && diffMin < 1440) releaseTimes.push(diffMin);
          }
        }

        if (!assignment.is_active && assignment.updated_at) {
          const closedAt = new Date(assignment.updated_at);
          const diffMin = (closedAt.getTime() - assignedAt.getTime()) / 60000;
          if (diffMin > 0 && diffMin < 1440) handleTimes.push(diffMin);
        }
      }

      const avg = (arr: number[]) => arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;
      const median = (arr: number[]) => {
        if (arr.length === 0) return null;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return Math.round((sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
      };

      // Today's stats
      const todayStart = startOfDay(new Date());
      const todayAssignments = userAssignments.filter(a => new Date(a.created_at) >= todayStart);
      const todayCompletedArr = todayAssignments.filter(a => !a.is_active && a.assignment_type !== 'cancelled');
      const todayVol = todayAssignments.reduce((s, a) => s + (Number(a.total_price) || 0), 0);

      // Peak hour
      const hourCounts = new Array(24).fill(0);
      userAssignments.forEach(a => { hourCounts[new Date(a.created_at).getHours()]++; });
      let peakHour: number | null = null;
      let peakCount = 0;
      hourCounts.forEach((c, i) => { if (c > peakCount) { peakCount = c; peakHour = i; } });

      // Action counts
      const paymentsMade = payerLogs.filter(l => l.action === 'marked_paid').length;
      const releasesPerformed = actionLogs.filter(l => ['release_coin', 'released', 'order_released'].includes(l.action_type)).length;
      const chatMessages = actionLogs.filter(l => ['send_chat', 'chat_message'].includes(l.action_type)).length;
      const escalations = actionLogs.filter(l => ['escalation', 'appeal_handled'].includes(l.action_type)).length;
      const approvalActions = actionLogs.filter(l => ['approve', 'approved', 'reject', 'rejected'].includes(l.action_type)).length;

      // Action details for the detail tab
      const actionTypeCounts = new Map<string, number>();
      actionLogs.forEach(l => {
        actionTypeCounts.set(l.action_type, (actionTypeCounts.get(l.action_type) || 0) + 1);
      });
      // Also count payer actions
      const payerActionCounts = new Map<string, number>();
      payerLogs.forEach(l => {
        payerActionCounts.set(l.action, (payerActionCounts.get(l.action) || 0) + 1);
      });

      const actionDetailsList: ActionDetail[] = [
        { action_type: 'marked_paid', count: paymentsMade, label: 'Payments Made', icon: CreditCard, color: 'text-purple-400' },
        { action_type: 'release', count: releasesPerformed, label: 'Coin Releases', icon: Unlock, color: 'text-emerald-400' },
        { action_type: 'chat', count: chatMessages, label: 'Chat Messages', icon: MessageSquare, color: 'text-amber-400' },
        { action_type: 'escalation', count: escalations, label: 'Escalations', icon: AlertTriangle, color: 'text-destructive' },
        { action_type: 'approval', count: approvalActions, label: 'Approvals/Rejections', icon: Shield, color: 'text-blue-400' },
      ];

      // Add any other action types from logs
      actionTypeCounts.forEach((count, type) => {
        if (!['release_coin', 'released', 'order_released', 'send_chat', 'chat_message', 'escalation', 'appeal_handled', 'approve', 'approved', 'reject', 'rejected'].includes(type)) {
          actionDetailsList.push({
            action_type: type,
            count,
            label: type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            icon: Zap,
            color: 'text-muted-foreground',
          });
        }
      });

      setActionDetails(actionDetailsList.filter(a => a.count > 0).sort((a, b) => b.count - a.count));

      // Daily trends
      const days = parseInt(trendDays);
      const trends: DailyTrend[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = subDays(new Date(), i);
        const dayStart = startOfDay(d);
        const dayEnd = endOfDay(d);
        const dayAssignments = userAssignments.filter(a => {
          const dt = new Date(a.created_at);
          return dt >= dayStart && dt <= dayEnd;
        });
        trends.push({
          date: format(d, 'dd MMM'),
          orders: dayAssignments.length,
          volume: dayAssignments.reduce((s, a) => s + (Number(a.total_price) || 0), 0),
          completed: dayAssignments.filter(a => !a.is_active && a.assignment_type !== 'cancelled').length,
          cancelled: dayAssignments.filter(a => a.assignment_type === 'cancelled').length,
        });
      }
      setDailyTrends(trends);

      const completionRate = userAssignments.length > 0 ? Math.round((completed.length / userAssignments.length) * 100) : 0;
      const cancellationRate = userAssignments.length > 0 ? Math.round((cancelled.length / userAssignments.length) * 100) : 0;

      setProfile(profileRes.data || null);
      setRecentAssignments(userAssignments.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));

      const m: OperatorMetric = {
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
        avgTotalHandleTimeMin: avg(handleTimes),
        fastestHandleTimeMin: handleTimes.length > 0 ? Math.round(Math.min(...handleTimes) * 10) / 10 : null,
        slowestHandleTimeMin: handleTimes.length > 0 ? Math.round(Math.max(...handleTimes) * 10) / 10 : null,
        medianHandleTimeMin: median(handleTimes),
        todayHandled: todayAssignments.length,
        todayCompleted: todayCompletedArr.length,
        todayVolume: todayVol,
        peakHour,
        peakHourOrders: peakCount,
        paymentsMade,
        releasesPerformed,
        chatMessagesSent: chatMessages,
        escalationsHandled: escalations,
        approvalActions,
        completionRate,
        cancellationRate,
        efficiencyScore: 0,
      };
      m.efficiencyScore = computeEfficiencyScore(m);
      setMetric(m);
    } catch (err) {
      console.error('Operator detail fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId, trendDays]);

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
  recentAssignments.forEach(a => { hourlyActivity[new Date(a.created_at).getHours()].orders++; });

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

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/terminal/mpi')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3 flex-1">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-lg font-bold text-primary">{m.displayName.charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">{m.displayName}</h1>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <Badge className={`text-[10px] ${getRoleBadgeClass(m.roleName)}`}>{m.roleName}</Badge>
              {profile?.shift && <Badge variant="outline" className="text-[10px]">{profile.shift} Shift</Badge>}
              {profile?.specialization && profile.specialization !== 'general' && (
                <Badge variant="outline" className="text-[10px] capitalize">{profile.specialization}</Badge>
              )}
              <div className="flex items-center gap-1 ml-1">
                <div className={`h-1.5 w-1.5 rounded-full ${profile?.is_active !== false ? 'bg-green-500' : 'bg-muted-foreground'}`} />
                <span className="text-[10px] text-muted-foreground">{profile?.is_active !== false ? 'Online' : 'Offline'}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Efficiency Score Badge */}
          <div className={`flex flex-col items-center px-3 py-1.5 rounded-lg border border-border bg-muted/20`}>
            <span className="text-[9px] text-muted-foreground">Score</span>
            <span className={`text-xl font-bold ${getScoreColor(m.efficiencyScore)}`}>{m.efficiencyScore}</span>
          </div>
          {m.activeLoad > 0 && (
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">{m.activeLoad} active</Badge>
          )}
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={fetchData}>
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-8">
          <TabsTrigger value="overview" className="text-xs h-7">Overview</TabsTrigger>
          <TabsTrigger value="actions" className="text-xs h-7">Actions</TabsTrigger>
          <TabsTrigger value="trends" className="text-xs h-7">Trends</TabsTrigger>
          <TabsTrigger value="orders" className="text-xs h-7">Orders</TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          {/* Core Stats */}
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

          {/* Timing Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card className="border-border bg-card border-l-2 border-l-blue-500">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Banknote className="h-3.5 w-3.5 text-blue-500" />
                  <span className="text-[10px] text-muted-foreground">Avg Payment Turnout</span>
                </div>
                <div className="text-lg font-bold text-foreground">{formatDuration(m.avgPaymentTimeMin)}</div>
                <p className="text-[9px] text-muted-foreground">Assignment → Payment</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card border-l-2 border-l-emerald-500">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Unlock className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-[10px] text-muted-foreground">Avg Release Turnout</span>
                </div>
                <div className="text-lg font-bold text-foreground">{formatDuration(m.avgReleaseTimeMin)}</div>
                <p className="text-[9px] text-muted-foreground">Payment → Release</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card border-l-2 border-l-amber-500">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Gauge className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-[10px] text-muted-foreground">Avg Handle Time</span>
                </div>
                <div className="text-lg font-bold text-foreground">{formatDuration(m.avgTotalHandleTimeMin)}</div>
                <p className="text-[9px] text-muted-foreground">Assignment → Closure</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card border-l-2 border-l-indigo-500">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Timer className="h-3.5 w-3.5 text-indigo-500" />
                  <span className="text-[10px] text-muted-foreground">Median Handle</span>
                </div>
                <div className="text-lg font-bold text-foreground">{formatDuration(m.medianHandleTimeMin)}</div>
                <p className="text-[9px] text-muted-foreground">50th percentile</p>
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
                <p className="text-[9px] text-muted-foreground">Fastest → Slowest</p>
              </CardContent>
            </Card>
          </div>

          {/* Today + Volume */}
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1">
                  <CheckCircle className="h-3 w-3 text-green-500" /> Completion Rate
                </span>
                <span className="font-semibold text-green-500">{m.completionRate}%</span>
              </div>
              <Progress value={m.completionRate} className="h-2" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1">
                  <XCircle className="h-3 w-3 text-destructive" /> Cancellation Rate
                </span>
                <span className="font-semibold text-destructive">{m.cancellationRate}%</span>
              </div>
              <Progress value={m.cancellationRate} className="h-2 [&>div]:bg-destructive" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Gauge className="h-3 w-3" /> Efficiency Score
                </span>
                <span className={`font-semibold ${getScoreColor(m.efficiencyScore)}`}>{m.efficiencyScore}%</span>
              </div>
              <Progress value={m.efficiencyScore} className="h-2" />
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
        </TabsContent>

        {/* ACTIONS TAB */}
        <TabsContent value="actions" className="space-y-4 mt-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Action Breakdown
            <span className="text-[10px] text-muted-foreground font-normal ml-1">All-time actions performed by this user</span>
          </h3>

          {/* Action Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {[
              { label: 'Payments Made', value: m.paymentsMade, icon: CreditCard, color: 'text-purple-400', bgColor: 'bg-purple-500/10 border-purple-500/20' },
              { label: 'Coin Releases', value: m.releasesPerformed, icon: Unlock, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10 border-emerald-500/20' },
              { label: 'Chat Messages', value: m.chatMessagesSent, icon: MessageSquare, color: 'text-amber-400', bgColor: 'bg-amber-500/10 border-amber-500/20' },
              { label: 'Escalations', value: m.escalationsHandled, icon: AlertTriangle, color: 'text-destructive', bgColor: 'bg-destructive/10 border-destructive/20' },
              { label: 'Approvals', value: m.approvalActions, icon: Shield, color: 'text-blue-400', bgColor: 'bg-blue-500/10 border-blue-500/20' },
            ].map(({ label, value, icon: Icon, color, bgColor }) => (
              <Card key={label} className={`border ${bgColor}`}>
                <CardContent className="p-3 text-center">
                  <Icon className={`h-5 w-5 ${color} mx-auto mb-1.5`} />
                  <div className="text-xl font-bold text-foreground">{value}</div>
                  <div className="text-[9px] text-muted-foreground">{label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Detailed Action List */}
          {actionDetails.length > 0 ? (
            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <h4 className="text-xs font-semibold text-foreground mb-3">All Recorded Actions</h4>
                <div className="space-y-2">
                  {actionDetails.map(a => (
                    <div key={a.action_type} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/20 border border-border">
                      <div className="flex items-center gap-2">
                        <a.icon className={`h-4 w-4 ${a.color}`} />
                        <span className="text-xs text-foreground">{a.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-foreground">{a.count}</span>
                        {m.ordersHandled > 0 && (
                          <Badge variant="outline" className="text-[8px]">
                            {Math.round((a.count / m.ordersHandled) * 100)}% of orders
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="text-center py-12 text-sm text-muted-foreground">
              No action logs recorded for this user yet.
            </div>
          )}

          {/* Action Pie Chart */}
          {actionDetails.length > 0 && (
            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <h4 className="text-xs font-semibold text-foreground mb-2">Action Distribution</h4>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={actionDetails.map(a => ({ name: a.label, value: a.count }))}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {actionDetails.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <ReTooltip contentStyle={{ fontSize: 10, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TRENDS TAB */}
        <TabsContent value="trends" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Performance Trends
            </h3>
            <Select value={trendDays} onValueChange={setTrendDays}>
              <SelectTrigger className="h-8 text-xs w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 Days</SelectItem>
                <SelectItem value="14">Last 14 Days</SelectItem>
                <SelectItem value="30">Last 30 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Orders Trend */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="h-3.5 w-3.5 text-primary" /> Daily Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyTrends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
                    <ReTooltip contentStyle={{ fontSize: 10, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                    <Area type="monotone" dataKey="orders" stackId="1" fill="hsl(var(--primary))" stroke="hsl(var(--primary))" fillOpacity={0.2} name="Total" />
                    <Area type="monotone" dataKey="completed" stackId="2" fill="hsl(142, 76%, 36%)" stroke="hsl(142, 76%, 36%)" fillOpacity={0.2} name="Completed" />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Volume Trend */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Banknote className="h-3.5 w-3.5 text-primary" /> Daily Volume (₹)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyTrends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                    <ReTooltip
                      contentStyle={{ fontSize: 10, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                      formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Volume']}
                    />
                    <Bar dataKey="volume" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Activity by Hour */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-3.5 w-3.5 text-primary" /> Activity by Hour (All-Time)
              </CardTitle>
            </CardHeader>
            <CardContent>
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
        </TabsContent>

        {/* ORDERS TAB */}
        <TabsContent value="orders" className="space-y-4 mt-4">
          {recentAssignments.length > 0 ? (
            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <h4 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5 text-primary" /> All Assignments ({recentAssignments.length})
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left py-1.5 px-2 font-medium">Order</th>
                        <th className="text-left py-1.5 px-2 font-medium">Type</th>
                        <th className="text-right py-1.5 px-2 font-medium">Amount</th>
                        <th className="text-left py-1.5 px-2 font-medium">Status</th>
                        <th className="text-left py-1.5 px-2 font-medium">Assigned</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentAssignments.slice(0, 30).map((a, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                          <td className="py-1.5 px-2 font-mono">...{a.order_number?.slice(-8)}</td>
                          <td className="py-1.5 px-2">
                            <Badge variant="outline" className={`text-[9px] ${a.trade_type === 'BUY' ? 'text-green-500 border-green-500/30' : 'text-amber-500 border-amber-500/30'}`}>
                              {a.trade_type || 'N/A'}
                            </Badge>
                          </td>
                          <td className="py-1.5 px-2 text-right font-medium">₹{Number(a.total_price || 0).toLocaleString()}</td>
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
                  {recentAssignments.length > 30 && (
                    <p className="text-center text-[10px] text-muted-foreground mt-2">
                      Showing 30 of {recentAssignments.length} assignments
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="text-center py-12 text-sm text-muted-foreground">
              No assignments found for this user.
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Footer info */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
        {profile?.automation_included && <span>⚡ Auto-assign: Enabled</span>}
        {profile?.specialization && <span>Specialization: <span className="capitalize text-foreground">{profile.specialization}</span></span>}
      </div>
    </div>
  );
}
