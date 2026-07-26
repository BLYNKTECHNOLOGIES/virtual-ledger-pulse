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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Hourglass, Search, ShieldAlert } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { TableSkeleton } from '@/components/ui/skeleton';

/**
 * Interventions page (renamed from "Regularization").
 *
 * Doctrine: the v4 attendance engine is the source of truth. Manual attendance
 * edits are audit-tracked "interventions", not routine corrections. Every
 * approval requires a fixed reason_code AND a note, and is written to
 * hr_attendance_intervention_log alongside the request update.
 */

const REASON_CODES: Array<{ value: string; label: string; help: string }> = [
  { value: 'missed_punch', label: 'Missed punch', help: 'Employee forgot to tap in/out but was actually present.' },
  { value: 'device_offline', label: 'Device offline', help: 'Biometric device was down when they punched.' },
  { value: 'wrong_shift_mapped', label: 'Wrong shift mapped', help: 'Employee\'s shift assignment was incorrect for that day.' },
  { value: 'stale_session_resolution', label: 'Stale-session resolution', help: 'Closing a session the watchdog flagged as stuck.' },
  { value: 'approved_offsite', label: 'Approved off-site work', help: 'Pre-approved off-premises work with no punch.' },
  { value: 'other_documented', label: 'Other (documented)', help: 'Any other reason — explain fully in notes.' },
];

