import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { withActiveAccount } from '@/lib/activeExchangeAccount';
import { useExchangeAccount } from '@/contexts/ExchangeAccountContext';
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
  classify?: 'block' | 'profession' | string;
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
  commissionRate?: string | number;
  takerCommissionRate?: string | number;
  tradeMethodCommissionRateVoList?: Array<{
    commissionRate?: string | number;
    tradeMethodIdentifier?: string;
    tradeMethodName?: string;
  }>;
  autoReplyMsg?: string;
  remarks?: string;
  createTime?: string;
  updateTime?: string;
  buyerRegDaysLimit?: number | string;
  buyerKycLimit?: number | string;
  buyerBtcPositionLimit?: number | string;
  takerAdditionalKycRequired?: number;
  userTradeCompleteRateMin?: number | string;
  userTradeCompleteCountMin?: number | string;
  userTradeVolumeMin?: number | string;
  userTradeVolumeMax?: number | string;
  userBuyTradeCountMin?: number | string;
  userSellTradeCountMin?: number | string;
  userAllTradeCountMin?: number | string;
  userAllTradeCountMax?: number | string;
  payTimeLimit?: number;
  onlineNow?: boolean;
  tags?: string[];
  /** Which exchange account this ad belongs to (set by the merged fetch). */
  _exchangeAccountId?: string;
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

async function callBinanceAds(action: string, payload: Record<string, any> = {}, accountId?: string) {
  const body: Record<string, any> = { action, ...payload };
  // Explicit per-call account override (used for the combined "All accounts" fan-out).
  if (accountId) body.exchange_account_id = accountId;
  const { data, error } = await supabase.functions.invoke('binance-ads', {
    body: withActiveAccount(body),
  });
  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error || 'API call failed');
  return data.data;
}

/**
 * Optimistically patch cached ad rows across EVERY ['binance-ads', ...] query
 * (all accounts/filters permutations). `mapAd` returns a replacement row, or
 * null to leave the row untouched. Returns true if at least one row was patched.
 * Reconciliation still happens via manual RefreshCw / opt-in auto-refresh.
 */
function patchAdsCache(
  queryClient: ReturnType<typeof useQueryClient>,
  mapAd: (ad: any) => any | null,
): boolean {
  let patched = false;
  queryClient.setQueriesData<any>(
    { predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'binance-ads' },
    (old: any) => {
      if (!old?.data || !Array.isArray(old.data)) return old;
      let hit = false;
      const data = old.data.map((ad: any) => {
        const next = mapAd(ad);
        if (next) { hit = true; return next; }
        return ad;
      });
      if (hit) patched = true;
      return hit ? { ...old, data } : old;
    },
  );
  return patched;
}


