import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { CalendarClock, ClipboardList, Gift, FileText, Plus, XCircle, Landmark, Inbox } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BankChangeRequestCard } from './BankChangeRequestCard';
import { toast as sonnerToast } from 'sonner';
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import RequestLeaveDialog from './RequestLeaveDialog';
import { sendRegularizationEmail, regStageLabel, regCategoryLabel, REG_CATEGORIES } from '@/utils/regularizationEmail';
import {
  buildRegularizationWindow,
  validateRegularizationWindow,
} from '@/lib/regularizationWindow';
import { SectionBlock, StatusPill, ProfileEmptyState, ProfileSkeleton, type StatusTone } from './primitives';
import { invalidateLeaveCaches, useMyRegularizations } from './hooks';
import { fmtDay, fmtDays, fmtRange, fmtTime, humanize, leaveStage } from './format';
import { leaveCancelState } from './leave';


interface Props {
  employeeId: string;
  userId?: string;
  defaultHolderName?: string;
  /** Open the attendance-correction form (optionally for a given day) — set by the page's shortcuts. */
  openRegularization?: { date?: string; nonce: number } | null;
  onRegularizationOpened?: () => void;
}

type UnifiedRequest = {
  id: string;
  kind: 'leave' | 'regularization' | 'compoff';
  title: string;
  subtitle: string;
  date: string;
  status: string;
  raw: any;
  /** Presentation only. */
  stageLabel: string;
  tone: StatusTone;
  when: string;
  notes: Array<{ text: string; tone?: 'danger' | 'warning' | 'muted' }>;
};

/**
 * Phase 5 (ESS) — Unified Requests Hub.
 * Aggregates the three surfaces employees actually raise from ESS:
 *   • Leave requests               (hr_leave_requests)
 *   • Attendance regularizations   (hr_attendance_regularization_requests)
 *   • Comp-off credits             (hr_compoff_credits, read-only ledger)
 * Adds an in-hub "Raise regularization" action so employees don't have to
 * hunt through HRMS pages for it. Leave creation continues to live in the
 * Leaves tab (dedicated balance UX).
 */
