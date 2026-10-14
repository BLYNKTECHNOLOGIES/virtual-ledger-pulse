import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Gift } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionBlock, ProfileEmptyState, ProfileSkeleton } from './primitives';
import { fmtDay, fmtDays, fmtMonthShort, humanize, istToday } from './format';

interface MyCompOffCardProps {
  employeeId: string;
}

/**
 * Employee-facing comp-off ledger. Credits are auto-granted by the
 * `hr_grant_sunday_work_credit` trigger — HR handles redemption/allocation, so
 * this view surfaces earned, redeemed, and expiring balances read-only.
 * Comp-off leave can only use credits earned in the same month; older
 * unsettled credits are paid out by payroll instead.
 */
export default function MyCompOffCard({ employeeId }: MyCompOffCardProps) {
  const { data: credits = [], isLoading } = useQuery({
    queryKey: ['my_compoff_credits', employeeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('hr_compoff_credits')
        .select('*')
        .eq('employee_id', employeeId)
        .order('credit_date', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!employeeId,
  });

  const [showAll, setShowAll] = useState(false);
  const thisMonth = istToday().slice(0, 7);
  const VOIDED = 'voided_no_attendance_evidence';
  const OUTCOME: Record<string, string> = {
    encashed: 'Encashed',
    offset_lop: 'Set off against loss of pay',
    settled_in_payroll: 'Settled in payroll',
    [VOIDED]: 'Voided — no attendance evidence',
  };
  const totals = credits.reduce(
    (acc: any, c: any) => {
      const d = Number(c.credit_days || 0);
      acc.earned += d;
      if (c.settlement_outcome === VOIDED) {
        acc.voided += d;
      } else if (c.settled_period_month) {
        acc.settled += d;
      } else if (String(c.credit_date || '').slice(0, 7) === thisMonth) {
        acc.thisMonth += d;
      } else {
        acc.earlier += d;
      }
      return acc;
    },
    { earned: 0, thisMonth: 0, earlier: 0, settled: 0, voided: 0 }
  );
  const list = showAll ? credits : (credits as any[]).slice(0, 6);

  return (
    <SectionBlock icon={Gift} title="Comp-off" description="Days earned for working a week off or holiday" flush>
      {isLoading ? (
        <ProfileSkeleton rows={3} bare />
      ) : credits.length === 0 ? (
        <ProfileEmptyState bare className="py-6" title="No comp-off credits yet" description="Sunday work is auto-credited by the attendance engine." />
      ) : (
        <>
          <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
            <Figure label="This month's credits" value={totals.thisMonth} tone="text-success" />
            <Figure label="Earlier, awaiting settlement" value={totals.earlier} />
            <Figure label="Settled" value={totals.settled} tone="text-muted-foreground" />
          </div>
          <ul className="divide-y divide-border">
            {list.map((c: any) => {
              const sameMonth = String(c.credit_date || '').slice(0, 7) === thisMonth;
              const state = c.settlement_outcome === VOIDED
                ? OUTCOME[VOIDED]
                : c.settled_period_month
                  ? `${OUTCOME[c.settlement_outcome] || 'Settled'} · ${fmtMonthShort(c.settled_period_month)}`
                  : sameMonth ? "This month's credit" : 'Awaiting settlement';
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 px-3.5 py-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-foreground">{fmtDay(c.credit_date)}</p>
                    <p className="text-xs text-muted-foreground">{c.credit_type ? humanize(c.credit_type) : 'Sunday work'} · {state}</p>
                  </div>
                  <span className={cn('shrink-0 font-mono text-[13px] font-semibold tabular-nums', !c.settled_period_month && sameMonth ? 'text-success' : 'text-muted-foreground')}>
                    +{fmtDays(Number(c.credit_days || 0))}d
                  </span>
                </li>
              );
            })}
          </ul>
          {(credits as any[]).length > 6 && (
            <div className="border-t border-border px-3.5 py-2">
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show fewer' : `Show all ${(credits as any[]).length}`}
              </Button>
            </div>
          )}
          <p className="border-t border-border px-3.5 py-2 text-[11px] text-muted-foreground">
            {fmtDays(totals.earned)} day{totals.earned === 1 ? '' : 's'} earned in total{totals.voided ? ` (${fmtDays(totals.voided)} voided)` : ''}. Comp-off leave can only use credits earned in the same month; earlier ones are settled by payroll.
          </p>
        </>
      )}
    </SectionBlock>
  );
}

function Figure({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="px-3 py-2.5 text-center">
      <p className={cn('font-display text-lg font-bold tabular-nums text-foreground', tone)}>{fmtDays(value)}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
