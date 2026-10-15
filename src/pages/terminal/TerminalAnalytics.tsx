import { useMemo, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, TrendingUp, TrendingDown, BarChart3, ShoppingCart, Megaphone, Activity, AlertTriangle, Percent, Layers, Database, CloudDownload, RefreshCw, Copy, Coins, Gauge, Clock, Trophy, Scale, Map as MapIcon, Receipt } from 'lucide-react';
import { useBinanceAdsList, BinanceAd } from '@/hooks/useBinanceAds';
import { useAdZoneMap, useAdZoneSnapshots } from '@/hooks/useAdZoneMap';
import { useCachedOrderHistory, useSyncMetadata, useSyncOrderHistory } from '@/hooks/useBinanceOrderSync';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid } from 'recharts';
import { TerminalPermissionGate } from '@/components/terminal/TerminalPermissionGate';
import {
  TimePeriodFilter,
  TimeFilter,
  getTimestampsForFilter,
  makeShiftPredicate,

  getFilterLabel,
  serializeTimeFilter,
  deserializeTimeFilter,
} from '@/components/terminal/dashboard/TimePeriodFilter';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';
import { useTerminalUserPrefs } from '@/hooks/useTerminalUserPrefs';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { mapWithConcurrency } from '@/lib/mapWithConcurrency';
import { listFingerprint } from '@/lib/listFingerprint';
import {
  CAPTION,
  EmptyState,
  Legend,
  Panel,
  SegmentedToggle,
  type SegmentOption,
  ShareBar,
  SplitBar,
  StatTile,
  Swatch,
  TooltipCard,
  TooltipRow,
} from '@/components/terminal/analytics/AnalyticsUi';
import { PendingContext } from '@/components/terminal/analytics/pendingContext';

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

// Order outcomes, the same rules as the Dashboard: completed (or released), and finished
// without completing (cancelled by either side or by Binance, expired or timed out).
const isCompletedStatus = (status: string) => status.includes('COMPLETED') || status.includes('RELEASED');
const isCancelledStatus = (status: string) => status.includes('CANCEL') || status.includes('EXPIRED') || status.includes('TIMEOUT');
const isAppealStatus = (status: string) => status.includes('APPEAL') || status.includes('COMPLAINT');
// Order numbers per terminal_order_valuation_rows() call, and calls in flight at once.
// A call costs ~0.3 ms per matched order under row-level security, far below the 8 s limit.
const VALUATION_RPC_CHUNK_SIZE = 1000;
const VALUATION_RPC_CONCURRENCY = 4;

type OrderKind = 'smallBuy' | 'bigBuy' | 'smallSell' | 'bigSell';
type AdTradeFilter = 'BUY' | 'SELL';

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
  hasEffectiveUsdtValuation: boolean;
  createTime: number;
};

type EffectiveValuation = {
  effectiveUsdtQty: number;
  effectiveUsdtRate: number;
};

type SmallOrderMapRow = {
  binance_order_number: string;
  order_data?: any;
  small_buys_sync_id?: string;
  small_sales_sync_id?: string;
};

type Bucket = {
  key: string;
  label: string;
  sort: number;
  buyOrders: number;
  sellOrders: number;
  buyVolume: number;
  sellVolume: number;
  smallBuyOrders: number;
  bigBuyOrders: number;
  smallSellOrders: number;
  bigSellOrders: number;
  smallBuyVolume: number;
  bigBuyVolume: number;
  smallSellVolume: number;
  bigSellVolume: number;
};

