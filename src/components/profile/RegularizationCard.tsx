import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Clock, CheckCircle2, XCircle, Hourglass, Ban } from 'lucide-react';
import { invalidateAttendanceCaches } from "@/lib/hrms/attendanceCache";


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

  const fmtTime = (ts: string | null) =>
    ts ? new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Clock className="h-4 w-4" /> Attendance Regularization
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <p className="text-center py-6 text-muted-foreground text-sm">Loading...</p>
        ) : requests.length === 0 ? (
          <p className="text-center py-6 px-4 text-muted-foreground text-sm">
            No requests yet. Use the <strong>Request</strong> button above to raise an attendance regularization.
          </p>
        ) : (
          <>
            {/* Mobile: stacked cards */}
            <div className="sm:hidden divide-y">
              {requests.map((r: any) => {
                const meta = statusMeta[r.status] || statusMeta.pending;
                const Icon = meta.icon;
                return (
                  <div key={r.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm">{r.attendance_date}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>
                        <Icon className="h-3 w-3" /> {meta.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>In <span className="font-mono text-foreground">{fmtTime(r.requested_check_in)}</span></span>
                      <span>Out <span className="font-mono text-foreground">{fmtTime(r.requested_check_out)}</span></span>
                    </div>
                    <p className="text-sm text-foreground break-words">{r.reason}</p>
                    {r.approver_notes && (
                      <p className="text-xs text-muted-foreground italic break-words">"{r.approver_notes}"</p>
                    )}
                    {r.status === 'pending' && (
                      <Button size="sm" variant="outline" className="w-full" onClick={() => cancel.mutate(r.id)}>
                        Cancel request
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop: table */}
            <div className="hidden sm:block overflow-x-auto">
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
          </>
        )}
      </CardContent>
    </Card>
  );
}
