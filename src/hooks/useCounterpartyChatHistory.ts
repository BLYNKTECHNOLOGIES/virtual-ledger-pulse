import { useState, useCallback, useRef } from 'react';
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

export function useCounterpartyChatHistory(
  counterpartyNickname: string,
  currentOrderNumber: string,
  counterpartyVerifiedName?: string
) {
  const [historicalChats, setHistoricalChats] = useState<HistoricalOrderChat[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const loadedOrdersRef = useRef<Set<string>>(new Set());
  const allPastOrdersRef = useRef<{ order_number: string; trade_type: string; asset: string | null; total_price: string | null; fiat_unit: string | null; create_time: number }[] | null>(null);
  const offsetRef = useRef(0);
  // Track which verified name was used for the cached query
  const cachedVerifiedNameRef = useRef<string | undefined>(undefined);

  // Reset cache if verified name changes (e.g. arrives after initial load)
  if (counterpartyVerifiedName && cachedVerifiedNameRef.current !== counterpartyVerifiedName && allPastOrdersRef.current !== null) {
    allPastOrdersRef.current = null;
    offsetRef.current = 0;
    loadedOrdersRef.current = new Set();
    cachedVerifiedNameRef.current = counterpartyVerifiedName;
    // Re-enable loading
    setHasMore(true);
    setHistoricalChats([]);
  }

  const fetchPastOrders = useCallback(async () => {
    // Wait for verifiedName to be available before querying (nicknames are masked and won't match)
    if (!counterpartyVerifiedName || !hasMore || isLoading) return;
    setIsLoading(true);

    try {
      // Fetch the full list of past orders once and cache
      if (!allPastOrdersRef.current) {
        cachedVerifiedNameRef.current = counterpartyVerifiedName;
        const { data, error } = await supabase
          .from('binance_order_history')
          .select('order_number, trade_type, asset, total_price, fiat_unit, create_time')
          .eq('verified_name', counterpartyVerifiedName!)
          .eq('order_status', 'COMPLETED')
          .neq('order_number', currentOrderNumber)
          .order('create_time', { ascending: false });

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
          });
          const list = result?.data?.data || result?.data || result?.list || [];
          const messages: HistoricalChatMessage[] = Array.isArray(list) ? list : [];

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
  }, [counterpartyNickname, counterpartyVerifiedName, currentOrderNumber, hasMore, isLoading]);

  return { historicalChats, isLoading, hasMore, loadMore: fetchPastOrders };
}
