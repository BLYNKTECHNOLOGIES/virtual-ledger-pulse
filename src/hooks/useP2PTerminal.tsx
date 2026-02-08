import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { C2COrderHistoryItem } from './useBinanceOrders';

// ---- Counterparty ----
export interface P2PCounterparty {
  id: string;
  binance_nickname: string;
  payment_identifiers: any;
  first_seen_at: string;
  last_seen_at: string;
  total_buy_orders: number;
  total_sell_orders: number;
  total_volume_inr: number;
  is_flagged: boolean;
  flag_reason: string | null;
  notes: string | null;
}

// ---- Order Record ----
export interface P2POrderRecord {
  id: string;
  binance_order_number: string;
  binance_adv_no: string | null;
  counterparty_id: string | null;
  counterparty_nickname: string;
  trade_type: string;
  asset: string;
  fiat_unit: string;
  amount: number;
  total_price: number;
  unit_price: number;
  commission: number;
  order_status: string;
  pay_method_name: string | null;
  binance_create_time: number | null;
  is_repeat_client: boolean;
  repeat_order_count: number;
  assigned_operator_id: string | null;
  order_type: string | null;
  synced_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  // Joined
  counterparty?: P2PCounterparty;
}

// ---- Chat Message ----
export interface P2PChatMessage {
  id: string;
  order_id: string;
  counterparty_id: string | null;
  sender_type: string;
  message_text: string | null;
  is_quick_reply: boolean;
  sent_by_user_id: string | null;
  created_at: string;
  media?: P2PChatMedia[];
}

export interface P2PChatMedia {
  id: string;
  chat_message_id: string;
  order_id: string;
  file_url: string;
  file_type: string;
  expires_at: string | null;
}

// ---- Sync orders from Binance to local DB ----
export function useSyncOrders() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orders: C2COrderHistoryItem[]) => {
      const results = [];
      for (const o of orders) {
        const { data, error } = await supabase.rpc('sync_p2p_order', {
          p_order_number: o.orderNumber,
          p_adv_no: o.advNo || null,
          p_nickname: o.counterPartNickName || 'Unknown',
          p_trade_type: o.tradeType,
          p_asset: o.asset || 'USDT',
          p_fiat: o.fiatUnit || 'INR',
          p_amount: parseFloat(o.amount || '0'),
          p_total_price: parseFloat(o.totalPrice || '0'),
          p_unit_price: parseFloat(o.unitPrice || '0'),
          p_commission: parseFloat(o.commission || '0'),
          p_status: o.orderStatus || 'TRADING',
          p_pay_method: o.payMethodName || null,
          p_create_time: o.createTime || 0,
        });
        if (error) console.error('Sync order error:', error);
        else results.push(data);
      }
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['p2p-orders'] });
      queryClient.invalidateQueries({ queryKey: ['p2p-counterparties'] });
    },
  });
}

// ---- Local order records ----
export function useP2POrders(filters?: { tradeType?: string; status?: string; search?: string }) {
  return useQuery({
    queryKey: ['p2p-orders', filters],
    queryFn: async () => {
      let query = supabase
        .from('p2p_order_records')
        .select('*')
        .order('binance_create_time', { ascending: false })
        .limit(100);

      if (filters?.tradeType) query = query.eq('trade_type', filters.tradeType);
      if (filters?.status) {
        if (filters.status === 'active') {
          query = query.not('order_status', 'ilike', '%COMPLETED%').not('order_status', 'ilike', '%CANCEL%');
        } else {
          query = query.ilike('order_status', `%${filters.status}%`);
        }
      }
      if (filters?.search) {
        query = query.or(`counterparty_nickname.ilike.%${filters.search}%,binance_order_number.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as P2POrderRecord[];
    },
  });
}

// ---- Single order ----
export function useP2POrder(orderId: string | null) {
  return useQuery({
    queryKey: ['p2p-order', orderId],
    queryFn: async () => {
      if (!orderId) return null;
      const { data, error } = await supabase
        .from('p2p_order_records')
        .select('*')
        .eq('id', orderId)
        .maybeSingle();
      if (error) throw error;
      return data as P2POrderRecord | null;
    },
    enabled: !!orderId,
  });
}

// ---- Counterparty details ----
export function useP2PCounterparty(counterpartyId: string | null) {
  return useQuery({
    queryKey: ['p2p-counterparty', counterpartyId],
    queryFn: async () => {
      if (!counterpartyId) return null;
      const { data, error } = await supabase
        .from('p2p_counterparties')
        .select('*')
        .eq('id', counterpartyId)
        .maybeSingle();
      if (error) throw error;
      return data as P2PCounterparty | null;
    },
    enabled: !!counterpartyId,
  });
}

// ---- Past orders with same counterparty ----
export function useCounterpartyOrders(counterpartyId: string | null, excludeOrderId?: string) {
  return useQuery({
    queryKey: ['p2p-counterparty-orders', counterpartyId, excludeOrderId],
    queryFn: async () => {
      if (!counterpartyId) return [];
      let query = supabase
        .from('p2p_order_records')
        .select('*')
        .eq('counterparty_id', counterpartyId)
        .order('binance_create_time', { ascending: false })
        .limit(50);

      if (excludeOrderId) query = query.neq('id', excludeOrderId);

      const { data, error } = await query;
      if (error) throw error;
      return data as P2POrderRecord[];
    },
    enabled: !!counterpartyId,
  });
}

// ---- Chat messages ----
export function useOrderChats(orderId: string | null) {
  return useQuery({
    queryKey: ['p2p-order-chats', orderId],
    queryFn: async () => {
      if (!orderId) return [];
      const { data, error } = await supabase
        .from('p2p_order_chats')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as P2PChatMessage[];
    },
    enabled: !!orderId,
  });
}

export function useSendChatMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (msg: { order_id: string; counterparty_id?: string; sender_type: string; message_text: string; sent_by_user_id?: string }) => {
      const { data, error } = await supabase.from('p2p_order_chats').insert(msg).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['p2p-order-chats', vars.order_id] });
    },
  });
}

// ---- Quick replies ----
export function useQuickReplies(orderType?: string | null, tradeType?: string | null) {
  return useQuery({
    queryKey: ['p2p-quick-replies', orderType, tradeType],
    queryFn: async () => {
      let query = supabase
        .from('p2p_quick_replies')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      // Include global + order-type specific
      if (orderType) {
        query = query.or(`order_type.is.null,order_type.eq.${orderType}`);
      }
      if (tradeType) {
        query = query.or(`trade_type.is.null,trade_type.eq.${tradeType}`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });
}
