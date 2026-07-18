import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Plus, Clock, CheckCircle2, XCircle, Hourglass, Ban } from 'lucide-react';

interface Props {
  employeeId: string;
}

const statusMeta: Record<string, { label: string; icon: any; cls: string }> = {
  pending: { label: 'Pending', icon: Hourglass, cls: 'bg-warning/10 text-warning' },
  approved: { label: 'Approved', icon: CheckCircle2, cls: 'bg-success/10 text-success' },
  rejected: { label: 'Rejected', icon: XCircle, cls: 'bg-destructive/10 text-destructive' },
  cancelled: { label: 'Cancelled', icon: Ban, cls: 'bg-muted text-muted-foreground' },
};

export default function RegularizationCard({ employeeId }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    attendance_date: format(new Date(), 'yyyy-MM-dd'),
    requested_check_in: '',
    requested_check_out: '',
    reason: '',
  });

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['reg_requests_self', employeeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
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

  const submit = useMutation({
    mutationFn: async () => {
      if (!form.reason.trim()) throw new Error('Please provide a reason');
      if (!form.requested_check_in && !form.requested_check_out) {
        throw new Error('Provide at least one time (check-in or check-out)');
      }
      const payload: any = {
        employee_id: employeeId,
        attendance_date: form.attendance_date,
        reason: form.reason.trim(),
        status: 'pending',
      };
      const toIso = (t: string) =>
        t ? new Date(`${form.attendance_date}T${t}:00`).toISOString() : null;
      payload.requested_check_in = toIso(form.requested_check_in);
      payload.requested_check_out = toIso(form.requested_check_out);
      const { error } = await (supabase as any)
        .from('hr_attendance_regularization_requests')
        .insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Regularization request submitted for HR approval');
      setOpen(false);
      setForm({
        attendance_date: format(new Date(), 'yyyy-MM-dd'),
        requested_check_in: '',
        requested_check_out: '',
        reason: '',
      });
      qc.invalidateQueries({ queryKey: ['reg_requests_self', employeeId] });
    },
    onError: (e: any) => toast.error(e.message || 'Failed to submit request'),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('hr_attendance_regularization_requests')
        .update({ status: 'cancelled' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Request cancelled');
      qc.invalidateQueries({ queryKey: ['reg_requests_self', employeeId] });
    },
    onError: (e: any) => toast.error(e.message || 'Failed to cancel'),
  });

  const fmtTime = (ts: string | null) =>
    ts ? new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Clock className="h-4 w-4" /> Attendance Regularization
        </CardTitle>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Request
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <p className="text-center py-6 text-muted-foreground text-sm">Loading...</p>
        ) : requests.length === 0 ? (
          <p className="text-center py-6 text-muted-foreground text-sm">
            No requests yet. Missed a punch? Raise a request and HR will review.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Requested In</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Requested Out</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Reason</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r: any) => {
                  const meta = statusMeta[r.status] || statusMeta.pending;
                  const Icon = meta.icon;
                  return (
                    <tr key={r.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-2 font-medium">{r.attendance_date}</td>
                      <td className="px-4 py-2 font-mono text-xs">{fmtTime(r.requested_check_in)}</td>
                      <td className="px-4 py-2 font-mono text-xs">{fmtTime(r.requested_check_out)}</td>
                      <td className="px-4 py-2 max-w-xs truncate" title={r.reason}>{r.reason}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>
                          <Icon className="h-3 w-3" /> {meta.label}
                        </span>
                        {r.approver_notes && (
                          <p className="text-xs text-muted-foreground mt-1 italic">"{r.approver_notes}"</p>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {r.status === 'pending' && (
                          <Button size="sm" variant="ghost" onClick={() => cancel.mutate(r.id)}>Cancel</Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Regularization Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={form.attendance_date}
                onChange={(e) => setForm({ ...form, attendance_date: e.target.value })}
                max={format(new Date(), 'yyyy-MM-dd')}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Check-In</Label>
                <Input
                  type="time"
                  value={form.requested_check_in}
                  onChange={(e) => setForm({ ...form, requested_check_in: e.target.value })}
                />
              </div>
              <div>
                <Label>Check-Out</Label>
                <Input
                  type="time"
                  value={form.requested_check_out}
                  onChange={(e) => setForm({ ...form, requested_check_out: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Reason *</Label>
              <Textarea
                rows={3}
                placeholder="e.g. Forgot to punch out, biometric device was offline, on client visit..."
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
              {submit.isPending ? 'Submitting...' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
