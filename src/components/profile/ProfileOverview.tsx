import { useMemo, type ReactNode } from 'react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { AlertTriangle, ArrowRight, Briefcase, CalendarDays, CheckCircle2, ClipboardList, Inbox, ListChecks, Receipt, Shield, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { workTypeLabel } from '@/lib/hrms/employeeFields';
import { useAttendanceDay, useAttendanceDayRange, resolveDayStatus, type AttendanceDay } from '@/hooks/hrms/useAttendanceDay';
import { useProfileTasks, isTaskOverdue } from '@/components/tasks/UserProfileTasks';
import MyTeamCard from './MyTeamCard';
import { AnnouncementsBanner } from '@/components/hrms/AnnouncementsBanner';
import MyAnnouncementsCard from './MyAnnouncementsCard';
import MyMilestonesCard from './MyMilestonesCard';
import { SectionBlock, FieldGrid, Field, StatTile } from './primitives';
import { DAY_META, dayKeyOf, type DayKey } from './attendanceMeta';
import { useMyPayslips, useMyRegularizations, useTeamLeaveQueue, useTeamRegQueue } from './hooks';
import { fmtDay, fmtDays, fmtINR, fmtMinutes, fmtMonthShort, fmtRange, fmtTime, fmtWeekday, istToday, tenure } from './format';
import { OPEN_LEAVE_STATUSES, isPaidLeaveType } from './leave';
import { usePermissions } from '@/hooks/usePermissions';

const OPEN_REG = ['pending', 'manager_review', 'manager_reviewed'];
const OPEN_LEAVE = OPEN_LEAVE_STATUSES;

const mask = (v?: string | null, keep = 4) => {
  if (!v) return '—';
  const s = String(v);
  if (s.length <= keep) return s;
  return `${'•'.repeat(Math.min(6, Math.max(4, s.length - keep)))}${s.slice(-keep)}`;
};

/**
 * The profile landing view: today at a glance, what needs doing, then who I am.
 * Read-only — every number comes from a query the tabs already use.
 */
