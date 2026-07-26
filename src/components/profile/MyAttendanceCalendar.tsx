import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, CalendarDays, Sparkles, LogIn, LogOut, Clock, AlertCircle } from 'lucide-react';
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
import { useAttendanceDayRange, type AttendanceDay } from '@/hooks/hrms/useAttendanceDay';
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

const LEGEND: Record<
  LegendKey,
  { label: string; dot: string; cell: string; text: string; glow?: string }
> = {
  present: {
    label: 'Present',
    dot: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-300',
    cell: 'bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border-emerald-500/40',
    glow: 'shadow-[0_0_0_1px_hsl(var(--background)),0_4px_14px_-2px_rgba(16,185,129,0.35)]',
  },
  half_day: {
    label: 'Half Day',
    dot: 'bg-amber-400',
    text: 'text-amber-700 dark:text-amber-300',
    cell: 'bg-gradient-to-br from-amber-400/25 to-amber-400/5 border-amber-400/50',
    glow: 'shadow-[0_0_0_1px_hsl(var(--background)),0_4px_14px_-2px_rgba(251,191,36,0.35)]',
  },
  absent: {
    label: 'Absent',
    dot: 'bg-rose-500',
    text: 'text-rose-600 dark:text-rose-300',
    cell: 'bg-gradient-to-br from-rose-500/20 to-rose-500/5 border-rose-500/40',
    glow: 'shadow-[0_0_0_1px_hsl(var(--background)),0_4px_14px_-2px_rgba(244,63,94,0.35)]',
  },
  late: {
    label: 'Late',
    dot: 'bg-orange-500',
    text: 'text-orange-600 dark:text-orange-300',
    cell: 'bg-gradient-to-br from-orange-500/20 to-orange-500/5 border-orange-500/40',
  },
  on_leave: {
    label: 'On Leave',
    dot: 'bg-violet-500',
    text: 'text-violet-600 dark:text-violet-300',
    cell: 'bg-gradient-to-br from-violet-500/20 to-violet-500/5 border-violet-500/40',
  },
  holiday: {
    label: 'Holiday',
    dot: 'bg-sky-500',
    text: 'text-sky-600 dark:text-sky-300',
    cell: 'bg-gradient-to-br from-sky-500/20 to-sky-500/5 border-sky-500/40',
  },
  week_off: {
    label: 'Week Off',
    dot: 'bg-slate-400',
    text: 'text-muted-foreground',
    cell: 'bg-muted/40 border-border',
  },
  no_punch: {
    label: 'No Punch',
    dot: 'bg-muted-foreground/40',
    text: 'text-muted-foreground',
    cell: 'bg-background border-dashed border-border',
  },
  upcoming: {
    label: 'Upcoming',
    dot: 'bg-transparent',
    text: 'text-muted-foreground/60',
    cell: 'bg-background border-border/40',
  },
};

