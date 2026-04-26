import { useState, useMemo, type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Users, User, BarChart3, ArrowLeft, Calendar, Shield, FileText, ChevronDown, AlertTriangle, Activity, IdCard } from 'lucide-react';
import { InternalChatPanel } from './InternalChatPanel';
import { useIsMobile } from '@/hooks/use-mobile';
import { CounterpartyPanInput } from './CounterpartyPanInput';
import { CounterpartyContactInput } from './CounterpartyContactInput';
import { P2POrderRecord } from '@/hooks/useP2PTerminal';
import { OrderSummaryPanel } from './OrderSummaryPanel';
import { ChatPanel } from './ChatPanel';
import { useP2PCounterparty, useP2PCounterpartyByNickname } from '@/hooks/useP2PTerminal';
import { useCounterpartyBinanceStats, useBinanceOrderDetail, useBinanceOrderLiveStatus, useCounterpartyCompletedOrderCount, useBinanceChatMessages, useBinanceOrderRiskSnapshot, useOrderCommissionSnapshots } from '@/hooks/useBinanceActions';
import { useCounterpartyLinkedClient, RISK_BADGE_STYLES } from '@/hooks/useCounterpartyLinkedClient';
import { ShieldAlert } from 'lucide-react';
import { normaliseBinanceStatus } from '@/lib/orderStatusMapper';

interface Props {
  order: P2POrderRecord;
  onClose: () => void;
}

