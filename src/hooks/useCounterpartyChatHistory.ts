import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { callBinanceAds } from './useBinanceActions';

export interface HistoricalOrderChat {
  orderNumber: string;
  tradeType: string;
  asset: string | null;
  totalPrice: string | null;
  fiatUnit: string | null;
  orderDate: number; // create_time epoch
  orderStatus: string | null; // raw Binance status from order history
  messages: HistoricalChatMessage[];
}

export interface HistoricalChatMessage {
  id: number;
  type: string;
  content?: string;
  message?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  createTime: number;
  self?: boolean;
  fromNickName?: string;
}

const PAGE_SIZE = 3; // Load 3 past orders at a time

/**
 * Counterparty chat history.
 *
 * IMPORTANT (data-integrity): We do NOT group history by `verified_name` or the
 * masked Binance nickname (shared by many unrelated clients), nor by raw
 * `takerUserNo` — on BUY orders (and any ad WE took) `takerUserNo` is OUR OWN
 * account number, which is shared across thousands of unrelated orders and
 * previously leaked other clients' chats/KYC. Counterparty resolution is done
 * server-side by the `get_counterparty_order_history` RPC, which detects our own
 * account numbers and treats the OTHER side of each order as the counterparty.
 */


export function useCounterpartyChatHistory(
  counterpartyNickname: string,
  currentOrderNumber: string,
  counterpartyVerifiedName?: string,
  exchangeAccountId?: string | null
) {
  const [historicalChats, setHistoricalChats] = useState<HistoricalOrderChat[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const loadedOrdersRef = useRef<Set<string>>(new Set());
  const allPastOrdersRef = useRef<{ order_number: string; trade_type: string; asset: string | null; total_price: string | null; fiat_unit: string | null; create_time: number; exchange_account_id?: string | null; order_status?: string | null }[] | null>(null);
  const offsetRef = useRef(0);
  const scopeRef = useRef('');

  useEffect(() => {
    const scope = [currentOrderNumber, counterpartyVerifiedName || '', counterpartyNickname || '', exchangeAccountId || ''].join('|');
    if (scopeRef.current === scope) return;
    scopeRef.current = scope;
    allPastOrdersRef.current = null;
    offsetRef.current = 0;
    loadedOrdersRef.current = new Set();
    setHasMore(true);
    setHistoricalChats([]);
  }, [currentOrderNumber, counterpartyVerifiedName, counterpartyNickname, exchangeAccountId]);

  const fetchPastOrders = useCallback(async () => {
    if (!hasMore || isLoading) return;
    setIsLoading(true);

    try {
      // Fetch the full list of past orders once and cache
      if (!allPastOrdersRef.current) {
        // Resolve the CURRENT order's counterparty user id. This is the only safe
        // key to group history by. The counterparty is resolved server-side by
        // get_counterparty_order_history: it detects OUR own account numbers
        // (accounts that trade with many different people) and treats the OTHER
        // side of each order as the counterparty. This fixes the leak where
        // takerUserNo was OUR own id on BUY orders (and any ad we took), which
        // previously pulled in thousands of unrelated orders/KYC docs.
        const { data, error } = await supabase.rpc('get_counterparty_order_history', {
          p_order_number: currentOrderNumber,
          p_exchange_account_id: exchangeAccountId || null,
        });
        if (error) throw error;
        allPastOrdersRef.current = data || [];
      }

      const allOrders = allPastOrdersRef.current;
      const batch = allOrders.slice(offsetRef.current, offsetRef.current + PAGE_SIZE);

      if (batch.length === 0) {
        setHasMore(false);
        setIsLoading(false);
        return;
      }

      // Fetch chat messages for the batch. Our own archive (filled by the
      // always-on listener) is read FIRST in a single query — that is instant.
      // Binance is only called for orders we have nothing stored for, and those
      // calls run in parallel instead of one after another.
      const chatResults: HistoricalOrderChat[] = [];
      const pending = batch.filter((o) => !loadedOrdersRef.current.has(o.order_number));
      pending.forEach((o) => loadedOrdersRef.current.add(o.order_number));

      const archived: Record<string, HistoricalChatMessage[]> = {};
      if (pending.length) {
        const { data: rows } = await supabase
          .from('binance_order_chat_messages')
          .select('order_number,binance_message_id,message_type,chat_message_type,content_type,message_text,image_url,thumbnail_url,binance_create_time,sender_is_self,sender_nickname')
          .in('order_number', pending.map((o) => o.order_number))
          .order('binance_create_time', { ascending: true });
        for (const r of rows || []) {
          const key = String((r as any).order_number);
          (archived[key] ||= []).push({
            id: Number((r as any).binance_message_id) || Number((r as any).binance_create_time) || 0,
            type: String((r as any).message_type || (r as any).chat_message_type || (r as any).content_type || 'text'),
            content: (r as any).message_text || '',
            imageUrl: (r as any).image_url || undefined,
            thumbnailUrl: (r as any).thumbnail_url || undefined,
            createTime: Number((r as any).binance_create_time) || 0,
            self: (r as any).sender_is_self === true,
            fromNickName: (r as any).sender_nickname || undefined,
          });
        }
      }

      const fetched = await Promise.all(pending.map(async (order) => {
        const stored = archived[order.order_number];
        let messages: HistoricalChatMessage[] = stored || [];

        if (!messages.length) {
          try {
            const result = await callBinanceAds('getChatMessages', {
              orderNo: order.order_number,
              page: 1,
              rows: 50,
              sort: 'asc',
            }, order.exchange_account_id || exchangeAccountId || undefined);
            const list = result?.data?.data || result?.data || result?.list || [];
            messages = (Array.isArray(list) ? list : []).filter((msg: any) => {
              const msgOrderNo = msg?.orderNo || msg?.topicId || msg?.order?.orderNo || null;
              return !msgOrderNo || String(msgOrderNo) === String(order.order_number);
            });
          } catch (err) {
            console.warn('Failed to fetch chat for order:', order.order_number, err);
            messages = [];
          }
        }

        return {
          orderNumber: order.order_number,
          tradeType: order.trade_type || 'UNKNOWN',
          asset: order.asset,
          totalPrice: order.total_price,
          fiatUnit: order.fiat_unit,
          orderDate: order.create_time,
          orderStatus: order.order_status ?? null,
          messages,
        } as HistoricalOrderChat;
      }));
      chatResults.push(...fetched);

      offsetRef.current += PAGE_SIZE;


      if (offsetRef.current >= allOrders.length) {
        setHasMore(false);
      }

      // Prepend historical chats (older first)
      setHistoricalChats((prev) => [
        ...chatResults.sort((a, b) => a.orderDate - b.orderDate),
        ...prev,
      ]);
    } catch (err) {
      console.error('Failed to load counterparty chat history:', err);
    } finally {
      setIsLoading(false);
    }
  }, [counterpartyNickname, counterpartyVerifiedName, currentOrderNumber, exchangeAccountId, hasMore, isLoading]);

  return { historicalChats, isLoading, hasMore, loadMore: fetchPastOrders };
}
