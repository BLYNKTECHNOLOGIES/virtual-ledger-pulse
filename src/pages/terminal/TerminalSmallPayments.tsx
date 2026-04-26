import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, CheckCircle2, Clock, CreditCard, FileWarning, MessageSquare, RefreshCw, Search, TimerReset } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { TerminalPermissionGate } from '@/components/terminal/TerminalPermissionGate';
import { OrderDetailWorkspace } from '@/components/terminal/orders/OrderDetailWorkspace';
import { P2POrderRecord } from '@/hooks/useP2PTerminal';
import { formatCaseAge, getCaseAgeMinutes, getUserName, SmallPaymentCase, SmallPaymentCaseStatus, useLogSmallPaymentCaseEvent, useSmallPaymentCaseEvents, useSmallPaymentCases, useUpdateSmallPaymentCaseStatus } from '@/hooks/useSmallPaymentsManager';
import { useAppealConfig, useRequestAppealFromSmallPayment } from '@/hooks/useTerminalAppeals';
import { useTerminalAuth } from '@/hooks/useTerminalAuth';
import { toast } from 'sonner';

const statusLabels: Record<string, string> = {
  open: 'Open', waiting_counterparty: 'Waiting Counterparty', awaiting_refund: 'Awaiting Refund', ready_to_repay: 'Ready to Re-pay', resolved: 'Resolved', closed: 'Closed', cancelled: 'Cancelled', appeal: 'Appeal',
};

const caseTypeLabels: Record<string, string> = {
  post_payment_followup: 'Post Payment', alternate_upi_needed: 'Alternate UPI', payment_not_received: 'Payment Not Received', awaiting_refund: 'Awaiting Refund', invalid_upi: 'Invalid UPI', unresponsive_counterparty: 'Unresponsive', appeal_risk: 'Appeal Risk', other: 'Other',
};

function getOrderStatusBadgeClass(status?: string | null) {
  const s = String(status || '').toUpperCase();
  if (s.includes('COMPLETED')) return 'border-emerald-500/30 text-emerald-500 bg-emerald-500/5';
  if (s.includes('CANCEL') || s.includes('EXPIRED')) return 'border-destructive/30 text-destructive bg-destructive/5';
  if (s.includes('APPEAL') || s.includes('DISPUTE')) return 'border-amber-500/30 text-amber-500 bg-amber-500/5';
  if (s.includes('BUYER_PAY') || s.includes('PAID') || s.includes('RELEAS')) return 'border-primary/30 text-primary bg-primary/5';
  return 'border-muted-foreground/30 text-muted-foreground bg-muted/5';
}