export function OrderDetailWorkspace({ order, onClose }: Props) {
  const [rightPanel, setRightPanel] = useState<'profile' | 'internal'>('internal');
  const [mobileTab, setMobileTab] = useState<'details' | 'chat' | 'internal' | 'profile'>('internal');
  const isMobile = useIsMobile();
  const { data: counterpartyById } = useP2PCounterparty(order.counterparty_id);
  const { data: counterpartyByNick } = useP2PCounterpartyByNickname(!order.counterparty_id ? order.counterparty_nickname : null);
  const counterparty = counterpartyById || counterpartyByNick;
  const { data: liveDetail } = useBinanceOrderDetail(order.binance_order_number);
  const { data: storedRiskSnapshot } = useBinanceOrderRiskSnapshot(order.binance_order_number);
  const { data: commissionSnapshots } = useOrderCommissionSnapshots(order.binance_order_number);
  const { data: historyOrder } = useBinanceOrderLiveStatus(order.binance_order_number);
  const { data: chatMessages } = useBinanceChatMessages(order.binance_order_number);

  const hasPaymentMarkedSignal = useMemo(() => {
    const extractItems = (response: unknown): any[] => {
      if (!response || typeof response !== 'object') return [];
      if (Array.isArray(response)) return response;
      const r = response as Record<string, any>;
      if (Array.isArray(r.data)) return r.data;
      if (r.data && typeof r.data === 'object' && Array.isArray((r.data as Record<string, any>).data)) {
        return (r.data as Record<string, any>).data;
      }
      return [];
    };

    const PAYMENT_SIGNALS = ['seller_payed', 'buyer_payed', 'buyer_paid'];
    const items = extractItems(chatMessages);
    return items.some((m: any) => {
      const msgType = String(m?.type || m?.chatMessageType || '').toLowerCase();
      const isSystem = msgType === 'system' || msgType === 'sys' || msgType === 'order_system';
      const content = m?.content || m?.message || '';

      // Check JSON-parsed content
      if (isSystem && content) {
        try {
          const parsed = JSON.parse(content);
          const t = String(parsed?.type || '').toLowerCase();
          if (PAYMENT_SIGNALS.includes(t)) return true;
        } catch {
          // Not JSON — check raw string
        }
      }

      // Check raw text content for payment confirmation keywords
      const lower = String(content).toLowerCase();
      if (lower.includes('buyer has marked payment') || lower.includes('marked payment as completed')) {
        return true;
      }

      // Check chatMessageType directly (some Binance versions use this)
      const directType = String(m?.chatMessageType || '').toLowerCase();
      if (PAYMENT_SIGNALS.includes(directType)) return true;

      return false;
    });
  }, [chatMessages]);

  const liveOrder = useMemo(() => {
    let liveStatus = order.order_status;
    if (historyOrder?.orderStatus && typeof historyOrder.orderStatus === 'string') {
      liveStatus = historyOrder.orderStatus.toUpperCase();
    } else if (liveDetail?.data) {
      const detail = liveDetail.data;
      const raw = detail.orderStatus ?? detail.tradeStatus ?? detail.status;
      if (raw !== undefined && raw !== null && String(raw).length > 0) {
        liveStatus = normaliseBinanceStatus(raw);
      }
    }

    const normalized = String(liveStatus || '').toUpperCase();
    const isStuckInPrePaidState =
      normalized.includes('PENDING') ||
      normalized.includes('TRADING') ||
      normalized.includes('EXPIRED') ||
      normalized.includes('TIMEOUT');

    // Binance occasionally lags on orderStatus while chat already has payment confirmation.
    // In that mismatch case, surface as BUYER_PAYED so SELL-side Release action is available.
    if (hasPaymentMarkedSignal && isStuckInPrePaidState) {
      liveStatus = 'BUYER_PAYED';
    }

    let unitPrice = order.unit_price;
    if (historyOrder?.unitPrice) {
      unitPrice = parseFloat(historyOrder.unitPrice) || unitPrice;
    }
    return { ...order, order_status: liveStatus, unit_price: unitPrice };
  }, [order, liveDetail, historyOrder, hasPaymentMarkedSignal]);

  const counterpartyVerifiedName = useMemo(() => {
    const detail = liveDetail?.data;
    if (!detail) return undefined;
    return order.trade_type === 'BUY' ? detail.sellerName : detail.buyerName;
  }, [liveDetail, order.trade_type]);
  const { data: binanceStats } = useCounterpartyBinanceStats(order.binance_order_number, {
    counterpartyNickname: order.counterparty_nickname,
    verifiedName: counterpartyVerifiedName,
  });

  const topBar = (
    <div className="flex items-center justify-between px-3 md:px-4 py-2 border-b border-border bg-card">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs font-medium text-foreground">
          Order #{order.binance_order_number.slice(-8)}
        </span>
        <span className={`text-[10px] font-semibold ${order.trade_type === 'BUY' ? 'text-trade-buy' : 'text-trade-sell'}`}>
          {order.trade_type}
        </span>
      </div>
    </div>
  );

  const chatContent = (
    <ChatPanel
      orderId={order.id}
      orderNumber={order.binance_order_number}
      counterpartyId={order.counterparty_id}
      counterpartyNickname={order.counterparty_nickname}
      tradeType={order.trade_type}
      counterpartyVerifiedName={counterpartyVerifiedName}
    />
  );

  const rightPanelContent = (
    <>
      <div className="px-2 py-2 border-b border-border">
        <Tabs value={rightPanel} onValueChange={(v) => setRightPanel(v as any)}>
          <TabsList className="w-full h-8 bg-secondary">
            <TabsTrigger value="internal" className="text-[10px] h-6 flex-1 gap-1">
              <Users className="h-3 w-3" />
              Internal
            </TabsTrigger>
            <TabsTrigger value="profile" className="text-[10px] h-6 flex-1 gap-1">
              <User className="h-3 w-3" />
              Profile
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {rightPanel === 'internal' ? (
        <div className="flex-1 overflow-hidden flex flex-col">
          <InternalChatPanel orderNumber={order.binance_order_number} advNo={order.binance_adv_no} totalPrice={order.total_price} tradeType={order.trade_type} />
        </div>
      ) : (
        <CounterpartyProfile counterparty={counterparty} order={order} binanceStats={binanceStats} counterpartyNickname={order.counterparty_nickname} counterpartyVerifiedName={counterpartyVerifiedName} liveDetail={liveDetail?.data} storedRiskSnapshot={storedRiskSnapshot} commissionSnapshots={commissionSnapshots} />
      )}
    </>
  );

  // Mobile layout: tabbed single-panel view
  if (isMobile) {
    return (
      <div className="flex flex-col h-full">
        {topBar}
        <div className="px-2 py-1.5 border-b border-border bg-card shrink-0">
          <Tabs value={mobileTab} onValueChange={(v) => setMobileTab(v as any)}>
            <TabsList className="w-full h-8 bg-secondary">
              <TabsTrigger value="details" className="text-[10px] h-6 flex-1 gap-1">
                <FileText className="h-3 w-3" />
                Details
              </TabsTrigger>
              <TabsTrigger value="chat" className="text-[10px] h-6 flex-1 gap-1">
                <MessageSquare className="h-3 w-3" />
                Chat
              </TabsTrigger>
              <TabsTrigger value="internal" className="text-[10px] h-6 flex-1 gap-1">
                <Users className="h-3 w-3" />
                Internal
              </TabsTrigger>
              <TabsTrigger value="profile" className="text-[10px] h-6 flex-1 gap-1">
                <User className="h-3 w-3" />
                Profile
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex-1 overflow-hidden flex flex-col">
          {mobileTab === 'details' && (
            <div className="h-full overflow-y-auto bg-card">
              <OrderSummaryPanel order={liveOrder} counterpartyVerifiedName={counterpartyVerifiedName} liveDetail={liveDetail?.data} />
            </div>
          )}
          {mobileTab === 'chat' && (
            <div className="h-full flex flex-col min-w-0 bg-background">
              {chatContent}
            </div>
          )}
          {mobileTab === 'internal' && (
            <div className="h-full flex flex-col min-w-0 bg-background">
              <InternalChatPanel orderNumber={order.binance_order_number} advNo={order.binance_adv_no} totalPrice={order.total_price} tradeType={order.trade_type} />
            </div>
          )}
          {mobileTab === 'profile' && (
            <div className="h-full overflow-hidden flex flex-col bg-card">
              <CounterpartyProfile counterparty={counterparty} order={order} binanceStats={binanceStats} counterpartyNickname={order.counterparty_nickname} counterpartyVerifiedName={counterpartyVerifiedName} liveDetail={liveDetail?.data} storedRiskSnapshot={storedRiskSnapshot} commissionSnapshots={commissionSnapshots} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Desktop layout (unchanged 3-panel)
  return (
    <div className="flex flex-col h-full">
      {topBar}
      <div className="flex flex-1 overflow-hidden">
        <div className="w-[280px] border-r border-border overflow-y-auto bg-card shrink-0">
          <OrderSummaryPanel order={liveOrder} counterpartyVerifiedName={counterpartyVerifiedName} liveDetail={liveDetail?.data} />
        </div>
        <div className="flex-1 flex flex-col min-w-0 bg-background">
          {chatContent}
        </div>
        <div className="w-[280px] border-l border-border overflow-hidden bg-card shrink-0 flex flex-col">
          {rightPanelContent}
        </div>
      </div>
    </div>
  );
}

function formatBinanceAccountAge(registerDays: any) {
  const days = registerDays === null || registerDays === undefined || registerDays === '' ? null : Number(registerDays);
  return days === null || Number.isNaN(days) ? null : `${days} days`;
}

function CounterpartyProfile({ counterparty, order, binanceStats, counterpartyNickname, counterpartyVerifiedName, liveDetail, storedRiskSnapshot, commissionSnapshots }: { counterparty: any; order: P2POrderRecord; binanceStats: any; counterpartyNickname: string; counterpartyVerifiedName?: string; liveDetail?: any; storedRiskSnapshot?: any; commissionSnapshots?: any[] }) {
  const [showMoreBinanceData, setShowMoreBinanceData] = useState(false);
  const { data: completedWithUs } = useCounterpartyCompletedOrderCount(counterpartyVerifiedName, order.binance_order_number);
  const { data: linkedClient } = useCounterpartyLinkedClient(
    counterpartyNickname,
    counterpartyVerifiedName,
    order.trade_type as 'BUY' | 'SELL'
  );
  const riskKey = linkedClient?.risk_appetite && RISK_BADGE_STYLES[linkedClient.risk_appetite]
    ? linkedClient.risk_appetite
    : null;
  const riskStyle = riskKey ? RISK_BADGE_STYLES[riskKey] : null;
  // Parse Binance stats — API returns fields like completedOrderNum, finishRateLatest30Day, etc.
  const stats = binanceStats?.data || binanceStats;
  const hasApiStats = stats && (
    stats.completedOrderNum !== undefined ||
    stats.completedOrderNumOfLatest30day !== undefined ||
    stats.registerDays !== undefined
  );
  const storedStats = counterparty?.binance_counterparty_stats_raw || null;
  const binanceAccountAge = formatBinanceAccountAge((hasApiStats ? stats : storedStats)?.registerDays ?? counterparty?.binance_register_days);
  const riskSnapshot = buildRiskSnapshot(order.trade_type, liveDetail, storedRiskSnapshot?.counterparty_risk_snapshot);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* User identity */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
          <User className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{order.counterparty_nickname}</p>
          <p className="text-[10px] text-muted-foreground">Binance P2P User</p>
        </div>
      </div>

      {/* Registration & join info */}
      {hasApiStats && stats.registerDays !== undefined && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>Joined {stats.registerDays} days ago</span>
        </div>
      )}

      {/* Trade relationship with us */}
      {completedWithUs !== undefined && completedWithUs !== null && (
        <div className="bg-primary/5 border border-primary/20 rounded-md px-3 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-medium text-foreground">Orders Completed With Us</span>
          </div>
          <span className="text-sm font-bold text-primary tabular-nums">{completedWithUs}</span>
        </div>
      )}

      {/* Approved client risk level — SELL orders only (counterparty is the buyer/client) */}
      {riskStyle && order.trade_type === 'SELL' && (
        <div className={`rounded-md border px-3 py-2.5 flex items-center justify-between gap-2 ${riskStyle.className}`}>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-[11px] font-medium truncate">Client Risk Level</span>
              {linkedClient?.name && (
                <span className="text-[10px] opacity-80 truncate">
                  {linkedClient.name}
                </span>
              )}
            </div>
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wide shrink-0 whitespace-nowrap">
            {riskStyle.label}
          </span>
        </div>
      )}

      {/* Binance Trading Stats */}
      {hasApiStats && (
        <div className="space-y-3 pt-3 border-t border-border">
          <div className="flex items-center gap-1.5 mb-2">
            <BarChart3 className="h-3 w-3 text-primary" />
            <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">Trading Stats</span>
          </div>

          {/* Key stat cards */}
          <div className="grid grid-cols-2 gap-2">
            {stats.completedOrderNum !== undefined && (
              <StatCard
                label="All Trades"
                value={`${stats.completedOrderNum}`}
              />
            )}
            {stats.completedOrderNumOfLatest30day !== undefined && (
              <StatCard
                label="30d Trades"
                value={`${stats.completedOrderNumOfLatest30day}`}
              />
            )}
            {stats.finishRateLatest30Day !== undefined && (
              <StatCard label="30d Completion" value={`${(Number(stats.finishRateLatest30Day) * 100).toFixed(1)}%`} />
            )}
            {stats.finishRate !== undefined && (
              <StatCard label="Overall Rate" value={`${(Number(stats.finishRate) * 100).toFixed(1)}%`} />
            )}
          </div>

          {/* Timing stats */}
          <div className="space-y-2 pt-2">
            {binanceAccountAge && (
              <StatRow
                label="Account Age"
                value={binanceAccountAge}
              />
            )}
            {stats.avgReleaseTimeOfLatest30day !== undefined && (
              <StatRow
                label="Avg Release (30d)"
                value={stats.avgReleaseTimeOfLatest30day === 0
                  ? '0 min'
                  : `${(stats.avgReleaseTimeOfLatest30day / 60).toFixed(1)} min`}
              />
            )}
            {stats.avgReleaseTime !== undefined && stats.avgReleaseTime > 0 && (
              <StatRow
                label="Avg Release (All)"
                value={`${(stats.avgReleaseTime / 60).toFixed(1)} min`}
              />
            )}
            {stats.avgPayTimeOfLatest30day !== undefined && (
              <StatRow
                label="Avg Pay Time (30d)"
                value={`${(stats.avgPayTimeOfLatest30day / 60).toFixed(1)} min`}
              />
            )}
            {stats.avgPayTime !== undefined && stats.avgPayTime > 0 && (
              <StatRow
                label="Avg Pay Time (All)"
                value={`${(stats.avgPayTime / 60).toFixed(1)} min`}
              />
            )}
          </div>
        </div>
      )}

      {/* Local tracking stats */}
      {counterparty && (
        <div className="space-y-3 pt-3 border-t border-border">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Local Tracking</span>
          <StatRow label="Total Orders" value={String(counterparty.total_buy_orders + counterparty.total_sell_orders)} />
          <StatRow label="Buy Orders" value={String(counterparty.total_buy_orders)} />
          <StatRow label="Sell Orders" value={String(counterparty.total_sell_orders)} />
          <StatRow label="Total Volume" value={`₹${Number(counterparty.total_volume_inr).toLocaleString('en-IN')}`} />
          <StatRow label="First Seen" value={new Date(counterparty.first_seen_at).toLocaleDateString('en-IN')} />
          <StatRow label="Last Seen" value={new Date(counterparty.last_seen_at).toLocaleDateString('en-IN')} />
        </div>
      )}

      <div className="pt-3 border-t border-border">
        <Button variant="outline" size="sm" className="w-full h-8 justify-between text-[11px]" onClick={() => setShowMoreBinanceData((v) => !v)}>
          <span className="flex items-center gap-1.5"><ShieldAlert className="h-3 w-3" /> View more Binance data</span>
          <ChevronDown className={`h-3 w-3 transition-transform ${showMoreBinanceData ? 'rotate-180' : ''}`} />
        </Button>
        {showMoreBinanceData && (
          <div className="space-y-3">
            <OrderLevelBinanceDetails liveDetail={liveDetail} storedDetail={storedRiskSnapshot?.order_detail_raw} order={order} />
            <CommissionSnapshotDetails snapshots={commissionSnapshots || []} order={order} />
            <BinanceRiskDetails snapshot={riskSnapshot} capturedAt={storedRiskSnapshot?.counterparty_risk_captured_at} hasLiveDetail={!!liveDetail} />
          </div>
        )}
      </div>

      {/* PAN Collection - only for BUY orders */}
      {order.trade_type === 'BUY' && (
        <CounterpartyPanInput counterpartyNickname={order.counterparty_nickname} />
      )}

      {/* Contact & State Collection */}
      <CounterpartyContactInput counterpartyNickname={order.counterparty_nickname} />
    </div>
  );
}

function buildRiskSnapshot(tradeType: string, liveDetail?: any, storedSnapshot?: any) {
  if (storedSnapshot) return storedSnapshot;
  const detail = liveDetail?.data?.data || liveDetail?.data || liveDetail;
  if (!detail || typeof detail !== 'object') return null;
  const normalizedTradeType = String(tradeType || detail.tradeType || '').toUpperCase();
  const side = normalizedTradeType === 'BUY' ? 'seller' : normalizedTradeType === 'SELL' ? 'buyer' : null;
  const user = side ? (detail[side] || detail[`${side}Vo`] || detail[`${side}User`]) : null;
  const fallbackUser = user || detail.counterparty || detail.counterpartyUser || detail.maker || detail.taker || null;
  const normalizeUser = (u: any) => u ? ({
    historyStats: u.userOrderHistoryStatsVo || null,
    inProgressStats: u.userOrderInProgressStatsVo || null,
    kyc: u.userKycVo || null,
  }) : null;
  return {
    source: 'getUserOrderDetail',
    counterpartySide: side,
    topLevel: {
      maliceInitiatorCount: detail.maliceInitiatorCount ?? null,
      complaintCount: detail.complaintCount ?? null,
      overComplained: detail.overComplained ?? null,
      buyerCreditScore: detail.buyerCreditScore ?? null,
      sellerCreditScore: detail.sellerCreditScore ?? null,
      isRiskCount: detail.isRiskCount ?? null,
      idNumberMasked: detail.idNumber ? 'Available (masked in stored snapshot)' : null,
    },
    counterparty: normalizeUser(fallbackUser),
    maker: normalizeUser(detail.maker),
    taker: normalizeUser(detail.taker),
    availableFields: Object.keys(detail),
    missingSections: [
      !fallbackUser ? 'counterpartyRisk' : null,
      !(fallbackUser?.userKycVo || detail.maker?.userKycVo || detail.taker?.userKycVo) ? 'kyc' : null,
      !(fallbackUser?.userOrderHistoryStatsVo || detail.maker?.userOrderHistoryStatsVo || detail.taker?.userOrderHistoryStatsVo) ? 'historicalStats' : null,
    ].filter(Boolean),
  };
}

function OrderLevelBinanceDetails({ liveDetail, storedDetail, order }: { liveDetail?: any; storedDetail?: any; order: P2POrderRecord }) {
  const detail = liveDetail?.data?.data || liveDetail?.data || liveDetail || storedDetail;
  const hasValue = (v: any) => v !== null && v !== undefined && v !== '';
  const provided = (v: any) => hasValue(v) ? String(v) : 'Not provided by Binance';
  const formatTs = (v: any) => {
    const ms = Number(v || 0);
    return Number.isFinite(ms) && ms > 0 ? new Date(ms).toLocaleString('en-IN') : null;
  };
  const secondsToMinutes = (v: any) => hasValue(v) && Number.isFinite(Number(v)) ? `${(Number(v) / 60).toFixed(1)} min` : null;
  const statusLabel = (v: any) => {
    const map: Record<string, string> = { '1': 'Pending', '2': 'Trading', '3': 'Buyer paid', '4': 'Buyer paid', '5': 'Completed', '6': 'Cancelled', '7': 'Cancelled', '8': 'Appeal' };
    return hasValue(v) ? (map[String(v)] || String(v)) : null;
  };

  if (!detail || typeof detail !== 'object') {
    return <div className="mt-2 rounded-md border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">No order-level Binance detail is available for this order yet.</div>;
  }

  const paymentMethod = detail.payType || detail.payMethodName || detail.payMethods?.[0]?.tradeMethodName || detail.payMethods?.[0]?.identifier || order.pay_method_name;
  const additionalKyc = hasValue(detail.additionalKycVerify)
    ? ({ 0: 'Not required', 1: 'Required, not verified', 2: 'Required and verified' } as Record<string, string>)[String(detail.additionalKycVerify)] || String(detail.additionalKycVerify)
    : null;

  return (
    <div className="mt-2 space-y-3 rounded-md border border-border bg-muted/20 p-3">
      <RiskSection icon={<FileText className="h-3 w-3" />} title="Order-level Binance data">
        <StatRow label="Order status" value={provided(statusLabel(detail.orderStatus ?? detail.tradeStatus ?? detail.status))} />
        <StatRow label="Payment method" value={provided(paymentMethod)} />
        <StatRow label="Notify pay time" value={provided(formatTs(detail.notifyPayTime))} />
        <StatRow label="Confirm pay deadline" value={provided(formatTs(detail.confirmPayEndTime))} />
        <StatRow label="Complaint deadline" value={provided(formatTs(detail.complaintDeadline))} />
        <StatRow label="Complaint allowed" value={hasValue(detail.isComplaintAllowed) ? String(Boolean(detail.isComplaintAllowed)) : 'Not provided by Binance'} />
        <StatRow label="Avg release period" value={provided(secondsToMinutes(detail.avgReleasePeriod))} />
        <StatRow label="Avg pay period" value={provided(secondsToMinutes(detail.avgPayPeriod))} />
        <StatRow label="Online status" value={provided(detail.onlineStatus)} />
        <StatRow label="Additional KYC" value={provided(additionalKyc)} />
      </RiskSection>
      <div className="pt-2 border-t border-border/50 text-[10px] text-muted-foreground">
        Source: {liveDetail ? 'Live Binance order detail' : 'Stored Binance order detail'}
      </div>
    </div>
  );
}

function BinanceRiskDetails({ snapshot, capturedAt, hasLiveDetail }: { snapshot: any; capturedAt?: string | null; hasLiveDetail: boolean }) {
  const top = snapshot?.topLevel || {};
  const counterparty = snapshot?.counterparty || {};
  const history = counterparty.historyStats || snapshot?.maker?.historyStats || snapshot?.taker?.historyStats || {};
  const progress = counterparty.inProgressStats || snapshot?.maker?.inProgressStats || snapshot?.taker?.inProgressStats || {};
  const kyc = counterparty.kyc || snapshot?.maker?.kyc || snapshot?.taker?.kyc || {};
  const hasValue = (v: any) => v !== null && v !== undefined && v !== '';
  const hasAny = (obj: any, keys: string[]) => keys.some((key) => hasValue(obj?.[key]));
  const provided = (v: any) => v !== null && v !== undefined && v !== '' ? String(v) : 'Not provided by Binance';
  const pct = (v: any) => v !== null && v !== undefined && v !== '' ? `${(Number(v) * 100).toFixed(2)}%` : 'Not provided by Binance';
  const minutes = (v: any) => v !== null && v !== undefined && Number(v) > 0 ? `${(Number(v) / 60).toFixed(1)} min` : provided(v);
  const warningCount = Number(top.maliceInitiatorCount || 0) + Number(progress.inAppealCountAfterBuyerPaid || 0) + (top.overComplained ? 1 : 0);
  const hasTopRisk = hasAny(top, ['maliceInitiatorCount', 'complaintCount', 'overComplained', 'buyerCreditScore', 'sellerCreditScore']);
  const hasHistory = hasAny(history, ['accountAge', 'registerDays', 'appealedOrderCountHistorical', 'appealedOrderCountLast30Days', 'appealedRateHistorical', 'finishRateLatest30Day', 'avgPayTime', 'avgReleaseTime']);
  const hasProgress = hasAny(progress, ['inAppealCountAfterBuyerPaid', 'inAppealCount', 'buyerPayedCount', 'tradingCount', 'inProcessCount']);
  const hasKyc = hasAny(kyc, ['kycLevel', 'kycType', 'kycStatus', 'identityStatus', 'faceStatus', 'companyName']) || hasValue(top.idNumberMasked);

  if (!snapshot) {
    return <div className="mt-2 rounded-md border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">No extended Binance detail is available for this order yet.</div>;
  }

  if (!hasTopRisk && !hasHistory && !hasProgress && !hasKyc) {
    return <div className="mt-2 rounded-md border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">Binance did not return counterparty risk/KYC detail for this order through the current API response.</div>;
  }

  return (
    <div className="mt-2 space-y-3 rounded-md border border-border bg-muted/20 p-3">
      {warningCount > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive flex gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>Binance returned elevated risk signals for this counterparty/order.</span>
        </div>
      )}
      <RiskSection icon={<ShieldAlert className="h-3 w-3" />} title="Risk warnings">
        <StatRow label="Malice initiator count" value={provided(top.maliceInitiatorCount)} />
        <StatRow label="Complaint count" value={provided(top.complaintCount)} />
        <StatRow label="Over complained" value={provided(top.overComplained)} />
        <StatRow label="Appeals after paid" value={provided(progress.inAppealCountAfterBuyerPaid)} />
        <StatRow label="Buyer credit score" value={provided(top.buyerCreditScore)} />
        <StatRow label="Seller credit score" value={provided(top.sellerCreditScore)} />
      </RiskSection>
      <RiskSection icon={<BarChart3 className="h-3 w-3" />} title="Historical stats">
        <StatRow label="Account age" value={provided(history.accountAge ?? history.registerDays)} />
        <StatRow label="Historical appeals" value={provided(history.appealedOrderCountHistorical)} />
        <StatRow label="30d appeals" value={provided(history.appealedOrderCountLast30Days)} />
        <StatRow label="Historical appeal rate" value={pct(history.appealedRateHistorical)} />
        <StatRow label="30d finish rate" value={pct(history.finishRateLatest30Day)} />
        <StatRow label="Avg pay / release" value={`${minutes(history.avgPayTime)} / ${minutes(history.avgReleaseTime)}`} />
      </RiskSection>
      <RiskSection icon={<Activity className="h-3 w-3" />} title="Current activity">
        <StatRow label="In appeal" value={provided(progress.inAppealCount)} />
        <StatRow label="Buyer paid count" value={provided(progress.buyerPayedCount)} />
        <StatRow label="Trading count" value={provided(progress.tradingCount)} />
        <StatRow label="In process count" value={provided(progress.inProcessCount)} />
      </RiskSection>
      <RiskSection icon={<IdCard className="h-3 w-3" />} title="KYC snapshot">
        <StatRow label="KYC level / type" value={`${provided(kyc.kycLevel)} / ${provided(kyc.kycType)}`} />
        <StatRow label="KYC status" value={provided(kyc.kycStatus)} />
        <StatRow label="Identity / face" value={`${provided(kyc.identityStatus)} / ${provided(kyc.faceStatus)}`} />
        <StatRow label="Company" value={provided(kyc.companyName)} />
        <StatRow label="ID number" value={provided(top.idNumberMasked)} />
      </RiskSection>
      <div className="pt-2 border-t border-border/50 text-[10px] text-muted-foreground">
        Source: {hasLiveDetail ? 'Live Binance detail' : 'Stored Binance snapshot'}{capturedAt ? ` • Captured ${new Date(capturedAt).toLocaleString('en-IN')}` : ''}
      </div>
    </div>
  );
}

function CommissionSnapshotDetails({ snapshots, order }: { snapshots: any[]; order: P2POrderRecord }) {
  const latest = snapshots?.[0];
  const provided = (v: any) => v !== null && v !== undefined && v !== '' ? String(v) : 'Not provided by Binance';
  const pct = (v: any) => v !== null && v !== undefined && v !== '' ? `${(Number(v) * 100).toFixed(4)}%` : 'Not provided by Binance';
  const amount = (v: any) => v !== null && v !== undefined && v !== '' ? `${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 8 })} ${latest?.commission_asset || order.asset}` : 'Not provided by Binance';
  const expected = latest?.effective_commission_rate && latest?.amount ? Number(latest.amount) * Number(latest.effective_commission_rate) : null;

  if (!latest) {
    return <div className="mt-2 rounded-md border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">No Binance commission-rate snapshot is available for this order yet.</div>;
  }

  return (
    <div className="mt-2 space-y-3 rounded-md border border-border bg-muted/20 p-3">
      {expected !== null && (
        <div className="rounded-md border border-border bg-muted/30 px-2.5 py-2 text-[11px] text-muted-foreground flex gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>Rate-based estimate is shown for audit context only; Binance returned actual commission separately.</span>
        </div>
      )}
      <RiskSection icon={<Activity className="h-3 w-3" />} title="Commission snapshot">
        <StatRow label="Payment method" value={provided(latest.pay_method_name || latest.pay_method_identifier)} />
        <StatRow label="Maker rate" value={pct(latest.maker_commission_rate)} />
        <StatRow label="Taker rate" value={pct(latest.taker_commission_rate)} />
        <StatRow label="Effective rate" value={pct(latest.effective_commission_rate)} />
        <StatRow label="Actual commission" value={amount(latest.actual_commission_amount)} />
        <StatRow label="Rate audit estimate" value={expected === null ? 'Not provided by Binance' : amount(expected)} />
      </RiskSection>
      <div className="pt-2 border-t border-border/50 text-[10px] text-muted-foreground">
        Source: {provided(latest.source_type)}{latest.captured_at ? ` • Captured ${new Date(latest.captured_at).toLocaleString('en-IN')}` : ''}
      </div>
    </div>
  );
}

function RiskSection({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-primary uppercase tracking-wider">{icon}{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function StatCard({ label, value, subValues }: { label: string; value: string; subValues?: string }) {
  return (
    <div className="bg-secondary/50 rounded-md px-2.5 py-2 text-center">
      <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-bold text-foreground tabular-nums">{value}</p>
      {subValues && (
        <p className="text-[9px] text-muted-foreground mt-0.5 tabular-nums">{subValues}</p>
      )}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground tabular-nums">{value}</span>
    </div>
  );
}
