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
 * Resolve the stable Binance counterparty user id for an order.
 *
 * IMPORTANT (data-integrity): The counterparty is the taker on our (merchant/maker)
 * ads, so `takerUserNo` inside `order_detail_raw` is the ONLY globally-unique
 * identifier for a person. We deliberately do NOT group history by `verified_name`
 * or by the masked Binance nickname: those are shared by many unrelated clients
 * (e.g. dozens of different people are named "DEEPAK KUMAR"), which previously
 * caused "Load More Chats" to leak completely unrelated orders and KYC documents.
 */
function takerUserNoFromRow(row: any): string | null {
  const detail = row?.order_detail_raw || {};
  const raw = row?.raw_data || {};
  const value =
    detail.takerUserNo ??
    detail.takerUserId ??
    raw.takerUserNo ??
    raw.takerUserId ??
    null;
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text || null;
}

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
  const allPastOrdersRef = useRef<{ order_number: string; trade_type: string; asset: string | null; total_price: string | null; fiat_unit: string | null; create_time: number; exchange_account_id?: string | null }[] | null>(null);
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

      // Fetch chat messages for each order in the batch
      const chatResults: HistoricalOrderChat[] = [];

      for (const order of batch) {
        if (loadedOrdersRef.current.has(order.order_number)) continue;
        loadedOrdersRef.current.add(order.order_number);

        try {
          const result = await callBinanceAds('getChatMessages', {
            orderNo: order.order_number,
            page: 1,
            rows: 50,
            sort: 'asc',
          }, order.exchange_account_id || exchangeAccountId || undefined);
          const list = result?.data?.data || result?.data || result?.list || [];
          const messages: HistoricalChatMessage[] = (Array.isArray(list) ? list : []).filter((msg: any) => {
            const msgOrderNo = msg?.orderNo || msg?.topicId || msg?.order?.orderNo || null;
            return !msgOrderNo || String(msgOrderNo) === String(order.order_number);
          });

          chatResults.push({
            orderNumber: order.order_number,
            tradeType: order.trade_type || 'UNKNOWN',
            asset: order.asset,
            totalPrice: order.total_price,
            fiatUnit: order.fiat_unit,
            orderDate: order.create_time,
            messages,
          });
        } catch (err) {
          console.warn('Failed to fetch chat for order:', order.order_number, err);
          // Still add with empty messages
          chatResults.push({
            orderNumber: order.order_number,
            tradeType: order.trade_type || 'UNKNOWN',
            asset: order.asset,
            totalPrice: order.total_price,
            fiatUnit: order.fiat_unit,
            orderDate: order.create_time,
            messages: [],
          });
        }
      }

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
