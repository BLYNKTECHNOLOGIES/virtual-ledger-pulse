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

function isUsableNickname(nickname?: string | null) {
  const text = (nickname || '').trim();
  // Binance history masks many nicknames as values like "Use***". Those are
  // not identities; using them groups unrelated counterparties together.
  return !!text && !text.includes('*');
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
        // Resolve the verified name: prefer the prop, otherwise look it up from the
        // current order's stored history (live order detail is often empty for
        // completed/older orders, which previously left this query unable to run).
        let resolvedName = counterpartyVerifiedName;
        if (!resolvedName) {
          const { data: current } = await supabase
            .from('binance_order_history')
            .select('verified_name')
            .eq('order_number', currentOrderNumber)
            .maybeSingle();
          resolvedName = current?.verified_name || undefined;
        }
        // Match by verified name when available. Do NOT OR it with the Binance
        // nickname because history commonly stores masked nicknames (Use***),
        // which are shared by many unrelated clients and leak wrong KYC chats.
        const canFallbackToNickname = !resolvedName && isUsableNickname(counterpartyNickname);

        if (!resolvedName && !canFallbackToNickname) {
          allPastOrdersRef.current = [];
        } else {
          let query = supabase
            .from('binance_order_history')
            .select('order_number, trade_type, asset, total_price, fiat_unit, create_time, exchange_account_id')
            .neq('order_number', currentOrderNumber)
            .order('create_time', { ascending: false });

          if (exchangeAccountId) {
            query = query.eq('exchange_account_id', exchangeAccountId);
          }

          query = resolvedName
            ? query.eq('verified_name', resolvedName)
            : query.eq('counter_part_nick_name', counterpartyNickname);

          const { data, error } = await query;

          if (error) throw error;
          allPastOrdersRef.current = data || [];
        }
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
