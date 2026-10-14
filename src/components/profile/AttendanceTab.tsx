import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ChevronLeft, ChevronRight, ClipboardList, ListChecks } from 'lucide-react';
import { format, startOfMonth, endOfMonth, isSameMonth } from 'date-fns';
import { useAttendanceDayRange, type AttendanceDay } from '@/hooks/hrms/useAttendanceDay';
import { cn } from '@/lib/utils';
import RegularizationCard from './RegularizationCard';
import TodayAttendanceCard from './TodayAttendanceCard';
import MyCompOffCard from './MyCompOffCard';
import MyAttendanceCalendar from './MyAttendanceCalendar';
import { SectionBlock, StatusPill, TabIntro, ProfileEmptyState, ProfileSkeleton } from './primitives';
import { DAY_META, dayKeyOf } from './attendanceMeta';
import { useMyRegularizations } from './hooks';
import { fmtMinutes, fmtTime, fmtWeekday, istToday } from './format';


interface AttendanceTabProps {
  employeeId: string;
  /** Opens the attendance-correction form (Requests tab), optionally for a day. */
  onRequestCorrection?: (date?: string) => void;
}

export default function AttendanceTab({ employeeId, onRequestCorrection }: AttendanceTabProps) {
  // One month drives the summary, the calendar and the day list.
  const [cursor, setCursor] = useState(() => new Date());
  const selectedMonth = format(cursor, 'yyyy-MM');

  const monthStart = `${selectedMonth}-01`;
  const [y, m] = selectedMonth.split('-').map(Number);
  const monthEnd = `${selectedMonth}-${new Date(y, m, 0).getDate()}`;

  // Monthly summary from view
  const { data: monthlySummary } = useQuery({
    queryKey: ['hr_monthly_hours_summary', employeeId, selectedMonth],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('hr_monthly_hours_summary')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('month', monthStart)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!employeeId,
  });

  const { data: hrSummary } = useQuery({
    queryKey: ['hr_attendance_month_summary_self', employeeId, selectedMonth],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('hr_attendance_month_summary', {
        p_employee_ids: [employeeId],
        p_period_month: monthStart,
      });
      if (error) throw error;
      return (data || [])[0] ?? null;
    },
    enabled: !!employeeId,
  });

  // Day-by-day list: the same canonical day rows the calendar shows (shared cache),
  // so the list can never disagree with the calendar.
  const { data: dayRows = [], isLoading } = useAttendanceDayRange(
    [employeeId],
    format(startOfMonth(cursor), 'yyyy-MM-dd'),
    format(endOfMonth(cursor), 'yyyy-MM-dd'),
    { enabled: !!employeeId },
  );

  const s = monthlySummary;
  const workedHrs = Number(s?.total_worked_hours || 0);
  // Same figures HR sees on the HRMS Attendance Summary (one shared calculation).
  const presentDays = Number(hrSummary?.present_days ?? 0);
  const absentDays = Number(hrSummary?.absent_days ?? 0);
  const halfDays = Number(hrSummary?.half_days ?? 0);
  const paidLeaveDays = Number(hrSummary?.paid_leave_days ?? 0);
  const workingDays = Number(hrSummary?.working_days ?? 0);
  const lateCount = Number(s?.late_count || 0);
  const earlyCount = Number(s?.early_out_count || 0);

  // Days that already have a correction request (any state but cancelled) aren't offered another one.
  const { data: myRegs = [] } = useMyRegularizations(employeeId);
  const requestedDates = useMemo(
    () => new Set((myRegs as any[]).filter((r) => r.status !== 'cancelled').map((r) => r.attendance_date)),
    [myRegs],
  );
  const canFix = (d: AttendanceDay, key: string) =>
    !!onRequestCorrection && ['incomplete', 'absent'].includes(key) && !d.watchdog_held && !requestedDates.has(d.date);

  const [view, setView] = useState<'all' | 'issues'>('all');
  const today = istToday();
  const isCurrentMonth = isSameMonth(cursor, new Date());

  const listRows = useMemo(() => {
    const rows = (dayRows as AttendanceDay[])
      .filter((d) => d.date <= today)
      .map((d) => ({ d, key: dayKeyOf(d) }))
      .sort((a, b) => (a.d.date < b.d.date ? 1 : -1));
    if (view === 'all') return rows;
    return rows.filter(({ d, key }) =>
      ['absent', 'half_day', 'incomplete'].includes(key) || (d.late_minutes ?? 0) > 0 || (d.early_minutes ?? 0) > 0 || d.watchdog_held);
  }, [dayRows, today, view]);

  const fmt1 = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const stats: Array<{ label: string; value: string; tone?: string }> = [
    { label: 'Work days', value: fmt1(workingDays) },
    { label: 'Present', value: fmt1(presentDays), tone: 'text-success' },
    { label: 'Half days', value: fmt1(halfDays), tone: halfDays ? 'text-warning' : undefined },
    { label: 'Absent', value: fmt1(absentDays), tone: absentDays ? 'text-destructive' : undefined },
    { label: 'Paid leave', value: fmt1(paidLeaveDays) },
    { label: 'Worked', value: `${workedHrs.toFixed(1)}h` },
    { label: 'Late', value: String(lateCount), tone: lateCount ? 'text-warning' : undefined },
    { label: 'Early out', value: String(earlyCount), tone: earlyCount ? 'text-warning' : undefined },
  ];

  return (
    <div className="space-y-4">
      <TabIntro
        title="Attendance"
        description="Your days as the biometric devices and HR record them. All times are IST."
        actions={onRequestCorrection ? (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onRequestCorrection()}>
            <ClipboardList className="h-4 w-4" /> Fix a punch
          </Button>
        ) : undefined}
      />

      <TodayAttendanceCard employeeId={employeeId} />

      {/* Month summary — same figures HR sees */}
      <section className="ds-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Previous month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <p className="min-w-[128px] text-center font-display text-[15px] font-semibold text-foreground">{format(cursor, 'MMMM yyyy')}</p>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Next month" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {!isCurrentMonth && (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setCursor(new Date())}>This month</Button>
            )}
            <span className="t-secondary hidden sm:inline">Same figures payroll and HR see · times in IST</span>
          </div>
        </div>
        <dl className="grid grid-cols-4 divide-border lg:grid-cols-8 lg:divide-x">
          {stats.map((st) => (
            <div key={st.label} className="px-3 py-2.5 text-center lg:text-left">
              <dt className="text-[11px] text-muted-foreground">{st.label}</dt>
              <dd className={cn('mt-0.5 font-display text-lg font-bold tabular-nums text-foreground', st.tone)}>{st.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <MyAttendanceCalendar
          employeeId={employeeId}
          month={cursor}
          onMonthChange={setCursor}
          onRequestCorrection={onRequestCorrection ? (d) => onRequestCorrection(d) : undefined}
          correctionAllowed={(date, row) => !row?.watchdog_held && !requestedDates.has(date)}
          todayShownElsewhere
        />
        <div className="min-w-0 space-y-4">
          <RegularizationCard employeeId={employeeId} onRequestCorrection={onRequestCorrection} />
          <MyCompOffCard employeeId={employeeId} />
        </div>
      </div>

      {/* Day by day */}
      <SectionBlock
        title="Day by day"
        icon={ListChecks}
        description={`${format(cursor, 'MMMM yyyy')}, newest first`}
        flush
        actions={
          <SegmentedControl
            size="sm"
            aria-label="Which days"
            value={view}
            onValueChange={(v) => setView(v as 'all' | 'issues')}
            options={[{ value: 'all', label: 'All days' }, { value: 'issues', label: 'Needs a look' }]}
          />
        }
      >
        {isLoading ? (
          <ProfileSkeleton rows={5} bare />
        ) : listRows.length === 0 ? (
          <ProfileEmptyState
            bare
            title={view === 'issues' ? 'Nothing to look at' : 'No attendance records for this month'}
            description={view === 'issues' ? 'No late arrivals, early exits, absences or missing punches this month.' : undefined}
          />
        ) : (
          <>
            {/* Wide screens: a compact table */}
            <div className="hidden md:block">
              <table className="ds-table table-fit">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Status</th>
                    <th>In</th>
                    <th>Out</th>
                    <th className="ds-num">Worked</th>
                    <th>Timing</th>
                    <th className="w-[1%]"><span className="sr-only">Action</span></th>
                  </tr>
                </thead>
                <tbody>
                  {listRows.map(({ d, key }) => {
                    const meta = DAY_META[key];
                    const offDay = key === 'week_off' || key === 'holiday';
                    const correctable = canFix(d, key);
                    return (
                      <tr key={d.date} className={cn(offDay && 'text-muted-foreground')}>
                        <td className="whitespace-nowrap font-medium">{fmtWeekday(d.date)}</td>
                        <td><StatusPill tone={meta.tone}>{meta.label}</StatusPill></td>
                        <td className="whitespace-nowrap font-mono tabular-nums">{d.first_in ? fmtTime(d.first_in) : '—'}</td>
                        <td className="whitespace-nowrap font-mono tabular-nums">{d.last_out ? fmtTime(d.last_out) : '—'}</td>
                        <td className="ds-num whitespace-nowrap font-mono">{fmtMinutes(d.worked_minutes)}</td>
                        <td className="text-xs">
                          <TimingNotes d={d} />
                        </td>
                        <td className="text-right">
                          {correctable && (
                            <Button variant="ghost" size="sm" className="h-7 whitespace-nowrap px-2 text-xs text-primary" onClick={() => onRequestCorrection!(d.date)}>
                              Fix a punch
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Phones: one line per day */}
            <ul className="divide-y divide-border md:hidden">
              {listRows.map(({ d, key }) => {
                const meta = DAY_META[key];
                const correctable = canFix(d, key);
                return (
                  <li key={d.date} className="px-3.5 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold text-foreground">{fmtWeekday(d.date)}</span>
                      <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
                    </div>
                    {(d.first_in || d.last_out) && (
                      <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
                        {fmtTime(d.first_in)} → {fmtTime(d.last_out)} · {fmtMinutes(d.worked_minutes, '0m')}
                      </p>
                    )}
                    <div className="mt-0.5 text-xs"><TimingNotes d={d} /></div>
                    {correctable && (
                      <Button variant="link" size="sm" className="mt-0.5 h-auto p-0 text-xs" onClick={() => onRequestCorrection!(d.date)}>
                        Fix a punch
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </SectionBlock>
    </div>
  );
}

function TimingNotes({ d }: { d: AttendanceDay }) {
  const parts: Array<{ text: string; cls: string }> = [];
  if ((d.late_minutes ?? 0) > 0) parts.push({ text: `Late ${d.late_minutes}m`, cls: 'text-warning' });
  if ((d.early_minutes ?? 0) > 0) parts.push({ text: `Early out ${d.early_minutes}m`, cls: 'text-warning' });
  if (Number(d.lop_contribution ?? 0) > 0) parts.push({ text: `Loss of pay ${Number(d.lop_contribution).toFixed(2)}d`, cls: 'text-destructive' });
  if (d.watchdog_held) parts.push({ text: 'Held for HR review', cls: 'text-destructive' });
  if ((d.suppressed_count ?? 0) > 0) parts.push({ text: `${d.suppressed_count} extra punch(es) ignored`, cls: 'text-muted-foreground' });
  if (!parts.length) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5">
      {parts.map((p) => <span key={p.text} className={p.cls}>{p.text}</span>)}
    </span>
  );
}
