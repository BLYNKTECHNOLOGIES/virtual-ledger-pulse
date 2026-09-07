import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, MessageSquare, Search, User, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { callBinanceAds } from '@/hooks/useBinanceActions';
import { useExchangeAccount, ALL_ACCOUNTS } from '@/contexts/ExchangeAccountContext';
import { mapToOperationalStatus, getStatusStyle } from '@/lib/orderStatusMapper';
import { format, isToday } from 'date-fns';
import { markOrderChatRead } from '@/lib/chat-read-state';
import { useChatSeenMap, seenLabel, type ChatSeenInfo } from '@/hooks/useChatSeenBy';

export interface ChatConversation {
  orderNumber: string;
  counterpartyNickname: string;
  tradeType: string;
  asset: string;
  fiatUnit: string;
  amount: string;
  totalPrice: string;
  orderStatus: string;
  chatUnreadCount: number;
  createTime: number;
  /** Source: 'active' orders or 'history' orders */
  source: 'active' | 'history';
  verifiedName?: string;
  exchangeAccountId?: string | null;
  lastMessageAt?: string | null;
  lastMessagePreview?: string | null;
  lastMessageFromSelf?: boolean;
  /** True when this thread was opened from the Chats inbox (back returns there). */
  fromInbox?: boolean;
  /** All order threads rolled into this inbox row (same counterparty). */
  mergedOrderNumbers?: string[];
}

interface Props {
  onClose: () => void;
  onOpenChat: (conversation: ChatConversation) => void;
}

interface InboxRow {
  order_number: string;
  exchange_account_id: string | null;
  counterparty_nickname: string;
  verified_name: string;
  trade_type: string;
  asset: string;
  fiat_unit: string;
  amount: string;
  total_price: string;
  order_status: string;
  create_time: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_from_self: boolean;
  unread_count: number;
}

