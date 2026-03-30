import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
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
  roleType: 'payer' | 'operator' | 'admin' | 'hybrid';
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
  paymentsMade: number;
  releasesPerformed: number;
  chatMessagesSent: number;
  escalationsHandled: number;
  approvalActions: number;
  efficiencyScore: number;
  completionRate: number;
  cancellationRate: number;
  // Payer-specific
  payerLocksTotal: number;
  payerLocksCompleted: number;
  payerLocksActive: number;
  payerAvgLockToPayMin: number | null;
  payerMedianLockToPayMin: number | null;
  payerFastestPayMin: number | null;
  payerPaymentVolume: number;
  payerTodayPayments: number;
  payerTodayVolume: number;
}

interface DailyTrend {
  date: string;
  orders: number;
  volume: number;
  completed: number;
  cancelled: number;
  payments?: number;
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

function getRoleType(roleName: string): 'payer' | 'operator' | 'admin' | 'hybrid' {
  const name = roleName.toLowerCase();
  const isPayer = name.includes('payer');
  const isOperator = name.includes('operator');
  if (isPayer && isOperator) return 'hybrid';
  if (name.includes('super') || name.includes('admin') || name.includes('coo')) return 'admin';
  if (isPayer) return 'payer';
  return 'operator';
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
  paymentsMade: number;
  payerLocksCompleted: number;
  payerLocksTotal: number;
  payerAvgLockToPayMin: number | null;
  roleType: string;
}): number {
  let score = 0;
  
  if (m.roleType === 'payer') {
    // Payer scoring: Lock completion (40%), Payment speed (30%), Volume (20%), Reliability (10%)
    const lockRate = m.payerLocksTotal > 0 ? (m.payerLocksCompleted / m.payerLocksTotal) * 100 : (m.paymentsMade > 0 ? 80 : 0);
    score += lockRate * 0.4;
    if (m.payerAvgLockToPayMin != null && m.payerAvgLockToPayMin > 0) {
      score += Math.max(0, Math.min(100, 100 - ((m.payerAvgLockToPayMin - 2) / 15) * 100)) * 0.3;
    } else if (m.paymentsMade > 0) {
      score += 50 * 0.3;
    }
    score += Math.min(100, (m.paymentsMade / 15) * 100) * 0.2;
    score += Math.max(0, 100 - ((m.payerLocksTotal - m.payerLocksCompleted) / Math.max(1, m.payerLocksTotal)) * 200) * 0.1;
  } else {
    // Operator/Admin scoring
    score += m.completionRate * 0.4;
    if (m.avgTotalHandleTimeMin != null && m.avgTotalHandleTimeMin > 0) {
      score += Math.max(0, Math.min(100, 100 - ((m.avgTotalHandleTimeMin - 5) / 25) * 100)) * 0.3;
    } else if (m.ordersHandled > 0) {
      score += 50 * 0.3;
    }
    score += Math.min(100, (m.ordersHandled / 20) * 100) * 0.2;
    const cancelRate = m.ordersHandled > 0 ? (m.ordersCancelled / m.ordersHandled) * 100 : 0;
    score += Math.max(0, 100 - cancelRate * 5) * 0.1;
  }

  return Math.round(Math.max(0, Math.min(100, score)));
}

const fmtVol = (v: number) => v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : `₹${(v / 1000).toFixed(0)}K`;

// Reusable stat mini card
function StatMini({ icon: Icon, label, value, color = 'text-primary' }: { icon: any; label: string; value: string | number; color?: string }) {
  return (
    <div className="flex items-center gap-2 p-2 sm:p-2.5 rounded-lg bg-muted/30 border border-border min-w-0">
      <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} />
      <div className="min-w-0">
        <div className="text-xs font-semibold text-foreground truncate">{value}</div>
        <div className="text-[9px] text-muted-foreground truncate">{label}</div>
      </div>
    </div>
  );
}

