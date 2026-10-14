import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Progress } from '@/components/ui/progress';
import { Wallet, PiggyBank } from 'lucide-react';
import { SectionBlock, StatusPill, ProfileSkeleton } from './primitives';
import { fmtDay, humanize } from './format';

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
    <div className="rounded-md border border-border p-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-foreground">{DEPOSIT_TYPE_LABEL[deposit.deposit_type || 'security']}</p>
        <StatusPill tone={deposit.is_fully_collected ? 'success' : deposit.is_paused ? 'neutral' : 'warning'}>
          {deposit.is_fully_collected ? 'Fully Collected' : deposit.is_paused ? 'Paused' : 'Collecting'}
        </StatusPill>
      </div>

      {deposit.deposit_type === 'error_recovery' &&
        (deposit.incident_reference || deposit.incident_date || deposit.recovery_reason) && (
          <div className="text-xs text-muted-foreground space-y-0.5">
            {deposit.incident_date && (
              <p>
                Incident date: <span className="text-foreground">{fmtDay(deposit.incident_date)}</span>
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

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] text-muted-foreground">Total</p>
          <p className="font-mono text-sm font-semibold tabular-nums">{fmtInr(deposit.total_deposit_amount)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Collected</p>
          <p className="font-mono text-sm font-semibold tabular-nums text-success">{fmtInr(deposit.collected_amount)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Current Balance</p>
          <p className="font-mono text-sm font-semibold tabular-nums text-primary">{fmtInr(deposit.current_balance)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Deduction Mode</p>
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
                  <span className="text-muted-foreground">{fmtDay(t.transaction_date)}</span>
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
    <SectionBlock
      icon={Wallet}
      title={showDeposits ? 'Loans, advances & deposits' : 'Loans & salary advances'}
      description="Recovered through payroll. To request an advance, contact HR."
      bodyClassName="space-y-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <p className="text-[11px] text-muted-foreground">Total outstanding</p>
          <p className={`font-display text-xl font-bold tabular-nums ${totals.outstanding > 0 ? 'text-destructive' : 'text-foreground'}`}>{fmtInr(totals.outstanding)}</p>
        </div>
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <p className="text-[11px] text-muted-foreground">EMI / month</p>
          <p className="font-display text-xl font-bold tabular-nums text-foreground">{fmtInr(totals.emi)}</p>
        </div>
      </div>

      {isLoading ? (
        <ProfileSkeleton rows={2} bare className="p-0" />
      ) : loans.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No loans or salary advances on record. To request an advance, contact HR.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {loans.map((l: any) => {
            const principal = Number(l.amount || 0);
            const outstanding = Number(l.outstanding_balance || 0);
            const repaidPct = principal > 0 ? Math.min(100, Math.max(0, Math.round(((principal - outstanding) / principal) * 100))) : 0;
            return (
              <li key={l.id} className="space-y-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold text-foreground">
                    {humanize(l.advance_type || l.loan_type || 'Loan')}
                  </span>
                  <StatusPill tone={l.status === 'active' ? 'info' : l.status === 'closed' || l.status === 'completed' ? 'success' : 'neutral'}>{humanize(l.status)}</StatusPill>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Principal</p>
                    <p className="font-mono font-semibold tabular-nums text-foreground">{fmtInr(l.amount)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Outstanding</p>
                    <p className={`font-mono font-semibold tabular-nums ${outstanding > 0 ? 'text-destructive' : 'text-foreground'}`}>{fmtInr(l.outstanding_balance)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">EMI</p>
                    <p className="font-mono font-semibold tabular-nums text-foreground">{fmtInr(l.emi_amount)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Progress value={repaidPct} className="h-1.5 flex-1" />
                  <span className="shrink-0 text-[11px] text-muted-foreground">{repaidPct}% repaid · disbursed {fmtDay(l.disbursement_date)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {repayments.length > 0 && (
        <div>
          <p className="ds-field-label mb-1.5">Recent repayments</p>
          <ul className="divide-y divide-border rounded-md border border-border">
            {repayments.map((r: any) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
                <span className="text-foreground">
                  {fmtDay(r.repayment_date)}
                  <span className="text-xs text-muted-foreground"> · {humanize(r.repayment_type || 'payroll')}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-mono font-semibold tabular-nums text-foreground">{fmtInr(r.amount)}</span>
                  <span className="text-xs text-muted-foreground">balance {fmtInr(r.balance_after)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasDeposits && (
        <div className="space-y-4 border-t border-border pt-4">
          <div className="flex items-center gap-2">
            <PiggyBank className="h-4 w-4 text-primary" />
            <p className="t-card-title text-foreground">Deposits</p>
          </div>
          {[
            ['Security Deposit', securityDeposits],
            ['Error Recovery', recoveryDeposits],
          ].map(([label, list]: any) =>
            list.length === 0 ? null : (
              <div key={label}>
                <p className="ds-field-label mb-2">{label}</p>
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
    </SectionBlock>
  );
}
