import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface C2COrderHistoryItem {
  orderNumber: string;
  advNo: string;
  tradeType: string; // BUY or SELL
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
  // Binance responses nest data in result.data for paginated endpoints
  const result = data.data;
  return result;
}

export function useBinanceOrderHistory(filters: OrderHistoryFilters) {
  return useQuery({
    queryKey: ['binance-order-history', filters],
    queryFn: () => callBinanceAds('getOrderHistory', filters),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
}

/** Compute dashboard stats from order history data */
export function computeOrderStats(orders: C2COrderHistoryItem[]) {
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  let activeOrders = 0;
  let pendingPayments = 0;
  let completedToday = 0;
  let appeals = 0;
  let totalBuyVolume = 0;
  let totalSellVolume = 0;

  for (const o of orders) {
    const status = (o.orderStatus || '').toUpperCase();
    const price = parseFloat(o.totalPrice || '0');

    // Active = not terminal
    if (['TRADING', 'BUYER_PAYED', 'PENDING'].some(s => status.includes(s))) {
      activeOrders++;
    }
    if (status.includes('PENDING') || status === 'TRADING') {
      pendingPayments++;
    }
    if (status.includes('COMPLETED') && o.createTime >= todayStart.getTime()) {
      completedToday++;
    }
    if (status.includes('APPEAL') || status.includes('COMPLAINT')) {
      appeals++;
    }

    if (status.includes('COMPLETED')) {
      if (o.tradeType === 'BUY') totalBuyVolume += price;
      else totalSellVolume += price;
    }
  }

  return { activeOrders, pendingPayments, completedToday, appeals, totalBuyVolume, totalSellVolume };
}
