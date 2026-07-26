import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Users, UserCheck, Phone } from 'lucide-react';

interface Props {
  employeeId: string;
  workInfo: any;
}

/**
 * Phase 6 (ESS) — Team & Reporting Directory.
 * Reads work-info to identify the reporting manager and pulls other active
 * employees sharing the same department. Read-only, contact-only surface —
 * no salary, no personal IDs. Aligns with the ESS rule that /hrms remains
 * HR-only while non-sensitive collaboration data is exposed to employees.
 */
export default function MyTeamCard({ employeeId, workInfo }: Props) {
  const managerId: string | null = workInfo?.reporting_manager_id || null;
  const departmentId: string | null = workInfo?.department_id || null;

  const { data: manager } = useQuery({
    queryKey: ['ess_team_manager', managerId],
    queryFn: async () => {
      if (!managerId) return null;
      const { data, error } = await supabase
        .from('hr_employees')
        .select('id, badge_id, first_name, last_name, phone, email, is_active')
        .eq('id', managerId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!managerId,
  });

  const { data: teammates = [] } = useQuery({
    queryKey: ['ess_team_teammates', departmentId, employeeId],
    queryFn: async () => {
      if (!departmentId) return [];
      const { data: wi, error: wErr } = await supabase
        .from('hr_employee_work_info')
        .select('employee_id, job_position_id, positions:job_position_id(title)')
        .eq('department_id', departmentId);
      if (wErr) throw wErr;
      const ids = (wi || [])
        .map((r: any) => r.employee_id)
        .filter((id: string) => id && id !== employeeId);
      if (ids.length === 0) return [];
      const { data: emps, error: eErr } = await supabase
        .from('hr_employees')
        .select('id, badge_id, first_name, last_name, phone, email, is_active')
        .in('id', ids)
        .eq('is_active', true);
      if (eErr) throw eErr;
      const roleMap = new Map<string, string>();
      (wi || []).forEach((r: any) => {
        if (r.employee_id && r.positions?.title) roleMap.set(r.employee_id, r.positions.title);
      });
      return (emps || [])
        .map((e: any) => ({ ...e, role: roleMap.get(e.id) || null }))
        .sort((a: any, b: any) => (a.first_name || '').localeCompare(b.first_name || ''));
    },
    enabled: !!departmentId,
  });

  const initials = (f?: string | null, l?: string | null) =>
    `${(f || '').charAt(0)}${(l || '').charAt(0)}`.toUpperCase() || '?';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" /> My Team
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Reporting Manager */}
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
            Reports to
          </p>
          {manager ? (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                  {initials(manager.first_name, manager.last_name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  {`${manager.first_name || ''} ${manager.last_name || ''}`.trim() || 'Manager'}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  Badge {manager.badge_id || '—'}
                </p>
              </div>
              <Badge variant="outline" className="gap-1 text-[10px]">
                <UserCheck className="h-3 w-3" /> Manager
              </Badge>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No reporting manager assigned. Contact HR if this is incorrect.
            </p>
          )}
        </div>

        {/* Teammates */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Colleagues in your department
            </p>
            {teammates.length > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {teammates.length}
              </Badge>
            )}
          </div>
          {!departmentId ? (
            <p className="text-xs text-muted-foreground">Department not set.</p>
          ) : teammates.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              You're the only active member in this department right now.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {teammates.slice(0, 12).map((t: any) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-border/60 bg-card"
                >
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-muted text-foreground text-xs">
                      {initials(t.first_name, t.last_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {`${t.first_name || ''} ${t.last_name || ''}`.trim() || t.badge_id}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {t.role || `Badge ${t.badge_id || '—'}`}
                    </p>
                  </div>
                  {t.phone && (
                    <a
                      href={`tel:${t.phone}`}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                      aria-label={`Call ${t.first_name}`}
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              ))}
              {teammates.length > 12 && (
                <p className="text-[11px] text-muted-foreground col-span-full text-center pt-1">
                  +{teammates.length - 12} more not shown
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