export function useBinanceAdsList(filters: AdFilters, options?: { refetchInterval?: number | false }) {
  const isAllStatuses = filters.advStatus === undefined || filters.advStatus === null;
  const isPrivateFilter = filters.advStatus === BINANCE_AD_STATUS.PRIVATE;
  const { accountsToQuery } = useExchangeAccount();

  return useQuery({
    queryKey: ['binance-ads', accountsToQuery.join(','), filters],
    queryFn: async () => {
      // Fetch the ad list for ONE account, returning { data, total } in the
      // same shape the UI already expects. `accountId` is stamped onto every
      // outgoing request so combined mode hits each Binance account correctly.
      const fetchForAccount = async (accountId: string): Promise<{ data: any[]; total: number }> => {
        const fetchAds = (pageFilters: AdFilters) => callBinanceAds('listAds', pageFilters, accountId);

        if (isPrivateFilter) {
          // Private ads are returned by the API under advStatus=1, then enriched to 2 by edge fn.
          const result = await fetchAds({ ...filters, advStatus: BINANCE_AD_STATUS.ONLINE });
          const list = result?.data || result?.list || [];
          const privateAds = list.filter((ad: any) => ad.advStatus === BINANCE_AD_STATUS.PRIVATE || ad._isPrivate);
          return { data: privateAds, total: privateAds.length };
        }
        if (!isAllStatuses) {
          const result = await fetchAds(filters);
          if (filters.advStatus === BINANCE_AD_STATUS.ONLINE) {
            const list = result?.data || result?.list || [];
            const onlineOnly = list.filter((ad: any) => ad.advStatus === BINANCE_AD_STATUS.ONLINE && !ad._isPrivate);
            return { data: onlineOnly, total: onlineOnly.length };
          }
          return { data: result?.data || result?.list || [], total: result?.total || 0 };
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
      };

      // Single account → identical to previous behavior. Multiple → fan-out + merge.
      const results = await Promise.all(accountsToQuery.map(fetchForAccount));
      const allAds = results.flatMap((r, i) =>
        (r.data || []).map((ad: any) => ({ ...ad, _exchangeAccountId: accountsToQuery[i] })),
      );
      const total = results.reduce((sum, r) => sum + (r.total || 0), 0);
      return { data: allAds, total: total || allAds.length };
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
    refetchInterval: options?.refetchInterval ?? false,
  });
}

export function useBinanceAdDetail(adsNo: string | null) {
  return useQuery({
    queryKey: ['binance-ad-detail', adsNo],
    queryFn: () => callBinanceAds('getAdDetail', { adsNo }),
    enabled: !!adsNo,
  });
}

export function useAdCommissionSnapshots(advNo: string | null) {
  return useQuery({
    queryKey: ['binance-ad-commission-snapshots', advNo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('binance_commission_rate_snapshots' as any)
        .select('*')
        .eq('adv_no', advNo!)
        .order('captured_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!advNo,
    staleTime: 60 * 1000,
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
    mutationFn: (adData: Record<string, any>) => {
      // Route to the ad's own account when provided (combined "All accounts" mode);
      // otherwise the active-account default applies.
      const { exchange_account_id, ...rest } = adData;
      return callBinanceAds('postAd', { adData: rest }, exchange_account_id);
    },
     onSuccess: (_data, adData) => {
      // Newly created ad isn't in any cache yet → full refetch is required.
      queryClient.invalidateQueries({ queryKey: ['binance-ads'] });
      toast({ title: 'Ad Posted', description: 'Your ad has been posted successfully.' });
      logAdAction({
        actionType: AdActionTypes.AD_CREATED,
        adDetails: { tradeType: adData.tradeType, asset: adData.asset, fiatUnit: adData.fiatUnit, price: adData.price, priceType: adData.priceType, priceFloatingRatio: adData.priceFloatingRatio, initAmount: adData.initAmount, minSingleTransAmount: adData.minSingleTransAmount, maxSingleTransAmount: adData.maxSingleTransAmount, autoReplyMsg: adData.autoReplyMsg, remarks: adData.remarks, tradeMethods: adData.tradeMethods },
        metadata: { exchangeAccountId: adData.exchange_account_id },
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
    mutationFn: (adData: Record<string, any>) => {
      const { exchange_account_id, ...rest } = adData;
      return callBinanceAds('updateAd', { adData: rest }, exchange_account_id);
    },
     onSuccess: (_data, adData) => {
      // Instant UI: patch the changed row(s) across every cached accounts/filters
      // permutation instead of a blanket refetch. Matches by advNo (+ account).
      const patched = patchAdsCache(queryClient, (ad) => {
        if (ad.advNo !== adData.advNo) return null;
        if (adData.exchange_account_id !== undefined && ad._exchangeAccountId !== adData.exchange_account_id) return null;
        const next: any = { ...ad, updateTime: Date.now() };
        if (adData.price !== undefined) next.price = Number(adData.price);
        if (adData.priceFloatingRatio !== undefined) next.priceFloatingRatio = adData.priceFloatingRatio;
        return next;
      });
      // Edge case: row not in any cache → reconcile that query only.
      if (!patched) queryClient.invalidateQueries({ queryKey: ['binance-ads'] });
      toast({ title: 'Ad Updated', description: 'Your ad has been updated successfully.' });
      const isFloating = adData.priceFloatingRatio !== undefined;
      logAdAction({
        actionType: AdActionTypes.AD_UPDATED,
        advNo: adData.advNo,
        adDetails: {
          tradeType: adData.tradeType, asset: adData.asset, price: adData.price, priceType: adData.priceType, priceFloatingRatio: adData.priceFloatingRatio, initAmount: adData.initAmount, minSingleTransAmount: adData.minSingleTransAmount, maxSingleTransAmount: adData.maxSingleTransAmount, autoReplyMsg: adData.autoReplyMsg, remarks: adData.remarks, tradeMethods: adData.tradeMethods,
          ...(adData.oldPrice !== undefined ? { oldPrice: adData.oldPrice, newPrice: adData.price } : {}),
          ...(isFloating && adData.oldRatio !== undefined ? { oldRatio: adData.oldRatio, newRatio: adData.priceFloatingRatio } : {}),
        },
        metadata: { exchangeAccountId: adData.exchange_account_id },
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
     mutationFn: ({ advNos, advStatus, fromPrivate, exchangeAccountId }: { advNos: string[]; advStatus: number; fromPrivate?: boolean; exchangeAccountId?: string; fromStatus?: number }) =>
      callBinanceAds('updateAdStatus', { advNos, advStatus, fromPrivate }, exchangeAccountId),
    onSuccess: (_data, vars) => {
      clearAdBreakDetected();
      // Instant UI: patch advStatus on the affected rows across all caches.
      const targets = new Set(vars.advNos);
      const patched = patchAdsCache(queryClient, (ad) => {
        if (!targets.has(ad.advNo)) return null;
        if (vars.exchangeAccountId !== undefined && ad._exchangeAccountId !== vars.exchangeAccountId) return null;
        return { ...ad, advStatus: vars.advStatus, updateTime: Date.now() };
      });
      if (!patched) queryClient.invalidateQueries({ queryKey: ['binance-ads'] });
      toast({ title: 'Status Updated', description: 'Ad status has been updated.' });
      const actionType = vars.advNos.length > 1 ? AdActionTypes.AD_BULK_STATUS_CHANGED : AdActionTypes.AD_STATUS_CHANGED;
      for (const advNo of vars.advNos) {
        logAdAction({
          actionType,
          advNo,
          metadata: { fromStatus: vars.fromStatus, toStatus: vars.advStatus, fromPrivate: vars.fromPrivate, advNos: vars.advNos, adsCount: vars.advNos.length, exchangeAccountId: vars.exchangeAccountId },
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

export function useApplyAdRiskGuard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ advNos, profileName, riskPayload, exchangeAccountId }: { advNos: string[]; profileName: string; riskPayload: Record<string, any>; exchangeAccountId?: string }) =>
      callBinanceAds('applyAdRiskGuard', { advNos, profileName, riskPayload }, exchangeAccountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['binance-ads'] });
      toast({ title: 'Risk Guard Applied', description: 'Selected ads were updated through Binance.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Risk Guard Failed', description: error.message, variant: 'destructive' });
    },
  });
}