export default function AttendanceRegularizationPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('pending');
  const [search, setSearch] = useState('');
  const [reviewing, setReviewing] = useState<any>(null);
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  const [notes, setNotes] = useState('');
  const [reasonCode, setReasonCode] = useState<string>('');

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

  const { data: recentInterventions = [] } = useQuery({
    queryKey: ['intervention_log_recent'],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('hr_attendance_intervention_log')
        .select('id, action, reason_code, notes, actor_email, created_at, employee_id')
        .order('created_at', { ascending: false })
        .limit(20);
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
      if (decision === 'approved' && !reasonCode) throw new Error('Pick a reason code before approving');
      if (!notes.trim()) throw new Error('Notes are mandatory for every intervention');
      const { data: u } = await supabase.auth.getUser();
      const nowIso = new Date().toISOString();

      const { error } = await (supabase as any)
        .from('hr_attendance_regularization_requests')
        .update({
          status: decision,
          reason_code: decision === 'approved' ? reasonCode : null,
          approver_id: u?.user?.id,
          approver_notes: notes,
          approved_at: nowIso,
        })
        .eq('id', reviewing.id);
      if (error) throw error;

      // Audit trail — every manual attendance edit is logged.
      await (supabase as any).from('hr_attendance_intervention_log').insert({
        request_id: reviewing.id,
        employee_id: reviewing.employee_id,
        action: decision === 'approved' ? 'regularization_approved' : 'regularization_rejected',
        reason_code: decision === 'approved' ? reasonCode : null,
        notes,
        actor_id: u?.user?.id ?? null,
        actor_email: u?.user?.email ?? null,
        payload: {
          attendance_date: reviewing.attendance_date,
          requested_check_in: reviewing.requested_check_in,
          requested_check_out: reviewing.requested_check_out,
        },
      });
    },
    onSuccess: () => {
      toast.success(`Intervention ${decision}`);
      setReviewing(null);
      setNotes('');
      setReasonCode('');
      qc.invalidateQueries({ queryKey: ['reg_requests_hr'] });
      qc.invalidateQueries({ queryKey: ['intervention_log_recent'] });
    },
    onError: (e: any) => toast.error(e.message || 'Failed'),
  });

  const fmtTime = (ts: string | null) =>
    ts ? new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div className="space-y-4">
      <PageHeader
        title="Attendance Interventions"
        description="The only manual door into the v4 attendance engine. Every approval is audited with a reason code."
      />

      <Alert className="border-warning/40 bg-warning/5">
        <ShieldAlert className="h-4 w-4 text-warning" />
        <AlertTitle>No-Intervention doctrine</AlertTitle>
        <AlertDescription className="text-xs">
          The v4 engine is authoritative. Use this page only when biometric data is genuinely incorrect —
          missed punches, device outages, wrong shifts. Every approval requires a fixed reason code and a
          note, and is written to <code>hr_attendance_intervention_log</code>. Prefer fixing device mappings
          and shift schedules over recurring interventions for the same employee.
        </AlertDescription>
      </Alert>

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

      {/* Mobile */}
      <div className="md:hidden space-y-2">
        {isLoading ? (
          <TableSkeleton rows={4} columns={2} />
        ) : filtered.length === 0 ? (
          <Card><CardContent className="p-0"><EmptyState icon={Hourglass} title="No interventions" description="Nothing matches the current filter." /></CardContent></Card>
        ) : filtered.map((r: any) => {
          const emp = r.hr_employees;
          return (
            <Card key={r.id}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{emp?.first_name} {emp?.last_name}</div>
                    <div className="text-xs text-muted-foreground">{emp?.badge_id} · {r.attendance_date}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium capitalize shrink-0 ${
                    r.status === 'approved' ? 'bg-success/10 text-success' :
                    r.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
                    r.status === 'cancelled' ? 'bg-muted text-muted-foreground' :
                    'bg-warning/10 text-warning'
                  }`}>{r.status}</span>
                </div>
                <div className="text-xs font-mono tabular-nums text-muted-foreground">In: {fmtTime(r.requested_check_in)} · Out: {fmtTime(r.requested_check_out)}</div>
                <div className="text-xs"><span className="text-muted-foreground">Reason:</span> {r.reason}</div>
                {r.reason_code && <div className="text-[10px] uppercase tracking-wide text-muted-foreground">code: {r.reason_code}</div>}
                {r.approver_notes && <div className="text-xs italic text-muted-foreground">"{r.approver_notes}"</div>}
                {r.status === 'pending' && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" className="flex-1 h-10" onClick={() => { setReviewing(r); setDecision('approved'); setNotes(''); setReasonCode(''); }}>
                      <CheckCircle2 className="h-4 w-4 mr-1 text-success" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 h-10" onClick={() => { setReviewing(r); setDecision('rejected'); setNotes(''); setReasonCode(''); }}>
                      <XCircle className="h-4 w-4 mr-1 text-destructive" /> Reject
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Desktop */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton rows={5} />
          ) : filtered.length === 0 ? (
            <EmptyState icon={Hourglass} title="No interventions" description="Nothing matches the current filter." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Employee</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Date</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Requested In</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Requested Out</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Reason / Code</th>
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
                          {r.reason_code && <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{r.reason_code}</div>}
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
                              <Button size="sm" variant="outline" onClick={() => { setReviewing(r); setDecision('approved'); setNotes(''); setReasonCode(''); }}>
                                <CheckCircle2 className="h-4 w-4 mr-1 text-success" /> Approve
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => { setReviewing(r); setDecision('rejected'); setNotes(''); setReasonCode(''); }}>
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

      {/* Intervention log */}
      {recentInterventions.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-medium mb-2">Recent intervention log</div>
            <div className="space-y-1 text-xs">
              {recentInterventions.map((l: any) => (
                <div key={l.id} className="flex items-start justify-between gap-3 border-b border-border/50 pb-1">
                  <div className="min-w-0">
                    <div className="font-medium">{l.action.replace(/_/g, ' ')}</div>
                    <div className="text-muted-foreground truncate">{l.notes} {l.reason_code && <span className="uppercase">· {l.reason_code}</span>}</div>
                  </div>
                  <div className="text-right shrink-0 text-muted-foreground">
                    <div>{l.actor_email || 'system'}</div>
                    <div>{new Date(l.created_at).toLocaleString('en-IN')}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {decision === 'approved' ? 'Approve' : 'Reject'} Intervention
            </DialogTitle>
          </DialogHeader>
          {reviewing && (
            <div className="space-y-3 text-sm">
              <div className="p-3 rounded bg-muted/40">
                <div className="font-medium">{reviewing.hr_employees?.first_name} {reviewing.hr_employees?.last_name} — {reviewing.attendance_date}</div>
                <div className="text-xs text-muted-foreground mt-1">Reason: {reviewing.reason}</div>
                <div className="text-xs mt-1">In: {fmtTime(reviewing.requested_check_in)} · Out: {fmtTime(reviewing.requested_check_out)}</div>
              </div>
              {decision === 'approved' && (
                <div>
                  <Label>Reason code *</Label>
                  <Select value={reasonCode} onValueChange={setReasonCode}>
                    <SelectTrigger><SelectValue placeholder="Pick a reason code" /></SelectTrigger>
                    <SelectContent>
                      {REASON_CODES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          <div className="flex flex-col">
                            <span>{c.label}</span>
                            <span className="text-[10px] text-muted-foreground">{c.help}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Notes *</Label>
                <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Explain the intervention — this is stored in the audit log." />
              </div>
              {decision === 'approved' && (
                <p className="text-xs text-muted-foreground">
                  Approving patches attendance for {reviewing.attendance_date} and appends an intervention log entry.
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
