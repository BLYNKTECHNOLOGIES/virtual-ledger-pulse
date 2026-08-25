import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdZone } from '@/lib/adZone';

/**
 * One competitor row exactly as returned by the live Binance public search
 * (`searchP2PMerchant` in the `binance-ads` edge function). No inferred or
 * synthesized fields — anything Binance omits stays null.
 */
export interface ZoneBookRow {
  nickName?: string | null;
  price?: string | number | null;
  surplusAmount?: string | number | null;
  tradeType?: string | null;
  asset?: string | null;
  fiatUnit?: string | null;
  completionRate?: string | number | null;
  orderCount?: number | null;
  userType?: string | null;
  isOnline?: boolean | null;
  userIdentity?: string | null;
  badges?: string[];
  vipLevel?: number | null;
  userNo?: string | null;
  classify?: string | null;
  zone?: AdZone;
  priceType?: number | null;
  minSingleTransAmount?: string | number | null;
  maxSingleTransAmount?: string | number | null;
  payTypes?: string[];
}

export interface ZoneBookResult {
  merchants: ZoneBookRow[];
  zone: AdZone;
  classifies: string[];
  pagesFetched: number;
  count: number;
}

interface ZoneBookParams {
  asset: string;
  fiat?: string;
  /** OUR side — the edge function flips it to the Binance search side. */
  tradeType: 'BUY' | 'SELL';
  zone: AdZone;
  /** Ticket size (transAmount) so the book reflects the size we actually trade. */
  minAmount?: string | number | null;
  /** Book depth in Binance pages (20 ads per page). */
  maxPages?: number;
  enabled?: boolean;
  refetchInterval?: number | false;
}

async function fetchZoneBook(p: ZoneBookParams): Promise<ZoneBookResult> {
  const { data, error } = await supabase.functions.invoke('binance-ads', {
    body: {
      action: 'searchP2PMerchant',
      asset: p.asset,
      fiat: p.fiat || 'INR',
      tradeType: p.tradeType,
      zone: p.zone,
      minAmount: p.minAmount || undefined,
      // Book view wants the visible book, not a single target — one page is the
      // top of the book and keeps rate-limit pressure low.
      maxPages: p.maxPages && p.maxPages > 0 ? p.maxPages : 1,
    },
  });
  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error || 'Zone book fetch failed');
  const res = data.data || {};
  return {
    merchants: Array.isArray(res.merchants) ? res.merchants : [],
    zone: p.zone,
    classifies: res.classifies || [],
    pagesFetched: res.pagesFetched ?? 0,
    count: res.count ?? 0,
  };
}

export function useZoneBook(params: ZoneBookParams) {
  return useQuery({
    queryKey: ['zone-book', params.asset, params.fiat || 'INR', params.tradeType, params.zone, params.minAmount || '', params.maxPages || 1],
    queryFn: () => fetchZoneBook(params),
    enabled: params.enabled !== false && !!params.asset,
    refetchInterval: params.refetchInterval ?? false,
    staleTime: 15_000,
  });
}

/**
 * Where our price would sit in a book. Sell books are ranked cheapest-first,
 * buy books highest-first — the same ordering Binance shows to counterparties.
 */
export function rankInBook(
  rows: ZoneBookRow[],
  ourPrice: number | null,
  side: 'BUY' | 'SELL',
): { rank: number | null; topPrice: number | null; spread: number | null } {
  const prices = rows
    .map((r) => Number(r.price))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (prices.length === 0) return { rank: null, topPrice: null, spread: null };
  const sorted = [...prices].sort((a, b) => (side === 'SELL' ? a - b : b - a));
  const topPrice = sorted[0];
  if (ourPrice == null || !Number.isFinite(ourPrice)) {
    return { rank: null, topPrice, spread: null };
  }
  const better = sorted.filter((p) => (side === 'SELL' ? p < ourPrice : p > ourPrice)).length;
  return {
    rank: better + 1,
    topPrice,
    spread: Number((ourPrice - topPrice).toFixed(4)),
  };
}
