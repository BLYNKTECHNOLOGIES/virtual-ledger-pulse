import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Lock, Unlock, Plus, ShieldCheck, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { TableSkeleton } from '@/components/ui/skeleton';

export default function AttendancePeriodLockPage() {
  const qc = useQueryClient();
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const [open, setOpen] = useState(false);
  const [unlockId, setUnlockId] = useState<string | null>(null);
  const [form, setForm] = useState({
    period_start: format(new Date(y, m - 1, 1), 'yyyy-MM-dd'),
    period_end: format(new Date(y, m, 0), 'yyyy-MM-dd'),
    notes: '',
  });

  const { data: locks = [], isLoading } = useQuery({
    queryKey: ['attendance_period_locks'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('hr_attendance_period_locks')
        .select('*')
        .order('period_start', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.period_start || !form.period_end) throw new Error('Provide period start and end');
      if (form.period_end < form.period_start) throw new Error('End must be after start');
      const { data: u } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from('hr_attendance_period_locks')
        .insert({
          period_start: form.period_start,
          period_end: form.period_end,
          locked_by: u?.user?.id,
          locked_at: new Date().toISOString(),
          notes: form.notes || null,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Period locked. Payroll can now be run for this range.');
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['attendance_period_locks'] });
    },
    onError: (e: any) => toast.error(e.message || 'Failed to lock period'),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('hr_attendance_period_locks')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Lock removed');
      setUnlockId(null);
      qc.invalidateQueries({ queryKey: ['attendance_period_locks'] });
    },
    onError: (e: any) => toast.error(e.message || 'Failed to unlock'),
  });

  // -----------------------------------------------------------------------
  // Verify against Razorpay — read-only sample of one mapped employee's
  // attendance for the locked period via attendance_fetch_range.
  // -----------------------------------------------------------------------
  const [verifyLock, setVerifyLock] = useState<any | null>(null);
  const [verifyEmp, setVerifyEmp] = useState<string>('');
  const [verifyResult, setVerifyResult] = useState<null | { days: any[]; from: string; to: string }>(null);

  const { data: mappedEmployees = [] } = useQuery({
    queryKey: ['razorpay_mapped_employees_light'],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('hr_razorpay_employee_map')
        .select('hr_employee_id, razorpay_employee_id, hr_employees!hr_razorpay_employee_map_hr_employee_id_fkey(first_name, last_name, badge_id, is_active)')
        .not('razorpay_employee_id', 'is', null);
      return (data || []).filter((r: any) => r.hr_employees?.is_active);
    },
    enabled: !!verifyLock,
  });

  const runVerify = useMutation({
    mutationFn: async () => {
      if (!verifyLock || !verifyEmp) throw new Error('Pick an employee');
      const mapped = mappedEmployees.find((r: any) => r.hr_employee_id === verifyEmp);
      if (!mapped?.razorpay_employee_id) throw new Error('Employee not linked to Razorpay');
      const { data, error } = await supabase.functions.invoke('razorpay-payroll-proxy', {
        body: {
          action: 'attendance_fetch_range',
          data: {
            'employee-id': Number(mapped.razorpay_employee_id),
            from: verifyLock.period_start,
            to: verifyLock.period_end,
          },
        },
      });
      if (error) throw error;
      if (data && (data as any).ok === false) throw new Error((data as any).error || 'Razorpay verify failed');
      return { days: (data as any)?.days ?? [], from: verifyLock.period_start, to: verifyLock.period_end };
    },
    onSuccess: (r) => { setVerifyResult(r); toast.success(`Fetched ${r.days.length} day(s) from Razorpay`); },
    onError: (e: any) => toast.error(e.message || 'Verify failed'),
  });

  const summarizeVerify = (days: any[]) => {
    let ok = 0, empty = 0, err = 0;
    for (const d of days) {
      if (d.http_status === 200 && d.body && (d.body.data || d.body?.attendance)) ok++;
      else if (d.http_status === 200) empty++;
      else err++;
    }
    return { ok, empty, err };
  };


  return (
    <div className="space-y-4">
      <PageHeader
        title="Attendance Period Locks"
        description="Freeze attendance for a payroll period. The payroll engine refuses to run for a period that has no lock, and any late corrections cannot silently alter locked payslips."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Lock New Period
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton rows={4} />
          ) : locks.length === 0 ? (
            <EmptyState
              icon={Lock}
              title="No locked periods yet"
              description="Lock a period before running payroll for it."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Period</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Locked At</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Notes</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {locks.map((l: any) => (
                    <tr key={l.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-2 font-medium">
                        <Lock className="h-3 w-3 inline mr-1 text-success" />
                        {l.period_start} → {l.period_end}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {l.locked_at ? new Date(l.locked_at).toLocaleString('en-IN') : '—'}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{l.notes || '—'}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="outline" onClick={() => { setVerifyLock(l); setVerifyEmp(''); setVerifyResult(null); }}>
                            <ShieldCheck className="h-4 w-4 mr-1" /> Verify with Razorpay
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setUnlockId(l.id)}>
                            <Unlock className="h-4 w-4 mr-1" /> Unlock
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Lock Attendance Period</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Period Start</Label>
                <Input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} />
              </div>
              <div>
                <Label>Period End</Label>
                <Input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. Locked after biometric reconciliation and regularization review" />
            </div>
            <p className="text-xs text-muted-foreground">
              Only lock after you've reviewed all regularization requests and biometric quarantine for this period.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? 'Locking...' : 'Lock Period'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!unlockId} onOpenChange={(o) => !o && setUnlockId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlock this period?</AlertDialogTitle>
            <AlertDialogDescription>
              Unlocking allows attendance/regularization to be changed again. If payroll for this period has already been paid, this can cause reconciliation drift. Proceed only if you know what you're doing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => unlockId && remove.mutate(unlockId)}>Unlock</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!verifyLock} onOpenChange={(o) => { if (!o) { setVerifyLock(null); setVerifyResult(null); setVerifyEmp(''); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Verify locked period against Razorpay</DialogTitle>
            <DialogDescription>
              Read-only sample. Picks one mapped employee and pulls their day-by-day attendance from Razorpay for
              <span className="tabular-nums"> {verifyLock?.period_start} → {verifyLock?.period_end}</span>. No writes; safe to run repeatedly.
              Range capped at 62 days on the proxy.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Sample employee</Label>
              <Select value={verifyEmp} onValueChange={setVerifyEmp}>
                <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Pick a Razorpay-linked employee" /></SelectTrigger>
                <SelectContent>
                  {mappedEmployees.map((r: any) => (
                    <SelectItem key={r.hr_employee_id} value={r.hr_employee_id}>
                      {r.hr_employees?.first_name} {r.hr_employees?.last_name} ({r.hr_employees?.badge_id}) · rzp {r.razorpay_employee_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {mappedEmployees.length === 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  No employees linked to Razorpay yet. Complete People sync first from the Payroll Sync journey.
                </p>
              )}
            </div>
            {verifyResult && (() => {
              const s = summarizeVerify(verifyResult.days);
              return (
                <div className="border border-border rounded-md p-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-2">Diff for {verifyResult.from} → {verifyResult.to}</p>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div><span className="text-muted-foreground block text-xs">Days with data</span><p className="font-semibold text-success tabular-nums">{s.ok}</p></div>
                    <div><span className="text-muted-foreground block text-xs">Empty on Razorpay</span><p className="font-semibold text-warning tabular-nums">{s.empty}</p></div>
                    <div><span className="text-muted-foreground block text-xs">Fetch errors</span><p className="font-semibold text-destructive tabular-nums">{s.err}</p></div>
                  </div>
                  <details className="mt-2">
                    <summary className="text-xs text-muted-foreground cursor-pointer">Per-day detail</summary>
                    <div className="max-h-56 overflow-y-auto mt-2 text-[11px] font-mono space-y-0.5">
                      {verifyResult.days.map((d: any) => (
                        <div key={d.day} className="flex justify-between border-b border-border/40 py-0.5">
                          <span className="tabular-nums">{d.day}</span>
                          <span className={d.http_status === 200 ? 'text-muted-foreground' : 'text-destructive'}>
                            {d.http_status} {d.error ? `· ${d.error.slice(0, 40)}` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setVerifyLock(null); setVerifyResult(null); }}>Close</Button>
            <Button onClick={() => runVerify.mutate()} disabled={!verifyEmp || runVerify.isPending}>
              {runVerify.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Fetching…</> : 'Fetch from Razorpay'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
