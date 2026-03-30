import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  BarChart3, Users, Activity, TrendingUp, Clock, Zap,
  ArrowUpRight, ArrowDownRight, ChevronRight, RefreshCw,
  Target, Timer, Package, AlertTriangle, ShieldAlert,
  Trophy, CreditCard, Banknote, Unlock, Gauge, Star,
  MessageSquare, CheckCircle, XCircle, UserCheck, Lock,
  ClipboardList, Link2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { TerminalPermissionGate } from '@/components/terminal/TerminalPermissionGate';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';
import { useTerminalJurisdiction } from '@/hooks/useTerminalJurisdiction';
import { useTerminalUserPrefs } from '@/hooks/useTerminalUserPrefs';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';

const COLORS = ['hsl(231, 81%, 60%)', 'hsl(142, 76%, 36%)', 'hsl(38, 92%, 50%)', 'hsl(0, 84%, 60%)', 'hsl(262, 83%, 48%)', 'hsl(199, 89%, 48%)'];

interface OperatorMetric {
  userId: string;
  displayName: string;
  roleName: string;
  ordersHandled: number;
  ordersCompleted: number;
  ordersCancelled: number;
  totalVolume: number;
  avgHandleTimeMin: number | null;
  avgPaymentTimeMin: number | null;
  avgReleaseTimeMin: number | null;
  activeLoad: number;
  buyCount: number;
  sellCount: number;
  completionRate: number;
  // Action counts
  paymentsMade: number;
  releasesPerformed: number;
  chatMessagesSent: number;
  escalationsHandled: number;
  // Efficiency score (0-100)
  efficiencyScore: number;
  // Assignment stats
  payerAssignments: { total: number; active: number; sizeRanges: string[]; adIds: string[] };
  operatorAssignments: { total: number; active: number; sizeRanges: string[]; adIds: string[] };
  payerLocksTotal: number;
  payerLocksCompleted: number;
  payerLocksActive: number;
}

