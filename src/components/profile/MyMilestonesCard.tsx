import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Cake, PartyPopper, Sparkles } from 'lucide-react';

interface Props {
  employeeId: string;
  workInfo: any;
}

type Milestone = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  badge_id: string | null;
  date: string; // YYYY-MM-DD
  kind: 'birthday' | 'anniversary';
  years?: number;
  dayLabel: string;
  daysUntil: number;
};

/**
 * ESS — Birthday & Work-Anniversary Feed.
 * Shows upcoming milestones (next 30 days) for teammates in the same
 * department. Read-only, celebratory surface — no age is displayed, no year
 * of birth, only the day/month. Anniversaries show completed years.
 */
export default function MyMilestonesCard({ employeeId, workInfo }: Props) {
  const departmentId: string | null = workInfo?.department_id || null;

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['ess_milestones', departmentId, employeeId],
    queryFn: async (): Promise<Milestone[]> => {
      if (!departmentId) return [];

      // Teammates in same department (exclude self)
      const { data: wi, error: wErr } = await supabase
        .from('hr_employee_work_info')
        .select('employee_id, joining_date')
        .eq('department_id', departmentId);
      if (wErr) throw wErr;

      const teammateMap = new Map<string, string | null>(); // employee_id -> joining_date
      (wi || []).forEach((r: any) => {
        if (r.employee_id && r.employee_id !== employeeId) {
          teammateMap.set(r.employee_id, r.joining_date || null);
        }
      });
      const ids = Array.from(teammateMap.keys());
      if (ids.length === 0) return [];

      const { data: emps, error: eErr } = await supabase
        .from('hr_employees')
        .select('id, first_name, last_name, badge_id, dob, is_active')
        .in('id', ids)
        .eq('is_active', true);
      if (eErr) throw eErr;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const HORIZON_DAYS = 30;

      const nextOccurrence = (mmdd: { m: number; d: number }) => {
        const y = today.getFullYear();
        let next = new Date(y, mmdd.m - 1, mmdd.d);
        next.setHours(0, 0, 0, 0);
        if (next < today) next = new Date(y + 1, mmdd.m - 1, mmdd.d);
        const diff = Math.round((next.getTime() - today.getTime()) / 86400000);
        return { next, diff };
      };

      const formatDay = (d: Date, diff: number) => {
        if (diff === 0) return 'Today';
        if (diff === 1) return 'Tomorrow';
        return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
      };

      const out: Milestone[] = [];
      (emps || []).forEach((e: any) => {
        // Birthday
        if (e.dob) {
          const [y, m, d] = String(e.dob).split('-').map(Number);
          if (m && d) {
            const { next, diff } = nextOccurrence({ m, d });
            if (diff <= HORIZON_DAYS) {
              out.push({
                id: `bd-${e.id}`,
                first_name: e.first_name,
                last_name: e.last_name,
                badge_id: e.badge_id,
                date: e.dob,
                kind: 'birthday',
                dayLabel: formatDay(next, diff),
                daysUntil: diff,
              });
            }
          }
        }
        // Anniversary
        const jd = teammateMap.get(e.id);
        if (jd) {
          const [y, m, d] = String(jd).split('-').map(Number);
          if (y && m && d) {
            const { next, diff } = nextOccurrence({ m, d });
            const years = next.getFullYear() - y;
            if (diff <= HORIZON_DAYS && years >= 1) {
              out.push({
                id: `an-${e.id}`,
                first_name: e.first_name,
                last_name: e.last_name,
                badge_id: e.badge_id,
                date: jd,
                kind: 'anniversary',
                years,
                dayLabel: formatDay(next, diff),
                daysUntil: diff,
              });
            }
          }
        }
      });

      return out.sort((a, b) => a.daysUntil - b.daysUntil);
    },
    enabled: !!departmentId,
    staleTime: 60 * 60 * 1000,
  });

  const initials = (f?: string | null, l?: string | null) =>
    `${(f || '').charAt(0)}${(l || '').charAt(0)}`.toUpperCase() || '?';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <PartyPopper className="h-4 w-4 text-primary" /> Team Milestones
          <span className="text-[11px] font-normal text-muted-foreground ml-auto">
            Next 30 days
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!departmentId ? (
          <p className="text-xs text-muted-foreground">Department not set.</p>
        ) : isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No birthdays or work anniversaries in your department in the next 30 days.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((it) => {
              const isBd = it.kind === 'birthday';
              const isToday = it.daysUntil === 0;
              return (
                <div
                  key={it.id}
                  className={`flex items-center gap-3 p-2.5 rounded-lg border ${
                    isToday
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border/60 bg-card'
                  }`}
                >
                  <Avatar className="h-9 w-9">
                    <AvatarFallback
                      className={
                        isBd
                          ? 'bg-pink-500/10 text-pink-600 dark:text-pink-400 text-xs'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs'
                      }
                    >
                      {initials(it.first_name, it.last_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                      {`${it.first_name || ''} ${it.last_name || ''}`.trim() || it.badge_id}
                      {isToday && (
                        <Sparkles className="h-3 w-3 text-primary flex-shrink-0" />
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                      {isBd ? (
                        <>
                          <Cake className="h-3 w-3" /> Birthday
                        </>
                      ) : (
                        <>
                          <PartyPopper className="h-3 w-3" /> {it.years}
                          {it.years === 1 ? ' year' : ' years'} at the company
                        </>
                      )}
                    </p>
                  </div>
                  <Badge
                    variant={isToday ? 'default' : 'outline'}
                    className="text-[10px] flex-shrink-0"
                  >
                    {it.dayLabel}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
