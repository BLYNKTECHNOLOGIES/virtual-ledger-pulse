import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Binance C2C ad status codes
export const BINANCE_AD_STATUS = {
  ONLINE: 1,
  PRIVATE: 2,   // Visible only via direct link
  OFFLINE: 3,   // Binance uses 3 for offline/inactive, NOT 2
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
  priceFloatingRatio?: number;
  initAmount: number;
  surplusAmount: number;
  minSingleTransAmount: number;
  maxSingleTransAmount: number;
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
  buyerRegDaysLimit?: number;
  buyerBtcPositionLimit?: number;
  takerAdditionalKycRequired?: number;
  payTimeLimit?: number;
  onlineNow?: boolean;
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
  return useQuery({
    queryKey: ['binance-ads', filters],
    queryFn: () => callBinanceAds('listAds', filters),
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['binance-ads'] });
      toast({ title: 'Ad Posted', description: 'Your ad has been posted successfully.' });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['binance-ads'] });
      toast({ title: 'Ad Updated', description: 'Your ad has been updated successfully.' });
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
    mutationFn: ({ advNos, advStatus }: { advNos: string[]; advStatus: number }) =>
      callBinanceAds('updateAdStatus', { advNos, advStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['binance-ads'] });
      toast({ title: 'Status Updated', description: 'Ad status has been updated.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to Update Status', description: error.message, variant: 'destructive' });
    },
  });
}
