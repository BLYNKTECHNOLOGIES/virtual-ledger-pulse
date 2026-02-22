import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
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
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
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
  PiggyBank,
  Receipt,
  Timer,
  Wallet,
  CalendarDays,
  Target,
  Upload,
  Plus,
  Pencil,
  Trash2
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { toast as sonnerToast } from 'sonner';

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
                <div className="p-2 bg-green-100 rounded-lg"><CreditCard className="h-5 w-5 text-green-600" /></div>
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
                {bank.bank_code_1 && (
                  <div className="flex justify-between border-b border-border/50 pb-2">
                    <span className="text-muted-foreground">IFSC / Bank Code</span>
                    <span className="font-mono font-medium">{bank.bank_code_1}</span>
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

// ─── Salary & PF Sub-Component (uses real HRMS salary structure) ───
function SalaryPFTab({ hrEmployee }: { hrEmployee: any }) {
  const totalSalary = Number(hrEmployee?.total_salary) || 0;
  const templateId = hrEmployee?.salary_structure_template_id;

  const { data: templateItems = [], isLoading } = useQuery({
    queryKey: ['salary_template_items_profile', templateId],
    queryFn: async () => {
      if (!templateId) return [];
      const { data, error } = await supabase
        .from('hr_salary_structure_template_items' as any)
        .select('*, hr_salary_components!hr_salary_structure_template_items_component_id_fkey(id, name, code, component_type)')
        .eq('template_id', templateId);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!templateId,
  });

  // ─── Formula engine (same as SalaryStructureAssignments) ───
  const evalFormula = (formula: string, vars: Record<string, number>): number => {
    try {
      let expr = formula.trim();
      Object.keys(vars).sort((a, b) => b.length - a.length).forEach(k => {
        expr = expr.replace(new RegExp(k, 'g'), String(vars[k]));
      });
      if (/^[\d\s+\-*/().]+$/.test(expr)) {
        return new Function(`return (${expr})`)() as number;
      }
      return 0;
    } catch { return 0; }
  };

  const toSnakeCase = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  // Compute breakdown using the real engine
  const breakdown = (() => {
    if (!templateItems.length) return { earnings: [], deductions: [], employerContribs: [], netPay: 0 };

    // Step 1: Find basic pay
    let basicPay = Number(hrEmployee?.basic_salary) || 0;
    const basicItem = templateItems.find((i: any) =>
      i.hr_salary_components?.code === "BASIC" || i.hr_salary_components?.name?.toLowerCase().includes("basic")
    );
    if (basicItem) {
      if (basicItem.calculation_type === "percentage") {
        basicPay = (Number(basicItem.value) / 100) * totalSalary;
      } else if (basicItem.calculation_type === "fixed") {
        basicPay = Number(basicItem.value);
      }
    }

    // Step 2: Build vars map (non-formula first, then formula)
    const codeAmounts: Record<string, number> = {};
    let tempDeductions = 0, tempAllowances = 0;

    templateItems.forEach((i: any) => {
      const comp = i.hr_salary_components;
      if (!comp || i.calculation_type === "formula" || i.is_variable) return;
      let amount = 0;
      if (i.calculation_type === "percentage") {
        const base = i.percentage_of === "basic_pay" ? basicPay : totalSalary;
        amount = (Number(i.value) / 100) * base;
      } else {
        amount = Number(i.value) || 0;
      }
      const code = comp.code?.toLowerCase();
      if (code) codeAmounts[code] = amount;
      const sn = toSnakeCase(comp.name || '');
      if (sn && sn !== code) codeAmounts[sn] = amount;
      if (comp.component_type === "deduction") tempDeductions += amount;
      else tempAllowances += amount;
    });

    const vars: Record<string, number> = {
      total_salary: totalSalary, basic_pay: basicPay,
      total_deductions: tempDeductions, total_allowances: tempAllowances,
      ...codeAmounts,
    };

    // Resolve formulas
    templateItems.forEach((i: any) => {
      const comp = i.hr_salary_components;
      if (!comp || i.calculation_type !== "formula" || !i.formula) return;
      const amount = evalFormula(i.formula, vars);
      const code = comp.code?.toLowerCase();
      if (code) vars[code] = amount;
      const sn = toSnakeCase(comp.name || '');
      if (sn && sn !== code) vars[sn] = amount;
      if (comp.component_type === "deduction") vars.total_deductions += amount;
      else vars.total_allowances += amount;
    });

    // Step 3: Build display lists
    const earnings: any[] = [], deductions: any[] = [], employerContribs: any[] = [];

    templateItems.forEach((i: any) => {
      const comp = i.hr_salary_components;
      if (!comp) return;
      if (i.is_variable) return; // skip variable/occasional

      let amount: number;
      if (i.calculation_type === "formula" && i.formula) {
        amount = evalFormula(i.formula, vars);
      } else if (i.calculation_type === "percentage") {
        const base = i.percentage_of === "basic_pay" ? basicPay : totalSalary;
        amount = (Number(i.value) / 100) * base;
      } else {
        amount = Number(i.value) || 0;
      }
      amount = Math.round(amount);

      const calcLabel = i.calculation_type === "percentage"
        ? `${Number(i.value)}% of ${i.percentage_of === "basic_pay" ? "Basic" : "CTC"}`
        : i.calculation_type === "formula" ? "Formula" : "Fixed";

      const entry = { name: comp.name, code: comp.code, amount, calcLabel, type: comp.component_type };

      const isEmployer = comp.name?.toLowerCase().includes('employer') ||
        ['PFC', 'ESIC'].includes(comp.code);

      if (comp.component_type === "deduction") {
        if (isEmployer) employerContribs.push(entry);
        else deductions.push(entry);
      } else {
        earnings.push(entry);
      }
    });

    const totalEarn = earnings.reduce((s: number, e: any) => s + e.amount, 0);
    const totalDed = deductions.reduce((s: number, e: any) => s + e.amount, 0);

    return { earnings, deductions, employerContribs, netPay: totalEarn - totalDed };
  })();

  if (!templateId) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <IndianRupee className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No Salary Structure Assigned</h3>
          <p className="text-muted-foreground">Please contact HR to assign a salary structure.</p>
        </CardContent>
      </Card>
    );
  }

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
          <div className="space-y-2">
            <Label className="text-[#00bcd4]">Gross Salary (CTC)</Label>
            <div className="text-2xl font-bold text-green-600">₹{totalSalary.toLocaleString()}</div>
          </div>
          <Separator />
          
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Loading salary structure...</p>
          ) : (
            <>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Earnings</p>
                {breakdown.earnings.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center border-b border-border/50 pb-2">
                    <Label className="text-[#00bcd4]">{item.name} <span className="text-xs text-muted-foreground">({item.calcLabel})</span></Label>
                    <span className="text-base font-semibold">₹{item.amount.toLocaleString()}</span>
                  </div>
                ))}
              </div>

              {breakdown.deductions.length > 0 && (
                <div className="space-y-1 pt-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Deductions</p>
                  {breakdown.deductions.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center border-b border-border/50 pb-2">
                      <Label className="text-red-500">{item.name} <span className="text-xs text-muted-foreground">({item.calcLabel})</span></Label>
                      <span className="text-base font-semibold text-red-600">-₹{item.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}

              <Separator />
              <div className="flex justify-between items-center pt-1">
                <Label className="text-base font-bold">Net Pay</Label>
                <span className="text-xl font-bold text-green-600">₹{breakdown.netPay.toLocaleString()}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Employer Contributions / PF */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PiggyBank className="h-5 w-5" />
            Employer Contributions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : breakdown.employerContribs.length === 0 ? (
            <p className="text-muted-foreground text-sm">No employer contributions configured in salary structure.</p>
          ) : (
            <>
              {breakdown.employerContribs.map((item: any, idx: number) => (
                <div key={idx} className="border-b border-border/50 pb-3">
                  <Label className="text-[#00bcd4]">{item.name} <span className="text-xs text-muted-foreground">({item.calcLabel})</span></Label>
                  <div className="text-xl font-semibold">₹{item.amount.toLocaleString()}</div>
                </div>
              ))}
              <Separator />
              <div>
                <Label>Monthly Employer Total</Label>
                <div className="text-xl font-bold text-blue-600">
                  ₹{breakdown.employerContribs.reduce((s: number, i: any) => s + i.amount, 0).toLocaleString()}
                </div>
              </div>
              <div>
                <Label>Estimated Annual</Label>
                <div className="text-lg">
                  ₹{(breakdown.employerContribs.reduce((s: number, i: any) => s + i.amount, 0) * 12).toLocaleString()}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
export default function UserProfile() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
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
  const [hikeRequest, setHikeRequest] = useState({
    current_salary: '', requested_salary: '', reason: '', justification: ''
  });
  const [settingsData, setSettingsData] = useState({
    newUsername: '', currentPassword: '', newPassword: '', confirmPassword: ''
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [showLeaveCreate, setShowLeaveCreate] = useState(false);
  const [editingLeaveId, setEditingLeaveId] = useState<string | null>(null);

  // ─── Fetch HRMS employee linked to this user ───
  const { data: hrEmployee, isLoading: hrLoading } = useQuery({
    queryKey: ['hr_employee_profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('hr_employees')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

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

  // ─── Also keep the old employee lookup for salary/banking/etc ───
  const { data: employeeData } = useQuery({
    queryKey: ['employee_profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('employees')
        .select(`*, departments(name, icon), positions(title)`)
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!user?.id,
  });

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

  // ─── Apply for hike mutation ───
  const applyHikeMutation = useMutation({
    mutationFn: async (hikeData: typeof hikeRequest) => {
      console.log('Apply for hike:', hikeData);
      throw new Error('Salary hike requests table not implemented yet');
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Salary hike request submitted successfully" });
      setHikeRequest({ current_salary: '', requested_salary: '', reason: '', justification: '' });
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

  // ─── Update password mutation ───
  const updatePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      if (!user?.username) throw new Error('User not found');
      const { data: validationData, error: validationError } = await supabase.rpc('validate_user_credentials', {
        input_username: user.username, input_password: data.currentPassword
      });
      if (validationError) throw validationError;
      const validation = validationData?.[0];
      if (!validation?.is_valid) throw new Error('Current password is incorrect');
      const { error } = await (supabase.rpc as any)('update_user_password', {
        user_id: user.id, new_password: data.newPassword
      });
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

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5242880) { toast({ title: "Error", description: "Image must be less than 5MB", variant: "destructive" }); return; }
      if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) { toast({ title: "Error", description: "Only JPG, PNG, and WebP images are allowed", variant: "destructive" }); return; }
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setAvatarPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-800';
      case 'INACTIVE': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getLeaveType = (typeId: string) => leaveTypes.find((t: any) => t.id === typeId);

  const statusColors: Record<string, string> = {
    approved: "text-green-600",
    rejected: "text-red-600",
    cancelled: "text-muted-foreground",
    pending: "text-amber-600",
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
        <h3 className="text-lg font-medium mb-2">No Employee Profile Found</h3>
        <p className="text-muted-foreground">Please contact HR to set up your employee profile.</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* ─── Header ─── */}
      <div className="bg-gradient-to-r from-slate-700 to-slate-800 rounded-xl p-6 text-white">
        <div className="flex items-center gap-6">
          <Avatar className="h-24 w-24 border-4 border-white/20">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="Profile" className="object-cover w-full h-full" />
            ) : (
              <AvatarFallback className="text-2xl font-bold bg-white/20 text-white">
                {displayName ? getInitials(displayName) : 'U'}
              </AvatarFallback>
            )}
          </Avatar>
          <div className="flex-1">
            <h1 className="text-3xl font-bold mb-1">{displayName}</h1>
            <p className="text-lg opacity-90">{user?.email}</p>
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
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="salary">Salary & PF</TabsTrigger>
          <TabsTrigger value="banking">Banking</TabsTrigger>
          <TabsTrigger value="leaves">Leaves</TabsTrigger>
          <TabsTrigger value="requests">Requests</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* ═══════ Profile Tab ═══════ */}
        <TabsContent value="profile" className="space-y-6">
          {!hrEmployee ? (
            <NoEmployeeProfile />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Personal Information - Read Only */}
              <Card>
                <CardHeader>
                  <CardTitle>Personal Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { label: 'Date of birth', value: hrEmployee.dob || 'None' },
                    { label: 'Gender', value: hrEmployee.gender || 'None' },
                    { label: 'Address', value: hrEmployee.address || 'None' },
                    { label: 'Country', value: hrEmployee.country || 'None' },
                    { label: 'State', value: hrEmployee.state || 'None' },
                    { label: 'City', value: hrEmployee.city || 'None' },
                    { label: 'Qualification', value: hrEmployee.qualification || 'None' },
                    { label: 'Experience', value: hrEmployee.experience || 'None' },
                    { label: 'Emergency Contact', value: hrEmployee.emergency_contact || 'None' },
                    { label: 'Emergency Contact Name', value: hrEmployee.emergency_contact_name || 'None' },
                    { label: 'Marital Status', value: hrEmployee.marital_status || 'None' },
                    { label: 'Children', value: hrEmployee.children?.toString() || 'None' },
                  ].map((item, idx) => (
                    <div key={idx} className="border-b border-border/50 pb-2 last:border-b-0">
                      <p className="text-xs text-[#00bcd4] font-medium">{item.label}</p>
                      <p className="text-sm font-semibold text-foreground">{item.value}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Work Information - Read Only */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#00bcd4] text-white text-xs flex items-center justify-center font-bold">1</span>
                    <CardTitle className="text-[#00bcd4]">Work Information</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="border border-border rounded-lg overflow-hidden">
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
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ═══════ Salary & PF Tab ═══════ */}
        <TabsContent value="salary" className="space-y-6">
          {!hrEmployee ? (
            <NoEmployeeProfile />
          ) : (
            <SalaryPFTab hrEmployee={hrEmployee} />
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
                      <Button size="sm" className="bg-[#E8604C] hover:bg-[#d4553f] text-white gap-1.5">
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
                        className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm mb-3"
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
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Rejected</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-gray-400" /> Cancelled</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Approved</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Requested</span>
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
                                <span className="w-7 h-7 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0" style={{ backgroundColor: lt?.color || '#888' }}>
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
                                  className="bg-gray-400 hover:bg-gray-500 text-white text-xs px-5"
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
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
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
              {/* Leave Requests Summary */}
              {leaveRequests.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      My Requests
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="border border-border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/50 border-b border-border">
                            <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">Type</th>
                            <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">Details</th>
                            <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">Date</th>
                            <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {leaveRequests.map((req: any) => {
                            const lt = getLeaveType(req.leave_type_id);
                            return (
                              <tr key={req.id} className="border-b border-border/50 hover:bg-muted/20">
                                <td className="py-3 px-4 font-medium">Leave Request</td>
                                <td className="py-3 px-4 text-muted-foreground">
                                  {lt?.name || 'Leave'} · {req.total_days} day(s)
                                </td>
                                <td className="py-3 px-4 text-muted-foreground">{req.start_date} → {req.end_date}</td>
                                <td className={`py-3 px-4 font-medium ${statusColors[req.status] || 'text-muted-foreground'}`}>{req.status}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="text-center py-12">
                    <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">No Requests</h3>
                    <p className="text-muted-foreground">You have no pending requests. Use the Leaves tab to apply for leave.</p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ═══════ Documents Tab ═══════ */}
        <TabsContent value="documents" className="space-y-6">
          {!hrEmployee && !employeeData ? (
            <NoEmployeeProfile />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Employee Documents
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { name: 'Employment Contract', status: 'Available', date: '2023-01-15' },
                    { name: 'Offer Letter', status: 'Available', date: '2022-12-20' },
                    { name: 'Salary Certificate', status: 'Generate', date: '' },
                    { name: 'Experience Letter', status: 'Request', date: '' },
                  ].map((doc, index) => (
                    <div key={index} className="border rounded-lg p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileText className="h-8 w-8 text-blue-500" />
                        <div>
                          <p className="font-medium">{doc.name}</p>
                          {doc.date && <p className="text-sm text-muted-foreground">Generated: {doc.date}</p>}
                        </div>
                      </div>
                      <Button variant={doc.status === 'Available' ? 'default' : 'outline'} size="sm">{doc.status}</Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
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
                    <Input id="avatar" type="file" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={handleAvatarChange} disabled={uploadAvatarMutation.isPending} />
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

            {/* Change Password */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Change Password</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div><Label htmlFor="currentPassword">Current Password</Label><Input id="currentPassword" type="password" value={settingsData.currentPassword} onChange={(e) => setSettingsData(prev => ({ ...prev, currentPassword: e.target.value }))} placeholder="Enter current password" /></div>
                <div><Label htmlFor="newPassword">New Password</Label><Input id="newPassword" type="password" value={settingsData.newPassword} onChange={(e) => setSettingsData(prev => ({ ...prev, newPassword: e.target.value }))} placeholder="Enter new password" /></div>
                <div><Label htmlFor="confirmPassword">Confirm New Password</Label><Input id="confirmPassword" type="password" value={settingsData.confirmPassword} onChange={(e) => setSettingsData(prev => ({ ...prev, confirmPassword: e.target.value }))} placeholder="Confirm new password" /></div>
                <Button onClick={() => {
                  if (!settingsData.currentPassword || !settingsData.newPassword || !settingsData.confirmPassword) { toast({ title: "Error", description: "Please fill in all password fields", variant: "destructive" }); return; }
                  if (settingsData.newPassword !== settingsData.confirmPassword) { toast({ title: "Error", description: "New passwords do not match", variant: "destructive" }); return; }
                  if (settingsData.newPassword.length < 6) { toast({ title: "Error", description: "Password must be at least 6 characters long", variant: "destructive" }); return; }
                  updatePasswordMutation.mutate({ currentPassword: settingsData.currentPassword, newPassword: settingsData.newPassword });
                }} disabled={updatePasswordMutation.isPending} className="w-full">
                  {updatePasswordMutation.isPending ? 'Updating...' : 'Update Password'}
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
                <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                  <h4 className="font-medium mb-2">Account Security</h4>
                  <p className="text-sm text-muted-foreground">Your account is secured with encrypted password storage.</p>
                </div>
                <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                  <h4 className="font-medium mb-2">Password Requirements</h4>
                  <ul className="text-sm text-muted-foreground list-disc list-inside">
                    <li>Minimum 6 characters</li>
                    <li>Use strong, unique passwords</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