function getTimeRangeStart(range: string): Date {
  const now = new Date();
  switch (range) {
    case 'today':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case 'yesterday': {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      d.setDate(d.getDate() - 1);
      return d;
    }
    case 'week': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'month': {
      return new Date(now.getFullYear(), now.getMonth(), 1);
    }
    default:
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
}

function getTimeRangeEnd(range: string): Date {
  if (range === 'yesterday') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return new Date();
}

function computeEfficiencyScore(m: {
  completionRate: number;
  avgHandleTimeMin: number | null;
  ordersHandled: number;
  ordersCancelled: number;
}): number {
  let score = 0;
  // Completion rate (40% weight)
  score += m.completionRate * 0.4;
  // Speed bonus (30% weight) - under 15min avg = full marks
  if (m.avgHandleTimeMin != null && m.avgHandleTimeMin > 0) {
    const speedScore = Math.max(0, Math.min(100, 100 - ((m.avgHandleTimeMin - 5) / 25) * 100));
    score += speedScore * 0.3;
  } else if (m.ordersHandled > 0) {
    score += 50 * 0.3; // neutral if no timing data
  }
  // Volume bonus (20% weight) - more orders = better, cap at 20 orders/day
  const volScore = Math.min(100, (m.ordersHandled / 20) * 100);
  score += volScore * 0.2;
  // Low cancellation bonus (10% weight)
  const cancelRate = m.ordersHandled > 0 ? (m.ordersCancelled / m.ordersHandled) * 100 : 0;
  score += Math.max(0, 100 - cancelRate * 5) * 0.1;

  return Math.round(Math.max(0, Math.min(100, score)));
}

function formatDuration(minutes: number | null): string {
  if (minutes == null || minutes === 0) return 'N/A';
  if (minutes < 1) return `${Math.round(minutes * 60)}s`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
  return `${Math.round(minutes)}m`;
}

function getRoleBadgeClass(roleName: string) {
  const name = roleName.toLowerCase();
  if (name.includes('super')) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
  if (name.includes('admin') || name.includes('coo')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  if (name.includes('payer') && name.includes('operator')) return 'bg-pink-500/20 text-pink-400 border-pink-500/30';
  if (name.includes('payer')) return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
  if (name.includes('viewer')) return 'bg-muted text-muted-foreground border-border';
  return 'bg-primary/20 text-primary border-primary/30';
}

function getScoreColor(score: number) {
  if (score >= 80) return 'text-green-500';
  if (score >= 60) return 'text-amber-500';
  if (score >= 40) return 'text-orange-500';
  return 'text-destructive';
}

function getScoreBg(score: number) {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-amber-500';
  if (score >= 40) return 'bg-orange-500';
  return 'bg-destructive';
}

export default function TerminalMPI() {
  const navigate = useNavigate();
  const { isTerminalAdmin, terminalRoles, userId, hasPermission } = useTerminalAuth();
  const { visibleUserIds } = useTerminalJurisdiction();
  const canViewAll = hasPermission('terminal_mpi_view_all') || isTerminalAdmin;
  const canViewOwn = hasPermission('terminal_mpi_view_own');
  const [prefs, setPref] = useTerminalUserPrefs(userId, 'mpi', { timeRange: 'today' as string, viewLevel: 'all' as string, sortBy: 'efficiency' as string });
  const timeRange = prefs.timeRange;
  const viewLevel = prefs.viewLevel;
  const sortBy = prefs.sortBy || 'efficiency';
  const setTimeRange = (v: string) => setPref('timeRange', v);
  const setViewLevel = (v: string) => setPref('viewLevel', v);
  const setSortBy = (v: string) => setPref('sortBy', v);
  const [metrics, setMetrics] = useState<OperatorMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    setIsLoading(true);
    try {
      const rangeStart = getTimeRangeStart(timeRange);
      const rangeEnd = getTimeRangeEnd(timeRange);
      const rangeStartISO = rangeStart.toISOString();
      const rangeEndISO = rangeEnd.toISOString();

      // Parallel fetch all data
      const [usersRes, assignmentsRes, payerLogsRes, actionLogsRes, rolesRes, userRolesRes, profilesRes, payerAssignRes, operatorAssignRes, payerLocksRes, sizeRangesRes] = await Promise.all([
        supabase.from('users').select('id, username, first_name, last_name'),
        supabase.from('terminal_order_assignments')
          .select('assigned_to, trade_type, total_price, assignment_type, created_at, is_active, order_number, updated_at')
          .gte('created_at', rangeStartISO)
          .lte('created_at', rangeEndISO),
        supabase.from('terminal_payer_order_log')
          .select('order_number, action, created_at, payer_id')
          .gte('created_at', rangeStartISO)
          .lte('created_at', rangeEndISO),
        supabase.from('system_action_logs')
          .select('entity_id, action_type, recorded_at, user_id, module')
          .eq('module', 'terminal')
          .gte('recorded_at', rangeStartISO)
          .lte('recorded_at', rangeEndISO),
        supabase.from('p2p_terminal_roles').select('id, name'),
        supabase.from('p2p_terminal_user_roles').select('user_id, role_id'),
        supabase.from('terminal_user_profiles').select('user_id, specialization, shift, is_active, automation_included'),
        supabase.from('terminal_payer_assignments').select('id, payer_user_id, assignment_type, size_range_id, ad_id, is_active'),
        supabase.from('terminal_operator_assignments').select('id, operator_user_id, assignment_type, size_range_id, ad_id, is_active'),
        supabase.from('terminal_payer_order_locks').select('id, payer_user_id, status, order_number'),
        supabase.from('terminal_order_size_ranges').select('id, name'),
      ]);

      const users = usersRes.data || [];
      const assignments = assignmentsRes.data || [];
      const payerLogs = payerLogsRes.data || [];
      const actionLogs = actionLogsRes.data || [];
      const roles = rolesRes.data || [];
      const userRoles = userRolesRes.data || [];
      const profiles = profilesRes.data || [];
      const payerAssignments = payerAssignRes.data || [];
      const operatorAssignments = operatorAssignRes.data || [];
      const payerLocks = payerLocksRes.data || [];
      const sizeRanges = sizeRangesRes.data || [];

      // Build size range name map
      const sizeRangeNameMap = new Map<string, string>();
      sizeRanges.forEach(r => sizeRangeNameMap.set(r.id, r.name));

      // Index payer assignments by user
      const payerAssignByUser = new Map<string, { total: number; active: number; sizeRanges: string[]; adIds: string[] }>();
      payerAssignments.forEach(pa => {
        const existing = payerAssignByUser.get(pa.payer_user_id) || { total: 0, active: 0, sizeRanges: [], adIds: [] };
        existing.total++;
        if (pa.is_active) existing.active++;
        if (pa.size_range_id) {
          const name = sizeRangeNameMap.get(pa.size_range_id) || pa.size_range_id.slice(0, 8);
          if (!existing.sizeRanges.includes(name)) existing.sizeRanges.push(name);
        }
        if (pa.ad_id && !existing.adIds.includes(pa.ad_id)) existing.adIds.push(pa.ad_id);
        payerAssignByUser.set(pa.payer_user_id, existing);
      });

      // Index operator assignments by user
      const operatorAssignByUser = new Map<string, { total: number; active: number; sizeRanges: string[]; adIds: string[] }>();
      operatorAssignments.forEach(oa => {
        const existing = operatorAssignByUser.get(oa.operator_user_id) || { total: 0, active: 0, sizeRanges: [], adIds: [] };
        existing.total++;
        if (oa.is_active) existing.active++;
        if (oa.size_range_id) {
          const name = sizeRangeNameMap.get(oa.size_range_id) || oa.size_range_id.slice(0, 8);
          if (!existing.sizeRanges.includes(name)) existing.sizeRanges.push(name);
        }
        if (oa.ad_id && !existing.adIds.includes(oa.ad_id)) existing.adIds.push(oa.ad_id);
        operatorAssignByUser.set(oa.operator_user_id, existing);
      });

      // Index payer locks by user
      const payerLocksByUser = new Map<string, { total: number; completed: number; active: number }>();
      payerLocks.forEach(pl => {
        const existing = payerLocksByUser.get(pl.payer_user_id) || { total: 0, completed: 0, active: 0 };
        existing.total++;
        if (pl.status === 'completed') existing.completed++;
        else existing.active++;
        payerLocksByUser.set(pl.payer_user_id, existing);
      });

      const usersMap = new Map<string, any>();
      users.forEach(u => usersMap.set(u.id, u));

      const rolesMap = new Map<string, string>();
      roles.forEach(r => rolesMap.set(r.id, r.name));

      // A user can have multiple roles - combine them
      const userRoleMap = new Map<string, string[]>();
      userRoles.forEach(ur => {
        const roleName = rolesMap.get(ur.role_id);
        if (roleName) {
          const existing = userRoleMap.get(ur.user_id) || [];
          existing.push(roleName);
          userRoleMap.set(ur.user_id, existing);
        }
      });

      const profileMap = new Map<string, any>();
      profiles.forEach(p => profileMap.set(p.user_id, p));

      // Index payer logs by user
      const payerCountByUser = new Map<string, number>();
      payerLogs.forEach(l => {
        if (l.action === 'marked_paid') {
          payerCountByUser.set(l.payer_id, (payerCountByUser.get(l.payer_id) || 0) + 1);
        }
      });

      // Index payer logs by order for timing
      const payerLogByOrder = new Map<string, Date>();
      payerLogs.forEach(l => {
        if (l.action === 'marked_paid') {
          const dt = new Date(l.created_at);
          const existing = payerLogByOrder.get(l.order_number);
          if (!existing || dt < existing) payerLogByOrder.set(l.order_number, dt);
        }
      });

      // Index action logs by user
      const releaseCountByUser = new Map<string, number>();
      const chatCountByUser = new Map<string, number>();
      const escalationCountByUser = new Map<string, number>();
      const releaseLogByOrder = new Map<string, Date>();

      actionLogs.forEach(l => {
        if (l.action_type === 'release_coin' || l.action_type === 'released' || l.action_type === 'order_released') {
          releaseCountByUser.set(l.user_id, (releaseCountByUser.get(l.user_id) || 0) + 1);
          const dt = new Date(l.recorded_at);
          const existing = releaseLogByOrder.get(l.entity_id);
          if (!existing || dt < existing) releaseLogByOrder.set(l.entity_id, dt);
        }
        if (l.action_type === 'send_chat' || l.action_type === 'chat_message') {
          chatCountByUser.set(l.user_id, (chatCountByUser.get(l.user_id) || 0) + 1);
        }
        if (l.action_type === 'escalation' || l.action_type === 'appeal_handled') {
          escalationCountByUser.set(l.user_id, (escalationCountByUser.get(l.user_id) || 0) + 1);
        }
      });

      // Build metrics per visible user — apply data scope filtering (GAP 8)
      let visibleIds: Set<string>;
      if (isTerminalAdmin || canViewAll) {
        visibleIds = new Set(users.map(u => u.id));
      } else if (canViewOwn && userId) {
        // Only show own data
        visibleIds = new Set([userId]);
      } else {
        visibleIds = visibleUserIds;
      }
      const metricsArr: OperatorMetric[] = [];

      for (const uid of visibleIds) {
        const user = usersMap.get(uid);
        if (!user) continue;

        // Skip users with no role assigned
        const userRoleNames = userRoleMap.get(uid);
        if (!userRoleNames || userRoleNames.length === 0) continue;

        const roleName = userRoleNames.length > 1
          ? userRoleNames.filter(r => r.toLowerCase() !== 'viewer').join('/')
          : userRoleNames[0];

        const userAssignments = assignments.filter(a => a.assigned_to === uid);
        const active = userAssignments.filter(a => a.is_active);
        const completed = userAssignments.filter(a => !a.is_active && a.assignment_type !== 'cancelled');
        const cancelled = userAssignments.filter(a => a.assignment_type === 'cancelled');
        const buyOrders = userAssignments.filter(a => a.trade_type === 'BUY');
        const sellOrders = userAssignments.filter(a => a.trade_type === 'SELL');
        const totalVol = userAssignments.reduce((s, a) => s + (Number(a.total_price) || 0), 0);

        // Calculate real timing metrics
        const paymentTimes: number[] = [];
        const releaseTimes: number[] = [];
        const handleTimes: number[] = [];

        for (const assignment of userAssignments) {
          const assignedAt = new Date(assignment.created_at);
          const orderNum = assignment.order_number;

          // Payment time
          const paidAt = payerLogByOrder.get(orderNum);
          if (paidAt && paidAt > assignedAt) {
            const diffMin = (paidAt.getTime() - assignedAt.getTime()) / 60000;
            if (diffMin > 0 && diffMin < 1440) paymentTimes.push(diffMin);
          }

          // Release time
          if (paidAt) {
            const releasedAt = releaseLogByOrder.get(orderNum);
            if (releasedAt && releasedAt > paidAt) {
              const diffMin = (releasedAt.getTime() - paidAt.getTime()) / 60000;
              if (diffMin > 0 && diffMin < 1440) releaseTimes.push(diffMin);
            }
          }

          // Total handle time
          if (!assignment.is_active && assignment.updated_at) {
            const closedAt = new Date(assignment.updated_at);
            const diffMin = (closedAt.getTime() - assignedAt.getTime()) / 60000;
            if (diffMin > 0 && diffMin < 1440) handleTimes.push(diffMin);
          }
        }

        const avg = (arr: number[]) => arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;
        const completionRate = userAssignments.length > 0 ? Math.round((completed.length / userAssignments.length) * 100) : 0;
        const avgHandle = avg(handleTimes);

        const payerAssign = payerAssignByUser.get(uid) || { total: 0, active: 0, sizeRanges: [], adIds: [] };
        const operatorAssign = operatorAssignByUser.get(uid) || { total: 0, active: 0, sizeRanges: [], adIds: [] };
        const payerLockStats = payerLocksByUser.get(uid) || { total: 0, completed: 0, active: 0 };

        const metric: OperatorMetric = {
          userId: uid,
          displayName: user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.username,
          roleName,
          ordersHandled: userAssignments.length,
          ordersCompleted: completed.length,
          ordersCancelled: cancelled.length,
          totalVolume: totalVol,
          avgHandleTimeMin: avgHandle,
          avgPaymentTimeMin: avg(paymentTimes),
          avgReleaseTimeMin: avg(releaseTimes),
          activeLoad: active.length,
          buyCount: buyOrders.length,
          sellCount: sellOrders.length,
          completionRate,
          paymentsMade: payerCountByUser.get(uid) || 0,
          releasesPerformed: releaseCountByUser.get(uid) || 0,
          chatMessagesSent: chatCountByUser.get(uid) || 0,
          escalationsHandled: escalationCountByUser.get(uid) || 0,
          efficiencyScore: 0,
          payerAssignments: payerAssign,
          operatorAssignments: operatorAssign,
          payerLocksTotal: payerLockStats.total,
          payerLocksCompleted: payerLockStats.completed,
          payerLocksActive: payerLockStats.active,
        };
        metric.efficiencyScore = computeEfficiencyScore(metric);

        metricsArr.push(metric);
      }

      // Sort
      metricsArr.sort((a, b) => {
        switch (sortBy) {
          case 'efficiency': return b.efficiencyScore - a.efficiencyScore;
          case 'volume': return b.totalVolume - a.totalVolume;
          case 'orders': return b.ordersHandled - a.ordersHandled;
          case 'speed': return (a.avgHandleTimeMin ?? 9999) - (b.avgHandleTimeMin ?? 9999);
          default: return b.efficiencyScore - a.efficiencyScore;
        }
      });

      setMetrics(metricsArr);
    } catch (err) {
      console.error('MPI fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isTerminalAdmin, canViewAll, canViewOwn, userId, visibleUserIds, timeRange, sortBy]);

  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

  // Aggregated stats
  const totalOrders = metrics.reduce((s, m) => s + m.ordersHandled, 0);
  const totalVolume = metrics.reduce((s, m) => s + m.totalVolume, 0);
  const totalActive = metrics.reduce((s, m) => s + m.activeLoad, 0);
  const totalCompleted = metrics.reduce((s, m) => s + m.ordersCompleted, 0);
  const totalCancelled = metrics.reduce((s, m) => s + m.ordersCancelled, 0);
  const totalPayments = metrics.reduce((s, m) => s + m.paymentsMade, 0);
  const totalReleases = metrics.reduce((s, m) => s + m.releasesPerformed, 0);
  const avgEfficiency = metrics.length > 0 ? Math.round(metrics.reduce((s, m) => s + m.efficiencyScore, 0) / metrics.length) : 0;
  const handleTimesArr = metrics.filter(m => m.avgHandleTimeMin != null).map(m => m.avgHandleTimeMin!);
  const overallAvgHandle = handleTimesArr.length > 0 ? Math.round(handleTimesArr.reduce((a, b) => a + b, 0) / handleTimesArr.length * 10) / 10 : null;

  // Filter by role
  const filteredMetrics = useMemo(() => {
    if (viewLevel === 'all') return metrics;
    return metrics.filter(m => {
      const name = m.roleName.toLowerCase();
      if (viewLevel === 'operators') return name.includes('operator');
      if (viewLevel === 'payers') return name.includes('payer');
      if (viewLevel === 'admins') return name.includes('admin') || name.includes('super') || name.includes('coo');
      return true;
    });
  }, [metrics, viewLevel]);

  // Charts data
  const volumeByOperator = filteredMetrics.slice(0, 10).map(m => ({
    name: m.displayName.split(' ')[0],
    volume: Math.round(m.totalVolume),
    orders: m.ordersHandled,
  }));

  const tradeTypeSplit = [
    { name: 'Buy', value: metrics.reduce((s, m) => s + m.buyCount, 0) },
    { name: 'Sell', value: metrics.reduce((s, m) => s + m.sellCount, 0) },
  ].filter(d => d.value > 0);

  const actionBreakdown = [
    { name: 'Payments', value: totalPayments },
    { name: 'Releases', value: totalReleases },
    { name: 'Assignments', value: totalOrders },
  ].filter(d => d.value > 0);

  // Leaderboard top 3
  const leaderboard = [...metrics].sort((a, b) => b.efficiencyScore - a.efficiencyScore).slice(0, 3);

  const fmtVol = (v: number) => v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : `₹${(v / 1000).toFixed(0)}K`;

  return (
    <TerminalPermissionGate permissions={['terminal_mpi_view_own']}>
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg shrink-0">
            <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-lg font-semibold text-foreground truncate">Management Performance Interface</h1>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              Real-time operational intelligence
              {!isTerminalAdmin && (
                <span className="inline-flex items-center gap-1 ml-1 text-amber-500">
                  <ShieldAlert className="h-3 w-3" /> Your branch
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {canViewAll && (
            <Select value={viewLevel} onValueChange={setViewLevel}>
              <SelectTrigger className="h-7 text-[10px] sm:text-xs w-24 sm:w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="operators">Operators</SelectItem>
                <SelectItem value="payers">Payers</SelectItem>
                <SelectItem value="admins">Admins</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="h-7 text-[10px] sm:text-xs w-22 sm:w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-7 text-[10px] sm:text-xs w-22 sm:w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="efficiency">By Score</SelectItem>
              <SelectItem value="orders">By Orders</SelectItem>
              <SelectItem value="volume">By Volume</SelectItem>
              <SelectItem value="speed">By Speed</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-7 text-[10px] sm:text-xs px-2" onClick={fetchMetrics}>
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 sm:gap-3">
        {[
          { label: 'Orders', value: totalOrders, icon: Package, color: 'text-primary' },
          { label: 'Volume', value: fmtVol(totalVolume), icon: TrendingUp, color: 'text-green-500' },
          { label: 'Active', value: totalActive, icon: Activity, color: 'text-amber-500' },
          { label: 'Avg Handle', value: formatDuration(overallAvgHandle), icon: Timer, color: 'text-blue-500' },
          { label: 'Completed', value: totalCompleted, icon: CheckCircle, color: 'text-green-500' },
          { label: 'Cancelled', value: totalCancelled, icon: XCircle, color: 'text-destructive' },
          { label: 'Payments', value: totalPayments, icon: CreditCard, color: 'text-purple-500' },
          { label: 'Avg Score', value: `${avgEfficiency}%`, icon: Gauge, color: getScoreColor(avgEfficiency) },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border-border bg-card">
            <CardContent className="p-2 sm:p-3">
              <div className="flex items-center justify-between mb-1">
                <Icon className={`h-3 w-3 sm:h-3.5 sm:w-3.5 ${color}`} />
                <Badge variant="outline" className="text-[7px] sm:text-[8px] px-1">{timeRange}</Badge>
              </div>
              <div className="text-sm sm:text-lg font-bold text-foreground">{value}</div>
              <div className="text-[8px] sm:text-[9px] text-muted-foreground">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Leaderboard + Charts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Leaderboard */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-2 px-3 pt-3">
            <CardTitle className="text-xs sm:text-sm flex items-center gap-2">
              <Trophy className="h-3.5 w-3.5 text-amber-500" />
              Top Performers
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-2">
            {leaderboard.length === 0 ? (
              <p className="text-[10px] text-muted-foreground text-center py-4">No data yet</p>
            ) : leaderboard.map((m, i) => (
              <div
                key={m.userId}
                className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 border border-border hover:border-primary/30 cursor-pointer transition-colors"
                onClick={() => navigate(`/terminal/mpi/${m.userId}`)}
              >
                <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  i === 0 ? 'bg-amber-500/20 text-amber-400' :
                  i === 1 ? 'bg-slate-400/20 text-slate-400' :
                  'bg-orange-800/20 text-orange-600'
                }`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] sm:text-xs font-medium text-foreground truncate">{m.displayName}</div>
                  <div className="text-[8px] sm:text-[9px] text-muted-foreground">
                    {m.ordersHandled} orders · {fmtVol(m.totalVolume)}
                  </div>
                </div>
                <div className={`text-xs sm:text-sm font-bold ${getScoreColor(m.efficiencyScore)}`}>
                  {m.efficiencyScore}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Volume by Operator */}
        <Card className="border-border bg-card sm:col-span-1 lg:col-span-2">
          <CardHeader className="pb-2 px-3 pt-3">
            <CardTitle className="text-xs sm:text-sm flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
              Volume by Operator
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="h-40 sm:h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={volumeByOperator}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} />
                  <ReTooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 10 }}
                    formatter={(value: number) => [`₹${value.toLocaleString('en-IN')}`, 'Volume']}
                  />
                  <Bar dataKey="volume" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Action Breakdown */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-2 px-3 pt-3">
            <CardTitle className="text-xs sm:text-sm flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-primary" />
              Action Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="h-40 sm:h-52">
              {actionBreakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={actionBreakdown} cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={4} dataKey="value">
                      {actionBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 9 }} />
                    <ReTooltip contentStyle={{ fontSize: 10, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-[10px] text-muted-foreground">No actions recorded</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Operator Performance Cards */}
      <div>
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <h3 className="text-xs sm:text-sm font-semibold text-foreground flex items-center gap-2">
            <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
            Operator Performance
            <Badge variant="outline" className="text-[8px] sm:text-[9px] ml-1">{filteredMetrics.length} users</Badge>
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
          {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="border-border bg-card animate-pulse">
                <CardContent className="p-3 h-32 sm:h-44" />
              </Card>
            ))
          ) : filteredMetrics.length === 0 ? (
            <div className="col-span-full text-center py-12 text-sm text-muted-foreground">
              No operator data available for this period.
            </div>
          ) : (
            filteredMetrics.map((m, idx) => (
              <Card
                key={m.userId}
                className="border-border bg-card hover:border-primary/30 transition-colors cursor-pointer group"
                onClick={() => navigate(`/terminal/mpi/${m.userId}`)}
              >
                <CardContent className="p-3 sm:p-4">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-[10px] sm:text-xs font-bold text-primary">{m.displayName.charAt(0)}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[11px] sm:text-sm font-medium text-foreground truncate">{m.displayName}</div>
                        <Badge className={`text-[7px] sm:text-[8px] ${getRoleBadgeClass(m.roleName)}`}>{m.roleName}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {m.activeLoad > 0 && (
                        <div className="flex items-center gap-1">
                          <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                          <span className="text-[9px] text-muted-foreground">{m.activeLoad}</span>
                        </div>
                      )}
                      <div className={`text-xs sm:text-sm font-bold ${getScoreColor(m.efficiencyScore)}`}>
                        {m.efficiencyScore}
                      </div>
                    </div>
                  </div>

                  {/* Primary Stats */}
                  <div className="grid grid-cols-4 gap-1 sm:gap-1.5 text-center mb-2 sm:mb-3">
                    <div className="p-1 sm:p-1.5 rounded bg-muted/20">
                      <div className="text-[10px] sm:text-xs font-bold text-foreground">{m.ordersHandled}</div>
                      <div className="text-[7px] sm:text-[8px] text-muted-foreground">Handled</div>
                    </div>
                    <div className="p-1 sm:p-1.5 rounded bg-muted/20">
                      <div className="text-[10px] sm:text-xs font-bold text-foreground">{fmtVol(m.totalVolume)}</div>
                      <div className="text-[7px] sm:text-[8px] text-muted-foreground">Volume</div>
                    </div>
                    <div className="p-1 sm:p-1.5 rounded bg-muted/20">
                      <div className="text-[10px] sm:text-xs font-bold text-foreground">{formatDuration(m.avgHandleTimeMin)}</div>
                      <div className="text-[7px] sm:text-[8px] text-muted-foreground">Avg Time</div>
                    </div>
                    <div className="p-1 sm:p-1.5 rounded bg-muted/20">
                      <div className="text-[10px] sm:text-xs font-bold text-foreground">{m.completionRate}%</div>
                      <div className="text-[7px] sm:text-[8px] text-muted-foreground">Rate</div>
                    </div>
                  </div>

                  {/* Action Stats */}
                  <div className="grid grid-cols-3 gap-1 sm:gap-1.5 text-center mb-2 sm:mb-3">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="p-1 rounded bg-purple-500/5 border border-purple-500/10">
                            <div className="flex items-center justify-center gap-1">
                              <CreditCard className="h-2.5 w-2.5 text-purple-400" />
                              <span className="text-[10px] font-semibold text-foreground">{m.paymentsMade}</span>
                            </div>
                            <div className="text-[7px] text-muted-foreground">Payments</div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent><p className="text-xs">Payments marked as paid</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="p-1 rounded bg-emerald-500/5 border border-emerald-500/10">
                            <div className="flex items-center justify-center gap-1">
                              <Unlock className="h-2.5 w-2.5 text-emerald-400" />
                              <span className="text-[10px] font-semibold text-foreground">{m.releasesPerformed}</span>
                            </div>
                            <div className="text-[7px] text-muted-foreground">Releases</div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent><p className="text-xs">Coin releases performed</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="p-1 rounded bg-amber-500/5 border border-amber-500/10">
                            <div className="flex items-center justify-center gap-1">
                              <MessageSquare className="h-2.5 w-2.5 text-amber-400" />
                              <span className="text-[10px] font-semibold text-foreground">{m.chatMessagesSent}</span>
                            </div>
                            <div className="text-[7px] text-muted-foreground">Chats</div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent><p className="text-xs">Chat messages sent</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>

                  {/* Assignment Stats */}
                  {(m.payerAssignments.total > 0 || m.operatorAssignments.total > 0 || m.payerLocksTotal > 0) && (
                    <div className="grid grid-cols-3 gap-1 sm:gap-1.5 text-center mb-2 sm:mb-3">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="p-1 rounded bg-blue-500/5 border border-blue-500/10">
                              <div className="flex items-center justify-center gap-1">
                                <UserCheck className="h-2.5 w-2.5 text-blue-400" />
                                <span className="text-[10px] font-semibold text-foreground">{m.payerAssignments.active}/{m.payerAssignments.total}</span>
                              </div>
                              <div className="text-[7px] text-muted-foreground">Payer Assign</div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-xs space-y-0.5">
                              <p>Payer: {m.payerAssignments.active} active / {m.payerAssignments.total} total</p>
                              {m.payerAssignments.sizeRanges.length > 0 && <p>Ranges: {m.payerAssignments.sizeRanges.join(', ')}</p>}
                              {m.payerAssignments.adIds.length > 0 && <p>Ads: {m.payerAssignments.adIds.length}</p>}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="p-1 rounded bg-indigo-500/5 border border-indigo-500/10">
                              <div className="flex items-center justify-center gap-1">
                                <ClipboardList className="h-2.5 w-2.5 text-indigo-400" />
                                <span className="text-[10px] font-semibold text-foreground">{m.operatorAssignments.active}/{m.operatorAssignments.total}</span>
                              </div>
                              <div className="text-[7px] text-muted-foreground">Op Assign</div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-xs space-y-0.5">
                              <p>Operator: {m.operatorAssignments.active} active / {m.operatorAssignments.total} total</p>
                              {m.operatorAssignments.sizeRanges.length > 0 && <p>Ranges: {m.operatorAssignments.sizeRanges.join(', ')}</p>}
                              {m.operatorAssignments.adIds.length > 0 && <p>Ads: {m.operatorAssignments.adIds.length}</p>}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="p-1 rounded bg-cyan-500/5 border border-cyan-500/10">
                              <div className="flex items-center justify-center gap-1">
                                <Lock className="h-2.5 w-2.5 text-cyan-400" />
                                <span className="text-[10px] font-semibold text-foreground">{m.payerLocksCompleted}/{m.payerLocksTotal}</span>
                              </div>
                              <div className="text-[7px] text-muted-foreground">Payer Locks</div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-xs space-y-0.5">
                              <p>Completed: {m.payerLocksCompleted} / Total: {m.payerLocksTotal}</p>
                              <p>Active locks: {m.payerLocksActive}</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  )}
                  {/* Efficiency Bar */}
                  <div className="space-y-0.5 sm:space-y-1">
                    <div className="flex items-center justify-between text-[9px] sm:text-[10px]">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Gauge className="h-2.5 w-2.5" /> Efficiency Score
                      </span>
                      <span className={`font-medium ${getScoreColor(m.efficiencyScore)}`}>{m.efficiencyScore}%</span>
                    </div>
                    <Progress value={m.efficiencyScore} className={`h-1.5 [&>div]:${getScoreBg(m.efficiencyScore)}`} />
                  </div>

                  {/* Hover hint */}
                  <div className="mt-2 flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[9px] text-primary flex items-center gap-0.5">
                      View Details <ChevronRight className="h-3 w-3" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
    </TerminalPermissionGate>
  );
}