export function ProfileOverview({
  hrEmployee,
  workInfo,
  leaveTypes,
  balances,
  balanceState = 'ready',
  leaveRequests,
  onNavigate,
  onRequestCorrection,
}: {
  hrEmployee: any;
  workInfo: any;
  leaveTypes: any[];
  /** Per leave type; `available` is the database's figure (already net of pending requests), null while loading. */
  balances: Record<string, { totalAllocated: number; totalUsed: number; available: number | null }>;
  balanceState?: 'loading' | 'ready' | 'error';
  leaveRequests: any[];
  onNavigate: (tab: string) => void;
  onRequestCorrection: (date?: string) => void;
}) {
  const employeeId: string = hrEmployee.id;
  const today = istToday();

  // Same keys as the Attendance tab (today card + this month's calendar).
  const { data: todayRow, isLoading: todayLoading } = useAttendanceDay(employeeId, today);
  const monthFrom = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const monthTo = format(endOfMonth(new Date()), 'yyyy-MM-dd');
  const { data: monthRows = [] } = useAttendanceDayRange([employeeId], monthFrom, monthTo, { enabled: !!employeeId });

  const { data: payslips = [], isLoading: payLoading } = useMyPayslips(employeeId, hrEmployee.badge_id);
  const { data: regs = [] } = useMyRegularizations(employeeId);
  const { data: leaveQueue = [] } = useTeamLeaveQueue(employeeId);
  const { data: regQueue = [] } = useTeamRegQueue(employeeId);
  const { data: myTasks = [] } = useProfileTasks('to-me', false);
  const { hasAnyPermission } = usePermissions();
  const canOpenHrms = hasAnyPermission(['hrms_view', 'hrms_manage']);

  // ── Today ──
  const todayKey: DayKey = dayKeyOf(todayRow as AttendanceDay | null);
  const todayMeta = DAY_META[todayKey] ?? DAY_META.no_punch;
  const todayLabel = todayKey === 'no_punch' ? 'No punch yet' : todayMeta.label;
  const todaySub = (() => {
    const r = todayRow as AttendanceDay | null;
    if (todayLoading) return 'Loading…';
    if (!r) return workInfo?.shift_name || 'No punch recorded yet';
    if (r.first_in && r.last_out) return `${fmtTime(r.first_in)} – ${fmtTime(r.last_out)} · ${fmtMinutes(r.worked_minutes, '0m')}`;
    if (r.first_in) return `In at ${fmtTime(r.first_in)} · shift running`;
    return workInfo?.shift_name || todayMeta.hint || '';
  })();

  // ── Leave ──
  const paidTypes = leaveTypes.filter(isPaidLeaveType);
  const balancesReady = balanceState === 'ready' && paidTypes.length > 0;
  const totalAvailable = paidTypes.reduce((s: number, lt: any) => s + (balances[lt.id]?.available || 0), 0);
  const pendingLeave = leaveRequests.filter((r: any) => OPEN_LEAVE.includes(r.status)).length;
  // Requested but undecided days: the database already sets them aside, so they are listed, not subtracted again.
  const pendingDays = leaveRequests
    .filter((r: any) => OPEN_LEAVE.includes(r.status) && paidTypes.some((lt: any) => lt.id === r.leave_type_id))
    .reduce((s: number, r: any) => s + (Number(r.total_days) || 0), 0);
  const nextLeave = leaveRequests
    .filter((r: any) => r.status === 'approved' && r.end_date >= today)
    .sort((a: any, b: any) => (a.start_date < b.start_date ? -1 : 1))[0];

  // ── Pay ──
  const latest = (payslips as any[])[0];

  // ── To do ──
  const approvalsWaiting =
    (leaveQueue as any[]).filter((r) => r.status === 'requested').length +
    (regQueue as any[]).filter((r) => r.status === 'manager_review').length;
  const myOpenRequests =
    leaveRequests.filter((r: any) => OPEN_LEAVE.includes(r.status)).length +
    (regs as any[]).filter((r) => OPEN_REG.includes(r.status)).length;
  const overdue = (myTasks as any[]).filter(isTaskOverdue).length;

  // ── Punch-outs missing this month that have no correction request yet ──
  const needsAttention = useMemo(() => {
    const requested = new Set((regs as any[]).filter((r) => r.status !== 'cancelled').map((r) => r.attendance_date));
    return (monthRows as AttendanceDay[])
      // Held days are already with HR for review, so they aren't nudged.
      .filter((d) => d.date < today && resolveDayStatus(d) === 'incomplete' && !d.watchdog_held && !requested.has(d.date))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [monthRows, regs, today]);

  const jobTitle = workInfo?.positions?.title || workInfo?.job_role || '—';
  const since = tenure(workInfo?.joining_date);

  return (
    <div className="space-y-4">
      {/* "View all" opens the HRMS page, so only people who can open HRMS get the link. */}
      <AnnouncementsBanner viewAllHref={canOpenHrms ? '/hrms/announcements' : null} />

      {needsAttention.length > 0 && (
        <section className="ds-panel !border-warning/40 !bg-warning/[0.06]">
          <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-start">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="t-card-title text-foreground">
                {needsAttention.length === 1 ? 'A punch-out is missing this month' : `${needsAttention.length} punch-outs are missing this month`}
              </p>
              <p className="t-secondary mt-0.5">If you worked, send your actual out-time so the day is counted correctly.</p>
              <ul className="mt-2.5 flex flex-wrap gap-2">
                {needsAttention.slice(0, 4).map((d) => (
                  <li key={d.date}>
                    <Button size="sm" variant="outline" className="h-8 gap-1.5 bg-card" onClick={() => onRequestCorrection(d.date)}>
                      <ClipboardList className="h-3.5 w-3.5" />
                      {fmtWeekday(d.date)}{d.first_in ? ` · in ${fmtTime(d.first_in)}` : ''}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* ── At a glance ── */}
      <div className="grid grid-cols-2 gap-3 min-[1440px]:grid-cols-4">
        <StatTile
          className="col-span-2 min-[1440px]:col-span-1"
          label={`Today · ${fmtWeekday(today)}`}
          value={<span className="inline-flex items-center gap-2">{todayLabel}</span>}
          tone={todayMeta.tone === 'success' ? 'success' : todayMeta.tone === 'danger' ? 'danger' : todayMeta.tone === 'warning' ? 'warning' : todayMeta.tone === 'info' ? 'info' : 'default'}
          sub={todaySub}
          icon={todayMeta.icon}
          onClick={() => onNavigate('attendance')}
        />
        <StatTile
          label="Leave balance"
          value={balancesReady
            ? <>{fmtDays(totalAvailable)} <span className="text-sm font-semibold text-muted-foreground">day{totalAvailable === 1 ? '' : 's'}</span></>
            : <span className="text-muted-foreground">{balanceState === 'error' ? '—' : '…'}</span>}
          icon={CalendarDays}
          onClick={() => onNavigate('leaves')}
          sub={
            <span className="flex flex-col gap-0.5">
              <span className="flex flex-wrap gap-x-2">
                {paidTypes.map((lt: any) => (
                  <span key={lt.id} className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: lt.color || 'hsl(var(--muted-foreground))' }} />
                    {lt.code || lt.name} {balances[lt.id]?.available == null ? (balanceState === 'loading' ? '…' : '—') : fmtDays(balances[lt.id]?.available || 0)}
                  </span>
                ))}
              </span>
              {pendingDays > 0 && (
                <span className="text-warning">+ {fmtDays(pendingDays)} day{pendingDays === 1 ? '' : 's'} waiting for approval</span>
              )}
              {nextLeave ? <span>Next leave: {fmtRange(nextLeave.start_date, nextLeave.end_date)}</span>
                : pendingDays === 0 && pendingLeave > 0 ? <span>{pendingLeave} request{pendingLeave === 1 ? '' : 's'} pending</span> : null}
            </span>
          }
        />
        <StatTile
          label={latest ? `Last payslip · ${fmtMonthShort(latest.period_month)}` : 'Last payslip'}
          value={payLoading ? '…' : latest ? fmtINR(latest.net) : '—'}
          icon={Receipt}
          onClick={() => onNavigate('payslips')}
          sub={payLoading ? 'Loading…' : latest ? `Net pay · gross ${fmtINR(latest.gross)}` : 'Payslips appear once payroll runs'}
        />
        <div className="relative col-span-2 min-w-0 rounded-[var(--radius-card)] border border-border bg-card p-3.5 min-[1440px]:col-span-1">
          <div className="flex items-start justify-between gap-2">
            <span className="ds-field-label">To do</span>
            <Inbox className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </div>
          {approvalsWaiting + myOpenRequests + (myTasks as any[]).length === 0 ? (
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" /> All caught up
            </div>
          ) : (
            <ul className="mt-1.5 space-y-0.5">
              {approvalsWaiting > 0 && (
                <TodoRow tone="warning" onClick={() => onNavigate('requests')}>
                  <b className="font-semibold">{approvalsWaiting}</b> approval{approvalsWaiting === 1 ? '' : 's'} waiting for you
                </TodoRow>
              )}
              {myOpenRequests > 0 && (
                <TodoRow onClick={() => onNavigate('requests')}>
                  <b className="font-semibold">{myOpenRequests}</b> of your request{myOpenRequests === 1 ? '' : 's'} in progress
                </TodoRow>
              )}
              {(myTasks as any[]).length > 0 && (
                <TodoRow tone={overdue ? 'danger' : undefined} onClick={() => onNavigate('tasks')}>
                  <b className="font-semibold">{(myTasks as any[]).length}</b> open task{(myTasks as any[]).length === 1 ? '' : 's'}{overdue ? ` · ${overdue} overdue` : ''}
                </TodoRow>
              )}
            </ul>
          )}
        </div>
      </div>

      {/* ── About me + company ── */}
      <div className="grid grid-cols-1 gap-4 min-[1440px]:grid-cols-3">
        <div className="min-w-0 space-y-4 min-[1440px]:col-span-2">
          <SectionBlock title="Work" icon={Briefcase}>
            <FieldGrid dense>
              <Field label="Badge ID" value={hrEmployee.badge_id ?? '—'} mono />
              <Field label="Job position" value={jobTitle} />
              <Field label="Department" value={workInfo?.departments?.name || '—'} />
              <Field label="Shift" value={workInfo?.shift_name || '—'} />
              <Field label="Work type" value={workTypeLabel(workInfo?.work_type, '—')} />
              <Field label="Joined" value={workInfo?.joining_date ? `${fmtDay(workInfo.joining_date)}${since ? ` · ${since}` : ''}` : '—'} />
            </FieldGrid>
          </SectionBlock>

          <SectionBlock title="Personal details" icon={User} description="Kept by HR from your onboarding. Ask HR to correct anything that is wrong.">
            <FieldGrid dense>
              <Field label="Full name" hint="KYC-locked" value={`${hrEmployee.first_name || ''} ${hrEmployee.last_name || ''}`.trim() || '—'} />
              <Field label="Date of birth" value={hrEmployee.dob ? fmtDay(hrEmployee.dob) : '—'} />
              <Field label="Gender" value={hrEmployee.gender || '—'} />
              <Field label="Marital status" value={hrEmployee.marital_status || '—'} />
              <Field label="Phone" value={hrEmployee.phone || '—'} mono />
              <Field label="Work email" value={hrEmployee.email || '—'} />
              <Field label="Qualification" value={hrEmployee.qualification || '—'} />
              <Field label="Experience" value={hrEmployee.experience || '—'} />
            </FieldGrid>
          </SectionBlock>

          <SectionBlock title="Statutory IDs" icon={Shield} description="Masked for privacy. Payroll and HR see the full numbers.">
            <FieldGrid dense wide>
              <Field label="PAN" mono value={mask(hrEmployee.pan_number, 4)} />
              <Field label="UAN (PF universal)" mono value={mask(hrEmployee.uan_number, 4)} />
              <Field label="PF number" mono value={mask(hrEmployee.pf_number, 4)} />
              <Field label="ESIC number" mono value={mask(hrEmployee.esi_number, 4)} />
            </FieldGrid>
          </SectionBlock>

          <MyTeamCard employeeId={employeeId} workInfo={workInfo} />
        </div>

        <div className="min-w-0 space-y-4">
          <MyAnnouncementsCard />
          <MyMilestonesCard employeeId={employeeId} workInfo={workInfo} />
          <div className="ds-panel p-3.5">
            <p className="ds-field-label">Shortcuts</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <ShortcutButton icon={ClipboardList} label="Fix a punch" onClick={() => onRequestCorrection()} />
              <ShortcutButton icon={CalendarDays} label="Leave" onClick={() => onNavigate('leaves')} />
              <ShortcutButton icon={Receipt} label="Payslips" onClick={() => onNavigate('payslips')} />
              <ShortcutButton icon={ListChecks} label="My tasks" onClick={() => onNavigate('tasks')} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TodoRow({ children, onClick, tone }: { children: ReactNode; onClick: () => void; tone?: 'warning' | 'danger' }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="group -mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', tone === 'warning' ? 'bg-warning' : tone === 'danger' ? 'bg-destructive' : 'bg-primary')} aria-hidden />
        <span className="min-w-0 flex-1">{children}</span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </button>
    </li>
  );
}

function ShortcutButton({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ds-press flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2 text-left text-[13px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="truncate">{label}</span>
    </button>
  );
}