export default function TerminalSmallPayments() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [caseType, setCaseType] = useState('all');
  const [selectedCase, setSelectedCase] = useState<SmallPaymentCase | null>(null);
  const [chatOrder, setChatOrder] = useState<P2POrderRecord | null>(null);
  const { data: cases = [], isLoading, refetch, isFetching } = useSmallPaymentCases({ mineOnly: true, status, caseType });
  const { hasPermission, isTerminalAdmin } = useTerminalAuth();
  const canChat = hasPermission('terminal_orders_chat') || isTerminalAdmin;

  const filteredCases = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cases;
    return cases.filter((c) => [c.order_number, c.counterparty_nickname, c.adv_no, getUserName(c.manager), getUserName(c.payer)].some((v) => String(v || '').toLowerCase().includes(q)));
  }, [cases, search]);

  const summary = useMemo(() => {
    const open = cases.filter((c) => !['resolved', 'closed', 'cancelled'].includes(c.status));
    return {
      open: open.length,
      overdue: open.filter((c) => getCaseAgeMinutes(c) >= 30).length,
      refunds: open.filter((c) => c.status === 'awaiting_refund' || c.case_type === 'awaiting_refund').length,
      altUpi: open.filter((c) => c.case_type === 'alternate_upi_needed').length,
      closedToday: cases.filter((c) => ['resolved', 'closed'].includes(c.status) && new Date(c.updated_at).toDateString() === new Date().toDateString()).length,
    };
  }, [cases]);

  const openChatForCase = async (caseItem: SmallPaymentCase) => {
    if (!canChat) {
      toast.error('Chat permission is required');
      return;
    }

    const { data, error } = await supabase
      .from('p2p_order_records')
      .select('*')
      .eq('binance_order_number', caseItem.order_number)
      .maybeSingle();

    if (error) {
      toast.error(`Unable to open order chat: ${error.message}`);
      return;
    }

    setChatOrder((data as P2POrderRecord | null) || buildFallbackOrder(caseItem));
  };

  if (chatOrder) {
    return (
      <TerminalPermissionGate permissions={['terminal_small_payments_view']}>
        <div className="h-[calc(100vh-48px)]">
          <OrderDetailWorkspace order={chatOrder} onClose={() => setChatOrder(null)} preserveOrderStatus />
        </div>
      </TerminalPermissionGate>
    );
  }

  return (
    <TerminalPermissionGate permissions={['terminal_small_payments_view']}>
      <div className="p-4 md:p-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3"><div className="p-2 bg-primary/10 rounded-lg"><CreditCard className="h-5 w-5 text-primary" /></div><div><h1 className="text-lg font-semibold text-foreground">Small Payments Manager</h1><p className="text-xs text-muted-foreground">Post-payment exceptions, unreleased orders, and alternate UPI follow-up</p></div></div>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh</Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <MetricCard label="Open" value={summary.open} icon={Clock} />
          <MetricCard label="Overdue" value={summary.overdue} icon={TimerReset} tone="urgent" />
          <MetricCard label="Awaiting Refund" value={summary.refunds} icon={AlertTriangle} tone="warning" />
          <MetricCard label="Alt UPI" value={summary.altUpi} icon={RefreshCw} />
          <MetricCard label="Closed Today" value={summary.closedToday} icon={CheckCircle2} tone="success" />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-sm"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order, counterparty, manager..." className="h-8 pl-8 text-xs bg-secondary border-border" /></div>
          <Select value={status} onValueChange={setStatus}><SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active Only</SelectItem><SelectItem value="all">All Status</SelectItem>{Object.entries(statusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
          <Select value={caseType} onValueChange={setCaseType}><SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Case Types</SelectItem>{Object.entries(caseTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
        </div>

        <Card className="bg-card border-border"><CardContent className="p-0">
          {isLoading ? <div className="p-6 space-y-3">{[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div> : filteredCases.length === 0 ? <div className="py-16 text-center text-sm text-muted-foreground">No small payment cases found</div> : (
            <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="text-[10px]">Timer</TableHead><TableHead className="text-[10px]">Order</TableHead><TableHead className="text-[10px]">Amount</TableHead><TableHead className="text-[10px]">Counterparty</TableHead><TableHead className="text-[10px]">Case</TableHead><TableHead className="text-[10px]">People</TableHead><TableHead className="text-[10px]">Last Action</TableHead><TableHead className="text-right text-[10px]">Action</TableHead></TableRow></TableHeader><TableBody>{filteredCases.map((c) => <CaseRow key={c.id} c={c} onOpen={() => setSelectedCase(c)} onChat={() => openChatForCase(c)} canChat={canChat} />)}</TableBody></Table></div>
          )}
        </CardContent></Card>

        <CaseDetailDialog caseItem={selectedCase} open={!!selectedCase} onOpenChange={(open) => !open && setSelectedCase(null)} onCaseUpdated={(patch) => setSelectedCase((current) => current ? { ...current, ...patch } : current)} />
      </div>
    </TerminalPermissionGate>
  );
}

function MetricCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: any; tone?: 'urgent' | 'warning' | 'success' }) {
  const toneClass = tone === 'urgent' ? 'text-destructive bg-destructive/10' : tone === 'warning' ? 'text-amber-500 bg-amber-500/10' : tone === 'success' ? 'text-emerald-500 bg-emerald-500/10' : 'text-primary bg-primary/10';
  return <Card><CardContent className="p-3 flex items-center justify-between"><div><p className="text-[10px] text-muted-foreground">{label}</p><p className="text-xl font-semibold tabular-nums">{value}</p></div><div className={`p-2 rounded ${toneClass}`}><Icon className="h-4 w-4" /></div></CardContent></Card>;
}

function CaseRow({ c, onOpen, onChat, canChat }: { c: SmallPaymentCase; onOpen: () => void; onChat: () => void; canChat: boolean }) {
  const age = getCaseAgeMinutes(c);
  const timerClass = age >= 30 ? 'border-destructive/30 text-destructive bg-destructive/5' : age >= 10 ? 'border-amber-500/30 text-amber-500 bg-amber-500/5' : 'border-primary/30 text-primary bg-primary/5';
  const orderStatus = c.current_order_status || c.binance_status || '—';
  return <TableRow className="cursor-pointer hover:bg-secondary/40" onClick={onOpen}><TableCell><Badge variant="outline" className={`text-[10px] tabular-nums ${timerClass}`}>{formatCaseAge(age)}</Badge></TableCell><TableCell><div className="flex flex-col gap-1"><span className="text-xs font-mono text-foreground">{c.order_number}</span><span className="text-[10px] text-muted-foreground">{c.adv_no || 'No Ad ID'}</span><Badge variant="outline" className={`w-fit text-[9px] ${getOrderStatusBadgeClass(orderStatus)}`}>Order: {orderStatus}</Badge></div></TableCell><TableCell><div className="text-xs tabular-nums">{Number(c.total_price || 0).toLocaleString('en-IN')} {c.fiat_unit || 'INR'}</div><div className="text-[10px] text-muted-foreground">{c.asset || 'USDT'}</div></TableCell><TableCell className="text-xs">{c.counterparty_nickname || '—'}</TableCell><TableCell><div className="flex flex-col gap-1"><Badge variant="outline" className="w-fit text-[9px]">{caseTypeLabels[c.case_type]}</Badge><Badge variant="secondary" className="w-fit text-[9px]">Case: {statusLabels[c.status]}</Badge></div></TableCell><TableCell><div className="text-[10px] text-muted-foreground">Payer: {getUserName(c.payer)}</div><div className="text-[10px] text-muted-foreground">Mgr: {getUserName(c.manager)}</div></TableCell><TableCell className="text-[10px] text-muted-foreground">{c.last_contacted_at ? `Contacted ${format(new Date(c.last_contacted_at), 'HH:mm')}` : c.last_checked_at ? `Checked ${format(new Date(c.last_checked_at), 'HH:mm')}` : '—'}</TableCell><TableCell className="text-right"><div className="flex justify-end gap-1.5"><Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={(e) => { e.stopPropagation(); onOpen(); }}>Manage</Button><Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={(e) => { e.stopPropagation(); onChat(); }} disabled={!canChat}><MessageSquare className="h-3 w-3" />Chat</Button></div></TableCell></TableRow>;
}

function buildFallbackOrder(c: SmallPaymentCase): P2POrderRecord {
  return {
    id: c.id,
    binance_order_number: c.order_number,
    binance_adv_no: c.adv_no,
    counterparty_id: null,
    counterparty_nickname: c.counterparty_nickname || 'Unknown',
    trade_type: 'BUY',
    asset: c.asset || 'USDT',
    fiat_unit: c.fiat_unit || 'INR',
    amount: 0,
    total_price: Number(c.total_price || 0),
    unit_price: 0,
    commission: 0,
    order_status: c.current_order_status || c.binance_status || 'TRADING',
    pay_method_name: null,
    binance_create_time: null,
    is_repeat_client: false,
    repeat_order_count: 0,
    assigned_operator_id: null,
    order_type: null,
    synced_at: c.updated_at,
    completed_at: null,
    cancelled_at: null,
    created_at: c.created_at,
  };
}

function CaseDetailDialog({ caseItem, open, onOpenChange, onCaseUpdated }: { caseItem: SmallPaymentCase | null; open: boolean; onOpenChange: (open: boolean) => void; onCaseUpdated: (patch: Partial<SmallPaymentCase>) => void }) {
  const [note, setNote] = useState('');
  const [appealReason, setAppealReason] = useState('');
  const { hasPermission } = useTerminalAuth();
  const { data: appealConfig } = useAppealConfig();
  const requestAppeal = useRequestAppealFromSmallPayment();
  const updateStatus = useUpdateSmallPaymentCaseStatus();
  const logEvent = useLogSmallPaymentCaseEvent();
  const { data: events = [] } = useSmallPaymentCaseEvents(caseItem?.id);
  if (!caseItem) return null;
  const setStatus = (status: SmallPaymentCaseStatus) => updateStatus.mutate(
    { id: caseItem.id, status },
    { onSuccess: () => onCaseUpdated({ status, updated_at: new Date().toISOString() }) }
  );
  const logCaseAction = (eventType: 'contacted' | 'checked') => logEvent.mutate(
    { caseId: caseItem.id, eventType },
    { onSuccess: () => onCaseUpdated({ [eventType === 'contacted' ? 'last_contacted_at' : 'last_checked_at']: new Date().toISOString() } as Partial<SmallPaymentCase>) }
  );
  const addNote = async () => { if (!note.trim()) return; await logEvent.mutateAsync({ caseId: caseItem.id, eventType: 'note_added', note: note.trim() }); setNote(''); toast.success('Note added'); };
  const canRequestAppeal = hasPermission('terminal_appeals_request') || hasPermission('terminal_appeals_manage');
  const submitAppeal = async () => { await requestAppeal.mutateAsync({ caseId: caseItem.id, reason: appealReason.trim() || 'Appeal requested from Small Payments Manager.' }); setAppealReason(''); };
  const orderStatus = caseItem.current_order_status || caseItem.binance_status || '—';

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-2xl max-h-[86vh] overflow-y-auto"><DialogHeader><DialogTitle className="text-base">Small Payment Case · {caseItem.order_number}</DialogTitle></DialogHeader><div className="space-y-3">
    <div className="space-y-3"><Card><CardContent className="p-4 space-y-2"><div className="flex items-center gap-2 flex-wrap"><Badge variant="outline">{caseTypeLabels[caseItem.case_type]}</Badge><Badge variant="secondary">Case: {statusLabels[caseItem.status]}</Badge><Badge variant="outline" className={getOrderStatusBadgeClass(orderStatus)}>Order: {orderStatus}</Badge><Badge variant="outline" className="tabular-nums">{formatCaseAge(getCaseAgeMinutes(caseItem))}</Badge></div><div className="grid grid-cols-2 gap-2 text-xs"><Info label="Amount" value={`${Number(caseItem.total_price || 0).toLocaleString('en-IN')} ${caseItem.fiat_unit || 'INR'}`} /><Info label="Asset" value={caseItem.asset || 'USDT'} /><Info label="Current Order Status" value={orderStatus} /><Info label="Counterparty" value={caseItem.counterparty_nickname || '—'} /><Info label="Marked Paid" value={caseItem.marked_paid_at ? format(new Date(caseItem.marked_paid_at), 'dd MMM HH:mm') : '—'} /><Info label="Payer" value={getUserName(caseItem.payer)} /><Info label="Manager" value={getUserName(caseItem.manager)} /></div></CardContent></Card>
      <Card><CardContent className="p-4 space-y-2"><p className="text-xs font-medium">Case Actions</p><div className="flex flex-wrap gap-2">{(['waiting_counterparty','awaiting_refund','ready_to_repay','resolved','closed','appeal'] as SmallPaymentCaseStatus[]).map((s) => <Button key={s} type="button" variant="outline" size="sm" className="h-7 text-[10px]" disabled={updateStatus.isPending} onClick={() => setStatus(s)}>{statusLabels[s]}</Button>)}<Button type="button" variant="outline" size="sm" className="h-7 text-[10px]" disabled={logEvent.isPending} onClick={() => logCaseAction('contacted')}>Mark Contacted</Button><Button type="button" variant="outline" size="sm" className="h-7 text-[10px]" disabled={logEvent.isPending} onClick={() => logCaseAction('checked')}>Mark Checked</Button></div><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note..." className="text-xs" /><Button type="button" size="sm" className="h-8 text-xs" onClick={addNote}>Add Note</Button></CardContent></Card>
      <Card><CardContent className="p-4 space-y-2"><div className="flex items-center gap-2"><FileWarning className="h-3.5 w-3.5 text-primary" /><p className="text-xs font-medium">Appeal Request</p></div><Textarea value={appealReason} onChange={(e) => setAppealReason(e.target.value)} placeholder="Reason for appeal request..." className="text-xs" disabled={!canRequestAppeal || !appealConfig?.is_enabled} /><Button size="sm" variant="outline" className="h-8 text-xs" onClick={submitAppeal} disabled={!canRequestAppeal || !appealConfig?.is_enabled || requestAppeal.isPending}>{appealConfig?.is_enabled ? 'Request Appeal' : 'Appeal Module Off'}</Button></CardContent></Card>
      <Card><CardContent className="p-4 space-y-2"><p className="text-xs font-medium">Event History</p><div className="space-y-2 max-h-48 overflow-y-auto">{events.map((e: any) => <div key={e.id} className="text-[10px] border-b border-border pb-1"><span className="font-medium">{e.event_type}</span> · {format(new Date(e.created_at), 'dd MMM HH:mm')}{e.note && <div className="text-muted-foreground mt-0.5">{e.note}</div>}</div>)}</div></CardContent></Card></div>
  </div></DialogContent></Dialog>;
}

function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] text-muted-foreground">{label}</p><p className="text-xs text-foreground truncate">{value}</p></div>; }