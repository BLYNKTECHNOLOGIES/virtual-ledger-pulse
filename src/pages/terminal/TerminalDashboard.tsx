import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  ShoppingCart, 
  TrendingUp, 
  Clock, 
  AlertTriangle, 
  ArrowUpRight, 
  ArrowDownRight,
  Activity,
  Megaphone 
} from 'lucide-react';
import { Link } from 'react-router-dom';

const metrics = [
  { 
    label: 'Active Orders', 
    value: '—', 
    icon: ShoppingCart, 
    change: null,
    color: 'text-primary' 
  },
  { 
    label: 'Pending Payments', 
    value: '—', 
    icon: Clock, 
    change: null,
    color: 'text-warning' 
  },
  { 
    label: 'Completed Today', 
    value: '—', 
    icon: TrendingUp, 
    change: null,
    color: 'text-success' 
  },
  { 
    label: 'Appeals', 
    value: '—', 
    icon: AlertTriangle, 
    change: null,
    color: 'text-destructive' 
  },
];

export default function TerminalDashboard() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
        <p className="text-xs text-muted-foreground mt-0.5">P2P Trading Operations Overview</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {metrics.map((m) => (
          <Card key={m.label} className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <m.icon className={`h-4 w-4 ${m.color}`} />
                {m.change !== null && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                    {m.change > 0 ? <ArrowUpRight className="h-3 w-3 text-success" /> : <ArrowDownRight className="h-3 w-3 text-destructive" />}
                    {Math.abs(m.change)}%
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold text-foreground tabular-nums">{m.value}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{m.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick access */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link to="/terminal/ads">
          <Card className="bg-card border-border hover:border-primary/30 transition-colors cursor-pointer group">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Megaphone className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                  Ads Manager
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Create, edit & manage P2P merchant ads
                </p>
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </CardContent>
          </Card>
        </Link>

        <Card className="bg-card border-border opacity-60">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
              <ShoppingCart className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-foreground">Orders</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Coming soon — order workspace</p>
            </div>
            <span className="text-[9px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">Phase 3</span>
          </CardContent>
        </Card>
      </div>

      {/* Placeholder charts area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Trade Volume
            </CardTitle>
          </CardHeader>
          <CardContent className="h-48 flex items-center justify-center">
            <p className="text-xs text-muted-foreground">Chart data will appear when orders module is active</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-success" />
              Ad Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="h-48 flex items-center justify-center">
            <p className="text-xs text-muted-foreground">Ad metrics will populate from Binance data</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
