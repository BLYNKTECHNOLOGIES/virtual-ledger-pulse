import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { CalendarClock, ClipboardList, Gift, FileText, Plus, XCircle } from 'lucide-react';
import { toast as sonnerToast } from 'sonner';
import { format } from 'date-fns';

interface Props {
  employeeId: string;
}

type UnifiedRequest = {
  id: string;
  kind: 'leave' | 'regularization' | 'compoff';
  title: string;
  subtitle: string;
  date: string;
  status: string;
  raw: any;
};

const statusVariant = (s: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  const v = (s || '').toLowerCase();
  if (v === 'approved' || v === 'allocated') return 'default';
  if (v === 'rejected' || v === 'expired' || v === 'cancelled') return 'destructive';
  if (v === 'pending') return 'secondary';
  return 'outline';
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
export default function MyRequestsHub({ employeeId }: Props) {
  const qc = useQueryClient();
  const [regOpen, setRegOpen] = useState(false);
  const [regForm, setRegForm] = useState({
    attendance_date: '',
    requested_check_in: '',
    requested_check_out: '',
    reason: '',
  });

  // ─── Leave requests ───
  const { data: leaves = [], isLoading: lLoading } = useQuery({
    queryKey: ['ess_hub_leaves', employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_leave_requests')
        .select('id, status, start_date, end_date, total_days, reason, created_at, leave_type_id, hr_leave_types(name, color)')
        .eq('employee_id', employeeId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!employeeId,
  });

  // ─── Regularization requests ───
  const { data: regs = [], isLoading: rLoading } = useQuery({
    queryKey: ['ess_hub_regs', employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_attendance_regularization_requests')
        .select('*')
        .eq('employee_id', employeeId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!employeeId,
  });

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
    const l: UnifiedRequest[] = (leaves as any[]).map((r) => ({
      id: `l-${r.id}`,
      kind: 'leave',
      title: r.hr_leave_types?.name || 'Leave',
      subtitle: `${r.total_days} day(s) · ${r.reason || 'No reason'}`,
      date: `${r.start_date} → ${r.end_date}`,
      status: r.status,
      raw: r,
    }));
    const g: UnifiedRequest[] = (regs as any[]).map((r) => ({
      id: `r-${r.id}`,
      kind: 'regularization',
      title: 'Attendance Regularization',
      subtitle: r.reason || '—',
      date: r.attendance_date,
      status: r.status,
      raw: r,
    }));
    const c: UnifiedRequest[] = (comps as any[]).map((r) => {
      const expired = r.expires_at && r.expires_at < today;
      const status = r.is_allocated ? 'allocated' : expired ? 'expired' : 'pending';
      return {
        id: `c-${r.id}`,
        kind: 'compoff',
        title: `Comp-off · ${r.credit_type || 'Sunday work'}`,
        subtitle: `+${Number(r.credit_days || 0).toFixed(1)}d · expires ${r.expires_at || '—'}`,
        date: r.credit_date,
        status,
        raw: r,
      };
    });
    return [...l, ...g, ...c].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [leaves, regs, comps, today]);

  // ─── Cancel leave ───
  const cancelLeave = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('hr_leave_requests')
        .update({ status: 'cancelled' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      sonnerToast.success('Leave request cancelled');
      qc.invalidateQueries({ queryKey: ['ess_hub_leaves', employeeId] });
      qc.invalidateQueries({ queryKey: ['hr_leave_requests', employeeId] });
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
      const buildTs = (d: string, t: string) =>
        d && t ? new Date(`${d}T${t}:00`).toISOString() : null;
      const { error } = await supabase
        .from('hr_attendance_regularization_requests')
        .insert({
          employee_id: employeeId,
          attendance_date: regForm.attendance_date,
          requested_check_in: buildTs(regForm.attendance_date, regForm.requested_check_in),
          requested_check_out: buildTs(regForm.attendance_date, regForm.requested_check_out),
          reason: regForm.reason.trim(),
          status: 'pending',
        });
      if (error) throw error;
    },
    onSuccess: () => {
      sonnerToast.success('Regularization submitted');
      setRegForm({ attendance_date: '', requested_check_in: '', requested_check_out: '', reason: '' });
      setRegOpen(false);
      qc.invalidateQueries({ queryKey: ['ess_hub_regs', employeeId] });
    },
    onError: (e: any) => sonnerToast.error(e?.message || 'Failed to submit'),
  });

  const isLoading = lLoading || rLoading || cLoading;

  const counts = {
    all: unified.length,
    pending: unified.filter((r) => r.status.toLowerCase() === 'pending').length,
    approved: unified.filter((r) => ['approved', 'allocated'].includes(r.status.toLowerCase())).length,
    closed: unified.filter((r) => ['rejected', 'cancelled', 'expired'].includes(r.status.toLowerCase())).length,
  };

  const filterList = (mode: 'all' | 'pending' | 'approved' | 'closed') => {
    if (mode === 'all') return unified;
    if (mode === 'pending') return unified.filter((r) => r.status.toLowerCase() === 'pending');
    if (mode === 'approved') return unified.filter((r) => ['approved', 'allocated'].includes(r.status.toLowerCase()));
    return unified.filter((r) => ['rejected', 'cancelled', 'expired'].includes(r.status.toLowerCase()));
  };

  const Row = ({ r }: { r: UnifiedRequest }) => {
    const Icon = r.kind === 'leave' ? CalendarClock : r.kind === 'regularization' ? ClipboardList : Gift;
    const cancellable =
      (r.kind === 'leave' || r.kind === 'regularization') && r.status.toLowerCase() === 'pending';
    return (
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-3 py-3 border-b border-border/50 last:border-b-0">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="p-2 rounded-lg bg-muted/40 shrink-0">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-foreground truncate">{r.title}</p>
            <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{r.date}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:justify-end">
          <Badge variant={statusVariant(r.status)} className="capitalize text-[10px]">
            {r.status}
          </Badge>
          {cancellable && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive">
                  <XCircle className="h-3.5 w-3.5 mr-1" /> Cancel
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel this request?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will withdraw the request. Approved balances (if any) will be restored by HR.
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
          )}
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-primary" /> My Requests
          </CardTitle>
          <Dialog open={regOpen} onOpenChange={setRegOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> Regularization
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Raise Attendance Regularization</DialogTitle>
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
                  disabled={createReg.isPending || !regForm.attendance_date || !regForm.reason.trim()}
                  onClick={() => createReg.mutate()}
                >
                  {createReg.isPending ? 'Submitting…' : 'Submit'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="all">
          <TabsList className="grid grid-cols-4 w-full h-9">
            <TabsTrigger value="all" className="text-xs">All · {counts.all}</TabsTrigger>
            <TabsTrigger value="pending" className="text-xs">Pending · {counts.pending}</TabsTrigger>
            <TabsTrigger value="approved" className="text-xs">Approved · {counts.approved}</TabsTrigger>
            <TabsTrigger value="closed" className="text-xs">Closed · {counts.closed}</TabsTrigger>
          </TabsList>
          {(['all', 'pending', 'approved', 'closed'] as const).map((mode) => {
            const list = filterList(mode);
            return (
              <TabsContent key={mode} value={mode} className="mt-3">
                {isLoading ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
                ) : list.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nothing here yet.
                  </p>
                ) : (
                  <div className="border border-border rounded-lg">
                    {list.map((r) => <Row key={r.id} r={r} />)}
                  </div>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
}
