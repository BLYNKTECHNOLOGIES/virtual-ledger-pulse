import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useFileDropzone } from '@/hooks/useFileDropzone';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { PayslipPdfDownloadButton } from '@/components/hrms/PayslipPdfDownloadButton';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { ForgotPasswordDialog } from '@/components/auth/ForgotPasswordDialog';
import { 
  User, 
  Building2, 
  Calendar, 
  IndianRupee, 
  TrendingUp, 
  CreditCard, 
  Shield, 
  Clock,
  FileText,
  PlusCircle,
  Settings,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Users,
  DollarSign,
  Receipt,
  Timer,
  Wallet,

  CalendarDays,
  Target,
  Upload,
  Plus,
  Pencil,
  Trash2,
  LogOut
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { toast as sonnerToast } from 'sonner';
import { UserProfileTasks } from '@/components/tasks/UserProfileTasks';
import AttendanceTab from '@/components/profile/AttendanceTab';
import MyAssetsTab from '@/components/profile/MyAssetsTab';
import MyLoansCard from '@/components/profile/MyLoansCard';
import OrgLeaveCalendarCard from '@/components/profile/OrgLeaveCalendarCard';

import MyRequestsHub from '@/components/profile/MyRequestsHub';
import TeamLeaveApprovals from '@/components/profile/TeamLeaveApprovals';
import TeamRegularizationApprovals from '@/components/profile/TeamRegularizationApprovals';
import MyTeamCard from '@/components/profile/MyTeamCard';
import MyAnnouncementsCard from '@/components/profile/MyAnnouncementsCard';
import MyMilestonesCard from '@/components/profile/MyMilestonesCard';
import MyPoliciesCard from '@/components/profile/MyPoliciesCard';
import MyHelpdeskCard from '@/components/profile/MyHelpdeskCard';
import MySecurityCard from '@/components/profile/MySecurityCard';
import { AnnouncementsBanner } from '@/components/hrms/AnnouncementsBanner';
import { UpcomingHolidaysCard } from '@/components/hrms/UpcomingHolidaysCard';
import { CompensationHistory } from '@/components/hrms/CompensationHistory';
import { useCanonicalPayslips } from '@/hooks/hrms/usePayslips';
import { formatDistanceToNow } from 'date-fns';


interface BankAccount {
  id: string;
  account_name: string;
  account_number: string;
  bank_name: string;
  IFSC?: string;
  branch?: string;
}

// ─── Employee Banking Sub-Component (HRMS bank details) ───
function EmployeeBankingTab({ employeeId }: { employeeId: string }) {
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

  if (isLoading) return <p className="text-muted-foreground text-sm py-8 text-center">Loading bank details...</p>;

  if (bankDetails.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No Bank Details Found</h3>
          <p className="text-muted-foreground">Your salary bank details have not been added by HR yet. Please contact HR.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Salary Bank Account</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {bankDetails.map((bank: any) => (
          <Card key={bank.id}>
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-success/10 rounded-lg"><CreditCard className="h-5 w-5 text-success" /></div>
                <div>
                  <h4 className="font-semibold text-foreground">{bank.bank_name || 'Bank'}</h4>
                  {bank.branch && <p className="text-sm text-muted-foreground">{bank.branch}</p>}
                </div>
              </div>
              <div className="space-y-2 text-sm">
                {bank.account_number && (
                  <div className="flex justify-between border-b border-border/50 pb-2">
                    <span className="text-muted-foreground">Account Number</span>
                    <span className="font-mono font-medium">{bank.account_number}</span>
                  </div>
                )}
                {bank.ifsc_code && (
                  <div className="flex justify-between border-b border-border/50 pb-2">
                    <span className="text-muted-foreground">IFSC Code</span>
                    <span className="font-mono font-medium">{bank.ifsc_code}</span>
                  </div>
                )}
                {bank.bank_code_2 && (
                  <div className="flex justify-between border-b border-border/50 pb-2">
                    <span className="text-muted-foreground">Bank Code 2</span>
                    <span className="font-mono font-medium">{bank.bank_code_2}</span>
                  </div>
                )}
                {bank.city && (
                  <div className="flex justify-between border-b border-border/50 pb-2">
                    <span className="text-muted-foreground">City</span>
                    <span className="font-medium">{bank.city}</span>
                  </div>
                )}
                {bank.state && (
                  <div className="flex justify-between border-b border-border/50 pb-2">
                    <span className="text-muted-foreground">State</span>
                    <span className="font-medium">{bank.state}</span>
                  </div>
                )}
                {bank.country && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Country</span>
                    <span className="font-medium">{bank.country}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Salary & PF Sub-Component ───────────────────────────────────────────────
// RazorpayX is the primary authority for salary. We mirror the assigned
// structure into `hr_employee_salary_structures` per employee. This tab reads
// that mirror (never a local template) so the employee always sees exactly
// what RazorpayX will pay. Falls back to CTC-only when the mirror is empty.
function SalaryPFTab({ hrEmployee }: { hrEmployee: any }) {
  const annualCTC = Number(hrEmployee?.total_salary) || 0;
  const monthlyCTC = annualCTC / 12;

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
    const annual = rupees ? toAnnual(raw) : 0;
    return (
      <div key={r.id} className="flex justify-between items-center border-b border-border/50 pb-2 gap-3">
        <Label className={tone === 'ded' ? 'text-destructive' : 'text-[#00bcd4]'}>
          {r.hr_salary_components?.name || '—'}
        </Label>
        {rupees ? (
          <div className="text-right tabular-nums">
            <div className={`text-sm font-semibold ${tone === 'ded' ? 'text-destructive' : ''}`}>
              {tone === 'ded' ? '-' : ''}{fmt(monthly)} <span className="text-[10px] text-muted-foreground font-normal">/mo</span>
            </div>
          </div>
        ) : (
          <span className="text-base font-semibold">{raw}%</span>
        )}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Salary Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IndianRupee className="h-5 w-5" />
            Salary Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 p-3 rounded-md border border-border/60 bg-muted/30">
              <Label className="text-[#00bcd4] text-xs">Annual CTC</Label>
              <div className="text-lg font-bold text-success">{fmt(annualCTC)}</div>
            </div>
            <div className="space-y-1 p-3 rounded-md border border-border/60 bg-muted/30">
              <Label className="text-[#00bcd4] text-xs">Monthly CTC</Label>
              <div className="text-lg font-bold text-success">{fmt(monthlyCTC)}</div>
            </div>
          </div>

          <Separator />

          {isLoading ? (
            <p className="text-muted-foreground text-sm">Loading salary structure…</p>
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center space-y-1">
              <p className="font-medium text-foreground">Component breakdown not published yet</p>
              <p>Your CTC above is what payroll will pay. The component-wise breakdown appears here once HR publishes it.</p>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Earnings</p>
                  <p className="text-[10px] text-muted-foreground">monthly</p>
                </div>
                {earnings.map((r) => renderRow(r, 'earn'))}
                <div className="flex justify-between items-center pt-2 text-sm">
                  <span className="text-muted-foreground">Gross Earnings</span>
                  <span className="tabular-nums font-semibold">{fmt(monthlyEarnings)} <span className="text-[10px] text-muted-foreground font-normal">/mo</span></span>
                </div>
              </div>

              {deductions.length > 0 && (
                <div className="space-y-1 pt-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Deductions</p>
                  {deductions.map((r) => renderRow(r, 'ded'))}
                  <div className="flex justify-between items-center pt-2 text-sm">
                    <span className="text-muted-foreground">Total Deductions</span>
                    <span className="tabular-nums font-semibold text-destructive">-{fmt(monthlyDeductions)} <span className="text-[10px] text-muted-foreground font-normal">/mo</span></span>
                  </div>
                </div>
              )}

              <Separator />
              <div className="flex justify-between items-center pt-1">
                <Label className="text-base font-bold">Net Pay (approx)</Label>
                <div className="text-right">
                  <div className="text-xl font-bold text-success tabular-nums">{fmt(monthlyNet)} <span className="text-xs text-muted-foreground font-normal">/mo</span></div>
                </div>
              </div>

              {hasDrift && (
                <div className="text-[11px] rounded-md border border-warning/40 bg-warning/10 text-warning-foreground p-2">
                  Heads up — component sum ({fmt(annualEarnings)}) differs from CTC on record ({fmt(annualCTC)}) by {(ctcDriftPct * 100).toFixed(1)}%. HR has been notified to reconcile this.
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Loans, Salary Advances & Deposits */}
      <MyLoansCard employeeId={hrEmployee.id} showDeposits />

    </div>
  );
}


// ─── Employee Payslips Sub-Component (ESS — canonical hr_payslips_v) ───
// R7 doctrine: RazorpayX is the canonical payslip source. We read from
// hr_payslips_v (a view over hr_razorpay_payslip_records) and deep-link into
// the RazorpayX dashboard for the PDF binary — the RazorpayX API does not
// expose PDFs, so a fake "Download" button would be dishonest.
function EmployeePayslipsTab({ employeeId, badgeId }: { employeeId: string; badgeId?: string | number | null }) {
  // ESS reads its own payslips through a security-definer RPC (hr_my_payslips),
  // which resolves every HR employee row linked to the signed-in user (including
  // legacy/biometric duplicates sharing the same badge). Falls back to the
  // canonical view query if the RPC is unavailable.
  const { data: payslips = [], isLoading, error } = useQuery({
    queryKey: ['ess_my_payslips', employeeId, badgeId],
    queryFn: async () => {
      const { data, error: rpcError } = await (supabase as any).rpc('hr_my_payslips');
      if (!rpcError && data) return data as any[];
      const { data: viaView, error: viewError } = await (supabase as any)
        .from('hr_payslips_v')
        .select('*')
        .eq('employee_id', employeeId)
        .order('period_month', { ascending: false });
      if (viewError) throw rpcError ?? viewError;
      return (viaView ?? []) as any[];
    },
  });

  if (isLoading) return <p className="text-muted-foreground text-sm py-8 text-center">Loading payslips...</p>;

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-destructive">
          Could not load your payslips: {(error as any)?.message ?? 'unknown error'}
        </CardContent>
      </Card>
    );
  }


  if (payslips.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No Payslips Yet</h3>
          <p className="text-muted-foreground">
            Your payslips will appear here once payroll for the month is processed.
          </p>
        </CardContent>
      </Card>
    );
  }

  const fmt = (n: number | null | undefined) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

  const Row = ({ label, value, tone }: { label: string; value: number | null | undefined; tone?: 'neg' }) => (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-sm text-muted-foreground truncate">{label}</span>
      <span className={`text-sm font-medium tabular-nums ${tone === 'neg' ? 'text-destructive' : 'text-foreground'}`}>
        {tone === 'neg' ? '− ' : ''}{fmt(value)}
      </span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">My Payslips</h3>
          <p className="text-[11px] text-muted-foreground max-w-2xl">
            Statutory splits (PF / ESI / PT / TDS) and component-wise pay are published by HR after the payroll
            run. Months not yet published show only the net figure and are marked <b>breakdown pending</b>.
          </p>
        </div>
      </div>

      <div className="space-y-4">
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

          return (
            <Card key={p.id} className="overflow-hidden border-border/70 shadow-sm">
              {/* Header band */}
              <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-4 bg-muted/40 border-b border-border/60">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-semibold text-foreground text-base">{period}</h4>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-medium ${hasReg ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning-foreground'}`}>
                      {hasReg ? 'Detailed' : 'Breakdown pending'}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Salary slip{p.working_days ? ` · ${p.working_days} working days` : ''}
                    {p.pulled_at ? ` · updated ${formatDistanceToNow(new Date(p.pulled_at), { addSuffix: true })}` : ''}
                  </p>
                </div>
                <PayslipPdfDownloadButton storagePath={p.pdf_storage_path} periodMonth={p.period_month} />
              </div>

              <CardContent className="p-5 space-y-5">
                {/* Net pay hero + summary */}
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] items-center rounded-xl border border-border/60 bg-gradient-to-r from-primary/5 to-transparent px-4 py-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Net pay credited</p>
                    <p className="text-3xl font-bold tabular-nums text-foreground mt-0.5">{fmt(p.net)}</p>
                  </div>
                  <div className="flex items-center gap-6 sm:gap-8">
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Gross</p>
                      <p className="text-base font-semibold tabular-nums">{fmt(p.gross)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Deductions</p>
                      <p className="text-base font-semibold tabular-nums text-destructive">
                        {hasReg ? `− ${fmt(netDeductions)}` : '—'}
                      </p>
                    </div>
                  </div>
                </div>

                {hasReg ? (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-lg border border-border/60 p-4">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Earnings</p>
                        {earnings.length > 0 ? earnings.map(([k, v]) => <Row key={k} label={k} value={v} />) : (
                          <p className="text-sm text-muted-foreground">No component-wise earnings published.</p>
                        )}
                        <div className="flex items-baseline justify-between pt-2.5 mt-1 border-t border-border">
                          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total earnings</span>
                          <span className="text-sm font-semibold tabular-nums">{fmt(p.gross)}</span>
                        </div>
                      </div>

                      <div className="rounded-lg border border-border/60 p-4">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Deductions</p>
                        {deductions.length > 0 ? deductions.map(([k, v]) => <Row key={k} label={k} value={v} tone="neg" />) : (
                          <p className="text-sm text-muted-foreground">No deductions this month.</p>
                        )}
                        <div className="flex items-baseline justify-between pt-2.5 mt-1 border-t border-border">
                          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total deductions</span>
                          <span className="text-sm font-semibold tabular-nums text-destructive">− {fmt(netDeductions)}</span>
                        </div>
                      </div>
                    </div>

                    {oneTimeHeads.length > 0 && (
                      <div className="rounded-lg border border-border/60 p-4">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Paid separately</p>
                        <div className="grid gap-x-6 sm:grid-cols-2">
                          {oneTimeHeads.map((l) => <Row key={l.label} label={l.label} value={l.amount} />)}
                        </div>
                      </div>
                    )}

                    {(oneTimeRecovery > 0 || Number(p.employer_pf) > 0 || Number(p.employer_esi) > 0) && (
                      <div className="space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
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
                  <div className="text-xs text-muted-foreground bg-muted/40 border border-border/60 rounded-lg p-4">
                    The detailed breakdown for this month has not been published yet, so component-wise
                    Basic / HRA / PF / ESI / PT / TDS values aren't available. Only the summary figures are
                    shown. HR will publish the full breakdown after the payroll run is finalised.
                  </div>
                )}
              </CardContent>
            </Card>
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
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!employeeId,
  });

  if (isLoading) return <p className="text-muted-foreground text-sm py-8 text-center">Loading documents…</p>;

  if (docs.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No Documents Yet</h3>
          <p className="text-muted-foreground">Your HR-uploaded documents (offer letter, ID proofs, policies, certificates) will appear here.</p>
        </CardContent>
      </Card>
    );
  }

  const typeLabel = (t: string) => (t || 'document').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">My Documents</h3>
        <Badge variant="outline">{docs.length} file{docs.length === 1 ? '' : 's'}</Badge>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {docs.map((doc: any) => (
          <Card key={doc.id} className="hover:border-primary/40 transition-colors">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 bg-info/10 rounded-lg shrink-0">
                <FileText className="h-6 w-6 text-info" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{doc.document_name || typeLabel(doc.document_type)}</p>
                <p className="text-xs text-muted-foreground">
                  {typeLabel(doc.document_type)}
                  {doc.uploaded_at ? ` • ${formatDistanceToNow(new Date(doc.uploaded_at), { addSuffix: true })}` : ''}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {doc.is_verified ? (
                    <Badge variant="outline" className="text-success border-success/40 text-[10px]">Verified</Badge>
                  ) : (
                    <Badge variant="outline" className="text-warning border-warning/40 text-[10px]">Pending Verification</Badge>
                  )}
                </div>
              </div>
              {doc.file_url ? (
                <Button asChild variant="outline" size="sm">
                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer">View</a>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>Unavailable</Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground text-center pt-2">
        Need a new document uploaded or a certificate? Contact HR.
      </p>
    </div>
  );
}

export default function UserProfile() {

  const { user, refreshUser, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('profile');

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) setActiveTab(tab);
  }, [searchParams]);

  const [isEditingBank, setIsEditingBank] = useState(false);
  const [newBankAccount, setNewBankAccount] = useState({
    account_name: '', account_number: '', bank_name: '', ifsc_code: '', branch: ''
  });
  const [leaveRequest, setLeaveRequest] = useState({
    leave_type_id: '', from_date: '', to_date: '', reason: ''
  });
  const [settingsData, setSettingsData] = useState({
    newUsername: '', currentPassword: '', newPassword: '', confirmPassword: ''
  });
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


      // Fetch user record for fallback keys
      const { data: u } = await supabase
        .from('users')
        .select('badge_id, email, phone')
        .eq('id', user.id)
        .maybeSingle();

      const tryMatch = async (col: string, val: string | null | undefined) => {
        if (!val) return null;
        const { data } = await (supabase as any)
          .from('hr_employees').select('*').eq(col, val).limit(2);
        return data && data.length === 1 ? data[0] : null; // only auto-match if unambiguous
      };

      const byBadge = await tryMatch('badge_id', u?.badge_id);
      if (byBadge) return { employee: byBadge, matchedVia: 'badge_id' };
      const byEmail = await tryMatch('email', u?.email);
      if (byEmail) return { employee: byEmail, matchedVia: 'email' };
      const byPhone = await tryMatch('phone', u?.phone);
      if (byPhone) return { employee: byPhone, matchedVia: 'phone' };

      return { employee: null, matchedVia: null };
    },
    enabled: !!user?.id,
  });

  // Auto-heal: if we resolved the employee via a fallback (badge/email/phone)
  // silently backfill hr_employees.user_id so this only happens once. The
  // employee should never see linkage warnings — that's an HR-internal detail.
  useEffect(() => {
    const emp = employeeResolution?.employee;
    const via = employeeResolution?.matchedVia;
    if (!emp || !user?.id || !via || via === 'user_id' || emp.user_id) return;
    (async () => {
      try {
        await (supabase as any)
          .from('hr_employees')
          .update({ user_id: user.id })
          .eq('id', emp.id)
          .is('user_id', null);
      } catch { /* best-effort; HR can fix manually */ }
    })();
  }, [employeeResolution, user?.id]);


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
          .select('name')
          .eq('id', data.shift_id)
          .maybeSingle();
        shiftName = shiftData?.name || null;
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

  // Compute cumulative balances per leave type
  const cumulativeLeaveBalances = (() => {
    const map: Record<string, { totalAllocated: number; totalUsed: number }> = {};
    for (const a of leaveAllocations) {
      const ltId = a.leave_type_id;
      if (!map[ltId]) map[ltId] = { totalAllocated: 0, totalUsed: 0 };
      map[ltId].totalAllocated += Number(a.allocated_days || 0);
      map[ltId].totalUsed += Number(a.used_days || 0);
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
      if (!req.leave_type_id || !req.from_date || !req.to_date) throw new Error('Please fill all required fields');

      const start = new Date(req.from_date);
      const end = new Date(req.to_date);
      if (end < start) throw new Error('End date must be after start date');
      const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      const { error } = await supabase.from('hr_leave_requests').insert({
        employee_id: hrEmployee.id,
        leave_type_id: req.leave_type_id,
        start_date: req.from_date,
        end_date: req.to_date,
        total_days: totalDays,
        reason: req.reason || null,
        status: 'pending',
      });
      if (error) throw error;
      // If editing, update instead of insert
      if (editingLeaveId) {
        const { error } = await (supabase as any).from('hr_leave_requests').update({
          leave_type_id: req.leave_type_id,
          start_date: req.from_date,
          end_date: req.to_date,
          total_days: totalDays,
          reason: req.reason || null,
        }).eq('id', editingLeaveId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('hr_leave_requests').insert({
          employee_id: hrEmployee.id,
          leave_type_id: req.leave_type_id,
          start_date: req.from_date,
          end_date: req.to_date,
          total_days: totalDays,
          reason: req.reason || null,
          status: 'pending',
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      sonnerToast.success(editingLeaveId ? 'Leave request updated' : 'Leave request submitted successfully');
      setLeaveRequest({ leave_type_id: '', from_date: '', to_date: '', reason: '' });
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
      toast({ title: "✅ Success!", description: "Password updated successfully" });
      setSettingsData(prev => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' }));
    },
    onError: (error: any) => {
      toast({ title: "❌ Error", description: error.message || "Failed to update password", variant: "destructive" });
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
    ? `${hrEmployee.first_name} ${hrEmployee.last_name}`
    : employeeData?.name || user?.firstName && user?.lastName
      ? `${user?.firstName} ${user?.lastName}`
      : user?.username || '';

  const NoEmployeeProfile = () => (
    <Card>
      <CardContent className="text-center py-12">
        <User className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-medium mb-2">Employee record not linked</h3>
        <p className="text-muted-foreground max-w-md mx-auto text-sm">
          Your ERP login isn't linked to an HRMS employee record yet. Profile, Tasks,
          Documents and Settings still work — leave, attendance and payroll will appear
          once HR links your record (matched by badge ID, email or phone).
        </p>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      {/* ─── Header ─── */}
      <div className="bg-gradient-to-r from-primary via-primary to-primary/80 rounded-xl p-4 sm:p-6 text-primary-foreground shadow-lg">
        <div className="flex items-center gap-3 sm:gap-6">
          <Avatar className="h-16 w-16 sm:h-24 sm:w-24 border-4 border-white/20 shrink-0">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="Profile" className="object-cover w-full h-full" />
            ) : (
              <AvatarFallback className="text-2xl font-bold bg-white/20 text-primary-foreground">
                {displayName ? getInitials(displayName) : 'U'}
              </AvatarFallback>
            )}
          </Avatar>
          <div className="flex-1">
            <h1 className="text-xl sm:text-3xl font-semibold mb-1 truncate">{displayName}</h1>
            <p className="text-sm sm:text-lg opacity-90 break-all">{user?.email}</p>
            {/* Linkage warnings are intentionally hidden from employees — HR-internal concern. */}

            {hrEmployee && (
              <div className="flex items-center gap-4 text-sm opacity-80 mt-1">
                {hrEmployee.phone && (
                  <div className="flex items-center gap-1">
                    <Phone className="h-4 w-4" />
                    <span>{hrEmployee.phone}</span>
                  </div>
                )}
                {hrEmployee.gender && (
                  <div className="flex items-center gap-1">
                    <User className="h-4 w-4" />
                    <span>{hrEmployee.gender}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Tabs ─── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList
          className="flex w-full overflow-x-auto no-scrollbar gap-1 justify-start h-auto md:flex-wrap md:h-auto md:overflow-visible md:py-1"
        >
          <TabsTrigger value="profile" className="shrink-0">Profile</TabsTrigger>
          <TabsTrigger value="tasks" className="shrink-0">My Tasks</TabsTrigger>
          <TabsTrigger value="attendance" className="shrink-0">Attendance</TabsTrigger>
          <TabsTrigger value="salary" className="shrink-0">Salary &amp; PF</TabsTrigger>
          <TabsTrigger value="payslips" className="shrink-0">Payslips</TabsTrigger>
          <TabsTrigger value="banking" className="shrink-0">Banking</TabsTrigger>
          <TabsTrigger value="leaves" className="shrink-0">Leaves</TabsTrigger>
          <TabsTrigger value="requests" className="shrink-0">Requests</TabsTrigger>
          <TabsTrigger value="documents" className="shrink-0">Documents</TabsTrigger>
          <TabsTrigger value="assets" className="shrink-0">Assets</TabsTrigger>
          <TabsTrigger value="policies" className="shrink-0">Policies</TabsTrigger>
          <TabsTrigger value="helpdesk" className="shrink-0">Help</TabsTrigger>
          <TabsTrigger value="settings" className="shrink-0">Settings</TabsTrigger>
        </TabsList>

        {/* ═══════ Profile Tab ═══════ */}
        <TabsContent value="profile" className="space-y-6">
          {!hrEmployee ? (
            <NoEmployeeProfile />
          ) : (
            <div className="space-y-6">
              <AnnouncementsBanner />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Identity & Contact */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Identity &amp; Contact</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { label: 'Full Name', value: `${hrEmployee.first_name || ''} ${hrEmployee.last_name || ''}`.trim() || 'None', hint: 'KYC-locked' },
                    { label: 'Date of Birth', value: hrEmployee.dob || 'None' },
                    { label: 'Gender', value: hrEmployee.gender || 'None' },
                    { label: 'Marital Status', value: hrEmployee.marital_status || 'None' },
                    { label: 'Phone', value: hrEmployee.phone || 'None' },
                    { label: 'Work Email', value: hrEmployee.email || 'None' },
                    { label: 'Qualification', value: hrEmployee.qualification || 'None' },
                    { label: 'Experience', value: hrEmployee.experience || 'None' },
                  ].map((item, idx) => (
                    <div key={idx} className="border-b border-border/50 pb-2 last:border-b-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-[#00bcd4] font-medium">{item.label}</p>
                        {item.hint && <span className="text-[10px] text-muted-foreground">{item.hint}</span>}
                      </div>
                      <p className="text-sm font-semibold text-foreground break-words">{item.value}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>




              {/* Statutory IDs — masked, read-only */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Statutory IDs</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(() => {
                    const mask = (v?: string | null, keep = 4) => {
                      if (!v) return 'None';
                      const s = String(v);
                      if (s.length <= keep) return s;
                      return `${'•'.repeat(Math.max(4, s.length - keep))}${s.slice(-keep)}`;
                    };
                    const rows = [
                      { label: 'PAN', value: mask((hrEmployee as any).pan_number, 4) },
                      { label: 'UAN (PF Universal)', value: mask((hrEmployee as any).uan_number, 4) },
                      { label: 'PF Number', value: mask((hrEmployee as any).pf_number, 4) },
                      { label: 'ESIC Number', value: mask((hrEmployee as any).esi_number, 4) },
                    ];
                    return rows.map((item, idx) => (
                      <div key={idx} className="border-b border-border/50 pb-2 last:border-b-0">
                        <p className="text-xs text-[#00bcd4] font-medium">{item.label}</p>
                        <p className="text-sm font-semibold text-foreground font-mono">{item.value}</p>
                      </div>
                    ));
                  })()}
                  <p className="text-[11px] text-muted-foreground pt-1">
                    Digits are masked for privacy. Full values are visible to Payroll / HR only.
                  </p>
                </CardContent>
              </Card>

              {/* Work Information - Read Only */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-[#00bcd4]" />
                    <CardTitle className="text-base text-[#00bcd4]">Work Information</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Desktop table */}
                  <div className="hidden md:block border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50 border-b border-border">
                          <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Badge Id</th>
                          <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Job Position</th>
                          <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Department</th>
                          <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Shift</th>
                          <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Work Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="py-3 px-4 text-foreground">{hrEmployee.badge_id}</td>
                          <td className="py-3 px-4 text-foreground">{(workInfo as any)?.positions?.title || (workInfo as any)?.job_role || 'N/A'}</td>
                          <td className="py-3 px-4 text-foreground">{(workInfo as any)?.departments?.name || 'N/A'}</td>
                          <td className="py-3 px-4 text-foreground">{(workInfo as any)?.shift_name || 'N/A'}</td>
                          <td className="py-3 px-4 text-foreground">{(workInfo as any)?.work_type || 'N/A'}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {/* Mobile stacked */}
                  <div className="md:hidden space-y-2">
                    {[
                      { label: 'Badge Id', value: hrEmployee.badge_id },
                      { label: 'Job Position', value: (workInfo as any)?.positions?.title || (workInfo as any)?.job_role || 'N/A' },
                      { label: 'Department', value: (workInfo as any)?.departments?.name || 'N/A' },
                      { label: 'Shift', value: (workInfo as any)?.shift_name || 'N/A' },
                      { label: 'Work Type', value: (workInfo as any)?.work_type || 'N/A' },
                    ].map((r, i) => (
                      <div key={i} className="flex justify-between border-b border-border/50 pb-2 last:border-b-0">
                        <span className="text-xs text-muted-foreground">{r.label}</span>
                        <span className="text-sm font-medium text-foreground">{r.value}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              </div>

              {/* Phase 6 — Team & Reporting */}
              <MyTeamCard employeeId={hrEmployee.id} workInfo={workInfo} />

              {/* Phase 7 — Company News */}
              <MyAnnouncementsCard />

              {/* Team Milestones — birthdays & work anniversaries */}
              <MyMilestonesCard employeeId={hrEmployee.id} workInfo={workInfo} />
            </div>
          )}
        </TabsContent>


        {/* ═══════ My Tasks Tab ═══════ */}
        <TabsContent value="tasks" className="space-y-6">
          <UserProfileTasks />
        </TabsContent>

        {/* ═══════ Salary & PF Tab ═══════ */}
        <TabsContent value="salary" className="space-y-6">
          {!hrEmployee ? (
            <NoEmployeeProfile />
          ) : (
            <>
              <SalaryPFTab hrEmployee={hrEmployee} />
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Compensation History
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CompensationHistory employeeId={hrEmployee.id} />
                </CardContent>
              </Card>

            </>
          )}
        </TabsContent>


        {/* ═══════ Payslips Tab ═══════ */}
        <TabsContent value="payslips" className="space-y-6">
          {!hrEmployee ? (
            <NoEmployeeProfile />
          ) : (
            <EmployeePayslipsTab employeeId={hrEmployee.id} badgeId={hrEmployee.badge_id} />
          )}
        </TabsContent>

        {/* ═══════ Banking Tab ═══════ */}
        <TabsContent value="banking" className="space-y-6">
          {!hrEmployee ? (
            <NoEmployeeProfile />
          ) : (
            <EmployeeBankingTab employeeId={hrEmployee.id} />
          )}
        </TabsContent>

        {/* ═══════ Leaves Tab — Horilla-style ═══════ */}
        <TabsContent value="leaves" className="space-y-6">
          {!hrEmployee ? (
            <NoEmployeeProfile />
          ) : (
            <>
              {/* ─── Header row ─── */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h2 className="text-lg font-bold text-foreground">My Leave requests</h2>
                <div className="flex items-center gap-2">
                  <Dialog open={showLeaveCreate} onOpenChange={setShowLeaveCreate}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="bg-[#E8604C] hover:bg-[#d4553f] text-primary-foreground gap-1.5">
                        <Plus className="h-4 w-4" /> Create
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>New Leave Request</DialogTitle></DialogHeader>
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
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>Start Date *</Label>
                            <Input type="date" value={leaveRequest.from_date} onChange={(e) => setLeaveRequest(prev => ({ ...prev, from_date: e.target.value }))} />
                          </div>
                          <div>
                            <Label>End Date *</Label>
                            <Input type="date" value={leaveRequest.to_date} onChange={(e) => setLeaveRequest(prev => ({ ...prev, to_date: e.target.value }))} />
                          </div>
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
                          disabled={applyLeaveMutation.isPending || !leaveRequest.leave_type_id || !leaveRequest.from_date || !leaveRequest.to_date}
                          className="bg-[#E8604C] hover:bg-[#d4553f]"
                        >
                          {applyLeaveMutation.isPending ? 'Submitting...' : 'Submit'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              <UpcomingHolidaysCard />
              <OrgLeaveCalendarCard />

              {/* ─── Leave Balance Cards ─── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">

                {leaveTypes.map((lt: any) => {
                  const bal = cumulativeLeaveBalances[lt.id];
                  const allocated = bal?.totalAllocated || 0;
                  const used = bal?.totalUsed || 0;
                  const available = allocated - used;
                  return (
                    <div key={lt.id} className="border border-border rounded-lg p-5 bg-card">
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center text-primary-foreground font-bold text-sm mb-3"
                        style={{ backgroundColor: lt.color || '#888' }}
                      >
                        {lt.code || '??'}
                      </div>
                      <p className="text-sm font-bold text-foreground mb-3">{lt.name}</p>
                      <div className="space-y-1 text-[13px]">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Available Leave Days</span>
                          <span className="font-semibold text-foreground">{available.toFixed(1)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Leave Days</span>
                          <span className="font-semibold text-foreground">{allocated.toFixed(1)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Leave Taken</span>
                          <span className="font-semibold text-foreground">{used}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {leaveTypes.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 col-span-full">No leave types configured. Contact HR.</p>
                )}
              </div>

              {/* ─── Status Legend + Count ─── */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs text-muted-foreground font-medium">
                  {leaveRequests.length > 0 ? `${leaveRequests.length} request(s)` : ''}
                </span>
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-destructive" /> Rejected</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-muted" /> Cancelled</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-success" /> Approved</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-warning" /> Requested</span>
                </div>
              </div>

              {/* ─── Leave Requests Table ─── */}
              <div className="border border-border rounded-lg overflow-hidden bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">Leave Type</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">Start Date</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">End Date</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">Requested Days</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">Status</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">Comment</th>
                      <th className="text-center py-3 px-4 text-xs font-semibold text-muted-foreground">Options</th>
                      <th className="text-center py-3 px-4 text-xs font-semibold text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaveRequests.length === 0 ? (
                      <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">No leave requests yet. Click "Create" to apply for leave.</td></tr>
                    ) : (
                      leaveRequests.map((req: any) => {
                        const lt = getLeaveType(req.leave_type_id);
                        const isCancellable = req.status === 'pending' || req.status === 'approved';
                        const isEditable = req.status === 'pending';
                        return (
                          <tr key={req.id} className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${
                            req.status === 'pending' ? 'border-l-4 border-l-amber-400' :
                            req.status === 'approved' ? 'border-l-4 border-l-green-500' :
                            req.status === 'rejected' ? 'border-l-4 border-l-red-500' :
                            'border-l-4 border-l-gray-300'
                          }`}>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <span className="w-7 h-7 rounded-full text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0" style={{ backgroundColor: lt?.color || '#888' }}>
                                  {lt?.code?.substring(0, 2) || '??'}
                                </span>
                                <span className="font-medium text-foreground">{lt?.name || 'Unknown'}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-muted-foreground">{req.start_date}</td>
                            <td className="py-3 px-4 text-muted-foreground">{req.end_date}</td>
                            <td className="py-3 px-4 text-foreground font-medium">{req.total_days}</td>
                            <td className="py-3 px-4">
                              <span className={`capitalize font-medium ${statusColors[req.status] || 'text-muted-foreground'}`}>
                                {req.status === 'pending' ? 'Requested' : req.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-muted-foreground max-w-[150px] truncate">{req.reason || '—'}</td>
                            <td className="py-3 px-4 text-center">
                              {isCancellable ? (
                                <Button
                                  size="sm"
                                  className="bg-muted hover:bg-muted text-primary-foreground text-xs px-5"
                                  onClick={() => cancelLeaveMutation.mutate({ requestId: req.id, wasApproved: req.status === 'approved' })}
                                  disabled={cancelLeaveMutation.isPending}
                                >
                                  Cancel
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {isEditable && (
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                    onClick={() => {
                                      setLeaveRequest({
                                        leave_type_id: req.leave_type_id,
                                        from_date: req.start_date,
                                        to_date: req.end_date,
                                        reason: req.reason || '',
                                      });
                                      setEditingLeaveId(req.id);
                                      setShowLeaveCreate(true);
                                    }}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {isEditable && (
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                    onClick={() => deleteLeaveRequestMutation.mutate(req.id)}
                                    disabled={deleteLeaveRequestMutation.isPending}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </TabsContent>

        {/* ═══════ Requests Tab ═══════ */}
        <TabsContent value="requests" className="space-y-6">
          {!hrEmployee ? (
            <NoEmployeeProfile />
          ) : (
            <>
              <TeamLeaveApprovals employeeId={hrEmployee.id} />
              <TeamRegularizationApprovals employeeId={hrEmployee.id} />
              <MyRequestsHub employeeId={hrEmployee.id} />
            </>
          )}
        </TabsContent>

        {/* ═══════ Documents Tab ═══════ */}
        <TabsContent value="documents" className="space-y-6">
          {!hrEmployee ? (
            <NoEmployeeProfile />
          ) : (
            <EmployeeDocumentsTab employeeId={hrEmployee.id} />
          )}
        </TabsContent>

        {/* ═══════ Assets Tab ═══════ */}
        <TabsContent value="assets" className="space-y-6">
          {!hrEmployee ? (
            <NoEmployeeProfile />
          ) : (
            <MyAssetsTab employeeId={hrEmployee.id} />
          )}
        </TabsContent>



        {/* ═══════ Attendance Tab ═══════ */}
        <TabsContent value="attendance" className="space-y-6">
          {!hrEmployee ? (
            <NoEmployeeProfile />
          ) : (
            <AttendanceTab employeeId={hrEmployee.id} />
          )}
        </TabsContent>

        {/* ═══════ Settings Tab ═══════ */}
        <TabsContent value="settings" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Profile Image Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" /> Profile Image</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col items-center gap-4">
                  <Avatar className="h-32 w-32 border-4 border-border">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Preview" className="object-cover w-full h-full" />
                    ) : user?.avatar_url ? (
                      <img src={user.avatar_url} alt="Profile" className="object-cover w-full h-full" />
                    ) : (
                      <AvatarFallback className="text-3xl font-bold">
                        {displayName ? getInitials(displayName) : 'U'}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <div className="w-full space-y-2">
                    <Label htmlFor="avatar">Upload New Image</Label>
                    <div {...avatarDropzone} className={cn("rounded-md transition-colors", avatarDragActive && "ring-2 ring-primary bg-primary/10 p-1")}>
                      <Input id="avatar" type="file" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={handleAvatarChange} disabled={uploadAvatarMutation.isPending} />
                    </div>
                    <p className="text-xs text-muted-foreground">JPG, PNG or WebP. Max size 5MB.</p>
                  </div>
                  {avatarFile && (
                    <div className="flex gap-2 w-full">
                      <Button onClick={() => { toast({ title: "Processing...", description: "Uploading profile image...", duration: 3000 }); uploadAvatarMutation.mutate(avatarFile); }} disabled={uploadAvatarMutation.isPending} className="flex-1">
                        {uploadAvatarMutation.isPending ? 'Uploading...' : 'Upload Image'}
                      </Button>
                      <Button variant="outline" onClick={() => { setAvatarFile(null); setAvatarPreview(null); }} disabled={uploadAvatarMutation.isPending}>Cancel</Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Change Username */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" /> Change Username</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div><Label>Current Username</Label><Input value={user?.username || ''} disabled /></div>
                <div><Label htmlFor="newUsername">New Username</Label><Input id="newUsername" value={settingsData.newUsername} onChange={(e) => setSettingsData(prev => ({ ...prev, newUsername: e.target.value }))} placeholder="Enter new username" /></div>
                <Button onClick={() => {
                  if (!settingsData.newUsername.trim()) { toast({ title: "Error", description: "Please enter a new username", variant: "destructive", duration: 5000 }); return; }
                  if (settingsData.newUsername === user?.username) { toast({ title: "Error", description: "New username must be different", variant: "destructive", duration: 5000 }); return; }
                  toast({ title: "Processing...", description: "Updating username...", duration: 3000 });
                  updateUsernameMutation.mutate(settingsData.newUsername);
                }} disabled={updateUsernameMutation.isPending} className="w-full">
                  {updateUsernameMutation.isPending ? 'Updating...' : 'Update Username'}
                </Button>
              </CardContent>
            </Card>

            {/* Reset Password */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Reset Password</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Reset your password yourself using a one-time verification code sent to your registered email.
                </p>
                <Button onClick={() => setShowResetPassword(true)} className="w-full">
                  Reset Password
                </Button>
              </CardContent>
            </Card>
          </div>


          {/* Security Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Security Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-info/10 dark:bg-info/20 rounded-lg">
                  <h4 className="font-medium mb-2">Account Security</h4>
                  <p className="text-sm text-muted-foreground">Your account is secured with encrypted password storage.</p>
                </div>
                <div className="p-4 bg-success/10 dark:bg-success/20 rounded-lg">
                  <h4 className="font-medium mb-2">Password Requirements</h4>
                  <ul className="text-sm text-muted-foreground list-disc list-inside">
                    <li>Minimum 6 characters</li>
                    <li>Use strong, unique passwords</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Logout */}
          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <LogOut className="h-5 w-5" /> Log Out
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">Sign out of your account. You will need to log in again to access the system.</p>
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => { logout(); navigate('/'); }}
              >
                <LogOut className="h-4 w-4 mr-2" /> Log Out
              </Button>
            </CardContent>
          </Card>
          {user?.id && (
            <div className="md:col-span-2">
              <MySecurityCard userId={user.id} badgeId={hrEmployee?.badge_id} />
            </div>
          )}
        </TabsContent>

        {/* ═══════ Policies Tab ═══════ */}
        <TabsContent value="policies" className="space-y-6">
          {user?.id && <MyPoliciesCard userId={user.id} />}
          <UpcomingHolidaysCard />
        </TabsContent>

        {/* ═══════ Growth Tab ═══════ */}
        <TabsContent value="growth" className="space-y-6">
          {!hrEmployee ? (
            <NoEmployeeProfile />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <MyFeedback360Card employeeId={hrEmployee.id} />
              <MyDisciplinaryCard employeeId={hrEmployee.id} />
            </div>
          )}
        </TabsContent>

        {/* ═══════ Helpdesk Tab ═══════ */}
        <TabsContent value="helpdesk" className="space-y-6">
          {user?.id && <MyHelpdeskCard userId={user.id} />}
        </TabsContent>



      </Tabs>

      <ForgotPasswordDialog
        open={showResetPassword}
        onOpenChange={setShowResetPassword}
        defaultEmail={user?.email || ''}
      />
    </div>
  );
}