// Timing card
function TimingCard({ icon: Icon, label, value, subtitle, borderColor }: { icon: any; label: string; value: string; subtitle: string; borderColor: string }) {
  return (
    <Card className={`border-border bg-card border-l-2 ${borderColor}`}>
      <CardContent className="p-2.5 sm:p-3">
        <div className="flex items-center gap-1.5 mb-1">
          <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" style={{ color: 'inherit' }} />
          <span className="text-[9px] sm:text-[10px] text-muted-foreground truncate">{label}</span>
        </div>
        <div className="text-sm sm:text-lg font-bold text-foreground">{value}</div>
        <p className="text-[8px] sm:text-[9px] text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

import { TerminalPermissionGate } from '@/components/terminal/TerminalPermissionGate';

function TerminalOperatorDetailContent() {
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
  const [payerOrderHistory, setPayerOrderHistory] = useState<Map<string, any>>(new Map());
  const [sizeRangeNames, setSizeRangeNames] = useState<Map<string, string>>(new Map());
  const [sizeRangeDetails, setSizeRangeDetails] = useState<Map<string, any>>(new Map());
  const [liveEligibleOrders, setLiveEligibleOrders] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [trendDays, setTrendDays] = useState('7');

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
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
      const payerLocks = payerLocksRes.data || [];

      // Cross-reference payer locks & logs with binance_order_history for actual amounts
      const allPayerOrderNumbers = [
        ...new Set([
          ...payerLocks.map((l: any) => l.order_number),
          ...payerLogs.map((l: any) => l.order_number),
        ].filter(Boolean))
      ];
      
      let orderHistoryMap = new Map<string, any>();
      if (allPayerOrderNumbers.length > 0) {
        // Fetch in batches of 50
        for (let i = 0; i < allPayerOrderNumbers.length; i += 50) {
          const batch = allPayerOrderNumbers.slice(i, i + 50);
          const { data: historyData } = await supabase
            .from('binance_order_history')
            .select('order_number, total_price, amount, unit_price, asset, fiat_unit, trade_type, order_status, counter_part_nick_name, create_time, pay_method_name')
            .in('order_number', batch);
          if (historyData) {
            for (const h of historyData) {
              orderHistoryMap.set(h.order_number, h);
            }
          }
        }
      }

      // Get role name
      let roleName = 'Operator';
      if (userRolesRes.data && userRolesRes.data.length > 0) {
        const roleIds = userRolesRes.data.map(r => r.role_id);
        const { data: roles } = await supabase.from('p2p_terminal_roles').select('name').in('id', roleIds);
        if (roles && roles.length > 0) {
          roleName = roles.map(r => r.name).filter(n => n.toLowerCase() !== 'viewer').join('/') || roles[0].name;
        }
      }

      const roleType = getRoleType(roleName);

      // Core stats from assignments
      const active = userAssignments.filter(a => a.is_active);
      let completed = userAssignments.filter(a => !a.is_active && a.assignment_type !== 'cancelled');
      let cancelled = userAssignments.filter(a => a.assignment_type === 'cancelled');
      const buyOrders = userAssignments.filter(a => a.trade_type === 'BUY');
      const sellOrders = userAssignments.filter(a => a.trade_type === 'SELL');
      let totalVol = userAssignments.reduce((s, a) => s + (Number(a.total_price) || 0), 0);
      let buyVol = buyOrders.reduce((s, a) => s + (Number(a.total_price) || 0), 0);
      let sellVol = sellOrders.reduce((s, a) => s + (Number(a.total_price) || 0), 0);

      // For payers: enrich stats from order history if assignments don't capture completions
      if ((roleType === 'payer' || roleType === 'hybrid' || roleType === 'admin') && orderHistoryMap.size > 0) {
        // Count completed/cancelled from binance order history for payer's handled orders
        const assignmentOrderNums = new Set(userAssignments.map(a => a.order_number));
        let enrichedCompleted = 0;
        let enrichedCancelled = 0;
        let enrichedBuyVol = 0;
        let enrichedSellVol = 0;
        orderHistoryMap.forEach((h) => {
          const price = parseFloat(h.total_price || '0');
          if (!assignmentOrderNums.has(h.order_number)) {
            // Orders handled via payer logs but not in assignments
            if (h.order_status === 'COMPLETED') enrichedCompleted++;
            if (h.order_status === 'CANCELLED') enrichedCancelled++;
          }
          if (h.trade_type === 'BUY') enrichedBuyVol += price;
          else enrichedSellVol += price;
        });
        // Add payer-log-only completions
        if (completed.length === 0 && enrichedCompleted > 0) {
          completed = [...completed, ...Array(enrichedCompleted).fill({ _enriched: true })];
        }
        if (cancelled.length === 0 && enrichedCancelled > 0) {
          cancelled = [...cancelled, ...Array(enrichedCancelled).fill({ _enriched: true })];
        }
        // Enrich volume
        if (totalVol === 0) {
          totalVol = enrichedBuyVol + enrichedSellVol;
          buyVol = enrichedBuyVol;
          sellVol = enrichedSellVol;
        }
      }

      // Payer logs indexed
      const payerLogByOrder = new Map<string, Date>();
      const payerPaymentLogs = payerLogs.filter(l => l.action === 'marked_paid');
      payerPaymentLogs.forEach(l => {
        const dt = new Date(l.created_at);
        const existing = payerLogByOrder.get(l.order_number);
        if (!existing || dt < existing) payerLogByOrder.set(l.order_number, dt);
      });

      // Release logs indexed
      const releaseLogByOrder = new Map<string, Date>();
      actionLogs.forEach(l => {
        if (['release_coin', 'released', 'order_released'].includes(l.action_type)) {
          const dt = new Date(l.recorded_at);
          const existing = releaseLogByOrder.get(l.entity_id);
          if (!existing || dt < existing) releaseLogByOrder.set(l.entity_id, dt);
        }
      });

      // Timing metrics from assignments
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

      // Payer lock-to-payment times - enriched with binance_order_history amounts
      const lockToPayTimes: number[] = [];
      let payerPaymentVolume = 0;
      for (const lock of payerLocks) {
        const histOrder = orderHistoryMap.get(lock.order_number);
        const lockAmount = histOrder ? parseFloat(histOrder.total_price || '0') : 0;
        
        if (lock.status === 'completed' && lock.locked_at && lock.completed_at) {
          const lockAt = new Date(lock.locked_at);
          const compAt = new Date(lock.completed_at);
          const diffMin = (compAt.getTime() - lockAt.getTime()) / 60000;
          if (diffMin > 0 && diffMin < 1440) lockToPayTimes.push(diffMin);
        }
        if (lock.status === 'completed') payerPaymentVolume += lockAmount;
      }

      // Compute timing directly from payer logs + binance_order_history
      // This captures payment actions even without assignment records
      const payerLogPaymentTimes: number[] = [];
      const payerLogHandleTimes: number[] = [];
      for (const log of payerPaymentLogs) {
        const hist = orderHistoryMap.get(log.order_number);
        if (hist && hist.create_time) {
          const orderCreatedAt = new Date(hist.create_time);
          const paidAt = new Date(log.created_at);
          const diffMin = (paidAt.getTime() - orderCreatedAt.getTime()) / 60000;
          if (diffMin > 0 && diffMin < 1440) payerLogPaymentTimes.push(diffMin);
        }
        // If order is completed, compute full handle time (order creation → completion not available, use paid time as proxy)
        if (hist && hist.order_status === 'COMPLETED' && hist.create_time) {
          const orderCreatedAt = new Date(hist.create_time);
          const paidAt = new Date(log.created_at);
          const diffMin = (paidAt.getTime() - orderCreatedAt.getTime()) / 60000;
          if (diffMin > 0 && diffMin < 1440) payerLogHandleTimes.push(diffMin);
        }
      }

      // Also compute volume from marked_paid logs if lock volume is zero
      if (payerPaymentVolume === 0) {
        const paidOrderNums = payerLogs.filter((l: any) => l.action === 'marked_paid').map((l: any) => l.order_number);
        for (const on of paidOrderNums) {
          const histOrder = orderHistoryMap.get(on);
          if (histOrder) payerPaymentVolume += parseFloat(histOrder.total_price || '0');
        }
      }

      // Merge timing: prioritize assignment-based, then lock-based, then payer-log-based
      const mergedPaymentTimes = paymentTimes.length > 0 ? paymentTimes : (lockToPayTimes.length > 0 ? lockToPayTimes : payerLogPaymentTimes);
      
      const mergedHandleTimes = handleTimes.length > 0 ? handleTimes : (lockToPayTimes.length > 0 ? lockToPayTimes : payerLogHandleTimes);
      
      // Release times: also compute from payer locks + release logs, and from payer payment logs
      for (const lock of payerLocks) {
        if (lock.status === 'completed' && lock.completed_at) {
          const paidAt = new Date(lock.completed_at);
          const releasedAt = releaseLogByOrder.get(lock.order_number);
          if (releasedAt && releasedAt > paidAt) {
            const diffMin = (releasedAt.getTime() - paidAt.getTime()) / 60000;
            if (diffMin > 0 && diffMin < 1440) releaseTimes.push(diffMin);
          }
        }
      }
      // Also check payer payment logs for release timing
      if (releaseTimes.length === 0) {
        for (const log of payerPaymentLogs) {
          const paidAt = new Date(log.created_at);
          const releasedAt = releaseLogByOrder.get(log.order_number);
          if (releasedAt && releasedAt > paidAt) {
            const diffMin = (releasedAt.getTime() - paidAt.getTime()) / 60000;
            if (diffMin > 0 && diffMin < 1440) releaseTimes.push(diffMin);
          }
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
      const todayPayments = payerPaymentLogs.filter(l => new Date(l.created_at) >= todayStart).length;
      // Compute today's payer volume from enriched order history
      const todayPayerVol = payerLocks
        .filter((l: any) => new Date(l.locked_at || l.created_at) >= todayStart)
        .reduce((s: number, l: any) => {
          const hist = orderHistoryMap.get(l.order_number);
          return s + (hist ? parseFloat(hist.total_price || '0') : 0);
        }, 0);

      // Peak hour
      const hourCounts = new Array(24).fill(0);
      const sourceForHours = roleType === 'payer' ? payerPaymentLogs : userAssignments;
      sourceForHours.forEach(a => { hourCounts[new Date(a.created_at).getHours()]++; });
      let peakHour: number | null = null;
      let peakCount = 0;
      hourCounts.forEach((c, i) => { if (c > peakCount) { peakCount = c; peakHour = i; } });

      // Action counts
      const paymentsMade = payerPaymentLogs.length;
      const releasesPerformed = actionLogs.filter(l => ['release_coin', 'released', 'order_released'].includes(l.action_type)).length;
      const chatMessages = actionLogs.filter(l => ['send_chat', 'chat_message'].includes(l.action_type)).length;
      const escalations = actionLogs.filter(l => ['escalation', 'appeal_handled'].includes(l.action_type)).length;
      const approvalActions = actionLogs.filter(l => ['approve', 'approved', 'reject', 'rejected'].includes(l.action_type)).length;

      // Action details
      const actionDetailsList: ActionDetail[] = [
        { action_type: 'marked_paid', count: paymentsMade, label: 'Payments Made', icon: CreditCard, color: 'text-purple-400' },
        { action_type: 'release', count: releasesPerformed, label: 'Coin Releases', icon: Unlock, color: 'text-emerald-400' },
        { action_type: 'chat', count: chatMessages, label: 'Chat Messages', icon: MessageSquare, color: 'text-amber-400' },
        { action_type: 'escalation', count: escalations, label: 'Escalations', icon: AlertTriangle, color: 'text-destructive' },
        { action_type: 'approval', count: approvalActions, label: 'Approvals/Rejections', icon: Shield, color: 'text-blue-400' },
      ];

      const actionTypeCounts = new Map<string, number>();
      actionLogs.forEach(l => { actionTypeCounts.set(l.action_type, (actionTypeCounts.get(l.action_type) || 0) + 1); });
      actionTypeCounts.forEach((count, type) => {
        if (!['release_coin', 'released', 'order_released', 'send_chat', 'chat_message', 'escalation', 'appeal_handled', 'approve', 'approved', 'reject', 'rejected'].includes(type)) {
          actionDetailsList.push({ action_type: type, count, label: type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), icon: Zap, color: 'text-muted-foreground' });
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
        const dayAssignments = userAssignments.filter(a => { const dt = new Date(a.created_at); return dt >= dayStart && dt <= dayEnd; });
        const dayPayments = payerPaymentLogs.filter(l => { const dt = new Date(l.created_at); return dt >= dayStart && dt <= dayEnd; });
        // Compute payer volume from enriched order history
        const dayPayerVol = dayPayments.reduce((s: number, l: any) => {
          const hist = orderHistoryMap.get(l.order_number);
          return s + (hist ? parseFloat(hist.total_price || '0') : 0);
        }, 0);
        const assignmentVol = dayAssignments.reduce((s: number, a: any) => s + (Number(a.total_price) || 0), 0);
        trends.push({
          date: format(d, 'dd MMM'),
          orders: dayAssignments.length,
          volume: dayPayerVol > 0 ? dayPayerVol : assignmentVol,
          completed: dayAssignments.filter(a => !a.is_active && a.assignment_type !== 'cancelled').length,
          cancelled: dayAssignments.filter(a => a.assignment_type === 'cancelled').length,
          payments: dayPayments.length,
        });
      }
      setDailyTrends(trends);

      const completionRate = userAssignments.length > 0 ? Math.round((completed.length / userAssignments.length) * 100) : 0;
      const cancellationRate = userAssignments.length > 0 ? Math.round((cancelled.length / userAssignments.length) * 100) : 0;
      const payerLocksCompleted = payerLocks.filter(l => l.status === 'completed').length;
      const payerLocksActive = payerLocks.filter(l => l.status !== 'completed').length;

      setProfile(profileRes.data || null);
      setRecentAssignments(userAssignments.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      setPayerAssignData(payerAssignRes.data || []);
      setOperatorAssignData(operatorAssignRes.data || []);
      setPayerLockData(payerLocks);
      setPayerOrderHistory(orderHistoryMap);
      const srMap = new Map<string, string>();
      const srDetailMap = new Map<string, any>();
      (sizeRangesRes.data || []).forEach((r: any) => {
        srMap.set(r.id, r.name);
        srDetailMap.set(r.id, r);
      });
      setSizeRangeNames(srMap);
      setSizeRangeDetails(srDetailMap);

      // Fetch live eligible orders from binance_order_history matching payer's active size range assignments
      const activePayerAssigns = (payerAssignRes.data || []).filter((a: any) => a.is_active);
      if (activePayerAssigns.length > 0 && (roleType === 'payer' || roleType === 'hybrid')) {
        try {
          // Get recent non-terminal orders from order history (last 24h)
          const cutoffTime = Date.now() - 24 * 60 * 60 * 1000;
          const { data: recentOrders } = await supabase
            .from('binance_order_history')
            .select('order_number, total_price, amount, unit_price, asset, fiat_unit, trade_type, order_status, counter_part_nick_name, create_time, pay_method_name')
            .eq('trade_type', 'BUY')
            .in('order_status', ['TRADING', 'BUYER_PAYED', 'APPEAL'])
            .gte('create_time', cutoffTime)
            .order('create_time', { ascending: false })
            .limit(100);

          if (recentOrders && recentOrders.length > 0) {
            // Filter by payer's assigned size ranges and ad_ids
            const eligibleOrders = recentOrders.filter((order: any) => {
              const totalPrice = parseFloat(order.total_price || '0');
              return activePayerAssigns.some((assign: any) => {
                if (assign.assignment_type === 'ad_id' && assign.ad_id) {
                  return true; // Ad-based assignments match differently (at runtime via advNo)
                }
                if (assign.assignment_type === 'size_range' && assign.size_range_id) {
                  const range = srDetailMap.get(assign.size_range_id);
                  if (range) {
                    const min = range.min_amount || 0;
                    const max = range.max_amount || Infinity;
                    return totalPrice >= min && totalPrice <= max;
                  }
                }
                return false;
              });
            });
            setLiveEligibleOrders(eligibleOrders);
          } else {
            setLiveEligibleOrders([]);
          }
        } catch (e) {
          console.error('Failed to fetch live eligible orders:', e);
          setLiveEligibleOrders([]);
        }
      } else {
        setLiveEligibleOrders([]);
      }

      // For payers/admins: ordersHandled should include unique orders from payer logs
      const allHandledOrderNums = new Set([
        ...userAssignments.map(a => a.order_number),
        ...payerPaymentLogs.map(l => l.order_number),
      ].filter(Boolean));
      const effectiveOrdersHandled = Math.max(userAssignments.length, allHandledOrderNums.size);

      const m: OperatorMetric = {
        userId,
        displayName: user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.username,
        roleName,
        roleType,
        ordersHandled: effectiveOrdersHandled,
        ordersCompleted: completed.length,
        ordersCancelled: cancelled.length,
        totalVolume: totalVol,
        activeLoad: active.length,
        buyCount: Math.max(buyOrders.length, allHandledOrderNums.size),
        sellCount: sellOrders.length,
        buyVolume: buyVol,
        sellVolume: sellVol,
        avgPaymentTimeMin: avg(mergedPaymentTimes),
        avgReleaseTimeMin: avg(releaseTimes),
        avgTotalHandleTimeMin: avg(mergedHandleTimes),
        fastestHandleTimeMin: mergedHandleTimes.length > 0 ? Math.round(Math.min(...mergedHandleTimes) * 10) / 10 : null,
        slowestHandleTimeMin: mergedHandleTimes.length > 0 ? Math.round(Math.max(...mergedHandleTimes) * 10) / 10 : null,
        medianHandleTimeMin: median(mergedHandleTimes),
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
        payerLocksTotal: payerLocks.length,
        payerLocksCompleted,
        payerLocksActive,
        payerAvgLockToPayMin: avg(lockToPayTimes),
        payerMedianLockToPayMin: median(lockToPayTimes),
        payerFastestPayMin: lockToPayTimes.length > 0 ? Math.round(Math.min(...lockToPayTimes) * 10) / 10 : null,
        payerPaymentVolume,
        payerTodayPayments: todayPayments,
        payerTodayVolume: todayPayerVol,
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
      <div className="p-3 sm:p-4 md:p-6 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/terminal/mpi')} className="mb-2">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to MPI
        </Button>
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="border-border bg-card animate-pulse"><CardContent className="p-3 h-16" /></Card>
          ))}
        </div>
      </div>
    );
  }

  const m = metric;
  const isPayer = m.roleType === 'payer' || m.roleType === 'hybrid';
  const isOp = m.roleType === 'operator' || m.roleType === 'hybrid' || m.roleType === 'admin';

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
    { range: '10-50K', count: 0 },
    { range: '50K-1L', count: 0 },
    { range: '1L+', count: 0 },
  ];
  // For payers, use enriched lock data; for operators, use assignments
  const volumeSource = isPayer && payerLockData.length > 0
    ? payerLockData.map(l => {
        const hist = payerOrderHistory.get(l.order_number);
        return hist ? parseFloat(hist.total_price || '0') : 0;
      })
    : recentAssignments.map(a => Number(a.total_price) || 0);
  volumeSource.forEach(p => {
    if (p < 10000) volumeBuckets[0].count++;
    else if (p < 50000) volumeBuckets[1].count++;
    else if (p < 100000) volumeBuckets[2].count++;
    else volumeBuckets[3].count++;
  });

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4">
      {/* Header - mobile responsive */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate('/terminal/mpi')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-base font-bold text-primary">{m.displayName.charAt(0).toUpperCase()}</span>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-lg font-semibold text-foreground truncate">{m.displayName}</h1>
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              <Badge className={`text-[9px] ${getRoleBadgeClass(m.roleName)}`}>{m.roleName}</Badge>
              {profile?.shift && <Badge variant="outline" className="text-[9px]">{profile.shift} Shift</Badge>}
              {profile?.specialization && profile.specialization !== 'general' && profile.specialization !== 'both' && (
                <Badge variant="outline" className="text-[9px] capitalize">{profile.specialization}</Badge>
              )}
              <div className="flex items-center gap-1">
                <div className={`h-1.5 w-1.5 rounded-full ${profile?.is_active !== false ? 'bg-green-500' : 'bg-muted-foreground'}`} />
                <span className="text-[9px] text-muted-foreground">{profile?.is_active !== false ? 'Online' : 'Offline'}</span>
              </div>
            </div>
          </div>
        </div>
        {/* Score + actions row */}
        <div className="flex items-center gap-2 ml-11 sm:ml-0 sm:justify-end">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/20">
            <span className="text-[9px] text-muted-foreground">Score</span>
            <span className={`text-xl font-bold ${getScoreColor(m.efficiencyScore)}`}>{m.efficiencyScore}</span>
          </div>
          {m.activeLoad > 0 && (
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">{m.activeLoad} active</Badge>
          )}
          <Button variant="outline" size="sm" className="h-7 text-[10px] px-2" onClick={fetchData}>
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Tabs - scrollable on mobile */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <ScrollArea className="w-full">
          <TabsList className="h-8 w-max">
            <TabsTrigger value="overview" className="text-[10px] sm:text-xs h-7">Overview</TabsTrigger>
            <TabsTrigger value="assignments" className="text-[10px] sm:text-xs h-7">Assignments</TabsTrigger>
            <TabsTrigger value="actions" className="text-[10px] sm:text-xs h-7">Actions</TabsTrigger>
            <TabsTrigger value="trends" className="text-[10px] sm:text-xs h-7">Trends</TabsTrigger>
            <TabsTrigger value="orders" className="text-[10px] sm:text-xs h-7">Orders</TabsTrigger>
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-4 mt-3">
          {/* Role-specific primary KPIs */}
          {isPayer && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3">
                <StatMini icon={CreditCard} label="Payments Made" value={m.paymentsMade} color="text-purple-500" />
                <StatMini icon={Banknote} label="Payment Volume" value={fmtVol(m.payerPaymentVolume || m.totalVolume)} color="text-green-500" />
                <StatMini icon={Lock} label="Locks Completed" value={`${m.payerLocksCompleted}/${m.payerLocksTotal}`} color="text-cyan-500" />
                <StatMini icon={Timer} label="Avg Lock→Pay" value={formatDuration(m.payerAvgLockToPayMin)} color="text-blue-500" />
                <StatMini icon={Activity} label={liveEligibleOrders.length > 0 ? 'Eligible Orders' : 'Active Locks'} value={liveEligibleOrders.length > 0 ? liveEligibleOrders.length : m.payerLocksActive} color="text-amber-500" />
              </div>

              {/* Payer timing cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
                <TimingCard icon={Banknote} label="Avg Lock → Payment" value={formatDuration(m.payerAvgLockToPayMin)} subtitle="Lock to completion" borderColor="border-l-blue-500" />
                <TimingCard icon={Timer} label="Median Lock → Pay" value={formatDuration(m.payerMedianLockToPayMin)} subtitle="50th percentile" borderColor="border-l-indigo-500" />
                <TimingCard icon={Trophy} label="Fastest Payment" value={formatDuration(m.payerFastestPayMin)} subtitle="Best time" borderColor="border-l-emerald-500" />
                <TimingCard icon={Gauge} label="Lock Success Rate" value={m.payerLocksTotal > 0 ? `${Math.round((m.payerLocksCompleted / m.payerLocksTotal) * 100)}%` : 'N/A'} subtitle="Completed / Total" borderColor="border-l-purple-500" />
              </div>
            </>
          )}

          {isOp && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3">
                <StatMini icon={Package} label="Total Handled" value={m.ordersHandled} color="text-primary" />
                <StatMini icon={CheckCircle} label="Completed" value={m.ordersCompleted} color="text-green-500" />
                <StatMini icon={XCircle} label="Cancelled" value={m.ordersCancelled} color="text-destructive" />
                <StatMini icon={TrendingUp} label="Total Volume" value={fmtVol(m.totalVolume)} color="text-emerald-500" />
                <StatMini icon={Activity} label="Active Now" value={m.activeLoad} color="text-amber-500" />
              </div>

              {/* Operator timing cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-3">
                <TimingCard icon={Banknote} label="Avg Payment Turnout" value={formatDuration(m.avgPaymentTimeMin)} subtitle="Assignment → Payment" borderColor="border-l-blue-500" />
                <TimingCard icon={Unlock} label="Avg Release Turnout" value={formatDuration(m.avgReleaseTimeMin)} subtitle="Payment → Release" borderColor="border-l-emerald-500" />
                <TimingCard icon={Gauge} label="Avg Handle Time" value={formatDuration(m.avgTotalHandleTimeMin)} subtitle="Assignment → Closure" borderColor="border-l-amber-500" />
                <TimingCard icon={Timer} label="Median Handle" value={formatDuration(m.medianHandleTimeMin)} subtitle="50th percentile" borderColor="border-l-indigo-500" />
                <TimingCard icon={Trophy} label="Speed Range" value={m.fastestHandleTimeMin != null ? `${formatDuration(m.fastestHandleTimeMin)} – ${formatDuration(m.slowestHandleTimeMin)}` : 'N/A'} subtitle="Fastest → Slowest" borderColor="border-l-purple-500" />
              </div>
            </>
          )}

          {/* Today's Performance + Volume */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card className="border-border bg-card">
              <CardContent className="p-3 sm:p-4">
                <h4 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-primary" /> Today's Performance
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  {isPayer ? (
                    <>
                      <div className="text-center p-2 rounded-lg bg-muted/30">
                        <div className="text-base sm:text-lg font-bold text-foreground">{m.payerTodayPayments}</div>
                        <div className="text-[8px] sm:text-[9px] text-muted-foreground">Payments</div>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-muted/30">
                        <div className="text-base sm:text-lg font-bold text-green-500">{m.todayCompleted}</div>
                        <div className="text-[8px] sm:text-[9px] text-muted-foreground">Completed</div>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-muted/30">
                        <div className="text-base sm:text-lg font-bold text-foreground">{fmtVol(m.payerTodayVolume || m.todayVolume)}</div>
                        <div className="text-[8px] sm:text-[9px] text-muted-foreground">Volume</div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-center p-2 rounded-lg bg-muted/30">
                        <div className="text-base sm:text-lg font-bold text-foreground">{m.todayHandled}</div>
                        <div className="text-[8px] sm:text-[9px] text-muted-foreground">Handled</div>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-muted/30">
                        <div className="text-base sm:text-lg font-bold text-green-500">{m.todayCompleted}</div>
                        <div className="text-[8px] sm:text-[9px] text-muted-foreground">Completed</div>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-muted/30">
                        <div className="text-base sm:text-lg font-bold text-foreground">{fmtVol(m.todayVolume)}</div>
                        <div className="text-[8px] sm:text-[9px] text-muted-foreground">Volume</div>
                      </div>
                    </>
                  )}
                </div>
                {m.peakHour != null && (
                  <div className="mt-2 flex items-center gap-2 text-[9px] text-muted-foreground bg-muted/20 rounded p-1.5">
                    <Zap className="h-3 w-3 text-amber-500 shrink-0" />
                    <span>Peak: <strong className="text-foreground">{m.peakHour}:00</strong> ({m.peakHourOrders} orders)</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="p-3 sm:p-4">
                <h4 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5 text-primary" /> Volume Breakdown
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2">
                      <ArrowDownRight className="h-3 w-3 text-green-500" />
                      <span className="text-[10px] text-muted-foreground">Buy Volume</span>
                    </div>
                    <span className="text-xs font-bold text-foreground">{fmtVol(m.buyVolume)}</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2">
                      <ArrowUpRight className="h-3 w-3 text-amber-500" />
                      <span className="text-[10px] text-muted-foreground">Sell Volume</span>
                    </div>
                    <span className="text-xs font-bold text-foreground">{fmtVol(m.sellVolume)}</span>
                  </div>
                  <Separator className="my-1" />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">Avg Order Size</span>
                    <span className="text-xs font-semibold text-foreground">
                      {m.ordersHandled > 0 ? fmtVol(m.totalVolume / m.ordersHandled) : 'N/A'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Rates */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {isPayer ? (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] sm:text-xs">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Lock className="h-3 w-3 text-cyan-500" /> Lock Success Rate
                    </span>
                    <span className="font-semibold text-cyan-500">
                      {m.payerLocksTotal > 0 ? Math.round((m.payerLocksCompleted / m.payerLocksTotal) * 100) : 0}%
                    </span>
                  </div>
                  <Progress value={m.payerLocksTotal > 0 ? (m.payerLocksCompleted / m.payerLocksTotal) * 100 : 0} className="h-1.5 sm:h-2" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] sm:text-xs">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <CheckCircle className="h-3 w-3 text-green-500" /> Order Completion Rate
                    </span>
                    <span className="font-semibold text-green-500">{m.completionRate}%</span>
                  </div>
                  <Progress value={m.completionRate} className="h-1.5 sm:h-2" />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] sm:text-xs">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <CheckCircle className="h-3 w-3 text-green-500" /> Completion Rate
                    </span>
                    <span className="font-semibold text-green-500">{m.completionRate}%</span>
                  </div>
                  <Progress value={m.completionRate} className="h-1.5 sm:h-2" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] sm:text-xs">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <XCircle className="h-3 w-3 text-destructive" /> Cancellation Rate
                    </span>
                    <span className="font-semibold text-destructive">{m.cancellationRate}%</span>
                  </div>
                  <Progress value={m.cancellationRate} className="h-1.5 sm:h-2 [&>div]:bg-destructive" />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] sm:text-xs">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Gauge className="h-3 w-3" /> Efficiency Score
                </span>
                <span className={`font-semibold ${getScoreColor(m.efficiencyScore)}`}>{m.efficiencyScore}%</span>
              </div>
              <Progress value={m.efficiencyScore} className="h-1.5 sm:h-2" />
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {tradeBreakdown.length > 0 && (
              <Card className="border-border bg-card">
                <CardContent className="p-3">
                  <h4 className="text-[10px] sm:text-xs font-semibold text-foreground mb-2 flex items-center gap-1">
                    <Target className="h-3 w-3 text-primary" /> Trade Type
                  </h4>
                  <div className="h-32 sm:h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={tradeBreakdown} cx="50%" cy="50%" innerRadius={25} outerRadius={45} paddingAngle={4} dataKey="value">
                          {tradeBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                        </Pie>
                        <Legend wrapperStyle={{ fontSize: 9 }} />
                        <ReTooltip contentStyle={{ fontSize: 10, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {statusBreakdown.length > 0 && (
              <Card className="border-border bg-card">
                <CardContent className="p-3">
                  <h4 className="text-[10px] sm:text-xs font-semibold text-foreground mb-2 flex items-center gap-1">
                    <BarChart3 className="h-3 w-3 text-primary" /> Status
                  </h4>
                  <div className="h-32 sm:h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={statusBreakdown} cx="50%" cy="50%" innerRadius={25} outerRadius={45} paddingAngle={4} dataKey="value">
                          <Cell fill={COLORS[1]} /><Cell fill={COLORS[2]} /><Cell fill={COLORS[3]} />
                        </Pie>
                        <Legend wrapperStyle={{ fontSize: 9 }} />
                        <ReTooltip contentStyle={{ fontSize: 10, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border-border bg-card">
              <CardContent className="p-3">
                <h4 className="text-[10px] sm:text-xs font-semibold text-foreground mb-2 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-primary" /> Volume Buckets
                </h4>
                <div className="h-32 sm:h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={volumeBuckets}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="range" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
                      <ReTooltip contentStyle={{ fontSize: 10, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                      <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Live Eligible Orders - for payers, show orders matching their assignment scope */}
          {isPayer && liveEligibleOrders.length > 0 && (
            <Card className="border-border bg-card border-l-2 border-l-amber-500">
              <CardContent className="p-3 sm:p-4">
                <h4 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-amber-500" /> Current Eligible Orders
                  <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[9px] ml-1">{liveEligibleOrders.length}</Badge>
                </h4>
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-[10px] sm:text-[11px]">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left py-1.5 px-1.5 font-medium">Order</th>
                        <th className="text-left py-1.5 px-1.5 font-medium">Counterparty</th>
                        <th className="text-right py-1.5 px-1.5 font-medium">Amount</th>
                        <th className="text-left py-1.5 px-1.5 font-medium">Asset</th>
                        <th className="text-left py-1.5 px-1.5 font-medium">Status</th>
                        <th className="text-left py-1.5 px-1.5 font-medium hidden sm:table-cell">Payment</th>
                        <th className="text-left py-1.5 px-1.5 font-medium hidden sm:table-cell">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liveEligibleOrders.slice(0, 20).map((order: any, i: number) => {
                        const statusColor = order.order_status === 'BUYER_PAYED' ? 'text-blue-400 border-blue-400/30' 
                          : order.order_status === 'APPEAL' ? 'text-destructive border-destructive/30' 
                          : 'text-amber-400 border-amber-400/30';
                        return (
                          <tr key={order.order_number || i} className="border-b border-border/50 hover:bg-muted/20">
                            <td className="py-1 px-1.5 font-mono text-[9px]">...{order.order_number?.slice(-8)}</td>
                            <td className="py-1 px-1.5 text-[9px]">{order.counter_part_nick_name || '—'}</td>
                            <td className="py-1 px-1.5 text-right font-medium">₹{parseFloat(order.total_price || '0').toLocaleString('en-IN')}</td>
                            <td className="py-1 px-1.5 text-[9px]">{order.asset || 'USDT'}</td>
                            <td className="py-1 px-1.5">
                              <Badge variant="outline" className={`text-[8px] ${statusColor}`}>
                                {order.order_status === 'BUYER_PAYED' ? 'Paid' : order.order_status === 'TRADING' ? 'Trading' : order.order_status}
                              </Badge>
                            </td>
                            <td className="py-1 px-1.5 text-[9px] text-muted-foreground hidden sm:table-cell">{order.pay_method_name || '—'}</td>
                            <td className="py-1 px-1.5 text-muted-foreground text-[9px] hidden sm:table-cell">
                              {order.create_time ? new Date(order.create_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {liveEligibleOrders.length > 20 && (
                    <p className="text-center text-[9px] text-muted-foreground mt-1.5">Showing 20 of {liveEligibleOrders.length}</p>
                  )}
                </div>
                <div className="mt-2 text-[9px] text-muted-foreground">
                  Orders from the last 24h matching this payer's assigned size ranges
                </div>
              </CardContent>
            </Card>
          )}

          {/* Assignment scope info when no data */}
          {isPayer && payerAssignData.filter((a: any) => a.is_active).length > 0 && m.paymentsMade === 0 && payerLockData.length === 0 && (
            <Card className="border-border bg-card border-l-2 border-l-blue-500">
              <CardContent className="p-3 sm:p-4">
                <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-blue-500" /> Assignment Scope
                </h4>
                <p className="text-[10px] text-muted-foreground mb-2">
                  This payer has active assignments but hasn't processed any orders yet. Performance metrics will populate once they start handling orders.
                </p>
                <div className="flex flex-wrap gap-2">
                  {payerAssignData.filter((a: any) => a.is_active).map((a: any) => {
                    const rangeName = a.size_range_id ? sizeRangeNames.get(a.size_range_id) : a.ad_id;
                    const rangeDetail = a.size_range_id ? sizeRangeDetails.get(a.size_range_id) : null;
                    return (
                      <Badge key={a.id} variant="outline" className="text-[9px] gap-1 border-blue-500/30 text-blue-400">
                        {a.assignment_type === 'size_range' ? '📏' : '📢'} {rangeName || a.id.slice(0, 8)}
                        {rangeDetail && ` (₹${rangeDetail.min_amount?.toLocaleString('en-IN')}–₹${rangeDetail.max_amount?.toLocaleString('en-IN')})`}
                      </Badge>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ASSIGNMENTS TAB */}
        <TabsContent value="assignments" className="space-y-4 mt-3">
          <h3 className="text-xs sm:text-sm font-semibold text-foreground flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            Assignment Configuration
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <Card className="border-border bg-card border-l-2 border-l-blue-500">
              <CardContent className="p-2.5 text-center">
                <UserCheck className="h-4 w-4 text-blue-400 mx-auto mb-1" />
                <div className="text-base font-bold text-foreground">{payerAssignData.filter(a => a.is_active).length}/{payerAssignData.length}</div>
                <div className="text-[8px] text-muted-foreground">Payer Assigns</div>
              </CardContent>
            </Card>
            <Card className="border-border bg-card border-l-2 border-l-indigo-500">
              <CardContent className="p-2.5 text-center">
                <ClipboardList className="h-4 w-4 text-indigo-400 mx-auto mb-1" />
                <div className="text-base font-bold text-foreground">{operatorAssignData.filter(a => a.is_active).length}/{operatorAssignData.length}</div>
                <div className="text-[8px] text-muted-foreground">Operator Assigns</div>
              </CardContent>
            </Card>
            <Card className="border-border bg-card border-l-2 border-l-cyan-500">
              <CardContent className="p-2.5 text-center">
                <Lock className="h-4 w-4 text-cyan-400 mx-auto mb-1" />
                <div className="text-base font-bold text-foreground">{payerLockData.filter(l => l.status === 'completed').length}/{payerLockData.length}</div>
                <div className="text-[8px] text-muted-foreground">Payer Locks</div>
              </CardContent>
            </Card>
            <Card className="border-border bg-card border-l-2 border-l-emerald-500">
              <CardContent className="p-2.5 text-center">
                <Link2 className="h-4 w-4 text-emerald-400 mx-auto mb-1" />
                <div className="text-base font-bold text-foreground">
                  {new Set([...payerAssignData.map(a => a.ad_id), ...operatorAssignData.map(a => a.ad_id)].filter(Boolean)).size}
                </div>
                <div className="text-[8px] text-muted-foreground">Unique Ad IDs</div>
              </CardContent>
            </Card>
          </div>

          {/* Payer Assignments Table */}
          {payerAssignData.length > 0 && (
            <Card className="border-border bg-card">
              <CardHeader className="pb-2 px-3 pt-3">
                <CardTitle className="text-xs flex items-center gap-2">
                  <UserCheck className="h-3.5 w-3.5 text-blue-400" /> Payer Assignments
                  <Badge variant="outline" className="text-[9px]">{payerAssignData.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-[10px] sm:text-[11px]">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left py-1.5 px-1.5 font-medium">Type</th>
                        <th className="text-left py-1.5 px-1.5 font-medium">Range / Ad</th>
                        <th className="text-left py-1.5 px-1.5 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payerAssignData.map((a, i) => (
                        <tr key={a.id || i} className="border-b border-border/50">
                          <td className="py-1 px-1.5 capitalize">{a.assignment_type}</td>
                          <td className="py-1 px-1.5 font-mono text-[9px]">
                            {a.size_range_id ? (sizeRangeNames.get(a.size_range_id) || a.size_range_id.slice(0, 8)) : a.ad_id || '—'}
                          </td>
                          <td className="py-1 px-1.5">
                            <Badge variant="outline" className={`text-[8px] ${a.is_active ? 'text-green-500 border-green-500/30' : 'text-muted-foreground'}`}>
                              {a.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Operator Assignments Table */}
          {operatorAssignData.length > 0 && (
            <Card className="border-border bg-card">
              <CardHeader className="pb-2 px-3 pt-3">
                <CardTitle className="text-xs flex items-center gap-2">
                  <ClipboardList className="h-3.5 w-3.5 text-indigo-400" /> Operator Assignments
                  <Badge variant="outline" className="text-[9px]">{operatorAssignData.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-[10px] sm:text-[11px]">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left py-1.5 px-1.5 font-medium">Type</th>
                        <th className="text-left py-1.5 px-1.5 font-medium">Range / Ad</th>
                        <th className="text-left py-1.5 px-1.5 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {operatorAssignData.map((a, i) => (
                        <tr key={a.id || i} className="border-b border-border/50">
                          <td className="py-1 px-1.5 capitalize">{a.assignment_type}</td>
                          <td className="py-1 px-1.5 font-mono text-[9px]">
                            {a.size_range_id ? (sizeRangeNames.get(a.size_range_id) || a.size_range_id.slice(0, 8)) : a.ad_id || '—'}
                          </td>
                          <td className="py-1 px-1.5">
                            <Badge variant="outline" className={`text-[8px] ${a.is_active ? 'text-green-500 border-green-500/30' : 'text-muted-foreground'}`}>
                              {a.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Payer Order Locks */}
          {payerLockData.length > 0 && (
            <Card className="border-border bg-card">
              <CardHeader className="pb-2 px-3 pt-3">
                <CardTitle className="text-xs flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5 text-cyan-400" /> Payer Locks
                  <Badge variant="outline" className="text-[9px]">{payerLockData.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-[10px] sm:text-[11px]">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left py-1.5 px-1.5 font-medium">Order</th>
                        <th className="text-left py-1.5 px-1.5 font-medium">Counterparty</th>
                        <th className="text-right py-1.5 px-1.5 font-medium">Amount</th>
                        <th className="text-left py-1.5 px-1.5 font-medium">Status</th>
                        <th className="text-left py-1.5 px-1.5 font-medium">Locked At</th>
                        <th className="text-left py-1.5 px-1.5 font-medium hidden sm:table-cell">Completed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payerLockData.slice(0, 20).map((lock, i) => {
                        const hist = payerOrderHistory.get(lock.order_number);
                        return (
                          <tr key={lock.id || i} className="border-b border-border/50">
                            <td className="py-1 px-1.5 font-mono text-[9px]">...{lock.order_number?.slice(-8)}</td>
                            <td className="py-1 px-1.5 text-[9px]">{hist?.counter_part_nick_name || '—'}</td>
                            <td className="py-1 px-1.5 text-right font-medium">
                              {hist ? `₹${parseFloat(hist.total_price || '0').toLocaleString('en-IN')}` : '—'}
                            </td>
                            <td className="py-1 px-1.5">
                              <Badge variant="outline" className={`text-[8px] ${lock.status === 'completed' ? 'text-green-500 border-green-500/30' : 'text-amber-400 border-amber-400/30'}`}>
                                {lock.status}
                              </Badge>
                            </td>
                            <td className="py-1 px-1.5 text-muted-foreground text-[9px]">
                              {new Date(lock.locked_at || lock.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="py-1 px-1.5 text-muted-foreground text-[9px] hidden sm:table-cell">
                              {lock.completed_at ? new Date(lock.completed_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {payerLockData.length > 20 && (
                    <p className="text-center text-[9px] text-muted-foreground mt-1.5">Showing 20 of {payerLockData.length}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {payerAssignData.length === 0 && operatorAssignData.length === 0 && payerLockData.length === 0 && (
            <div className="text-center py-8 text-xs text-muted-foreground">No assignment data found for this user.</div>
          )}
        </TabsContent>

        {/* ACTIONS TAB */}
        <TabsContent value="actions" className="space-y-4 mt-3">
          <h3 className="text-xs sm:text-sm font-semibold text-foreground flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" /> Action Breakdown
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3">
            {[
              { label: 'Payments', value: m.paymentsMade, icon: CreditCard, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
              { label: 'Releases', value: m.releasesPerformed, icon: Unlock, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
              { label: 'Chats', value: m.chatMessagesSent, icon: MessageSquare, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
              { label: 'Escalations', value: m.escalationsHandled, icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10 border-destructive/20' },
              { label: 'Approvals', value: m.approvalActions, icon: Shield, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <Card key={label} className={`border ${bg}`}>
                <CardContent className="p-2.5 text-center">
                  <Icon className={`h-4 w-4 ${color} mx-auto mb-1`} />
                  <div className="text-lg font-bold text-foreground">{value}</div>
                  <div className="text-[8px] text-muted-foreground">{label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {actionDetails.length > 0 && (
            <Card className="border-border bg-card">
              <CardContent className="p-3">
                <h4 className="text-xs font-semibold text-foreground mb-2">All Recorded Actions</h4>
                <div className="space-y-1.5">
                  {actionDetails.map(a => (
                    <div key={a.action_type} className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border">
                      <div className="flex items-center gap-2 min-w-0">
                        <a.icon className={`h-3.5 w-3.5 shrink-0 ${a.color}`} />
                        <span className="text-[10px] sm:text-xs text-foreground truncate">{a.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs font-bold text-foreground">{a.count}</span>
                        {m.ordersHandled > 0 && (
                          <Badge variant="outline" className="text-[7px] sm:text-[8px]">{Math.round((a.count / m.ordersHandled) * 100)}%</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {actionDetails.length > 0 && (
            <Card className="border-border bg-card">
              <CardContent className="p-3">
                <h4 className="text-xs font-semibold text-foreground mb-2">Action Distribution</h4>
                <div className="h-44 sm:h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={actionDetails.map(a => ({ name: a.label, value: a.count }))} cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={3} dataKey="value">
                        {actionDetails.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Legend wrapperStyle={{ fontSize: 9 }} />
                      <ReTooltip contentStyle={{ fontSize: 10, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {actionDetails.length === 0 && (
            <div className="text-center py-8 text-xs text-muted-foreground">No action logs recorded yet.</div>
          )}
        </TabsContent>

        {/* TRENDS TAB */}
        <TabsContent value="trends" className="space-y-4 mt-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-xs sm:text-sm font-semibold text-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Trends
            </h3>
            <Select value={trendDays} onValueChange={setTrendDays}>
              <SelectTrigger className="h-7 text-[10px] w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 Days</SelectItem>
                <SelectItem value="14">14 Days</SelectItem>
                <SelectItem value="30">30 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card className="border-border bg-card">
            <CardHeader className="pb-1 px-3 pt-3">
              <CardTitle className="text-xs flex items-center gap-2">
                <Package className="h-3.5 w-3.5 text-primary" /> Daily {isPayer ? 'Payments' : 'Orders'}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="h-40 sm:h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyTrends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
                    <ReTooltip contentStyle={{ fontSize: 10, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                    {isPayer ? (
                      <>
                        <Area type="monotone" dataKey="payments" fill="hsl(262, 83%, 48%)" stroke="hsl(262, 83%, 48%)" fillOpacity={0.2} name="Payments" />
                        <Area type="monotone" dataKey="orders" fill="hsl(var(--primary))" stroke="hsl(var(--primary))" fillOpacity={0.1} name="Orders" />
                      </>
                    ) : (
                      <>
                        <Area type="monotone" dataKey="orders" fill="hsl(var(--primary))" stroke="hsl(var(--primary))" fillOpacity={0.2} name="Total" />
                        <Area type="monotone" dataKey="completed" fill="hsl(142, 76%, 36%)" stroke="hsl(142, 76%, 36%)" fillOpacity={0.2} name="Completed" />
                      </>
                    )}
                    <Legend wrapperStyle={{ fontSize: 9 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader className="pb-1 px-3 pt-3">
              <CardTitle className="text-xs flex items-center gap-2">
                <Banknote className="h-3.5 w-3.5 text-primary" /> Daily Volume (₹)
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="h-36 sm:h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyTrends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
                    <ReTooltip contentStyle={{ fontSize: 10, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} formatter={(value: number) => [`₹${value.toLocaleString('en-IN')}`, 'Volume']} />
                    <Bar dataKey="volume" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader className="pb-1 px-3 pt-3">
              <CardTitle className="text-xs flex items-center gap-2">
                <Activity className="h-3.5 w-3.5 text-primary" /> Hourly Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="h-28 sm:h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyActivity.filter((_, i) => i >= 6 && i <= 23)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="hour" tick={{ fontSize: 7, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
                    <ReTooltip contentStyle={{ fontSize: 10, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                    <Bar dataKey="orders" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ORDERS TAB */}
        <TabsContent value="orders" className="space-y-3 mt-3">
          {/* Payer-specific: show enriched lock orders */}
          {isPayer && payerLockData.length > 0 && (
            <Card className="border-border bg-card">
              <CardContent className="p-3">
                <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-primary" /> Payer Order History ({payerLockData.length})
                </h4>
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-[10px] sm:text-[11px]">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left py-1.5 px-1.5 font-medium">Order</th>
                        <th className="text-left py-1.5 px-1.5 font-medium">Counterparty</th>
                        <th className="text-left py-1.5 px-1.5 font-medium hidden sm:table-cell">Payment</th>
                        <th className="text-right py-1.5 px-1.5 font-medium">Amount</th>
                        <th className="text-left py-1.5 px-1.5 font-medium">Lock Status</th>
                        <th className="text-left py-1.5 px-1.5 font-medium hidden sm:table-cell">Locked</th>
                        <th className="text-left py-1.5 px-1.5 font-medium hidden md:table-cell">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payerLockData
                        .sort((a: any, b: any) => new Date(b.locked_at || b.created_at).getTime() - new Date(a.locked_at || a.created_at).getTime())
                        .slice(0, 50)
                        .map((lock: any, i: number) => {
                          const hist = payerOrderHistory.get(lock.order_number);
                          const lockDuration = lock.status === 'completed' && lock.locked_at && lock.completed_at
                            ? ((new Date(lock.completed_at).getTime() - new Date(lock.locked_at).getTime()) / 60000)
                            : null;
                          return (
                            <tr key={lock.id || i} className="border-b border-border/50 hover:bg-muted/20">
                              <td className="py-1 px-1.5 font-mono text-[9px]">...{lock.order_number?.slice(-8)}</td>
                              <td className="py-1 px-1.5 text-[9px]">{hist?.counter_part_nick_name || '—'}</td>
                              <td className="py-1 px-1.5 text-[9px] hidden sm:table-cell">{hist?.pay_method_name || '—'}</td>
                              <td className="py-1 px-1.5 text-right font-medium">
                                {hist ? `₹${parseFloat(hist.total_price || '0').toLocaleString('en-IN')}` : '—'}
                              </td>
                              <td className="py-1 px-1.5">
                                <Badge variant="outline" className={`text-[8px] ${lock.status === 'completed' ? 'text-green-500 border-green-500/30' : 'text-amber-400 border-amber-400/30'}`}>
                                  {lock.status}
                                </Badge>
                              </td>
                              <td className="py-1 px-1.5 text-muted-foreground text-[9px] hidden sm:table-cell">
                                {new Date(lock.locked_at || lock.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="py-1 px-1.5 text-muted-foreground text-[9px] hidden md:table-cell">
                                {lockDuration != null ? `${Math.round(lockDuration * 10) / 10}m` : '—'}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                  {payerLockData.length > 50 && (
                    <p className="text-center text-[9px] text-muted-foreground mt-1.5">Showing 50 of {payerLockData.length}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Operator assignments table */}
          {recentAssignments.length > 0 && (
            <Card className="border-border bg-card">
              <CardContent className="p-3">
                <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5 text-primary" /> {isPayer ? 'Operator Assignments' : 'All Assignments'} ({recentAssignments.length})
                </h4>
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-[10px] sm:text-[11px]">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left py-1.5 px-1.5 font-medium">Order</th>
                        <th className="text-left py-1.5 px-1.5 font-medium">Type</th>
                        <th className="text-right py-1.5 px-1.5 font-medium">Amount</th>
                        <th className="text-left py-1.5 px-1.5 font-medium">Status</th>
                        <th className="text-left py-1.5 px-1.5 font-medium hidden sm:table-cell">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentAssignments.slice(0, 30).map((a, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                          <td className="py-1 px-1.5 font-mono text-[9px]">...{a.order_number?.slice(-8)}</td>
                          <td className="py-1 px-1.5">
                            <Badge variant="outline" className={`text-[8px] ${a.trade_type === 'BUY' ? 'text-green-500 border-green-500/30' : 'text-amber-500 border-amber-500/30'}`}>
                              {a.trade_type || 'N/A'}
                            </Badge>
                          </td>
                          <td className="py-1 px-1.5 text-right font-medium">₹{Number(a.total_price || 0).toLocaleString('en-IN')}</td>
                          <td className="py-1 px-1.5">
                            <Badge variant="outline" className={`text-[8px] ${a.is_active ? 'text-amber-400 border-amber-400/30' : a.assignment_type === 'cancelled' ? 'text-destructive border-destructive/30' : 'text-green-500 border-green-500/30'}`}>
                              {a.is_active ? 'Active' : a.assignment_type === 'cancelled' ? 'Cancelled' : 'Done'}
                            </Badge>
                          </td>
                          <td className="py-1 px-1.5 text-muted-foreground hidden sm:table-cell">
                            {new Date(a.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {recentAssignments.length > 30 && (
                    <p className="text-center text-[9px] text-muted-foreground mt-1.5">Showing 30 of {recentAssignments.length}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {recentAssignments.length === 0 && payerLockData.length === 0 && (
            <div className="text-center py-8 text-xs text-muted-foreground">No order data found.</div>
          )}
        </TabsContent>
      </Tabs>

      {/* Footer */}
      <div className="flex items-center gap-3 text-[9px] text-muted-foreground flex-wrap">
        {profile?.automation_included && <span>⚡ Auto-assign: Enabled</span>}
        {profile?.specialization && <span>Specialization: <span className="capitalize text-foreground">{profile.specialization}</span></span>}
      </div>
    </div>
  );
}

export default function TerminalOperatorDetail() {
  return (
    <TerminalPermissionGate permissions={['terminal_mpi_view_own']}>
      <TerminalOperatorDetailContent />
    </TerminalPermissionGate>
  );
}
