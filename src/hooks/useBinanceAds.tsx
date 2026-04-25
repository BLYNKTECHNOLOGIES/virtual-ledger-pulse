import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logAdAction, AdActionTypes } from '@/hooks/useAdActionLog';
import { clearAdBreakDetected, markAdBreakDetected } from '@/hooks/useAdRestTimer';

// Binance C2C ad status codes
// Binance API returns advStatus: 1 for both Online and Private ads.
// Our edge function enriches Private ads (advVisibleRet.userSetVisible=1) by setting advStatus=2.
// Native API status 3 = offline/inactive.
export const BINANCE_AD_STATUS = {
  ONLINE: 1,
  PRIVATE: 2,   // Set by our edge function when userSetVisible=1 (visible only via direct link)
  OFFLINE: 3,   // Binance uses 3 for offline/inactive
} as const;

export function getAdStatusLabel(status: number): string {
  switch (status) {
    case BINANCE_AD_STATUS.ONLINE: return 'Active';
    case BINANCE_AD_STATUS.PRIVATE: return 'Private';
    case BINANCE_AD_STATUS.OFFLINE: return 'Inactive';
    default: return `Unknown (${status})`;
  }
}

export function getAdStatusVariant(status: number): 'default' | 'secondary' | 'outline' {
  switch (status) {
    case BINANCE_AD_STATUS.ONLINE: return 'default';
    case BINANCE_AD_STATUS.PRIVATE: return 'outline';
    default: return 'secondary';
  }
}

export interface BinanceAd {
  advNo: string;
  advStatus: number; // 1 = online, 2 = private, 3 = offline
  asset: string;
  fiatUnit: string;
  tradeType: string; // BUY or SELL
  price: number;
  priceType: number; // 1 = fixed, 2 = floating
  priceFloatingRatio?: number | string;
  initAmount: number | string;
  surplusAmount: number | string;
  minSingleTransAmount: number | string;
  maxSingleTransAmount: number | string;
  tradeMethods: Array<{
    payId: number;
    payType: string;
    identifier: string;
    tradeMethodName?: string;
  }>;
  autoReplyMsg?: string;
  remarks?: string;
  createTime?: string;
  updateTime?: string;
  buyerRegDaysLimit?: number | string;
  buyerBtcPositionLimit?: number | string;
  takerAdditionalKycRequired?: number;
  payTimeLimit?: number;
  onlineNow?: boolean;
  tags?: string[];
}

export interface AdFilters {
  asset?: string;
  tradeType?: string;
  advStatus?: number | null;
  priceType?: number | null;
  startDate?: string;
  endDate?: string;
  page?: number;
  rows?: number;
  fetchAll?: boolean;
}

