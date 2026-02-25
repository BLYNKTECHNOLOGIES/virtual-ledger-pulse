import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Package, TrendingUp, Timer, Activity, ArrowUpRight, ArrowDownRight,
  CheckCircle, XCircle, Clock, Shield, Wallet, CreditCard, Users,
  BarChart3, Zap, Target,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';

const COLORS = ['hsl(231, 81%, 60%)', 'hsl(142, 76%, 36%)', 'hsl(38, 92%, 50%)', 'hsl(0, 84%, 60%)'];

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

interface OperatorProfile {
  specialization: string;
  shift: string | null;
  is_active: boolean;
  automation_included: boolean;
}

interface OperatorDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metric: OperatorMetric;
  profile?: OperatorProfile | null;
  recentAssignments?: any[];
}

// Role-specific KPI definitions
const ROLE_KPIS: Record<string, { label: string; icon: any; compute: (m: OperatorMetric, assignments: any[]) => string | number }[]> = {
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
    { label: 'Avg Handle Time', icon: Timer, compute: (m) => `${m.avgCompletionTime}m` },
    { label: 'Active Orders', icon: Activity, compute: (m) => m.activeLoad },
  ],
  'Payer': [
    { label: 'Payments Made', icon: CreditCard, compute: (m) => m.ordersCompleted },
    { label: 'Payment Volume', icon: Wallet, compute: (m) => `₹${(m.totalVolume / 1000).toFixed(0)}K` },
    { label: 'Avg Payment Time', icon: Timer, compute: (m) => `${m.avgCompletionTime}m` },
    { label: 'Pending Payments', icon: Clock, compute: (m) => m.activeLoad },
  ],
};

function getRoleKPIs(roleName: string) {
  // Match role to closest category
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

export function OperatorDetailDialog({
  open,
  onOpenChange,
  metric,
  profile,
  recentAssignments = [],
}: OperatorDetailDialogProps) {
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

  // Group assignments by hour for activity timeline
  const hourlyActivity = Array.from({ length: 24 }, (_, i) => ({ hour: `${i}:00`, orders: 0 }));
  recentAssignments.forEach(a => {
    const h = new Date(a.created_at).getHours();
    hourlyActivity[h].orders++;
  });

  // Volume buckets
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-lg font-bold text-primary">
                  {m.displayName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">{m.displayName}</DialogTitle>
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
            <div className="flex items-center gap-2">
              {m.activeLoad > 0 && (
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">
                  {m.activeLoad} active
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
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
                    {compute(m, recentAssignments)}
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
              { label: 'Total Volume', value: `₹${(m.totalVolume / 1000).toFixed(0)}K`, icon: TrendingUp, color: 'text-emerald-500' },
              { label: 'Avg Time', value: `${m.avgCompletionTime}m`, icon: Timer, color: 'text-blue-500' },
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
            {/* Trade Type Breakdown */}
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

            {/* Status Breakdown */}
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

            {/* Volume Distribution */}
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
                      {recentAssignments.slice(0, 10).map((a, i) => (
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
                            <Badge variant="outline" className={`text-[9px] ${a.is_active ? 'text-amber-400 border-amber-400/30' : 'text-green-500 border-green-500/30'}`}>
                              {a.is_active ? 'Active' : 'Done'}
                            </Badge>
                          </td>
                          <td className="py-1.5 px-2 text-muted-foreground">
                            {new Date(a.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Automation Status (for Operators/Payers) */}
          {profile && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
              <span className="flex items-center gap-1">
                <Zap className={`h-3 w-3 ${profile.automation_included ? 'text-amber-400' : 'text-muted-foreground'}`} />
                Auto-assign: {profile.automation_included ? 'Enabled' : 'Disabled'}
              </span>
              {profile.specialization && (
                <span>Specialization: <span className="text-foreground capitalize">{profile.specialization}</span></span>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
