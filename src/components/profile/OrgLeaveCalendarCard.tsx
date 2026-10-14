import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Users } from 'lucide-react';
import { SectionBlock, ProfileSkeleton } from './primitives';
import { fmtRange } from './format';

/**
 * Read-only "who's out this week" glance for employees. Sources approved
 * leaves overlapping the current 7-day window from `hr_leave_requests`, joined
 * to `hr_employees` and `hr_leave_types` for names / colors.
 * Only shows the leave the signed-in person is allowed to see.
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
    <SectionBlock icon={Users} title="Who's out this week" description="Approved leave you can see, next 7 days" flush>
      {isLoading ? (
        <ProfileSkeleton rows={2} bare />
      ) : leaves.length === 0 ? (
        <p className="px-3.5 py-4 text-sm text-muted-foreground">No approved leave in the next 7 days.</p>
      ) : (
        <ul className="divide-y divide-border">
          {leaves.map((l: any) => {
            const emp = l.hr_employees;
            const lt = l.hr_leave_types;
            const name =
              `${emp?.first_name || ''} ${emp?.last_name || ''}`.trim() ||
              emp?.badge_id ||
              'Colleague';
            return (
              <li key={l.id} className="flex items-start gap-2.5 px-3.5 py-2.5">
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: lt?.color || '#888' }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-foreground">{name}</p>
                  <p className="text-xs text-muted-foreground">
                    {lt?.name || 'Leave'} · {fmtRange(l.start_date, l.end_date)}
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
