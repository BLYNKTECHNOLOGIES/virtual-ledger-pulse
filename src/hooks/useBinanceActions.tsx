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
      // IMPORTANT: match the actual queryKey used by useBinanceOrderHistory()
      queryClient.invalidateQueries({ queryKey: ['binance-order-history-bulk'] });
      queryClient.invalidateQueries({ queryKey: ['p2p-orders'] });
      queryClient.invalidateQueries({ queryKey: ['binance-active-orders'] });
    },
    onError: (err: Error) => toast.error(`Mark as paid failed: ${err.message}`),
  });
}

/** Release crypto (requires 2FA code - supports Google, FIDO2/Passkey, Email, Mobile, Yubikey) */
export function useReleaseCoin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      orderNumber: string;
      authType?: string;
      code?: string;
      confirmPaidType?: string;
      emailVerifyCode?: string;
      googleVerifyCode?: string;
      mobileVerifyCode?: string;
      yubikeyVerifyCode?: string;
      payId?: number;
    }) => {
      return callBinanceAds('releaseCoin', params);
    },
    onSuccess: () => {
      toast.success('Crypto released successfully');
      // IMPORTANT: match the actual queryKey used by useBinanceOrderHistory()
      queryClient.invalidateQueries({ queryKey: ['binance-order-history-bulk'] });
      queryClient.invalidateQueries({ queryKey: ['p2p-orders'] });
      queryClient.invalidateQueries({ queryKey: ['binance-active-orders'] });
      queryClient.invalidateQueries({ queryKey: ['binance-order-detail'] });
    },
    onError: (err: Error) => toast.error(`Release failed: ${err.message}`),
  });
}

/** Check if release is allowed (pre-validation) */
export function useCheckIfCanRelease() {
  return useMutation({
    mutationFn: async (params: {
      orderNumber: string;
      authType?: string;
      code?: string;
      confirmPaidType?: string;
      emailVerifyCode?: string;
      googleVerifyCode?: string;
      mobileVerifyCode?: string;
      yubikeyVerifyCode?: string;
      payId?: number;
    }) => {
      return callBinanceAds('checkIfCanRelease', params);
    },
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
      // IMPORTANT: match the actual queryKey used by useBinanceOrderHistory()
      queryClient.invalidateQueries({ queryKey: ['binance-order-history-bulk'] });
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

/** Confirm order verified (seller verifies buyer identity before showing payment details) */
export function useConfirmOrderVerified() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderNumber }: { orderNumber: string }) => {
      return callBinanceAds('confirmOrderVerified', { orderNumber });
    },
    onSuccess: () => {
      toast.success('Order verified — payment details shared with buyer');
      queryClient.invalidateQueries({ queryKey: ['binance-active-orders'] });
      queryClient.invalidateQueries({ queryKey: ['binance-order-detail'] });
    },
    onError: (err: Error) => toast.error(`Verification failed: ${err.message}`),
  });
}

// ==================== ACTIVE ORDERS ====================

export function useBinanceActiveOrders(filters?: { tradeType?: string; asset?: string }) {
  return useQuery({
    queryKey: ['binance-active-orders', filters],
    queryFn: () => callBinanceAds('listActiveOrders', { ...filters, rows: 50 }),
    staleTime: 5 * 1000,
    refetchInterval: 10 * 1000, // Poll every 10s to catch status changes quickly
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
      // Response shape: { data: { code, data: [...orders] } }
      const orders = result?.data?.data || result?.data || result || [];
      if (!Array.isArray(orders)) return null;
      return orders.find((o: any) => o.orderNumber === orderNumber) || null;
    },
    enabled: !!orderNumber,
    staleTime: 15 * 1000,
    refetchInterval: 20 * 1000, // Poll every 20s for status changes
  });
}

/** Fetch order history from the local binance_order_history DB table (fast, no API calls).
 *  Falls back to empty array if DB is unavailable. */
export function useBinanceOrderHistory() {
  return useQuery({
    queryKey: ['binance-order-history-bulk'],
    queryFn: async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      const batchSize = 1000;
      const allOrders: any[] = [];
      let offset = 0;
      let hasMore = true;

      // Paginate to bypass the 1000-row default limit
      while (hasMore) {
        const { data, error } = await supabase
          .from('binance_order_history')
          .select('order_number, adv_no, trade_type, asset, fiat_unit, amount, total_price, unit_price, commission, order_status, create_time, pay_method_name, counter_part_nick_name, verified_name, raw_data')
          .order('create_time', { ascending: false })
          .range(offset, offset + batchSize - 1);

        if (error) {
          console.error('[OrderHistory] DB fetch error:', error);
          break;
        }

        if (data && data.length > 0) {
          for (const row of data) {
            allOrders.push({
              orderNumber: row.order_number,
              advNo: row.adv_no,
              tradeType: row.trade_type,
              asset: row.asset || 'USDT',
              fiat: row.fiat_unit || 'INR',
              fiatUnit: row.fiat_unit || 'INR',
              amount: row.amount,
              totalPrice: row.total_price,
              unitPrice: row.unit_price,
              commission: row.commission,
              orderStatus: row.order_status,
              createTime: row.create_time,
              payMethodName: row.pay_method_name,
              counterPartNickName: row.counter_part_nick_name,
              verifiedName: row.verified_name,
              additionalKycVerify: (row.raw_data as any)?.additionalKycVerify ?? 0,
            });
          }
          offset += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      console.log(`[OrderHistory] Loaded ${allOrders.length} orders from DB`);
      return allOrders;
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
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

// Count completed orders with a specific counterparty from synced history
// Uses verified_name for matching since counter_part_nick_name is masked in history
export function useCounterpartyCompletedOrderCount(
  verifiedName: string | null | undefined,
  currentOrderNumber?: string
) {
  return useQuery({
    queryKey: ['counterparty-completed-count', verifiedName, currentOrderNumber],
    queryFn: async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      let query = supabase
        .from('binance_order_history')
        .select('*', { count: 'exact', head: true })
        .eq('verified_name', verifiedName!)
        .eq('order_status', 'COMPLETED');
      
      // Exclude current order so count reflects only past trades
      if (currentOrderNumber) {
        query = query.neq('order_number', currentOrderNumber);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!verifiedName && verifiedName.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

// ==================== CHAT ====================

export interface BinanceChatMessage {
  id: number;
  type: string; // "text" | "image" | "system"
  content?: string;
  message?: string; // legacy fallback
  imageUrl?: string;
  thumbnailUrl?: string;
  createTime: number;
  self?: boolean;
  fromNickName?: string;
  senderUserId?: number;
  receiverUserId?: number;
  // Keep for backward compat
  chatMessageType?: string;
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

export function useSendBinanceChatMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderNo, message }: { orderNo: string; message: string }) => {
      return callBinanceAds('sendChatMessage', { orderNo, content: message, contentType: 'TEXT' });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['binance-chat-messages', variables.orderNo] });
    },
    onError: (err: Error) => toast.error(`Send failed: ${err.message}`),
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
