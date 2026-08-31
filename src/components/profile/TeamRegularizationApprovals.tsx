import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { CheckCircle2, XCircle, ClipboardCheck } from 'lucide-react';
import { toast } from 'sonner';
import { sendRegularizationEmail, regCategoryLabel } from '@/utils/regularizationEmail';
import { invalidateAttendanceCaches } from "@/lib/hrms/attendanceCache";
import { cn } from '@/lib/utils';

interface Props {
  employeeId: string; // logged-in employee (potential reporting manager)
  highlightedRequestId?: string | null;
}

const fmtTime = (ts: string | null) =>
  ts ? new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';

/**
 * ESS — regularization requests HR pushed to this reporting manager.
 * The manager records a recommendation; HR still gives the final approval.
 */
export default function TeamRegularizationApprovals({ employeeId, highlightedRequestId }: Props) {
  const qc = useQueryClient();
  const [remarks, setRemarks] = useState<Record<string, string>>({});

  const { data: requests = [], isLoading, isError, error } = useQuery({
    queryKey: ['ess_team_reg_approvals', employeeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .rpc('hr_manager_regularization_queue');
      if (error) throw error;
      return data || [];
    },
    enabled: !!employeeId,
  });

  useEffect(() => {
    if (!highlightedRequestId || requests.length === 0) return;
    document.getElementById(`regularization-request-${highlightedRequestId}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, [highlightedRequestId, requests]);

  const decide = useMutation({
    mutationFn: async ({ req, approve }: { req: any; approve: boolean }) => {
      const { error } = await (supabase as any)
        .from('hr_attendance_regularization_requests')
        .update({
          manager_status: approve ? 'approved' : 'rejected',
          manager_remarks: remarks[req.id]?.trim() || null,
        })
        .eq('id', req.id);
      if (error) throw error;

      sendRegularizationEmail({
        eventType: 'reg_manager_decided',
        requestId: req.id,
        employeeName: req.employee_name || 'Employee',
        attendanceDate: req.attendance_date,
        requestedIn: fmtTime(req.requested_check_in),
        requestedOut: fmtTime(req.requested_check_out),
        reasonCategory: regCategoryLabel(req.reason_category),
        reason: req.reason,
        managerRecommendation: approve ? 'Approved' : 'Rejected',
        managerRemarks: remarks[req.id]?.trim() || null,
        employeeEmail: req.employee_email || null,
      });
    },
    onSuccess: (_d, v) => {
      toast.success(v.approve ? 'Recommended for approval — sent back to HR' : 'Rejected — sent back to HR');
      qc.invalidateQueries({ queryKey: ['ess_team_reg_approvals', employeeId] });
      invalidateAttendanceCaches(qc);
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to update request'),
  });

  if (isError) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="py-4 text-sm text-destructive">
          Attendance approvals could not be loaded. {error instanceof Error ? error.message : 'Please refresh and try again.'}
        </CardContent>
      </Card>
    );
  }

  if (!isLoading && requests.length === 0) {
    if (regsWithHr > 0) {
      return (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="h-4 w-4 text-primary" /> Team Attendance Regularizations
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Nothing needs your review right now. {regsWithHr} request{regsWithHr > 1 ? 's' : ''} from your
            team {regsWithHr > 1 ? 'are' : 'is'} still with HR — {regsWithHr > 1 ? 'they' : 'it'} will appear
            here once HR forwards {regsWithHr > 1 ? 'them' : 'it'} to you.
          </CardContent>
        </Card>
      );
    }
    return null;
  }


  const pendingCount = (requests as any[]).filter((r) => r.status === 'manager_review').length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-4 w-4 text-primary" /> Team Attendance Regularizations
          <Badge variant="secondary" className="text-[10px]">{pendingCount} pending</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
        ) : (
          (requests as any[]).map((r) => {
            const name = r.employee_name || '';
            const actionable = r.status === 'manager_review';
            return (
              <div
                key={r.id}
                id={`regularization-request-${r.id}`}
                className={cn(
                  "border border-border rounded-lg p-3 space-y-2",
                  highlightedRequestId === r.id && "border-primary ring-2 ring-primary/20 bg-primary/5",
                )}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {name || 'Employee'}{' '}
                       <span className="text-muted-foreground text-xs">{r.badge_id}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.attendance_date} · In {fmtTime(r.requested_check_in)} · Out {fmtTime(r.requested_check_out)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {regCategoryLabel(r.reason_category)}{r.reason ? ` · ${r.reason}` : ''}
                    </p>
                    {r.manager_remarks && (
                      <p className="text-xs text-muted-foreground mt-1 italic">Your remarks: "{r.manager_remarks}"</p>
                    )}
                  </div>
                  <Badge variant={actionable ? 'secondary' : 'outline'} className="text-[10px]">
                    {actionable ? 'Awaiting you' : 'Sent back to HR'}
                  </Badge>
                </div>

                {actionable && (
                  <>
                    <Textarea
                      rows={2}
                      placeholder="Remarks for HR (optional)"
                      value={remarks[r.id] || ''}
                      onChange={(e) => setRemarks((p) => ({ ...p, [r.id]: e.target.value }))}
                      className="text-sm text-foreground"
                    />
                    <div className="flex gap-2 justify-end">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="outline" className="text-destructive">
                            <XCircle className="h-4 w-4 mr-1" /> Reject
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Reject this regularization?</AlertDialogTitle>
                            <AlertDialogDescription>
                              HR will see your rejection and take the final call.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Back</AlertDialogCancel>
                            <AlertDialogAction onClick={() => decide.mutate({ req: r, approve: false })}>
                              Reject
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ req: r, approve: true })}>
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                      </Button>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
