import { useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Users, UserCheck, Phone, Network, Mail } from 'lucide-react';
import { useDirectReports } from '@/hooks/useDirectReports';
import { SectionBlock, StatusPill, CountBadge } from './primitives';
import { useMyTeam } from './hooks';


interface Props {
  employeeId: string;
  workInfo: any;
}

/**
 * Phase 6 (ESS) — Team & Reporting Directory.
 * Reporting manager and department colleagues come from `hr_my_team()`, a
 * narrow server read (name, position, badge, phone; email for the manager
 * only), because employees can't read other employee rows directly. Direct
 * reports come from `hr_manager_direct_reports()`. Read-only, contact-only —
 * no salary, no personal IDs; /hrms stays HR-only.
 */
export default function MyTeamCard({ employeeId, workInfo }: Props) {
  const departmentId: string | null = workInfo?.department_id || null;
  const { data: team = [], isLoading: teamLoading, isError: teamError } = useMyTeam(employeeId);

  const splitName = (full?: string | null) => {
    const [first, ...rest] = String(full || '').trim().split(/\s+/);
    return { first_name: first || null, last_name: rest.join(' ') || null };
  };
  const managerRow = team.find((m) => m.relation === 'manager') || null;
  const manager = managerRow ? { ...managerRow, ...splitName(managerRow.full_name) } : null;
  const { data: reports = [] } = useDirectReports(!!employeeId);
  const activeReports = (reports || []).filter((r) => r.is_active !== false);
  // People who report to me are listed once, under "Reports to you".
  const reportIds = new Set(activeReports.map((r) => r.employee_id));
  const allColleagues = team.filter((m) => m.relation === 'colleague');
  const teammates = allColleagues
    .filter((m) => !reportIds.has(m.employee_id))
    .map((m) => ({ id: m.employee_id, ...splitName(m.full_name), badge_id: m.badge_id, phone: m.phone, role: m.position }));
  const regsWithHr = activeReports.reduce((s, r) => s + (r.pending_reg_with_hr || 0), 0);

  const initials = (f?: string | null, l?: string | null) =>
    `${(f || '').charAt(0)}${(l || '').charAt(0)}`.toUpperCase() || '?';


  const [showAll, setShowAll] = useState(false);
  const visibleMates = showAll ? teammates : teammates.slice(0, 12);

  const Person = ({ first, last, sub, phone, tone = 'muted', right }: { first?: string | null; last?: string | null; sub?: string | null; phone?: string | null; tone?: 'muted' | 'primary'; right?: any }) => (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card p-2.5">
      <Avatar className="h-9 w-9">
        <AvatarFallback className={tone === 'primary' ? 'bg-primary/10 text-primary text-xs font-semibold' : 'bg-muted text-foreground text-xs'}>
          {initials(first, last)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-foreground">{`${first || ''} ${last || ''}`.trim() || '—'}</p>
        {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
      </div>
      {right}
      {phone && (
        <a
          href={`tel:${phone}`}
          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`Call ${first || 'colleague'}`}
        >
          <Phone className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );

  const Label = ({ children, count, icon: Icon }: { children: any; count?: number; icon?: any }) => (
    <div className="mb-2 flex items-center justify-between">
      <p className="ds-field-label flex items-center gap-1.5">{Icon && <Icon className="h-3.5 w-3.5" />}{children}</p>
      {!!count && <CountBadge count={count} tone="neutral" />}
    </div>
  );

  return (
    <SectionBlock icon={Users} title="My team" description="Who you report to and who you work with" bodyClassName="space-y-5">
      {/* Reporting Manager */}
      <div>
        <Label>Reports to</Label>
        {manager ? (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {initials(manager.first_name, manager.last_name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {`${manager.first_name || ''} ${manager.last_name || ''}`.trim() || 'Manager'}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {[manager.position, manager.badge_id ? `Badge ${manager.badge_id}` : null].filter(Boolean).join(' · ') || '—'}
              </p>
            </div>
            <StatusPill tone="info"><UserCheck className="h-3 w-3" /> Manager</StatusPill>
            <div className="flex items-center gap-1">
              {manager.phone && (
                <Button asChild variant="outline" size="sm" className="h-8 gap-1"><a href={`tel:${manager.phone}`}><Phone className="h-3.5 w-3.5" /> Call</a></Button>
              )}
              {manager.email && (
                <Button asChild variant="outline" size="sm" className="h-8 gap-1"><a href={`mailto:${manager.email}`}><Mail className="h-3.5 w-3.5" /> Email</a></Button>
              )}
            </div>
          </div>
        ) : teamLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : teamError ? (
          <p className="text-xs text-muted-foreground">Your team couldn't be loaded right now. Try again in a moment.</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            No reporting manager assigned. Contact HR if this is incorrect.
          </p>
        )}
      </div>

      {/* Direct reports (only for reporting managers) */}
      {activeReports.length > 0 && (
        <div>
          <Label icon={Network} count={activeReports.length}>Reports to you</Label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {activeReports.map((r) => {
              const [f, ...rest] = (r.full_name || '').split(' ');
              const waiting = (r.pending_leave_with_me || 0) + (r.pending_reg_with_me || 0);
              return (
                <Person
                  key={r.employee_id}
                  first={r.full_name ? f : `Badge ${r.badge_id || '—'}`}
                  last={r.full_name ? rest.join(' ') : ''}
                  sub={r.designation || `Badge ${r.badge_id || '—'}`}
                  phone={r.phone}
                  tone="primary"
                  right={waiting > 0 ? <StatusPill tone="warning">{waiting} waiting</StatusPill> : null}
                />
              );
            })}
          </div>
          {regsWithHr > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {regsWithHr} attendance correction request{regsWithHr > 1 ? 's' : ''} from your team
              {regsWithHr > 1 ? ' are' : ' is'} still with HR and will reach you once forwarded.
            </p>
          )}
        </div>
      )}

      {/* Teammates */}
      <div>
        <Label count={teammates.length}>Colleagues in your department</Label>
        {!departmentId ? (
          <p className="text-xs text-muted-foreground">Department not set.</p>
        ) : teamLoading || teamError ? (
          <p className="text-xs text-muted-foreground">{teamLoading ? 'Loading…' : "Colleagues couldn't be loaded right now."}</p>
        ) : teammates.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {allColleagues.length > 0
              ? 'Everyone else in your department reports to you — they are listed above.'
              : "You're the only active member in this department right now."}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {visibleMates.map((t: any) => (
                <Person key={t.id} first={t.first_name || t.badge_id} last={t.first_name ? t.last_name : ''} sub={t.role || `Badge ${t.badge_id || '—'}`} phone={t.phone} />
              ))}
            </div>
            {teammates.length > 12 && (
              <Button variant="link" size="sm" className="mt-1 h-auto p-0 text-xs" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show fewer' : `Show all ${teammates.length}`}
              </Button>
            )}
          </>
        )}
      </div>
    </SectionBlock>
  );
}