async function callBinanceAds(action: string, payload: Record<string, any> = {}) {
  const { data, error } = await supabase.functions.invoke('binance-ads', {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error || 'API call failed');
  return data.data;
}

export function useBinanceAdsList(filters: AdFilters) {
  const isAllStatuses = filters.advStatus === undefined || filters.advStatus === null;
  const isPrivateFilter = filters.advStatus === BINANCE_AD_STATUS.PRIVATE;

  return useQuery({
    queryKey: ['binance-ads', filters],
    queryFn: async () => {
      const fetchPage = (pageFilters: AdFilters) => callBinanceAds('listAds', pageFilters);
      const fetchAds = async (pageFilters: AdFilters) => {
        if (!filters.fetchAll) return fetchPage(pageFilters);

        const pageSize = pageFilters.rows || 50;
        const first = await fetchPage({ ...pageFilters, page: 1, rows: pageSize });
        const list = first?.data || first?.list || [];
        const totalCount = Number(first?.total || list.length);
        const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

        if (totalPages === 1) return { data: list, total: totalCount || list.length };

        const rest = await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, index) =>
            fetchPage({ ...pageFilters, page: index + 2, rows: pageSize })
          )
        );
        const allAds = [list, ...rest.map((result: any) => result?.data || result?.list || [])].flat();
        return { data: allAds, total: totalCount || allAds.length };
      };

      if (isPrivateFilter) {
        // Private ads are returned by the API under advStatus=1, then enriched to 2 by edge fn.
        // So we fetch advStatus=1 and filter for only the private ones.
        const result = await fetchAds({ ...filters, advStatus: BINANCE_AD_STATUS.ONLINE });
        const list = result?.data || result?.list || [];
        const privateAds = list.filter((ad: any) => ad.advStatus === BINANCE_AD_STATUS.PRIVATE || ad._isPrivate);
        return { data: privateAds, total: privateAds.length };
      }
      if (!isAllStatuses) {
        // For Active tab (status 1), fetch and filter out private ads
        const result = await fetchAds(filters);
        if (filters.advStatus === BINANCE_AD_STATUS.ONLINE) {
          const list = result?.data || result?.list || [];
          const onlineOnly = list.filter((ad: any) => ad.advStatus === BINANCE_AD_STATUS.ONLINE && !ad._isPrivate);
          return { data: onlineOnly, total: onlineOnly.length };
        }
        return result;
      }
      // Fetch online/private (advStatus=1, enriched by edge fn) and offline (3) in parallel
      const [onlineAndPrivate, offline] = await Promise.all([
        fetchAds({ ...filters, advStatus: BINANCE_AD_STATUS.ONLINE }),
        fetchAds({ ...filters, advStatus: BINANCE_AD_STATUS.OFFLINE }),
      ]);
      const mergeList = (r: any) => r?.data || r?.list || [];
      const allAds = [...mergeList(onlineAndPrivate), ...mergeList(offline)];
      const totalCount = (onlineAndPrivate?.total || 0) + (offline?.total || 0);
      return { data: allAds, total: totalCount || allAds.length };
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useBinanceAdDetail(adsNo: string | null) {
  return useQuery({
    queryKey: ['binance-ad-detail', adsNo],
    queryFn: () => callBinanceAds('getAdDetail', { adsNo }),
    enabled: !!adsNo,
  });
}

export function useBinanceReferencePrice(asset: string, tradeType: string) {
  return useQuery({
    queryKey: ['binance-ref-price', asset, tradeType],
    queryFn: () => callBinanceAds('getReferencePrice', { assets: [asset], tradeType }),
    staleTime: 15 * 1000, // 15s — price ranges change frequently
    refetchInterval: 60 * 1000, // Auto-refresh every 60s
  });
}

export function useBinanceDigitalCurrencies() {
  return useQuery({
    queryKey: ['binance-digital-currencies'],
    queryFn: () => callBinanceAds('getDigitalCurrencyList'),
    staleTime: 10 * 60 * 1000, // 10 min cache
  });
}

export function useBinancePaymentMethods() {
  return useQuery({
    queryKey: ['binance-payment-methods'],
    queryFn: () => callBinanceAds('getPaymentMethods'),
    staleTime: 5 * 60 * 1000,
  });
}

export function usePostAd() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (adData: Record<string, any>) => callBinanceAds('postAd', { adData }),
    onSuccess: (_data, adData) => {
      queryClient.invalidateQueries({ queryKey: ['binance-ads'] });
      toast({ title: 'Ad Posted', description: 'Your ad has been posted successfully.' });
      logAdAction({
        actionType: AdActionTypes.AD_CREATED,
        adDetails: { tradeType: adData.tradeType, asset: adData.asset, fiatUnit: adData.fiatUnit, price: adData.price, priceType: adData.priceType, priceFloatingRatio: adData.priceFloatingRatio, initAmount: adData.initAmount, minSingleTransAmount: adData.minSingleTransAmount, maxSingleTransAmount: adData.maxSingleTransAmount, autoReplyMsg: adData.autoReplyMsg, remarks: adData.remarks, tradeMethods: adData.tradeMethods },
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to Post Ad', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateAd() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (adData: Record<string, any>) => callBinanceAds('updateAd', { adData }),
    onSuccess: (_data, adData) => {
      queryClient.invalidateQueries({ queryKey: ['binance-ads'] });
      toast({ title: 'Ad Updated', description: 'Your ad has been updated successfully.' });
      logAdAction({
        actionType: AdActionTypes.AD_UPDATED,
        advNo: adData.advNo,
        adDetails: { tradeType: adData.tradeType, asset: adData.asset, price: adData.price, priceType: adData.priceType, priceFloatingRatio: adData.priceFloatingRatio, initAmount: adData.initAmount, minSingleTransAmount: adData.minSingleTransAmount, maxSingleTransAmount: adData.maxSingleTransAmount, autoReplyMsg: adData.autoReplyMsg, remarks: adData.remarks, tradeMethods: adData.tradeMethods },
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to Update Ad', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateAdStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ advNos, advStatus, fromPrivate }: { advNos: string[]; advStatus: number; fromPrivate?: boolean }) =>
      callBinanceAds('updateAdStatus', { advNos, advStatus, fromPrivate }),
    onSuccess: (_data, vars) => {
      clearAdBreakDetected();
      queryClient.invalidateQueries({ queryKey: ['binance-ads'] });
      toast({ title: 'Status Updated', description: 'Ad status has been updated.' });
      const actionType = vars.advNos.length > 1 ? AdActionTypes.AD_BULK_STATUS_CHANGED : AdActionTypes.AD_STATUS_CHANGED;
      for (const advNo of vars.advNos) {
        logAdAction({
          actionType,
          advNo,
          metadata: { toStatus: vars.advStatus, fromPrivate: vars.fromPrivate, advNos: vars.advNos, adsCount: vars.advNos.length },
        });
      }
    },
    onError: (error: Error) => {
      if (/break|rest/i.test(error.message)) {
        markAdBreakDetected(error.message);
      }
      toast({ title: 'Failed to Update Status', description: error.message, variant: 'destructive' });
    },
  });
}
