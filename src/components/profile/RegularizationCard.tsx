import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { ClipboardList, Plus, XCircle } from 'lucide-react';
import { invalidateAttendanceCaches } from "@/lib/hrms/attendanceCache";
import { regStageLabel, regCategoryLabel } from '@/utils/regularizationEmail';
import { SectionBlock, StatusPill, ProfileEmptyState, ProfileSkeleton } from './primitives';
import { fmtDay, fmtTime, humanize } from './format';


interface Props {
  employeeId: string;
  /** Opens the correction form on the Requests tab. */
  onRequestCorrection?: (date?: string) => void;
}

const toneOf = (status: string) =>
  status === 'approved' ? 'success' : status === 'rejected' ? 'danger' : status === 'cancelled' ? 'neutral' : 'warning';

export default function RegularizationCard({ employeeId, onRequestCorrection }: Props) {
  const qc = useQueryClient();

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
      invalidateAttendanceCaches(qc);
    },
    onError: (e: any) => toast.error(e.message || 'Failed to cancel'),
  });

  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? requests : (requests as any[]).slice(0, 5);
  const lastConfirmId = useRef<string | null>(null);
  if (confirmId) lastConfirmId.current = confirmId;
  const confirmReq = (requests as any[]).find((r) => r.id === (confirmId ?? lastConfirmId.current));

  return (
    <SectionBlock
      icon={ClipboardList}
      title="Attendance corrections"
      description="Requests to fix a missing or wrong punch"
      flush
      actions={onRequestCorrection ? (
        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => onRequestCorrection()}>
          <Plus className="h-3.5 w-3.5" /> Fix a punch
        </Button>
      ) : undefined}
    >
      {isLoading ? (
        <ProfileSkeleton rows={3} bare />
      ) : requests.length === 0 ? (
        <ProfileEmptyState
          bare
          className="py-6"
          title="No correction requests"
          description='If a punch is missing on a day you worked, use "Fix a punch" to send HR your actual times.'
        />
      ) : (
        <>
          <ul className="divide-y divide-border">
            {shown.map((r: any) => {
              const stage = regStageLabel(r);
              return (
                <li key={r.id} className="space-y-1 px-3.5 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-foreground">{fmtDay(r.attendance_date)}</span>
                    <StatusPill tone={toneOf(r.status) as any}>{stage === r.status ? humanize(r.status) : stage}</StatusPill>
                  </div>
                  <p className="font-mono text-xs tabular-nums text-muted-foreground">
                    In {fmtTime(r.requested_check_in)} · Out {fmtTime(r.requested_check_out)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.reason_category ? `${regCategoryLabel(r.reason_category)} · ` : ''}{r.reason || '—'}
                  </p>
                  {r.approver_notes && (
                    <p className={r.status === 'rejected' ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>HR: {r.approver_notes}</p>
                  )}
                  {r.status === 'pending' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() => setConfirmId(r.id)}
                      disabled={cancel.isPending}
                    >
                      <XCircle className="h-3.5 w-3.5" /> Cancel request
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          {(requests as any[]).length > 5 && (
            <div className="border-t border-border px-3.5 py-2">
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show fewer' : `Show all ${(requests as any[]).length}`}
              </Button>
            </div>
          )}
        </>
      )}

      <AlertDialog open={!!confirmId} onOpenChange={(o) => { if (!o) setConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this correction request?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmReq ? `${fmtDay(confirmReq.attendance_date)}. ` : ''}It is withdrawn and HR will not review it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirmId) cancel.mutate(confirmId); setConfirmId(null); }}>
              Cancel request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionBlock>
  );
}
