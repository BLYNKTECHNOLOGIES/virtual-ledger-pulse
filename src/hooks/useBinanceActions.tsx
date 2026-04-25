import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logAdAction, AdActionTypes } from '@/hooks/useAdActionLog';

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
    onSuccess: (_data, variables) => {
      toast.success('Order marked as paid');
      logAdAction({ actionType: AdActionTypes.ORDER_MARKED_PAID, advNo: variables.orderNumber, adDetails: { orderNumber: variables.orderNumber } });
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
    onSuccess: (_data, variables) => {
      toast.success('Crypto released successfully');
      logAdAction({ actionType: AdActionTypes.ORDER_RELEASED, advNo: variables.orderNumber, adDetails: { orderNumber: variables.orderNumber }, metadata: { authType: variables.authType } });
      queryClient.invalidateQueries({ queryKey: ['binance-order-history-bulk'] });
      queryClient.invalidateQueries({ queryKey: ['p2p-orders'] });
      queryClient.invalidateQueries({ queryKey: ['binance-active-orders'] });
      queryClient.invalidateQueries({ queryKey: ['binance-order-detail'] });
    },
    onError: (err: Error, variables) => {
      const isYubiKeyFlow =
        variables?.authType === 'YUBIKEY' ||
        variables?.authType === 'FIDO2' ||
        !!variables?.yubikeyVerifyCode;

      if (isYubiKeyFlow && /verification failed/i.test(err.message)) {
        toast.error('Release failed: YubiKey code is invalid, expired, or already used. Tap YubiKey again and submit a fresh code.');
        return;
      }

      if (/timed out/i.test(err.message)) {
        toast.error('Release request timed out. Check order status once, then retry with a fresh YubiKey code only if still pending release.');
        return;
      }

      if (isYubiKeyFlow && /unsupported authentication type/i.test(err.message)) {
        toast.error('Release failed: Authentication mode mismatch. Please retry with a fresh YubiKey code.');
        return;
      }

      toast.error(`Release failed: ${err.message}`);
    },
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
    onSuccess: (_data, variables) => {
      toast.success('Order cancelled');
      logAdAction({ actionType: AdActionTypes.ORDER_CANCELLED, advNo: variables.orderNumber, adDetails: { orderNumber: variables.orderNumber }, metadata: { reasonCode: variables.orderCancelReasonCode, reason: variables.orderCancelAdditionalInfo } });
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
    onSuccess: (_data, variables) => {
      toast.success('Order verified — payment details shared with buyer');
      logAdAction({ actionType: AdActionTypes.ORDER_VERIFIED, advNo: variables.orderNumber, adDetails: { orderNumber: variables.orderNumber } });
      queryClient.invalidateQueries({ queryKey: ['binance-active-orders'] });
      queryClient.invalidateQueries({ queryKey: ['binance-order-detail'] });
    },
    onError: (err: Error) => toast.error(`Verification failed: ${err.message}`),
  });
}

// ==================== ACTIVE ORDERS ====================

