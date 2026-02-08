import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, MessageSquare, Search, User, ChevronRight, AlertCircle } from 'lucide-react';
import { useBinanceActiveOrders, useBinanceOrderHistory, useBinanceChatMessages } from '@/hooks/useBinanceActions';
import { mapToOperationalStatus, getStatusStyle } from '@/lib/orderStatusMapper';
import { format } from 'date-fns';

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
}

interface Props {
  onClose: () => void;
  onOpenChat: (conversation: ChatConversation) => void;
}

export function ChatInbox({ onClose, onOpenChat }: Props) {
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [search, setSearch] = useState('');

  const { data: activeOrdersData, isLoading: activeLoading } = useBinanceActiveOrders();
  const { data: historyOrders = [], isLoading: historyLoading } = useBinanceOrderHistory();

  const conversations = useMemo(() => {
    const convMap = new Map<string, ChatConversation>();

    // Active orders — these have chatUnreadCount
    const activeRaw = activeOrdersData?.data || activeOrdersData;
    const activeList = Array.isArray(activeRaw) ? activeRaw : [];

    for (const o of activeList) {
      const nick = o.tradeType === 'BUY' ? (o.sellerNickname || '') : (o.buyerNickname || '');
      convMap.set(o.orderNumber, {
        orderNumber: o.orderNumber,
        counterpartyNickname: nick.trim(),
        tradeType: o.tradeType,
        asset: o.asset || 'USDT',
        fiatUnit: o.fiat || 'INR',
        amount: o.amount || '0',
        totalPrice: o.totalPrice || '0',
        orderStatus: String(o.orderStatus),
        chatUnreadCount: o.chatUnreadCount || 0,
        createTime: o.createTime || 0,
        source: 'active',
      });
    }

    // History orders (7 days) — no unread count available
    for (const o of historyOrders) {
      if (!convMap.has(o.orderNumber)) {
        convMap.set(o.orderNumber, {
          orderNumber: o.orderNumber,
          counterpartyNickname: (o as any).counterPartNickName || '',
          tradeType: (o as any).tradeType || '',
          asset: (o as any).asset || 'USDT',
          fiatUnit: (o as any).fiatUnit || 'INR',
          amount: (o as any).amount || '0',
          totalPrice: (o as any).totalPrice || '0',
          orderStatus: String((o as any).orderStatus || ''),
          chatUnreadCount: 0,
          createTime: (o as any).createTime || 0,
          source: 'history',
        });
      }
    }

    let list = Array.from(convMap.values());

    // Sort: unread first, then by createTime descending
    list.sort((a, b) => {
      if (a.chatUnreadCount > 0 && b.chatUnreadCount === 0) return -1;
      if (b.chatUnreadCount > 0 && a.chatUnreadCount === 0) return 1;
      return b.createTime - a.createTime;
    });

    return list;
  }, [activeOrdersData, historyOrders]);

  const filtered = useMemo(() => {
    let list = conversations;

    if (tab === 'unread') {
      list = list.filter(c => c.chatUnreadCount > 0);
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.counterpartyNickname.toLowerCase().includes(q) ||
        c.orderNumber.includes(q)
      );
    }

    return list;
  }, [conversations, tab, search]);

  const totalUnread = useMemo(() =>
    conversations.reduce((sum, c) => sum + c.chatUnreadCount, 0),
    [conversations]
  );

  const isLoading = activeLoading || historyLoading;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <MessageSquare className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">Chat</span>
        {totalUnread > 0 && (
          <Badge className="bg-destructive text-destructive-foreground text-[9px] h-4 px-1.5 ml-1">
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
            placeholder="Search by nickname/group name"
            className="h-8 pl-8 text-xs bg-secondary border-border"
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
                onClick={() => onOpenChat(conv)}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* API limitation notice */}
      <div className="px-4 py-2 border-t border-border bg-card/30">
        <div className="flex items-start gap-1.5">
          <AlertCircle className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-[9px] text-muted-foreground leading-relaxed">
            Chat history is available for active and recent orders (7 days). Unread counts are only tracked for active orders.
          </p>
        </div>
      </div>
    </div>
  );
}

function ConversationRow({ conversation: c, onClick }: { conversation: ChatConversation; onClick: () => void }) {
  const numStatusMap: Record<number, string> = {
    1: 'PENDING', 2: 'TRADING', 3: 'BUYER_PAYED', 4: 'BUYER_PAYED',
    5: 'COMPLETED', 6: 'CANCELLED', 7: 'CANCELLED', 8: 'APPEAL',
  };
  const rawStatus = isNaN(Number(c.orderStatus))
    ? c.orderStatus
    : (numStatusMap[Number(c.orderStatus)] || c.orderStatus);
  const opStatus = mapToOperationalStatus(rawStatus, c.tradeType);
  const statusStyle = getStatusStyle(opStatus);

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 hover:bg-secondary/50 transition-colors flex items-center gap-3"
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
          <span className={`text-xs font-semibold text-foreground truncate ${c.chatUnreadCount > 0 ? '' : ''}`}>
            {c.counterpartyNickname || 'Unknown'}
          </span>
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
            {c.createTime ? format(new Date(c.createTime), 'HH:mm') : ''}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`text-[9px] font-semibold ${c.tradeType === 'BUY' ? 'text-trade-buy' : 'text-trade-sell'}`}>
            {c.tradeType}
          </span>
          <span className="text-[10px] text-muted-foreground truncate">
            {Number(c.amount).toFixed(2)} {c.asset} · ₹{Number(c.totalPrice).toLocaleString('en-IN')}
          </span>
        </div>
        <Badge variant="outline" className={`text-[8px] mt-1 ${statusStyle.badgeClass}`}>
          {statusStyle.label}
        </Badge>
      </div>

      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
    </button>
  );
}
