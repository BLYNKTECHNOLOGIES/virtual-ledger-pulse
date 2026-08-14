import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Wallet, IndianRupee, PiggyBank, Shield } from 'lucide-react';

interface MyLoansCardProps {
  employeeId: string;
  showDeposits?: boolean;
}

const fmtInr = (n: number | string | null | undefined) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const DEPOSIT_TYPE_LABEL: Record<string, string> = {
  security: 'Security Deposit',
  error_recovery: 'Error Recovery',
};

const txTypeLabel: Record<string, string> = {
  collection: 'Collection',
  penalty_deduction: 'Penalty',
  replenishment: 'Replenishment',
  ff_refund: 'F&F Refund',
  refund: 'Refund',
};
const txTypeColor: Record<string, string> = {
  collection: 'text-success',
  penalty_deduction: 'text-destructive',
  replenishment: 'text-info',
  ff_refund: 'text-primary',
  refund: 'text-primary',
};

function DepositCard({ deposit }: { deposit: any }) {
  const { data: recentTxns = [] } = useQuery({
    queryKey: ['hr_deposit_txns_profile', deposit.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('hr_deposit_transactions')
        .select('*')
        .eq('deposit_id', deposit.id)
        .order('transaction_date', { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!deposit?.id,
  });

  const progress =
    deposit.total_deposit_amount > 0
      ? Math.round((deposit.collected_amount / deposit.total_deposit_amount) * 100)
      : 0;
  const modeLabel =
    deposit.deduction_mode === 'one_time'
      ? 'One-Time'
      : deposit.deduction_mode === 'percentage'
        ? `${deposit.deduction_value}% of Salary`
        : deposit.deduction_mode === 'already_deducted'
          ? 'Already Deducted'
          : `₹${Number(deposit.deduction_value).toLocaleString('en-IN')}/month`;

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{DEPOSIT_TYPE_LABEL[deposit.deposit_type || 'security']}</p>
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            deposit.is_fully_collected
              ? 'bg-success/10 text-success'
              : deposit.is_paused
                ? 'bg-muted text-muted-foreground'
                : 'bg-warning/10 text-warning'
          }`}
        >
          {deposit.is_fully_collected ? 'Fully Collected' : deposit.is_paused ? 'Paused' : 'Collecting'}
        </span>
      </div>

      {deposit.deposit_type === 'error_recovery' &&
        (deposit.incident_reference || deposit.incident_date || deposit.recovery_reason) && (
          <div className="text-xs text-muted-foreground space-y-0.5">
            {deposit.incident_date && (
              <p>
                Incident date: <span className="text-foreground">{deposit.incident_date}</span>
              </p>
            )}
            {deposit.incident_reference && (
              <p>
                Reference: <span className="text-foreground">{deposit.incident_reference}</span>
              </p>
            )}
            {deposit.recovery_reason && (
              <p>
                Reason: <span className="text-foreground">{deposit.recovery_reason}</span>
              </p>
            )}
          </div>
        )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-sm font-semibold">{fmtInr(deposit.total_deposit_amount)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Collected</p>
          <p className="text-sm font-semibold text-success">{fmtInr(deposit.collected_amount)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Current Balance</p>
          <p className="text-sm font-semibold text-primary">{fmtInr(deposit.current_balance)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Deduction Mode</p>
          <p className="text-sm font-medium">{modeLabel}</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-muted-foreground">Collection Progress</p>
          <p className="text-xs font-medium">{progress}%</p>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {recentTxns.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-muted-foreground mb-1">Recent Transactions</p>
          <div className="space-y-1">
            {recentTxns.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between text-xs border-b border-border/50 py-1">
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${txTypeColor[t.transaction_type] || 'text-foreground'}`}>
                    {txTypeLabel[t.transaction_type] || t.transaction_type}
                  </span>
                  <span className="text-muted-foreground">{t.transaction_date}</span>
                </div>
                <span className={`font-medium ${Number(t.amount) >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {Number(t.amount) >= 0 ? '+' : ''}₹{Math.abs(Number(t.amount)).toLocaleString('en-IN')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Employee-facing loans, salary-advance and deposit ledger.
 * - Lists disbursed / active loans with outstanding balance and EMI.
 * - Repayment history (last 12) drawn from `hr_loan_repayments`.
 * - Active deposits (security / error recovery) with collection progress.
 * New requests still go through HR (respecting RLS on `hr_loans`).
 */
export default function MyLoansCard({ employeeId, showDeposits }: MyLoansCardProps) {
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

  const { data: deposits = [] } = useQuery({
    queryKey: ['my_deposits', employeeId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('hr_employee_deposits')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('is_settled', false)
        .order('created_at', { ascending: true });
      return data || [];
    },
    enabled: !!employeeId && showDeposits,
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

  const hasDeposits = showDeposits && deposits.length > 0;
  const securityDeposits = hasDeposits
    ? deposits.filter((d: any) => (d.deposit_type || 'security') === 'security')
    : [];
  const recoveryDeposits = hasDeposits
    ? deposits.filter((d: any) => d.deposit_type === 'error_recovery')
    : [];

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
                    <span className="text-xs text-muted-foreground">bal {fmtInr(r.balance_after)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasDeposits && (
          <div className="border-t border-border pt-4 space-y-4">
            <div className="flex items-center gap-2">
              <PiggyBank className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Deposits</p>
            </div>
            {[
              ['Security Deposit', securityDeposits],
              ['Error Recovery', recoveryDeposits],
            ].map(([label, list]: any) =>
              list.length === 0 ? null : (
                <div key={label}>
                  <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">{label}</p>
                  <div className="space-y-3">
                    {list.map((d: any) => (
                      <DepositCard key={d.id} deposit={d} />
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
