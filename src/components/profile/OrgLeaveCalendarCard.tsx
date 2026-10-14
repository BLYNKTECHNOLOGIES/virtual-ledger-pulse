import { Users } from 'lucide-react';
import { SectionBlock, ProfileSkeleton, StatusPill } from './primitives';
import { addDaysYmd, fmtRange, istToday } from './format';
import { useTeamLeaveWindow, type TeamLeave } from './hooks';

const RELATION_LABEL: Record<TeamLeave['relation'], string | null> = {
  me: 'You',
  manager: 'Your manager',
  report: 'Reports to you',
  colleague: null,
};

/**
 * "Who's out" for the next 7 days (IST): approved leave of my manager, my
 * direct reports and the colleagues in my department, read through
 * `hr_team_leave_window()`. The leave type is shown only for my own leave and
 * my direct reports' — everyone else is just "On leave".
 */
export default function OrgLeaveCalendarCard({ employeeId }: { employeeId?: string | null }) {
  const start = istToday();
  const end = addDaysYmd(start, 6);
  const { data: leaves = [], isLoading, isError } = useTeamLeaveWindow(employeeId, start, end);

  const rows = [...leaves].sort((a, b) =>
    a.start_date === b.start_date ? String(a.full_name || '').localeCompare(String(b.full_name || '')) : a.start_date < b.start_date ? -1 : 1,
  );

  return (
    <SectionBlock icon={Users} title="Who's out this week" description="Approved leave in your team and department, next 7 days" flush>
      {isLoading ? (
        <ProfileSkeleton rows={2} bare />
      ) : isError ? (
        <p className="px-3.5 py-4 text-sm text-muted-foreground">This list couldn't be loaded right now.</p>
      ) : rows.length === 0 ? (
        <p className="px-3.5 py-4 text-sm text-muted-foreground">Nobody in your team or department is on approved leave in the next 7 days.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((l, i) => {
            const tag = RELATION_LABEL[l.relation] ?? null;
            const half = l.is_half_day ? ` · ${l.half_day_period === 'afternoon' ? 'second half' : 'first half'}` : '';
            return (
              <li key={`${l.employee_id}-${l.start_date}-${l.end_date}-${l.half_day_period ?? ''}-${i}`} className="flex items-start gap-2.5 px-3.5 py-2.5">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <p className="text-[13px] font-medium text-foreground">{l.full_name || 'Colleague'}</p>
                    {tag && <StatusPill tone={l.relation === 'me' ? 'info' : 'neutral'}>{tag}</StatusPill>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {l.leave_type_name || 'On leave'} · {fmtRange(l.start_date, l.end_date)}{half}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionBlock>
  );
}