export function useBinanceActiveOrders(filters?: {
  tradeType?: string;
  asset?: string;
  advNo?: string;
  payType?: string;
  startDate?: string;
  endDate?: string;
  orderStatusList?: Array<number | string>;
}) {
  return useQuery({
    queryKey: ['binance-active-orders', filters],
    queryFn: () => callBinanceAds('listActiveOrders', { ...filters, rows: 50 }),
    staleTime: 2 * 1000,
    refetchInterval: 5 * 1000, // Poll every 5s for snappy order reflection
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
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

export function useBinanceOrderRiskSnapshot(orderNumber: string | null) {
  return useQuery({
    queryKey: ['binance-order-risk-snapshot', orderNumber],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('binance_order_history')
        .select('order_detail_raw, counterparty_risk_snapshot, counterparty_risk_captured_at')
        .eq('order_number', orderNumber!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!orderNumber,
    staleTime: 60 * 1000,
  });
}

export function useOrderCommissionSnapshots(orderNumber: string | null) {
  return useQuery({
    queryKey: ['binance-order-commission-snapshots', orderNumber],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('binance_commission_rate_snapshots' as any)
        .select('*')
        .eq('order_number', orderNumber!)
        .order('captured_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!orderNumber,
    staleTime: 60 * 1000,
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

/** Two-phase order history: Phase 1 fetches latest 50 orders instantly,
 *  Phase 2 lazily loads the rest in the background. Consumers see a single merged array. */
export function useBinanceOrderHistory() {
  // Phase 1: Fast initial load – latest 50 orders only
  const phase1 = useQuery({
    queryKey: ['binance-order-history-fast'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('binance_order_history')
        .select('order_number, adv_no, trade_type, asset, fiat_unit, amount, total_price, unit_price, commission, order_status, create_time, pay_method_name, counter_part_nick_name, verified_name, raw_data')
        .order('create_time', { ascending: false })
        .limit(50);

      if (error) {
        console.error('[OrderHistory] Phase 1 fetch error:', error);
        return [];
      }
      return (data || []).map(mapOrderRow);
    },
    staleTime: 20 * 1000,
    refetchInterval: 30 * 1000,
  });

  // Phase 2: Full background load – all remaining orders (deferred)
  const phase2 = useQuery({
    queryKey: ['binance-order-history-bulk'],
    queryFn: async () => {
      const batchSize = 1000;
      const allOrders: any[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('binance_order_history')
          .select('order_number, adv_no, trade_type, asset, fiat_unit, amount, total_price, unit_price, commission, order_status, create_time, pay_method_name, counter_part_nick_name, verified_name, raw_data')
          .order('create_time', { ascending: false })
          .range(offset, offset + batchSize - 1);

        if (error) {
          console.error('[OrderHistory] Phase 2 fetch error:', error);
          break;
        }

        if (data && data.length > 0) {
          for (const row of data) {
            allOrders.push(mapOrderRow(row));
          }
          offset += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      return allOrders;
    },
    staleTime: 60 * 1000,
    refetchInterval: 120 * 1000,
    enabled: phase1.isFetched,
  });

  // Merge: use full data once available, otherwise fast data
  const mergedData = phase2.data && phase2.data.length > 0 ? phase2.data : (phase1.data || []);

  return {
    data: mergedData,
    isLoading: phase1.isLoading,
    isFetching: phase1.isFetching || phase2.isFetching,
    refetch: async () => {
      await Promise.all([phase1.refetch(), phase2.refetch()]);
    },
  };
}

function mapOrderRow(row: any) {
  return {
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
  };
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
  uuid?: string;
  type: string;
  content?: string;
  message?: string; // legacy fallback
  imageUrl?: string;
  thumbnailUrl?: string;
  createTime: number;
  status?: string | number;
  self?: boolean;
  fromNickName?: string;
  senderUserId?: number;
  receiverUserId?: number;
  // Keep for backward compat
  chatMessageType?: string;
}

export interface ArchivedBinanceChatMessage {
  id: string;
  order_number: string;
  dedupe_key: string;
  binance_message_id: string | null;
  binance_uuid: string | null;
  message_type: string;
  chat_message_type: string | null;
  content_type: string | null;
  sender_is_self: boolean | null;
  sender_nickname: string | null;
  message_status: string | null;
  binance_create_time: number | null;
  message_text: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  is_system_message: boolean;
  is_recall: boolean;
  is_compliance_relevant: boolean;
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

export function useArchivedBinanceChatMessages(orderNo: string | null) {
  return useQuery({
    queryKey: ['archived-binance-chat-messages', orderNo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('binance_order_chat_messages' as any)
        .select('id, order_number, dedupe_key, binance_message_id, binance_uuid, message_type, chat_message_type, content_type, sender_is_self, sender_nickname, message_status, binance_create_time, message_text, image_url, thumbnail_url, is_system_message, is_recall, is_compliance_relevant')
        .eq('order_number', orderNo!)
        .order('binance_create_time', { ascending: true });
      if (error) throw error;
      return data as unknown as ArchivedBinanceChatMessage[];
    },
    enabled: !!orderNo,
    staleTime: 10 * 1000,
    refetchInterval: 15 * 1000,
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

export function useRefreshMerchantState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => callBinanceAds('refreshMerchantState'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['binance-user-detail'] });
      queryClient.invalidateQueries({ queryKey: ['binance-merchant-state-snapshots'] });
      toast.success('Binance merchant state refreshed');
    },
    onError: (err: Error) => toast.error(`Merchant state refresh failed: ${err.message}`),
  });
}
