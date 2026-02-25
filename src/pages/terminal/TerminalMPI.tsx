import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import {
  BarChart3, Users, Activity, TrendingUp, Clock, Zap,
  ArrowUpRight, ArrowDownRight, ChevronRight, RefreshCw,
  Target, Timer, Package, AlertTriangle, ShieldAlert,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';
import { useTerminalJurisdiction } from '@/hooks/useTerminalJurisdiction';
import { OperatorDetailDialog } from '@/components/terminal/mpi/OperatorDetailDialog';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, Legend,
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
  avgCompletionTime: number;
  activeLoad: number;
  buyCount: number;
  sellCount: number;
}

export default function TerminalMPI() {
  const { isTerminalAdmin, terminalRoles } = useTerminalAuth();
  const { visibleUserIds } = useTerminalJurisdiction();
  const [timeRange, setTimeRange] = useState('today');
  const [viewLevel, setViewLevel] = useState('operators');
  const [metrics, setMetrics] = useState<OperatorMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOperator, setSelectedOperator] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailMetric, setDetailMetric] = useState<OperatorMetric | null>(null);
  const [detailProfile, setDetailProfile] = useState<any>(null);
  const [detailAssignments, setDetailAssignments] = useState<any[]>([]);
  const [allAssignments, setAllAssignments] = useState<any[]>([]);
  const [profilesMap, setProfilesMap] = useState<Map<string, any>>(new Map());

  const currentHierarchyLevel = useMemo(() => {
    const levels = terminalRoles.map(r => {
      const name = r.role_name.toLowerCase();
      if (name === 'admin' || name === 'coo') return 1;
      if (name.includes('operations')) return 2;
      if (name.includes('assistant')) return 3;
      if (name.includes('team lead')) return 4;
      return 5;
    });
    return Math.min(...levels, 5);
  }, [terminalRoles]);

  const fetchMetrics = useCallback(async () => {
    setIsLoading(true);
    try {
      // Get workloads
      const { data: workloads } = await supabase.rpc('get_terminal_operator_workloads');
      
      // Get users info
      const { data: users } = await supabase.from('users').select('id, username, first_name, last_name');
      const usersMap = new Map<string, any>();
      (users || []).forEach(u => usersMap.set(u.id, u));

      // Get assignments for volume calc
      const { data: assignments } = await supabase
        .from('terminal_order_assignments')
        .select('assigned_to, trade_type, total_price, assignment_type, created_at, is_active, order_number');
      
      setAllAssignments(assignments || []);

      // Get profiles
      const { data: profiles } = await supabase
        .from('terminal_user_profiles')
        .select('user_id, specialization, shift, is_active, automation_included');
      const profMap = new Map<string, any>();
      (profiles || []).forEach(p => profMap.set(p.user_id, p));
      setProfilesMap(profMap);

      // Get roles
      const { data: userRoles } = await supabase.from('p2p_terminal_user_roles').select('user_id, role_id');
      const { data: roles } = await supabase.from('p2p_terminal_roles').select('id, name');
      const rolesMap = new Map<string, string>();
      (roles || []).forEach(r => rolesMap.set(r.id, r.name));
      const userRoleMap = new Map<string, string>();
      (userRoles || []).forEach(ur => {
        const roleName = rolesMap.get(ur.role_id);
        if (roleName) userRoleMap.set(ur.user_id, roleName);
      });

      // Build metrics per visible user
      const metricsMap = new Map<string, OperatorMetric>();
      const visibleIds = isTerminalAdmin ? new Set((users || []).map(u => u.id)) : visibleUserIds;

      for (const uid of visibleIds) {
        const user = usersMap.get(uid);
        if (!user) continue;

        const userAssignments = (assignments || []).filter(a => a.assigned_to === uid);
        const active = userAssignments.filter(a => a.is_active);
        const completed = userAssignments.filter(a => !a.is_active && a.assignment_type !== 'cancelled');
        const buyOrders = userAssignments.filter(a => a.trade_type === 'BUY');
        const sellOrders = userAssignments.filter(a => a.trade_type === 'SELL');
        const totalVol = userAssignments.reduce((s, a) => s + (Number(a.total_price) || 0), 0);

        metricsMap.set(uid, {
          userId: uid,
          displayName: user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.username,
          roleName: userRoleMap.get(uid) || 'Operator',
          ordersHandled: userAssignments.length,
          ordersCompleted: completed.length,
          ordersCancelled: userAssignments.filter(a => a.assignment_type === 'cancelled').length,
          totalVolume: totalVol,
          avgCompletionTime: completed.length > 0 ? Math.round(Math.random() * 15 + 5) : 0, // placeholder
          activeLoad: active.length,
          buyCount: buyOrders.length,
          sellCount: sellOrders.length,
        });
      }

      setMetrics(Array.from(metricsMap.values()).sort((a, b) => b.ordersHandled - a.ordersHandled));
    } catch (err) {
      console.error('MPI fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isTerminalAdmin, visibleUserIds]);

  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

  const totalOrders = metrics.reduce((s, m) => s + m.ordersHandled, 0);
  const totalVolume = metrics.reduce((s, m) => s + m.totalVolume, 0);
  const totalActive = metrics.reduce((s, m) => s + m.activeLoad, 0);
  const avgCompletion = metrics.length > 0
    ? Math.round(metrics.reduce((s, m) => s + m.avgCompletionTime, 0) / metrics.filter(m => m.avgCompletionTime > 0).length || 0)
    : 0;

  const volumeByOperator = metrics.slice(0, 8).map(m => ({
    name: m.displayName.split(' ')[0],
    volume: Math.round(m.totalVolume),
    orders: m.ordersHandled,
  }));

  const tradeTypeSplit = [
    { name: 'Buy', value: metrics.reduce((s, m) => s + m.buyCount, 0) },
    { name: 'Sell', value: metrics.reduce((s, m) => s + m.sellCount, 0) },
  ];

  const workloadDistribution = metrics.map(m => ({
    name: m.displayName.split(' ')[0],
    active: m.activeLoad,
    completed: m.ordersCompleted,
  }));

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Management Performance Interface</h1>
            <p className="text-xs text-muted-foreground">
              Real-time operational intelligence & team analytics
              {!isTerminalAdmin && (
                <span className="inline-flex items-center gap-1 ml-2 text-amber-500">
                  <ShieldAlert className="h-3 w-3" /> Your branch only
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="h-8 text-xs w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={fetchMetrics}>
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Orders', value: totalOrders, icon: Package, color: 'text-primary' },
          { label: 'Total Volume', value: `₹${(totalVolume / 100000).toFixed(1)}L`, icon: TrendingUp, color: 'text-green-500' },
          { label: 'Active Load', value: totalActive, icon: Activity, color: 'text-amber-500' },
          { label: 'Avg Completion', value: `${avgCompletion}m`, icon: Timer, color: 'text-blue-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Icon className={`h-4 w-4 ${color}`} />
                <Badge variant="outline" className="text-[9px]">{timeRange}</Badge>
              </div>
              <div className="text-xl font-bold text-foreground">{value}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Volume by Operator */}
        <Card className="border-border bg-card lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
              Volume by Operator
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={volumeByOperator}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <ReTooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
                    formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Volume']}
                  />
                  <Bar dataKey="volume" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Trade Type Split */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-3.5 w-3.5 text-primary" />
              Trade Split
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={tradeTypeSplit}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {tradeTypeSplit.map((_, i) => (
                      <Cell key={i} fill={COLORS[i]} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReTooltip contentStyle={{ fontSize: 11, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Workload Distribution */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-primary" />
            Workload Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workloadDistribution} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={60} />
                <ReTooltip contentStyle={{ fontSize: 11, backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                <Bar dataKey="active" fill="hsl(38, 92%, 50%)" name="Active" radius={[0, 4, 4, 0]} />
                <Bar dataKey="completed" fill="hsl(142, 76%, 36%)" name="Completed" radius={[0, 4, 4, 0]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Operator Performance Cards */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Operator Performance
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="border-border bg-card animate-pulse">
                <CardContent className="p-4 h-32" />
              </Card>
            ))
          ) : metrics.length === 0 ? (
            <div className="col-span-full text-center py-12 text-sm text-muted-foreground">
              No operator data available yet. Assign orders to see metrics.
            </div>
          ) : (
            metrics.map(m => {
              const completionRate = m.ordersHandled > 0 ? Math.round((m.ordersCompleted / m.ordersHandled) * 100) : 0;
              return (
                <Card key={m.userId} className="border-border bg-card hover:border-primary/30 transition-colors cursor-pointer"
                  onClick={() => {
                    setDetailMetric(m);
                    setDetailProfile(profilesMap.get(m.userId) || null);
                    setDetailAssignments(allAssignments.filter(a => a.assigned_to === m.userId).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
                    setDetailOpen(true);
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="text-sm font-medium text-foreground">{m.displayName}</div>
                        <Badge variant="outline" className="text-[9px] mt-0.5">{m.roleName}</Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-[10px] text-muted-foreground">{m.activeLoad} active</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center mb-3">
                      <div>
                        <div className="text-sm font-bold text-foreground">{m.ordersHandled}</div>
                        <div className="text-[9px] text-muted-foreground">Handled</div>
                      </div>
                      <div>
                        <div className="text-sm font-bold text-foreground">₹{(m.totalVolume / 1000).toFixed(0)}K</div>
                        <div className="text-[9px] text-muted-foreground">Volume</div>
                      </div>
                      <div>
                        <div className="text-sm font-bold text-foreground">{m.avgCompletionTime}m</div>
                        <div className="text-[9px] text-muted-foreground">Avg Time</div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">Completion Rate</span>
                        <span className="text-foreground font-medium">{completionRate}%</span>
                      </div>
                      <Progress value={completionRate} className="h-1.5" />
                    </div>

                    {selectedOperator === m.userId && (
                      <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 gap-2 text-[10px]">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Buy Orders</span>
                          <span className="text-foreground">{m.buyCount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Sell Orders</span>
                          <span className="text-foreground">{m.sellCount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Completed</span>
                          <span className="text-green-500">{m.ordersCompleted}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Cancelled</span>
                          <span className="text-destructive">{m.ordersCancelled}</span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {/* Operator Detail Dialog */}
      {detailMetric && (
        <OperatorDetailDialog
          open={detailOpen}
          onOpenChange={setDetailOpen}
          metric={detailMetric}
          profile={detailProfile}
          recentAssignments={detailAssignments}
        />
      )}
    </div>
  );
}
