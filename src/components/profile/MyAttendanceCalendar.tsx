import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, CalendarDays, LogIn, LogOut, Clock, Timer, ClipboardList } from 'lucide-react';
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
import { useAttendanceDayRange, resolveDayStatus, type AttendanceDay } from '@/hooks/hrms/useAttendanceDay';
import { cn } from '@/lib/utils';
import { StatusPill } from './primitives';
import { DAY_META, LEGEND_ORDER, type DayKey } from './attendanceMeta';
import { fmtMinutes, fmtTime } from './format';

interface Props {
  employeeId: string;
  /** Month to show. When given, the parent owns month navigation. */
  month?: Date;
  onMonthChange?: (d: Date) => void;
  /** Offered on past days that look wrong (missing punch-out, absent). */
  onRequestCorrection?: (date: string) => void;
  /** The page already shows a live "Today" card, so don't repeat today's punches here. */
  todayShownElsewhere?: boolean;
  /** Extra check before offering a correction (e.g. a request already exists, or HR holds the day). */
  correctionAllowed?: (date: string, row?: AttendanceDay) => boolean;
}

type LegendKey = DayKey;
const LEGEND = DAY_META;

export default function MyAttendanceCalendar({ employeeId, month, onMonthChange, onRequestCorrection, todayShownElsewhere, correctionAllowed }: Props) {
  const [ownCursor, setOwnCursor] = useState(() => new Date());
  const cursor = month ?? ownCursor;
  const setCursor = (d: Date) => (onMonthChange ? onMonthChange(d) : setOwnCursor(d));
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
  const { data: dayRows = [], isLoading } = useAttendanceDayRange(
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

    const out: Record<
      string,
      { key: LegendKey; meta?: any; label?: string; row?: AttendanceDay; timing?: 'late' | 'early' | 'both' | null }
    > = {};
    for (const d of days) {
      const iso = format(d, 'yyyy-MM-dd');
      const holiday = holidayMap.get(iso);
      const row = dayMap.get(iso);
      const upcoming = isAfter(startOfDay(d), today);

      let key: LegendKey | null = null;
      let meta: any = null;
      let timing: 'late' | 'early' | 'both' | null = null;
      if (row) {
        meta = {
          first_in: row.first_in,
          last_out: row.last_out,
          net_work_minutes: row.worked_minutes,
          late_by_minutes: row.late_minutes,
          early_by_minutes: row.early_minutes,
          total_hours: row.total_hours,
          lop_contribution: row.lop_contribution,
          watchdog_held: row.watchdog_held,
        };
        const late = (row.late_minutes ?? 0) > 0;
        const early = (row.early_minutes ?? 0) > 0;
        timing = late && early ? 'both' : late ? 'late' : early ? 'early' : null;
        // Same resolution HR's calendar uses, so both always show the same day.
        switch (resolveDayStatus(row)) {
          case 'present':      key = 'present'; break;
          case 'half_day':     key = 'half_day'; break;
          case 'absent':       key = 'absent'; break;
          case 'on_leave':     key = 'on_leave'; break;
          case 'week_off':     key = 'week_off'; break;
          case 'holiday':      key = 'holiday'; meta = { ...meta, name: holiday }; break;
          case 'incomplete':   key = 'incomplete'; break;
          case 'in_progress':  key = 'in_progress'; break;
          case 'no_punch':     key = upcoming ? 'upcoming' : 'no_punch'; break;
          default:             key = null;
        }
      }
      if (!key && holiday) { key = 'holiday'; meta = { name: holiday }; }
      if (!key && !row && isWeeklyOff(d, compliance)) key = 'week_off';
      if (!key) key = upcoming ? 'upcoming' : 'no_punch';

      out[iso] = { key, meta, label: holiday, row, timing };
    }
    return out;
  }, [days, dayRows, holidays, compliance]);

  const counts = useMemo(() => {
    const c: Partial<Record<LegendKey, number>> = {};
    Object.values(map).forEach(v => { c[v.key] = (c[v.key] || 0) + 1; });
    return c;
  }, [map]);

  /** Days marked present/half-day that still carry a late or early-out flag. */
  const timingFlagged = useMemo(
    () => Object.values(map).filter(v => v.timing && (v.key === 'present' || v.key === 'half_day')).length,
    [map],
  );

  const selectedRec = selected ? map[selected] : null;
  const attendanceRate = useMemo(() => {
    const totalCounted =
      (counts.present || 0) + (counts.half_day || 0) + (counts.absent || 0);
    if (!totalCounted) return 0;
    const good = (counts.present || 0) + (counts.half_day || 0) * 0.5;
    return Math.round((good / totalCounted) * 100);

  }, [counts]);

  const goToday = () => {
    setCursor(new Date());
    setSelected(format(new Date(), 'yyyy-MM-dd'));
  };

  const selDate = selected ? new Date(`${selected}T00:00:00`) : null;
  const canCorrect = !!(selectedRec && selected && onRequestCorrection &&
    ['incomplete', 'absent', 'no_punch'].includes(selectedRec.key) && !isAfter(startOfDay(selDate as Date), startOfDay(new Date())) &&
    (!correctionAllowed || correctionAllowed(selected, selectedRec.row)));

  return (
    <section className="ds-panel overflow-hidden">
      <header className="ds-panel-head flex-wrap">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
          <h3 className="t-card-title truncate text-foreground">{format(cursor, 'MMMM yyyy')}</h3>
          {attendanceRate > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">· {attendanceRate}% attendance</span>
          )}
        </div>
        {!month && (
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={goToday}>Today</Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </header>

      <div className="space-y-4 p-3 sm:p-4">
        {/* Weekday header */}
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5 text-[11px] font-semibold text-muted-foreground">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="text-center">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className={cn('grid grid-cols-7 gap-1 sm:gap-1.5', isLoading && 'opacity-60')} aria-busy={isLoading}>
          {Array.from({ length: startDay }).map((_, i) => <div key={`p-${i}`} />)}
          {days.map((d) => {
            const iso = format(d, 'yyyy-MM-dd');
            const rec = map[iso];
            const legend = LEGEND[rec.key];
            return (
              <DayCell
                key={iso}
                iso={iso}
                date={d}
                rec={rec}
                legend={legend}
                isToday={isToday(d)}
                isSelected={selected === iso}
                onSelect={() => setSelected(iso)}
              />
            );
          })}
        </div>

        {/* Selected day detail */}
        {selectedRec && selected ? (
          <div key={selected} className="rounded-md border border-border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="ds-field-label">{selDate && isToday(selDate) ? 'Today' : format(selDate as Date, 'EEEE')}</p>
                <p className="text-sm font-semibold text-foreground">{format(selDate as Date, 'dd MMM yyyy')}</p>
              </div>
              <StatusPill tone={LEGEND[selectedRec.key].tone}>{LEGEND[selectedRec.key].label}</StatusPill>
            </div>
            {selectedRec.meta?.name && (
              <p className="mt-1 text-xs font-medium text-foreground">{selectedRec.meta.name}</p>
            )}
            {LEGEND[selectedRec.key].hint && selectedRec.key !== 'upcoming' && (
              <p className="mt-0.5 text-xs text-muted-foreground">{LEGEND[selectedRec.key].hint}</p>
            )}

            {todayShownElsewhere && selDate && isToday(selDate) ? (
              <p className="mt-1.5 text-xs text-muted-foreground">Today's punches are in the Today card above. Pick another day to see its details.</p>
            ) : selectedRec.meta?.first_in && (
              <div className="mt-2.5 grid grid-cols-3 gap-2">
                <DetailFact icon={LogIn} label="In" value={fmtTime(selectedRec.meta.first_in)} />
                <DetailFact icon={LogOut} label="Out" value={fmtTime(selectedRec.meta.last_out)} />
                <DetailFact icon={Clock} label="Worked" value={fmtMinutes(selectedRec.meta.net_work_minutes, selectedRec.meta.total_hours ? `${Number(selectedRec.meta.total_hours).toFixed(1)}h` : '—')} />
              </div>
            )}
            {selectedRec.timing && (
              <p className="mt-2 flex items-start gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2 py-1 text-[11px] text-warning">
                <Timer className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  {[
                    (selectedRec.meta?.late_by_minutes ?? 0) > 0 && `Late by ${selectedRec.meta.late_by_minutes} min`,
                    (selectedRec.meta?.early_by_minutes ?? 0) > 0 && `Early out by ${selectedRec.meta.early_by_minutes} min`,
                  ].filter(Boolean).join(' · ')}
                  {(selectedRec.key === 'present' || selectedRec.key === 'half_day') && (
                    <span className="text-muted-foreground">
                      {' '}— still marked {LEGEND[selectedRec.key].label.toLowerCase()} for the day
                    </span>
                  )}
                </span>
              </p>
            )}
            {selectedRec.row && (Number(selectedRec.row.lop_contribution ?? 0) > 0 || selectedRec.row.watchdog_held || (selectedRec.row.suppressed_count ?? 0) > 0) && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {[
                  Number(selectedRec.row.lop_contribution ?? 0) > 0 && <span key="lop" className="text-destructive">Loss of pay {Number(selectedRec.row.lop_contribution).toFixed(2)} day</span>,
                  selectedRec.row.watchdog_held && <span key="held" className="text-destructive">Held for HR review</span>,
                  (selectedRec.row.suppressed_count ?? 0) > 0 && <span key="sup">{selectedRec.row.suppressed_count} extra punch(es) ignored</span>,
                ].filter(Boolean).reduce((acc: any[], el, i) => (i ? [...acc, ' · ', el] : [el]), [])}
              </p>
            )}
            {canCorrect && (
              <Button size="sm" variant="outline" className="mt-2.5 h-8 gap-1.5 bg-card" onClick={() => onRequestCorrection!(selected)}>
                <ClipboardList className="h-3.5 w-3.5" /> Fix a punch on this day
              </Button>
            )}
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">Pick a day to see its punches.</p>
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 border-t border-border pt-3">
          {LEGEND_ORDER.map(k => (
            <span key={k} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={cn('h-3 w-3 rounded-[4px] border', LEGEND[k].cell)} />
              {LEGEND[k].label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-warning ring-2 ring-warning/25" />
            Late in / early out{timingFlagged ? ` (${timingFlagged})` : ''} — the day still counts by its colour
          </span>
        </div>
      </div>
    </section>
  );
}

function DetailFact({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card px-2.5 py-1.5">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground"><Icon className="h-3 w-3" /> {label}</div>
      <p className="mt-0.5 font-mono text-[13px] font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Day cell: hover shows a detail popover (mouse); tap selects (touch)  */
/* ------------------------------------------------------------------ */

function istDateOf(ts?: string | null) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
}

const canHover = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches;

function DayCell({
  iso,
  date,
  rec,
  legend,
  isToday: today,
  isSelected,
  onSelect,
}: {
  iso: string;
  date: Date;
  rec: { key: LegendKey; meta?: any; label?: string; row?: AttendanceDay; timing?: 'late' | 'early' | 'both' | null };
  legend: (typeof LEGEND)[LegendKey];
  isToday: boolean;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const row = rec.row;
  const inT = row?.first_in ? fmtTime(row.first_in) : null;
  const outT = row?.last_out ? fmtTime(row.last_out) : null;
  const outNextDay = !!(row?.last_out && istDateOf(row.last_out) !== iso);
  const timingText =
    rec.timing === 'both' ? 'late in and early out'
    : rec.timing === 'late' ? 'late in'
    : rec.timing === 'early' ? 'early out'
    : null;

  return (
    <Popover open={open} onOpenChange={(o) => setOpen(o && canHover())}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={onSelect}
          onMouseEnter={() => { if (canHover()) setOpen(true); }}
          onMouseLeave={() => { if (canHover()) setOpen(false); }}
          className={cn(
            'relative flex h-11 flex-col items-center justify-center gap-0.5 rounded-md border text-[12px] font-semibold transition-shadow sm:h-12 lg:h-14',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            legend.cell,
            legend.text,
            today && 'ring-1 ring-primary',
            isSelected && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
          )}
          aria-pressed={isSelected}
          aria-label={`${format(date, 'EEE, MMM d')} — ${legend.label}${timingText ? ` (${timingText})` : ''}`}
        >
          <span className="tabular-nums leading-none">{date.getDate()}</span>
          {rec.key !== 'upcoming' && rec.key !== 'no_punch' && (
            <span className="text-[10px] font-bold leading-none opacity-80">{legend.short}</span>
          )}
          {rec.timing && (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-warning ring-2 ring-warning/25" title={`Marked ${legend.label} — ${timingText}`} />
          )}
          {today && (
            <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        className="w-[240px] p-2.5 z-50"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="space-y-1.5 text-xs leading-snug">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-foreground">{format(date, 'EEE, dd MMM yyyy')}</span>
          </div>
          <StatusPill tone={legend.tone}>{legend.label}</StatusPill>
          {rec.label && <div className="text-foreground">{rec.label}</div>}

          {inT || outT ? (
            <div className="font-mono tabular-nums text-foreground">
              {inT || '--:--'} <span className="text-muted-foreground">→</span> {outT || '--:--'}
              {outNextDay && <span className="ml-1 text-muted-foreground">+1d</span>}
            </div>
          ) : (
            <div className="text-muted-foreground">No punch recorded</div>
          )}

          {row && (row.worked_minutes > 0 || (row.session_count ?? 0) > 0) && (
            <div className="tabular-nums text-muted-foreground">
              Worked {fmtMinutes(row.worked_minutes, '0m')}
              {(row.session_count ?? 0) > 0 &&
                ` · ${row.session_count} session${row.session_count === 1 ? '' : 's'}`}
            </div>
          )}

          {rec.timing && (
            <div className="rounded-md border border-warning/30 bg-warning/10 px-1.5 py-1 text-warning">
              <div className="flex items-center gap-1 font-semibold tabular-nums">
                <Timer className="h-3 w-3 shrink-0" />
                {(row?.late_minutes ?? 0) > 0 && `Late ${row?.late_minutes}m`}
                {(row?.late_minutes ?? 0) > 0 && (row?.early_minutes ?? 0) > 0 && ' · '}
                {(row?.early_minutes ?? 0) > 0 && `Early out ${row?.early_minutes}m`}
              </div>
              {(rec.key === 'present' || rec.key === 'half_day') && (
                <div className="text-muted-foreground">
                  Still marked {legend.label.toLowerCase()} for this day
                </div>
              )}
            </div>
          )}

          {row && Number(row.lop_contribution ?? 0) > 0 && (
            <div className="text-destructive">Loss of pay {Number(row.lop_contribution).toFixed(2)} day</div>
          )}
          {row?.watchdog_held && <div className="text-destructive">Held for HR review</div>}
          {row && (row.suppressed_count ?? 0) > 0 && (
            <div className="text-muted-foreground">{row.suppressed_count} extra punch(es) ignored</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
