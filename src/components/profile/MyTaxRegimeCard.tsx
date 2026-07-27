import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText } from 'lucide-react';

interface MyTaxRegimeCardProps {
  employeeId: string;
}

/**
 * Read-only view of the employee's tax filing status (Old / New regime) and
 * standard deduction / cess / 87A rebate limit. Regime changes for the FY are
 * routed via HR to keep RazorpayX in sync — this card surfaces the current
 * declaration so the employee always knows what payroll is applying.
 */
export default function MyTaxRegimeCard({ employeeId }: MyTaxRegimeCardProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['my_filing_status', employeeId],
    queryFn: async () => {
      const { data: emp } = await (supabase as any)
        .from('hr_employees')
        .select('tax_regime, additional_info')
        .eq('id', employeeId)
        .maybeSingle();

      const { data: statuses = [] } = await (supabase as any)
        .from('hr_filing_statuses')
        .select('*')
        .eq('is_active', true);

      const regime = emp?.tax_regime || 'new';
      const matched = (statuses || []).find(
        (s: any) => (s.regime_type || '').toLowerCase() === regime.toLowerCase()
      );
      return { regime, matched, emp };
    },
    enabled: !!employeeId,
  });

  const regimeLabel = data?.regime === 'old' ? 'Old Regime' : 'New Regime';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-primary" /> Tax Regime (FY declaration)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Currently applied</p>
              <span className="px-3 py-1 rounded-full bg-primary/15 text-primary text-sm font-semibold">
                {regimeLabel}
              </span>
            </div>

            {data?.matched && (
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="p-2 rounded-md border border-border/60 bg-muted/30 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Std. deduction</p>
                  <p className="text-sm font-semibold text-foreground">
                    ₹{Number(data.matched.standard_deduction || 0).toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="p-2 rounded-md border border-border/60 bg-muted/30 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Cess</p>
                  <p className="text-sm font-semibold text-foreground">
                    {(() => {
                      // cess_rate is stored as a percent (e.g. 4 = 4%). Some
                      // legacy rows accidentally stored it as a fraction
                      // (0.04). Normalize: values ≤ 1 are fractions.
                      const raw = Number(data.matched.cess_rate || 0);
                      const pct = raw <= 1 ? raw * 100 : raw;
                      return `${pct.toFixed(1)}%`;
                    })()}
                  </p>
                </div>
                <div className="p-2 rounded-md border border-border/60 bg-muted/30 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">87A rebate ≤</p>
                  <p className="text-sm font-semibold text-foreground">
                    ₹{Number(data.matched.rebate_87a_limit || 0).toLocaleString('en-IN')}
                  </p>
                </div>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground pt-1">
              To switch regime or submit investment proofs (80C, HRA, LTA, home-loan interest,
              etc.), raise a request with HR. Changes are pushed to RazorpayX before the FY
              tax-lock window and cannot be updated mid-payroll-run.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
