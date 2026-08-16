import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import {
  CheckCircle2, XCircle, Hourglass, Search, ShieldAlert, Clock, RefreshCw, AlertTriangle, UserCheck,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { sendRegularizationEmail, regCategoryLabel, regStageLabel } from '@/utils/regularizationEmail';
import { EmptyState } from '@/components/shared/EmptyState';
import { TableSkeleton } from '@/components/ui/skeleton';
import { ResponsiveDialog } from '@/components/horilla/primitives/ResponsiveDialog';

/**
 * Attendance Regularization requests (HR review).
 * Stale-session resolution lives on its own page (/hrms/attendance/stale-sessions).
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

  // ---------- Legacy regularization state ----------
  const [status, setStatus] = useState('pending');
  const [search, setSearch] = useState('');
  const [reviewing, setReviewing] = useState<any>(null);
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  const [notes, setNotes] = useState('');
  const [reasonCode, setReasonCode] = useState<string>('');
  // F4 · propose-and-validate
  const [evidence, setEvidence] = useState<any>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');



  // ---------- Legacy regularization data ----------
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['reg_requests_hr', status],
    queryFn: async () => {
      let q = (supabase as any)
        .from('hr_attendance_regularization_requests')
        .select('*, hr_employees!hr_attendance_regularization_requests_employee_id_fkey(id, badge_id, first_name, last_name, email), manager:hr_employees!hr_attendance_regularization_requests_manager_id_fkey(id, first_name, last_name, email)')
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

  // F4 · fetch the propose-and-validate evidence whenever the review dialog opens
  // for an approve decision. The server returns the raw punch matches (or lack
  // thereof) and any conflict with an existing session.
  const openReview = async (r: any, dec: 'approved' | 'rejected') => {
    setReviewing(r);
    setDecision(dec);
    setNotes('');
    setReasonCode('');
    setOverrideReason('');
    setEvidence(null);
    if (dec !== 'approved') return;
    setEvidenceLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc('hr_validate_regularization_proposal', {
        _employee_id: r.employee_id,
        _date: r.attendance_date,
        _proposed_in: r.requested_check_in,
        _proposed_out: r.requested_check_out,
        _window_minutes: 10,
      });
      if (error) throw error;
      setEvidence(data);
    } catch (e: any) {
      toast.error(e?.message || 'Could not validate against raw punches');
    } finally {
      setEvidenceLoading(false);
    }
  };

  // ---------- Push to reporting manager ----------
  const pushToManager = useMutation({
    mutationFn: async (r: any) => {
      const { data: wi } = await (supabase as any)
        .from('hr_employee_work_info')
        .select('reporting_manager_id')
        .eq('employee_id', r.employee_id)
        .maybeSingle();
      const managerId = wi?.reporting_manager_id;
      if (!managerId || managerId === r.employee_id) {
        throw new Error('No reporting manager is set for this employee — set one in the employee work info first.');
      }
      const { data: u } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from('hr_attendance_regularization_requests')
        .update({ status: 'manager_review', manager_id: managerId, pushed_by: u?.user?.id ?? null })
        .eq('id', r.id);
      if (error) throw error;

      const { data: mgr } = await (supabase as any)
        .from('hr_employees')
        .select('first_name, last_name, email')
        .eq('id', managerId)
        .maybeSingle();

      await (supabase as any).from('hr_attendance_intervention_log').insert({
        request_id: r.id,
        employee_id: r.employee_id,
        action: 'regularization_pushed_to_manager',
        notes: `Forwarded to ${[mgr?.first_name, mgr?.last_name].filter(Boolean).join(' ') || 'reporting manager'}`,
        actor_id: u?.user?.id ?? null,
        actor_email: u?.user?.email ?? null,
        payload: { manager_id: managerId, attendance_date: r.attendance_date },
      });

      sendRegularizationEmail({
        eventType: 'reg_pushed_to_manager',
        requestId: r.id,
        employeeName: `${r.hr_employees?.first_name || ''} ${r.hr_employees?.last_name || ''}`.trim() || 'Employee',
        attendanceDate: r.attendance_date,
        requestedIn: fmtTime(r.requested_check_in),
        requestedOut: fmtTime(r.requested_check_out),
        reasonCategory: regCategoryLabel(r.reason_category),
        reason: r.reason,
        managerEmail: mgr?.email || null,
        managerName: [mgr?.first_name, mgr?.last_name].filter(Boolean).join(' ') || null,
      });
    },
    onSuccess: () => {
      toast.success('Forwarded to the reporting manager');
      qc.invalidateQueries({ queryKey: ['reg_requests_hr'] });
      qc.invalidateQueries({ queryKey: ['intervention_log_recent'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Could not forward the request'),
  });

  const review = useMutation({
    mutationFn: async () => {
      if (!reviewing) return;
      if (decision === 'approved' && !reasonCode) throw new Error('Pick a reason code before approving');
      const isOverride = decision === 'approved' && evidence && !evidence.evidence_ok;
      if (isOverride && !overrideReason.trim()) {
        throw new Error('Unsupported edits require an override reason (this is audited).');
      }
      if (decision === 'rejected' && !overrideReason.trim()) {
        throw new Error('A rejection reason is required (this is audited).');
      }
      const auditNote = overrideReason.trim()
        || (decision === 'approved'
          ? (REASON_CODES.find((c) => c.value === reasonCode)?.label || 'Approved')
          : 'Rejected');
      const { data: u } = await supabase.auth.getUser();
      const nowIso = new Date().toISOString();


      const evidenceStatus = decision === 'approved'
        ? (evidence?.evidence_ok ? 'evidence_ok' : 'unsupported_override')
        : null;

      const { error } = await (supabase as any)
        .from('hr_attendance_regularization_requests')
        .update({
          status: decision,
          reason_code: decision === 'approved' ? reasonCode : null,
          approver_id: u?.user?.id,
          approver_notes: auditNote,
          approved_at: nowIso,
          evidence_status: evidenceStatus,
          evidence_payload: evidence ?? null,
          override_admin_id: isOverride ? u?.user?.id : null,
          override_reason: isOverride ? overrideReason : null,
        })
        .eq('id', reviewing.id);
      if (error) throw error;

      await (supabase as any).from('hr_attendance_intervention_log').insert({
        request_id: reviewing.id,
        employee_id: reviewing.employee_id,
        action: decision === 'approved'
          ? (isOverride ? 'regularization_unsupported_override' : 'regularization_approved')
          : 'regularization_rejected',
        reason_code: decision === 'approved' ? reasonCode : null,
        notes: auditNote,
        actor_id: u?.user?.id ?? null,
        actor_email: u?.user?.email ?? null,
        payload: {
          attendance_date: reviewing.attendance_date,
          requested_check_in: reviewing.requested_check_in,
          requested_check_out: reviewing.requested_check_out,
          evidence_status: evidenceStatus,
          override_reason: isOverride ? overrideReason : null,
          matched_in_punch_id: evidence?.matched_in_punch_id ?? null,
          matched_out_punch_id: evidence?.matched_out_punch_id ?? null,
        },
      });

      sendRegularizationEmail({
        eventType: decision === 'approved' ? 'reg_approved' : 'reg_rejected',
        requestId: reviewing.id,
        employeeName: `${reviewing.hr_employees?.first_name || ''} ${reviewing.hr_employees?.last_name || ''}`.trim() || 'Employee',
        attendanceDate: reviewing.attendance_date,
        requestedIn: fmtTime(reviewing.requested_check_in),
        requestedOut: fmtTime(reviewing.requested_check_out),
        reasonCategory: regCategoryLabel(reviewing.reason_category),
        reason: reviewing.reason,
        managerRecommendation: reviewing.manager_status
          ? (reviewing.manager_status === 'approved' ? 'Approved' : 'Rejected')
          : null,
        managerRemarks: reviewing.manager_remarks || null,
        decidedBy: 'HR',
        approverNotes: auditNote,
        employeeEmail: reviewing.hr_employees?.email || null,
      });
    },
    onSuccess: () => {
      toast.success(`Intervention ${decision}`);
      setReviewing(null); setNotes(''); setReasonCode(''); setEvidence(null); setOverrideReason('');
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
        title="Attendance Regularization"
        description="Review and action attendance regularization requests. Every approval is audited."
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Regularization requests</CardTitle>
          <p className="text-xs text-muted-foreground">
            Every approval demands a reason code and note, audited into <code>hr_attendance_intervention_log</code>.
          </p>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by badge, name, reason..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Awaiting HR</SelectItem>
                <SelectItem value="manager_review">With manager</SelectItem>
                <SelectItem value="manager_reviewed">Manager reviewed</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-2">
            {isLoading ? (
              <TableSkeleton rows={4} columns={2} />
            ) : filtered.length === 0 ? (
              <EmptyState icon={Hourglass} title="No requests" description="Nothing matches the current filter." />
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
                      }`}>{regStageLabel(r)}</span>
                    </div>
                    <div className="text-xs font-mono tabular-nums text-muted-foreground">
                      In: {fmtTime(r.requested_check_in)} · Out: {fmtTime(r.requested_check_out)}
                    </div>
                    <div className="text-xs"><span className="text-muted-foreground">Reason:</span> {r.reason}</div>
                    {r.reason_code && <div className="text-[10px] uppercase tracking-wide text-muted-foreground">code: {r.reason_code}</div>}
                    {r.approver_notes && <div className="text-xs italic text-muted-foreground">"{r.approver_notes}"</div>}
                    {r.manager_status && (
                      <div className="text-xs text-muted-foreground">
                        Manager {r.manager_status}
                        {r.manager?.first_name ? ` (${r.manager.first_name} ${r.manager.last_name || ''})` : ''}
                        {r.manager_remarks ? ` · "${r.manager_remarks}"` : ''}
                      </div>
                    )}
                    {(r.status === 'pending' || r.status === 'manager_reviewed') && (
                      <div className="flex gap-2 pt-1 flex-wrap">
                        <Button size="sm" variant="outline" className="flex-1 h-10" onClick={() => openReview(r, 'approved')}>
                          <CheckCircle2 className="h-4 w-4 mr-1 text-success" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 h-10" onClick={() => openReview(r, 'rejected')}>
                          <XCircle className="h-4 w-4 mr-1 text-destructive" /> Reject
                        </Button>
                        {r.status === 'pending' && (
                          <Button size="sm" variant="outline" className="w-full h-10" disabled={pushToManager.isPending}
                            onClick={() => pushToManager.mutate(r)}>
                            <UserCheck className="h-4 w-4 mr-1" /> Push to manager
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Desktop */}
          <div className="hidden md:block">
            {isLoading ? (
              <TableSkeleton rows={5} />
            ) : filtered.length === 0 ? (
              <EmptyState icon={Hourglass} title="No requests" description="Nothing matches the current filter." />
            ) : (
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Employee</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Date</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">In</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Out</th>
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
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {regCategoryLabel(r.reason_category)}{r.reason_code ? ` · ${r.reason_code}` : ''}
                            </div>
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
                            }`}>{regStageLabel(r)}</span>
                            {r.manager_status && (
                              <div className="text-[11px] text-muted-foreground mt-1">
                                Manager {r.manager_status}
                                {r.manager?.first_name ? ` · ${r.manager.first_name} ${r.manager.last_name || ''}` : ''}
                                {r.manager_remarks ? ` · "${r.manager_remarks}"` : ''}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right space-x-1">
                            {(r.status === 'pending' || r.status === 'manager_reviewed') && (
                              <>
                                <Button size="sm" variant="outline" onClick={() => openReview(r, 'approved')}>
                                  <CheckCircle2 className="h-4 w-4 mr-1 text-success" /> Approve
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => openReview(r, 'rejected')}>
                                  <XCircle className="h-4 w-4 mr-1 text-destructive" /> Reject
                                </Button>
                                {r.status === 'pending' && (
                                  <Button size="sm" variant="ghost" disabled={pushToManager.isPending}
                                    onClick={() => pushToManager.mutate(r)}>
                                    <UserCheck className="h-4 w-4 mr-1" /> Push to manager
                                  </Button>
                                )}
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
          </div>
        </CardContent>
      </Card>

      {/* Intervention audit log */}
      {recentInterventions.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-medium mb-2">Recent intervention log</div>
            <div className="space-y-1 text-xs">
              {recentInterventions.map((l: any) => (
                <div key={l.id} className="flex items-start justify-between gap-3 border-b border-border/50 pb-1">
                  <div className="min-w-0">
                    <div className="font-medium">{l.action.replace(/_/g, ' ')}</div>
                    <div className="text-muted-foreground truncate">
                      {l.notes} {l.reason_code && <span className="uppercase">· {l.reason_code}</span>}
                    </div>
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


      {/* ============ Legacy review dialog ============ */}
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
                <>
                  {/* F4 · propose-and-validate evidence panel */}
                  <div className="rounded border p-2 text-xs space-y-1">
                    <div className="font-medium flex items-center gap-2">
                      Raw-punch evidence
                      {evidenceLoading && <span className="text-muted-foreground">checking…</span>}
                    </div>
                    {evidence ? (
                      evidence.evidence_ok ? (
                        <div className="text-success flex items-start gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 mt-0.5" />
                          <div>
                            Proposal is supported by raw punches within ±{evidence.window_minutes ?? 10} min.
                            {evidence.matched_in_punch_at && <div>Matched IN: {fmtTime(evidence.matched_in_punch_at)}</div>}
                            {evidence.matched_out_punch_at && <div>Matched OUT: {fmtTime(evidence.matched_out_punch_at)}</div>}
                          </div>
                        </div>
                      ) : (
                        <div className="text-warning flex items-start gap-1">
                          <AlertTriangle className="h-3.5 w-3.5 mt-0.5" />
                          <div>
                            No raw punches match this proposal. Approving will record an <b>unsupported override</b> in the audit log.
                            {Array.isArray(evidence.nearby_punches) && evidence.nearby_punches.length > 0 && (
                              <div className="mt-1 text-muted-foreground">
                                Nearby: {evidence.nearby_punches.slice(0, 4).map((p: any) => fmtTime(p.punch_time)).join(', ')}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    ) : !evidenceLoading ? (
                      <div className="text-muted-foreground">Validator returned no evidence payload.</div>
                    ) : null}
                  </div>

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

                  {evidence && !evidence.evidence_ok && (
                    <div>
                      <Label>Override reason * <span className="text-warning">(audited)</span></Label>
                      <Textarea rows={2} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)}
                        placeholder="Why is HR approving without raw-punch support?" />
                    </div>
                  )}
                </>
              )}
              {decision === 'rejected' && (
                <div>
                  <Label>Rejection reason *</Label>
                  <Textarea rows={3} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Why is this being rejected — stored in the audit log." />
                </div>
              )}

            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewing(null)}>Cancel</Button>
            <Button onClick={() => review.mutate()} disabled={review.isPending}>
              Confirm {decision}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
