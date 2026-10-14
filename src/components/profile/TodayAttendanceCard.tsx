import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { LogIn, LogOut, Timer, AlertCircle, Clock } from 'lucide-react';
import { useAttendanceDay } from '@/hooks/hrms/useAttendanceDay';
import { cn } from '@/lib/utils';
import { StatusPill } from './primitives';
import { DAY_META, dayKeyOf } from './attendanceMeta';
import { fmtMinutes, fmtTime, fmtWeekday } from './format';

interface TodayAttendanceCardProps {
  employeeId: string;
}

/**
 * Live "Today" attendance snapshot for the employee — reads the canonical
 * `hr_attendance_day_v` via useAttendanceDay (V1 single-source rule).
 */
export default function TodayAttendanceCard({ employeeId }: TodayAttendanceCardProps) {
  // IST date (UTC+05:30)
  const istNow = new Date(Date.now() + 5.5 * 3600 * 1000);
  const today = istNow.toISOString().slice(0, 10);

  const { data: daily, isLoading } = useAttendanceDay(employeeId, today);

  const { data: holiday } = useQuery({
    queryKey: ['profile_today_holiday', today],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('hr_holidays')
        .select('name')
        .eq('date', today)
        .eq('is_active', true)
        .maybeSingle();
      return data;
    },
  });

  // Same day resolution as the calendar (resolveDayStatus), so the two always agree.
  const key = daily ? dayKeyOf(daily) : holiday ? 'holiday' : 'no_punch';
  const meta = DAY_META[key];
  const label = key === 'no_punch' ? 'No punch yet' : key === 'holiday' && holiday?.name ? `Holiday · ${holiday.name}` : meta.label;
  const Icon = meta.icon;

  const worked = Number(daily?.worked_minutes || 0);
  const lateBy = Number(daily?.late_minutes || 0);
  const earlyBy = Number(daily?.early_minutes || 0);
  const suppressed = Number(daily?.suppressed_count || 0);

  return (
    <section className="ds-panel overflow-hidden">
      <div className="flex flex-col gap-3 p-3.5 md:flex-row md:items-center md:gap-6">
        <div className="flex min-w-0 items-center gap-3 md:w-[260px] md:shrink-0">
          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full border', meta.cell, meta.text)}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="ds-field-label">Today · {fmtWeekday(today)}</p>
            <div className="mt-0.5 flex items-center gap-2">
              {isLoading ? (
                <span className="h-5 w-24 animate-pulse rounded bg-muted" />
              ) : (
                <StatusPill tone={key === 'no_punch' ? 'warning' : meta.tone} className="max-w-full truncate">{label}</StatusPill>
              )}
            </div>
          </div>
        </div>

        <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          <TodayFact icon={LogIn} label="First in" value={fmtTime(daily?.first_in)} />
          <TodayFact icon={LogOut} label="Last out" value={fmtTime(daily?.last_out)} />
          <TodayFact icon={Clock} label="Worked" value={fmtMinutes(worked)} />
          <TodayFact
            icon={Timer}
            label={earlyBy && !lateBy ? 'Early out' : 'Late by'}
            value={lateBy ? `${lateBy} min` : earlyBy ? `${earlyBy} min` : '—'}
            tone={lateBy || earlyBy ? 'text-warning' : undefined}
          />
        </dl>
      </div>

      {suppressed > 0 && (
        <div className="flex items-center gap-1.5 border-t border-border bg-warning/[0.06] px-3.5 py-2 text-xs text-warning">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {suppressed} extra punch{suppressed === 1 ? '' : 'es'} ignored today (repeat taps on the device).
        </div>
      )}
    </section>
  );
}

function TodayFact({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" /> {label}
      </dt>
      <dd className={cn('mt-0.5 font-mono text-sm font-semibold tabular-nums text-foreground', tone)}>{value}</dd>
    </div>
  );
}
