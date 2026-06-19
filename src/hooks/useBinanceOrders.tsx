import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { withActiveAccount } from '@/lib/activeExchangeAccount';

export interface C2COrderHistoryItem {
  orderNumber: string;
  advNo: string;
  tradeType: string;
  asset: string;
  fiatUnit: string;
  orderStatus: string;
  amount: string;
  totalPrice: string;
  unitPrice: string;
  commission: string;
  counterPartNickName: string;
  createTime: number;
  payMethodName?: string;
  complaintStatus?: string | null;
  hasActiveComplaint?: boolean;
}

interface OrderHistoryFilters {
  tradeType?: string;
  startTimestamp?: number;
  endTimestamp?: number;
  page?: number;
  rows?: number;
}

async function callBinanceAds(action: string, payload: Record<string, any> = {}) {
  const { data, error } = await supabase.functions.invoke('binance-ads', {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error || 'API call failed');
  return data.data;
}

export function useBinanceOrderHistory(filters: OrderHistoryFilters) {
  return useQuery({
    queryKey: ['binance-order-history', filters],
    queryFn: () => callBinanceAds('getOrderHistory', filters),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
}

// Stale-active cutoff: P2P orders auto-cancel within minutes; anything still
// "active" after 24h is almost certainly a stale cached row.
const STALE_ACTIVE_CUTOFF_MS = 24 * 60 * 60 * 1000;

function isFinalStatus(s: string): boolean {
  return s.includes('COMPLETED') || s.includes('RELEASED') ||
    s.includes('CANCEL') || s.includes('EXPIRED') || s.includes('TIMEOUT');
}

function isAppealStatus(s: string): boolean {
  return s.includes('APPEAL') || s.includes('DISPUTE') || s.includes('COMPLAINT');
}

/**
 * Compute dashboard stats from order history.
 * @param orders   The orders within the user-selected filter window.
 * @param window   Optional active filter window. If provided, "completed in
 *                 period" uses these bounds instead of "today (browser local)".
 */
export function computeOrderStats(
  orders: C2COrderHistoryItem[],
  window?: { startTimestamp: number; endTimestamp: number },
) {
  const now = Date.now();
  const periodStart = window?.startTimestamp;
  const periodEnd = window?.endTimestamp;

  let activeOrders = 0;
  let awaitingPayment = 0;
  let awaitingRelease = 0;
  let completedInPeriod = 0;
  let appeals = 0;
  let totalBuyVolume = 0;
  let totalSellVolume = 0;
  let completedCount = 0;
  let cancelledCount = 0;
  let expiredCount = 0;
  let buyCount = 0;
  let sellCount = 0;

  for (const o of orders) {
    const status = (o.orderStatus || '').toUpperCase();
    const price = parseFloat(o.totalPrice || '0');
    const ageMs = now - (o.createTime || 0);
    const isStaleActive = ageMs > STALE_ACTIVE_CUTOFF_MS;

    // Final-state buckets
    if (status.includes('COMPLETED') || status.includes('RELEASED')) {
      completedCount++;
      if (o.tradeType === 'BUY') { totalBuyVolume += price; buyCount++; }
      else { totalSellVolume += price; sellCount++; }

      if (periodStart !== undefined && periodEnd !== undefined) {
        if (o.createTime >= periodStart && o.createTime <= periodEnd) {
          completedInPeriod++;
        }
      }
    } else if (status.includes('CANCEL')) {
      cancelledCount++;
    } else if (status.includes('EXPIRED') || status.includes('TIMEOUT')) {
      expiredCount++;
    } else if (!isStaleActive) {
      // Live (non-final, non-stale) workflow states
      activeOrders++;
      if (status.includes('BUYER_PAYED') || status.includes('BUYER_PAID')) {
        awaitingRelease++;
      } else if (status.includes('TRADING') || status.includes('PENDING')) {
        awaitingPayment++;
      }
    }

    // Appeals: status-based OR active complaint flag (catches appeals on completed orders)
    if (isAppealStatus(status) || o.hasActiveComplaint) {
      appeals++;
    }
  }

  const totalVolume = totalBuyVolume + totalSellVolume;
  const avgOrderSize = completedCount > 0 ? totalVolume / completedCount : 0;
  const finalStateTotal = completedCount + cancelledCount + expiredCount;
  const completionRate = finalStateTotal > 0 ? (completedCount / finalStateTotal) * 100 : 0;
  const buySellRatio = `${buyCount} / ${sellCount}`;

  return {
    activeOrders,
    awaitingPayment,
    awaitingRelease,
    // Backwards-compat alias for any caller still reading pendingPayments
    pendingPayments: awaitingPayment + awaitingRelease,
    completedInPeriod,
    // Backwards-compat alias
    completedToday: completedInPeriod,
    appeals,
    totalBuyVolume, totalSellVolume,
    totalVolume, avgOrderSize, completionRate, buySellRatio,
    completedCount, cancelledCount, expiredCount,
  };
}
