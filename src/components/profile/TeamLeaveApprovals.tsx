import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { CheckCircle2, XCircle, UserCheck, Users } from 'lucide-react';
import { toast } from 'sonner';
import { sendLeaveEmail } from '@/utils/leaveEmail';
import { cn } from '@/lib/utils';
import { SectionBlock, StatusPill } from './primitives';
import { useTeamLeaveQueue } from './hooks';
import { fmtDays, fmtRange } from './format';

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

  // Shared with the page's nav badge (same key and query).
  const { data: requests = [], isLoading, isError, error } = useTeamLeaveQueue(employeeId);

  useEffect(() => {
    if (!highlightedRequestId || requests.length === 0) return;
    document.getElementById(`leave-request-${highlightedRequestId}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, [highlightedRequestId, requests]);

  const decide = useMutation({
    mutationFn: async ({ req, approve }: { req: any; approve: boolean }) => {
      if (!approve && !remarks[req.id]?.trim()) throw new Error('Add a short reason before rejecting — it is shared with the employee');
      const { error } = await (supabase as any)
        .from('hr_leave_requests')
        .update({
          manager_status: approve ? 'approved' : 'rejected',
          manager_remarks: remarks[req.id]?.trim() || null,
          ...(approve ? {} : { rejection_reason: remarks[req.id]?.trim() }),
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
        rejectionReason: approve ? undefined : remarks[req.id]?.trim(),
        employeeEmail: req.employee_email || null,
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
      <div className="ds-panel !border-destructive/40 px-3.5 py-3 text-sm text-destructive">
        Leave approvals could not be loaded. {error instanceof Error ? error.message : 'Please refresh and try again.'}
      </div>
    );
  }

  // Nothing to show for people with no team (also while loading — avoids a flash).
  if (isLoading || requests.length === 0) return null;

  const waiting = (requests as any[]).filter((r) => r.status === 'requested').length;

  return (
    <SectionBlock
      icon={UserCheck}
      title="Team leave approvals"
      description="You approve first; HR gives the final approval."
      actions={<StatusPill tone={waiting ? 'warning' : 'neutral'}>{waiting} waiting for you</StatusPill>}
      bodyClassName="space-y-3"
    >
      {(requests as any[]).map((r) => {
        const name = r.employee_name || '';
        const actionable = r.status === 'requested';
        return (
          <div
            key={r.id}
            id={`leave-request-${r.id}`}
            className={cn(
              "rounded-md border border-border p-3 space-y-2.5",
              actionable ? 'bg-card' : 'bg-muted/30',
              highlightedRequestId === r.id && "border-primary ring-2 ring-primary/20 bg-primary/5",
            )}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-foreground">
                  {name || 'Employee'}{' '}
                  {r.badge_id && <span className="ml-1 rounded bg-muted px-1.5 font-mono text-[11px] font-medium text-muted-foreground">#{r.badge_id}</span>}
                </p>
                <p className="mt-0.5 text-[13px] text-foreground">
                  {r.leave_type_name || 'Type set by HR'} · {fmtRange(r.start_date, r.end_date)}
                  <span className="text-muted-foreground"> · {fmtDays(r.total_days)} day{Number(r.total_days) === 1 ? '' : 's'}{r.is_half_day ? ` · ${r.half_day_period === 'afternoon' ? 'second half' : 'first half'}` : ''}</span>
                </p>
                {r.reason && <p className="mt-1 text-xs text-muted-foreground">“{r.reason}”</p>}
                {(r.leave_clashes_count || 0) > 0 && (
                  <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-warning">
                    <Users className="h-3 w-3" /> {r.leave_clashes_count} teammate(s) on leave in the same window
                  </p>
                )}
              </div>
              <StatusPill tone={actionable ? 'warning' : 'neutral'}>{stageLabel(r)}</StatusPill>
            </div>

            {actionable && (
              <>
                <Textarea
                  rows={2}
                  className="text-foreground text-xs"
                  placeholder="Remarks — required to reject (shared with the employee)"
                  value={remarks[r.id] || ''}
                  onChange={(e) => setRemarks((p) => ({ ...p, [r.id]: e.target.value }))}
                />
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {!remarks[r.id]?.trim() && <span className="mr-auto text-[11px] text-muted-foreground">Add a remark to reject</span>}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline" className="text-destructive h-8" disabled={!remarks[r.id]?.trim()} title={!remarks[r.id]?.trim() ? 'Add remarks to reject' : undefined}>
                        <XCircle className="h-4 w-4 mr-1" /> Reject
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Reject this leave request?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {name} will be notified. Your remarks are shared with HR and with {name} as the reason for rejection.
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
      })}
    </SectionBlock>
  );
}