export function ChatInbox({ onClose, onOpenChat }: Props) {
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();
  const { activeAccountId } = useExchangeAccount();
  const accountFilter = activeAccountId === ALL_ACCOUNTS ? null : activeAccountId;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['terminal-chat-inbox', accountFilter, search],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_terminal_chat_inbox', {
        p_exchange_account_id: accountFilter,
        p_limit: 300,
        p_search: search || null,
      });
      if (error) throw error;
      return (data || []) as InboxRow[];
    },
    refetchInterval: 20000,
  });

  // Live push: any newly recorded Binance chat message refreshes the inbox.
  useEffect(() => {
    const channel = supabase
      .channel(`chat-inbox-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'binance_order_chat_messages' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['terminal-chat-inbox'] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const conversations: ChatConversation[] = useMemo(
    () =>
      rows.map((r) => ({
        orderNumber: r.order_number,
        counterpartyNickname: (r.counterparty_nickname || '').trim(),
        tradeType: r.trade_type || '',
        asset: r.asset || 'USDT',
        fiatUnit: r.fiat_unit || 'INR',
        amount: r.amount || '0',
        totalPrice: r.total_price || '0',
        orderStatus: String(r.order_status || ''),
        chatUnreadCount: r.unread_count || 0,
        createTime: Number(r.create_time) || 0,
        source: 'history',
        verifiedName: r.verified_name || '',
        exchangeAccountId: r.exchange_account_id,
        lastMessageAt: r.last_message_at,
        lastMessagePreview: r.last_message_preview,
        lastMessageFromSelf: r.last_message_from_self,
      })),
    [rows]
  );

  // ONE ROW PER COUNTERPARTY.
  // Binance opens a separate chat per order, so the same person used to appear
  // several times. We keep only their newest conversation (that is where live
  // messages land) and roll their unread counts into it. Masked nicknames with
  // no verified name are never merged — they cannot be proven to be the same
  // person.
  const merged: ChatConversation[] = useMemo(() => {
    const out: ChatConversation[] = [];
    const byKey = new Map<string, ChatConversation>();
    const rank = (c: ChatConversation) =>
      c.lastMessageAt ? new Date(c.lastMessageAt).getTime() : c.createTime;

    for (const c of conversations) {
      const verified = (c.verifiedName || '').trim().toLowerCase();
      const nick = (c.counterpartyNickname || '').trim().toLowerCase();
      const identifiable = verified || (nick && !nick.includes('*') ? nick : '');
      if (!identifiable) {
        out.push({ ...c, mergedOrderNumbers: [c.orderNumber] });
        continue;
      }
      const key = `${c.exchangeAccountId || 'all'}|${identifiable}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { ...c, mergedOrderNumbers: [c.orderNumber] });
        continue;
      }
      const newest = rank(c) > rank(existing) ? { ...c } : { ...existing };
      newest.chatUnreadCount = (existing.chatUnreadCount || 0) + (c.chatUnreadCount || 0);
      newest.mergedOrderNumbers = Array.from(
        new Set([...(existing.mergedOrderNumbers || [existing.orderNumber]), c.orderNumber])
      );
      byKey.set(key, newest);
    }

    const all = [...out, ...byKey.values()];
    all.sort((a, b) => rank(b) - rank(a));
    return all;
  }, [conversations]);

  const filtered = useMemo(
    () => (tab === 'unread' ? merged.filter((c) => c.chatUnreadCount > 0) : merged),
    [merged, tab]
  );

  const totalUnread = useMemo(
    () => merged.reduce((sum, c) => sum + (c.chatUnreadCount > 0 ? 1 : 0), 0),
    [merged]
  );

  const { data: seenMap = {} } = useChatSeenMap(
    useMemo(() => filtered.map((c) => c.orderNumber), [filtered])
  );

  const handleOpenChat = useCallback(
    (conv: ChatConversation) => {
      // A row can roll up several order threads for the same counterparty —
      // mark every one of them read, otherwise the badge comes straight back.
      const orderNumbers = Array.from(
        new Set([conv.orderNumber, ...(conv.mergedOrderNumbers || [])])
      );
      orderNumbers.forEach((n) => markOrderChatRead(n));
      Promise.all(
        orderNumbers.map((n) =>
          supabase.rpc('mark_terminal_binance_chat_read', { p_order_number: n })
        )
      ).then(() => queryClient.invalidateQueries({ queryKey: ['terminal-chat-inbox'] }));
      orderNumbers.forEach((n) => {
        callBinanceAds('markOrderMessagesRead', { orderNo: n }).catch((err) => {
          console.warn('Failed to mark Binance chat read:', err);
        });
      });
      callBinanceAds('markUserMessagesRead', { orderNo: conv.orderNumber }).catch((err) => {
        console.warn('Failed to mark counterparty user chats read:', err);
      });
      onOpenChat(conv);
    },
    [onOpenChat, queryClient]
  );


  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <MessageSquare className="h-4 w-4 text-primary" />
        <span className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground">Inbox</span>
        {totalUnread > 0 && (
          <Badge className="bg-destructive text-destructive-foreground text-[9px] t-mono h-4 px-1.5 ml-1">
            {totalUnread}
          </Badge>
        )}
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b border-border bg-card/50">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by nickname, verified name or order number"
            className="h-8 pl-8 text-xs bg-input border-border"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 py-2 border-b border-border">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="h-8 bg-secondary">
            <TabsTrigger value="all" className="text-[11px] h-6 px-4">All</TabsTrigger>
            <TabsTrigger value="unread" className="text-[11px] h-6 px-4">
              Unread ({totalUnread})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Conversation list */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-xs text-muted-foreground">Loading conversations...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <MessageSquare className="h-8 w-8 text-muted-foreground/20" />
            <p className="text-xs text-muted-foreground">
              {tab === 'unread' ? 'No unread messages' : 'No conversations found'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((conv) => (
              <ConversationRow
                key={conv.orderNumber}
                conversation={conv}
                seen={seenMap[conv.orderNumber]}
                onClick={() => handleOpenChat(conv)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function ConversationRow({
  conversation: c,
  seen,
  onClick,
}: {
  conversation: ChatConversation;
  seen?: ChatSeenInfo;
  onClick: () => void;
}) {
  const seenText = seenLabel(seen);
  const numStatusMap: Record<number, string> = {
    1: 'TRADING', 2: 'BUYER_PAYED', 3: 'BUYER_PAYED', 4: 'COMPLETED',
    5: 'APPEAL', 6: 'CANCELLED', 7: 'CANCELLED_BY_SYSTEM', 8: 'APPEAL',
  };
  const rawStatus = isNaN(Number(c.orderStatus))
    ? c.orderStatus
    : (numStatusMap[Number(c.orderStatus)] || c.orderStatus);
  const opStatus = mapToOperationalStatus(rawStatus, c.tradeType);
  const statusStyle = getStatusStyle(opStatus);

  // Binance also delivers chats that were started from an ad with no order
  // behind them. They have no trade figures and no order status.
  const isEnquiry = c.orderNumber.startsWith('INQ-');
  const stamp = c.lastMessageAt ? new Date(c.lastMessageAt) : (c.createTime ? new Date(c.createTime) : null);
  const stampLabel = stamp ? (isToday(stamp) ? format(stamp, 'HH:mm') : format(stamp, 'dd MMM')) : '';

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2.5 hover:bg-white/5 transition-colors flex items-center gap-3"
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center">
          <User className="h-5 w-5 text-muted-foreground" />
        </div>
        {c.chatUnreadCount > 0 && (
          <div className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] rounded-full bg-destructive flex items-center justify-center px-1">
            <span className="text-[9px] font-bold text-destructive-foreground">
              {c.chatUnreadCount}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 min-w-0">
            {c.chatUnreadCount > 0 && (
              <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
            )}
            <span className={`text-[13px] text-foreground truncate ${c.chatUnreadCount > 0 ? 'font-semibold' : 'font-medium'}`}>
              {c.verifiedName || c.counterpartyNickname || 'Unknown'}
            </span>
            {c.verifiedName && c.counterpartyNickname && (
              <span className="text-[10px] text-muted-foreground truncate">{c.counterpartyNickname}</span>
            )}
          </span>
          <span className="text-[10px] text-muted-foreground t-mono tabular-nums shrink-0">
            {stampLabel}
          </span>
        </div>
        {c.lastMessagePreview ? (
          <div className={`text-[11px] truncate mt-0.5 ${c.chatUnreadCount > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
            {c.lastMessageFromSelf ? 'You: ' : ''}{c.lastMessagePreview}
          </div>
        ) : null}
        {!isEnquiry && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`text-[9px] t-mono uppercase font-semibold ${c.tradeType === 'BUY' ? 'text-trade-buy' : 'text-trade-sell'}`}>
              {c.tradeType}
            </span>
            <span className="text-xs text-muted-foreground truncate">
              {Number(c.amount).toFixed(2)} {c.asset} · ₹{Number(c.totalPrice).toLocaleString('en-IN')}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2 mt-1 min-w-0">
          <Badge variant="outline" className={`text-[8px] gap-1 ${isEnquiry ? 'text-muted-foreground border-muted-foreground/40' : statusStyle.badgeClass}`}>
            {isEnquiry ? 'Enquiry · no order' : statusStyle.label}
          </Badge>
          {seenText && (
            <span className="text-[9px] text-muted-foreground/80 truncate" title={seenText}>
              {seenText}
            </span>
          )}
        </div>
      </div>

      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
    </button>
  );
}
