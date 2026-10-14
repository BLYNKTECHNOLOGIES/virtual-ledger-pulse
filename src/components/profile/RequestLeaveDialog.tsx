import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, CalendarPlus } from 'lucide-react';
import { toast } from 'sonner';
import { sendLeaveEmail } from '@/utils/leaveEmail';
import { invalidateLeaveCaches, useMyLeaveAvailable } from './hooks';
import { fmtDay, fmtDays, istToday } from './format';
import { isPaidLeaveType } from './leave';

interface Props {
  employeeId: string;
  /** Controlled open state — used when the dialog is launched from a shared "Request" menu. */
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  /** Hide the built-in trigger button when an external menu opens this dialog. */
  hideTrigger?: boolean;
}

const EMPTY_FORM = {
  start_date: '',
  end_date: '',
  is_half_day: false,
  half_day_period: 'morning',
  reason: '',
  contact_during_leave: '',
};

/**
 * ESS — the one leave form on the profile (header, Overview, Leave tab and
 * Requests all open it). Routes to the reporting manager first, then HR.
 * Paid types need the full balance for the dates (enforced again in the
 * database); Loss of Pay days show as Absent. The day count is the database's
 * own (weekly offs and holidays excluded), so what the employee sees here is
 * what gets stored.
 */
export default function RequestLeaveDialog({ employeeId, open: openProp, onOpenChange, hideTrigger }: Props) {
  const qc = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpenRaw = onOpenChange ?? setInternalOpen;
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  // Leave can't start before the current month (validate_leave_request_dates).
  const earliest = `${istToday().slice(0, 8)}01`;

  const { data: weeklyOffs = [] } = useQuery({
    queryKey: ['ess_weekly_off', employeeId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('hr_employee_weekly_off')
        .select('hr_weekly_off_patterns(weekly_offs)')
        .eq('employee_id', employeeId)
        .eq('is_current', true);
      return data || [];
    },
    enabled: !!employeeId,
  });

  const offDays = useMemo(() => {
    const d = (weeklyOffs as any[])
      .flatMap((r) => r.hr_weekly_off_patterns?.weekly_offs || [])
      .map((n: any) => Number(n))
      .filter((n: number) => !Number.isNaN(n));
    return d.length ? d : [0];
  }, [weeklyOffs]);

  /** Browser estimate — used only if the database count can't be read. */
  const estimatedDays = useMemo(() => {
    if (form.is_half_day) return form.start_date ? 0.5 : 0;
    if (!form.start_date || !form.end_date) return 0;
    const s = new Date(`${form.start_date}T00:00:00`);
    const e = new Date(`${form.end_date}T00:00:00`);
    if (e < s) return 0;
    let n = 0;
    for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      if (!offDays.includes(d.getDay())) n++;
    }
    return n;
  }, [form.start_date, form.end_date, form.is_half_day, offDays]);

  const endDate = form.is_half_day ? form.start_date : form.end_date || form.start_date;
  const beforeEarliest = !!form.start_date && form.start_date < earliest;
  // Longer than a year is a typing slip (e.g. a half-typed year), not a leave.
  const tooLong = !!form.start_date && !!endDate && endDate >= form.start_date
    && (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${form.start_date}T00:00:00Z`)) / 86400000 > 366;
  const datesReady = !!form.start_date && !beforeEarliest && !tooLong
    && (form.is_half_day || (!!form.end_date && form.end_date >= form.start_date));

  // The same count the database stores on submit.
  const { data: dbDays, isFetching: daysLoading, isError: daysError } = useQuery({
    queryKey: ['ess_leave_days', employeeId, form.start_date, endDate, form.is_half_day],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('hr_my_leave_days', {
        p_start: form.start_date, p_end: endDate, p_half: form.is_half_day,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    enabled: !!employeeId && datesReady,
    retry: false,
  });
  // The database's count; the browser estimate only if that lookup failed (the insert still recounts).
  const isEstimate = datesReady && dbDays === undefined && daysError;
  const workingDays = !datesReady ? 0 : dbDays ?? (daysError ? estimatedDays : 0);

  const { data: leaveTypes = [] } = useQuery({
    queryKey: ['ess_leave_types'],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('hr_leave_types').select('id, name, code, is_paid, color')
        .eq('is_active', true).in('code', ['CL', 'CO', 'SL', 'LOP']).order('name');
      return (data || []) as { id: string; name: string; code: string; is_paid: boolean; color?: string | null }[];
    },
  });
  const paidIds = leaveTypes.filter(isPaidLeaveType).map((t) => t.id);
  const { data: leftToday = {} } = useMyLeaveAvailable(employeeId, paidIds);

  const selectedType = leaveTypes.find((t) => t.id === leaveTypeId);
  const isLop = !!selectedType && !isPaidLeaveType(selectedType);
  // Comp-off can only be used inside the month it was earned, so it can't span two months.
  const coSpansMonths = selectedType?.code === 'CO' && datesReady && form.start_date.slice(0, 7) !== endDate.slice(0, 7);

  const { data: available, isFetching: balLoading } = useQuery({
    queryKey: ['ess_leave_available', employeeId, leaveTypeId, form.start_date, endDate],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('hr_my_leave_available', {
        p_employee_id: employeeId, p_leave_type_id: leaveTypeId, p_start: form.start_date, p_end: endDate,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    enabled: !!employeeId && !!leaveTypeId && !isLop && !!form.start_date,
  });
  // Judge the balance only on the database's day count; with an estimate the insert decides.
  const shortBalance = !isLop && !isEstimate && available !== undefined && workingDays > available;

  const reset = () => {
    setForm(EMPTY_FORM);
    setLeaveTypeId('');
  };
  /** Closing always discards the draft, so "Apply for leave" opens a blank form. */
  const setOpen = (v: boolean) => {
    setOpenRaw(v);
    if (!v) reset();
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!leaveTypeId) throw new Error('Choose a leave type');
      if (!form.start_date) throw new Error('Start date is required');
      if (!form.reason.trim()) throw new Error('Please add a reason');
      const end = endDate;
      if (workingDays <= 0) throw new Error('Selected dates contain no working days');
      if (shortBalance) throw new Error(`You have only ${available} day(s) of ${selectedType?.name} available. Apply for that many, and the rest as Loss of Pay.`);

      const { data, error } = await (supabase as any)
        .from('hr_leave_requests')
        .insert({
          employee_id: employeeId,
          leave_type_id: leaveTypeId,
          start_date: form.start_date,
          end_date: end,
          total_days: workingDays,
          is_half_day: form.is_half_day,
          half_day_period: form.is_half_day ? form.half_day_period : null,
          reason: form.reason.trim(),
          contact_during_leave: form.contact_during_leave.trim() || null,
          status: 'requested',
          source: 'ess',
        })
        .select('id, manager_id, status')
        .single();
      if (error) throw error;

      // ── Emails (non-blocking) ──
      const { data: me } = await (supabase as any)
        .from('hr_employees').select('first_name, last_name').eq('id', employeeId).maybeSingle();
      let managerEmail: string | null = null;
      let managerName: string | null = null;
      if (data?.manager_id) {
        const { data: mgr } = await (supabase as any)
          .from('hr_employees').select('first_name, last_name, email').eq('id', data.manager_id).maybeSingle();
        managerEmail = mgr?.email || null;
        managerName = mgr ? `${mgr.first_name || ''} ${mgr.last_name || ''}`.trim() : null;
      }
      sendLeaveEmail({
        eventType: 'leave_requested',
        requestId: data.id,
        employeeName: me ? `${me.first_name || ''} ${me.last_name || ''}`.trim() : 'Employee',
        leaveType: selectedType?.name || 'Leave',
        startDate: form.start_date,
        endDate: end,
        totalDays: workingDays,
        reason: form.reason.trim(),
        contactDuringLeave: form.contact_during_leave.trim() || undefined,
        managerEmail,
        managerName,
      });
    },
    onSuccess: () => {
      toast.success('Leave request submitted');
      setOpen(false);
      invalidateLeaveCaches(qc, employeeId);
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to submit leave request'),
  });

  const daysText = !datesReady
    ? '—'
    : daysLoading && dbDays === undefined
      ? '…'
      : `${isEstimate ? 'About ' : ''}${fmtDays(workingDays)} working day${workingDays === 1 ? '' : 's'}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" className="gap-1.5">
            <CalendarPlus className="h-4 w-4" /> Apply for leave
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply for leave</DialogTitle>
          <DialogDescription>Your reporting manager reviews it first, then HR gives the final approval.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5">
          <div>
            <Label htmlFor="ess-leave-type">Leave type *</Label>
            <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
              <SelectTrigger id="ess-leave-type" className="w-full text-foreground"><SelectValue placeholder="Choose leave type" /></SelectTrigger>
              <SelectContent>
                {leaveTypes.map((t) => {
                  const left = leftToday[t.id];
                  return (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color || 'hsl(var(--muted-foreground))' }} />
                        {t.name}
                        {isPaidLeaveType(t) && left != null && (
                          <span className="text-xs text-muted-foreground">· {fmtDays(left)} left</span>
                        )}
                        {!isPaidLeaveType(t) && <span className="text-xs text-muted-foreground">· unpaid</span>}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="ess-half-day"
              checked={form.is_half_day}
              onCheckedChange={(c) => setForm((p) => ({ ...p, is_half_day: !!c }))}
            />
            <Label htmlFor="ess-half-day" className="cursor-pointer">Half day</Label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <Label htmlFor="ess-leave-from">{form.is_half_day ? 'Date *' : 'From *'}</Label>
              <Input
                id="ess-leave-from"
                type="date"
                className="w-full min-w-0 text-foreground"
                min={earliest}
                value={form.start_date}
                onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
              />
            </div>
            {!form.is_half_day ? (
              <div className="min-w-0">
                <Label htmlFor="ess-leave-to">To *</Label>
                <Input
                  id="ess-leave-to"
                  type="date"
                  className="w-full min-w-0 text-foreground"
                  min={form.start_date || earliest}
                  value={form.end_date}
                  onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))}
                />
              </div>
            ) : (
              <div className="min-w-0">
                <Label htmlFor="ess-leave-session">Session</Label>
                <Select value={form.half_day_period} onValueChange={(v) => setForm((p) => ({ ...p, half_day_period: v }))}>
                  <SelectTrigger id="ess-leave-session" className="w-full min-w-0 text-foreground"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="morning">First half (morning)</SelectItem>
                    <SelectItem value="afternoon">Second half (afternoon)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="ess-leave-reason">Reason *</Label>
            <Textarea
              id="ess-leave-reason"
              rows={3}
              className="w-full text-foreground"
              value={form.reason}
              placeholder="Why do you need this leave?"
              onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
            />
          </div>

          <div>
            <Label htmlFor="ess-leave-contact">Contact number during leave</Label>
            <Input
              id="ess-leave-contact"
              className="w-full text-foreground"
              value={form.contact_during_leave}
              placeholder="Optional"
              inputMode="tel"
              onChange={(e) => setForm((p) => ({ ...p, contact_during_leave: e.target.value }))}
            />
          </div>

          <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5 text-[13px]">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="font-semibold text-foreground" data-testid="leave-days">{daysText}</span>
              <span className="text-xs text-muted-foreground">{isEstimate ? 'Estimate — the final count is checked on submit' : "Weekly offs and holidays don't count"}</span>
            </div>
            {selectedType && !isLop && form.start_date && (
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedType.name} available for these dates: <strong className="text-foreground">{balLoading ? '…' : available !== undefined ? fmtDays(available) : '—'}</strong>
              </p>
            )}
            {isLop && (
              <p className="mt-1 text-xs text-muted-foreground">Unpaid — these days show as Absent on your calendar.</p>
            )}
          </div>

          {beforeEarliest && (
            <p className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Leave can't start before {fmtDay(earliest)}. For an earlier day, ask HR.</span>
            </p>
          )}
          {tooLong && (
            <p className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>That range is longer than a year — check the dates.</span>
            </p>
          )}
          {shortBalance && (
            <p className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {coSpansMonths
                  ? 'Comp-off can only be used in the month it was earned, so it can’t run into the next month. Split the leave at the month end.'
                  : !available
                    ? `You have no ${selectedType?.name} left for these dates. Apply as Loss of Pay, or pick other dates.`
                    : `You have ${fmtDays(available)} day${available === 1 ? '' : 's'} of ${selectedType?.name} for these dates but picked ${fmtDays(workingDays)} working day${workingDays === 1 ? '' : 's'}. Apply for ${fmtDays(available)} as ${selectedType?.name} and the rest as Loss of Pay, or change your dates.`}
              </span>
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => setOpen(false)}>Close</Button>
          <Button
            className="w-full sm:w-auto"
            disabled={submit.isPending || !leaveTypeId || shortBalance || balLoading || daysLoading || !datesReady || !form.reason.trim() || workingDays <= 0}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? 'Submitting…' : 'Submit request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
