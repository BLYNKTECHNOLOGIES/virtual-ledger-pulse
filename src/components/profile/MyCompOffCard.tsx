import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Gift, CheckCircle2, Clock3 } from 'lucide-react';

interface MyCompOffCardProps {
  employeeId: string;
}

/**
 * Employee-facing comp-off ledger. Credits are auto-granted by the
 * `hr_grant_sunday_work_credit` trigger — HR handles redemption/allocation, so
 * this view surfaces earned, redeemed, and expiring balances read-only.
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

  const today = new Date().toISOString().slice(0, 10);
  const totals = credits.reduce(
    (acc: any, c: any) => {
      const d = Number(c.credit_days || 0);
      acc.earned += d;
      if (c.is_allocated) acc.redeemed += d;
      else if (c.expires_at && c.expires_at < today) acc.expired += d;
      else acc.available += d;
      return acc;
    },
    { earned: 0, available: 0, redeemed: 0, expired: 0 }
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gift className="h-4 w-4 text-primary" /> Comp-off Balance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
            <p className="text-xs text-muted-foreground">Available</p>
            <p className="text-2xl font-bold text-success">{totals.available.toFixed(1)}</p>
          </div>
          <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
            <p className="text-xs text-muted-foreground">Earned (total)</p>
            <p className="text-2xl font-bold text-foreground">{totals.earned.toFixed(1)}</p>
          </div>
          <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
            <p className="text-xs text-muted-foreground">Redeemed</p>
            <p className="text-2xl font-bold text-info">{totals.redeemed.toFixed(1)}</p>
          </div>
          <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
            <p className="text-xs text-muted-foreground">Expired</p>
            <p className="text-2xl font-bold text-muted-foreground">{totals.expired.toFixed(1)}</p>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>
        ) : credits.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No comp-off credits yet. Sunday work is auto-credited by the attendance engine.
          </p>
        ) : (
          <div className="border border-border rounded-lg divide-y divide-border/60">
            {credits.slice(0, 10).map((c: any) => {
              const expired = c.expires_at && c.expires_at < today;
              return (
                <div key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    {c.is_allocated ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-info" />
                    ) : expired ? (
                      <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <Gift className="h-3.5 w-3.5 text-success" />
                    )}
                    <span className="font-medium text-foreground">{c.credit_date}</span>
                    <span className="text-xs text-muted-foreground">
                      · {c.credit_type || 'Sunday work'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {c.settled_period_month
                        ? `Settled ${String(c.settled_period_month).slice(0, 7)}`
                        : 'Open this month'}
                    </span>
                    <span className="font-semibold text-foreground">+{Number(c.credit_days).toFixed(1)}d</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Comp-off is earned automatically for approved Sunday/holiday work and is settled every month —
          it never carries forward. Days you take as Comp-off leave are used first, remaining days cancel
          any Loss of Pay for that month, and whatever is still left is encashed in that month's salary at
          your per-day rate.
        </p>

      </CardContent>
    </Card>
  );
}