export default function MyRequestsHub({ employeeId, userId, defaultHolderName, openRegularization, onRegularizationOpened }: Props) {
  const qc = useQueryClient();
  const [regOpen, setRegOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [regForm, setRegForm] = useState({
    attendance_date: '',
    requested_check_in: '',
    requested_check_out: '',
    reason_category: '',
    reason: '',
  });
  const [mode, setMode] = useState<'all' | 'pending' | 'approved' | 'closed'>('all');

  // Opened from a page shortcut ("Fix a punch", a missing punch-out on the overview).
  useEffect(() => {
    if (!openRegularization) return;
    setRegForm((p) => ({ ...p, attendance_date: openRegularization.date || p.attendance_date }));
    setRegOpen(true);
    onRegularizationOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRegularization?.nonce]);

  const regWindow = (() => {
    const w = buildRegularizationWindow(
      regForm.attendance_date,
      regForm.requested_check_in,
      regForm.requested_check_out,
    );
    return {
      error: validateRegularizationWindow(w),
      crossesMidnight: w.crossesMidnight,
      spanLabel: w.spanHours !== null ? `${w.spanHours.toFixed(1)} h` : '',
    };
  })();


  // ─── Leave requests ───
  const { data: leaves = [], isLoading: lLoading } = useQuery({
    queryKey: ['ess_hub_leaves', employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_leave_requests')
        .select('id, status, manager_status, manager_remarks, paid_days, unpaid_days, start_date, end_date, total_days, reason, rejection_reason, created_at, leave_type_id, hr_leave_types(name, color)')
        .eq('employee_id', employeeId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!employeeId,
  });

  // ─── Regularization requests (shared with the overview: same key and query) ───
  const { data: regs = [], isLoading: rLoading } = useMyRegularizations(employeeId);

  // ─── Comp-off credits ledger ───
  const today = new Date().toISOString().slice(0, 10);
  const { data: comps = [], isLoading: cLoading } = useQuery({
    queryKey: ['ess_hub_compoffs', employeeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('hr_compoff_credits')
        .select('*')
        .eq('employee_id', employeeId)
        .order('credit_date', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!employeeId,
  });

  const unified: UnifiedRequest[] = useMemo(() => {
    const l: UnifiedRequest[] = (leaves as any[]).map((r) => {
      const stage =
        r.status === 'requested'
          ? 'awaiting manager'
          : r.status === 'manager_approved'
            ? 'awaiting HR'
            : r.status;
      const split =
        r.status === 'approved' && (Number(r.unpaid_days) || 0) > 0
          ? ` · ${Number(r.paid_days || 0)}d paid / ${Number(r.unpaid_days || 0)}d unpaid`
          : '';
      const shown = leaveStage(r.status, r.manager_status);
      return {
        id: `l-${r.id}`,
        kind: 'leave' as const,
        title: r.hr_leave_types?.name || 'Leave',
        subtitle: `${r.total_days} day(s) · Your reason: ${r.reason || 'none given'}${split}${r.status === 'rejected' && r.rejection_reason ? ` · Reason for rejection: ${r.rejection_reason}` : ''}`,
        date: `${r.start_date} → ${r.end_date}`,
        status: stage,
        raw: r,
        stageLabel: shown.label,
        tone: shown.tone,
        when: `${fmtRange(r.start_date, r.end_date)} · ${fmtDays(r.total_days)} day${Number(r.total_days) === 1 ? '' : 's'}`,
        notes: [
          ...(r.reason ? [{ text: `“${r.reason}”`, tone: 'muted' as const }] : []),
          ...(split ? [{ text: `${Number(r.paid_days || 0)} day(s) paid · ${Number(r.unpaid_days || 0)} unpaid`, tone: 'warning' as const }] : []),
          ...(r.status === 'rejected' && r.rejection_reason ? [{ text: `Reason for rejection: ${r.rejection_reason}`, tone: 'danger' as const }] : []),
        ],
      };
    });
    const g: UnifiedRequest[] = (regs as any[]).map((r) => ({
      id: `r-${r.id}`,
      kind: 'regularization',
      title: 'Attendance correction',
      subtitle: `${regCategoryLabel(r.reason_category)}${r.reason ? ` · ${r.reason}` : ''}`,
      date: r.attendance_date,
      status: regStageLabel(r),
      raw: r,
      stageLabel: regStageLabel(r) === r.status ? humanize(r.status) : regStageLabel(r),
      tone: r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : r.status === 'cancelled' ? 'neutral' : 'warning',
      when: `${fmtDay(r.attendance_date)}${r.requested_check_in || r.requested_check_out ? ` · in ${fmtTime(r.requested_check_in)} · out ${fmtTime(r.requested_check_out)}` : ''}`,
      notes: [
        { text: `${regCategoryLabel(r.reason_category)}${r.reason ? ` · ${r.reason}` : ''}`, tone: 'muted' as const },
        ...(r.approver_notes ? [{ text: `HR: ${r.approver_notes}`, tone: (r.status === 'rejected' ? 'danger' : 'muted') as 'danger' | 'muted' }] : []),
      ],
    }));
    const c: UnifiedRequest[] = (comps as any[]).map((r) => {
      const expired = r.expires_at && r.expires_at < today;
      const status = r.is_allocated ? 'allocated' : expired ? 'expired' : 'pending';
      return {
        id: `c-${r.id}`,
        kind: 'compoff',
        title: `Comp-off credit · ${r.credit_type ? humanize(r.credit_type) : 'Sunday work'}`,
        subtitle: `+${Number(r.credit_days || 0).toFixed(1)}d · expires ${r.expires_at || '—'}`,
        date: r.credit_date,
        status,
        raw: r,
        stageLabel: status === 'allocated' ? 'Credited' : status === 'expired' ? 'Expired' : 'Pending',
        tone: status === 'allocated' ? 'success' : status === 'expired' ? 'neutral' : 'warning',
        when: `Earned ${fmtDay(r.credit_date)} · +${fmtDays(Number(r.credit_days || 0))} day`,
        notes: r.expires_at ? [{ text: `${expired ? 'Expired' : 'Expires'} ${fmtDay(r.expires_at)}`, tone: 'muted' as const }] : [],
      };
    });
    return [...l, ...g, ...c].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [leaves, regs, comps, today]);

  // ─── Cancel leave ───
  const cancelLeave = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('hr_leave_requests')
        .update({ status: 'cancelled' })
        .eq('id', id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('This request could not be cancelled. Refresh the page, or ask HR.');
    },
    onSuccess: () => {
      sonnerToast.success('Leave request cancelled');
      invalidateLeaveCaches(qc, employeeId);
    },
    onError: (e: any) => sonnerToast.error(e?.message || 'Failed to cancel'),
  });

  // ─── Cancel regularization ───
  const cancelReg = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('hr_attendance_regularization_requests')
        .update({ status: 'cancelled' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      sonnerToast.success('Regularization cancelled');
      qc.invalidateQueries({ queryKey: ['ess_hub_regs', employeeId] });
    },
    onError: (e: any) => sonnerToast.error(e?.message || 'Failed to cancel'),
  });

  // ─── Raise regularization ───
  const createReg = useMutation({
    mutationFn: async () => {
      if (!regForm.attendance_date || !regForm.reason.trim()) {
        throw new Error('Date and reason are required');
      }
      if (!regForm.reason_category) throw new Error('Pick a reason category');
      const win = buildRegularizationWindow(
        regForm.attendance_date,
        regForm.requested_check_in,
        regForm.requested_check_out,
      );
      const windowError = validateRegularizationWindow(win);
      if (windowError) throw new Error(windowError);
      const regIn = win.checkIn;
      const regOut = win.checkOut;

      const { data: inserted, error } = await (supabase as any)
        .from('hr_attendance_regularization_requests')
        .insert({
          employee_id: employeeId,
          attendance_date: regForm.attendance_date,
          requested_check_in: regIn,
          requested_check_out: regOut,

          reason: regForm.reason.trim(),
          reason_category: regForm.reason_category,
          source: 'ess',
          status: 'pending',
        })
        .select('id')
        .single();
      if (error) throw error;

      const { data: emp } = await (supabase as any)
        .from('hr_employees')
        .select('first_name, last_name')
        .eq('id', employeeId)
        .maybeSingle();

      sendRegularizationEmail({
        eventType: 'reg_requested',
        requestId: inserted?.id,
        employeeName: `${emp?.first_name || ''} ${emp?.last_name || ''}`.trim() || 'Employee',
        attendanceDate: regForm.attendance_date,
        requestedIn: regForm.requested_check_in || null,
        requestedOut: regForm.requested_check_out || null,
        reasonCategory: regCategoryLabel(regForm.reason_category),
        reason: regForm.reason.trim(),
      });
    },
    onSuccess: () => {
      sonnerToast.success('Regularization submitted');
      setRegForm({ attendance_date: '', requested_check_in: '', requested_check_out: '', reason_category: '', reason: '' });
      setRegOpen(false);
      qc.invalidateQueries({ queryKey: ['ess_hub_regs', employeeId] });
    },
    onError: (e: any) => sonnerToast.error(e?.message || 'Failed to submit'),
  });

  const isLoading = lLoading || rLoading || cLoading;

  const PENDING = [
    'pending', 'requested', 'awaiting manager', 'awaiting hr',
    'with reporting manager', 'manager approved · awaiting hr', 'manager rejected · awaiting hr',
  ];
  const isPending = (s: string) => PENDING.includes(s.toLowerCase());

  const counts = {
    all: unified.length,
    pending: unified.filter((r) => isPending(r.status)).length,
    approved: unified.filter((r) => ['approved', 'allocated'].includes(r.status.toLowerCase())).length,
    closed: unified.filter((r) => ['rejected', 'cancelled', 'expired'].includes(r.status.toLowerCase())).length,
  };

  const filterList = (mode: 'all' | 'pending' | 'approved' | 'closed') => {
    if (mode === 'all') return unified;
    if (mode === 'pending') return unified.filter((r) => isPending(r.status));
    if (mode === 'approved') return unified.filter((r) => ['approved', 'allocated'].includes(r.status.toLowerCase()));
    return unified.filter((r) => ['rejected', 'cancelled', 'expired'].includes(r.status.toLowerCase()));
  };

  const Row = ({ r }: { r: UnifiedRequest }) => {
    const Icon = r.kind === 'leave' ? CalendarClock : r.kind === 'regularization' ? ClipboardList : Gift;
    const leaveCancel = r.kind === 'leave' ? leaveCancelState(r.raw) : null;
    const cancellable =
      (r.kind === 'leave' && !!leaveCancel?.canCancel) ||
      (r.kind === 'regularization' &&
        ['pending', 'manager_review', 'manager_reviewed'].includes(r.raw.status));
    return (
      <li className="flex flex-col gap-2 px-3.5 py-3 sm:flex-row sm:items-start sm:gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-[13px] font-semibold text-foreground">{r.title}</p>
              <StatusPill tone={r.tone}>{r.stageLabel}</StatusPill>
            </div>
            <p className="mt-0.5 text-[13px] text-foreground">{r.when}</p>
            {r.notes.map((n, i) => (
              <p
                key={i}
                className={
                  n.tone === 'danger' ? 'mt-1 text-xs text-destructive'
                    : n.tone === 'warning' ? 'mt-1 text-xs text-warning'
                      : 'mt-1 text-xs text-muted-foreground'
                }
              >
                {n.text}
              </p>
            ))}
          </div>
        </div>
        {cancellable && (
          <div className="pl-11 sm:pl-0">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 gap-1 text-xs">
                  <XCircle className="h-3.5 w-3.5" /> Cancel
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel this request?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {r.title} · {r.when}.{' '}
                    {leaveCancel?.approved
                      ? 'It is already approved. Cancelling gives the days back to your balance and clears them from your calendar.'
                      : 'It is withdrawn and no longer waits for a decision.'}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      r.kind === 'leave'
                        ? cancelLeave.mutate(r.raw.id)
                        : cancelReg.mutate(r.raw.id)
                    }
                  >
                    Cancel Request
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </li>
    );
  };

  const list = filterList(mode);

  return (
    <SectionBlock
      icon={FileText}
      title="My requests"
      description="Leave, attendance corrections and comp-off credits, newest first"
      flush
      actions={
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> New request
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-xs">What do you want to raise?</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setLeaveOpen(true)} className="gap-2">
                <CalendarClock className="h-4 w-4 text-primary" />
                <div className="min-w-0">
                  <p className="text-sm">Leave request</p>
                  <p className="text-[11px] text-muted-foreground">Planned or past time off</p>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setRegOpen(true)} className="gap-2">
                <ClipboardList className="h-4 w-4 text-primary" />
                <div className="min-w-0">
                  <p className="text-sm">Attendance correction</p>
                  <p className="text-[11px] text-muted-foreground">You worked but a punch is missing</p>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setBankOpen(true)} className="gap-2">
                <Landmark className="h-4 w-4 text-primary" />
                <div className="min-w-0">
                  <p className="text-sm">Bank change request</p>
                  <p className="text-[11px] text-muted-foreground">Update your salary account</p>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <RequestLeaveDialog employeeId={employeeId} open={leaveOpen} onOpenChange={setLeaveOpen} hideTrigger />
          <BankChangeRequestCard
            employeeId={employeeId}
            userId={userId}
            defaultHolderName={defaultHolderName}
            dialogOnly
            open={bankOpen}
            onOpenChange={setBankOpen}
          />

          <Dialog open={regOpen} onOpenChange={setRegOpen}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Request an attendance correction</DialogTitle>
                <DialogDescription>For a day you worked but a punch is missing or wrong.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Date *</Label>
                  <Input
                    type="date"
                    value={regForm.attendance_date}
                    max={format(new Date(), 'yyyy-MM-dd')}
                    onChange={(e) => setRegForm((p) => ({ ...p, attendance_date: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Check-in (optional)</Label>
                    <Input
                      type="time"
                      value={regForm.requested_check_in}
                      onChange={(e) => setRegForm((p) => ({ ...p, requested_check_in: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Check-out (optional)</Label>
                    <Input
                      type="time"
                      value={regForm.requested_check_out}
                      onChange={(e) => setRegForm((p) => ({ ...p, requested_check_out: e.target.value }))}
                    />
                  </div>
                </div>
                {regWindow.error && (
                  <p className="text-xs text-destructive">{regWindow.error}</p>
                )}
                {!regWindow.error && regWindow.crossesMidnight && (
                  <p className="text-xs text-muted-foreground">
                    Overnight shift detected — check-out will be recorded on the next day
                    ({regWindow.spanLabel}).
                  </p>
                )}

                <div>
                  <Label>Reason category *</Label>
                  <Select
                    value={regForm.reason_category}
                    onValueChange={(v) => setRegForm((p) => ({ ...p, reason_category: v }))}
                  >
                    <SelectTrigger className="text-foreground">
                      <SelectValue placeholder="What went wrong?" />
                    </SelectTrigger>
                    <SelectContent>
                      {REG_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Reason *</Label>
                  <Textarea
                    rows={3}
                    value={regForm.reason}
                    placeholder="Why did the punch(es) miss? Any supporting context helps HR approve faster."
                    onChange={(e) => setRegForm((p) => ({ ...p, reason: e.target.value }))}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  HR verifies against biometric logs before approving. Missing biometric evidence may
                  cause your request to be rejected.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRegOpen(false)}>Close</Button>
                <Button
                  disabled={createReg.isPending || !!regWindow.error || !regForm.attendance_date || !regForm.reason_category || !regForm.reason.trim()}
                  onClick={() => createReg.mutate()}
                >
                  {createReg.isPending ? 'Submitting…' : 'Submit'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      }
    >
      <div className="border-b border-border px-3.5 py-2.5">
        <SegmentedControl
          size="sm"
          aria-label="Filter requests"
          value={mode}
          onValueChange={(v) => setMode(v as typeof mode)}
          options={[
            { value: 'all', label: `All · ${counts.all}` },
            { value: 'pending', label: `Pending · ${counts.pending}` },
            { value: 'approved', label: `Approved · ${counts.approved}` },
            { value: 'closed', label: `Closed · ${counts.closed}` },
          ]}
          className="max-w-full overflow-x-auto"
        />
      </div>
      {isLoading ? (
        <ProfileSkeleton rows={4} bare />
      ) : list.length === 0 ? (
        <ProfileEmptyState
          bare
          icon={Inbox}
          title={mode === 'all' ? 'No requests yet' : 'Nothing here'}
          description={mode === 'all' ? 'Use "New request" to ask for leave, correct a punch or change your bank account.' : undefined}
        />
      ) : (
        <ul className="divide-y divide-border">
          {list.map((r) => <Row key={r.id} r={r} />)}
        </ul>
      )}
    </SectionBlock>
  );
}
