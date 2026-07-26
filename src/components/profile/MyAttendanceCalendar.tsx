import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  format,
  isToday,
  isAfter,
  startOfDay,
} from 'date-fns';
import { useComplianceSettings, isWeeklyOff } from '@/hooks/hrms/useComplianceSettings';
import { cn } from '@/lib/utils';

interface Props {
  employeeId: string;
}

type LegendKey =
  | 'present'
  | 'half_day'
  | 'absent'
  | 'late'
  | 'on_leave'
  | 'holiday'
  | 'week_off'
  | 'no_punch'
  | 'upcoming';

const LEGEND: Record<LegendKey, { label: string; dot: string; cell: string; ring?: string }> = {
  present:  { label: 'Present',       dot: 'bg-emerald-500',  cell: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300 border-emerald-500/30' },
  half_day: { label: 'Half Day',      dot: 'bg-amber-400',    cell: 'bg-amber-400/15 text-amber-700 dark:text-amber-300 border-amber-400/40' },
  absent:   { label: 'Absent',        dot: 'bg-rose-500',     cell: 'bg-rose-500/12 text-rose-600 dark:text-rose-300 border-rose-500/30' },
  late:     { label: 'Late',          dot: 'bg-orange-500',   cell: 'bg-orange-500/12 text-orange-600 dark:text-orange-300 border-orange-500/30' },
  on_leave: { label: 'On Leave',      dot: 'bg-violet-500',   cell: 'bg-violet-500/12 text-violet-600 dark:text-violet-300 border-violet-500/30' },
  holiday:  { label: 'Holiday',       dot: 'bg-sky-500',      cell: 'bg-sky-500/12 text-sky-600 dark:text-sky-300 border-sky-500/30' },
  week_off: { label: 'Week Off',      dot: 'bg-slate-400',    cell: 'bg-muted text-muted-foreground border-border' },
  no_punch: { label: 'No Punch',      dot: 'bg-muted-foreground/40', cell: 'bg-background text-muted-foreground border-dashed border-border' },
  upcoming: { label: 'Upcoming',      dot: 'bg-transparent',  cell: 'bg-background text-muted-foreground/60 border-border/50' },
};

export default function MyAttendanceCalendar({ employeeId }: Props) {
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<string | null>(null);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const monthKey = format(monthStart, 'yyyy-MM');
  const startDay = getDay(monthStart);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const { data: compliance } = useComplianceSettings();

  const { data: daily = [] } = useQuery({
    queryKey: ['profile_att_daily_v4', employeeId, monthKey],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('hr_attendance_daily')
        .select('attendance_date, status, first_in, last_out, net_work_minutes, late_by_minutes, total_hours')
        .eq('employee_id', employeeId)
        .gte('attendance_date', format(monthStart, 'yyyy-MM-dd'))
        .lte('attendance_date', format(monthEnd, 'yyyy-MM-dd'));
      if (error) throw error;
      return data || [];
    },
    enabled: !!employeeId,
  });

  const { data: legacy = [] } = useQuery({
    queryKey: ['profile_att_legacy', employeeId, monthKey],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('hr_attendance')
        .select('attendance_date, attendance_status, check_in, check_out, late_minutes')
        .eq('employee_id', employeeId)
        .gte('attendance_date', format(monthStart, 'yyyy-MM-dd'))
        .lte('attendance_date', format(monthEnd, 'yyyy-MM-dd'));
      if (error) throw error;
      return data || [];
    },
    enabled: !!employeeId,
  });

  const { data: holidays = [] } = useQuery({
    queryKey: ['profile_holidays', monthKey],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('hr_holidays')
        .select('date, name')
        .eq('is_active', true)
        .gte('date', format(monthStart, 'yyyy-MM-dd'))
        .lte('date', format(monthEnd, 'yyyy-MM-dd'));
      if (error) throw error;
      return data || [];
    },
  });

  // Build per-date record, preferring v4 daily → legacy → holidays → weekly-off → upcoming/no-punch
  const map = useMemo(() => {
    const holidayMap = new Map<string, string>(holidays.map((h: any) => [h.date, h.name]));
    const dailyMap = new Map<string, any>(daily.map((d: any) => [d.attendance_date, d]));
    const legacyMap = new Map<string, any>(legacy.map((d: any) => [d.attendance_date, d]));
    const today = startOfDay(new Date());

    const out: Record<string, { key: LegendKey; meta?: any; label?: string }> = {};
    for (const d of days) {
      const iso = format(d, 'yyyy-MM-dd');
      const holiday = holidayMap.get(iso);
      const v4 = dailyMap.get(iso);
      const lg = legacyMap.get(iso);
      const upcoming = isAfter(startOfDay(d), today);

      // v4 canonical status → map
      let key: LegendKey | null = null;
      let meta: any = null;
      if (v4) {
        meta = v4;
        switch (v4.status) {
          case 'present':      key = (v4.late_by_minutes ?? 0) > 0 ? 'late' : 'present'; break;
          case 'half_day':     key = 'half_day'; break;
          case 'absent':       key = 'absent'; break;
          case 'on_leave':     key = 'on_leave'; break;
          case 'week_off':     key = 'week_off'; break;
          case 'incomplete':
          case 'in_progress':  key = 'present'; break;
          case 'no_punch':     key = upcoming ? 'upcoming' : 'no_punch'; break;
          default:             key = null;
        }
      }
      if (!key && lg) {
        meta = lg;
        switch (lg.attendance_status) {
          case 'present':  key = (lg.late_minutes ?? 0) > 0 ? 'late' : 'present'; break;
          case 'half_day': key = 'half_day'; break;
          case 'absent':   key = 'absent'; break;
          case 'late':     key = 'late'; break;
          case 'on_leave': key = 'on_leave'; break;
          default:         key = null;
        }
      }
      if (!key && holiday) { key = 'holiday'; meta = { name: holiday }; }
      if (!key && isWeeklyOff(d, compliance)) key = 'week_off';
      if (!key) key = upcoming ? 'upcoming' : 'no_punch';

      out[iso] = { key, meta, label: holiday };
    }
    return out;
  }, [days, daily, legacy, holidays, compliance]);

  const counts = useMemo(() => {
    const c: Partial<Record<LegendKey, number>> = {};
    Object.values(map).forEach(v => { c[v.key] = (c[v.key] || 0) + 1; });
    return c;
  }, [map]);

  const selectedRec = selected ? map[selected] : null;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 md:p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <CalendarDays className="h-4 w-4 text-primary shrink-0" />
            <h3 className="text-sm md:text-base font-semibold text-foreground truncate">Attendance Calendar</h3>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs md:text-sm font-medium tabular-nums min-w-[110px] text-center">
              {format(cursor, 'MMMM yyyy')}
            </span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          {['S','M','T','W','T','F','S'].map((d, i) => (
            <div key={i} className="text-center">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: startDay }).map((_, i) => <div key={`p-${i}`} />)}
          {days.map(d => {
            const iso = format(d, 'yyyy-MM-dd');
            const rec = map[iso];
            const legend = LEGEND[rec.key];
            const today = isToday(d);
            const isSel = selected === iso;
            return (
              <button
                key={iso}
                onClick={() => setSelected(prev => prev === iso ? null : iso)}
                className={cn(
                  'group relative aspect-square rounded-lg border text-[11px] md:text-xs font-medium',
                  'flex flex-col items-center justify-center gap-0.5',
                  'transition-all duration-200 will-change-transform',
                  'hover:-translate-y-0.5 hover:shadow-md active:scale-95',
                  'animate-fade-in',
                  legend.cell,
                  today && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
                  isSel && 'scale-105 shadow-lg ring-2 ring-primary/70',
                )}
                title={`${format(d, 'EEE, MMM d')} — ${legend.label}${rec.label ? ` · ${rec.label}` : ''}`}
              >
                <span className="tabular-nums leading-none">{d.getDate()}</span>
                <span className={cn('w-1.5 h-1.5 rounded-full', legend.dot)} />
              </button>
            );
          })}
        </div>

        {/* Selected day detail */}
        {selectedRec && selected && (
          <div className="rounded-lg border bg-muted/30 p-3 animate-fade-in">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-sm font-semibold text-foreground">
                {format(new Date(selected), 'EEEE, dd MMM yyyy')}
              </p>
              <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold border', LEGEND[selectedRec.key].cell)}>
                {LEGEND[selectedRec.key].label}
              </span>
            </div>
            {selectedRec.meta?.name && (
              <p className="text-xs text-muted-foreground">🎉 {selectedRec.meta.name}</p>
            )}
            {(selectedRec.meta?.first_in || selectedRec.meta?.check_in) && (
              <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">In</p>
                  <p className="font-mono font-semibold text-foreground">
                    {new Date(selectedRec.meta.first_in || selectedRec.meta.check_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Out</p>
                  <p className="font-mono font-semibold text-foreground">
                    {selectedRec.meta.last_out || selectedRec.meta.check_out
                      ? new Date(selectedRec.meta.last_out || selectedRec.meta.check_out).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Worked</p>
                  <p className="font-semibold text-foreground">
                    {selectedRec.meta.net_work_minutes
                      ? `${(selectedRec.meta.net_work_minutes / 60).toFixed(1)}h`
                      : selectedRec.meta.total_hours
                        ? `${Number(selectedRec.meta.total_hours).toFixed(1)}h`
                        : '—'}
                  </p>
                </div>
              </div>
            )}
            {(selectedRec.meta?.late_by_minutes > 0 || selectedRec.meta?.late_minutes > 0) && (
              <p className="mt-2 text-xs text-warning">
                Late by {selectedRec.meta.late_by_minutes || selectedRec.meta.late_minutes} min
              </p>
            )}
          </div>
        )}

        {/* Legend */}
        <div className="pt-2 border-t">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2">
            {(Object.keys(LEGEND) as LegendKey[]).filter(k => k !== 'upcoming').map(k => (
              <div key={k} className="flex items-center gap-2 text-[11px]">
                <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', LEGEND[k].dot)} />
                <span className="text-muted-foreground truncate">{LEGEND[k].label}</span>
                <span className="ml-auto text-foreground font-semibold tabular-nums">{counts[k] || 0}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
