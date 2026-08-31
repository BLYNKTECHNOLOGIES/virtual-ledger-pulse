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
import { CheckCircle2, XCircle, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { sendLeaveEmail } from '@/utils/leaveEmail';
import { cn } from '@/lib/utils';

interface Props {
  employeeId: string; // the logged-in employee (potential manager)
  highlightedRequestId?: string | null;
}

const stageLabel = (r: any) =>
  r.status === 'requested' ? 'Awaiting you'
    : r.status === 'manager_approved' ? 'Awaiting HR'
      : r.status;

/**
 * ESS — Reporting-manager approval queue, inside the ERP profile.
 * Managers approve/reject their team's leave here; HR does the final approval
 * in HRMS. Managers never need HRMS access.
 */
export default function TeamLeaveApprovals({ employeeId, highlightedRequestId }: Props) {
  const qc = useQueryClient();
  const [remarks, setRemarks] = useState<Record<string, string>>({});

  const { data: requests = [], isLoading, isError, error } = useQuery({
    queryKey: ['ess_team_leave_approvals', employeeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .rpc('hr_manager_leave_queue');
      if (error) throw error;
      return data || [];
    },
    enabled: !!employeeId,
  });

  useEffect(() => {
    if (!highlightedRequestId || requests.length === 0) return;
    document.getElementById(`leave-request-${highlightedRequestId}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, [highlightedRequestId, requests]);

  const decide = useMutation({
    mutationFn: async ({ req, approve }: { req: any; approve: boolean }) => {
      const { error } = await (supabase as any)
        .from('hr_leave_requests')
        .update({
          manager_status: approve ? 'approved' : 'rejected',
          manager_remarks: remarks[req.id]?.trim() || null,
          ...(approve ? {} : { rejection_reason: remarks[req.id]?.trim() || 'Rejected by reporting manager' }),
        })
        .eq('id', req.id);
      if (error) throw error;

      sendLeaveEmail({
        eventType: approve ? 'leave_manager_approved' : 'leave_rejected',
        requestId: req.id,
        employeeName: req.employee_name || 'Employee',
        leaveType: req.leave_type_name,
        startDate: req.start_date,
        endDate: req.end_date,
        totalDays: req.total_days,
        reason: req.reason,
        decidedBy: 'Reporting manager',
      });
    },
    onSuccess: (_d, v) => {
      toast.success(v.approve ? 'Approved — sent to HR' : 'Request rejected');
      qc.invalidateQueries({ queryKey: ['ess_team_leave_approvals', employeeId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to update request'),
  });

  if (isError) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="py-4 text-sm text-destructive">
          Leave approvals could not be loaded. {error instanceof Error ? error.message : 'Please refresh and try again.'}
        </CardContent>
      </Card>
    );
  }

  if (!isLoading && requests.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCheck className="h-4 w-4 text-primary" /> Team Leave Approvals
          <Badge variant="secondary" className="text-[10px]">
            {(requests as any[]).filter((r) => r.status === 'requested').length} pending
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
        ) : (
          (requests as any[]).map((r) => {
            const name = r.employee_name || '';
            const actionable = r.status === 'requested';
            return (
              <div
                key={r.id}
                id={`leave-request-${r.id}`}
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
                       {r.leave_type_name || 'Type set by HR'} · {r.start_date} → {r.end_date} · {r.total_days} day(s)
                    </p>
                    {r.reason && <p className="text-xs text-muted-foreground mt-1">Reason: {r.reason}</p>}
                    {(r.leave_clashes_count || 0) > 0 && (
                      <p className="text-[11px] text-destructive mt-1">
                        {r.leave_clashes_count} teammate(s) on leave in the same window
                      </p>
                    )}
                  </div>
                  <Badge variant={actionable ? 'secondary' : 'outline'} className="text-[10px] capitalize">
                    {stageLabel(r)}
                  </Badge>
                </div>

                {actionable && (
                  <>
                    <Textarea
                      rows={2}
                      className="text-foreground text-xs"
                      placeholder="Remarks (optional)"
                      value={remarks[r.id] || ''}
                      onChange={(e) => setRemarks((p) => ({ ...p, [r.id]: e.target.value }))}
                    />
                    <div className="flex gap-2 justify-end">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="text-destructive h-8">
                            <XCircle className="h-4 w-4 mr-1" /> Reject
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Reject this leave request?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {name} will be notified. Your remarks are shared with HR.
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

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" className="h-8">
                            <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Approve and send to HR?</AlertDialogTitle>
                            <AlertDialogDescription>
                              HR gives the final approval. Leave balance is only consumed after HR approves.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Back</AlertDialogCancel>
                            <AlertDialogAction onClick={() => decide.mutate({ req: r, approve: true })}>
                              Approve
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
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
