import { useState, useEffect, useRef } from 'react';
import { monthlyCtcOnRecord, workTypeLabel, fullName } from '@/lib/hrms/employeeFields';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useFileDropzone } from '@/hooks/useFileDropzone';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { PayslipPdfDownloadButton } from '@/components/hrms/PayslipPdfDownloadButton';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { ForgotPasswordDialog } from '@/components/auth/ForgotPasswordDialog';
import { Switch } from '@/components/ui/switch';
import { Bot } from 'lucide-react';
import { useHelpAssistantEnabled } from '@/hooks/useHelpAssistantEnabled';

import {
  User,
  Building2,
  IndianRupee,
  TrendingUp,
  CreditCard,
  Shield,
  FileText,
  Settings,
  Receipt,
  Plus,
  Pencil,
  Trash2,
  LogOut,
  ChevronDown,
  ClipboardList,
  CalendarDays,
  Landmark,
  Camera,
  KeyRound,
  BadgeCheck,
  Clock,
  XCircle,
  FileCheck2,
  Copy,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast as sonnerToast } from 'sonner';
import { openStoredDocument } from '@/lib/storedDoc';

import { UserProfileTasks, useProfileTasks } from '@/components/tasks/UserProfileTasks';
import AttendanceTab from '@/components/profile/AttendanceTab';
import MyAssetsTab from '@/components/profile/MyAssetsTab';
import MyLoansCard from '@/components/profile/MyLoansCard';
import OrgLeaveCalendarCard from '@/components/profile/OrgLeaveCalendarCard';

import MyRequestsHub from '@/components/profile/MyRequestsHub';
import TeamLeaveApprovals from '@/components/profile/TeamLeaveApprovals';
import TeamRegularizationApprovals from '@/components/profile/TeamRegularizationApprovals';
import MyDepartmentTab from '@/components/profile/MyDepartmentTab';
import { useMyDepartmentStaffing } from '@/hooks/hrms/useWorkforceBudget';
import MyPoliciesCard from '@/components/profile/MyPoliciesCard';
import MyHelpdeskCard from '@/components/profile/MyHelpdeskCard';
import MySecurityCard from '@/components/profile/MySecurityCard';
import { UpcomingHolidaysCard } from '@/components/hrms/UpcomingHolidaysCard';
import { CompensationHistory } from '@/components/hrms/CompensationHistory';
import { BankChangeRequestCard } from '@/components/profile/BankChangeRequestCard';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ProfileNav, buildProfileNav } from '@/components/profile/ProfileNav';
import { ProfileOverview } from '@/components/profile/ProfileOverview';
import { useMyPayslips, useTeamLeaveQueue, useTeamRegQueue } from '@/components/profile/hooks';
import { fmtAgo, fmtDay, fmtDays, fmtINR, fmtMonth, fmtRange, humanize, leaveStage } from '@/components/profile/format';
import {
  FieldGrid,
  Field,
  SectionBlock,
  MoneyRow,
  StatusPill,
  StatTile,
  TabIntro,
  ProfileEmptyState,
  ProfileSkeleton,
} from '@/components/profile/primitives';



interface BankAccount {
  id: string;
  account_name: string;
  account_number: string;
  bank_name: string;
  IFSC?: string;
  branch?: string;
}

/** "50100234567812" → "5010 0234 5678 12" — easier to read out and check. */
const groupDigits = (v?: string | null) => String(v || '').replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();

