import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet, IndianRupee } from 'lucide-react';

interface MyLoansCardProps {
  employeeId: string;
}

const fmtInr = (n: number | string | null | undefined) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/**
 * Employee-facing loans & salary-advance ledger.
 * - Lists disbursed / active loans with outstanding balance and EMI.
 * - Repayment history (last 12) drawn from `hr_loan_repayments`.
 * New requests still go through HR (respecting RLS on `hr_loans`).
 */
export default function MyLoansCard({ employeeId }: MyLoansCardProps) {
  const { data: loans = [], isLoading } = useQuery({
    queryKey: ['my_loans', employeeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('hr_loans')
        .select('*')
        .eq('employee_id', employeeId)
        .order('disbursement_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!employeeId,
  });

  const activeLoanIds = loans.filter((l: any) => l.status === 'active').map((l: any) => l.id);

  const { data: repayments = [] } = useQuery({
    queryKey: ['my_loan_repayments', activeLoanIds.join(',')],
    queryFn: async () => {
      if (!activeLoanIds.length) return [];
      const { data, error } = await (supabase as any)
        .from('hr_loan_repayments')
        .select('*')
        .in('loan_id', activeLoanIds)
        .order('repayment_date', { ascending: false })
        .limit(12);
      if (error) throw error;
      return data || [];
    },
    enabled: activeLoanIds.length > 0,
  });

  const totals = loans.reduce(
    (acc: any, l: any) => {
      if (l.status === 'active') {
        acc.outstanding += Number(l.outstanding_balance || 0);
        acc.emi += Number(l.emi_amount || 0);
      }
      return acc;
    },
    { outstanding: 0, emi: 0 }
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4 text-primary" /> Loans &amp; Salary Advances
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg border border-border bg-muted/30">
            <p className="text-xs text-muted-foreground">Total outstanding</p>
            <p className="text-xl font-bold text-destructive">{fmtInr(totals.outstanding)}</p>
          </div>
          <div className="p-3 rounded-lg border border-border bg-muted/30">
            <p className="text-xs text-muted-foreground">EMI / month</p>
            <p className="text-xl font-bold text-foreground">{fmtInr(totals.emi)}</p>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>
        ) : loans.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No loans or salary advances on record. To request an advance, contact HR.
          </p>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Type</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Disbursed</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Principal</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Outstanding</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">EMI</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loans.map((l: any) => (
                    <tr key={l.id} className="border-b border-border/40 hover:bg-muted/30">
                      <td className="px-3 py-2 capitalize text-foreground">
                        {l.advance_type || l.loan_type || 'Loan'}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{l.disbursement_date || '—'}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmtInr(l.amount)}</td>
                      <td className="px-3 py-2 text-right font-mono text-destructive">
                        {fmtInr(l.outstanding_balance)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{fmtInr(l.emi_amount)}</td>
                      <td className="px-3 py-2 capitalize text-xs">{l.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile */}
            <div className="md:hidden space-y-2">
              {loans.map((l: any) => (
                <div key={l.id} className="border border-border rounded-lg p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground capitalize">
                      {l.advance_type || l.loan_type || 'Loan'}
                    </span>
                    <span className="text-xs capitalize text-muted-foreground">{l.status}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Outstanding</span>
                    <span className="font-mono text-destructive">{fmtInr(l.outstanding_balance)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">EMI</span>
                    <span className="font-mono">{fmtInr(l.emi_amount)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Disbursed</span>
                    <span>{l.disbursement_date || '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {repayments.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">Recent repayments</p>
            <div className="border border-border rounded-lg divide-y divide-border/60">
              {repayments.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <IndianRupee className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-foreground">{r.repayment_date}</span>
                    <span className="text-xs text-muted-foreground capitalize">
                      · {r.repayment_type || 'payroll'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-semibold text-foreground">{fmtInr(r.amount)}</span>
                    <span className="text-xs text-muted-foreground">
                      bal {fmtInr(r.balance_after)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
