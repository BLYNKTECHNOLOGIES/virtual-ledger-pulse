import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ---- Generic Binance API caller ----
export async function callBinanceAds(action: string, payload: Record<string, any> = {}) {
  const { data, error } = await supabase.functions.invoke('binance-ads', {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error || 'API call failed');
  return data.data;
}

// ==================== ORDER ACTIONS ====================

/** Mark order as paid */
export function useMarkOrderAsPaid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderNumber, payId }: { orderNumber: string; payId?: number }) => {
      return callBinanceAds('markOrderAsPaid', { orderNumber, payId });
    },
    onSuccess: () => {
      toast.success('Order marked as paid');
      queryClient.invalidateQueries({ queryKey: ['binance-order-history'] });
      queryClient.invalidateQueries({ queryKey: ['p2p-orders'] });
      queryClient.invalidateQueries({ queryKey: ['binance-active-orders'] });
    },
    onError: (err: Error) => toast.error(`Mark as paid failed: ${err.message}`),
  });
}

/** Release crypto (requires 2FA code) */
export function useReleaseCoin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      orderNumber: string;
      authType?: string;
      code?: string;
      emailVerifyCode?: string;
      googleVerifyCode?: string;
      mobileVerifyCode?: string;
    }) => {
      return callBinanceAds('releaseCoin', params);
    },
    onSuccess: () => {
      toast.success('Crypto released successfully');
      queryClient.invalidateQueries({ queryKey: ['binance-order-history'] });
      queryClient.invalidateQueries({ queryKey: ['p2p-orders'] });
      queryClient.invalidateQueries({ queryKey: ['binance-active-orders'] });
    },
    onError: (err: Error) => toast.error(`Release failed: ${err.message}`),
  });
}

/** Cancel order */
export function useCancelOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      orderNumber: string;
      orderCancelReasonCode?: number;
      orderCancelAdditionalInfo?: string;
    }) => {
      return callBinanceAds('cancelOrder', params);
    },
    onSuccess: () => {
      toast.success('Order cancelled');
      queryClient.invalidateQueries({ queryKey: ['binance-order-history'] });
      queryClient.invalidateQueries({ queryKey: ['p2p-orders'] });
      queryClient.invalidateQueries({ queryKey: ['binance-active-orders'] });
    },
    onError: (err: Error) => toast.error(`Cancel failed: ${err.message}`),
  });
}

/** Check if cancellation is allowed */
export function useCheckCancelAllowed() {
  return useMutation({
    mutationFn: async (orderNumber: string) => {
      return callBinanceAds('checkIfAllowedCancelOrder', { orderNumber });
    },
  });
}

// ==================== ACTIVE ORDERS ====================

export function useBinanceActiveOrders(filters?: { tradeType?: string; asset?: string }) {
  return useQuery({
    queryKey: ['binance-active-orders', filters],
    queryFn: () => callBinanceAds('listActiveOrders', { ...filters, rows: 50 }),
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000, // Poll every 30s for active orders
  });
}

// ==================== ORDER DETAIL ====================

export function useBinanceOrderDetail(orderNumber: string | null) {
  return useQuery({
    queryKey: ['binance-order-detail', orderNumber],
    queryFn: () => callBinanceAds('getOrderDetail', { orderNumber }),
    enabled: !!orderNumber,
    staleTime: 10 * 1000,
    retry: 1, // Don't retry excessively if endpoint is blocked
  });
}

/** Fetch single-order status from order history (reliable fallback) */
export function useBinanceOrderLiveStatus(orderNumber: string | null) {
  return useQuery({
    queryKey: ['binance-order-live-status', orderNumber],
    queryFn: async () => {
      // Use getOrderHistory with a wide window — it returns orderStatus as a string
      const result = await callBinanceAds('getOrderHistory', {
        rows: 100,
        startTimestamp: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days
        endTimestamp: Date.now(),
      });
      const orders = result?.data || result || [];
      if (!Array.isArray(orders)) return null;
      return orders.find((o: any) => o.orderNumber === orderNumber) || null;
    },
    enabled: !!orderNumber,
    staleTime: 15 * 1000,
    refetchInterval: 20 * 1000, // Poll every 20s for status changes
  });
}

// ==================== COUNTERPARTY STATS ====================

export function useCounterpartyBinanceStats(orderNumber: string | null) {
  return useQuery({
    queryKey: ['binance-counterparty-stats', orderNumber],
    queryFn: () => callBinanceAds('queryCounterPartyStats', { orderNumber }),
    enabled: !!orderNumber,
    staleTime: 60 * 1000,
  });
}

// ==================== CHAT ====================

export interface BinanceChatMessage {
  id: number;
  chatMessageType: string; // "text" | "image"
  message?: string;
  imageUrl?: string;
  createTime: number;
  senderUserId?: number;
  receiverUserId?: number;
}

export function useBinanceChatMessages(orderNo: string | null) {
  return useQuery({
    queryKey: ['binance-chat-messages', orderNo],
    queryFn: async () => {
      const result = await callBinanceAds('getChatMessages', { 
        orderNo, 
        page: 1, 
        rows: 50,
        sort: 'asc',
      });
      return result;
    },
    enabled: !!orderNo,
    staleTime: 5 * 1000,
    refetchInterval: 10 * 1000, // Poll chat every 10s
  });
}

export function useChatCredential() {
  return useQuery({
    queryKey: ['binance-chat-credential'],
    queryFn: () => callBinanceAds('getChatCredential'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useGetChatImageUploadUrl() {
  return useMutation({
    mutationFn: async (imageName: string) => {
      return callBinanceAds('getChatImageUploadUrl', { imageName });
    },
  });
}

export function useMarkMessagesRead() {
  return useMutation({
    mutationFn: async ({ orderNo, userId }: { orderNo: string; userId?: number }) => {
      return callBinanceAds('markOrderMessagesRead', { orderNo, userId });
    },
  });
}

// ==================== MERCHANT ====================

export function useMerchantOnline() {
  return useMutation({
    mutationFn: () => callBinanceAds('merchantOnline'),
    onSuccess: () => toast.success('Merchant is now online'),
    onError: (err: Error) => toast.error(`Failed: ${err.message}`),
  });
}

export function useMerchantOffline() {
  return useMutation({
    mutationFn: () => callBinanceAds('merchantOffline'),
    onSuccess: () => toast.success('Merchant is now offline'),
    onError: (err: Error) => toast.error(`Failed: ${err.message}`),
  });
}

// ==================== USER SUMMARY ====================

export function useUserOrderSummary() {
  return useQuery({
    queryKey: ['binance-user-order-summary'],
    queryFn: () => callBinanceAds('getUserOrderSummary'),
    staleTime: 60 * 1000,
  });
}

export function useBinanceUserDetail() {
  return useQuery({
    queryKey: ['binance-user-detail'],
    queryFn: () => callBinanceAds('getUserDetail'),
    staleTime: 5 * 60 * 1000,
  });
}