// ─── Employee Banking Sub-Component (HRMS bank details) ───
function EmployeeBankingTab({
  employeeId,
  userId,
  holderName,
}: {
  employeeId: string;
  userId?: string;
  holderName?: string;
}) {
  const { data: bankDetails = [], isLoading } = useQuery({
    queryKey: ['hr_employee_bank_details', employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_employee_bank_details')
        .select('*')
        .eq('employee_id', employeeId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!employeeId,
  });

  const copy = (text: string, what: string) => {
    navigator.clipboard?.writeText(text).then(
      () => sonnerToast.success(`${what} copied`),
      () => sonnerToast.error('Could not copy'),
    );
  };

  return (
    <div className="space-y-4">
      <TabIntro title="Bank details" />
      {isLoading ? (
        <ProfileSkeleton rows={4} />
      ) : bankDetails.length === 0 ? (
        <ProfileEmptyState
          icon={CreditCard}
          title="No bank details on file"
          description="Your salary bank details have not been added by HR yet. You can request a bank update below."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {bankDetails.map((bank: any) => (
            <section key={bank.id} className="ds-panel overflow-hidden">
              <div className="relative border-b border-border bg-gradient-to-br from-primary/[0.08] to-transparent p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="ds-field-label">Salary account</p>
                    <p className="mt-1 truncate font-display text-lg font-bold text-foreground">{bank.bank_name || 'Salary Bank Account'}</p>
                    {bank.branch && <p className="t-secondary mt-0.5">{bank.branch}</p>}
                  </div>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Landmark className="h-4 w-4" /></span>
                </div>
                {bank.account_number && (
                  <div className="mt-4 flex items-center justify-between gap-2">
                    <p className="font-mono text-lg font-semibold tracking-wider text-foreground tabular-nums">{groupDigits(bank.account_number)}</p>
                    <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground" onClick={() => copy(String(bank.account_number), 'Account number')}>
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </Button>
                  </div>
                )}
              </div>
              <div className="ds-panel-body">
                <FieldGrid>
                  {bank.ifsc_code && <Field label="IFSC code" value={bank.ifsc_code} mono />}
                  {bank.bank_code_2 && <Field label="Bank code 2" value={bank.bank_code_2} mono />}
                  {bank.city && <Field label="City" value={bank.city} />}
                  {bank.state && <Field label="State" value={bank.state} />}
                  {bank.country && <Field label="Country" value={bank.country} />}
                </FieldGrid>
              </div>
            </section>
          ))}
        </div>
      )}

      <BankChangeRequestCard employeeId={employeeId} userId={userId} defaultHolderName={holderName} />
    </div>
  );
}



// ─── Salary & PF Sub-Component ───────────────────────────────────────────────
// RazorpayX is the primary authority for salary. We mirror the assigned
// structure into `hr_employee_salary_structures` per employee. This tab reads
// that mirror (never a local template) so the employee always sees exactly
// what RazorpayX will pay. Falls back to CTC-only when the mirror is empty.
function SalaryPFTab({ hrEmployee }: { hrEmployee: any }) {
  const monthlyOnRecord = monthlyCtcOnRecord(hrEmployee?.total_salary);
  const annualCTC = monthlyOnRecord != null ? Number(hrEmployee.total_salary) : 0;
  const monthlyCTC = monthlyOnRecord ?? 0;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['ess_salary_mirror', hrEmployee?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('hr_employee_salary_structures')
        .select('id, amount, is_percentage, hr_salary_components!hr_employee_salary_structures_component_id_fkey(name, code, component_type, is_taxable)')
        .eq('employee_id', hrEmployee.id)
        .eq('is_active', true)
        .order('created_at');
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!hrEmployee?.id,
  });

  const fmt = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
  const isRupees = (r: any) => !r.is_percentage || Number(r.amount) > 100;

  // Detect stored unit: the RazorpayX mirror historically stored ANNUAL amounts
  // for some rows and MONTHLY for others. Auto-detect per employee by
  // comparing the earnings-side sum against annual vs monthly CTC and pick
  // the closer match. This keeps the UI honest regardless of import shape.
  const earnings = rows.filter((r) => {
    const t = r.hr_salary_components?.component_type;
    return t !== 'deduction' && t !== 'employer_contribution';
  });
  const deductions = rows.filter((r) => r.hr_salary_components?.component_type === 'deduction');
  const employerContribs = rows.filter((r) => r.hr_salary_components?.component_type === 'employer_contribution');
  const sumRaw = (list: any[]) => list.reduce((s, r) => s + (isRupees(r) ? Number(r.amount) || 0 : 0), 0);

  const earningsSum = sumRaw(earnings);
  let storedUnit: 'annual' | 'monthly' = 'monthly';
  if (annualCTC > 0 && earningsSum > 0) {
    const distToAnnual = Math.abs(earningsSum - annualCTC) / annualCTC;
    const distToMonthly = Math.abs(earningsSum - monthlyCTC) / monthlyCTC;
    storedUnit = distToAnnual <= distToMonthly ? 'annual' : 'monthly';
  }
  const toAnnual = (amt: number) => (storedUnit === 'annual' ? amt : amt * 12);
  const toMonthly = (amt: number) => (storedUnit === 'annual' ? amt / 12 : amt);

  const annualEarnings = toAnnual(earningsSum);
  const monthlyEarnings = toMonthly(earningsSum);
  const annualDeductions = toAnnual(sumRaw(deductions));
  const monthlyDeductions = toMonthly(sumRaw(deductions));
  const annualEmployer = toAnnual(sumRaw(employerContribs));
  const monthlyEmployer = toMonthly(sumRaw(employerContribs));
  const monthlyNet = monthlyEarnings - monthlyDeductions;
  const annualNet = annualEarnings - annualDeductions;

  // Reconciliation vs. CTC on record — surfaces silent drift honestly.
  const ctcDelta = annualCTC > 0 ? annualEarnings - annualCTC : 0;
  const ctcDriftPct = annualCTC > 0 ? Math.abs(ctcDelta) / annualCTC : 0;
  const hasDrift = annualCTC > 0 && ctcDriftPct > 0.02;

  const renderRow = (r: any, tone: 'earn' | 'ded') => {
    const rupees = isRupees(r);
    const raw = Number(r.amount) || 0;
    const monthly = rupees ? toMonthly(raw) : 0;
    return (
      <MoneyRow
        key={r.id}
        label={r.hr_salary_components?.name || '—'}
        tone={tone === 'ded' ? 'negative' : 'neutral'}
        value={rupees ? `${tone === 'ded' ? '−' : ''}${fmt(monthly)}` : `${raw}%`}
        suffix={rupees ? '/mo' : undefined}
      />
    );
  };

  const hasBreakdown = !isLoading && rows.length > 0;

  return (
    <div className="space-y-4">
      <TabIntro title="Salary & PF" description="As payroll (RazorpayX) holds it. Monthly figures are before any loss of pay." />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label="Annual CTC on record" value={monthlyOnRecord != null ? fmt(annualCTC) : 'Not set'} icon={IndianRupee} />
        <StatTile label="Monthly CTC on record" value={monthlyOnRecord != null ? fmt(monthlyCTC) : 'Not set'} sub="Annual CTC ÷ 12" />
        <StatTile
          label="Gross earnings"
          value={hasBreakdown ? fmt(monthlyEarnings) : '—'}
          sub={hasBreakdown ? 'per month, from the components below' : 'Breakdown not published yet'}
        />
        <StatTile
          label="Net pay (approx)"
          value={hasBreakdown ? fmt(monthlyNet) : '—'}
          tone={hasBreakdown ? 'success' : 'default'}
          sub={hasBreakdown ? `after ${fmt(monthlyDeductions)} deductions a month` : 'Shown once HR publishes it'}
        />
      </div>

      {hasDrift && (
        <p className="rounded-[var(--radius-card)] border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-xs text-foreground">
          Heads up — component sum ({fmt(annualEarnings)}) differs from CTC on record ({fmt(annualCTC)}) by{' '}
          {(ctcDriftPct * 100).toFixed(1)}%. HR has been notified to reconcile this.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Salary Breakdown */}
        <SectionBlock title="Salary structure" icon={IndianRupee} description="Monthly amounts per component" bodyClassName="space-y-4">
          {isLoading ? (
            <ProfileSkeleton rows={4} bare className="p-0" />
          ) : rows.length === 0 ? (
            <div className="text-center py-6 space-y-1">
              <p className="t-card-title text-foreground">Component breakdown not published yet</p>
              <p className="t-secondary max-w-md mx-auto">
                Your CTC above is what payroll will pay. The component-wise breakdown appears here once HR publishes it.
              </p>
            </div>
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="ds-field-label">Earnings</p>
                  <p className="text-[10px] text-muted-foreground">monthly</p>
                </div>
                {earnings.map((r) => renderRow(r, 'earn'))}
                <MoneyRow label="Gross Earnings" value={fmt(monthlyEarnings)} suffix="/mo" strong />
              </div>

              {deductions.length > 0 && (
                <div>
                  <p className="ds-field-label mb-1">Deductions</p>
                  {deductions.map((r) => renderRow(r, 'ded'))}
                  <MoneyRow
                    label="Total Deductions"
                    value={`−${fmt(monthlyDeductions)}`}
                    suffix="/mo"
                    tone="negative"
                    strong
                  />
                </div>
              )}

              <div className="flex items-baseline justify-between gap-3 rounded-md border border-success/25 bg-success/[0.06] px-3 py-2.5">
                <span className="t-card-title text-foreground">Net Pay (approx)</span>
                <span className="font-mono text-lg font-semibold text-foreground tabular-nums">
                  {fmt(monthlyNet)} <span className="font-sans text-xs font-normal text-muted-foreground">/mo · {fmt(annualNet)} a year</span>
                </span>
              </div>

              {employerContribs.length > 0 && (
                <div>
                  <p className="ds-field-label mb-1">Paid by the company on top</p>
                  {employerContribs.map((r) => renderRow(r, 'earn'))}
                  <MoneyRow label="Employer contributions" value={fmt(monthlyEmployer)} suffix={`/mo · ${fmt(annualEmployer)} a year`} strong />
                  <p className="t-secondary mt-1">Not part of your take-home; it goes to your PF / ESI accounts.</p>
                </div>
              )}
            </>
          )}
        </SectionBlock>


        {/* Loans, Salary Advances & Deposits */}
        <MyLoansCard employeeId={hrEmployee.id} showDeposits />

      </div>
    </div>
  );
}


// ─── Employee Payslips Sub-Component (ESS — canonical hr_payslips_v) ───
// R7 doctrine: RazorpayX is the canonical payslip source. We read from
// hr_payslips_v (a view over hr_razorpay_payslip_records) and deep-link into
// the RazorpayX dashboard for the PDF binary — the RazorpayX API does not
// expose PDFs, so a fake "Download" button would be dishonest.
function EmployeePayslipsTab({ employeeId, badgeId }: { employeeId: string; badgeId?: string | number | null }) {
  const { data: payslips = [], isLoading, error } = useMyPayslips(employeeId, badgeId);
  const [openId, setOpenId] = useState<string | null>(null);

  if (isLoading) return <ProfileSkeleton rows={5} />;

  if (error) {
    return (
      <ProfileEmptyState
        icon={Receipt}
        title="Could not load your payslips"
        description={(error as any)?.message ?? 'Unknown error'}
      />
    );
  }

  if (payslips.length === 0) {
    return (
      <ProfileEmptyState
        icon={Receipt}
        title="No payslips yet"
        description="Your payslips will appear here once payroll for the month is processed."
      />
    );
  }

  const fmt = (n: number | null | undefined) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

  const Row = ({ label, value, tone }: { label: string; value: number | null | undefined; tone?: 'neg' }) => (
    <MoneyRow
      label={label}
      value={`${tone === 'neg' ? '− ' : ''}${fmt(value)}`}
      tone={tone === 'neg' ? 'negative' : 'neutral'}
    />
  );

  // Financial year (April–March) of the latest payslip, for the year-to-date strip.
  const latest = payslips[0];
  const fyStartYear = (() => {
    const d = latest?.period_month ? String(latest.period_month) : '';
    const y = Number(d.slice(0, 4));
    const m = Number(d.slice(5, 7));
    return m >= 4 ? y : y - 1;
  })();
  const inFy = payslips.filter((p: any) => {
    const d = String(p.period_month || '');
    const y = Number(d.slice(0, 4));
    const m = Number(d.slice(5, 7));
    return (m >= 4 ? y : y - 1) === fyStartYear;
  });
  const fyNet = inFy.reduce((s: number, p: any) => s + (Number(p.net) || 0), 0);
  const maxNet = Math.max(1, ...payslips.map((p: any) => Number(p.net) || 0));
  const expandedId = openId ?? latest?.id ?? null;

  return (
    <div className="space-y-4">
      <TabIntro title="Payslips" />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label={`Latest · ${fmtMonth(latest?.period_month)}`} value={fmt(latest?.net)} tone="success" sub="Net pay on the payslip" icon={Receipt} />
        <StatTile label="Gross that month" value={fmt(latest?.gross)} sub={latest?.working_days ? `${latest.working_days} working days` : undefined} />
        <StatTile label={`Net pay · FY ${fyStartYear}–${String(fyStartYear + 1).slice(2)}`} value={fmt(fyNet)} sub={`on ${inFy.length} available payslip${inFy.length === 1 ? '' : 's'}`} />
        <StatTile label="Average net a month" value={fmt(inFy.length ? fyNet / inFy.length : 0)} sub={`over ${inFy.length} payslip${inFy.length === 1 ? '' : 's'} this financial year`} />
      </div>

      <div className="space-y-2.5">
        {payslips.map((p) => {
          const period = p.period_month
            ? new Date(p.period_month).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
            : '';
          const hasReg = !!p.has_register;
          const headLines = (p.pay_head_lines ?? []).filter((l) => Number(l.amount) > 0);
          const oneTimeHeads = headLines.filter((l) => l.classification === 'one_time');
          const variableHeads = headLines.filter((l) => l.classification !== 'one_time');
          const oneTimeRecovery = Number(p.one_time_recovery) || 0;
          const earnings: Array<[string, number | null]> = ([
            ['Basic', p.basic], ['HRA', p.hra], ['Special Allowance', p.special_allowance],
            ['LTA', p.lta], ['DA', p.dearness_allowance],
            ...variableHeads.map((l) => [l.label, l.amount] as [string, number]),
          ] as Array<[string, number | null]>).filter(([, v]) => Number(v) > 0);
          const deductions: Array<[string, number | null]> = ([
            ['Provident Fund', p.pf_amount], ['ESI', p.esi_amount],
            ['Professional Tax', p.professional_tax], ['TDS', p.tds_amount],
            ['Loan EMI', p.loan_emi], ['Advance', p.advance_salary],
          ] as Array<[string, number | null]>).filter(([, v]) => Number(v) > 0);
          const netDeductions = (Number(p.total_deductions) || 0) - oneTimeRecovery;
          const expanded = expandedId === p.id;

          return (
            <article key={p.id} className={cn('ds-panel overflow-hidden transition-shadow', expanded && 'shadow-[var(--shadow-xs)]')}>
              {/* Summary row */}
              <div className="grid gap-3 px-3.5 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                <button
                  type="button"
                  onClick={() => setOpenId(expanded ? '__none__' : p.id)}
                  aria-expanded={expanded}
                  className="flex min-w-0 items-start gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronDown className={cn('mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="t-card-title text-foreground">{period}</span>
                      <StatusPill tone={hasReg ? 'success' : 'warning'}>
                        {hasReg ? 'Detailed' : 'Breakdown pending'}
                      </StatusPill>
                    </span>
                    <span className="mt-1.5 block h-1.5 w-full max-w-[240px] overflow-hidden rounded-full bg-muted" aria-hidden>
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(4, ((Number(p.net) || 0) / maxNet) * 100)}%` }} />
                    </span>
                    <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                      {p.working_days ? `${p.working_days} working days` : 'Salary slip'}
                      {p.pulled_at ? ` · updated ${fmtAgo(p.pulled_at)}` : ''}
                    </span>
                  </span>
                </button>
                <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 pl-7 sm:justify-end sm:pl-0">
                  <div className="grid grid-cols-3 gap-4 sm:flex sm:gap-5">
                    <div className="sm:text-right">
                      <p className="ds-field-label">Gross</p>
                      <p className="font-mono text-[13px] font-medium tabular-nums text-foreground">{fmt(p.gross)}</p>
                    </div>
                    <div className="sm:text-right">
                      <p className="ds-field-label">Deductions</p>
                      <p className="font-mono text-[13px] font-medium tabular-nums text-destructive">{hasReg ? `− ${fmt(netDeductions)}` : '—'}</p>
                    </div>
                    <div className="sm:text-right">
                      <p className="ds-field-label">Net pay</p>
                      <p className="font-mono text-[15px] font-semibold tabular-nums text-foreground">{fmt(p.net)}</p>
                    </div>
                  </div>
                  <PayslipPdfDownloadButton storagePath={p.pdf_storage_path} periodMonth={p.period_month} />
                </div>
              </div>

              {expanded && (
                <div className="space-y-4 border-t border-border bg-muted/[0.15] p-3.5">
                  {hasReg ? (
                    <>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-md border border-border bg-card p-3">
                          <p className="ds-field-label mb-1">Earnings</p>
                          {earnings.length > 0 ? earnings.map(([k, v]) => <Row key={k} label={k} value={v} />) : (
                            <p className="t-secondary">No component-wise earnings published.</p>
                          )}
                          <div className="border-t border-border mt-1 pt-1">
                            <MoneyRow label="Total earnings" value={fmt(p.gross)} strong />
                          </div>
                        </div>

                        <div className="rounded-md border border-border bg-card p-3">
                          <p className="ds-field-label mb-1">Deductions</p>
                          {deductions.length > 0 ? deductions.map(([k, v]) => <Row key={k} label={k} value={v} tone="neg" />) : (
                            <p className="t-secondary">No deductions this month.</p>
                          )}
                          <div className="border-t border-border mt-1 pt-1">
                            <MoneyRow label="Total deductions" value={`− ${fmt(netDeductions)}`} tone="negative" strong />
                          </div>
                        </div>
                      </div>

                      {oneTimeHeads.length > 0 && (
                        <div className="rounded-md border border-border bg-card p-3">
                          <p className="ds-field-label mb-1">Paid separately</p>
                          <div className="grid gap-x-6 sm:grid-cols-2">
                            {oneTimeHeads.map((l) => <Row key={l.label} label={l.label} value={l.amount} />)}
                          </div>
                        </div>
                      )}

                      {(oneTimeRecovery > 0 || Number(p.employer_pf) > 0 || Number(p.employer_esi) > 0) && (
                        <div className="space-y-1.5 t-secondary">
                          {oneTimeRecovery > 0 && (
                            <p>
                              One-time payments totalling {fmt(oneTimeRecovery)} were settled outside this month's salary,
                              so they appear in the gross above and are subtracted again before net pay. Your regular salary for
                              the month is {fmt(p.regular_gross)}.
                            </p>
                          )}
                          {(Number(p.employer_pf) > 0 || Number(p.employer_esi) > 0) && (
                            <p>Employer contribution: PF {fmt(p.employer_pf)} · ESI {fmt(p.employer_esi)} (not deducted from net)</p>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="t-secondary">
                      Payroll has not shared the component breakdown for this month yet. The net pay above is what was credited.
                    </p>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}



// ─── Employee Documents Sub-Component (view own docs uploaded by HR) ───
function EmployeeDocumentsTab({ employeeId }: { employeeId: string }) {
  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['hr_employee_documents_ess', employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_employee_documents')
        .select('*')
        .eq('employee_id', employeeId)
        .or('is_hidden.is.null,is_hidden.eq.false')
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!employeeId,
  });

  const intro = (
    <TabIntro
      title="Documents"
      description="View-only — HR manages these. Contact HR for any change or a new certificate."
    />
  );

  if (isLoading) return <div className="space-y-4">{intro}<ProfileSkeleton rows={4} /></div>;

  if (docs.length === 0) {
    return (
      <div className="space-y-4">
        {intro}
        <ProfileEmptyState
          icon={FileText}
          title="No documents yet"
          description="Your HR-uploaded documents (offer letter, ID proofs, policies, certificates) will appear here."
        />
      </div>
    );
  }

  const typeLabel = (t: string) => (t || 'document').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\b(Hr|Pan|Uan|Esic|Pf|Kyc|Gst)\b/g, (m) => m.toUpperCase());

  const groups = [
    { key: 'issued', title: 'Letters issued to me', icon: FileCheck2, items: docs.filter((d: any) => d.source === 'issued') },
    { key: 'hr_upload', title: 'Uploaded by HR', icon: FileText, items: docs.filter((d: any) => !['onboarding', 'issued'].includes(d.source)) },
    { key: 'onboarding', title: 'Submitted at onboarding', icon: BadgeCheck, items: docs.filter((d: any) => d.source === 'onboarding') },
  ].filter(g => g.items.length > 0);
  const verified = docs.filter((d: any) => d.is_verified).length;

  return (
    <div className="space-y-4">
      {intro}
      <p className="t-secondary">
        {docs.length} file{docs.length === 1 ? '' : 's'} · {verified} verified{docs.length - verified > 0 ? ` · ${docs.length - verified} awaiting HR verification` : ''}
      </p>
      {groups.map(group => (
        <SectionBlock key={group.key} title={group.title} icon={group.icon} actions={<span className="t-secondary">{group.items.length}</span>} flush>
          <ul className="divide-y divide-border">
            {group.items.map((doc: any) => (
              <li key={doc.id} className="flex flex-wrap items-center gap-3 px-3.5 py-2.5 hover:bg-muted/40 transition-colors">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <FileText className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-foreground">
                    {doc.document_name || typeLabel(doc.document_type)}
                  </p>
                  <p className="t-secondary">
                    {typeLabel(doc.document_type)}
                    {doc.uploaded_at ? ` · added ${fmtDay(doc.uploaded_at)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill tone={doc.is_verified ? 'success' : 'warning'}>
                    {doc.is_verified ? 'Verified' : 'Pending'}
                  </StatusPill>
                  {doc.file_url ? (
                    <Button variant="outline" size="sm" className="h-8" onClick={() => { openStoredDocument(doc.file_url).catch((e: any) => sonnerToast.error(e?.message || 'Could not open this document')); }}>
                      View
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="h-8" disabled>Unavailable</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </SectionBlock>
      ))}
    </div>
  );

}

/** Tab values other screens and notifications link to. Old links are mapped onto today's tabs. */
const PROFILE_TAB_VALUES = [
  'profile', 'my-department', 'tasks', 'attendance', 'salary', 'payslips', 'banking',
  'leaves', 'requests', 'documents', 'assets', 'policies', 'helpdesk', 'settings',
];
const PROFILE_TAB_ALIASES: Record<string, string> = { approvals: 'requests', team: 'requests' };
const resolveProfileTab = (tab: string) => {
  const t = PROFILE_TAB_ALIASES[tab] ?? tab;
  return PROFILE_TAB_VALUES.includes(t) ? t : 'profile';
};

/** True on screens wide enough for the side navigation. */
function useIsWide() {
  const query = '(min-width: 1280px)';
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return wide;
}


export default function UserProfile() {

  const { user, refreshUser, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => resolveProfileTab(searchParams.get('tab') ?? 'profile'));
  const { data: myDeptLines = [], isLoading: deptLoading } = useMyDepartmentStaffing();

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) setActiveTab(resolveProfileTab(tab));
  }, [searchParams]);
  const [isEditingBank, setIsEditingBank] = useState(false);
  const [newBankAccount, setNewBankAccount] = useState({
    account_name: '', account_number: '', bank_name: '', ifsc_code: '', branch: ''
  });
  const [leaveRequest, setLeaveRequest] = useState({
    leave_type_id: '', from_date: '', to_date: '', reason: '',
    is_half_day: false, half_day_period: 'morning' as 'morning' | 'afternoon'
  });
  const [settingsData, setSettingsData] = useState({
    newUsername: '', currentPassword: '', newPassword: '', confirmPassword: ''
  });
  const { enabled: assistantEnabled, setHelpAssistantEnabled } = useHelpAssistantEnabled();

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [showLeaveCreate, setShowLeaveCreate] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [editingLeaveId, setEditingLeaveId] = useState<string | null>(null);

  // ─── Fetch HRMS employee linked to this user (with fallback resolution) ───
  // Primary: user_id link. Fallbacks (Phase 0 — unblocks "No Employee Profile Found"):
  // badge_id → email → phone. Employees whose auth row wasn't linked at
  // onboarding still get their ESS surfaces instead of a dead-end.
  const { data: employeeResolution, isLoading: hrLoading } = useQuery({
    queryKey: ['hr_employee_profile_resolved', user?.id],
    queryFn: async () => {
      if (!user?.id) return { employee: null, matchedVia: null as string | null };
      // 1. Primary link. Historical data can hold more than one employee row
      // per auth user (stale duplicates); always prefer the active record
      // instead of erroring out on a multi-row match.
      const primary = await supabase
        .from('hr_employees').select('*').eq('user_id', user.id)
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1);
      if (primary.error) throw primary.error;
      if (primary.data?.[0]) return { employee: primary.data[0], matchedVia: 'user_id' };

      // 2. Not linked yet (hr_employees RLS only exposes rows where
      // user_id = auth.uid(), so client-side badge/email/phone fallbacks can
      // never see an unlinked row). Ask the server to link us by badge id,
      // email or phone, then re-read.
      const { data: linkedId } = await (supabase as any).rpc('hr_link_self_employee');
      if (linkedId) {
        const healed = await supabase
          .from('hr_employees').select('*').eq('id', linkedId).maybeSingle();
        if (healed.data) return { employee: healed.data, matchedVia: 'auto_link' };
      }

      return { employee: null, matchedVia: null };
    },
    enabled: !!user?.id,
  });




  const hrEmployee = employeeResolution?.employee ?? null;
  const employeeMatchedVia = employeeResolution?.matchedVia ?? null;

  // ─── Fetch work info for the HRMS employee ───
  const { data: workInfo } = useQuery({
    queryKey: ['hr_work_info', hrEmployee?.id],
    queryFn: async () => {
      if (!hrEmployee?.id) return null;
      const { data, error } = await supabase
        .from('hr_employee_work_info')
        .select(`
          *,
          departments(name),
          positions:job_position_id(title)
        `)
        .eq('employee_id', hrEmployee.id)
        .maybeSingle();
      if (error) throw error;
      // Fetch shift name separately since there's no FK relationship
      let shiftName: string | null = null;
      if (data?.shift_id) {
        const { data: shiftData } = await supabase
          .from('hr_shifts')
          .select('name, start_time, end_time')
          .eq('id', data.shift_id)
          .maybeSingle();
        if (shiftData?.name) {
          const fmt = (t?: string | null) => t?.slice(0, 5) || null;
          const st = fmt(shiftData.start_time);
          const et = fmt(shiftData.end_time);
          shiftName = st && et ? `${shiftData.name} (${st} – ${et})` : shiftData.name;
        }
      }
      return data ? { ...data, shift_name: shiftName } : null;
    },
    enabled: !!hrEmployee?.id,
  });

  // ─── HRMS Leave Types ───
  const { data: leaveTypes = [] } = useQuery({
    queryKey: ['hr_leave_types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_leave_types')
        .select('*')
        .eq('is_active', true);
      if (error) throw error;
      return data || [];
    },
  });

  // ─── HRMS Leave Allocations (ALL quarters, all years — cumulative carry forward) ───
  const { data: leaveAllocations = [] } = useQuery({
    queryKey: ['hr_leave_allocations', hrEmployee?.id],
    queryFn: async () => {
      if (!hrEmployee?.id) return [];
      const { data, error } = await supabase
        .from('hr_leave_allocations')
        .select('*')
        .eq('employee_id', hrEmployee.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!hrEmployee?.id,
  });

  // Comp-off is monthly and never carries forward; other leave types remain cumulative.
  const cumulativeLeaveBalances = (() => {
    const map: Record<string, { totalAllocated: number; totalUsed: number; available: number }> = {};
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
    for (const a of leaveAllocations) {
      const ltId = a.leave_type_id;
      const leaveType = leaveTypes.find((lt: any) => lt.id === ltId);
      if (leaveType?.code === 'CO') {
        if (a.year === currentYear && a.quarter === currentQuarter) {
          map[ltId] = {
            totalAllocated: Number(a.allocated_days || 0),
            totalUsed: Number(a.used_days || 0),
            available: Number(a.available_days ?? Math.max(Number(a.allocated_days || 0) - Number(a.used_days || 0), 0)),
          };
        }
        continue;
      }
      if (!map[ltId]) map[ltId] = { totalAllocated: 0, totalUsed: 0, available: 0 };
      map[ltId].totalAllocated += Number(a.allocated_days || 0);
      map[ltId].totalUsed += Number(a.used_days || 0);
      map[ltId].available = map[ltId].totalAllocated - map[ltId].totalUsed;
    }
    return map;
  })();

  // Cancel leave mutation
  const cancelLeaveMutation = useMutation({
    mutationFn: async ({ requestId, wasApproved }: { requestId: string; wasApproved: boolean }) => {
      const { error } = await supabase
        .from('hr_leave_requests')
        .update({ status: 'cancelled' })
        .eq('id', requestId);
      if (error) throw error;

      // If was approved, restore used_days in the most recent allocation
      if (wasApproved && hrEmployee?.id) {
        const req = leaveRequests.find((r: any) => r.id === requestId);
        if (req) {
          const empAllocs = leaveAllocations
            .filter((a: any) => a.leave_type_id === req.leave_type_id)
            .sort((a: any, b: any) => ((b.year || 0) * 10 + (b.quarter || 0)) - ((a.year || 0) * 10 + (a.quarter || 0)));
          if (empAllocs.length > 0) {
            await supabase
              .from('hr_leave_allocations')
              .update({ used_days: Math.max(0, empAllocs[0].used_days - req.total_days) })
              .eq('id', empAllocs[0].id);
          }
        }
      }
    },
    onSuccess: () => {
      sonnerToast.success('Leave request cancelled');
      queryClient.invalidateQueries({ queryKey: ['hr_leave_requests', hrEmployee?.id] });
      queryClient.invalidateQueries({ queryKey: ['hr_leave_allocations', hrEmployee?.id] });
    },
    onError: () => sonnerToast.error('Failed to cancel leave request'),
  });

  // ─── HRMS Leave Requests ───
  const { data: leaveRequests = [] } = useQuery({
    queryKey: ['hr_leave_requests', hrEmployee?.id],
    queryFn: async () => {
      if (!hrEmployee?.id) return [];
      const { data, error } = await supabase
        .from('hr_leave_requests')
        .select('*')
        .eq('employee_id', hrEmployee.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!hrEmployee?.id,
  });

  // ─── Legacy employees query removed — hr_employees is the source of truth ───
  const employeeData = hrEmployee ? {
    ...hrEmployee,
    name: `${hrEmployee.first_name} ${hrEmployee.last_name || ''}`.trim(),
  } : null;

  // ─── Bank accounts ───
  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['user_bank_accounts', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase.from('bank_accounts').select('*');
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // ─── Apply for Leave Mutation (HRMS) ───
  const applyLeaveMutation = useMutation({
    mutationFn: async (req: typeof leaveRequest) => {
      if (!hrEmployee?.id) throw new Error('No HRMS employee profile linked');
      // Half-day requests intentionally have no end date — the single date covers it.
      if (!req.leave_type_id || !req.from_date || (!req.is_half_day && !req.to_date)) throw new Error('Please fill all required fields');

      const start = new Date(req.from_date);
      const end = req.is_half_day ? start : new Date(req.to_date);
      if (end < start) throw new Error('End date must be after start date');
      const totalDays = req.is_half_day
        ? 0.5
        : Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const payload = {
        leave_type_id: req.leave_type_id,
        start_date: req.from_date,
        end_date: req.is_half_day ? req.from_date : req.to_date,
        total_days: totalDays,
        is_half_day: req.is_half_day,
        half_day_period: req.is_half_day ? req.half_day_period : null,
        reason: req.reason || null,
      };

      // If editing, update instead of insert
      if (editingLeaveId) {
        const { error } = await (supabase as any).from('hr_leave_requests').update(payload).eq('id', editingLeaveId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('hr_leave_requests').insert({
          ...payload,
          employee_id: hrEmployee.id,
          status: 'requested',
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      sonnerToast.success(editingLeaveId ? 'Leave request updated' : 'Leave request submitted successfully');
      setLeaveRequest({ leave_type_id: '', from_date: '', to_date: '', reason: '', is_half_day: false, half_day_period: 'morning' });
      setEditingLeaveId(null);
      setShowLeaveCreate(false);
      queryClient.invalidateQueries({ queryKey: ['hr_leave_requests', hrEmployee?.id] });
    },
    onError: (error: any) => {
      sonnerToast.error(error.message || 'Failed to submit leave request');
    },
  });

  // ─── Delete Leave Request Mutation ───
  const deleteLeaveRequestMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await (supabase as any).from('hr_leave_requests').delete().eq('id', requestId);
      if (error) throw error;
    },
    onSuccess: () => {
      sonnerToast.success('Leave request deleted');
      queryClient.invalidateQueries({ queryKey: ['hr_leave_requests', hrEmployee?.id] });
    },
    onError: () => sonnerToast.error('Failed to delete leave request'),
  });

  // ─── Add bank account mutation ───
  const addBankAccountMutation = useMutation({
    mutationFn: async (bankData: typeof newBankAccount) => {
      const { error } = await supabase.from('bank_accounts').insert({
        ...bankData, created_by: user?.id, status: 'ACTIVE', balance: 0
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Bank account added successfully" });
      setNewBankAccount({ account_name: '', account_number: '', bank_name: '', ifsc_code: '', branch: '' });
      setIsEditingBank(false);
      queryClient.invalidateQueries({ queryKey: ['user_bank_accounts'] });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });


  // ─── Update username mutation ───
  const updateUsernameMutation = useMutation({
    mutationFn: async (newUsername: string) => {
      if (!user?.id) throw new Error('User not found');
      const { data, error } = await supabase.rpc('update_user_profile', {
        p_user_id: user.id, p_username: newUsername
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      toast({ title: "Success", description: "Username updated successfully", duration: 5000 });
      setSettingsData(prev => ({ ...prev, newUsername: '' }));
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ['employee_profile'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update username", variant: "destructive", duration: 5000 });
    }
  });

  // ─── Update password mutation (via Supabase Auth) ───
  const updatePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      if (!user?.email) throw new Error('User not found');
      // Verify current password by attempting sign-in
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: data.currentPassword
      });
      if (verifyError) throw new Error('Current password is incorrect');
      // Update password via Supabase Auth
      const { error } = await supabase.auth.updateUser({ password: data.newPassword });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Password updated successfully" });
      setSettingsData(prev => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' }));
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update password", variant: "destructive" });
    }
  });

  // ─── Upload avatar mutation ───
  const uploadAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!user?.id) throw new Error('User not found');
      if (user.avatar_url) {
        const oldPath = user.avatar_url.split('/').pop();
        if (oldPath) await supabase.storage.from('avatars').remove([`${user.id}/${oldPath}`]);
      }
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/avatar-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
      const { error: updateError } = await supabase.rpc('update_user_profile', { p_user_id: user.id, p_avatar_url: publicUrl });
      if (updateError) throw updateError;
      return publicUrl;
    },
    onSuccess: async () => {
      toast({ title: "Success", description: "Profile image uploaded successfully", duration: 5000 });
      setAvatarFile(null);
      setAvatarPreview(null);
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ['employee_profile'] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to upload image", variant: "destructive", duration: 5000 });
    }
  });

  const processAvatarFile = (file?: File | null) => {
    if (file) {
      if (file.size > 5242880) { toast({ title: "Error", description: "Image must be less than 5MB", variant: "destructive" }); return; }
      if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) { toast({ title: "Error", description: "Only JPG, PNG, and WebP images are allowed", variant: "destructive" }); return; }
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setAvatarPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    processAvatarFile(e.target.files?.[0]);
  };

  const { isDragActive: avatarDragActive, dropzoneProps: avatarDropzone } = useFileDropzone({
    onFiles: (files) => processAvatarFile(files[0]),
    disabled: uploadAvatarMutation.isPending,
    multiple: false,
  });

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-success/10 text-success';
      case 'INACTIVE': return 'bg-destructive/10 text-destructive';
      default: return 'bg-muted text-foreground';
    }
  };

  const getLeaveType = (typeId: string) => leaveTypes.find((t: any) => t.id === typeId);

  const statusColors: Record<string, string> = {
    approved: "text-success",
    rejected: "text-destructive",
    cancelled: "text-muted-foreground",
    pending: "text-warning",
  };

  const displayName = hrEmployee
    ? fullName(hrEmployee)
    : employeeData?.name || user?.firstName && user?.lastName
      ? `${user?.firstName} ${user?.lastName}`
      : user?.username || '';

  const NoEmployeeProfile = () => (
    <ProfileEmptyState
      icon={User}
      title="Employee record not linked"
      description="Your ERP login isn't linked to an HRMS employee record yet. Profile, Tasks, Documents and Settings still work — leave, attendance and payroll will appear once HR links your record (matched by badge ID, email or phone)."
    />
  );

  // ─── Page navigation, counts and shortcuts (presentation only) ───
  const isWide = useIsWide();
  const [prefillReg, setPrefillReg] = useState<{ date?: string; nonce: number } | null>(null);
  const [leaveConfirm, setLeaveConfirm] = useState<{ kind: 'delete' | 'cancel'; req: any } | null>(null);
  // Keep the last request on screen while the confirm dialog animates out.
  const lastLeaveConfirm = useRef(leaveConfirm);
  if (leaveConfirm) lastLeaveConfirm.current = leaveConfirm;
  const shownConfirm = leaveConfirm ?? lastLeaveConfirm.current;

  const { data: teamLeaveQueue = [] } = useTeamLeaveQueue(hrEmployee?.id);
  const { data: teamRegQueue = [] } = useTeamRegQueue(hrEmployee?.id);
  const { data: openTasks = [] } = useProfileTasks('to-me', false);
  const approvalsWaiting =
    (teamLeaveQueue as any[]).filter((r) => r.status === 'requested').length +
    (teamRegQueue as any[]).filter((r) => r.status === 'manager_review').length;

  /** Switch tab and keep it in the URL, so a refresh or a shared link lands on the same section. */
  const changeTab = (value: string) => {
    setActiveTab(value);
    const next = new URLSearchParams(searchParams);
    next.set('tab', value);
    next.delete('leaveId');
    next.delete('regId');
    setSearchParams(next, { replace: true });
  };

  /** Navigate from inside a section (overview tiles, shortcuts): move focus to the new section's tab. */
  const goToTab = (value: string) => {
    changeTab(value);
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[aria-label="Profile sections"] [role="tab"][data-state="active"]')?.focus();
    });
  };

  /** Open the leave form for a NEW request (clears anything left from an earlier edit). */
  const openNewLeave = () => {
    setLeaveRequest({ leave_type_id: '', from_date: '', to_date: '', reason: '', is_half_day: false, half_day_period: 'morning' });
    setEditingLeaveId(null);
    setShowLeaveCreate(true);
  };

  /** Open the attendance-correction form on the Requests tab, optionally for a given day. */
  const requestCorrection = (date?: string) => {
    setPrefillReg({ date, nonce: Date.now() });
    changeTab('requests');
  };

  const navGroups = buildProfileNav({
    showDepartment: myDeptLines.length > 0,
    counts: { requests: approvalsWaiting, tasks: (openTasks as any[]).length },
  });

  const jobTitle = (workInfo as any)?.positions?.title || (workInfo as any)?.job_role || null;
  const deptName = (workInfo as any)?.departments?.name || null;

  const leaveRows = leaveRequests as any[];
  // Days already asked for but not yet decided — the balance below doesn't subtract them yet.
  const pendingByType: Record<string, number> = {};
  for (const r of leaveRows) {
    if (['requested', 'manager_approved'].includes(r.status)) {
      pendingByType[r.leave_type_id] = (pendingByType[r.leave_type_id] || 0) + (Number(r.total_days) || 0);
    }
  }
  const paidLeaveTypes = (leaveTypes as any[]).filter((lt) => lt.code !== 'LOP' && lt.is_paid !== false);
  const paidAvailable = paidLeaveTypes.reduce((sum, lt) => sum + (cumulativeLeaveBalances[lt.id]?.available || 0), 0);
  const paidPending = paidLeaveTypes.reduce((sum, lt) => sum + (pendingByType[lt.id] || 0), 0);

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-4 p-3 sm:space-y-5 sm:p-6">
      {/* ─── Identity header ─── */}
      <ProfileHeader
        displayName={displayName}
        avatarUrl={user?.avatar_url}
        initials={displayName ? getInitials(displayName) : 'U'}
        isActive={hrEmployee ? hrEmployee.is_active !== false : null}
        badgeId={hrEmployee?.badge_id}
        jobTitle={jobTitle}
        deptName={deptName}
        shiftName={(workInfo as any)?.shift_name}
        joiningDate={(workInfo as any)?.joining_date}
        email={user?.email}
        phone={hrEmployee?.phone}
        actions={hrEmployee ? (
          <>
            {activeTab !== 'leaves' && (
              <Button size="sm" className="gap-1.5" onClick={openNewLeave}>
                <CalendarDays className="h-4 w-4" /> Apply for leave
              </Button>
            )}
            {activeTab !== 'attendance' && activeTab !== 'requests' && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => requestCorrection()}>
                <ClipboardList className="h-4 w-4" /> Fix a punch
              </Button>
            )}
          </>
        ) : undefined}
      />

      {/* ─── Sections ─── */}
      <Tabs value={activeTab} onValueChange={changeTab} orientation={isWide ? 'vertical' : 'horizontal'} className="w-full">
        <div className="xl:grid xl:grid-cols-[228px_minmax(0,1fr)] xl:items-start xl:gap-6">
          <ProfileNav groups={navGroups} active={activeTab} />

          <div className="min-w-0">
            <TabsContent value="my-department" className="mt-4 space-y-4 xl:mt-0">
              <TabIntro title="My department" />
              {myDeptLines.length > 0 ? (
                <MyDepartmentTab lines={myDeptLines} />
              ) : deptLoading ? (
                <ProfileSkeleton rows={3} />
              ) : (
                <ProfileEmptyState icon={Building2} title="No department to manage" description="This section is for department heads." />
              )}
            </TabsContent>

            {/* ═══════ Overview (tab value "profile") ═══════ */}
            <TabsContent value="profile" className="mt-4 xl:mt-0">
              {!hrEmployee ? (
                <NoEmployeeProfile />
              ) : (
                <ProfileOverview
                  hrEmployee={hrEmployee}
                  workInfo={workInfo}
                  leaveTypes={leaveTypes as any[]}
                  balances={cumulativeLeaveBalances}
                  leaveRequests={leaveRows}
                  onNavigate={goToTab}
                  onRequestCorrection={requestCorrection}
                />
              )}
            </TabsContent>


            {/* ═══════ My Tasks Tab ═══════ */}
            <TabsContent value="tasks" className="mt-4 space-y-4 xl:mt-0">
              <TabIntro title="My tasks" />
              <UserProfileTasks />
            </TabsContent>

            {/* ═══════ Salary & PF Tab ═══════ */}
            <TabsContent value="salary" className="mt-4 space-y-4 xl:mt-0">
              {!hrEmployee ? (
                <NoEmployeeProfile />
              ) : (
                <>
                  <SalaryPFTab hrEmployee={hrEmployee} />
                  <SectionBlock title="Compensation History" icon={TrendingUp} description="Every revision to your pay, newest first">
                    <CompensationHistory employeeId={hrEmployee.id} />
                  </SectionBlock>
                </>
              )}
            </TabsContent>



            {/* ═══════ Payslips Tab ═══════ */}
            <TabsContent value="payslips" className="mt-4 xl:mt-0">
              {!hrEmployee ? (
                <NoEmployeeProfile />
              ) : (
                <EmployeePayslipsTab employeeId={hrEmployee.id} badgeId={hrEmployee.badge_id} />
              )}
            </TabsContent>

            {/* ═══════ Banking Tab ═══════ */}
            <TabsContent value="banking" className="mt-4 xl:mt-0">
              {!hrEmployee ? (
                <NoEmployeeProfile />
              ) : (
                <EmployeeBankingTab
                  employeeId={hrEmployee.id}
                  userId={user?.id}
                  holderName={[hrEmployee.first_name, hrEmployee.last_name].filter(Boolean).join(' ')}
                />
              )}
            </TabsContent>

            {/* ═══════ Leaves Tab ═══════ */}
            <TabsContent value="leaves" className="mt-4 space-y-4 xl:mt-0">
              {!hrEmployee ? (
                <NoEmployeeProfile />
              ) : (
                <>
                  <TabIntro
                    title="Leave"
                    description={`${fmtDays(paidAvailable)} day${paidAvailable === 1 ? '' : 's'} of paid leave left${paidPending > 0 ? ` · ${fmtDays(paidPending)} day${paidPending === 1 ? '' : 's'} waiting for approval` : ''}`}
                    actions={
                      <Button size="sm" className="gap-1.5" onClick={openNewLeave}>
                        <Plus className="h-4 w-4" /> Apply for leave
                      </Button>
                    }
                  />

                  {/* ─── Leave Balances ─── */}
                  {leaveTypes.length === 0 ? (
                    <p className="t-secondary ds-panel p-4">No leave types configured. Contact HR.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                      {leaveTypes.map((lt: any) => {
                        const bal = cumulativeLeaveBalances[lt.id];
                        const allocated = bal?.totalAllocated || 0;
                        const used = bal?.totalUsed || 0;
                        const available = bal?.available || 0;
                        const unpaid = lt.code === 'LOP' || lt.is_paid === false;
                        return (
                          <StatTile
                            key={lt.id}
                            accent={lt.color || undefined}
                            label={<span className="normal-case tracking-normal text-[12px] font-semibold text-foreground">{lt.name}{lt.code ? <span className="ml-1.5 font-mono text-[11px] font-medium text-muted-foreground">{lt.code}</span> : null}</span>}
                            value={unpaid ? <span className="text-muted-foreground">—</span> : <>{fmtDays(available)} <span className="text-sm font-semibold text-muted-foreground">day{available === 1 ? '' : 's'} left</span></>}
                            sub={unpaid
                              ? `Unpaid — no balance needed${used ? ` · ${fmtDays(used)} taken` : ''}`
                              : `${fmtDays(allocated)} allocated · ${fmtDays(used)} taken`}
                          >
                            {!unpaid && (pendingByType[lt.id] || 0) > 0 && (
                              <p className="mt-1 text-xs font-medium text-warning">
                                {fmtDays(pendingByType[lt.id])} day{pendingByType[lt.id] === 1 ? '' : 's'} waiting for approval — not taken off yet
                              </p>
                            )}
                          </StatTile>
                        );
                      })}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-4 min-[1440px]:grid-cols-3">
                    {/* ─── Leave Requests ─── */}
                    <SectionBlock
                      className="min-[1440px]:col-span-2"
                      title="My leave requests"
                      icon={CalendarDays}
                      description={leaveRows.length > 0 ? `${leaveRows.length} request${leaveRows.length === 1 ? '' : 's'}, newest first` : undefined}
                      flush
                    >
                      {leaveRows.length === 0 ? (
                        <ProfileEmptyState
                          bare
                          icon={CalendarDays}
                          title="No leave requests yet"
                          description='Use "Apply for leave" to ask for time off.'
                        />
                      ) : (
                        <ul className="divide-y divide-border">
                          {leaveRows.map((req: any) => {
                            const lt = getLeaveType(req.leave_type_id);
                            const isCancellable = ['requested', 'manager_approved', 'approved'].includes(req.status);
                            const isEditable = req.status === 'requested';
                            const stage = leaveStage(req.status, req.manager_status);
                            const unpaidDays = Number(req.unpaid_days) || 0;
                            return (
                              <li key={req.id} className="flex flex-col gap-2 px-3.5 py-3 sm:flex-row sm:items-start sm:gap-4">
                                <div className="flex min-w-0 flex-1 gap-3">
                                  <span
                                    className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: lt?.color || 'hsl(var(--muted-foreground))' }}
                                    aria-hidden
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                      <span className="text-[13px] font-semibold text-foreground">{lt?.name || 'Unknown'}</span>
                                      <StatusPill tone={stage.tone}>{stage.label}</StatusPill>
                                    </div>
                                    <p className="mt-0.5 text-[13px] text-foreground">
                                      {fmtRange(req.start_date, req.end_date)}
                                      <span className="text-muted-foreground">
                                        {' · '}{fmtDays(req.total_days)} day{Number(req.total_days) === 1 ? '' : 's'}
                                        {req.is_half_day ? ` · ${req.half_day_period === 'afternoon' ? 'second half' : 'first half'}` : ''}
                                      </span>
                                    </p>
                                    {req.reason && <p className="t-secondary mt-1">“{req.reason}”</p>}
                                    {req.status === 'rejected' && req.rejection_reason && (
                                      <p className="mt-1 text-xs text-destructive">Reason for rejection: {req.rejection_reason}</p>
                                    )}
                                    {req.manager_remarks && req.manager_remarks !== req.rejection_reason && (
                                      <p className="mt-1 text-xs text-muted-foreground">Manager: {req.manager_remarks}</p>
                                    )}
                                    {req.status === 'approved' && unpaidDays > 0 && (
                                      <p className="mt-1 text-xs text-warning">{fmtDays(Number(req.paid_days) || 0)} day(s) paid · {fmtDays(unpaidDays)} unpaid</p>
                                    )}
                                  </div>
                                </div>
                                {(isEditable || isCancellable) && (
                                  <div className="flex shrink-0 items-center gap-1.5 pl-[22px] sm:pl-0">
                                    {isEditable && (
                                      <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-muted-foreground hover:text-foreground"
                                        onClick={() => {
                                          setLeaveRequest({
                                            leave_type_id: req.leave_type_id,
                                            from_date: req.start_date,
                                            to_date: req.end_date,
                                            reason: req.reason || '',
                                            is_half_day: !!req.is_half_day,
                                            half_day_period: req.half_day_period || 'morning',
                                          });
                                          setEditingLeaveId(req.id);
                                          setShowLeaveCreate(true);
                                        }}
                                      >
                                        <Pencil className="h-3.5 w-3.5" /> Edit
                                      </Button>
                                    )}
                                    {isEditable && (
                                      <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-destructive hover:text-destructive"
                                        onClick={() => setLeaveConfirm({ kind: 'delete', req })}
                                        disabled={deleteLeaveRequestMutation.isPending}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" /> Delete
                                      </Button>
                                    )}
                                    {isCancellable && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 gap-1 text-xs"
                                        onClick={() => setLeaveConfirm({ kind: 'cancel', req })}
                                        disabled={cancelLeaveMutation.isPending}
                                      >
                                        <XCircle className="h-3.5 w-3.5" /> Cancel
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </SectionBlock>

                    <div className="min-w-0 space-y-4">
                      <OrgLeaveCalendarCard />
                      <UpcomingHolidaysCard />
                    </div>
                  </div>
                </>
              )}
            </TabsContent>

            {/* ═══════ Requests Tab ═══════ */}
            <TabsContent value="requests" className="mt-4 space-y-4 xl:mt-0">
              {!hrEmployee ? (
                <NoEmployeeProfile />
              ) : (
                <>
                  <TabIntro
                    title="Requests"
                    description={approvalsWaiting > 0
                      ? `${approvalsWaiting} request${approvalsWaiting === 1 ? '' : 's'} from your team ${approvalsWaiting === 1 ? 'needs' : 'need'} your decision. Your own requests are below.`
                      : 'Everything you have asked for — leave, attendance corrections and bank changes — and where it stands.'}
                  />
                  <TeamLeaveApprovals
                    employeeId={hrEmployee.id}
                    highlightedRequestId={searchParams.get('leaveId')}
                  />
                  <TeamRegularizationApprovals
                    employeeId={hrEmployee.id}
                    highlightedRequestId={searchParams.get('regId')}
                  />
                  <MyRequestsHub
                    employeeId={hrEmployee.id}
                    userId={user?.id}
                    defaultHolderName={[hrEmployee.first_name, hrEmployee.last_name].filter(Boolean).join(' ')}
                    openRegularization={prefillReg}
                    onRegularizationOpened={() => setPrefillReg(null)}
                  />
                </>
              )}
            </TabsContent>

            {/* ═══════ Documents Tab ═══════ */}
            <TabsContent value="documents" className="mt-4 xl:mt-0">
              {!hrEmployee ? (
                <NoEmployeeProfile />
              ) : (
                <EmployeeDocumentsTab employeeId={hrEmployee.id} />
              )}
            </TabsContent>

            {/* ═══════ Assets Tab ═══════ */}
            <TabsContent value="assets" className="mt-4 space-y-4 xl:mt-0">
              {!hrEmployee ? (
                <NoEmployeeProfile />
              ) : (
                <>
                  <TabIntro title="Assets" />
                  <MyAssetsTab employeeId={hrEmployee.id} />
                </>
              )}
            </TabsContent>



            {/* ═══════ Attendance Tab ═══════ */}
            <TabsContent value="attendance" className="mt-4 xl:mt-0">
              {!hrEmployee ? (
                <NoEmployeeProfile />
              ) : (
                <AttendanceTab employeeId={hrEmployee.id} onRequestCorrection={requestCorrection} />
              )}
            </TabsContent>

            {/* ═══════ Settings Tab ═══════ */}
            <TabsContent value="settings" className="mt-4 space-y-4 xl:mt-0">
              <TabIntro title="Settings" />

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <SectionBlock title="Profile photo" icon={Camera} description="Shown in the menu, on tasks and to your team">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <Avatar className="h-20 w-20 shrink-0 border-2 border-border">
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="Preview" className="object-cover w-full h-full" />
                      ) : user?.avatar_url ? (
                        <img src={user.avatar_url} alt="Profile" className="object-cover w-full h-full" />
                      ) : (
                        <AvatarFallback className="bg-primary/10 text-2xl font-bold text-primary">
                          {displayName ? getInitials(displayName) : 'U'}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="flex-1 min-w-0 space-y-2">
                      <Label htmlFor="avatar" className="text-xs">Upload New Image</Label>
                      <div {...avatarDropzone} className={cn("rounded-md transition-colors", avatarDragActive && "ring-2 ring-primary bg-primary/10 p-1")}>
                        <Input id="avatar" type="file" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={handleAvatarChange} disabled={uploadAvatarMutation.isPending} />
                      </div>
                      <p className="text-xs text-muted-foreground">JPG, PNG or WebP. Max size 5MB. You can also drop an image here.</p>
                    </div>
                  </div>
                  {avatarFile && (
                    <div className="mt-4 flex gap-2">
                      <Button onClick={() => { toast({ title: "Processing...", description: "Uploading profile image...", duration: 3000 }); uploadAvatarMutation.mutate(avatarFile); }} disabled={uploadAvatarMutation.isPending} className="flex-1">
                        {uploadAvatarMutation.isPending ? 'Uploading...' : 'Upload Image'}
                      </Button>
                      <Button variant="outline" onClick={() => { setAvatarFile(null); setAvatarPreview(null); }} disabled={uploadAvatarMutation.isPending}>Cancel</Button>
                    </div>
                  )}
                </SectionBlock>

                <SectionBlock title="Username" icon={User} description="Used to sign in together with your password">
                  <div className="space-y-3">
                    <div className="space-y-1.5"><Label className="text-xs">Current Username</Label><Input value={user?.username || ''} disabled /></div>
                    <div className="space-y-1.5"><Label htmlFor="newUsername" className="text-xs">New Username</Label><Input id="newUsername" value={settingsData.newUsername} onChange={(e) => setSettingsData(prev => ({ ...prev, newUsername: e.target.value }))} placeholder="Enter new username" /></div>
                    <Button onClick={() => {
                      if (!settingsData.newUsername.trim()) { toast({ title: "Error", description: "Please enter a new username", variant: "destructive", duration: 5000 }); return; }
                      if (settingsData.newUsername === user?.username) { toast({ title: "Error", description: "New username must be different", variant: "destructive", duration: 5000 }); return; }
                      toast({ title: "Processing...", description: "Updating username...", duration: 3000 });
                      updateUsernameMutation.mutate(settingsData.newUsername);
                    }} disabled={updateUsernameMutation.isPending} className="w-full sm:w-auto">
                      {updateUsernameMutation.isPending ? 'Updating...' : 'Update Username'}
                    </Button>
                  </div>
                </SectionBlock>

                <SectionBlock title="Password" icon={KeyRound} description="Reset with a one-time code sent to your registered email">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">
                      We email a verification code to <span className="font-medium text-foreground">{user?.email || 'your registered email'}</span>.
                    </p>
                    <Button onClick={() => setShowResetPassword(true)} className="shrink-0">
                      Reset Password
                    </Button>
                  </div>
                </SectionBlock>

                <SectionBlock title="AI Assistant" icon={Bot}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="assistant-toggle" className="text-sm">Floating AI assistant</Label>
                      <p className="text-xs text-muted-foreground">
                        Shows the assistant mascot button in the corner of every page. Turning it off hides it on this device — you can still open the assistant from the menu.
                      </p>
                    </div>
                    <Switch
                      id="assistant-toggle"
                      checked={assistantEnabled}
                      onCheckedChange={(v) => {
                        setHelpAssistantEnabled(v);
                        toast({ title: v ? 'AI assistant enabled' : 'AI assistant disabled', duration: 2500 });
                      }}
                    />
                  </div>
                </SectionBlock>

                {user?.id && <MySecurityCard userId={user.id} badgeId={hrEmployee?.badge_id} />}

                {/* Session */}
                <SectionBlock title="Log out" icon={LogOut} className="!border-destructive/30">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">Sign out of your account on this device. You will need to log in again.</p>
                    <Button
                      variant="destructive"
                      className="sm:w-auto w-full shrink-0"
                      onClick={() => { logout(); navigate('/'); }}
                    >
                      <LogOut className="h-4 w-4 mr-2" /> Log Out
                    </Button>
                  </div>
                </SectionBlock>
              </div>
            </TabsContent>

            {/* ═══════ Policies Tab ═══════ */}
            <TabsContent value="policies" className="mt-4 space-y-4 xl:mt-0">
              <TabIntro title="Policies" />
              {user?.id && <MyPoliciesCard userId={user.id} />}
            </TabsContent>

            {/* ═══════ Helpdesk Tab ═══════ */}
            <TabsContent value="helpdesk" className="mt-4 space-y-4 xl:mt-0">
              <TabIntro title="Help desk" />
              {user?.id && <MyHelpdeskCard userId={user.id} />}
            </TabsContent>
          </div>
        </div>
      </Tabs>

      {/* ─── Leave form (opened from the header, the overview and the Leave tab) ─── */}
      <Dialog open={showLeaveCreate} onOpenChange={setShowLeaveCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingLeaveId ? 'Edit leave request' : 'New Leave Request'}</DialogTitle>
            <DialogDescription>Your manager reviews it first, then HR gives the final approval.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Leave Type *</Label>
              <Select value={leaveRequest.leave_type_id} onValueChange={(v) => setLeaveRequest(prev => ({ ...prev, leave_type_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select leave type" /></SelectTrigger>
                <SelectContent>
                  {leaveTypes.map((lt: any) => (
                    <SelectItem key={lt.id} value={lt.id}>
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: lt.color || '#888' }} />
                        {lt.name}
                        {cumulativeLeaveBalances[lt.id] && lt.code !== 'LOP' && (
                          <span className="text-xs text-muted-foreground">· {fmtDays(cumulativeLeaveBalances[lt.id].available)} left</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="profile-half-day"
                checked={leaveRequest.is_half_day}
                onCheckedChange={(c) => setLeaveRequest(prev => ({ ...prev, is_half_day: !!c }))}
              />
              <Label htmlFor="profile-half-day" className="cursor-pointer">Half day</Label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <Label>{leaveRequest.is_half_day ? 'Date *' : 'Start Date *'}</Label>
                <Input type="date" value={leaveRequest.from_date} onChange={(e) => setLeaveRequest(prev => ({ ...prev, from_date: e.target.value }))} />
              </div>
              {leaveRequest.is_half_day ? (
                <div className="min-w-0">
                  <Label>Session *</Label>
                  <Select value={leaveRequest.half_day_period} onValueChange={(v) => setLeaveRequest(prev => ({ ...prev, half_day_period: v as 'morning' | 'afternoon' }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="morning">First half (morning)</SelectItem>
                      <SelectItem value="afternoon">Second half (afternoon)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="min-w-0">
                  <Label>End Date *</Label>
                  <Input type="date" value={leaveRequest.to_date} onChange={(e) => setLeaveRequest(prev => ({ ...prev, to_date: e.target.value }))} />
                </div>
              )}
            </div>
            <div>
              <Label>Reason</Label>
              <Textarea value={leaveRequest.reason} onChange={(e) => setLeaveRequest(prev => ({ ...prev, reason: e.target.value }))} placeholder="Enter reason for leave" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLeaveCreate(false)}>Cancel</Button>
            <Button
              onClick={() => applyLeaveMutation.mutate(leaveRequest)}
              disabled={applyLeaveMutation.isPending || !leaveRequest.leave_type_id || !leaveRequest.from_date || (!leaveRequest.is_half_day && !leaveRequest.to_date)}
            >
              {applyLeaveMutation.isPending ? 'Submitting...' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Confirm delete / cancel of a leave request ─── */}
      <AlertDialog open={!!leaveConfirm} onOpenChange={(o) => { if (!o) setLeaveConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{shownConfirm?.kind === 'delete' ? 'Delete this leave request?' : 'Cancel this leave?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {shownConfirm?.req
                ? `${getLeaveType(shownConfirm.req.leave_type_id)?.name || 'Leave'} · ${fmtRange(shownConfirm.req.start_date, shownConfirm.req.end_date)}. `
                : ''}
              {shownConfirm?.kind === 'delete'
                ? 'It has not been decided yet, so it is removed from your list.'
                : shownConfirm?.req?.status === 'approved'
                  ? 'It is already approved — cancelling gives the days back to your balance.'
                  : 'It is withdrawn and no longer waits for approval.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const c = leaveConfirm;
                if (!c) return;
                if (c.kind === 'delete') deleteLeaveRequestMutation.mutate(c.req.id);
                else cancelLeaveMutation.mutate({ requestId: c.req.id, wasApproved: c.req.status === 'approved' });
                setLeaveConfirm(null);
              }}
            >
              {shownConfirm?.kind === 'delete' ? 'Delete' : 'Cancel leave'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ForgotPasswordDialog
        open={showResetPassword}
        onOpenChange={setShowResetPassword}
        defaultEmail={user?.email || ''}
      />
    </div>
  );
}
