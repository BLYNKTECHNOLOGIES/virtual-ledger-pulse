import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, CalendarClock } from 'lucide-react';

/**
 * Read-only "who's out this week" glance for employees. Sources approved
 * leaves overlapping the current 7-day window from `hr_leave_requests`, joined
 * to `hr_employees` and `hr_leave_types` for names / colors.
 */
export default function OrgLeaveCalendarCard() {
  const today = new Date();
  const start = today.toISOString().slice(0, 10);
  const in7 = new Date(today.getTime() + 7 * 86400 * 1000).toISOString().slice(0, 10);

  const { data: leaves = [], isLoading } = useQuery({
    queryKey: ['org_leaves_this_week', start],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('hr_leave_requests')
        .select(
          'id, start_date, end_date, employee_id, leave_type_id, hr_employees(first_name, last_name, badge_id), hr_leave_types(name, color, code)'
        )
        .eq('status', 'approved')
        .lte('start_date', in7)
        .gte('end_date', start)
        .order('start_date', { ascending: true })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" /> Who's out this week
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-3">Loading…</p>
        ) : leaves.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-3">
            Everyone's around this week 🎉
          </p>
        ) : (
          <div className="space-y-2">
            {leaves.map((l: any) => {
              const emp = l.hr_employees;
              const lt = l.hr_leave_types;
              const name =
                `${emp?.first_name || ''} ${emp?.last_name || ''}`.trim() ||
                emp?.badge_id ||
                'Colleague';
              return (
                <div
                  key={l.id}
                  className="flex items-center justify-between gap-3 border border-border/60 rounded-md px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: lt?.color || '#888' }}
                    />
                    <span className="font-medium text-foreground truncate">{name}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      · {lt?.name || 'Leave'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                    <CalendarClock className="h-3 w-3" />
                    <span className="font-mono">
                      {l.start_date} → {l.end_date}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
