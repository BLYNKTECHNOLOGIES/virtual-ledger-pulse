import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Wallet, TrendingUp, TrendingDown, Users, PlayCircle, CheckCircle, FileText, Loader2, Lock, Unlock, RefreshCw, ShieldCheck } from "lucide-react";
import { computeComponentAmounts, isEmployerComponent } from "@/lib/hrms/salaryComputation";
import { StatutoryReportsPanel } from "@/components/hrms/StatutoryReportsPanel";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function PayrollDashboardPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", pay_period_start: "", pay_period_end: "", notes: "" });
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [lockConfirm, setLockConfirm] = useState<any>(null);
  const [rerunDialog, setRerunDialog] = useState<any>(null);
  const [rerunReason, setRerunReason] = useState("");
  const [reviewDialog, setReviewDialog] = useState<any>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["hr_payroll_runs"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("hr_payroll_runs").select("*").order("run_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("hr_payroll_runs").insert({
        title: form.title,
        pay_period_start: form.pay_period_start,
        pay_period_end: form.pay_period_end,
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_payroll_runs"] });
      setShowCreate(false);
      setForm({ title: "", pay_period_start: "", pay_period_end: "", notes: "" });
      toast.success("Payroll run created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await (supabase as any).from("hr_payroll_runs").update({
        status: "reviewed",
        reviewed_by: (await supabase.auth.getUser()).data.user?.id || null,
        reviewed_at: new Date().toISOString(),
        review_notes: notes || null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_payroll_runs"] });
      toast.success("Payroll reviewed & approved");
      setReviewDialog(null);
      setReviewNotes("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const lockMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("hr_payroll_runs").update({
        status: "completed",
        is_locked: true,
        locked_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_payroll_runs"] });
      toast.success("Payroll locked successfully");
      setLockConfirm(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const rerunMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      // Get current rerun_count
      const { data: current } = await (supabase as any).from("hr_payroll_runs").select("rerun_count").eq("id", id).single();
      const newCount = (current?.rerun_count || 0) + 1;
      const { error } = await (supabase as any).from("hr_payroll_runs").update({
        status: "processing",
        is_locked: false,
        locked_at: null,
        rerun_count: newCount,
        rerun_reason: reason,
      }).eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: async (id: string) => {
      qc.invalidateQueries({ queryKey: ["hr_payroll_runs"] });
      toast.success("Payroll unlocked — regenerating payslips...");
      setRerunDialog(null);
      setRerunReason("");
      // Auto-regenerate after unlock
      const { data: run } = await (supabase as any).from("hr_payroll_runs").select("*").eq("id", id).single();
      if (run) generatePayslips(run);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // --- Salary computation from shared utility ---
  // (Eliminates duplicated evalFormula/computeComponentAmounts logic)

  // Generate payslips for a payroll run
  const generatePayslips = async (run: any) => {
    setGeneratingId(run.id);
    try {
      // 1. Get all active employees with their template assignment
      const { data: employees, error: empErr } = await (supabase as any)
        .from("hr_employees")
        .select("id, first_name, last_name, basic_salary, total_salary, salary_structure_template_id, filing_status_id")
        .eq("is_active", true);
      if (empErr) throw empErr;

      // 2. Get all template items with component details
      const { data: templateItems, error: tiErr } = await (supabase as any)
        .from("hr_salary_structure_template_items")
        .select("*, hr_salary_components!hr_salary_structure_template_items_component_id_fkey(id, name, code, component_type)");
      if (tiErr) throw tiErr;

      // Build template items map
      const templateItemsMap: Record<string, any[]> = {};
      (templateItems || []).forEach((item: any) => {
        if (!templateItemsMap[item.template_id]) templateItemsMap[item.template_id] = [];
        templateItemsMap[item.template_id].push(item);
      });

      // 3. Get attendance for pay period (include date for Sunday detection)
      const { data: attendance, error: attErr } = await (supabase as any)
        .from("hr_attendance")
        .select("employee_id, attendance_date, attendance_status, overtime_hours")
        .gte("attendance_date", run.pay_period_start)
        .lte("attendance_date", run.pay_period_end);
      if (attErr) throw attErr;

      // 4. Get approved leaves for the pay period (these count as paid days)
      const { data: approvedLeaves, error: leaveErr } = await (supabase as any)
        .from("hr_leave_requests")
        .select("employee_id, total_days")
        .eq("status", "approved")
        .lte("start_date", run.pay_period_end)
        .gte("end_date", run.pay_period_start);
      if (leaveErr) throw leaveErr;

      // 5. Get holidays in the pay period
      const { data: holidays } = await (supabase as any)
        .from("hr_holidays")
        .select("date")
        .eq("is_active", true)
        .gte("date", run.pay_period_start)
        .lte("date", run.pay_period_end);
      const holidaySet = new Set((holidays || []).map((h: any) => h.date));

      // 6. Get penalties for this pay period month
      const payMonth = run.pay_period_start.slice(0, 7); // YYYY-MM
      const { data: penalties } = await (supabase as any)
        .from("hr_penalties")
        .select("*")
        .eq("penalty_month", payMonth)
        .eq("is_applied", false);

      // 6b. Get active deposits
      const { data: activeDeposits } = await (supabase as any)
        .from("hr_employee_deposits")
        .select("*")
        .eq("is_settled", false);

      // 6c. Get active loans for EMI deductions
      const { data: activeLoans } = await (supabase as any)
        .from("hr_loans")
        .select("*")
        .eq("status", "active");

      const depositMap: Record<string, any> = {};
      (activeDeposits || []).forEach((d: any) => { depositMap[d.employee_id] = d; });

      // Build penalty map per employee (separate salary vs deposit penalties)
      const penaltyMap: Record<string, { totalDays: number; totalFixed: number; depositFixed: number; reasons: string[]; depositPenaltyIds: string[] }> = {};
      (penalties || []).forEach((p: any) => {
        if (!penaltyMap[p.employee_id]) penaltyMap[p.employee_id] = { totalDays: 0, totalFixed: 0, depositFixed: 0, reasons: [], depositPenaltyIds: [] };
        if (p.deduct_from_deposit && depositMap[p.employee_id]) {
          penaltyMap[p.employee_id].depositFixed += Number(p.penalty_amount || 0);
          penaltyMap[p.employee_id].depositPenaltyIds.push(p.id);
        } else {
          penaltyMap[p.employee_id].totalDays += Number(p.penalty_days || 0);
          penaltyMap[p.employee_id].totalFixed += Number(p.penalty_amount || 0);
        }
        penaltyMap[p.employee_id].reasons.push(p.penalty_reason);
      });

      // Build leave days map
      const leaveMap: Record<string, number> = {};
      (approvedLeaves || []).forEach((l: any) => {
        leaveMap[l.employee_id] = (leaveMap[l.employee_id] || 0) + Number(l.total_days || 0);
      });

      // Build attendance map (track Sunday & holiday work days for overtime pay)
      const attMap: Record<string, { present: number; total: number; ot: number; sundayWorked: number; holidayWorked: number }> = {};
      (attendance || []).forEach((a: any) => {
        if (!attMap[a.employee_id]) attMap[a.employee_id] = { present: 0, total: 0, ot: 0, sundayWorked: 0, holidayWorked: 0 };
        attMap[a.employee_id].total++;
        if (a.attendance_status === "present" || a.attendance_status === "late" || a.attendance_status === "half_day") {
          attMap[a.employee_id].present += a.attendance_status === "half_day" ? 0.5 : 1;
          const attDate = new Date(a.attendance_date + "T00:00:00");
          const dateStr = a.attendance_date;
          // Sunday work
          if (attDate.getDay() === 0) {
            attMap[a.employee_id].sundayWorked += a.attendance_status === "half_day" ? 0.5 : 1;
          }
          // Holiday work (declared holiday but employee was present)
          if (holidaySet.has(dateStr)) {
            attMap[a.employee_id].holidayWorked += a.attendance_status === "half_day" ? 0.5 : 1;
          }
        }
        attMap[a.employee_id].ot += Number(a.overtime_hours || 0);
      });

      // 7. Calculate payslips (use Promise.all since TDS needs async RPC call)
      const penaltyIdsToMark: string[] = [];
      const payslips = await Promise.all((employees || []).map(async (emp: any) => {
        const tmplId = emp.salary_structure_template_id;
        const items = tmplId ? (templateItemsMap[tmplId] || []) : [];
        const empAtt = attMap[emp.id] || { present: 0, total: 0, ot: 0, sundayWorked: 0, holidayWorked: 0 };
        const empLeaveDays = leaveMap[emp.id] || 0;
        const empPenalty = penaltyMap[emp.id] || { totalDays: 0, totalFixed: 0, depositFixed: 0, reasons: [], depositPenaltyIds: [] };
        const totalSalary = Number(emp.total_salary) || 0;

        // Calculate working days (Mon-Sat, excluding Sundays and holidays)
        const start = new Date(run.pay_period_start);
        const end = new Date(run.pay_period_end);
        let workingDays = 0;
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const day = d.getDay();
          const dateStr = d.toISOString().slice(0, 10);
          if (day !== 0 && !holidaySet.has(dateStr)) workingDays++;
        }

        // Present = attendance present + approved leave days (paid leave counts as present)
        const attendancePresent = empAtt.total > 0 ? empAtt.present : 0;
        const paidDays = Math.min(attendancePresent + empLeaveDays, workingDays);
        const presentDays = empAtt.total === 0 && empLeaveDays === 0 ? workingDays : paidDays;
        const attendanceRatio = workingDays > 0 ? presentDays / workingDays : 1;

        // Compute earnings/deductions from template
        let earningsBreakdown: Record<string, number> = {};
        let deductionsBreakdown: Record<string, number> = {};
        let totalEarnings = 0;
        let totalDeductions = 0;

        if (items.length > 0 && totalSalary > 0) {
          const computed = computeComponentAmounts(items, totalSalary);
          Object.entries(computed.earningsBreakdown).forEach(([k, v]) => {
            earningsBreakdown[k] = Math.round(v * attendanceRatio);
          });
          totalEarnings = Object.values(earningsBreakdown).reduce((s, v) => s + v, 0);
          deductionsBreakdown = computed.deductionsBreakdown;
          totalDeductions = computed.totalDeductions;
        } else if (emp.basic_salary && Number(emp.basic_salary) > 0) {
          const basic = Math.round(Number(emp.basic_salary) * attendanceRatio);
          earningsBreakdown["Basic Salary"] = basic;
          totalEarnings = basic;
        }

        // Per-day pay rate (used for OT and penalty calculations)
        const fullMonthEarnings = totalEarnings > 0 && attendanceRatio > 0
          ? Math.round(totalEarnings / attendanceRatio)
          : totalSalary;
        const perDayPay = workingDays > 0 ? Math.round(fullMonthEarnings / workingDays) : 0;

        // Sunday overtime pay
        const sundayDays = empAtt.sundayWorked;
        if (sundayDays > 0 && perDayPay > 0) {
          const sundayPay = Math.round(perDayPay * sundayDays);
          earningsBreakdown["Sunday OT Pay"] = sundayPay;
          totalEarnings += sundayPay;
        }

        // Holiday overtime pay (worked on declared holidays)
        const holidayDays = empAtt.holidayWorked;
        if (holidayDays > 0 && perDayPay > 0) {
          const holidayPay = Math.round(perDayPay * holidayDays);
          earningsBreakdown["Holiday OT Pay"] = holidayPay;
          totalEarnings += holidayPay;
        }

        // Penalty deductions (salary-based only)
        let penaltyDeduction = 0;
        if (empPenalty.totalDays > 0 && perDayPay > 0) {
          penaltyDeduction += Math.round(perDayPay * empPenalty.totalDays);
          deductionsBreakdown[`Late Penalty (${empPenalty.totalDays} day${empPenalty.totalDays > 1 ? 's' : ''})`] = Math.round(perDayPay * empPenalty.totalDays);
        }
        if (empPenalty.totalFixed > 0) {
          penaltyDeduction += empPenalty.totalFixed;
          deductionsBreakdown["Manual Penalty"] = empPenalty.totalFixed;
        }
        totalDeductions += penaltyDeduction;

        // Track penalty IDs to mark as applied
        if (empPenalty.totalDays > 0 || empPenalty.totalFixed > 0 || empPenalty.depositFixed > 0) {
          (penalties || []).filter((p: any) => p.employee_id === emp.id && !p.is_applied)
            .forEach((p: any) => penaltyIdsToMark.push(p.id));
        }

        // --- Deposit logic ---
        const grossSalary = totalEarnings;
        const empDeposit = depositMap[emp.id];
        let depositDeduction = 0;
        let depositReplenishment = 0;

        if (empDeposit) {
          // a. Penalty deducted from deposit
          if (empPenalty.depositFixed > 0 && empDeposit.current_balance > 0) {
            const penaltyFromDeposit = Math.min(empPenalty.depositFixed, Number(empDeposit.current_balance));
            empDeposit.current_balance = Number(empDeposit.current_balance) - penaltyFromDeposit;
            // We'll record this transaction after insert
            empDeposit._penaltyDeducted = penaltyFromDeposit;
          }

          // b. Collection if not fully collected
          if (!empDeposit.is_fully_collected) {
            const remaining = Number(empDeposit.total_deposit_amount) - Number(empDeposit.collected_amount);
            if (remaining > 0) {
              let installment = 0;
              if (empDeposit.deduction_mode === "one_time") {
                installment = remaining;
              } else if (empDeposit.deduction_mode === "percentage") {
                installment = Math.round((Number(empDeposit.deduction_value) / 100) * grossSalary);
              } else {
                installment = Number(empDeposit.deduction_value);
              }
              installment = Math.min(installment, remaining);
              if (installment > 0) {
                depositDeduction = installment;
                deductionsBreakdown["Security Deposit"] = installment;
                totalDeductions += installment;
                empDeposit.collected_amount = Number(empDeposit.collected_amount) + installment;
                empDeposit.current_balance = Number(empDeposit.current_balance) + installment;
                if (empDeposit.collected_amount >= Number(empDeposit.total_deposit_amount)) {
                  empDeposit.is_fully_collected = true;
                }
                empDeposit._collectionAmount = installment;
              }
            }
          }

          // c. Replenishment if balance dropped below collected (due to penalty)
          if (empDeposit.is_fully_collected && Number(empDeposit.current_balance) < Number(empDeposit.collected_amount)) {
            const deficit = Number(empDeposit.collected_amount) - Number(empDeposit.current_balance);
            let replenishAmt = 0;
            if (empDeposit.deduction_mode === "percentage") {
              replenishAmt = Math.round((Number(empDeposit.deduction_value) / 100) * grossSalary);
            } else {
              replenishAmt = Number(empDeposit.deduction_value);
            }
            replenishAmt = Math.min(replenishAmt, deficit);
            if (replenishAmt > 0) {
              depositReplenishment = replenishAmt;
              deductionsBreakdown["Deposit Replenishment"] = replenishAmt;
              totalDeductions += replenishAmt;
              empDeposit.current_balance = Number(empDeposit.current_balance) + replenishAmt;
              empDeposit._replenishAmount = replenishAmt;
            }
          }

          empDeposit._updated = true;
        }

        // --- TDS Computation ---
        let tdsAmount = 0;
        if (emp.filing_status_id && totalEarnings > 0) {
          // Annualize gross earnings for tax computation
          const annualGross = totalEarnings * 12;
          try {
            const { data: taxResult } = await (supabase as any)
              .rpc("compute_annual_tax", { p_taxable_income: annualGross, p_filing_status_id: emp.filing_status_id });
            if (taxResult && Number(taxResult) > 0) {
              tdsAmount = Math.round(Number(taxResult) / 12); // Monthly TDS
              deductionsBreakdown["TDS (Income Tax)"] = tdsAmount;
              totalDeductions += tdsAmount;
            }
          } catch {
            // TDS computation failed — continue without it
          }
        }

        // LOP calculation
        const lopDays = Math.max(0, workingDays - presentDays);
        const lopDeduction = lopDays > 0 && perDayPay > 0 ? Math.round(perDayPay * lopDays) : 0;
        if (lopDeduction > 0) {
          deductionsBreakdown["LOP Deduction"] = lopDeduction;
          totalDeductions += lopDeduction;
        }

        // --- Loan EMI deductions ---
        const empLoans = (activeLoans || []).filter((l: any) => l.employee_id === emp.id && l.status === 'active' && Number(l.outstanding_balance) > 0);
        let loanDeduction = 0;
        for (const loan of empLoans) {
          const emi = Math.min(Number(loan.emi_amount), Number(loan.outstanding_balance));
          if (emi > 0) {
            loanDeduction += emi;
            deductionsBreakdown[`Loan EMI (${loan.loan_type?.replace(/_/g, ' ')})`] = emi;
            loan._emiDeducted = emi;
            loan._newBalance = Number(loan.outstanding_balance) - emi;
          }
        }
        totalDeductions += loanDeduction;

        const netSalary = totalEarnings - totalDeductions;

        return {
          payroll_run_id: run.id,
          employee_id: emp.id,
          gross_salary: grossSalary,
          total_earnings: totalEarnings,
          total_deductions: totalDeductions,
          net_salary: netSalary,
          earnings_breakdown: earningsBreakdown,
          deductions_breakdown: deductionsBreakdown,
          working_days: workingDays,
          present_days: presentDays,
          leave_days: workingDays - presentDays,
          lop_days: lopDays,
          lop_deduction: lopDeduction,
          overtime_hours: empAtt.ot,
          sunday_days_worked: sundayDays,
          holiday_days_worked: holidayDays,
          penalty_amount: penaltyDeduction,
          tds_amount: tdsAmount,
          status: "draft",
        };
      }));

      // 8. UPSERT payslips
      await (supabase as any).from("hr_payslips").delete().eq("payroll_run_id", run.id);
      const { error: insertErr } = await (supabase as any).from("hr_payslips").insert(payslips);
      if (insertErr) throw insertErr;

      // 9. Mark penalties as applied
      if (penaltyIdsToMark.length > 0) {
        await (supabase as any).from("hr_penalties").update({
          is_applied: true,
          applied_at: new Date().toISOString(),
          payroll_run_id: run.id,
        }).in("id", penaltyIdsToMark);
      }

      // 10. Update deposits and insert deposit transactions
      for (const dep of (activeDeposits || [])) {
        if (!dep._updated) continue;
        const txns: any[] = [];

        if (dep._penaltyDeducted > 0) {
          txns.push({
            employee_id: dep.employee_id, deposit_id: dep.id,
            transaction_type: "penalty_deduction", amount: -dep._penaltyDeducted,
            balance_after: Number(dep.current_balance) + (dep._collectionAmount || 0) + (dep._replenishAmount || 0) - dep._penaltyDeducted,
            description: "Penalty deducted from deposit",
            transaction_date: new Date().toISOString().slice(0, 10), payroll_run_id: run.id,
          });
        }
        if (dep._collectionAmount > 0) {
          txns.push({
            employee_id: dep.employee_id, deposit_id: dep.id,
            transaction_type: "collection", amount: dep._collectionAmount,
            balance_after: Number(dep.current_balance),
            description: `Deposit collection via payroll`,
            transaction_date: new Date().toISOString().slice(0, 10), payroll_run_id: run.id,
          });
        }
        if (dep._replenishAmount > 0) {
          txns.push({
            employee_id: dep.employee_id, deposit_id: dep.id,
            transaction_type: "replenishment", amount: dep._replenishAmount,
            balance_after: Number(dep.current_balance),
            description: "Deposit replenishment after penalty",
            transaction_date: new Date().toISOString().slice(0, 10), payroll_run_id: run.id,
          });
        }

        if (txns.length > 0) {
          await (supabase as any).from("hr_deposit_transactions").insert(txns);
        }

        await (supabase as any).from("hr_employee_deposits").update({
          collected_amount: dep.collected_amount,
          current_balance: dep.current_balance,
          is_fully_collected: dep.is_fully_collected,
          updated_at: new Date().toISOString(),
        }).eq("id", dep.id);
      }

      // 6. Update run totals
      const totalGross = payslips.reduce((s, p) => s + p.gross_salary, 0);
      const totalDed = payslips.reduce((s, p) => s + p.total_deductions, 0);
      const totalNet = payslips.reduce((s, p) => s + p.net_salary, 0);
      await (supabase as any).from("hr_payroll_runs").update({
        total_gross: totalGross,
        total_deductions: totalDed,
        total_net: totalNet,
        employee_count: payslips.length,
        status: "processing",
      }).eq("id", run.id);

      qc.invalidateQueries({ queryKey: ["hr_payroll_runs"] });
      qc.invalidateQueries({ queryKey: ["hr_payslips"] });
      toast.success(`Generated ${payslips.length} payslips`);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate payslips");
    } finally {
      setGeneratingId(null);
    }
  };

  const totalGross = runs.reduce((s: number, r: any) => s + (r.total_gross || 0), 0);
  const totalNet = runs.reduce((s: number, r: any) => s + (r.total_net || 0), 0);
  const totalDeductions = runs.reduce((s: number, r: any) => s + (r.total_deductions || 0), 0);

  const statusColor = (status: string) => {
    switch (status) {
      case "draft": return "bg-gray-100 text-gray-700";
      case "processing": return "bg-blue-100 text-blue-700";
      case "reviewed": return "bg-indigo-100 text-indigo-700";
      case "completed": return "bg-green-100 text-green-700";
      case "cancelled": return "bg-red-100 text-red-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payroll Dashboard</h1>
          <p className="text-sm text-gray-500">Manage payroll runs, generate payslips and process payments</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-[#E8604C] hover:bg-[#d4553f]">
          <Plus className="h-4 w-4 mr-2" /> New Payroll Run
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Runs", value: runs.length, icon: Wallet, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Total Gross", value: `₹${totalGross.toLocaleString('en-IN')}`, icon: TrendingUp, color: "text-green-600", bg: "bg-green-50" },
          { label: "Total Deductions", value: `₹${totalDeductions.toLocaleString('en-IN')}`, icon: TrendingDown, color: "text-red-600", bg: "bg-red-50" },
          { label: "Total Net Pay", value: `₹${totalNet.toLocaleString('en-IN')}`, icon: Users, color: "text-purple-600", bg: "bg-purple-50" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
              <div><p className="text-xl font-bold">{s.value}</p><p className="text-xs text-gray-500">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Payroll Runs</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {["Title", "Period", "Run Date", "Employees", "Gross", "Deductions", "Net", "Status", "Actions"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="text-center py-8 text-gray-400">Loading...</td></tr>
              ) : runs.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-gray-400">No payroll runs yet</td></tr>
              ) : (
                runs.map((r: any) => (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{r.title}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{r.pay_period_start} — {r.pay_period_end}</td>
                    <td className="px-4 py-3">{r.run_date}</td>
                    <td className="px-4 py-3">{r.employee_count || 0}</td>
                    <td className="px-4 py-3 text-green-700 font-medium">₹{(r.total_gross || 0).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-red-600">₹{(r.total_deductions || 0).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 font-semibold">₹{(r.total_net || 0).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {r.is_locked && (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full mr-1">
                            <Lock className="h-3 w-3" /> Locked
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(r.status)}`}>{r.status}</span>
                        {r.rerun_count > 0 && (
                          <span className="text-xs text-muted-foreground" title={r.rerun_reason || ""}>
                            (Re-run #{r.rerun_count})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {/* Draft: Generate */}
                        {r.status === "draft" && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={generatingId === r.id} onClick={() => generatePayslips(r)}>
                            {generatingId === r.id ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Generating...</> : <><FileText className="h-3 w-3 mr-1" /> Generate</>}
                          </Button>
                        )}
                        {/* Processing: Review + Re-generate */}
                        {r.status === "processing" && !r.is_locked && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={generatingId === r.id} onClick={() => generatePayslips(r)}>
                              {generatingId === r.id ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Generating...</> : <><RefreshCw className="h-3 w-3 mr-1" /> Regenerate</>}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-indigo-700" onClick={() => setReviewDialog(r)}>
                              <CheckCircle className="h-3 w-3 mr-1" /> Review & Approve
                            </Button>
                          </>
                        )}
                        {/* Reviewed: Lock or Re-generate */}
                        {r.status === "reviewed" && !r.is_locked && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={generatingId === r.id} onClick={() => generatePayslips(r)}>
                              {generatingId === r.id ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Generating...</> : <><RefreshCw className="h-3 w-3 mr-1" /> Regenerate</>}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-amber-700" onClick={() => setLockConfirm(r)}>
                              <Lock className="h-3 w-3 mr-1" /> Lock & Complete
                            </Button>
                          </>
                        )}
                        {/* Completed & Locked: Re-run option */}
                        {r.status === "completed" && r.is_locked && (
                          <Button size="sm" variant="outline" className="h-7 text-xs text-orange-600 border-orange-200 hover:bg-orange-50" onClick={() => setRerunDialog(r)}>
                            <Unlock className="h-3 w-3 mr-1" /> Unlock & Re-run
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Payroll Run</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. February 2026 Salary" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Period Start</Label><Input type="date" value={form.pay_period_start} onChange={(e) => setForm({ ...form, pay_period_start: e.target.value })} /></div>
              <div><Label>Period End</Label><Input type="date" value={form.pay_period_end} onChange={(e) => setForm({ ...form, pay_period_end: e.target.value })} /></div>
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!form.title || !form.pay_period_start || !form.pay_period_end} className="bg-[#E8604C] hover:bg-[#d4553f]">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Lock Confirmation */}
      <AlertDialog open={!!lockConfirm} onOpenChange={(open) => !open && setLockConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-amber-600" /> Lock Payroll Run?</AlertDialogTitle>
            <AlertDialogDescription>
              Locking <strong>{lockConfirm?.title}</strong> will mark it as completed and prevent any further modifications or regeneration. This action can only be reversed via a controlled re-run.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-amber-600 hover:bg-amber-700" onClick={() => lockMutation.mutate(lockConfirm?.id)}>
              <Lock className="h-4 w-4 mr-1" /> Lock & Complete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Review & Approve Dialog */}
      <Dialog open={!!reviewDialog} onOpenChange={(open) => { if (!open) { setReviewDialog(null); setReviewNotes(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle className="h-5 w-5 text-indigo-600" /> Review & Approve Payroll</DialogTitle>
            <DialogDescription>
              Reviewing <strong>{reviewDialog?.title}</strong> — {reviewDialog?.employee_count || 0} payslips, Net Pay ₹{(reviewDialog?.total_net || 0).toLocaleString('en-IN')}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-[10px] text-muted-foreground uppercase">Gross</p>
                <p className="text-sm font-bold text-green-600">₹{(reviewDialog?.total_gross || 0).toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-[10px] text-muted-foreground uppercase">Deductions</p>
                <p className="text-sm font-bold text-red-600">₹{(reviewDialog?.total_deductions || 0).toLocaleString('en-IN')}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-[10px] text-muted-foreground uppercase">Net Pay</p>
                <p className="text-sm font-bold">₹{(reviewDialog?.total_net || 0).toLocaleString('en-IN')}</p>
              </div>
            </div>
            <div>
              <Label>Review Notes</Label>
              <Textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} placeholder="Verification notes, discrepancies checked..." className="mt-1" />
            </div>
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-sm text-indigo-800">
              <strong>Review confirms</strong> payslip amounts are verified and ready for final lock. After approval, the payroll can be locked to prevent changes.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReviewDialog(null); setReviewNotes(""); }}>Cancel</Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ id: reviewDialog?.id, notes: reviewNotes.trim() })}>
              {reviewMutation.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Reviewing...</> : <><CheckCircle className="h-4 w-4 mr-1" /> Approve</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <Dialog open={!!rerunDialog} onOpenChange={(open) => { if (!open) { setRerunDialog(null); setRerunReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Unlock className="h-5 w-5 text-orange-600" /> Unlock & Re-run Payroll</DialogTitle>
            <DialogDescription>
              This will unlock <strong>{rerunDialog?.title}</strong>, delete existing payslips, and regenerate them with current data. This is Re-run #{(rerunDialog?.rerun_count || 0) + 1}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Reason for Re-run <span className="text-destructive">*</span></Label>
              <Textarea
                value={rerunReason}
                onChange={(e) => setRerunReason(e.target.value)}
                placeholder="e.g. Attendance correction for 3 employees, salary revision applied..."
                className="mt-1"
              />
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-800">
              <strong>Warning:</strong> All existing payslips for this run will be deleted and regenerated. Make sure any corrections are already applied before proceeding.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRerunDialog(null); setRerunReason(""); }}>Cancel</Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700"
              disabled={!rerunReason.trim() || rerunMutation.isPending}
              onClick={() => rerunMutation.mutate({ id: rerunDialog?.id, reason: rerunReason.trim() })}
            >
              {rerunMutation.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Processing...</> : <><RefreshCw className="h-4 w-4 mr-1" /> Unlock & Re-run</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Statutory Reports */}
      <Card className="mt-6">
        <CardContent className="p-5">
          <StatutoryReportsPanel />
        </CardContent>
      </Card>
    </div>
  );
}
