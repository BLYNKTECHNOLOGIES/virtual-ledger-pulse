import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { LogOut, CheckCircle2, Circle, IndianRupee } from 'lucide-react';

interface Employee {
  id: string;
  is_active?: boolean;
  resignation_date?: string | null;
  resignation_status?: string | null;
  notice_period_end_date?: string | null;
  last_working_day?: string | null;
  separation_reason?: string | null;
}

export default function MySeparationCard({ employee }: { employee: Employee }) {
  const isSeparating = !!employee.resignation_status;

  const { data: checklist = [] } = useQuery({
    queryKey: ['my_resignation_checklist', employee.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_resignation_checklist')
        .select('id, item_title, is_completed, completed_at, notes')
        .eq('employee_id', employee.id)
        .order('created_at');
      if (error) throw error;
      return data || [];
    },
    enabled: !!employee.id && isSeparating,
  });

  const { data: fnf } = useQuery({
    queryKey: ['my_fnf', employee.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_fnf_settlements')
        .select('*')
        .eq('employee_id', employee.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!employee.id && isSeparating,
  });

  if (!isSeparating) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><LogOut className="h-4 w-4" /> Separation</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            You are currently an active employee. To initiate resignation, please contact HR directly or raise a Help Desk ticket — this is an
            HR-mediated process to ensure your notice period, F&F, and clearances are handled correctly.
          </p>
        </CardContent>
      </Card>
    );
  }

  const doneCount = checklist.filter((c: any) => c.is_completed).length;
  const pct = checklist.length ? Math.round((doneCount / checklist.length) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2"><LogOut className="h-4 w-4" /> Separation in Progress</span>
          <Badge variant="outline">{employee.resignation_status}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div><div className="text-[11px] text-muted-foreground">Resignation Date</div><div className="font-medium">{employee.resignation_date ? new Date(employee.resignation_date).toLocaleDateString() : '—'}</div></div>
          <div><div className="text-[11px] text-muted-foreground">Notice Ends</div><div className="font-medium">{employee.notice_period_end_date ? new Date(employee.notice_period_end_date).toLocaleDateString() : '—'}</div></div>
          <div><div className="text-[11px] text-muted-foreground">Last Working Day</div><div className="font-medium">{employee.last_working_day ? new Date(employee.last_working_day).toLocaleDateString() : '—'}</div></div>
          {employee.separation_reason && (
            <div className="col-span-2 md:col-span-3"><div className="text-[11px] text-muted-foreground">Reason</div><div>{employee.separation_reason}</div></div>
          )}
        </div>

        {checklist.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium text-muted-foreground">Exit Checklist</div>
              <div className="text-xs">{doneCount}/{checklist.length}</div>
            </div>
            <Progress value={pct} className="h-2 mb-3" />
            <div className="space-y-1.5">
              {checklist.map((c: any) => (
                <div key={c.id} className="flex items-center gap-2 text-sm">
                  {c.is_completed ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                  <span className={c.is_completed ? 'line-through text-muted-foreground' : ''}>{c.item_title}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {fnf && (
          <div className="rounded-lg border p-3">
            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1"><IndianRupee className="h-3 w-3" /> F&F Preview</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Pending Salary <span className="float-right font-medium">₹{Number(fnf.pending_salary || 0).toLocaleString('en-IN')}</span></div>
              <div>Leave Encashment <span className="float-right font-medium">₹{Number(fnf.leave_encashment_amount || 0).toLocaleString('en-IN')}</span></div>
              <div>Bonus <span className="float-right font-medium">₹{Number(fnf.bonus_amount || 0).toLocaleString('en-IN')}</span></div>
              <div>Deposit Refund <span className="float-right font-medium">₹{Number(fnf.deposit_refund || 0).toLocaleString('en-IN')}</span></div>
              <div className="text-destructive">Loan Recovery <span className="float-right font-medium">−₹{Number(fnf.loan_recovery || 0).toLocaleString('en-IN')}</span></div>
              <div className="text-destructive">Deductions <span className="float-right font-medium">−₹{Number((Number(fnf.penalty_deductions || 0) + Number(fnf.other_deductions || 0))).toLocaleString('en-IN')}</span></div>
              <div className="col-span-2 pt-2 border-t font-semibold">Net Payable <span className="float-right">₹{Number(fnf.net_payable || 0).toLocaleString('en-IN')}</span></div>
              <div className="col-span-2 text-[11px] text-muted-foreground">Status: {fnf.status || 'draft'}</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
