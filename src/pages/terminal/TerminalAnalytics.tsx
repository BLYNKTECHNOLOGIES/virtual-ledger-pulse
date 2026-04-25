import { useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, TrendingUp, TrendingDown, BarChart3, ShoppingCart, Megaphone, Banknote, Clock, Shield, Activity, AlertTriangle, Target, Percent, Layers } from 'lucide-react';
import { useBinanceAdsList, BinanceAd } from '@/hooks/useBinanceAds';
import { useCachedOrderHistory } from '@/hooks/useBinanceOrderSync';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid, Legend } from 'recharts';
import { TerminalPermissionGate } from '@/components/terminal/TerminalPermissionGate';
import {
  TimePeriodFilter,
  TimeFilter,
  getTimestampsForFilter,
  getFilterLabel,
  serializeTimeFilter,
  deserializeTimeFilter,
} from '@/components/terminal/dashboard/TimePeriodFilter';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';
import { useTerminalUserPrefs } from '@/hooks/useTerminalUserPrefs';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

type OrderKind = 'smallBuy' | 'bigBuy' | 'smallSell' | 'bigSell';

type NormalizedOrder = {
  orderNumber: string;
  advNo: string;
  tradeType: 'BUY' | 'SELL' | string;
  orderStatus: string;
  asset: string;
  totalPrice: number;
  amount: number;
  unitPrice: number;
  effectiveUsdtQty: number;
  effectiveUsdtRate: number;
  createTime: number;
};

type EffectiveValuation = {
  effectiveUsdtQty: number;
  effectiveUsdtRate: number;
};

type Bucket = {
  key: string;
  label: string;
  sort: number;
  buyOrders: number;
  sellOrders: number;
  buyVolume: number;
  sellVolume: number;
};

type Aggregate = {
  key: string;
  label: string;
  description?: string;
  details?: string[];
  tradeType?: string;
  asset?: string;
  count: number;
  volume: number;
  quantity: number;
  avgOrder: number;
  avgRate: number;
  weightedRate: number;
  lastOrderTime?: number;
};

function fmt(n: number, decimals = 0) {
  if (!Number.isFinite(n)) return decimals > 0 ? '0.00' : '0';
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(2)}Cr`;
  if (n >= 100_000) return `${(n / 100_000).toFixed(1)}L`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString('en-IN', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}

function fmtINR(n: number, decimals = 0) {
  return `₹${fmt(n, decimals)}`;
}

function fmtRate(n: number) {
  return Number.isFinite(n) && n > 0 ? `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—';
}

function fmtRange(min?: number | string, max?: number | string) {
  const minValue = Number(min || 0);
  const maxValue = Number(max || 0);
  return minValue || maxValue ? `${fmtINR(minValue)}–${fmtINR(maxValue)}` : 'Limits not returned';
}

function getAdStatusText(status?: number) {
  if (status === 1) return 'Active';
  if (status === 2) return 'Private';
  if (status === 3) return 'Inactive';
  return 'Status not returned';
}

function getAdDetails(ad: any, fallback: NormalizedOrder[]) {
  const tradeType = ad?.tradeType || ad?.trade_type || fallback[0]?.tradeType || '—';
  const asset = ad?.asset || fallback[0]?.asset || 'USDT';
  const priceType = Number(ad?.priceType ?? ad?.price_type ?? 0) === 2 ? 'Floating' : Number(ad?.priceType ?? ad?.price_type ?? 0) === 1 ? 'Fixed' : 'Price type not returned';
  const methods = (ad?.tradeMethods || ad?.trade_methods || []).map((m: any) => m.tradeMethodName || m.identifier || m.payType).filter(Boolean).slice(0, 2).join(', ');

  return {
    description: `${tradeType} · ${asset} · ${getAdStatusText(Number(ad?.advStatus ?? ad?.adv_status))}`,
    details: [
      `${priceType} ${fmtRate(Number(ad?.price || 0))}`,
      fmtRange(ad?.minSingleTransAmount ?? ad?.min_single_trans_amount, ad?.maxSingleTransAmount ?? ad?.max_single_trans_amount),
      methods || 'Payment methods not returned',
    ],
  };
}

function weightedRate(volume: number, quantity: number) {
  return quantity > 0 ? volume / quantity : 0;
}

