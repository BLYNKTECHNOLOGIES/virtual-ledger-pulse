import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Hourglass, Search } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { TableSkeleton } from '@/components/ui/skeleton';

export default function AttendanceRegularizationPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('pending');
  const [search, setSearch] = useState('');
  const [reviewing, setReviewing] = useState<any>(null);
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  const [notes, setNotes] = useState('');

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['reg_requests_hr', status],
    queryFn: async () => {
      let q = (supabase as any)
        .from('hr_attendance_regularization_requests')
        .select('*, hr_employees!hr_attendance_regularization_requests_employee_id_fkey(id, badge_id, first_name, last_name)')
        .order('created_at', { ascending: false })
        .limit(500);
      if (status !== 'all') q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = rows.filter((r: any) => {
    if (!search) return true;
    const emp = r.hr_employees;
    const s = search.toLowerCase();
    return (
      emp?.badge_id?.toLowerCase().includes(s) ||
      emp?.first_name?.toLowerCase().includes(s) ||
      emp?.last_name?.toLowerCase().includes(s) ||
      r.reason?.toLowerCase().includes(s)
    );
  });

  const review = useMutation({
    mutationFn: async () => {
      if (!reviewing) return;
      const { data: u } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from('hr_attendance_regularization_requests')
        .update({
          status: decision,
          approver_id: u?.user?.id,
          approver_notes: notes || null,
          approved_at: new Date().toISOString(),
        })
        .eq('id', reviewing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Request ${decision}`);
      setReviewing(null);
      setNotes('');
      qc.invalidateQueries({ queryKey: ['reg_requests_hr'] });
    },
    onError: (e: any) => toast.error(e.message || 'Failed'),
  });

  const fmtTime = (ts: string | null) =>
    ts ? new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div className="space-y-4">
      <PageHeader
        title="Attendance Regularization"
        description="Review employee requests to correct missed or wrong punches. Approved requests automatically patch the attendance record."
      />

      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by badge, name, reason..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton rows={5} />
          ) : filtered.length === 0 ? (
            <EmptyState icon={Hourglass} title="No requests" description="Nothing matches the current filter." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Employee</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Date</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Requested In</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Requested Out</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Reason</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r: any) => {
                    const emp = r.hr_employees;
                    return (
                      <tr key={r.id} className="border-b hover:bg-muted/30">
                        <td className="px-4 py-2">
                          <div className="font-medium text-foreground">{emp?.first_name} {emp?.last_name}</div>
                          <div className="text-xs text-muted-foreground">{emp?.badge_id}</div>
                        </td>
                        <td className="px-4 py-2 font-medium">{r.attendance_date}</td>
                        <td className="px-4 py-2 font-mono text-xs">{fmtTime(r.requested_check_in)}</td>
                        <td className="px-4 py-2 font-mono text-xs">{fmtTime(r.requested_check_out)}</td>
                        <td className="px-4 py-2 max-w-xs">
                          <div className="truncate" title={r.reason}>{r.reason}</div>
                          {r.approver_notes && (
                            <div className="text-xs text-muted-foreground italic mt-0.5">"{r.approver_notes}"</div>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                            r.status === 'approved' ? 'bg-success/10 text-success' :
                            r.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
                            r.status === 'cancelled' ? 'bg-muted text-muted-foreground' :
                            'bg-warning/10 text-warning'
                          }`}>{r.status}</span>
                        </td>
                        <td className="px-4 py-2 text-right space-x-1">
                          {r.status === 'pending' && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => { setReviewing(r); setDecision('approved'); setNotes(''); }}>
                                <CheckCircle2 className="h-4 w-4 mr-1 text-success" /> Approve
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => { setReviewing(r); setDecision('rejected'); setNotes(''); }}>
                                <XCircle className="h-4 w-4 mr-1 text-destructive" /> Reject
                              </Button>
                            </>
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
      </Card>

      <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {decision === 'approved' ? 'Approve' : 'Reject'} Regularization
            </DialogTitle>
          </DialogHeader>
          {reviewing && (
            <div className="space-y-3 text-sm">
              <div className="p-3 rounded bg-muted/40">
                <div className="font-medium">{reviewing.hr_employees?.first_name} {reviewing.hr_employees?.last_name} — {reviewing.attendance_date}</div>
                <div className="text-xs text-muted-foreground mt-1">Reason: {reviewing.reason}</div>
                <div className="text-xs mt-1">In: {fmtTime(reviewing.requested_check_in)} · Out: {fmtTime(reviewing.requested_check_out)}</div>
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Approver notes visible to the employee" />
              </div>
              {decision === 'approved' && (
                <p className="text-xs text-muted-foreground">
                  Approving will patch <code>hr_attendance</code> for {reviewing.attendance_date} automatically.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewing(null)}>Cancel</Button>
            <Button
              onClick={() => review.mutate()}
              disabled={review.isPending}
              variant={decision === 'rejected' ? 'destructive' : 'default'}
            >
              {review.isPending ? 'Saving...' : `Confirm ${decision === 'approved' ? 'Approve' : 'Reject'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