type Aggregate = {
  key: string;
  label: string;
  description?: string;
  details?: string[];
  orderKind?: OrderKind;
  orderKindLabel?: string;
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

function isUsdtAsset(asset?: string) {
  return String(asset || 'USDT').toUpperCase() === 'USDT';
}

function isUsdStableAsset(asset?: string) {
  return ['USDT', 'USDC', 'FDUSD'].includes(String(asset || 'USDT').toUpperCase());
}

function getEffectiveUsdtQuantity(o: any) {
  const effectiveQty = Number(o.effectiveUsdtQty || o.effective_usdt_qty || 0);
  if (Number.isFinite(effectiveQty) && effectiveQty > 0) return effectiveQty;
  return isUsdStableAsset(o.asset) ? Number(o.amount || 0) : 0;
}

function getEffectiveUsdtRate(o: any) {
  const effectiveRate = Number(o.effectiveUsdtRate || o.effective_usdt_rate || 0);
  if (Number.isFinite(effectiveRate) && effectiveRate > 0) return effectiveRate;
  const effectiveQty = getEffectiveUsdtQuantity(o);
  const total = Number(o.totalPrice || o.total_price || 0);
  if (effectiveQty > 0 && total > 0) return total / effectiveQty;
  return 0;
}

function getRawOrderRate(o: any) {
  const unit = Number(o.unitPrice || o.unit_price || 0);
  if (Number.isFinite(unit) && unit > 0) return unit;
  const amount = Number(o.amount || 0);
  const total = Number(o.totalPrice || o.total_price || 0);
  return amount > 0 ? total / amount : 0;
}

function hasEffectiveUsdtValuation(o: any) {
  return getEffectiveUsdtQuantity(o) > 0 && getEffectiveUsdtRate(o) > 0;
}

function getOrderDataNumber(orderData: any, camelKey: string, snakeKey: string) {
  return Number(orderData?.[camelKey] ?? orderData?.[snakeKey] ?? 0);
}

type SmallBatchRow = {
  id: string;
  total_quantity?: number | string | null;
  purchase_order_id?: string | null;
  sales_order_id?: string | null;
};

/**
 * The rows the valuation rules below read, as terminal_order_valuation_rows()
 * returns them: the same rows as reading terminal_purchase_sync / terminal_sales_sync
 * (with their ERP order embedded), the small-order maps, their batches and the
 * batches' ERP orders, under the caller's row-level security.
 */
type ValuationRowSet = {
  purchase_sync: unknown[];
  sales_sync: unknown[];
  small_buy_map: SmallOrderMapRow[];
  small_sale_map: SmallOrderMapRow[];
  small_buy_sync: SmallBatchRow[];
  small_sale_sync: SmallBatchRow[];
  small_buy_orders: unknown[];
  small_sale_orders: unknown[];
};

const VALUATION_ROW_KEYS: (keyof ValuationRowSet)[] = [
  'purchase_sync', 'sales_sync', 'small_buy_map', 'small_sale_map',
  'small_buy_sync', 'small_sale_sync', 'small_buy_orders', 'small_sale_orders',
];

type ValuationRowsRpc = (
  fn: 'terminal_order_valuation_rows',
  args: { p_order_numbers: string[] },
) => PromiseLike<{ data: unknown; error: unknown }>;

async function fetchValuationRows(orderNumbers: string[]): Promise<ValuationRowSet> {
  const rpc = supabase.rpc.bind(supabase) as unknown as ValuationRowsRpc;
  for (let attempt = 1; ; attempt++) {
    const { data, error } = await rpc('terminal_order_valuation_rows', { p_order_numbers: orderNumbers });
    if (!error) {
      const rows = (data || {}) as Partial<ValuationRowSet>;
      return Object.fromEntries(VALUATION_ROW_KEYS.map((key) => [key, rows[key] || []])) as ValuationRowSet;
    }
    // One retry per call, so a single slow or dropped call doesn't blank every rate in the period.
    if (attempt >= 2) throw error;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

function getSmallOrderValuation(orderData: any, syncRow: any, erpOrder: any): EffectiveValuation | null {
  const orderAmount = getOrderDataNumber(orderData, 'amount', 'amount');
  const orderTotal = getOrderDataNumber(orderData, 'totalPrice', 'total_price');
  const marketRate = Number(erpOrder?.market_rate_usdt || 0);
  const batchEffectiveQty = Number(erpOrder?.effective_usdt_qty || 0);
  const batchRawQty = Number(syncRow?.total_quantity || erpOrder?.quantity || 0);
  const effectiveUsdtQty = marketRate > 0 && orderAmount > 0
    ? orderAmount * marketRate
    : batchEffectiveQty > 0 && batchRawQty > 0 && orderAmount > 0
      ? (orderAmount / batchRawQty) * batchEffectiveQty
      : 0;
  const effectiveUsdtRate = effectiveUsdtQty > 0 && orderTotal > 0
    ? orderTotal / effectiveUsdtQty
    : Number(erpOrder?.effective_usdt_rate || 0);

  return effectiveUsdtQty > 0 && effectiveUsdtRate > 0 ? { effectiveUsdtQty, effectiveUsdtRate } : null;
}

function normalizeOrder(o: any): NormalizedOrder {
  const effectiveUsdtQty = getEffectiveUsdtQuantity(o);
  const effectiveUsdtRate = getEffectiveUsdtRate(o);
  return {
    orderNumber: o.orderNumber || o.order_number || '',
    advNo: o.advNo || o.adv_no || '',
    tradeType: String(o.tradeType || o.trade_type || '').toUpperCase(),
    orderStatus: String(o.orderStatus || o.order_status || '').toUpperCase(),
    asset: o.asset || 'USDT',
    totalPrice: Number(o.totalPrice || o.total_price || 0),
    amount: Number(o.amount || 0),
    unitPrice: getRawOrderRate(o),
    effectiveUsdtQty,
    effectiveUsdtRate,
    hasEffectiveUsdtValuation: effectiveUsdtQty > 0 && effectiveUsdtRate > 0,
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

const orderKindLabels: Record<OrderKind, string> = {
  smallBuy: 'Small Buy',
  bigBuy: 'Big Buy',
  smallSell: 'Small Sale',
  bigSell: 'Big Sale',
};

const assetSortOrder = ['USDT', 'BTC', 'ETH', 'USDC', 'FDUSD', 'BNB', 'TRX'];

function sortAdRowsByType(a: Aggregate, b: Aggregate) {
  const kindOrder: Record<OrderKind, number> = { smallBuy: 0, bigBuy: 1, smallSell: 0, bigSell: 1 };
  const aKind = a.orderKind ? kindOrder[a.orderKind] : 99;
  const bKind = b.orderKind ? kindOrder[b.orderKind] : 99;
  if (aKind !== bKind) return aKind - bKind;

  const aAsset = String(a.asset || 'USDT').toUpperCase();
  const bAsset = String(b.asset || 'USDT').toUpperCase();
  const aAssetIndex = assetSortOrder.includes(aAsset) ? assetSortOrder.indexOf(aAsset) : assetSortOrder.length;
  const bAssetIndex = assetSortOrder.includes(bAsset) ? assetSortOrder.indexOf(bAsset) : assetSortOrder.length;
  if (aAssetIndex !== bAssetIndex) return aAssetIndex - bAssetIndex;
  if (aAsset !== bAsset) return aAsset.localeCompare(bAsset);

  return a.label.localeCompare(b.label, 'en-IN', { numeric: true });
}

function dominantOrderKind(orders: NormalizedOrder[], smallBuyConfig?: RangeConfig | null, smallSalesConfig?: RangeConfig | null) {
  const counts = orders.reduce((acc, order) => {
    const kind = classifyOrder(order, smallBuyConfig, smallSalesConfig);
    acc[kind] = (acc[kind] || 0) + 1;
    return acc;
  }, {} as Record<OrderKind, number>);

  return (Object.entries(counts) as [OrderKind, number][]).sort((a, b) => b[1] - a[1])[0]?.[0];
}

function aggregateOrders(label: string, key: string, orders: NormalizedOrder[], extra: Partial<Aggregate> = {}): Aggregate {
  const volume = orders.reduce((s, o) => s + o.totalPrice, 0);
  const valuedOrders = orders.filter((o) => o.hasEffectiveUsdtValuation);
  const valuedVolume = valuedOrders.reduce((s, o) => s + o.totalPrice, 0);
  const quantity = valuedOrders.reduce((s, o) => s + o.effectiveUsdtQty, 0);
  return {
    key,
    label,
    count: orders.length,
    volume,
    quantity,
    avgOrder: orders.length ? volume / orders.length : 0,
    avgRate: average(valuedOrders.map((o) => o.effectiveUsdtRate)),
    weightedRate: weightedRate(valuedVolume, quantity),
    lastOrderTime: orders.reduce((max, o) => Math.max(max, o.createTime || 0), 0) || undefined,
    ...extra,
  };
}

function aggregateCoinOrders(coin: string, key: string, orders: NormalizedOrder[], extra: Partial<Aggregate> = {}): Aggregate {
  const base = aggregateOrders(coin, key, orders, extra);
  if (base.quantity > 0 && (base.weightedRate > 0 || base.avgRate > 0)) return base;

  const rawQuantity = orders.reduce((s, o) => s + (Number.isFinite(o.amount) && o.amount > 0 ? o.amount : 0), 0);
  const rawRates = orders.map((o) => o.unitPrice).filter((v) => Number.isFinite(v) && v > 0);

  return {
    ...base,
    quantity: rawQuantity,
    avgRate: average(rawRates),
    weightedRate: weightedRate(base.volume, rawQuantity),
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
  // A year holds ~70,000 order numbers; key the cache on a short fingerprint of the list instead.
  const orderListKey = useMemo(() => listFingerprint(orderNumbers), [orderNumbers]);
  return useQuery({
    queryKey: ['terminal-analytics-effective-valuations', orderListKey],
    queryFn: async () => {
      const uniqueOrderNumbers = Array.from(new Set(orderNumbers.filter(Boolean)));
      if (!uniqueOrderNumbers.length) return new Map<string, EffectiveValuation>();

      // One call per 1,000 order numbers, a few at a time, instead of four table
      // reads per 150 numbers one after another. Same rows, same rules below.
      const chunks: string[][] = [];
      for (let i = 0; i < uniqueOrderNumbers.length; i += VALUATION_RPC_CHUNK_SIZE) {
        chunks.push(uniqueOrderNumbers.slice(i, i + VALUATION_RPC_CHUNK_SIZE));
      }
      const parts = await mapWithConcurrency(chunks, VALUATION_RPC_CONCURRENCY, fetchValuationRows);
      const rowsOf = <K extends keyof ValuationRowSet>(key: K) => parts.flatMap((part) => part[key]) as ValuationRowSet[K];
      const purchaseSyncRows = rowsOf('purchase_sync');
      const salesSyncRows = rowsOf('sales_sync');
      const smallBuyMapRows = rowsOf('small_buy_map');
      const smallSaleMapRows = rowsOf('small_sale_map');
      // Batches and their ERP orders repeat across calls; the maps below keep one per id.
      const smallBuySyncRows = rowsOf('small_buy_sync');
      const smallSaleSyncRows = rowsOf('small_sale_sync');
      const smallBuyOrderRows = rowsOf('small_buy_orders');
      const smallSaleOrderRows = rowsOf('small_sale_orders');

      const map = new Map<string, EffectiveValuation>();
      const addValuation = (orderNumber: string, row: any) => {
        const valuationRow = Array.isArray(row) ? row[0] : row;
        const effectiveUsdtQty = Number(valuationRow?.effective_usdt_qty || 0);
        const effectiveUsdtRate = Number(valuationRow?.effective_usdt_rate || 0);
        if (orderNumber && effectiveUsdtQty > 0 && effectiveUsdtRate > 0) {
          map.set(orderNumber, { effectiveUsdtQty, effectiveUsdtRate });
        }
      };

      purchaseSyncRows.forEach((row: any) => addValuation(row.binance_order_number, row.purchase_orders));
      salesSyncRows.forEach((row: any) => addValuation(row.binance_order_number, row.sales_orders));

      const smallBuySyncById = new Map(smallBuySyncRows.map((row) => [row.id, row]));
      const smallSaleSyncById = new Map(smallSaleSyncRows.map((row) => [row.id, row]));
      const purchaseOrderById = new Map((smallBuyOrderRows as any[]).map((row) => [row.id, row]));
      const salesOrderById = new Map((smallSaleOrderRows as any[]).map((row) => [row.id, row]));

      smallBuyMapRows.forEach((row) => {
        const syncRow = smallBuySyncById.get(row.small_buys_sync_id || '');
        const valuation = getSmallOrderValuation(row.order_data, syncRow, purchaseOrderById.get(syncRow?.purchase_order_id));
        if (valuation) map.set(row.binance_order_number, valuation);
      });

      smallSaleMapRows.forEach((row) => {
        const syncRow = smallSaleSyncById.get(row.small_sales_sync_id || '');
        const valuation = getSmallOrderValuation(row.order_data, syncRow, salesOrderById.get(syncRow?.sales_order_id));
        if (valuation) map.set(row.binance_order_number, valuation);
      });

      return map;
    },
    enabled: orderNumbers.length > 0,
    staleTime: 30 * 1000,
  });
}

// ─── Presentation (TA-1) — display only; every figure comes from the memos below ───

const KIND_ORDER: OrderKind[] = ['smallBuy', 'bigBuy', 'smallSell', 'bigSell'];

/** Series colours for the four order types (validated for colour-blind separation in both themes). */
const KIND_COLOR: Record<OrderKind, string> = {
  smallBuy: 'hsl(var(--trade-buy))',
  bigBuy: 'hsl(var(--primary))',
  smallSell: 'hsl(var(--chart-3))',
  bigSell: 'hsl(var(--trade-sell))',
};

const BUY_COLOR = 'hsl(var(--trade-buy))';
const SELL_COLOR = 'hsl(var(--trade-sell))';
const AXIS_TICK = { fontSize: 10, fill: 'hsl(var(--muted-foreground))' };
const GRID_STROKE = 'hsl(var(--border))';
/** Above this many time buckets the activity charts draw areas instead of columns. */
const BAR_LIMIT = 31;
/** Orders without an ad number are pooled under this key by the ad aggregation below. */
const NO_AD_KEY = 'Not returned by Binance';

type Metric = 'volume' | 'orders';
const METRIC_OPTIONS: SegmentOption<Metric>[] = [{ value: 'volume', label: 'Volume' }, { value: 'orders', label: 'Orders' }];
type TabKey = 'types' | 'ads' | 'zones' | 'rates';
const TAB_KEYS: TabKey[] = ['types', 'ads', 'zones', 'rates'];

// Underline tabs. overflow-y-hidden + inset underline: the bar never becomes a 1px vertical scroller.
const TABS_LIST =
  'h-auto min-h-0 w-full flex-nowrap justify-start gap-1 overflow-x-auto overflow-y-hidden rounded-none border-0 bg-transparent p-0';
const TABS_TRIGGER =
  'h-9 flex-none gap-1.5 rounded-none border-0 bg-transparent px-3 py-0 text-[13px] font-medium text-muted-foreground shadow-none hover:text-foreground focus-visible:ring-inset focus-visible:ring-offset-0 data-[state=active]:border-0 data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-[inset_0_-2px_0_hsl(var(--primary))] max-md:-mb-0.5';

const pad2 = (n: number) => String(n).padStart(2, '0');

function fmtCount(n: number) {
  return Number.isFinite(n) ? Math.round(n).toLocaleString('en-IN') : '0';
}

function plural(n: number, word: string) {
  return `${fmtCount(n)} ${word}${Math.round(n) === 1 ? '' : 's'}`;
}

/** Exact rupee amount for tooltips and hover titles. */
function fmtFullINR(n: number) {
  return `₹${(Number.isFinite(n) ? Math.round(n) : 0).toLocaleString('en-IN')}`;
}

function pctOf(part: number, total: number) {
  return total > 0 ? (part / total) * 100 : 0;
}

function fmtShare(pct: number) {
  return pct > 0 && pct < 0.1 ? '<0.1%' : `${pct.toFixed(1)}%`;
}

const isAdNumber = (label: string) => /^\d{10,}$/.test(label);

/**
 * Short labels for Binance ad numbers (19–20 digits): the last six digits, or
 * more when two ads in view would otherwise look the same. Full number stays in titles.
 */
function shortAdLabels(keys: string[]) {
  const ids = Array.from(new Set(keys.filter(isAdNumber)));
  let len = 6;
  const maxLen = Math.max(6, ...ids.map((k) => k.length));
  while (len < maxLen) {
    const tails = ids.map((k) => k.slice(-len));
    if (new Set(tails).size === tails.length) break;
    len += 1;
  }
  return new Map(ids.map((k) => [k, k.slice(-len)]));
}

/** "Ad ···627840" for an ad number (screen readers hear "Ad ending 627840"); other labels as they are. */
function AdName({ label, tails, className }: { label: string; tails: Map<string, string>; className?: string }) {
  const tail = tails.get(label);
  if (!tail) return <span className={className}>{label}</span>;
  return (
    <span className={className} title={label}>
      <span aria-hidden="true">Ad ···{tail}</span>
      <span className="sr-only">Ad ending {tail}</span>
    </span>
  );
}

const IST_TZ = 'Asia/Kolkata';
const istYear = (t: number) => new Date(t + IST_OFFSET_MS).getUTCFullYear();

function fmtISTDateTime(ts?: number | string | null) {
  if (ts == null || ts === '') return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { timeZone: IST_TZ, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

function fmtISTTime(ts?: number | string | null) {
  if (ts == null || ts === '') return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { timeZone: IST_TZ, hour: 'numeric', minute: '2-digit' });
}

/** "4:12 pm" for today (IST), "13 Oct" this year, "13 Oct 2025" otherwise. */
function fmtLastOrder(ts?: number) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  const day = (t: number) => new Date(t + IST_OFFSET_MS).toISOString().slice(0, 10);
  const now = Date.now();
  if (day(ts) === day(now)) return d.toLocaleTimeString('en-IN', { timeZone: IST_TZ, hour: 'numeric', minute: '2-digit' });
  const opts: Intl.DateTimeFormatOptions = { timeZone: IST_TZ, day: 'numeric', month: 'short' };
  if (istYear(ts) !== istYear(now)) opts.year = 'numeric';
  return d.toLocaleDateString('en-IN', opts);
}

type SeriesView = {
  isHourly: boolean;
  /** Show the year in bucket titles (series spans years, or is not this year). */
  withYear: boolean;
  /** Filter window in the buckets' "IST wall-clock as UTC" time, to clip partial hours. */
  winStart: number;
  winEnd: number;
};

function hhmm(t: number) {
  const d = new Date(t);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/**
 * Bucket heading for tooltips/highlights: "Mon, 13 Oct" or "Mon, 13 Oct · 14:00–15:00" (IST).
 * Hours cut by a shift edge or by "now" show only the part inside the window (e.g. 17:00–17:30).
 */
function bucketTitle(b: Pick<Bucket, 'sort'>, v: SeriesView) {
  const d = new Date(b.sort);
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' };
  if (v.withYear) opts.year = 'numeric';
  const date = d.toLocaleDateString('en-IN', opts);
  if (!v.isHourly) return date;
  const hourEnd = b.sort + 3_600_000;
  const from = Math.max(b.sort, v.winStart);
  const to = Math.min(hourEnd, v.winEnd);
  return `${date} · ${hhmm(from)}–${to < hourEnd && to > from ? hhmm(to) : hhmm(hourEnd)}`;
}

/** Bucket sort value for a timestamp, built the same way as the chart aggregation (IST). */
function bucketSort(ts: number, isHourly: boolean) {
  const p = istDateParts(ts);
  return isHourly ? Date.UTC(p.year, p.month - 1, p.day, p.hour) : Date.UTC(p.year, p.month - 1, p.day);
}

function emptyBucket(sort: number, isHourly: boolean): Bucket {
  const d = new Date(sort);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const h = d.getUTCHours();
  const dateKey = `${y}-${pad2(m)}-${pad2(day)}`;
  return {
    key: isHourly ? `${dateKey}-${pad2(h)}` : dateKey,
    label: isHourly ? `${pad2(h)}:00` : `${pad2(day)}/${pad2(m)}`,
    sort,
    buyOrders: 0,
    sellOrders: 0,
    buyVolume: 0,
    sellVolume: 0,
    smallBuyOrders: 0,
    bigBuyOrders: 0,
    smallSellOrders: 0,
    bigSellOrders: 0,
    smallBuyVolume: 0,
    bigBuyVolume: 0,
    smallSellVolume: 0,
    bigSellVolume: 0,
  };
}

/**
 * Display-only: every hour/day of the selected window is drawn, quiet ones as
 * zero, so the time axis stays even. The buckets themselves (and the peak) are unchanged.
 */
function fillBucketGaps(rows: Bucket[], isHourly: boolean, startTs: number, endTs: number): Bucket[] {
  if (!rows.length) return rows;
  const step = isHourly ? 3_600_000 : 86_400_000;
  const first = Math.min(bucketSort(startTs, isHourly), rows[0].sort);
  const last = Math.max(bucketSort(Math.max(startTs, endTs - 1), isHourly), rows[rows.length - 1].sort);
  if ((last - first) / step > 400) return rows;
  const bySort = new Map(rows.map((r) => [r.sort, r]));
  const out: Bucket[] = [];
  for (let t = first; t <= last; t += step) out.push(bySort.get(t) || emptyBucket(t, isHourly));
  return out;
}

/** X-axis for the activity charts: hours, dd/mm, or one tick per month for long periods. */
function timeAxis(series: Bucket[], isHourly: boolean): { tickFormatter: (v: number) => string; ticks?: number[] } {
  if (isHourly) return { tickFormatter: (v) => `${pad2(new Date(v).getUTCHours())}:00` };
  const span = series.length ? series[series.length - 1].sort - series[0].sort : 0;
  if (span > 92 * 86_400_000) {
    const ticks = series.filter((b) => new Date(b.sort).getUTCDate() === 1).map((b) => b.sort);
    return {
      ticks: ticks.length >= 2 ? ticks : undefined,
      tickFormatter: (v) => new Date(v).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
    };
  }
  return { tickFormatter: (v) => { const d = new Date(v); return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}`; } };
}

/** The props recharts passes to a custom tooltip (only what we read). */
type ChartTipProps = { active?: boolean; payload?: Array<{ payload?: unknown }>; view: SeriesView };

function ActivityTooltip({ active, payload, view }: ChartTipProps) {
  const b = active && payload?.length ? (payload[0]?.payload as Bucket | undefined) : undefined;
  if (!b) return null;
  return (
    <TooltipCard title={bucketTitle(b, view)}>
      <TooltipRow color={BUY_COLOR} label="Buy" value={fmtFullINR(b.buyVolume)} sub={plural(b.buyOrders, 'order')} />
      <TooltipRow color={SELL_COLOR} label="Sell" value={fmtFullINR(b.sellVolume)} sub={plural(b.sellOrders, 'order')} />
      <div className="border-t border-border pt-1">
        <TooltipRow label="Total" value={fmtFullINR(b.buyVolume + b.sellVolume)} sub={plural(b.buyOrders + b.sellOrders, 'order')} />
      </div>
    </TooltipCard>
  );
}

/**
 * Recharts' keyboard layer keeps the tooltip on screen after focus leaves the chart.
 * Hide it on blur until the chart is focused or hovered again (display only).
 */
function KeyboardTipWrapper({ children }: { children: (tipActive: false | undefined) => React.ReactNode }) {
  const [hidden, setHidden] = useState(false);
  return (
    <div className="h-full w-full" onBlur={() => setHidden(true)} onFocus={() => setHidden(false)} onPointerEnter={() => setHidden(false)}>
      {children(hidden ? false : undefined)}
    </div>
  );
}

/** Buy vs sell over time — one measure at a time, one axis. */
function ActivityChart({ data, view, metric }: { data: Bucket[]; view: SeriesView; metric: Metric }) {
  const asBars = data.length <= BAR_LIMIT;
  const buyKey = metric === 'volume' ? 'buyVolume' : 'buyOrders';
  const sellKey = metric === 'volume' ? 'sellVolume' : 'sellOrders';
  const x = timeAxis(data, view.isHourly);
  const yTick = (v: number) => (metric === 'volume' ? fmtINR(Number(v)) : fmtCount(Number(v)));
  const title = `${view.isHourly ? 'Hourly' : 'Daily'} completed ${metric === 'volume' ? 'volume' : 'orders'}, buy and sell`;
  const grid = <CartesianGrid stroke={GRID_STROKE} strokeOpacity={0.6} vertical={false} />;
  const xAxis = <XAxis dataKey="sort" tick={AXIS_TICK} tickFormatter={x.tickFormatter} ticks={x.ticks} axisLine={false} tickLine={false} minTickGap={12} interval="preserveStartEnd" />;
  const yAxis = <YAxis tick={AXIS_TICK} tickFormatter={yTick} axisLine={false} tickLine={false} width={metric === 'volume' ? 52 : 36} allowDecimals={false} />;
  return (
    <KeyboardTipWrapper>
      {(tipActive) => (
    <ResponsiveContainer width="100%" height="100%">
      {asBars ? (
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={2} barCategoryGap="24%" accessibilityLayer aria-label={title}>
          {grid}{xAxis}{yAxis}
          <Tooltip active={tipActive} cursor={{ fill: 'hsl(var(--muted) / 0.35)' }} content={<ActivityTooltip view={view} />} />
          <Bar dataKey={buyKey} name="Buy" fill={BUY_COLOR} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          <Bar dataKey={sellKey} name="Sell" fill={SELL_COLOR} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      ) : (
        <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} accessibilityLayer aria-label={title}>
          {grid}{xAxis}{yAxis}
          <Tooltip active={tipActive} cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeOpacity: 0.4 }} content={<ActivityTooltip view={view} />} />
          <Area type="monotone" dataKey={buyKey} name="Buy" stroke={BUY_COLOR} fill={BUY_COLOR} fillOpacity={0.1} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'hsl(var(--card))' }} isAnimationActive={false} />
          <Area type="monotone" dataKey={sellKey} name="Sell" stroke={SELL_COLOR} fill={SELL_COLOR} fillOpacity={0.1} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'hsl(var(--card))' }} isAnimationActive={false} />
        </AreaChart>
      )}
    </ResponsiveContainer>
      )}
    </KeyboardTipWrapper>
  );
}

function TypeTooltip({ active, payload, view }: ChartTipProps) {
  const b = active && payload?.length ? (payload[0]?.payload as Bucket | undefined) : undefined;
  if (!b) return null;
  const rows = KIND_ORDER.map((k) => ({ k, orders: Number(b[`${k}Orders` as const] || 0), volume: Number(b[`${k}Volume` as const] || 0) }));
  return (
    <TooltipCard title={bucketTitle(b, view)}>
      {rows.map((r) => (
        <TooltipRow key={r.k} color={KIND_COLOR[r.k]} label={orderKindLabels[r.k]} value={fmtFullINR(r.volume)} sub={plural(r.orders, 'order')} />
      ))}
      <div className="border-t border-border pt-1">
        <TooltipRow label="Total" value={fmtFullINR(b.buyVolume + b.sellVolume)} sub={plural(b.buyOrders + b.sellOrders, 'order')} />
      </div>
    </TooltipCard>
  );
}

/** The four order types over time, stacked — one measure at a time, one axis. */
function TypeActivityChart({ data, view, metric }: { data: Bucket[]; view: SeriesView; metric: Metric }) {
  const asBars = data.length <= BAR_LIMIT;
  const keyFor = (k: OrderKind) => `${k}${metric === 'volume' ? 'Volume' : 'Orders'}`;
  const x = timeAxis(data, view.isHourly);
  const yTick = (v: number) => (metric === 'volume' ? fmtINR(Number(v)) : fmtCount(Number(v)));
  const title = `${view.isHourly ? 'Hourly' : 'Daily'} completed ${metric === 'volume' ? 'volume' : 'orders'} by order type`;
  const grid = <CartesianGrid stroke={GRID_STROKE} strokeOpacity={0.6} vertical={false} />;
  const xAxis = <XAxis dataKey="sort" tick={AXIS_TICK} tickFormatter={x.tickFormatter} ticks={x.ticks} axisLine={false} tickLine={false} minTickGap={12} interval="preserveStartEnd" />;
  const yAxis = <YAxis tick={AXIS_TICK} tickFormatter={yTick} axisLine={false} tickLine={false} width={metric === 'volume' ? 52 : 36} allowDecimals={false} />;
  return (
    <KeyboardTipWrapper>
      {(tipActive) => (
    <ResponsiveContainer width="100%" height="100%">
      {asBars ? (
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="24%" accessibilityLayer aria-label={title}>
          {grid}{xAxis}{yAxis}
          <Tooltip active={tipActive} cursor={{ fill: 'hsl(var(--muted) / 0.35)' }} content={<TypeTooltip view={view} />} />
          {KIND_ORDER.map((k) => (
            <Bar key={k} dataKey={keyFor(k)} name={orderKindLabels[k]} stackId="types" fill={KIND_COLOR[k]} stroke="hsl(var(--card))" strokeWidth={1} maxBarSize={28} isAnimationActive={false} />
          ))}
        </BarChart>
      ) : (
        <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} accessibilityLayer aria-label={title}>
          {grid}{xAxis}{yAxis}
          <Tooltip active={tipActive} cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeOpacity: 0.4 }} content={<TypeTooltip view={view} />} />
          {KIND_ORDER.map((k) => (
            <Area key={k} type="monotone" dataKey={keyFor(k)} name={orderKindLabels[k]} stackId="types" stroke={KIND_COLOR[k]} fill={KIND_COLOR[k]} fillOpacity={0.18} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          ))}
        </AreaChart>
      )}
    </ResponsiveContainer>
      )}
    </KeyboardTipWrapper>
  );
}

/** Chart box whose size never feeds back into the layout (so its height can't only ever grow). */
function ChartFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('relative w-full', className)}>
      <div className="absolute inset-0">{children}</div>
    </div>
  );
}

/** Grid columns shared by header and rows of each table (wide container only). */
const TYPE_COLS = '@[40rem]:grid-cols-[minmax(0,1.5fr)_repeat(5,minmax(0,1fr))]';
const AD_COLS = '@[44rem]:grid-cols-[minmax(0,2.2fr)_repeat(6,minmax(0,1fr))]';
const ZONE_COLS = '@[46rem]:grid-cols-[minmax(0,1.6fr)_repeat(6,minmax(0,1fr))_minmax(0,1.4fr)]';
const RATE_COLS = '@[30rem]:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))]';

/** A labelled value cell: the label shows in the narrow (stacked) layout and stays readable to screen readers in the wide one. */
function Cell({ label, children, wide, className, title }: { label: string; children: React.ReactNode; wide: string; className?: string; title?: string }) {
  return (
    <div className={cn('min-w-0', className)} title={title}>
      <div className={cn('text-[10px] text-muted-foreground', wide)}>{label}</div>
      <div className="truncate t-mono text-xs font-medium tabular-nums text-foreground">{children}</div>
    </div>
  );
}

function HeaderRow({ cols, labels, showAt }: { cols: string; labels: string[]; showAt: string }) {
  return (
    <div aria-hidden="true" className={cn('hidden items-end gap-3 border-b border-border px-2 pb-2', showAt, cols)}>
      {labels.map((l, i) => (
        <div key={l} className={cn(CAPTION, i > 0 && 'text-right')}>{l}</div>
      ))}
    </div>
  );
}

const ROW_BUTTON =
  'relative grid w-full gap-x-3 gap-y-2 rounded-md px-2 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring';

function OrderTypesTable({
  items,
  selectedKind,
  onSelect,
  totalVolume,
  ranges,
}: {
  items: Aggregate[];
  selectedKind: OrderKind;
  onSelect: (k: OrderKind) => void;
  totalVolume: number;
  ranges: Record<OrderKind, string>;
}) {
  if (!items.some((i) => i.count)) return <EmptyState icon={Layers} text="No completed order type data in selected period" />;
  const lbl = '@[40rem]:sr-only';
  return (
    <div className="@container">
      <HeaderRow cols={TYPE_COLS} showAt="@[40rem]:grid" labels={['Type', 'Orders', 'Volume', 'Qty (USDT)', 'Avg rate', 'Avg order']} />
      <div role="list" aria-label="Order types" className="divide-y divide-border">
        {items.map((item) => {
          const kind = item.key as OrderKind;
          const selected = selectedKind === kind;
          const share = pctOf(item.volume, totalVolume);
          return (
            <div role="listitem" key={item.key}>
              <button
                type="button"
                aria-current={selected || undefined}
                onClick={() => onSelect(kind)}
                className={cn(ROW_BUTTON, 'grid-cols-3', TYPE_COLS, '@[40rem]:items-center', selected ? 'bg-primary/[0.07]' : 'hover:bg-secondary/60')}
              >
                {selected && <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" />}
                <div className="col-span-3 min-w-0 @[40rem]:col-span-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <Swatch color={KIND_COLOR[kind]} />
                    {item.label}
                  </div>
                  <div className="mt-0.5 truncate pl-4 text-[10px] text-muted-foreground">{ranges[kind]}</div>
                </div>
                <Cell label="Orders" wide={lbl} className="@[40rem]:text-right">{fmtCount(item.count)}</Cell>
                <Cell label="Volume" wide={lbl} className="@[40rem]:text-right" title={`${fmtFullINR(item.volume)} · ${fmtShare(share)} of completed volume`}>
                  {fmtINR(item.volume)}
                  <ShareBar pct={share} color={KIND_COLOR[kind]} label={`${fmtShare(share)} of completed volume`} />
                </Cell>
                <Cell label="Qty (USDT)" wide={lbl} className="@[40rem]:text-right">{fmt(item.quantity, 4)}</Cell>
                <Cell label="Avg rate" wide={lbl} className="@[40rem]:text-right">{fmtRate(item.weightedRate || item.avgRate)}</Cell>
                <Cell label="Avg order" wide={lbl} className="@[40rem]:text-right" title={fmtFullINR(item.avgOrder)}>{fmtINR(item.avgOrder)}</Cell>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CoinBreakdown({ rows, kind, kindVolume }: { rows: Aggregate[]; kind: OrderKind; kindVolume: number }) {
  if (!rows.length) return <EmptyState icon={Coins} text="No coin data for selected type" />;
  return (
    <ul className="divide-y divide-border">
      {rows.map((coin) => {
        const pct = kindVolume ? Math.min(100, (coin.volume / kindVolume) * 100) : 0;
        return (
          <li key={coin.key} className="py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-semibold text-foreground">{coin.label}</span>
              <span className="t-mono text-xs font-medium tabular-nums text-foreground" title={`${fmtFullINR(coin.volume)} · ${fmtShare(pct)} of ${orderKindLabels[kind]} volume`}>{fmtINR(coin.volume)}</span>
            </div>
            <ShareBar pct={pct} color={KIND_COLOR[kind]} label={`${fmtShare(pct)} of ${orderKindLabels[kind]} volume`} />
            <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground @[22rem]:grid-cols-4">
              <span>{plural(coin.count, 'order')}</span>
              <span>Qty <span className="t-mono tabular-nums text-foreground">{fmt(coin.quantity, 4)}</span></span>
              <span>Avg rate <span className="t-mono tabular-nums text-foreground">{fmtRate(coin.weightedRate || coin.avgRate)}</span></span>
              <span>Avg order <span className="t-mono tabular-nums text-foreground" title={fmtFullINR(coin.avgOrder)}>{fmtINR(coin.avgOrder)}</span></span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function SideChip({ side }: { side?: string }) {
  const buy = side === 'BUY';
  return (
    <span className={cn('inline-flex h-5 shrink-0 items-center rounded px-1.5 t-mono text-[10px] font-semibold uppercase tracking-wide', buy ? 'bg-trade-buy/10 text-trade-buy' : 'bg-trade-sell/10 text-trade-sell')}>
      {buy ? 'Buy' : side === 'SELL' ? 'Sell' : side || '—'}
    </span>
  );
}

function AdsTable({
  rows,
  selectedKey,
  onSelect,
  sideVolume,
  tails,
  renderInlineDetail,
}: {
  rows: Aggregate[];
  selectedKey?: string;
  onSelect: (key: string) => void;
  sideVolume: number;
  tails: Map<string, string>;
  /** Detail shown under the selected row while the page is too narrow for the side panel. */
  renderInlineDetail: (item: Aggregate) => React.ReactNode;
}) {
  const lbl = '@[44rem]:sr-only';
  return (
    <div className="@container">
      <HeaderRow cols={AD_COLS} showAt="@[44rem]:grid" labels={['Ad', 'Orders', 'Volume', 'Qty (USDT)', 'Avg rate', 'Avg order', 'Last order']} />
      <div role="list" aria-label="Ads" className="divide-y divide-border">
        {rows.map((item) => {
          const selected = selectedKey === item.key;
          const kind = item.orderKind;
          const share = pctOf(item.volume, sideVolume);
          return (
            <div role="listitem" key={item.key}>
              <button
                type="button"
                aria-current={selected || undefined}
                onClick={() => onSelect(item.key)}
                className={cn(ROW_BUTTON, 'grid-cols-3', AD_COLS, '@[44rem]:items-center', selected ? 'bg-primary/[0.07]' : 'hover:bg-secondary/60')}
              >
                {selected && <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" />}
                <div className="col-span-3 min-w-0 @[44rem]:col-span-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <AdName label={item.label} tails={tails} className="truncate t-mono text-xs font-semibold text-foreground" />
                    {kind && (
                      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                        <Swatch color={KIND_COLOR[kind]} />
                        {item.orderKindLabel || orderKindLabels[kind]}
                      </span>
                    )}
                  </div>
                  {item.key === NO_AD_KEY ? (
                    <div className="mt-0.5 truncate text-[10px] text-muted-foreground">Orders Binance returned without an ad number</div>
                  ) : (
                    <div className="mt-0.5 truncate text-[10px] text-muted-foreground" title={[item.description, ...(item.details || [])].filter(Boolean).join(' · ')}>
                      {item.description || `${item.tradeType || '—'} · ${item.asset || 'USDT'}`}
                      {item.details?.[0] ? ` · ${item.details[0]}` : ''}
                    </div>
                  )}
                </div>
                <Cell label="Orders" wide={lbl} className="@[44rem]:text-right">{fmtCount(item.count)}</Cell>
                <Cell label="Volume" wide={lbl} className="@[44rem]:text-right" title={`${fmtFullINR(item.volume)} · ${fmtShare(share)} of side volume`}>
                  {fmtINR(item.volume)}
                  <ShareBar pct={share} color={kind ? KIND_COLOR[kind] : undefined} label={`${fmtShare(share)} of side volume`} />
                </Cell>
                <Cell label="Qty (USDT)" wide={lbl} className="@[44rem]:text-right">{fmt(item.quantity, 4)}</Cell>
                <Cell label="Avg rate" wide={lbl} className="@[44rem]:text-right">{fmtRate(item.weightedRate || item.avgRate)}</Cell>
                <Cell label="Avg order" wide={lbl} className="@[44rem]:text-right" title={fmtFullINR(item.avgOrder)}>{fmtINR(item.avgOrder)}</Cell>
                <Cell label="Last order" wide={lbl} className="@[44rem]:text-right" title={fmtISTDateTime(item.lastOrderTime)}>{fmtLastOrder(item.lastOrderTime)}</Cell>
              </button>
              {selected && (
                <div className="mx-2 mb-3 mt-1 rounded-md border border-border p-3 @[72rem]/page:hidden">
                  {renderInlineDetail(item)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetailRow({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-1.5 last:border-b-0">
      <dt className="shrink-0 text-[11px] text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 text-right text-xs text-foreground [overflow-wrap:anywhere]', mono && 't-mono tabular-nums')}>{children}</dd>
    </div>
  );
}

type AdListState = 'ready' | 'loading' | 'failed';

function AdDetail({
  ad,
  liveStatus,
  listState,
  zone,
  sideVolume,
  sideLabel,
}: {
  ad: Aggregate;
  /** Status text from Binance's current ad list, or undefined when the ad is not in it. */
  liveStatus?: string;
  /** Whether Binance's current ad list is loaded, still loading, or failed. */
  listState: AdListState;
  zone?: string;
  sideVolume: number;
  sideLabel: string;
}) {
  const numbered = /^\d+$/.test(ad.label);
  const isPool = ad.key === NO_AD_KEY;
  const settingsNote = isPool
    ? 'Orders Binance returned without an ad number — no ad settings.'
    : listState === 'loading'
      ? 'Loading current settings from Binance…'
      : listState === 'failed'
        ? "Binance's ad list couldn't be loaded, so current settings aren't shown."
        : "Not in Binance's current ad list, so its current settings aren't available.";
  const copy = () => {
    navigator.clipboard.writeText(ad.label).then(
      () => toast.success('Ad number copied'),
      () => toast.error("Couldn't copy — select the ad number instead"),
    );
  };
  const zoneLabel = zone === 'block' ? 'Block Zone' : zone === 'p2p' ? 'P2P Zone' : 'Zone not returned by Binance';
  return (
    <div className="@container">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={CAPTION}>{numbered ? 'Ad number' : 'Ad'}</div>
          <div className="mt-0.5 t-mono text-sm font-semibold text-foreground [overflow-wrap:anywhere]">{ad.label}</div>
        </div>
        {numbered && (
          <button
            type="button"
            onClick={copy}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Copy ad number"
            title="Copy ad number"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <SideChip side={ad.tradeType} />
        <span className="text-[11px] text-muted-foreground">{ad.asset || 'USDT'}</span>
        {ad.orderKind && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Swatch color={KIND_COLOR[ad.orderKind]} />
            {ad.orderKindLabel || orderKindLabels[ad.orderKind]}
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 @[34rem]:grid-cols-4">
        {[
          { l: 'Volume', v: fmtINR(ad.volume), t: fmtFullINR(ad.volume) },
          { l: 'Orders', v: fmtCount(ad.count) },
          { l: 'Effective qty', v: fmt(ad.quantity, 4) },
          { l: 'Avg rate', v: fmtRate(ad.weightedRate || ad.avgRate) },
        ].map((m) => (
          <div key={m.l} className="rounded-md border border-border px-2.5 py-2">
            <div className="text-[10px] text-muted-foreground">{m.l}</div>
            <div className="truncate t-mono text-sm font-semibold tabular-nums text-foreground" title={m.t}>{m.v}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-x-6 @[34rem]:grid-cols-2">
        <dl>
          <DetailRow label="Avg order" mono>{fmtINR(ad.avgOrder)}</DetailRow>
          <DetailRow label={`Share of ${sideLabel}`} mono>{fmtShare(pctOf(ad.volume, sideVolume))}</DetailRow>
          <DetailRow label="Last order" mono>{fmtISTDateTime(ad.lastOrderTime) || '—'}</DetailRow>
          <DetailRow label="Zone">{zoneLabel}</DetailRow>
        </dl>
        <div className="mt-3 @[34rem]:mt-0">
          <div className={CAPTION}>Current settings on Binance</div>
          {liveStatus && !isPool ? (
            <dl className="mt-1">
              <DetailRow label="Status">{liveStatus}</DetailRow>
              <DetailRow label="Current price">{ad.details?.[0] || '—'}</DetailRow>
              <DetailRow label="Limits">{ad.details?.[1] || '—'}</DetailRow>
              <DetailRow label="Payment methods">{ad.details?.[2] || '—'}</DetailRow>
            </dl>
          ) : (
            <div className="mt-1.5 text-[11px] text-muted-foreground">{settingsNote}</div>
          )}
        </div>
      </div>
    </div>
  );
}

type ZoneRow = {
  key: string;
  label: string;
  orders: number;
  volume: number;
  qty: number;
  buyVolume: number;
  sellVolume: number;
  cancelled: number;
  appeals: number;
  weightedRate: number;
  completionRate: number;
  avgOrder: number;
};

function ZonesTable({ rows }: { rows: ZoneRow[] }) {
  const total = rows.reduce((s, r) => s + r.volume, 0);
  const lbl = '@[46rem]:sr-only';
  return (
    <div className="@container">
      <HeaderRow cols={ZONE_COLS} showAt="@[46rem]:grid" labels={['Zone', 'Orders', 'Volume', 'Avg rate', 'Avg order', 'Completion', 'Appeals', 'Buy / sell']} />
      <div role="list" aria-label="Market zones" className="divide-y divide-border">
        {rows.map((row) => {
          const share = pctOf(row.volume, total);
          return (
            <div role="listitem" key={row.key} className={cn('grid grid-cols-3 gap-x-3 gap-y-2 px-2 py-3', ZONE_COLS, '@[46rem]:items-center')}>
              <div className="col-span-3 flex min-w-0 items-start gap-2 @[46rem]:col-span-1">
                <MapIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 text-xs font-semibold leading-4 text-foreground" title={row.label}>{row.label}</span>
              </div>
              <Cell label="Orders" wide={lbl} className="@[46rem]:text-right">{fmtCount(row.orders)}</Cell>
              <Cell label="Volume" wide={lbl} className="@[46rem]:text-right" title={`${fmtFullINR(row.volume)} · ${fmtShare(share)} of completed volume`}>
                {fmtINR(row.volume)}
                <ShareBar pct={share} label={`${fmtShare(share)} of completed volume`} />
              </Cell>
              <Cell label="Avg rate" wide={lbl} className="@[46rem]:text-right">{row.qty > 0 ? fmtRate(row.weightedRate) : '—'}</Cell>
              <Cell label="Avg order" wide={lbl} className="@[46rem]:text-right" title={fmtFullINR(row.avgOrder)}>{fmtINR(row.avgOrder)}</Cell>
              <Cell label="Completion" wide={lbl} className="@[46rem]:text-right">{row.orders + row.cancelled ? `${row.completionRate.toFixed(1)}%` : '—'}</Cell>
              <Cell label="Appeals" wide={lbl} className="@[46rem]:text-right">{fmtCount(row.appeals)}</Cell>
              <div className="col-span-3 min-w-0 @[46rem]:col-span-1">
                <div className={cn('mb-1 text-[10px] text-muted-foreground', lbl)}>Buy / sell</div>
                <SplitBar buy={row.buyVolume} sell={row.sellVolume} />
                <div className="mt-1 flex justify-between gap-2 t-mono text-[10px] tabular-nums text-muted-foreground">
                  <span title={`Buy ${fmtFullINR(row.buyVolume)}`}>B {fmtINR(row.buyVolume)}</span>
                  <span title={`Sell ${fmtFullINR(row.sellVolume)}`}>S {fmtINR(row.sellVolume)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Where the buy and sell rates sit between the lowest and highest order rate in the period. */
function RateLadder({ min, max, marks }: { min: number; max: number; marks: { label: string; value: number; color: string }[] }) {
  const usable = Number.isFinite(min) && Number.isFinite(max) && max > min && min > 0;
  if (!usable) return <EmptyState icon={Scale} text="Not enough valued orders in this period to compare rates" className="min-h-[120px]" />;
  const pos = (v: number) => Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
  const shown = marks.filter((m) => m.value > 0);
  return (
    <div>
      <div
        className="relative mx-1 mt-3 h-2 rounded-full bg-secondary"
        role="img"
        aria-label={`Order rates from ${fmtRate(min)} to ${fmtRate(max)}: ${shown.map((m) => `${m.label} ${fmtRate(m.value)}`).join(', ')}`}
      >
        {shown.map((m) => (
          <span
            key={m.label}
            className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
            style={{ left: `${pos(m.value)}%`, background: m.color }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between gap-3 t-mono text-[10px] tabular-nums text-muted-foreground">
        <span>Lowest {fmtRate(min)}</span>
        <span>Highest {fmtRate(max)}</span>
      </div>
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="@container/page flex w-full flex-col gap-4 p-3 sm:p-4 md:p-6" aria-busy="true" aria-label="Loading analytics">
      <div className="flex items-center gap-3">
        <div className="t-shimmer h-9 w-9 rounded-lg" />
        <div className="space-y-1.5">
          <div className="t-shimmer h-4 w-28 rounded" />
          <div className="t-shimmer h-3 w-56 rounded" />
        </div>
      </div>
      <div className="t-shimmer h-8 w-full max-w-xl rounded-md" />
      <div className="grid grid-cols-2 gap-3 @2xl/page:grid-cols-3 @6xl/page:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="t-shimmer h-[86px] rounded-md" />)}
      </div>
      <div className="grid grid-cols-1 gap-4 @5xl/page:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <div className="t-shimmer h-80 rounded-md" />
        <div className="t-shimmer h-80 rounded-md" />
      </div>
    </div>
  );
}

export default function TerminalAnalytics() {
  const { data: configs, isLoading: configLoading } = useSmallOrderConfigs();
  const { userId, hasPermission, isTerminalAdmin } = useTerminalAuth();
  const canSync = hasPermission('terminal_dashboard_export') || hasPermission('terminal_orders_sync_approve') || isTerminalAdmin;
  const [prefs, setPref] = useTerminalUserPrefs(userId, 'analytics', { filter: '' as string });
  const [selectedOrderKind, setSelectedOrderKind] = useState<OrderKind>('smallBuy');
  const [adTradeFilter, setAdTradeFilter] = useState<AdTradeFilter>('BUY');
  const [selectedAdKey, setSelectedAdKey] = useState<string>('');

  const filter: TimeFilter = useMemo(() => deserializeTimeFilter(prefs.filter || undefined), [prefs.filter]);
  const setFilter = useCallback((f: TimeFilter) => setPref('filter', serializeTimeFilter(f)), [setPref]);
  const { startTimestamp, endTimestamp } = useMemo(() => getTimestampsForFilter(filter), [filter]);
  const inShiftWindow = useMemo(() => makeShiftPredicate(filter), [filter]);

  const { data: adsRaw, isLoading: adsLoading, isLoadingError: adsUnavailable } = useBinanceAdsList({ advStatus: null });
  const {
    data: cachedOrders = [],
    isLoading: ordersLoading,
    refetch: refetchOrders,
    isLoadingError: ordersFailed,
    isRefetchError: ordersRefreshFailed,
    error: ordersErrorDetail,
    isPlaceholderData: showingPreviousPeriod,
    isFetching: ordersFetching,
  } = useCachedOrderHistory({ startTimestamp, endTimestamp });
  const { data: syncMeta } = useSyncMetadata();
  const syncMutation = useSyncOrderHistory();

  const ads: BinanceAd[] = useMemo(() => {
    const list = (adsRaw as any)?.data || (adsRaw as any)?.list || adsRaw;
    return Array.isArray(list) ? list : [];
  }, [adsRaw]);

  const adZoneMap = useAdZoneMap(ads as any);
  // Same query as inside useAdZoneMap (shared cache, no extra request); read only to say when zone history failed.
  const { isLoadingError: zoneHistoryUnavailable } = useAdZoneSnapshots();


  const orderNumbers = useMemo(() => (
    Array.isArray(cachedOrders) ? cachedOrders.map((order: any) => order.orderNumber || order.order_number || '').filter(Boolean) : []
  ), [cachedOrders]);
  const { data: effectiveValuations = new Map<string, EffectiveValuation>(), isLoading: valuationsLoading, isLoadingError: valuationsUnavailable } = useEffectiveOrderValuations(orderNumbers);

  const orders = useMemo(() => {
    return (Array.isArray(cachedOrders) ? cachedOrders : [])
      .map((order: any) => {
        const orderNumber = order.orderNumber || order.order_number || '';
        return normalizeOrder({ ...order, ...(effectiveValuations.get(orderNumber) || {}) });
      })
      .filter((o) => inShiftWindow(o.createTime));
  }, [cachedOrders, effectiveValuations, inShiftWindow]);


  const completed = useMemo(() => orders.filter((o) => isCompletedStatus(o.orderStatus)), [orders]);

  const analytics = useMemo(() => {
    const buy = completed.filter((o) => o.tradeType === 'BUY');
    const sell = completed.filter((o) => o.tradeType === 'SELL');
    const valuedCompleted = completed.filter((o) => o.hasEffectiveUsdtValuation);
    const valuedBuy = buy.filter((o) => o.hasEffectiveUsdtValuation);
    const valuedSell = sell.filter((o) => o.hasEffectiveUsdtValuation);
    const cancelled = orders.filter((o) => isCancelledStatus(o.orderStatus));
    const appeals = orders.filter((o) => isAppealStatus(o.orderStatus));
    // Completion counts finished orders only: completed ÷ (completed + cancelled), as on the
    // Dashboard and in Zones. Open orders and appeals count once they finish.
    const finishedCount = completed.length + cancelled.length;
    const openCount = orders.filter((o) => !isCompletedStatus(o.orderStatus) && !isCancelledStatus(o.orderStatus) && !isAppealStatus(o.orderStatus)).length;
    const buyVolume = buy.reduce((s, o) => s + o.totalPrice, 0);
    const sellVolume = sell.reduce((s, o) => s + o.totalPrice, 0);
    const totalVolume = buyVolume + sellVolume;
    const valuedBuyVolume = valuedBuy.reduce((s, o) => s + o.totalPrice, 0);
    const valuedSellVolume = valuedSell.reduce((s, o) => s + o.totalPrice, 0);
    const valuedTotalVolume = valuedBuyVolume + valuedSellVolume;
    const totalQty = valuedCompleted.reduce((s, o) => s + o.effectiveUsdtQty, 0);

    const kinds: Record<OrderKind, NormalizedOrder[]> = { smallBuy: [], bigBuy: [], smallSell: [], bigSell: [] };
    for (const o of completed) kinds[classifyOrder(o, configs?.smallBuy, configs?.smallSale)].push(o);

    const orderTypes = [
      aggregateOrders('Small Buy', 'smallBuy', kinds.smallBuy, { tradeType: 'BUY' }),
      aggregateOrders('Big Buy', 'bigBuy', kinds.bigBuy, { tradeType: 'BUY' }),
      aggregateOrders('Small Sale', 'smallSell', kinds.smallSell, { tradeType: 'SELL' }),
      aggregateOrders('Big Sale', 'bigSell', kinds.bigSell, { tradeType: 'SELL' }),
    ];

    const orderTypeCoinBreakdown = Object.fromEntries(
      (Object.keys(kinds) as OrderKind[]).map((kind) => {
        const byCoin = new Map<string, NormalizedOrder[]>();
        for (const order of kinds[kind]) {
          const coin = String(order.asset || 'USDT').toUpperCase();
          byCoin.set(coin, [...(byCoin.get(coin) || []), order]);
        }
        return [kind, Array.from(byCoin.entries())
          .map(([coin, rows]) => aggregateCoinOrders(coin, `${kind}-${coin}`, rows, { asset: coin, orderKind: kind }))
          .sort((a, b) => b.volume - a.volume)];
      })
    ) as Record<OrderKind, Aggregate[]>;

    const byAd = new Map<string, NormalizedOrder[]>();
    for (const o of completed) {
      const key = o.advNo || 'Not returned by Binance';
      byAd.set(key, [...(byAd.get(key) || []), o]);
    }
    const adLookup = new Map(ads.map((ad: any) => [String(ad.advNo || ad.adv_no || ''), ad]));
    const adRows = Array.from(byAd.entries()).map(([advNo, rows]) => {
      const ad = adLookup.get(advNo) as any;
      const kind = dominantOrderKind(rows, configs?.smallBuy, configs?.smallSale);
      return aggregateOrders(advNo, advNo, rows, {
        orderKind: kind,
        orderKindLabel: kind ? orderKindLabels[kind] : undefined,
        tradeType: rows[0]?.tradeType || ad?.tradeType,
        asset: rows[0]?.asset || ad?.asset,
        ...getAdDetails(ad, rows),
      });
    }).sort(sortAdRowsByType);

    const rates = valuedCompleted.map((o) => o.effectiveUsdtRate).filter((v) => Number.isFinite(v) && v > 0);
    const weightedBuyRate = weightedRate(valuedBuyVolume, valuedBuy.reduce((s, o) => s + o.effectiveUsdtQty, 0));
    const weightedSellRate = weightedRate(valuedSellVolume, valuedSell.reduce((s, o) => s + o.effectiveUsdtQty, 0));

    // "Top ad by volume": adRows is sorted by type for the tables, so pick the largest by volume here;
    // orders without an ad number are pooled under 'Not returned by Binance', which is not an ad.
    const bestAd = adRows
      .filter((row) => row.key !== 'Not returned by Binance')
      .reduce<Aggregate | undefined>((best, row) => (!best || row.volume > best.volume ? row : best), undefined);
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
      weightedAvgRate: weightedRate(valuedTotalVolume, totalQty),
      avgBuyRate: average(valuedBuy.map((o) => o.effectiveUsdtRate)),
      avgSellRate: average(valuedSell.map((o) => o.effectiveUsdtRate)),
      weightedBuyRate,
      weightedSellRate,
      minRate: rates.length ? Math.min(...rates) : 0,
      maxRate: rates.length ? Math.max(...rates) : 0,
      completionRate: finishedCount ? completed.length / finishedCount * 100 : 0,
      finishedCount,
      openCount,
      orderTypes,
      orderTypeCoinBreakdown,
      adRows,
      bestAd,
      highestSellAd,
      imbalance,
    };
  }, [orders, completed, configs, ads]);

  // ─── Zone attribution (Binance `classify`, never inferred) ───────────────
  const zoneRows = useMemo(() => {
    type ZoneKey = 'p2p' | 'block' | 'unattributed';
    const empty = () => ({ orders: 0, volume: 0, qty: 0, valuedVolume: 0, buyVolume: 0, sellVolume: 0, cancelled: 0, appeals: 0 });
    const buckets: Record<ZoneKey, ReturnType<typeof empty>> = { p2p: empty(), block: empty(), unattributed: empty() };
    const keyFor = (advNo: string): ZoneKey => {
      if (!advNo) return 'unattributed';
      const z = adZoneMap.get(String(advNo));
      return z === 'block' ? 'block' : z === 'p2p' ? 'p2p' : 'unattributed';
    };
    for (const o of orders) {
      const b = buckets[keyFor(o.advNo)];
      if (isCancelledStatus(o.orderStatus)) b.cancelled += 1;
      if (isAppealStatus(o.orderStatus)) b.appeals += 1;
    }
    for (const o of completed) {
      const b = buckets[keyFor(o.advNo)];
      b.orders += 1;
      b.volume += o.totalPrice;
      if (o.tradeType === 'BUY') b.buyVolume += o.totalPrice; else b.sellVolume += o.totalPrice;
      if (o.hasEffectiveUsdtValuation) {
        b.qty += o.effectiveUsdtQty;
        b.valuedVolume += o.totalPrice;
      }
    }
    return (['p2p', 'block', 'unattributed'] as ZoneKey[]).map((key) => {
      const b = buckets[key];
      const attempted = b.orders + b.cancelled;
      return {
        key,
        label: key === 'p2p' ? 'P2P Zone' : key === 'block' ? 'Block Zone' : 'Zone not returned by Binance',
        ...b,
        weightedRate: b.qty > 0 ? b.valuedVolume / b.qty : 0,
        completionRate: attempted ? (b.orders / attempted) * 100 : 0,
        avgOrder: b.orders ? b.volume / b.orders : 0,
      };
    });
  }, [orders, completed, adZoneMap]);

  const chartData = useMemo(() => {

    const isHourly = filter.mode === '1d';
    const map = new Map<string, Bucket>();
    for (const o of completed) {
      const p = istDateParts(o.createTime);
      const dateKey = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
      const key = isHourly ? `${dateKey}-${String(p.hour).padStart(2, '0')}` : dateKey;
      const label = isHourly ? `${String(p.hour).padStart(2, '0')}:00` : `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}`;
      const sort = isHourly ? Date.UTC(p.year, p.month - 1, p.day, p.hour) : Date.UTC(p.year, p.month - 1, p.day);
      const entry = map.get(key) || {
        key,
        label,
        sort,
        buyOrders: 0,
        sellOrders: 0,
        buyVolume: 0,
        sellVolume: 0,
        smallBuyOrders: 0,
        bigBuyOrders: 0,
        smallSellOrders: 0,
        bigSellOrders: 0,
        smallBuyVolume: 0,
        bigBuyVolume: 0,
        smallSellVolume: 0,
        bigSellVolume: 0,
      };
      const kind = classifyOrder(o, configs?.smallBuy, configs?.smallSale);
      if (kind === 'smallBuy') {
        entry.smallBuyOrders += 1;
        entry.smallBuyVolume += o.totalPrice;
      } else if (kind === 'bigBuy') {
        entry.bigBuyOrders += 1;
        entry.bigBuyVolume += o.totalPrice;
      } else if (kind === 'smallSell') {
        entry.smallSellOrders += 1;
        entry.smallSellVolume += o.totalPrice;
      } else {
        entry.bigSellOrders += 1;
        entry.bigSellVolume += o.totalPrice;
      }
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
  }, [completed, filter.mode, configs]);

  const peakBucket = useMemo(() => chartData.slice().sort((a, b) => (b.buyOrders + b.sellOrders) - (a.buyOrders + a.sellOrders))[0], [chartData]);
  const periodLabel = getFilterLabel(filter);
  const isLoading = ordersLoading || configLoading;
  const filteredAdRows = useMemo(() => analytics.adRows.filter((item) => item.tradeType === adTradeFilter), [analytics.adRows, adTradeFilter]);
  const selectedAd = useMemo(() => filteredAdRows.find((item) => item.key === selectedAdKey) || filteredAdRows[0], [filteredAdRows, selectedAdKey]);

  const lastSyncLabel = syncMeta?.last_sync_at
    ? `Synced ${fmtISTTime(syncMeta.last_sync_at)}`
    : 'Never synced';
  const lastSyncTitle = syncMeta?.last_sync_at
    ? `Order history last synced ${fmtISTDateTime(syncMeta.last_sync_at)} IST`
    : 'Order history has not been synced yet';
  const syncDurationLabel = syncMeta?.last_sync_duration_ms
    ? `${(Number(syncMeta.last_sync_duration_ms) / 1000).toFixed(1)}s`
    : '';

  const handleAnalyticsSync = useCallback(() => {
    toast.info('Analytics sync started — refreshing Binance order history...');
    syncMutation.mutate(
      { fullSync: false },
      {
        onSuccess: () => refetchOrders(),
      }
    );
  }, [syncMutation, refetchOrders]);

  useEffect(() => {
    if (filteredAdRows.length && !filteredAdRows.some((item) => item.key === selectedAdKey)) {
      setSelectedAdKey(filteredAdRows[0].key);
    }
    if (!filteredAdRows.length && selectedAdKey) setSelectedAdKey('');
  }, [filteredAdRows, selectedAdKey]);

  // ─── Presentation state (TA-1): open tab in the link, chart measure toggles ───
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as TabKey | null;
  const activeTab: TabKey = tabParam && TAB_KEYS.includes(tabParam) ? tabParam : 'types';
  const setActiveTab = useCallback((v: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', v);
      return next;
    }, { replace: true });
  }, [setSearchParams]);
  const [activityMetric, setActivityMetric] = useState<Metric>('volume');
  const [typeMetric, setTypeMetric] = useState<Metric>('orders');

  const isHourly = filter.mode === '1d';
  const chartSeries = useMemo(
    () => fillBucketGaps(chartData, isHourly, startTimestamp, endTimestamp),
    [chartData, isHourly, startTimestamp, endTimestamp],
  );
  const seriesView = useMemo<SeriesView>(() => {
    const years = new Set(chartSeries.map((b) => new Date(b.sort).getUTCFullYear()));
    return {
      isHourly,
      withYear: years.size > 1 || (years.size === 1 && !years.has(istYear(Date.now()))),
      winStart: startTimestamp + IST_OFFSET_MS,
      winEnd: endTimestamp + IST_OFFSET_MS,
    };
  }, [chartSeries, isHourly, startTimestamp, endTimestamp]);

  const kindRanges = useMemo(() => {
    const small = (cfg?: RangeConfig | null) => (!cfg ? 'Small range not available' : cfg.is_enabled ? `${fmtFullINR(cfg.min_amount)} – ${fmtFullINR(cfg.max_amount)}` : 'Small range off');
    const big = (cfg?: RangeConfig | null) => (cfg?.is_enabled ? 'Outside the small range' : 'All orders');
    return {
      smallBuy: small(configs?.smallBuy),
      bigBuy: big(configs?.smallBuy),
      smallSell: small(configs?.smallSale),
      bigSell: big(configs?.smallSale),
    } as Record<OrderKind, string>;
  }, [configs]);

  const adTails = useMemo(() => shortAdLabels(analytics.adRows.map((r) => r.key)), [analytics.adRows]);
  // Status of each ad in Binance's current list (same list the ad rows read); absent = not listed now.
  const liveAdStatus = useMemo(() => new Map(ads.map((ad) => {
    const row = ad as BinanceAd & { adv_no?: string; adv_status?: number };
    return [String(row.advNo || row.adv_no || ''), getAdStatusText(Number(row.advStatus ?? row.adv_status))] as const;
  })), [ads]);

  const adSideCounts = useMemo(() => ({
    BUY: analytics.adRows.filter((r) => r.tradeType === 'BUY' && r.key !== NO_AD_KEY).length,
    SELL: analytics.adRows.filter((r) => r.tradeType === 'SELL' && r.key !== NO_AD_KEY).length,
  }), [analytics.adRows]);

  const adSideTotals = useMemo(() => ({
    volume: filteredAdRows.reduce((sum, item) => sum + item.volume, 0),
    quantity: filteredAdRows.reduce((sum, item) => sum + item.quantity, 0),
  }), [filteredAdRows]);

  if (isLoading) return <AnalyticsSkeleton />;

  const pendingText = showingPreviousPeriod ? `Loading ${periodLabel}…` : null;
  const sideLabel = adTradeFilter === 'BUY' ? 'buy-ad volume' : 'sell-ad volume';
  const buyShare = pctOf(analytics.buyVolume, analytics.totalVolume);
  const enrichingLabel = valuationsLoading ? 'Loading rates…' : adsLoading ? 'Loading ad details…' : '';
  const dataWarnings = [
    valuationsUnavailable ? 'USDT valuations could not be loaded, so rates and quantities may be incomplete.' : '',
    adsUnavailable ? 'Ad details could not be loaded from Binance; ads show their number only.' : '',
  ].filter(Boolean);
  const peakOrders = peakBucket ? peakBucket.buyOrders + peakBucket.sellOrders : 0;
  const hasRates = analytics.minRate > 0 && analytics.maxRate > 0;
  const rateMarks = [
    { label: 'Avg buy', value: analytics.weightedBuyRate, color: BUY_COLOR },
    { label: 'Avg (all)', value: analytics.weightedAvgRate, color: 'hsl(var(--foreground))' },
    { label: 'Avg sell', value: analytics.weightedSellRate, color: SELL_COLOR },
  ];
  const adSideOptions: SegmentOption<AdTradeFilter>[] = [
    { value: 'BUY', label: 'Buy Ads', count: adSideCounts.BUY },
    { value: 'SELL', label: 'Sell Ads', count: adSideCounts.SELL },
  ];
  const adListState: AdListState = adsUnavailable ? 'failed' : adsLoading && !ads.length ? 'loading' : 'ready';
  const renderAdDetail = (item: Aggregate) => (
    <AdDetail
      ad={item}
      liveStatus={liveAdStatus.get(String(item.key))}
      listState={adListState}
      zone={adZoneMap.get(String(item.key))}
      sideVolume={adSideTotals.volume}
      sideLabel={sideLabel}
    />
  );

  return (
    <TerminalPermissionGate permissions={['terminal_analytics_view']}>
      {/* Light theme only: muted text one step darker on this page, so 10–12px labels reach 4.5:1 on the paper canvas and tints. */}
      <div className="flex w-full flex-col gap-4 p-3 sm:p-4 md:p-6 [.t-light_&]:[--muted-foreground:220_10%_42%]">
        {/* Command strip */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="shrink-0 rounded-lg border border-primary/20 bg-primary/10 p-2">
              <Activity className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold leading-tight text-foreground">Analytics</h1>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span>{periodLabel}</span>
                {!ordersFailed && !showingPreviousPeriod && (
                  <>
                    <span className="text-muted-foreground/50" aria-hidden="true">·</span>
                    <span><span className="t-mono tabular-nums text-foreground">{fmtCount(orders.length)}</span> orders in view</span>
                    <span className="text-muted-foreground/50" aria-hidden="true">·</span>
                    <span><span className="t-mono tabular-nums text-foreground">{fmtCount(completed.length)}</span> completed</span>
                  </>
                )}
                {showingPreviousPeriod && (
                  <span role="status" className="inline-flex items-center gap-1 text-primary">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    Loading — figures below are incomplete
                  </span>
                )}
              </div>
            </div>
          </div>
          {canSync && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 shrink-0 gap-1.5 text-xs"
              onClick={handleAnalyticsSync}
              disabled={syncMutation.isPending}
              title="Refresh Analytics Orders"
              aria-label="Refresh analytics orders from Binance"
            >
              <CloudDownload className={`h-3.5 w-3.5 ${syncMutation.isPending ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          )}
        </div>

        {/* Period filter + data freshness */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <TimePeriodFilter value={filter} onChange={setFilter} compact />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5" title={lastSyncTitle}>
              <Database className="h-3 w-3" aria-hidden="true" />
              {lastSyncLabel}
              {syncDurationLabel && <span className="t-mono tabular-nums">· {syncDurationLabel}</span>}
            </span>
            {ordersRefreshFailed && !ordersFailed && (
              <span role="status" className="inline-flex items-center gap-1 text-warning">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                Couldn't refresh orders — showing the last loaded data
              </span>
            )}
            {enrichingLabel && (
              <span role="status" className="inline-flex items-center gap-1 text-primary">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                {enrichingLabel}
              </span>
            )}
          </div>
        </div>

        {syncMutation.isPending && (
          <div role="status" className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
            <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
            Refreshing analytics source data from Binance...
          </div>
        )}

        {dataWarnings.length > 0 && !ordersFailed && (
          <div role="status" className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{dataWarnings.join(' ')}</span>
          </div>
        )}

        {ordersFailed ? (
          <div role="alert" className="t-panel flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
            <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-foreground">Couldn't load orders for {periodLabel}</p>
              <div className="mt-1 text-xs text-muted-foreground">{ordersErrorDetail?.message || 'The order history request failed.'}</div>
            </div>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => refetchOrders()} disabled={ordersFetching}>
              <RefreshCw className={`h-3.5 w-3.5 ${ordersFetching ? 'animate-spin' : ''}`} aria-hidden="true" />
              Try again
            </Button>
          </div>
        ) : (
          <PendingContext.Provider value={pendingText}>
            <div
              className={cn('@container/page flex flex-col gap-4 transition-opacity duration-200', showingPreviousPeriod && 'opacity-60')}
              aria-busy={showingPreviousPeriod || undefined}
            >
              {/* KPI strip */}
              <div className="grid grid-cols-2 gap-3 @2xl/page:grid-cols-3 @6xl/page:grid-cols-6">
                <StatTile
                  icon={ShoppingCart}
                  label="Completed"
                  value={fmtCount(completed.length)}
                  sub={<>Buy <span className="t-mono tabular-nums text-foreground">{fmtCount(analytics.buy.length)}</span> · Sell <span className="t-mono tabular-nums text-foreground">{fmtCount(analytics.sell.length)}</span></>}
                />
                <StatTile
                  icon={TrendingDown}
                  tone="buy"
                  label="Buy volume"
                  value={fmtINR(analytics.buyVolume)}
                  valueTitle={fmtFullINR(analytics.buyVolume)}
                  sub={<>Avg rate <span className="t-mono tabular-nums text-foreground">{fmtRate(analytics.weightedBuyRate)}</span></>}
                />
                <StatTile
                  icon={TrendingUp}
                  tone="sell"
                  label="Sell volume"
                  value={fmtINR(analytics.sellVolume)}
                  valueTitle={fmtFullINR(analytics.sellVolume)}
                  sub={<>Avg rate <span className="t-mono tabular-nums text-foreground">{fmtRate(analytics.weightedSellRate)}</span></>}
                />
                <StatTile
                  icon={Percent}
                  label="Avg rate"
                  value={fmtRate(analytics.weightedAvgRate)}
                  sub={hasRates ? <>Range <span className="t-mono tabular-nums text-foreground">{fmtRate(analytics.minRate)} – {fmtRate(analytics.maxRate)}</span></> : pendingText ? 'Loading…' : 'No valued orders'}
                />
                <StatTile
                  icon={Receipt}
                  tone="muted"
                  label="Avg order"
                  value={fmtINR(analytics.avgOrder)}
                  valueTitle={fmtFullINR(analytics.avgOrder)}
                  sub="Per completed order"
                />
                <StatTile
                  icon={Gauge}
                  tone={analytics.appeals.length ? 'warning' : 'muted'}
                  label="Completion"
                  value={analytics.finishedCount ? `${analytics.completionRate.toFixed(1)}%` : '—'}
                  valueTitle="Completed ÷ (completed + cancelled, including expired). Open orders and appeals count once they finish."
                  sub={
                    <>
                      <span className="t-mono tabular-nums text-foreground">{fmtCount(analytics.cancelled.length)}</span> cancelled ·{' '}
                      {analytics.openCount > 0 && (
                        <>
                          <span className="t-mono tabular-nums text-foreground">{fmtCount(analytics.openCount)}</span> open ·{' '}
                        </>
                      )}
                      <span className={cn('t-mono tabular-nums', analytics.appeals.length ? 'font-semibold text-destructive' : 'text-foreground')}>{fmtCount(analytics.appeals.length)}</span> {analytics.appeals.length === 1 ? 'appeal' : 'appeals'}
                    </>
                  }
                />
              </div>

              {/* Activity + highlights */}
              <div className="grid grid-cols-1 gap-4 @5xl/page:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
                <Panel
                  icon={Activity}
                  title={`${isHourly ? 'Hourly' : 'Daily'} order activity`}
                  subtitle="Completed orders, buy vs sell (IST)"
                  bodyClassName="flex flex-col"
                  actions={
                    <SegmentedToggle ariaLabel="Activity measure" value={activityMetric} onChange={(v) => setActivityMetric(v)} options={METRIC_OPTIONS} />
                  }
                >
                  {chartSeries.length ? (
                    <>
                      <ChartFrame className="min-h-[240px] flex-1">
                        <ActivityChart data={chartSeries} view={seriesView} metric={activityMetric} />
                      </ChartFrame>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <Legend items={[{ color: BUY_COLOR, label: activityMetric === 'volume' ? 'Buy volume' : 'Buy orders' }, { color: SELL_COLOR, label: activityMetric === 'volume' ? 'Sell volume' : 'Sell orders' }]} />
                        <span className="text-[10px] text-muted-foreground">Hover or tap the chart for exact figures</span>
                      </div>
                    </>
                  ) : (
                    <EmptyState icon={Activity} text="No completed Binance orders in selected period" className="min-h-[240px] flex-1" />
                  )}
                </Panel>

                <Panel icon={BarChart3} title="Highlights" subtitle={periodLabel} bodyClassName="@container">
                  <div className="grid grid-cols-1 gap-3 @[30rem]:grid-cols-2">
                    <div className="rounded-md border border-border p-3">
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Scale className="h-3 w-3" aria-hidden="true" /> Buy / sell split</div>
                      <SplitBar className="mt-2" buy={analytics.buyVolume} sell={analytics.sellVolume} />
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <div className="flex items-center gap-1.5 text-muted-foreground"><Swatch color={BUY_COLOR} /> Buy</div>
                          <div className="t-mono text-xs font-semibold tabular-nums text-foreground" title={fmtFullINR(analytics.buyVolume)}>{fmtINR(analytics.buyVolume)} <span className="font-normal text-muted-foreground">{analytics.totalVolume ? `${buyShare.toFixed(0)}%` : ''}</span></div>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center justify-end gap-1.5 text-muted-foreground"><Swatch color={SELL_COLOR} /> Sell</div>
                          <div className="t-mono text-xs font-semibold tabular-nums text-foreground" title={fmtFullINR(analytics.sellVolume)}>{fmtINR(analytics.sellVolume)} <span className="font-normal text-muted-foreground">{analytics.totalVolume ? `${(100 - buyShare).toFixed(0)}%` : ''}</span></div>
                        </div>
                      </div>
                      <div className="mt-2 text-[11px] text-muted-foreground">
                        Imbalance <span className="t-mono font-semibold tabular-nums text-foreground">{analytics.imbalance.toFixed(1)}%</span> · based on completed INR volume
                      </div>
                    </div>

                    <div className="rounded-md border border-border p-3">
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Clock className="h-3 w-3" aria-hidden="true" /> Peak trading {isHourly ? 'hour' : 'day'}</div>
                      <div className="mt-1 text-sm font-semibold text-foreground">{peakBucket ? bucketTitle(peakBucket, seriesView) : pendingText ? 'Loading…' : '—'}</div>
                      <div className="text-[11px] text-muted-foreground">{peakBucket ? plural(peakOrders, 'completed order') : pendingText ? '' : 'No completed orders'}</div>
                    </div>

                    <div className="rounded-md border border-border p-3">
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Trophy className="h-3 w-3" aria-hidden="true" /> Top ad by volume</div>
                      {analytics.bestAd ? (
                        <>
                          <div className="mt-1 flex min-w-0 items-center gap-2">
                            <AdName label={analytics.bestAd.label} tails={adTails} className="truncate t-mono text-sm font-semibold text-foreground" />
                            <SideChip side={analytics.bestAd.tradeType} />
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            <span className="t-mono tabular-nums text-foreground" title={fmtFullINR(analytics.bestAd.volume)}>{fmtINR(analytics.bestAd.volume)}</span> · {plural(analytics.bestAd.count, 'order')} · {analytics.bestAd.asset || 'USDT'}
                          </div>
                        </>
                      ) : (
                        <div className="mt-1 text-sm text-muted-foreground">{pendingText ? 'Loading…' : 'No ad activity'}</div>
                      )}
                    </div>

                    {analytics.appeals.length > 0 && (
                      <div className="rounded-md border border-destructive/25 bg-destructive/5 p-3">
                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-destructive"><AlertTriangle className="h-3 w-3" aria-hidden="true" /> Appeal drag</div>
                        <div className="mt-1 text-sm font-semibold text-foreground">{plural(analytics.appeals.length, 'order')} in appeal</div>
                      </div>
                    )}
                  </div>
                </Panel>
              </div>

              {/* Breakdowns */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="border-b border-border">
                  <TabsList className={TABS_LIST}>
                    <TabsTrigger value="types" className={TABS_TRIGGER}>
                      <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="sm:hidden">Types</span>
                      <span className="hidden sm:inline">Order types</span>
                    </TabsTrigger>
                    <TabsTrigger value="ads" className={TABS_TRIGGER}>
                      <Megaphone className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="sm:hidden">Ads</span>
                      <span className="hidden sm:inline">Ad performance</span>
                    </TabsTrigger>
                    <TabsTrigger value="zones" className={TABS_TRIGGER}><MapIcon className="h-3.5 w-3.5" aria-hidden="true" />Zones</TabsTrigger>
                    <TabsTrigger value="rates" className={TABS_TRIGGER}><Percent className="h-3.5 w-3.5" aria-hidden="true" />Rates</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="types" className="mt-4 space-y-4">
                  <div className="grid grid-cols-1 gap-4 @[70rem]/page:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
                    <Panel icon={Layers} title="Small / big order types" subtitle="Completed orders · select a type to see its coins">
                      <OrderTypesTable
                        items={analytics.orderTypes}
                        selectedKind={selectedOrderKind}
                        onSelect={setSelectedOrderKind}
                        totalVolume={analytics.totalVolume}
                        ranges={kindRanges}
                      />
                    </Panel>
                    <Panel
                      icon={Coins}
                      title="Coin breakdown"
                      subtitle={<span className="inline-flex items-center gap-1.5"><Swatch color={KIND_COLOR[selectedOrderKind]} />{orderKindLabels[selectedOrderKind]} · quantity in effective USDT where valued</span>}
                      bodyClassName="@container"
                    >
                      <CoinBreakdown
                        rows={analytics.orderTypeCoinBreakdown[selectedOrderKind] || []}
                        kind={selectedOrderKind}
                        kindVolume={analytics.orderTypes.find((item) => item.key === selectedOrderKind)?.volume || 0}
                      />
                    </Panel>
                  </div>
                  <Panel
                    icon={Activity}
                    title={`${isHourly ? 'Hourly' : 'Daily'} activity by order type`}
                    subtitle="Completed orders, stacked by type (IST)"
                    actions={
                      <SegmentedToggle ariaLabel="Order type activity measure" value={typeMetric} onChange={(v) => setTypeMetric(v)} options={METRIC_OPTIONS} />
                    }
                  >
                    {chartSeries.length ? (
                      <>
                        <ChartFrame className="h-[280px]">
                          <TypeActivityChart data={chartSeries} view={seriesView} metric={typeMetric} />
                        </ChartFrame>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <Legend items={KIND_ORDER.map((k) => ({ color: KIND_COLOR[k], label: orderKindLabels[k] }))} />
                          <span className="text-[10px] text-muted-foreground">Hover or tap the chart for exact figures</span>
                        </div>
                      </>
                    ) : (
                      <EmptyState icon={Activity} text={`No ${isHourly ? 'hourly' : 'daily'} order type activity in selected period`} className="min-h-[280px]" />
                    )}
                  </Panel>
                </TabsContent>

                <TabsContent value="ads" className="mt-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <SegmentedToggle ariaLabel="Ad side" value={adTradeFilter} onChange={(v) => setAdTradeFilter(v)} options={adSideOptions} />
                    <dl className="grid grid-cols-2 gap-x-5 gap-y-1 text-[11px] text-muted-foreground sm:flex sm:flex-wrap sm:items-center">
                      <div className="flex items-center gap-1.5"><dt>Ads with orders</dt><dd className="t-mono font-semibold tabular-nums text-foreground">{fmtCount(adSideCounts[adTradeFilter])}</dd></div>
                      <div className="flex items-center gap-1.5"><dt>Volume</dt><dd className="t-mono font-semibold tabular-nums text-foreground" title={fmtFullINR(adSideTotals.volume)}>{fmtINR(adSideTotals.volume)}</dd></div>
                      <div className="flex items-center gap-1.5"><dt>Effective quantity</dt><dd className="t-mono font-semibold tabular-nums text-foreground">{fmt(adSideTotals.quantity, 4)}</dd></div>
                      <div className="flex items-center gap-1.5"><dt>Avg rate</dt><dd className="t-mono font-semibold tabular-nums text-foreground">{fmtRate(adTradeFilter === 'BUY' ? analytics.weightedBuyRate : analytics.weightedSellRate)}</dd></div>
                    </dl>
                  </div>
                  <div className="grid grid-cols-1 gap-4 @[72rem]/page:grid-cols-[minmax(0,1.9fr)_minmax(300px,1fr)]">
                    <Panel icon={Megaphone} title={`${adTradeFilter === 'BUY' ? 'Buy' : 'Sell'} volume by ad`} subtitle="Completed orders per ad · select an ad for details">
                      {filteredAdRows.length ? (
                        <AdsTable
                          rows={filteredAdRows}
                          selectedKey={selectedAd?.key}
                          onSelect={setSelectedAdKey}
                          sideVolume={adSideTotals.volume}
                          tails={adTails}
                          renderInlineDetail={renderAdDetail}
                        />
                      ) : (
                        <EmptyState icon={Megaphone} text={`No ${adTradeFilter.toLowerCase()} ad-linked completed orders in selected period`} />
                      )}
                    </Panel>
                    {selectedAd && (
                      <Panel icon={Megaphone} title="Selected ad" className="hidden self-start @[72rem]/page:flex">
                        {renderAdDetail(selectedAd)}
                      </Panel>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="zones" className="mt-4">
                  <Panel icon={MapIcon} title="Market zones" subtitle="Zone as reported by Binance for each ad (never inferred)">
                    <ZonesTable rows={zoneRows} />
                    <div className="mt-3 space-y-1.5 text-[11px] text-muted-foreground">
                      <div>Completion is completed ÷ (completed + cancelled), the same rule as the Completion tile; open orders and appeals count once they finish.</div>
                      <div>Zone not returned by Binance: orders with no ad number, or on ads Binance has never reported a zone for (for example, closed before any state snapshot). Not assumed to be P2P.</div>
                      {zoneHistoryUnavailable && (
                        <div className="flex items-start gap-1.5 text-warning">
                          <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
                          Zone history from earlier ad snapshots couldn't be loaded, so orders on ads that are no longer listed count as zone not returned.
                        </div>
                      )}
                    </div>
                  </Panel>
                </TabsContent>

                <TabsContent value="rates" className="mt-4">
                  <div className="grid grid-cols-1 gap-4 @5xl/page:grid-cols-2">
                    <Panel icon={Scale} title="Buy and sell rates" subtitle="Effective USDT rate of completed orders" bodyClassName="@container">
                      <RateLadder min={analytics.minRate} max={analytics.maxRate} marks={rateMarks} />
                      <div className="mt-4 grid grid-cols-2 gap-2 @[30rem]:grid-cols-3">
                        {[
                          { l: 'Avg buy rate', v: analytics.weightedBuyRate, c: BUY_COLOR },
                          { l: 'Avg sell rate', v: analytics.weightedSellRate, c: SELL_COLOR },
                          { l: 'Avg rate (all)', v: analytics.weightedAvgRate, c: 'hsl(var(--foreground))' },
                          { l: 'Simple avg buy', v: analytics.avgBuyRate },
                          { l: 'Simple avg sell', v: analytics.avgSellRate },
                        ].map((m) => (
                          <div key={m.l} className="rounded-md border border-border px-2.5 py-2">
                            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">{m.c && <Swatch color={m.c} />}{m.l}</div>
                            <div className="t-mono text-sm font-semibold tabular-nums text-foreground">{fmtRate(m.v)}</div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 text-[11px] text-muted-foreground">
                        Avg rate is volume-weighted: INR volume ÷ effective USDT quantity, over completed orders that have a USDT valuation. Simple avg is the plain mean of those orders' rates.
                      </div>
                    </Panel>
                    <Panel icon={Layers} title="Rate by type" subtitle="Completed orders">
                      <div className="@container">
                        <HeaderRow cols={RATE_COLS} showAt="@[30rem]:grid" labels={['Type', 'Avg rate', 'Simple avg', 'Orders', 'Qty (USDT)']} />
                        <div role="list" aria-label="Rate by order type" className="divide-y divide-border">
                          {analytics.orderTypes.map((item) => (
                            <div role="listitem" key={item.key} className={cn('grid grid-cols-2 gap-x-3 gap-y-2 px-2 py-2.5', RATE_COLS, '@[30rem]:items-center')}>
                              <div className="col-span-2 flex items-center gap-2 text-xs font-semibold text-foreground @[30rem]:col-span-1">
                                <Swatch color={KIND_COLOR[item.key as OrderKind]} />
                                {item.label}
                              </div>
                              <Cell label="Avg rate" wide="@[30rem]:sr-only" className="@[30rem]:text-right">{fmtRate(item.weightedRate || item.avgRate)}</Cell>
                              <Cell label="Simple avg" wide="@[30rem]:sr-only" className="@[30rem]:text-right">{fmtRate(item.avgRate)}</Cell>
                              <Cell label="Orders" wide="@[30rem]:sr-only" className="@[30rem]:text-right">{fmtCount(item.count)}</Cell>
                              <Cell label="Qty (USDT)" wide="@[30rem]:sr-only" className="@[30rem]:text-right">{fmt(item.quantity, 4)}</Cell>
                            </div>
                          ))}
                        </div>
                      </div>
                    </Panel>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </PendingContext.Provider>
        )}
      </div>
    </TerminalPermissionGate>
  );
}
