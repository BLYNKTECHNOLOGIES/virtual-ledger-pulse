import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, LogIn, LogOut, Timer, AlertCircle } from 'lucide-react';

interface TodayAttendanceCardProps {
  employeeId: string;
}

/**
 * Live "Today" attendance snapshot for the employee — sourced from the v4
 * `hr_attendance_daily` row for the current IST date. Falls back to sensible
 * defaults on holidays / week-offs / days with no punch yet.
 */
export default function TodayAttendanceCard({ employeeId }: TodayAttendanceCardProps) {
  // IST date (UTC+05:30)
  const istNow = new Date(Date.now() + 5.5 * 3600 * 1000);
  const today = istNow.toISOString().slice(0, 10);

  const { data, isLoading } = useQuery({
    queryKey: ['profile_today_attendance', employeeId, today],
    queryFn: async () => {
      const [{ data: daily }, { data: holiday }] = await Promise.all([
        (supabase as any)
          .from('hr_attendance_daily')
          .select('*')
          .eq('employee_id', employeeId)
          .eq('attendance_date', today)
          .maybeSingle(),
        (supabase as any)
          .from('hr_holidays')
          .select('name')
          .eq('date', today)
          .eq('is_active', true)
          .maybeSingle(),
      ]);
      return { daily, holiday };
    },
    enabled: !!employeeId,
    refetchInterval: 60_000,
  });

  const fmtTime = (ts: string | null | undefined) =>
    ts
      ? new Date(ts).toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Kolkata',
        })
      : '—';

  const status: string = data?.holiday
    ? 'Holiday'
    : (data?.daily?.status as string) || 'no_punch';

  const badge = (() => {
    const base = 'px-2.5 py-0.5 rounded-full text-xs font-semibold';
    switch (status) {
      case 'present':
        return { cls: `${base} bg-success/15 text-success`, label: 'Present' };
      case 'incomplete':
      case 'in_progress':
        return { cls: `${base} bg-info/15 text-info`, label: 'In progress' };
      case 'absent':
        return { cls: `${base} bg-destructive/15 text-destructive`, label: 'Absent' };
      case 'week_off':
        return { cls: `${base} bg-muted text-muted-foreground`, label: 'Week off' };
      case 'on_leave':
        return { cls: `${base} bg-primary/15 text-primary`, label: 'On leave' };
      case 'Holiday':
        return { cls: `${base} bg-primary/15 text-primary`, label: `Holiday · ${data?.holiday?.name || ''}` };
      case 'no_punch':
      default:
        return { cls: `${base} bg-warning/15 text-warning`, label: 'No punch yet' };
    }
  })();

  const netMinutes = Number(data?.daily?.net_work_minutes || 0);
  const workedHrs = netMinutes ? (netMinutes / 60).toFixed(1) : Number(data?.daily?.total_hours || 0).toFixed(1);
  const lateBy = Number(data?.daily?.late_by_minutes || 0);

  return (
    <Card>
      <CardContent className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Today</p>
            <p className="text-sm font-semibold text-foreground">
              {istNow.toLocaleDateString('en-IN', {
                weekday: 'long',
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                timeZone: 'Asia/Kolkata',
              })}
            </p>
          </div>
          <span className={badge.cls}>{isLoading ? '…' : badge.label}</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="flex items-center gap-2">
            <LogIn className="h-4 w-4 text-success shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">First in</p>
              <p className="text-sm font-mono font-semibold text-foreground">{fmtTime(data?.daily?.first_in)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LogOut className="h-4 w-4 text-info shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Last out</p>
              <p className="text-sm font-mono font-semibold text-foreground">{fmtTime(data?.daily?.last_out)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Worked</p>
              <p className="text-sm font-semibold text-foreground">{workedHrs}h</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-warning shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Late by</p>
              <p className="text-sm font-semibold text-foreground">{lateBy > 0 ? `${lateBy}m` : '—'}</p>
            </div>
          </div>
        </div>

        {data?.daily?.suppressed_count > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-warning bg-warning/10 border border-warning/30 rounded p-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {data.daily.suppressed_count} noisy punch(es) auto-suppressed today.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