function average(values: number[]) {
  const valid = values.filter((v) => Number.isFinite(v) && v > 0);
  return valid.length ? valid.reduce((s, v) => s + v, 0) / valid.length : 0;
}

function getOrderRate(o: any) {
  const effectiveRate = Number(o.effectiveUsdtRate || o.effective_usdt_rate || 0);
  if (Number.isFinite(effectiveRate) && effectiveRate > 0) return effectiveRate;
  const unit = Number(o.unitPrice || o.unit_price || 0);
  if (Number.isFinite(unit) && unit > 0) return unit;
  const amount = Number(o.amount || 0);
  const total = Number(o.totalPrice || o.total_price || 0);
  return amount > 0 ? total / amount : 0;
}

function getEffectiveQuantity(o: any) {
  const effectiveQty = Number(o.effectiveUsdtQty || o.effective_usdt_qty || 0);
  if (Number.isFinite(effectiveQty) && effectiveQty > 0) return effectiveQty;
  return Number(o.amount || 0);
}

function normalizeOrder(o: any): NormalizedOrder {
  return {
    orderNumber: o.orderNumber || o.order_number || '',
    advNo: o.advNo || o.adv_no || '',
    tradeType: String(o.tradeType || o.trade_type || '').toUpperCase(),
    orderStatus: String(o.orderStatus || o.order_status || '').toUpperCase(),
    asset: o.asset || 'USDT',
    totalPrice: Number(o.totalPrice || o.total_price || 0),
    amount: Number(o.amount || 0),
    unitPrice: getOrderRate(o),
    effectiveUsdtQty: getEffectiveQuantity(o),
    effectiveUsdtRate: getOrderRate(o),
    createTime: Number(o.createTime || o.create_time || 0),
  };
}

function istDateParts(timestamp: number) {
  const d = new Date(timestamp + IST_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
  };
}

function classifyOrder(o: NormalizedOrder, smallBuyConfig?: RangeConfig | null, smallSalesConfig?: RangeConfig | null): OrderKind {
  if (o.tradeType === 'BUY') {
    const isSmall = smallBuyConfig?.is_enabled && o.totalPrice >= smallBuyConfig.min_amount && o.totalPrice <= smallBuyConfig.max_amount;
    return isSmall ? 'smallBuy' : 'bigBuy';
  }
  const isSmall = smallSalesConfig?.is_enabled && o.totalPrice >= smallSalesConfig.min_amount && o.totalPrice <= smallSalesConfig.max_amount;
  return isSmall ? 'smallSell' : 'bigSell';
}

function aggregateOrders(label: string, key: string, orders: NormalizedOrder[], extra: Partial<Aggregate> = {}): Aggregate {
  const volume = orders.reduce((s, o) => s + o.totalPrice, 0);
  const quantity = orders.reduce((s, o) => s + o.effectiveUsdtQty, 0);
  return {
    key,
    label,
    count: orders.length,
    volume,
    quantity,
    avgOrder: orders.length ? volume / orders.length : 0,
    avgRate: average(orders.map((o) => o.effectiveUsdtRate)),
    weightedRate: weightedRate(volume, quantity),
    lastOrderTime: orders.reduce((max, o) => Math.max(max, o.createTime || 0), 0) || undefined,
    ...extra,
  };
}

interface RangeConfig {
  is_enabled: boolean;
  min_amount: number;
  max_amount: number;
}