export default function MyAttendanceCalendar({ employeeId }: Props) {
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<string | null>(() =>
    format(new Date(), 'yyyy-MM-dd'),
  );

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const monthKey = format(monthStart, 'yyyy-MM');
  const startDay = getDay(monthStart);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const { data: compliance } = useComplianceSettings();

  // V1: single sanctioned reader — same shape HR overview and Day Detail see.
  const { data: dayRows = [] } = useAttendanceDayRange(
    [employeeId],
    format(monthStart, 'yyyy-MM-dd'),
    format(monthEnd, 'yyyy-MM-dd'),
    { enabled: !!employeeId },
  );

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

  const map = useMemo(() => {
    const holidayMap = new Map<string, string>(holidays.map((h: any) => [h.date, h.name]));
    const dayMap = new Map<string, AttendanceDay>(
      (dayRows as AttendanceDay[]).map((d) => [d.date, d]),
    );
    const today = startOfDay(new Date());

    const out: Record<string, { key: LegendKey; meta?: any; label?: string }> = {};
    for (const d of days) {
      const iso = format(d, 'yyyy-MM-dd');
      const holiday = holidayMap.get(iso);
      const row = dayMap.get(iso);
      const upcoming = isAfter(startOfDay(d), today);

      let key: LegendKey | null = null;
      let meta: any = null;
      if (row) {
        meta = {
          first_in: row.first_in,
          last_out: row.last_out,
          net_work_minutes: row.worked_minutes,
          late_by_minutes: row.late_minutes,
          total_hours: row.total_hours,
          lop_contribution: row.lop_contribution,
          watchdog_held: row.watchdog_held,
        };
        switch (row.status) {
          case 'present':      key = row.late_minutes > 0 ? 'late' : 'present'; break;
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
      if (!key && holiday) { key = 'holiday'; meta = { name: holiday }; }
      if (!key && isWeeklyOff(d, compliance)) key = 'week_off';
      if (!key) key = upcoming ? 'upcoming' : 'no_punch';

      out[iso] = { key, meta, label: holiday };
    }
    return out;
  }, [days, dayRows, holidays, compliance]);

  const counts = useMemo(() => {
    const c: Partial<Record<LegendKey, number>> = {};
    Object.values(map).forEach(v => { c[v.key] = (c[v.key] || 0) + 1; });
    return c;
  }, [map]);

  const selectedRec = selected ? map[selected] : null;
  const attendanceRate = useMemo(() => {
    const totalCounted =
      (counts.present || 0) + (counts.late || 0) + (counts.half_day || 0) + (counts.absent || 0);
    if (!totalCounted) return 0;
    const good = (counts.present || 0) + (counts.late || 0) + (counts.half_day || 0) * 0.5;
    return Math.round((good / totalCounted) * 100);
  }, [counts]);

  const goToday = () => {
    setCursor(new Date());
    setSelected(format(new Date(), 'yyyy-MM-dd'));
  };

  return (
    <Card className="overflow-hidden border-border/60 bg-gradient-to-br from-card via-card to-primary/[0.03] shadow-sm">
      {/* Decorative header band */}
      <div className="relative px-4 md:px-5 pt-4 pb-3 border-b border-border/60 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent overflow-hidden">
        <div className="absolute -top-8 -right-8 h-24 w-24 rounded-full bg-primary/10 blur-2xl pointer-events-none" />
        <div className="relative flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0 ring-1 ring-primary/20">
              <CalendarDays className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">My Attendance</p>
              <p className="text-sm md:text-base font-bold text-foreground truncate">
                {format(cursor, 'MMMM yyyy')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full hover:bg-primary/10"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <button
              onClick={goToday}
              className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
            >
              Today
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full hover:bg-primary/10"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Attendance rate strip */}
        <div className="relative mt-3 flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            <span className="tabular-nums">{attendanceRate}%</span>
            <span className="text-muted-foreground font-normal">attendance</span>
          </div>
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 via-primary to-emerald-500 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${attendanceRate}%` }}
            />
          </div>
        </div>
      </div>

      <div className="p-4 md:p-5 space-y-4">
        {/* Weekday header */}
        <div className="grid grid-cols-7 gap-1 md:gap-1.5 text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">
          {['S','M','T','W','T','F','S'].map((d, i) => (
            <div key={i} className={cn('text-center py-1', (i === 0 || i === 6) && 'text-primary/60')}>{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1 md:gap-1.5">
          {Array.from({ length: startDay }).map((_, i) => <div key={`p-${i}`} />)}
          {days.map((d, idx) => {
            const iso = format(d, 'yyyy-MM-dd');
            const rec = map[iso];
            const legend = LEGEND[rec.key];
            const today = isToday(d);
            const isSel = selected === iso;
            return (
              <button
                key={iso}
                onClick={() => setSelected(iso)}
                style={{ animationDelay: `${idx * 12}ms` }}
                className={cn(
                  'group relative aspect-square rounded-xl border text-[11px] md:text-xs font-semibold',
                  'flex flex-col items-center justify-center gap-1',
                  'transition-all duration-300 ease-out will-change-transform',
                  'hover:-translate-y-0.5 hover:scale-[1.04] active:scale-95',
                  'animate-fade-in',
                  legend.cell,
                  legend.text,
                  today && !isSel && 'ring-2 ring-primary/70 ring-offset-1 ring-offset-background',
                  isSel && cn('scale-[1.08] ring-2 ring-primary z-10', legend.glow),
                )}
                title={`${format(d, 'EEE, MMM d')} — ${legend.label}${rec.label ? ` · ${rec.label}` : ''}`}
              >
                <span className="tabular-nums leading-none text-[12px] md:text-[13px]">{d.getDate()}</span>
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full transition-transform',
                    legend.dot,
                    isSel && 'scale-150 animate-pulse',
                  )}
                />
                {today && (
                  <span className="absolute top-0.5 right-0.5 w-1 h-1 rounded-full bg-primary animate-pulse" />
                )}
              </button>
            );
          })}
        </div>

        {/* Selected day detail */}
        {selectedRec && selected && (
          <div
            key={selected}
            className="rounded-xl border border-border/60 bg-gradient-to-br from-muted/40 to-muted/10 p-3.5 animate-fade-in"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {isToday(new Date(selected)) ? 'Today' : format(new Date(selected), 'EEEE')}
                </p>
                <p className="text-sm font-bold text-foreground truncate">
                  {format(new Date(selected), 'dd MMM yyyy')}
                </p>
              </div>
              <span
                className={cn(
                  'px-2.5 py-1 rounded-full text-[10px] font-bold border shrink-0 flex items-center gap-1.5',
                  LEGEND[selectedRec.key].cell,
                  LEGEND[selectedRec.key].text,
                )}
              >
                <span className={cn('w-1.5 h-1.5 rounded-full', LEGEND[selectedRec.key].dot)} />
                {LEGEND[selectedRec.key].label}
              </span>
            </div>
            {selectedRec.meta?.name && (
              <p className="text-xs text-sky-600 dark:text-sky-300 font-medium">🎉 {selectedRec.meta.name}</p>
            )}
            {(selectedRec.meta?.first_in || selectedRec.meta?.check_in) && (
              <div className="grid grid-cols-3 gap-2 mt-2">
                <div className="rounded-lg bg-background/60 border border-border/50 p-2">
                  <div className="flex items-center gap-1 text-[9px] text-muted-foreground uppercase font-semibold">
                    <LogIn className="h-3 w-3 text-emerald-500" /> In
                  </div>
                  <p className="text-xs font-mono font-bold text-foreground mt-0.5">
                    {new Date(selectedRec.meta.first_in || selectedRec.meta.check_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
                  </p>
                </div>
                <div className="rounded-lg bg-background/60 border border-border/50 p-2">
                  <div className="flex items-center gap-1 text-[9px] text-muted-foreground uppercase font-semibold">
                    <LogOut className="h-3 w-3 text-info" /> Out
                  </div>
                  <p className="text-xs font-mono font-bold text-foreground mt-0.5">
                    {selectedRec.meta.last_out || selectedRec.meta.check_out
                      ? new Date(selectedRec.meta.last_out || selectedRec.meta.check_out).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
                      : '—'}
                  </p>
                </div>
                <div className="rounded-lg bg-background/60 border border-border/50 p-2">
                  <div className="flex items-center gap-1 text-[9px] text-muted-foreground uppercase font-semibold">
                    <Clock className="h-3 w-3 text-primary" /> Worked
                  </div>
                  <p className="text-xs font-bold text-foreground mt-0.5">
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
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-warning bg-warning/10 border border-warning/30 rounded-md px-2 py-1">
                <AlertCircle className="h-3 w-3 shrink-0" />
                Late by {selectedRec.meta.late_by_minutes || selectedRec.meta.late_minutes} min
              </div>
            )}
          </div>
        )}

        {/* Legend */}
        <div className="pt-2 border-t border-border/60">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2">
            {(Object.keys(LEGEND) as LegendKey[]).filter(k => k !== 'upcoming').map(k => (
              <div key={k} className="flex items-center gap-2 text-[11px]">
                <span className={cn('w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-background', LEGEND[k].dot)} />
                <span className="text-muted-foreground truncate">{LEGEND[k].label}</span>
                <span className="ml-auto text-foreground font-bold tabular-nums">{counts[k] || 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
