import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock, FileWarning, MessageSquare, RefreshCw, ShieldOff, TimerReset } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { TerminalPermissionGate } from '@/components/terminal/TerminalPermissionGate';
import { OrderDetailWorkspace } from '@/components/terminal/orders/OrderDetailWorkspace';
import { callBinanceAds } from '@/hooks/useBinanceActions';
import { P2POrderRecord } from '@/hooks/useP2PTerminal';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';
import { supabase } from '@/integrations/supabase/client';
import { markOrderChatRead } from '@/lib/chat-read-state';
import { normaliseBinanceStatus } from '@/lib/orderStatusMapper';
import {
  AppealStatus,
  TerminalAppealCase,
  formatDuration,
  getAppealUserName,
  getElapsedMinutes,
  responseTimerOptions,
  useAddAppealNote,
  useAppealCaseEvents,
  useAppealCases,
  useAppealConfig,
  useCheckInAppealCase,
  useSetAppealTimer,
  useToggleAppealModule,
  useUpsertAppealCase,
} from '@/hooks/useTerminalAppeals';
import { toast } from 'sonner';

const statusLabels: Record<AppealStatus, string> = {
  requested: 'Requested',
  under_appeal: 'Under Appeal',
  respond_by_set: 'Response Timer Set',
  checked_in: 'Checked In',
  resolved: 'Resolved',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

type AppealOrderType = 'all' | 'smallBuy' | 'smallSell' | 'bigBuy' | 'bigSell';

interface RangeConfig {
  is_enabled: boolean;
  min_amount: number;
  max_amount: number;
}

const orderTypeLabels: Record<AppealOrderType, string> = {
  all: 'All Types',
  smallBuy: 'Small Buyer',
  smallSell: 'Small Sales',
  bigBuy: 'Big Buyer',
  bigSell: 'Big Sales',
};

function classifyAppealOrder(c: TerminalAppealCase, smallBuyConfig?: RangeConfig | null, smallSalesConfig?: RangeConfig | null): Exclude<AppealOrderType, 'all'> {
  const tradeType = String(c.trade_type || '').toUpperCase();
  const totalPrice = Number(c.total_price || 0);
  if (tradeType === 'BUY') {
    const isSmall = smallBuyConfig?.is_enabled && totalPrice >= smallBuyConfig.min_amount && totalPrice <= smallBuyConfig.max_amount;
    return isSmall ? 'smallBuy' : 'bigBuy';
  }
  const isSmall = smallSalesConfig?.is_enabled && totalPrice >= smallSalesConfig.min_amount && totalPrice <= smallSalesConfig.max_amount;
  return isSmall ? 'smallSell' : 'bigSell';
}

function appealCaseToOrderRecord(c: TerminalAppealCase): P2POrderRecord {
  return {
    id: c.order_number,
    binance_order_number: c.order_number,
    binance_adv_no: c.adv_no,
    counterparty_id: null,
    counterparty_nickname: c.counterparty_nickname || '',
    trade_type: c.trade_type || 'SELL',
    asset: c.asset || 'USDT',
    fiat_unit: c.fiat_unit || 'INR',
    amount: 0,
    total_price: Number(c.total_price || 0),
    unit_price: 0,
    commission: 0,
    order_status: c.binance_status || statusLabels[c.status] || c.status,
    pay_method_name: null,
    binance_create_time: c.appeal_started_at ? new Date(c.appeal_started_at).getTime() : null,
    is_repeat_client: false,
    repeat_order_count: 0,
    assigned_operator_id: null,
    order_type: null,
    synced_at: c.updated_at || new Date().toISOString(),
    completed_at: null,
    cancelled_at: null,
    created_at: c.created_at || new Date().toISOString(),
  };
}

export default function TerminalAppeals() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [orderType, setOrderType] = useState<AppealOrderType>('all');
  const [selectedCase, setSelectedCase] = useState<TerminalAppealCase | null>(null);
  const [chatOrder, setChatOrder] = useState<P2POrderRecord | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const { isSuperAdmin, isTerminalAdmin, hasPermission } = useTerminalAuth();
  const { data: config, isLoading: configLoading } = useAppealConfig();
  const toggleAppeal = useToggleAppealModule();
  const upsertAppeal = useUpsertAppealCase();
  const { data: cases = [], isLoading, refetch, isFetching } = useAppealCases({ status, search });
  const { data: smallBuyConfig } = useQuery({ queryKey: ['small-buys-config'], queryFn: async () => { const { data, error } = await supabase.from('small_buys_config' as any).select('is_enabled, min_amount, max_amount').limit(1).maybeSingle(); if (error) throw error; return data as unknown as RangeConfig | null; }, staleTime: 30_000 });
  const { data: smallSalesConfig } = useQuery({ queryKey: ['small-sales-config'], queryFn: async () => { const { data, error } = await supabase.from('small_sales_config' as any).select('is_enabled, min_amount, max_amount').limit(1).maybeSingle(); if (error) throw error; return data as unknown as RangeConfig | null; }, staleTime: 30_000 });
  const isEnabled = Boolean(config?.is_enabled);
  const canChat = hasPermission('terminal_orders_chat') || isTerminalAdmin;

  const visibleCases = useMemo(() => {
    if (orderType === 'all') return cases;
    return cases.filter((c) => classifyAppealOrder(c, smallBuyConfig, smallSalesConfig) === orderType);
  }, [cases, orderType, smallBuyConfig, smallSalesConfig]);

  const summary = useMemo(() => {
    const active = visibleCases.filter((c) => !['resolved', 'closed', 'cancelled'].includes(c.status));
    return {
      active: active.filter((c) => c.status !== 'requested').length,
      requests: active.filter((c) => c.status === 'requested').length,
      missingTimer: active.filter((c) => c.status === 'under_appeal' && c.response_timer_minutes === null && !c.response_timer_set_at).length,
      overdue: active.filter((c) => c.response_due_at && new Date(c.response_due_at).getTime() <= Date.now()).length,
      checkedToday: visibleCases.filter((c) => c.last_checked_in_at && new Date(c.last_checked_in_at).toDateString() === new Date().toDateString()).length,
    };
  }, [visibleCases]);

  const syncAppealOrders = async () => {
    setIsSyncing(true);
    try {
      // Binance/proxy currently returns live appeal orders as numeric status 7.
      // Include 8 defensively for older mappings, but do not send unsupported string filters.
      const resp: any = await callBinanceAds('listActiveOrders', { rows: 100, orderStatusList: [7, 8] });
      const list = Array.isArray(resp?.data?.data) ? resp.data.data : Array.isArray(resp?.data) ? resp.data : Array.isArray(resp) ? resp : [];
      const appealOrders = list.filter((o: any) => {
        const s = normaliseBinanceStatus(o.orderStatus || o.order_status);
        return s.includes('APPEAL') || s.includes('DISPUTE');
      });
      for (const order of appealOrders) {
        await upsertAppeal.mutateAsync({
          orderNumber: String(order.orderNumber || order.orderNo),
          source: 'binance_status',
          status: 'under_appeal',
          requestReason: 'Detected from Binance order status.',
          advNo: order.advNo || null,
          tradeType: order.tradeType || null,
          asset: order.asset || null,
          fiatUnit: order.fiat || order.fiatUnit || 'INR',
          totalPrice: Number(order.totalPrice || 0),
          counterpartyNickname: order.sellerNickname || order.buyerNickname || order.counterPartNickName || null,
          binanceStatus: normaliseBinanceStatus(order.orderStatus || order.order_status),
        });
      }
      await refetch();
      toast.success(appealOrders.length ? `${appealOrders.length} appeal order(s) synced` : 'No live Binance appeal orders found');
    } catch (err: any) {
      toast.error(`Appeal sync failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const openChatForCase = (caseItem: TerminalAppealCase) => {
    markOrderChatRead(caseItem.order_number);
    callBinanceAds('markOrderMessagesRead', { orderNo: caseItem.order_number }).catch((err) => {
      console.warn('Failed to mark Binance chat read:', err);
    });
    setChatOrder(appealCaseToOrderRecord(caseItem));
  };

  if (chatOrder) {
    return (
      <div className="h-[calc(100vh-48px)]">
        <OrderDetailWorkspace order={chatOrder} onClose={() => setChatOrder(null)} />
      </div>
    );
  }

  return (
    <TerminalPermissionGate permissions={['terminal_appeals_view']}>
      <div className="p-4 md:p-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg"><FileWarning className="h-5 w-5 text-primary" /></div>
            <div><h1 className="text-lg font-semibold text-foreground">Appeals</h1><p className="text-xs text-muted-foreground">Binance appeal orders and internal appeal requests</p></div>
          </div>
          <div className="flex items-center gap-2">
            {isSuperAdmin && <div className="flex items-center gap-2 rounded border border-border px-3 py-1.5"><span className="text-xs text-muted-foreground">Module</span><Switch checked={isEnabled} onCheckedChange={(v) => toggleAppeal.mutate(v)} disabled={toggleAppeal.isPending || configLoading} /></div>}
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh</Button>
            {hasPermission('terminal_appeals_manage') && isEnabled && <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={syncAppealOrders} disabled={isSyncing}><RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />Sync Binance Appeals</Button>}
          </div>
        </div>

        {!isEnabled ? <DisabledState /> : <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MetricCard label="Under Appeal" value={summary.active} icon={FileWarning} />
            <MetricCard label="Requests" value={summary.requests} icon={MessageSquare} />
            <MetricCard label="Timer Missing" value={summary.missingTimer} icon={AlertTriangle} tone="warning" />
            <MetricCard label="Overdue" value={summary.overdue} icon={TimerReset} tone="urgent" />
            <MetricCard label="Checked Today" value={summary.checkedToday} icon={CheckCircle2} tone="success" />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order, counterparty, Ad ID..." className="h-8 text-xs bg-secondary border-border max-w-sm" />
            <Select value={status} onValueChange={setStatus}><SelectTrigger className="h-8 w-[190px] text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem>{Object.entries(statusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
          </div>

          <Card className="bg-card border-border"><CardContent className="p-0">
            {isLoading ? <div className="p-6 space-y-3">{[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div> : cases.length === 0 ? <div className="py-16 text-center text-sm text-muted-foreground">No appeal cases found</div> : (
              <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="text-[10px]">Appeal Timer</TableHead><TableHead className="text-[10px]">Response Timer</TableHead><TableHead className="text-[10px]">Order</TableHead><TableHead className="text-[10px]">Amount</TableHead><TableHead className="text-[10px]">Counterparty</TableHead><TableHead className="text-[10px]">Source</TableHead><TableHead className="text-[10px]">Last Note</TableHead><TableHead className="text-right text-[10px]">Action</TableHead></TableRow></TableHeader><TableBody>{cases.map((c) => <AppealRow key={c.id} c={c} canChat={canChat} onOpen={() => setSelectedCase(c)} onChat={() => openChatForCase(c)} />)}</TableBody></Table></div>
            )}
          </CardContent></Card>
          <AppealDetailDialog caseItem={selectedCase} open={!!selectedCase} onOpenChange={(open) => !open && setSelectedCase(null)} />
        </>}
      </div>
    </TerminalPermissionGate>
  );
}

function DisabledState() {
  return <Card className="bg-card border-border"><CardContent className="py-20 flex flex-col items-center gap-3 text-center"><ShieldOff className="h-10 w-10 text-muted-foreground/40" /><div><p className="text-sm font-medium text-foreground">Appeal module is turned off</p><p className="text-xs text-muted-foreground mt-1">No appeal automation, sync, requests, timers, or case actions run while disabled.</p></div></CardContent></Card>;
}

function MetricCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: any; tone?: 'urgent' | 'warning' | 'success' }) {
  const toneClass = tone === 'urgent' ? 'text-destructive bg-destructive/10' : tone === 'warning' ? 'text-amber-500 bg-amber-500/10' : tone === 'success' ? 'text-emerald-500 bg-emerald-500/10' : 'text-primary bg-primary/10';
  return <Card><CardContent className="p-3 flex items-center justify-between"><div><p className="text-[10px] text-muted-foreground">{label}</p><p className="text-xl font-semibold tabular-nums">{value}</p></div><div className={`p-2 rounded ${toneClass}`}><Icon className="h-4 w-4" /></div></CardContent></Card>;
}

function AppealRow({ c, canChat, onOpen, onChat }: { c: TerminalAppealCase; canChat: boolean; onOpen: () => void; onChat: () => void }) {
  const age = getElapsedMinutes(c.appeal_started_at);
  const responseExpired = !!c.response_due_at && new Date(c.response_due_at).getTime() <= Date.now();
  const needsTimer = c.status === 'under_appeal' && c.response_timer_minutes === null && !c.response_timer_set_at;
  const canCheckIn = needsTimer || responseExpired;
  return <TableRow className="cursor-pointer hover:bg-secondary/40" onClick={onOpen}>
    <TableCell><Badge variant="outline" className="text-[10px] tabular-nums border-primary/30 text-primary bg-primary/5"><Clock className="h-3 w-3 mr-1" />{formatDuration(age)}</Badge></TableCell>
    <TableCell>{needsTimer ? <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive bg-destructive/5 animate-pulse">Select timer</Badge> : c.response_due_at ? <Badge variant="outline" className={`text-[10px] tabular-nums ${responseExpired ? 'border-destructive/30 text-destructive bg-destructive/5 animate-pulse' : 'border-amber-500/30 text-amber-500 bg-amber-500/5'}`}>{responseExpired ? 'Overdue' : formatDuration(Math.max(0, Math.floor((new Date(c.response_due_at).getTime() - Date.now()) / 60000)))}</Badge> : c.response_timer_set_at ? <Badge variant="outline" className="text-[10px]">No timer · {getAppealUserName(c.timerSetBy)}</Badge> : <Badge variant="outline" className="text-[10px]">No timer</Badge>}</TableCell>
    <TableCell><div className="flex flex-col"><span className="text-xs font-mono text-foreground">{c.order_number}</span><span className="text-[10px] text-muted-foreground">{c.adv_no || 'No Ad ID'} · {c.binance_status || '—'}</span></div></TableCell>
    <TableCell><div className="text-xs tabular-nums">{Number(c.total_price || 0).toLocaleString('en-IN')} {c.fiat_unit || 'INR'}</div><div className="text-[10px] text-muted-foreground">{c.asset || 'USDT'}</div></TableCell>
    <TableCell className="text-xs">{c.counterparty_nickname || '—'}</TableCell>
    <TableCell><div className="flex flex-col gap-1"><Badge variant="secondary" className="w-fit text-[9px]">{statusLabels[c.status]}</Badge><Badge variant="outline" className="w-fit text-[9px]">{c.source === 'small_payment_request' ? `Requested by ${getAppealUserName(c.requester)}` : c.source === 'binance_status' ? 'Binance Appeal' : 'Manual Request'}</Badge></div></TableCell>
    <TableCell className="max-w-[220px]"><p className="text-[10px] text-muted-foreground truncate">{c.notes || c.request_reason || '—'}</p>{c.last_checked_in_at && <p className="text-[9px] text-muted-foreground/70">Checked {format(new Date(c.last_checked_in_at), 'dd MMM HH:mm')} by {getAppealUserName(c.checkedInBy)}</p>}</TableCell>
    <TableCell className="text-right"><div className="inline-flex items-center gap-1">{canCheckIn && <Button size="sm" className="h-7 text-[10px]" onClick={(e) => { e.stopPropagation(); onOpen(); }}>Check In</Button>}<Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={(e) => { e.stopPropagation(); onOpen(); }}>Manage</Button>{canChat && <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={(e) => { e.stopPropagation(); onChat(); }}><MessageSquare className="h-3 w-3" />Chat</Button>}</div></TableCell>
  </TableRow>;
}

function AppealDetailDialog({ caseItem, open, onOpenChange }: { caseItem: TerminalAppealCase | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [note, setNote] = useState('');
  const [checkInNote, setCheckInNote] = useState('');
  const [timerValue, setTimerValue] = useState<string>('');
  const { hasPermission } = useTerminalAuth();
  const { data: events = [] } = useAppealCaseEvents(caseItem?.id);
  const setTimer = useSetAppealTimer();
  const addNote = useAddAppealNote();
  const checkIn = useCheckInAppealCase();
  const responseExpired = !!caseItem?.response_due_at && new Date(caseItem.response_due_at).getTime() <= Date.now();
  const shouldShowCheckIn = !!caseItem && (responseExpired || (caseItem.status === 'under_appeal' && caseItem.response_timer_minutes === null && !caseItem.response_timer_set_at));

  useEffect(() => {
    const isDue = !!caseItem?.response_due_at && new Date(caseItem.response_due_at).getTime() <= Date.now();
    const isMissingTimer = caseItem?.status === 'under_appeal' && caseItem.response_timer_minutes === null && !caseItem.response_timer_set_at;
    setTimerValue(isDue || isMissingTimer ? '' : caseItem?.response_timer_minutes == null ? (caseItem?.response_timer_set_at ? 'none' : '') : String(caseItem.response_timer_minutes));
    setNote('');
    setCheckInNote('');
  }, [caseItem?.id, caseItem?.response_timer_minutes, caseItem?.response_timer_set_at]);

  if (!caseItem) return null;
  const canManage = hasPermission('terminal_appeals_manage');
  const needsTimer = caseItem.status === 'under_appeal' && caseItem.response_timer_minutes === null && !caseItem.response_timer_set_at;
  const saveTimer = async () => { if (!timerValue) return toast.error('Select a response timer first'); await setTimer.mutateAsync({ caseId: caseItem.id, minutes: timerValue === 'none' ? null : Number(timerValue) }); };
  const saveNote = async () => { if (!note.trim()) return; await addNote.mutateAsync({ caseId: caseItem.id, note: note.trim() }); setNote(''); };
  const doCheckIn = async () => { if (!timerValue || timerValue === 'none') return toast.error('Assign the next response timer before check-in'); await setTimer.mutateAsync({ caseId: caseItem.id, minutes: Number(timerValue) }); await checkIn.mutateAsync({ caseId: caseItem.id, note: checkInNote.trim() || `Next check-in timer set for ${responseTimerOptions.find((o) => o.value === timerValue)?.label || `${timerValue} minutes`}` }); setCheckInNote(''); };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-5xl max-h-[86vh] overflow-y-auto"><DialogHeader><DialogTitle className="text-base">Appeal Case · {caseItem.order_number}</DialogTitle></DialogHeader><div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <div className="space-y-3"><Card><CardContent className="p-4 space-y-3"><div className="flex items-center gap-2 flex-wrap"><Badge variant="secondary">{statusLabels[caseItem.status]}</Badge><Badge variant="outline" className="tabular-nums">Appeal age {formatDuration(getElapsedMinutes(caseItem.appeal_started_at))}</Badge>{needsTimer && <Badge variant="outline" className="border-destructive/30 text-destructive bg-destructive/5 animate-pulse">Select response timer</Badge>}</div><div className="grid grid-cols-2 gap-2 text-xs"><Info label="Amount" value={`${Number(caseItem.total_price || 0).toLocaleString('en-IN')} ${caseItem.fiat_unit || 'INR'}`} /><Info label="Asset" value={caseItem.asset || 'USDT'} /><Info label="Counterparty" value={caseItem.counterparty_nickname || '—'} /><Info label="Binance Status" value={caseItem.binance_status || '—'} /><Info label="Requested By" value={getAppealUserName(caseItem.requester)} /><Info label="Detected/Started" value={format(new Date(caseItem.appeal_started_at), 'dd MMM HH:mm')} /></div>{caseItem.request_reason && <p className="text-xs text-muted-foreground border-t border-border pt-2">{caseItem.request_reason}</p>}</CardContent></Card>
      <Card><CardContent className="p-4 space-y-3"><p className="text-xs font-medium">Response Timer</p><div className="flex gap-2"><Select value={timerValue} onValueChange={setTimerValue} disabled={!canManage}><SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select timer" /></SelectTrigger><SelectContent>{responseTimerOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select><Button size="sm" className="h-8 text-xs" onClick={saveTimer} disabled={!canManage || setTimer.isPending}>Save</Button></div>{caseItem.response_due_at ? <p className="text-[10px] text-muted-foreground">Due {format(new Date(caseItem.response_due_at), 'dd MMM HH:mm')} · set by {getAppealUserName(caseItem.timerSetBy)}</p> : caseItem.response_timer_set_at ? <p className="text-[10px] text-muted-foreground">No timer selected by {getAppealUserName(caseItem.timerSetBy)} at {format(new Date(caseItem.response_timer_set_at), 'dd MMM HH:mm')}</p> : <p className="text-[10px] text-destructive">Response timer not selected yet</p>}</CardContent></Card>
      {shouldShowCheckIn && <Card><CardContent className="p-4 space-y-2"><p className="text-xs font-medium">Check In</p><Select value={timerValue} onValueChange={setTimerValue} disabled={!canManage}><SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Assign next timer" /></SelectTrigger><SelectContent>{responseTimerOptions.filter((o) => o.value !== 'none').map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select><Textarea value={checkInNote} onChange={(e) => setCheckInNote(e.target.value)} placeholder="Check-in note..." className="text-xs" disabled={!canManage} /><Button size="sm" className="h-8 text-xs" onClick={doCheckIn} disabled={!canManage || checkIn.isPending || setTimer.isPending}>Check In</Button></CardContent></Card>}</div>
    <div className="space-y-3"><Card><CardContent className="p-4 space-y-2"><p className="text-xs font-medium">Shift Note</p><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add handover note for next shift..." className="text-xs" disabled={!canManage} /><Button size="sm" className="h-8 text-xs" onClick={saveNote} disabled={!canManage || addNote.isPending}>Add Note</Button></CardContent></Card><Card><CardContent className="p-4 space-y-2"><p className="text-xs font-medium">Event History</p><div className="space-y-2 max-h-80 overflow-y-auto">{events.map((e: any) => <div key={e.id} className="text-[10px] border-b border-border pb-1"><span className="font-medium">{e.event_type}</span> · {format(new Date(e.created_at), 'dd MMM HH:mm')} · {getAppealUserName(e.actor)}{e.note && <div className="text-muted-foreground mt-0.5">{e.note}</div>}</div>)}</div></CardContent></Card></div>
  </div></DialogContent></Dialog>;
}

function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] text-muted-foreground">{label}</p><p className="text-xs text-foreground truncate">{value}</p></div>; }