function useSmallOrderConfigs() {
  return useQuery({
    queryKey: ['terminal-analytics-small-order-configs'],
    queryFn: async () => {
      const [buyRes, sellRes] = await Promise.all([
        supabase.from('small_buys_config' as any).select('is_enabled, min_amount, max_amount').limit(1).maybeSingle(),
        supabase.from('small_sales_config' as any).select('is_enabled, min_amount, max_amount').limit(1).maybeSingle(),
      ]);
      return {
        smallBuy: buyRes.data ? {
          is_enabled: Boolean((buyRes.data as any).is_enabled),
          min_amount: Number((buyRes.data as any).min_amount || 0),
          max_amount: Number((buyRes.data as any).max_amount || 0),
        } : null,
        smallSale: sellRes.data ? {
          is_enabled: Boolean((sellRes.data as any).is_enabled),
          min_amount: Number((sellRes.data as any).min_amount || 0),
          max_amount: Number((sellRes.data as any).max_amount || 0),
        } : null,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

function useEffectiveOrderValuations(orderNumbers: string[]) {
  return useQuery({
    queryKey: ['terminal-analytics-effective-valuations', orderNumbers],
    queryFn: async () => {
      const uniqueOrderNumbers = Array.from(new Set(orderNumbers.filter(Boolean)));
      if (!uniqueOrderNumbers.length) return new Map<string, EffectiveValuation>();

      const [purchaseSyncRes, salesSyncRes] = await Promise.all([
        supabase
          .from('terminal_purchase_sync')
          .select('binance_order_number, purchase_orders!terminal_purchase_sync_purchase_order_id_fkey(effective_usdt_qty, effective_usdt_rate)')
          .in('binance_order_number', uniqueOrderNumbers),
        supabase
          .from('terminal_sales_sync')
          .select('binance_order_number, sales_orders!terminal_sales_sync_sales_order_id_fkey(effective_usdt_qty, effective_usdt_rate)')
          .in('binance_order_number', uniqueOrderNumbers),
      ]);

      if (purchaseSyncRes.error) throw purchaseSyncRes.error;
      if (salesSyncRes.error) throw salesSyncRes.error;

      const map = new Map<string, EffectiveValuation>();
      const addValuation = (orderNumber: string, row: any) => {
        const effectiveUsdtQty = Number(row?.effective_usdt_qty || 0);
        const effectiveUsdtRate = Number(row?.effective_usdt_rate || 0);
        if (orderNumber && effectiveUsdtQty > 0 && effectiveUsdtRate > 0) {
          map.set(orderNumber, { effectiveUsdtQty, effectiveUsdtRate });
        }
      };

      (purchaseSyncRes.data || []).forEach((row: any) => addValuation(row.binance_order_number, row.purchase_orders));
      (salesSyncRes.data || []).forEach((row: any) => addValuation(row.binance_order_number, row.sales_orders));

      return map;
    },
    enabled: orderNumbers.length > 0,
    staleTime: 30 * 1000,
  });
}

function StatCard({ icon: Icon, label, value, sub, tone = 'primary' }: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  tone?: 'primary' | 'buy' | 'sell' | 'warning' | 'muted';
}) {
  const toneClass = {
    primary: 'bg-primary/10 text-primary',
    buy: 'bg-trade-buy/10 text-trade-buy',
    sell: 'bg-trade-sell/10 text-trade-sell',
    warning: 'bg-destructive/10 text-destructive',
    muted: 'bg-secondary text-muted-foreground',
  }[tone];

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-3.5 flex items-start gap-3">
        <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${toneClass}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
          <p className="text-lg font-bold text-foreground tabular-nums leading-tight truncate">{value}</p>
          {sub && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function DataRow({ item, showType = false }: { item: Aggregate; showType?: boolean }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-center py-3 border-b border-border last:border-0 text-xs">
      <div className="min-w-0">
        <p className="font-medium text-foreground truncate">{item.label}</p>
        {showType && <p className="text-[10px] text-muted-foreground truncate">{item.description || `${item.tradeType || '—'} · ${item.asset || 'USDT'}`}</p>}
        {showType && item.details?.length ? <p className="text-[10px] text-muted-foreground truncate">{item.details.join(' · ')}</p> : null}
      </div>
      <div><p className="text-muted-foreground text-[10px]">Orders</p><p className="font-semibold tabular-nums">{item.count}</p></div>
      <div><p className="text-muted-foreground text-[10px]">Volume</p><p className="font-semibold tabular-nums">{fmtINR(item.volume)}</p></div>
      <div><p className="text-muted-foreground text-[10px]">Quantity</p><p className="font-semibold tabular-nums">{fmt(item.quantity, 4)}</p></div>
      <div><p className="text-muted-foreground text-[10px]">Avg rate</p><p className="font-semibold tabular-nums">{fmtRate(item.weightedRate || item.avgRate)}</p></div>
      <div><p className="text-muted-foreground text-[10px]">Avg order</p><p className="font-semibold tabular-nums">{fmtINR(item.avgOrder)}</p></div>
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">{text}</div>;
}

export default function TerminalAnalytics() {
  const { data: adsRaw, isLoading: adsLoading } = useBinanceAdsList({ advStatus: null });
  const { data: cachedOrders = [], isLoading: ordersLoading } = useCachedOrderHistory();
  const { data: configs, isLoading: configLoading } = useSmallOrderConfigs();
  const { userId } = useTerminalAuth();
  const [prefs, setPref] = useTerminalUserPrefs(userId, 'analytics', { filter: '' as string });

  const filter: TimeFilter = useMemo(() => deserializeTimeFilter(prefs.filter || undefined), [prefs.filter]);
  const setFilter = useCallback((f: TimeFilter) => setPref('filter', serializeTimeFilter(f)), [setPref]);

  const ads: BinanceAd[] = useMemo(() => {
    const list = (adsRaw as any)?.data || (adsRaw as any)?.list || adsRaw;
    return Array.isArray(list) ? list : [];
  }, [adsRaw]);

  const orderNumbers = useMemo(() => (
    Array.isArray(cachedOrders) ? cachedOrders.map((order: any) => order.orderNumber || order.order_number || '').filter(Boolean) : []
  ), [cachedOrders]);
  const { data: effectiveValuations = new Map<string, EffectiveValuation>(), isLoading: valuationsLoading } = useEffectiveOrderValuations(orderNumbers);

  const orders = useMemo(() => {
    const { startTimestamp, endTimestamp } = getTimestampsForFilter(filter);
    return (Array.isArray(cachedOrders) ? cachedOrders : [])
      .map((order: any) => {
        const orderNumber = order.orderNumber || order.order_number || '';
        return normalizeOrder({ ...order, ...(effectiveValuations.get(orderNumber) || {}) });
      })
      .filter((o) => o.createTime >= startTimestamp && o.createTime <= endTimestamp);
  }, [cachedOrders, filter, effectiveValuations]);

  const completed = useMemo(() => orders.filter((o) => o.orderStatus.includes('COMPLETED')), [orders]);

  const analytics = useMemo(() => {
    const buy = completed.filter((o) => o.tradeType === 'BUY');
    const sell = completed.filter((o) => o.tradeType === 'SELL');
    const cancelled = orders.filter((o) => o.orderStatus.includes('CANCELLED'));
    const appeals = orders.filter((o) => o.orderStatus.includes('APPEAL') || o.orderStatus.includes('COMPLAINT'));
    const buyVolume = buy.reduce((s, o) => s + o.totalPrice, 0);
    const sellVolume = sell.reduce((s, o) => s + o.totalPrice, 0);
    const totalVolume = buyVolume + sellVolume;
    const totalQty = completed.reduce((s, o) => s + o.effectiveUsdtQty, 0);

    const kinds: Record<OrderKind, NormalizedOrder[]> = { smallBuy: [], bigBuy: [], smallSell: [], bigSell: [] };
    for (const o of completed) kinds[classifyOrder(o, configs?.smallBuy, configs?.smallSale)].push(o);

    const orderTypes = [
      aggregateOrders('Small Buy', 'smallBuy', kinds.smallBuy, { tradeType: 'BUY' }),
      aggregateOrders('Big Buy', 'bigBuy', kinds.bigBuy, { tradeType: 'BUY' }),
      aggregateOrders('Small Sale', 'smallSell', kinds.smallSell, { tradeType: 'SELL' }),
      aggregateOrders('Big Sale', 'bigSell', kinds.bigSell, { tradeType: 'SELL' }),
    ];

    const byAd = new Map<string, NormalizedOrder[]>();
    for (const o of completed) {
      const key = o.advNo || 'Not returned by Binance';
      byAd.set(key, [...(byAd.get(key) || []), o]);
    }
    const adLookup = new Map(ads.map((ad: any) => [String(ad.advNo || ad.adv_no || ''), ad]));
    const adRows = Array.from(byAd.entries()).map(([advNo, rows]) => {
      const ad = adLookup.get(advNo) as any;
      return aggregateOrders(advNo, advNo, rows, {
        tradeType: rows[0]?.tradeType || ad?.tradeType,
        asset: rows[0]?.asset || ad?.asset,
      });
    }).sort((a, b) => b.volume - a.volume);

    const rates = completed.map((o) => o.unitPrice).filter((v) => Number.isFinite(v) && v > 0);
    const weightedBuyRate = weightedRate(buyVolume, buy.reduce((s, o) => s + o.effectiveUsdtQty, 0));
    const weightedSellRate = weightedRate(sellVolume, sell.reduce((s, o) => s + o.effectiveUsdtQty, 0));

    const bestAd = adRows[0];
    const highestSellAd = adRows.filter((a) => a.tradeType === 'SELL').sort((a, b) => b.weightedRate - a.weightedRate)[0];
    const imbalance = totalVolume > 0 ? Math.abs(buyVolume - sellVolume) / totalVolume * 100 : 0;

    return {
      buy,
      sell,
      cancelled,
      appeals,
      buyVolume,
      sellVolume,
      totalVolume,
      totalQty,
      avgOrder: completed.length ? totalVolume / completed.length : 0,
      weightedAvgRate: weightedRate(totalVolume, totalQty),
      avgBuyRate: average(buy.map((o) => o.effectiveUsdtRate)),
      avgSellRate: average(sell.map((o) => o.effectiveUsdtRate)),
      weightedBuyRate,
      weightedSellRate,
      minRate: rates.length ? Math.min(...rates) : 0,
      maxRate: rates.length ? Math.max(...rates) : 0,
      completionRate: orders.length ? completed.length / orders.length * 100 : 0,
      orderTypes,
      adRows,
      bestAd,
      highestSellAd,
      imbalance,
    };
  }, [orders, completed, configs, ads]);

  const chartData = useMemo(() => {
    const isHourly = filter.mode === '1d';
    const map = new Map<string, Bucket>();
    for (const o of completed) {
      const p = istDateParts(o.createTime);
      const dateKey = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
      const key = isHourly ? `${dateKey}-${String(p.hour).padStart(2, '0')}` : dateKey;
      const label = isHourly ? `${String(p.hour).padStart(2, '0')}:00` : `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}`;
      const sort = isHourly ? Date.UTC(p.year, p.month - 1, p.day, p.hour) : Date.UTC(p.year, p.month - 1, p.day);
      const entry = map.get(key) || { key, label, sort, buyOrders: 0, sellOrders: 0, buyVolume: 0, sellVolume: 0 };
      if (o.tradeType === 'BUY') {
        entry.buyOrders += 1;
        entry.buyVolume += o.totalPrice;
      } else {
        entry.sellOrders += 1;
        entry.sellVolume += o.totalPrice;
      }
      map.set(key, entry);
    }
    return Array.from(map.values()).sort((a, b) => a.sort - b.sort);
  }, [completed, filter.mode]);

  const peakBucket = useMemo(() => chartData.slice().sort((a, b) => (b.buyOrders + b.sellOrders) - (a.buyOrders + a.sellOrders))[0], [chartData]);
  const periodLabel = getFilterLabel(filter);
  const isLoading = adsLoading || ordersLoading || configLoading || valuationsLoading;

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <TerminalPermissionGate permissions={['terminal_analytics_view']}>
      <div className="flex min-h-[calc(100vh-3rem)] w-full flex-col gap-4 p-4 md:p-6">
        <div className="flex shrink-0 items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Analytics</h1>
            <p className="text-xs text-muted-foreground">{periodLabel} · {orders.length.toLocaleString('en-IN')} orders in view · {completed.length.toLocaleString('en-IN')} completed</p>
          </div>
          <TimePeriodFilter value={filter} onChange={setFilter} />
        </div>

        <div className="grid shrink-0 grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          <StatCard icon={ShoppingCart} label="Completed" value={String(completed.length)} sub={`Buy ${analytics.buy.length} · Sell ${analytics.sell.length}`} />
          <StatCard icon={TrendingDown} label="Buy Volume" value={fmtINR(analytics.buyVolume)} sub={fmtRate(analytics.weightedBuyRate)} tone="buy" />
          <StatCard icon={TrendingUp} label="Sell Volume" value={fmtINR(analytics.sellVolume)} sub={fmtRate(analytics.weightedSellRate)} tone="sell" />
          <StatCard icon={Percent} label="Avg Rate" value={fmtRate(analytics.weightedAvgRate)} sub={`Min ${fmtRate(analytics.minRate)} · Max ${fmtRate(analytics.maxRate)}`} />
          <StatCard icon={Shield} label="Completion" value={`${analytics.completionRate.toFixed(1)}%`} sub={`${analytics.appeals.length} appeals · ${analytics.cancelled.length} cancelled`} tone={analytics.appeals.length ? 'warning' : 'muted'} />
        </div>

        <div className="grid shrink-0 grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] gap-4">
          <Card className="bg-card border-border flex min-h-[320px] flex-col">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" /> {filter.mode === '1d' ? 'Hourly' : 'Daily'} Order Activity</CardTitle>
            </CardHeader>
            <CardContent className="min-h-[260px] flex-1 px-2 pb-3">
              {chartData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="orders" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={35} />
                    <YAxis yAxisId="volume" orientation="right" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => fmtINR(Number(v))} axisLine={false} tickLine={false} width={50} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '11px' }} formatter={(v: number, name: string) => name.includes('Volume') ? [fmtINR(v), name] : [v, name]} />
                    <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: '10px' }} />
                    <Area yAxisId="volume" type="monotone" dataKey="buyVolume" name="Buy Volume" stroke="hsl(var(--trade-buy))" fill="hsl(var(--trade-buy) / 0.14)" strokeWidth={2} dot={false} />
                    <Area yAxisId="volume" type="monotone" dataKey="sellVolume" name="Sell Volume" stroke="hsl(var(--trade-sell))" fill="hsl(var(--trade-sell) / 0.12)" strokeWidth={2} dot={false} />
                    <Bar yAxisId="orders" dataKey="buyOrders" name="Buy Orders" fill="hsl(var(--primary) / 0.45)" radius={[3, 3, 0, 0]} />
                    <Bar yAxisId="orders" dataKey="sellOrders" name="Sell Orders" fill="hsl(var(--muted-foreground) / 0.45)" radius={[3, 3, 0, 0]} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <EmptyPanel text="No completed Binance orders in selected period" />}
            </CardContent>
          </Card>

          <Card className="bg-card border-border flex flex-col">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Target className="h-3.5 w-3.5" /> Key Insights</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4">
              <div className="rounded-md bg-secondary/60 p-3"><p className="text-[10px] text-muted-foreground">Top ad by volume</p><p className="text-sm font-semibold text-foreground">{analytics.bestAd?.label || '—'}</p><p className="text-[11px] text-muted-foreground">{analytics.bestAd ? `${fmtINR(analytics.bestAd.volume)} · ${analytics.bestAd.count} orders` : 'No ad activity'}</p></div>
              <div className="rounded-md bg-secondary/60 p-3"><p className="text-[10px] text-muted-foreground">Peak trading time</p><p className="text-sm font-semibold text-foreground">{peakBucket?.label || '—'}</p><p className="text-[11px] text-muted-foreground">{peakBucket ? `${peakBucket.buyOrders + peakBucket.sellOrders} completed orders` : 'No completed orders'}</p></div>
              <div className="rounded-md bg-secondary/60 p-3"><p className="text-[10px] text-muted-foreground">Buy / sell imbalance</p><p className="text-sm font-semibold text-foreground">{analytics.imbalance.toFixed(1)}%</p><p className="text-[11px] text-muted-foreground">Based on completed INR volume</p></div>
              {analytics.appeals.length > 0 && <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3"><p className="text-[10px] text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Appeal drag</p><p className="text-sm font-semibold text-foreground">{analytics.appeals.length} order(s)</p></div>}
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="overview" className="flex min-h-0 w-full flex-1 flex-col">
          <TabsList className="h-auto shrink-0 flex flex-wrap justify-start">
            <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
            <TabsTrigger value="types" className="text-xs">Order Types</TabsTrigger>
            <TabsTrigger value="ads" className="text-xs">Ad Performance</TabsTrigger>
            <TabsTrigger value="rates" className="text-xs">Rates</TabsTrigger>
            <TabsTrigger value="risk" className="text-xs">Status / Risk</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="min-h-0 flex-1">
            <div className="grid h-full grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="bg-card border-border"><CardHeader><CardTitle className="text-sm">Volume Mix</CardTitle></CardHeader><CardContent className="space-y-3"><div className="h-3 rounded-full overflow-hidden bg-secondary flex"><div className="bg-trade-buy" style={{ width: `${analytics.totalVolume ? analytics.buyVolume / analytics.totalVolume * 100 : 0}%` }} /><div className="bg-trade-sell flex-1" /></div><div className="grid grid-cols-2 gap-3 text-xs"><div><p className="text-muted-foreground">Buy</p><p className="font-semibold text-trade-buy">{fmtINR(analytics.buyVolume)}</p></div><div><p className="text-muted-foreground">Sell</p><p className="font-semibold text-trade-sell">{fmtINR(analytics.sellVolume)}</p></div></div></CardContent></Card>
              <Card className="bg-card border-border"><CardHeader><CardTitle className="text-sm">Order Quality</CardTitle></CardHeader><CardContent className="grid grid-cols-3 gap-3 text-xs"><div><p className="text-muted-foreground">Completed</p><p className="font-semibold">{completed.length}</p></div><div><p className="text-muted-foreground">Cancelled</p><p className="font-semibold">{analytics.cancelled.length}</p></div><div><p className="text-muted-foreground">Appeals</p><p className="font-semibold">{analytics.appeals.length}</p></div></CardContent></Card>
            </div>
          </TabsContent>

          <TabsContent value="types" className="min-h-0 flex-1 overflow-auto">
            <Card className="bg-card border-border min-h-full"><CardHeader><CardTitle className="text-sm flex items-center gap-2"><Layers className="h-4 w-4 text-primary" /> Small / Big Order Types</CardTitle></CardHeader><CardContent>{analytics.orderTypes.some((i) => i.count) ? analytics.orderTypes.map((item) => <DataRow key={item.key} item={item} />) : <EmptyPanel text="No completed order type data in selected period" />}</CardContent></Card>
          </TabsContent>

          <TabsContent value="ads" className="min-h-0 flex-1 overflow-auto">
            <Card className="bg-card border-border min-h-full"><CardHeader><CardTitle className="text-sm flex items-center gap-2"><Megaphone className="h-4 w-4 text-primary" /> Buy / Sell Volume by Ad</CardTitle></CardHeader><CardContent>{analytics.adRows.length ? analytics.adRows.map((item) => <DataRow key={item.key} item={item} showType />) : <EmptyPanel text="No ad-linked completed orders in selected period" />}</CardContent></Card>
          </TabsContent>

          <TabsContent value="rates" className="min-h-0 flex-1">
            <div className="grid h-full grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="bg-card border-border"><CardHeader><CardTitle className="text-sm">Rate Summary</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3 text-xs"><StatCard icon={TrendingDown} label="Weighted Buy" value={fmtRate(analytics.weightedBuyRate)} tone="buy" /><StatCard icon={TrendingUp} label="Weighted Sell" value={fmtRate(analytics.weightedSellRate)} tone="sell" /><StatCard icon={Banknote} label="Avg Buy" value={fmtRate(analytics.avgBuyRate)} /><StatCard icon={Banknote} label="Avg Sell" value={fmtRate(analytics.avgSellRate)} /></CardContent></Card>
              <Card className="bg-card border-border"><CardHeader><CardTitle className="text-sm">Rate by Type</CardTitle></CardHeader><CardContent>{analytics.orderTypes.map((item) => <div key={item.key} className="flex items-center justify-between py-2 border-b border-border last:border-0 text-xs"><span className="text-muted-foreground">{item.label}</span><span className="font-semibold tabular-nums">{fmtRate(item.weightedRate || item.avgRate)}</span></div>)}</CardContent></Card>
            </div>
          </TabsContent>

          <TabsContent value="risk" className="min-h-0 flex-1">
            <Card className="bg-card border-border min-h-full"><CardHeader><CardTitle className="text-sm">Status / Risk Snapshot</CardTitle></CardHeader><CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3"><StatCard icon={Shield} label="Completion" value={`${analytics.completionRate.toFixed(1)}%`} /><StatCard icon={AlertTriangle} label="Appeals" value={String(analytics.appeals.length)} tone="warning" /><StatCard icon={Clock} label="Cancelled" value={String(analytics.cancelled.length)} tone="muted" /><StatCard icon={BarChart3} label="Avg Order" value={fmtINR(analytics.avgOrder)} /></CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>
    </TerminalPermissionGate>
  );
}
