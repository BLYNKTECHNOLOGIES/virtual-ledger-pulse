import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarPlus } from 'lucide-react';
import { toast } from 'sonner';
import { sendLeaveEmail } from '@/utils/leaveEmail';

interface Props {
  employeeId: string;
}

/**
 * ESS — Employee raises a leave request from the ERP profile.
 * Routes to the reporting manager first, then HR (two-stage approval).
 * Shows live balance and warns when the request exceeds it (excess = loss of pay).
 */
export default function RequestLeaveDialog({ employeeId }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    start_date: '',
    end_date: '',
    is_half_day: false,
    half_day_period: 'morning',
    reason: '',
    contact_during_leave: '',
  });

  const { data: leaveTypes = [] } = useQuery({
    queryKey: ['ess_leave_types'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('hr_leave_types')
        .select('id, name, is_paid')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: allocations = [] } = useQuery({
    queryKey: ['ess_leave_allocations', employeeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('hr_leave_allocations')
        .select('leave_type_id, available_days, year, quarter')
        .eq('employee_id', employeeId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!employeeId,
  });

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

  const workingDays = useMemo(() => {
    if (form.is_half_day) return 0.5;
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

  const submit = useMutation({
    mutationFn: async () => {
      if (!form.start_date) throw new Error('Start date is required');
      if (!form.reason.trim()) throw new Error('Please add a reason');
      const end = form.is_half_day ? form.start_date : form.end_date || form.start_date;
      if (workingDays <= 0) throw new Error('Selected dates contain no working days');

      const { data, error } = await (supabase as any)
        .from('hr_leave_requests')
        .insert({
          employee_id: employeeId,
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
        leaveType: 'To be assigned by HR',
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
      setForm({
        start_date: '', end_date: '', is_half_day: false,
        half_day_period: 'morning', reason: '', contact_during_leave: '',
      });
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['ess_hub_leaves', employeeId] });
      qc.invalidateQueries({ queryKey: ['hr_leave_requests', employeeId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to submit leave request'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <CalendarPlus className="h-4 w-4" /> Request Leave
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Request Leave</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border border-border bg-muted/30 p-2.5 text-[11px] text-muted-foreground">
            The leave type is assigned by HR when your request is approved.
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="ess-half-day"
              checked={form.is_half_day}
              onCheckedChange={(c) => setForm((p) => ({ ...p, is_half_day: !!c }))}
            />
            <Label htmlFor="ess-half-day" className="cursor-pointer">Half day</Label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>From *</Label>
              <Input
                type="date"
                className="text-foreground"
                value={form.start_date}
                onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
              />
            </div>
            {!form.is_half_day ? (
              <div>
                <Label>To *</Label>
                <Input
                  type="date"
                  className="text-foreground"
                  min={form.start_date || undefined}
                  value={form.end_date}
                  onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))}
                />
              </div>
            ) : (
              <div>
                <Label>Period</Label>
                <Select value={form.half_day_period} onValueChange={(v) => setForm((p) => ({ ...p, half_day_period: v }))}>
                  <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="morning">Morning</SelectItem>
                    <SelectItem value="afternoon">Afternoon</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div>
            <Label>Reason *</Label>
            <Textarea
              rows={3}
              className="text-foreground"
              value={form.reason}
              placeholder="Why do you need this leave?"
              onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
            />
          </div>

          <div>
            <Label>Contact number during leave</Label>
            <Input
              className="text-foreground"
              value={form.contact_during_leave}
              placeholder="Optional"
              onChange={(e) => setForm((p) => ({ ...p, contact_during_leave: e.target.value }))}
            />
          </div>

          <div className="rounded-md border border-border p-2.5 text-xs space-y-1">
            <p className="text-foreground">
              Working days requested: <strong>{workingDays || '—'}</strong>
            </p>
            <p className="text-muted-foreground">
              Goes to your reporting manager first, then HR for final approval. HR assigns the leave type
              and adjusts the balance at approval.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          <Button
            disabled={submit.isPending || !form.start_date || !form.reason.trim() || workingDays <= 0}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? 'Submitting…' : 'Submit request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
