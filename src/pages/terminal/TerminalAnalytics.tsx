import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, TrendingUp, TrendingDown, BarChart3, ShoppingCart, Megaphone, ArrowUpDown, Banknote, Clock, Shield } from 'lucide-react';
import { useBinanceAdsList, BinanceAd, BINANCE_AD_STATUS } from '@/hooks/useBinanceAds';
import { useCachedOrderHistory } from '@/hooks/useBinanceOrderSync';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

// ─── Helpers ───
function fmt(n: number, decimals = 0) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(decimals);
}

function fmtINR(n: number) {
  return `₹${fmt(n)}`;
}

const STATUS_COLORS: Record<number, string> = {
  1: 'hsl(142, 76%, 36%)',
  2: 'hsl(38, 92%, 50%)',
  3: 'hsl(0, 0%, 45%)',
};

// ─── Stat Card ───
function StatCard({ icon: Icon, label, value, sub, trend }: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-3.5 flex items-start gap-3">
        <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
          <p className="text-lg font-bold text-foreground tabular-nums leading-tight flex items-center gap-1.5">
            {value}
            {trend === 'up' && <TrendingUp className="h-3.5 w-3.5 text-trade-buy" />}
            {trend === 'down' && <TrendingDown className="h-3.5 w-3.5 text-trade-sell" />}
          </p>
          {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ───
export default function TerminalAnalytics() {
  const { data: adsRaw, isLoading: adsLoading } = useBinanceAdsList({ advStatus: null });
  // Use cached DB data instead of live API calls
  const { data: cachedOrders = [], isLoading: ordersLoading } = useCachedOrderHistory();

  const ads: BinanceAd[] = useMemo(() => {
    if (!adsRaw) return [];
    const list = (adsRaw as any)?.data || (adsRaw as any)?.list || adsRaw;
    return Array.isArray(list) ? list : [];
  }, [adsRaw]);

  const orders = useMemo(() => {
    if (!Array.isArray(cachedOrders)) return [];
    return cachedOrders.map((o: any) => ({
      orderNumber: o.orderNumber || o.order_number || '',
      tradeType: o.tradeType || o.trade_type || '',
      orderStatus: o.orderStatus || o.order_status || '',
      totalPrice: o.totalPrice || o.total_price || '0',
      amount: o.amount || '0',
      createTime: o.createTime || o.create_time || 0,
    }));
  }, [cachedOrders]);

  // ─── Trade Stats (30d) ───
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentOrders = useMemo(() => orders.filter(o => o.createTime >= thirtyDaysAgo), [orders, thirtyDaysAgo]);

  const tradeStats = useMemo(() => {
    const completed = recentOrders.filter((o) => o.orderStatus === 'COMPLETED');
    const cancelled = recentOrders.filter((o) => ['CANCELLED', 'CANCELLED_BY_SYSTEM'].includes(o.orderStatus));
    const appealed = recentOrders.filter((o) => o.orderStatus === 'APPEAL');
    const buyOrders = completed.filter((o) => o.tradeType === 'BUY');
    const sellOrders = completed.filter((o) => o.tradeType === 'SELL');

    const totalFiat = completed.reduce((s, o) => s + (Number(o.totalPrice) || 0), 0);
    const totalCrypto = completed.reduce((s, o) => s + (Number(o.amount) || 0), 0);
    const buyVolume = buyOrders.reduce((s, o) => s + (Number(o.totalPrice) || 0), 0);
    const sellVolume = sellOrders.reduce((s, o) => s + (Number(o.totalPrice) || 0), 0);
    const avgOrderSize = completed.length > 0 ? totalFiat / completed.length : 0;
    const completionRate = recentOrders.length > 0 ? (completed.length / recentOrders.length) * 100 : 0;

    return {
      total: recentOrders.length,
      completed: completed.length,
      cancelled: cancelled.length,
      appealed: appealed.length,
      buyCount: buyOrders.length,
      sellCount: sellOrders.length,
      totalFiat,
      totalCrypto,
      buyVolume,
      sellVolume,
      avgOrderSize,
      completionRate,
    };
  }, [recentOrders]);

  // ─── Daily trade chart data ───
  const dailyChart = useMemo(() => {
    const map: Record<string, { date: string; buy: number; sell: number }> = {};
    const completed = recentOrders.filter((o) => o.orderStatus === 'COMPLETED');
    completed.forEach((o) => {
      if (!o.createTime) return;
      const d = new Date(Number(o.createTime)).toISOString().slice(0, 10);
      if (!map[d]) map[d] = { date: d, buy: 0, sell: 0 };
      const vol = Number(o.totalPrice) || 0;
      if (o.tradeType === 'BUY') map[d].buy += vol;
      else map[d].sell += vol;
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [recentOrders]);

  // ─── Ad Stats ───
  const adStats = useMemo(() => {
    const byStatus = { online: 0, private: 0, offline: 0 };
    const byType = { buy: 0, sell: 0 };
    const payMethods: Record<string, number> = {};
    const assets: Record<string, number> = {};

    ads.forEach((ad) => {
      if (ad.advStatus === BINANCE_AD_STATUS.ONLINE) byStatus.online++;
      else if (ad.advStatus === BINANCE_AD_STATUS.PRIVATE) byStatus.private++;
      else byStatus.offline++;

      if (ad.tradeType === 'BUY') byType.buy++;
      else byType.sell++;

      const a = ad.asset || 'Unknown';
      assets[a] = (assets[a] || 0) + 1;

      (ad.tradeMethods || []).forEach((pm) => {
        const name = pm.tradeMethodName || pm.identifier || pm.payType;
        if (name) payMethods[name] = (payMethods[name] || 0) + 1;
      });
    });

    const statusPie = [
      { name: 'Online', value: byStatus.online, color: STATUS_COLORS[1] },
      { name: 'Private', value: byStatus.private, color: STATUS_COLORS[2] },
      { name: 'Offline', value: byStatus.offline, color: STATUS_COLORS[3] },
    ].filter((s) => s.value > 0);

    const payMethodBars = Object.entries(payMethods)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name: name.length > 15 ? name.slice(0, 13) + '…' : name, count }));

    return { byStatus, byType, assets, statusPie, payMethodBars, total: ads.length };
  }, [ads]);

  const isLoading = adsLoading || ordersLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Analytics</h1>
        <p className="text-xs text-muted-foreground">30-day trading & ad performance · {orders.length.toLocaleString()} total orders synced</p>
      </div>

      {/* ─── KPI Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={ShoppingCart}
          label="Completed Trades (30d)"
          value={String(tradeStats.completed)}
          sub={`Buy ${tradeStats.buyCount} | Sell ${tradeStats.sellCount}`}
        />
        <StatCard
          icon={Banknote}
          label="Total Volume (30d)"
          value={fmtINR(tradeStats.totalFiat)}
          sub={`${fmt(tradeStats.totalCrypto, 4)} crypto`}
        />
        <StatCard
          icon={ArrowUpDown}
          label="Avg Order Size"
          value={fmtINR(tradeStats.avgOrderSize)}
        />
        <StatCard
          icon={Shield}
          label="Completion Rate"
          value={`${tradeStats.completionRate.toFixed(1)}%`}
          sub={`${tradeStats.cancelled} cancelled · ${tradeStats.appealed} appealed`}
          trend={tradeStats.completionRate >= 95 ? 'up' : tradeStats.completionRate < 80 ? 'down' : 'neutral'}
        />
      </div>

      {/* ─── Charts Row ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 bg-card border-border">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" /> Daily Trade Volume (30d)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            {dailyChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dailyChart} barGap={2}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={(v) => v.slice(5)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={(v) => fmtINR(v)}
                    axisLine={false}
                    tickLine={false}
                    width={50}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      fontSize: '11px',
                    }}
                    formatter={(v: number, name: string) => [fmtINR(v), name === 'buy' ? 'Buy' : 'Sell']}
                    labelFormatter={(l) => `Date: ${l}`}
                  />
                  <Bar dataKey="buy" fill="hsl(142, 76%, 36%)" radius={[3, 3, 0, 0]} name="buy" />
                  <Bar dataKey="sell" fill="hsl(0, 72%, 51%)" radius={[3, 3, 0, 0]} name="sell" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[220px] text-xs text-muted-foreground">
                No completed trades in the last 30 days
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Buy vs Sell Volume</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3 flex flex-col items-center">
            <div className="grid grid-cols-2 gap-4 w-full mb-3">
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">Buy Volume</p>
                <p className="text-sm font-bold text-trade-buy tabular-nums">{fmtINR(tradeStats.buyVolume)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">Sell Volume</p>
                <p className="text-sm font-bold text-trade-sell tabular-nums">{fmtINR(tradeStats.sellVolume)}</p>
              </div>
            </div>
            {tradeStats.buyVolume + tradeStats.sellVolume > 0 && (
              <div className="w-full h-3 rounded-full overflow-hidden bg-secondary flex">
                <div
                  className="h-full bg-trade-buy transition-all"
                  style={{ width: `${(tradeStats.buyVolume / (tradeStats.buyVolume + tradeStats.sellVolume)) * 100}%` }}
                />
                <div className="h-full bg-trade-sell flex-1" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Ad Performance Section ─── */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
          <Megaphone className="h-4 w-4 text-primary" /> Ad Performance
          <Badge variant="outline" className="text-[9px] ml-1">{adStats.total} ads</Badge>
        </h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Megaphone} label="Total Ads" value={String(adStats.total)} sub={`Buy ${adStats.byType.buy} | Sell ${adStats.byType.sell}`} />
        <StatCard
          icon={TrendingUp}
          label="Online"
          value={String(adStats.byStatus.online)}
          trend={adStats.byStatus.online > 0 ? 'up' : 'neutral'}
        />
        <StatCard icon={Clock} label="Private" value={String(adStats.byStatus.private)} />
        <StatCard icon={TrendingDown} label="Offline" value={String(adStats.byStatus.offline)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Ad Status Distribution</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3 flex justify-center">
            {adStats.statusPie.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={adStats.statusPie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    strokeWidth={2}
                    stroke="hsl(var(--card))"
                  >
                    {adStats.statusPie.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '10px' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      fontSize: '11px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-xs text-muted-foreground">No ads found</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Payment Methods Across Ads</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            {adStats.payMethodBars.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={adStats.payMethodBars} layout="vertical" barSize={14}>
                  <XAxis
                    type="number"
                    tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    width={100}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      fontSize: '11px',
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-xs text-muted-foreground">No payment data</div>
            )}
          </CardContent>
        </Card>
      </div>

      {Object.keys(adStats.assets).length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Ads by Asset</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="flex flex-wrap gap-2">
              {Object.entries(adStats.assets)
                .sort((a, b) => b[1] - a[1])
                .map(([asset, count]) => (
                  <Badge key={asset} variant="secondary" className="text-[10px] gap-1">
                    {asset} <span className="font-bold">{count}</span>
                  </Badge>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
