import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Wallet, Search, CheckCircle, XCircle, Clock, IndianRupee, TrendingDown } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { NewSalaryAdvanceDialog } from "@/components/hrms/salary/NewSalaryAdvanceDialog";

export default function LoansPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showAdvance, setShowAdvance] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState({
    employee_id: "", loan_type: "salary_advance", amount: "", emi_amount: "",
    tenure_months: "1", interest_rate: "0", start_emi_date: "", reason: "", notes: "",
  });
  const [selectedLoan, setSelectedLoan] = useState<any>(null);
  const [manual, setManual] = useState({ amount: "", date: new Date().toISOString().slice(0, 10), notes: "" });
  const [closeConfirm, setCloseConfirm] = useState<"settled" | "written_off" | null>(null);

  const { data: loans = [], isLoading } = useQuery({
    queryKey: ["hr_loans"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_loans")
        .select("*, hr_employees!hr_loans_employee_id_fkey(first_name, last_name, badge_id)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr_employees_active_loans"],
    queryFn: async () => {
      const data = await fetchAllPaginated<any>(() => (supabase as any).from("hr_employees").select("id, badge_id, first_name, last_name").eq("is_active", true).order("first_name"));
      return data || [];
    },
  });

  const { data: repayments = [] } = useQuery({
    queryKey: ["hr_loan_repayments", selectedLoan?.id],
    queryFn: async () => {
      if (!selectedLoan?.id) return [];
      const { data } = await (supabase as any)
        .from("hr_loan_repayments")
        .select("*")
        .eq("loan_id", selectedLoan.id)
        .order("installment_no", { ascending: true, nullsFirst: false })
        .order("repayment_date", { ascending: true });
      return data || [];
    },
    enabled: !!selectedLoan?.id,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const amount = Number(form.amount);
      const emiAmount = Number(form.emi_amount);
      const tenure = Number(form.tenure_months) || 0;
      if (!form.employee_id || !amount || !emiAmount || !form.start_emi_date) throw new Error("Fill all required fields");
      if (amount <= 0 || emiAmount <= 0 || tenure <= 0) throw new Error("Amount, EMI and tenure must be greater than zero");
      // Recovery must fully cover the principal within the stated tenure.
      if (emiAmount * tenure < amount - 0.01) {
        throw new Error(
          `EMI × tenure (₹${(emiAmount * tenure).toLocaleString("en-IN")}) is less than the loan amount (₹${amount.toLocaleString("en-IN")}). Raise the EMI or the tenure.`,
        );
      }
      if (emiAmount > amount) throw new Error("EMI cannot exceed the loan amount");
      const { error } = await (supabase as any).from("hr_loans").insert({
        employee_id: form.employee_id,
        loan_type: form.loan_type,
        amount,
        outstanding_balance: amount,
        emi_amount: emiAmount,
        tenure_months: tenure,
        interest_rate: Number(form.interest_rate) || 0,
        start_emi_date: form.start_emi_date,
        reason: form.reason || null,
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_loans"] });
      setShowCreate(false);
      setForm({ employee_id: "", loan_type: "salary_advance", amount: "", emi_amount: "", tenure_months: "1", interest_rate: "0", start_emi_date: "", reason: "", notes: "" });
      toast.success("Loan/advance created — pending approval");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "approved" | "rejected" }) => {
      if (action === "rejected") {
        const { error } = await (supabase as any).from("hr_loans").update({ status: "rejected" }).eq("id", id);
        if (error) throw error;
        return;
      }
      // State machine: pending -> approved -> active (the DB trigger rejects a direct jump).
      // Disbursement is stamped at approval, not at creation.
      const { error: e1 } = await (supabase as any)
        .from("hr_loans")
        .update({ status: "approved", approved_at: new Date().toISOString(), disbursement_date: new Date().toISOString().slice(0, 10) })
        .eq("id", id);
      if (e1) throw e1;
      const { error: e2 } = await (supabase as any).from("hr_loans").update({ status: "active" }).eq("id", id);
      if (e2) throw e2;
      // Build the month-by-month EMI plan so the daily scheduler can push it to RazorpayX
      const { error: e3 } = await (supabase as any).rpc("hr_rebuild_loan_schedule", { p_loan_id: id });
      if (e3) throw e3;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["hr_loans"] });
      toast.success(vars.action === "approved" ? "Loan approved — EMI schedule generated" : "Loan rejected");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Repayment received outside payroll (cash / bank transfer)
  const manualRepay = useMutation({
    mutationFn: async () => {
      const amount = Number(manual.amount);
      if (!selectedLoan?.id || !amount || amount <= 0) throw new Error("Enter a valid amount");
      const { error } = await (supabase as any).rpc("hr_record_manual_loan_repayment", {
        p_loan_id: selectedLoan.id,
        p_amount: amount,
        p_repayment_date: manual.date,
        p_notes: manual.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_loans"] });
      qc.invalidateQueries({ queryKey: ["hr_loan_repayments", selectedLoan?.id] });
      setManual({ amount: "", date: new Date().toISOString().slice(0, 10), notes: "" });
      toast.success("Repayment recorded — remaining schedule rebuilt");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Foreclose / write off — clears unpaid installments so nothing more is pushed
  const closeLoan = useMutation({
    mutationFn: async (mode: "settled" | "written_off") => {
      const { error } = await (supabase as any).rpc("hr_close_loan", {
        p_loan_id: selectedLoan.id,
        p_mode: mode,
        p_reason: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_loans"] });
      qc.invalidateQueries({ queryKey: ["hr_loan_repayments", selectedLoan?.id] });
      setCloseConfirm(null);
      setSelectedLoan(null);
      toast.success("Loan closed — pending recoveries cancelled");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Pause stops the scheduler from pushing further EMIs; resume rebuilds the plan
  const togglePause = useMutation({
    mutationFn: async (pause: boolean) => {
      const { error } = await (supabase as any)
        .from("hr_loans")
        .update({ status: pause ? "paused" : "active" })
        .eq("id", selectedLoan.id);
      if (error) throw error;
      if (!pause) {
        const { error: e2 } = await (supabase as any).rpc("hr_rebuild_loan_schedule", { p_loan_id: selectedLoan.id });
        if (e2) throw e2;
      }
    },
    onSuccess: (_d, pause) => {
      qc.invalidateQueries({ queryKey: ["hr_loans"] });
      qc.invalidateQueries({ queryKey: ["hr_loan_repayments", selectedLoan?.id] });
      setSelectedLoan((prev: any) => (prev ? { ...prev, status: pause ? "paused" : "active" } : prev));
      toast.success(pause ? "Recovery paused" : "Recovery resumed — schedule rebuilt");
    },
    onError: (e: any) => toast.error(e.message),
  });



  const filtered = loans.filter((l: any) => {
    const q = search.toLowerCase();
    const name = `${l.hr_employees?.first_name || ""} ${l.hr_employees?.last_name || ""}`.toLowerCase();
    const matchSearch = !search || name.includes(q) || l.hr_employees?.badge_id?.toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || l.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalDisbursed = loans.filter((l: any) => l.status === "active").reduce((s: number, l: any) => s + Number(l.amount || 0), 0);
  const totalOutstanding = loans.filter((l: any) => l.status === "active").reduce((s: number, l: any) => s + Number(l.outstanding_balance || 0), 0);
  const pendingCount = loans.filter((l: any) => l.status === "pending").length;

  const statusColor = (s: string) => {
    switch (s) {
      case "pending": return "bg-warning/10 text-warning";
      case "active": return "bg-success/10 text-success";
      case "closed": return "bg-muted text-muted-foreground";
      case "rejected": return "bg-destructive/10 text-destructive";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Loans & Advances</h1>
          <p className="text-sm text-muted-foreground">Manage employee salary advances and loan EMI deductions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowAdvance(true)}>
            <IndianRupee className="h-4 w-4 mr-2" /> New Salary Advance
          </Button>
          <Button onClick={() => setShowCreate(true)} className="bg-[#E8604C] hover:bg-[#d4553f]">
            <Plus className="h-4 w-4 mr-2" /> New Loan
          </Button>
        </div>
      </div>

      <NewSalaryAdvanceDialog open={showAdvance} onOpenChange={setShowAdvance} employees={employees as any} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Loans", value: loans.length, icon: Wallet, color: "text-info", bg: "bg-info/10" },
          { label: "Total Disbursed", value: `₹${totalDisbursed.toLocaleString("en-IN")}`, icon: IndianRupee, color: "text-success", bg: "bg-success/10" },
          { label: "Outstanding", value: `₹${totalOutstanding.toLocaleString("en-IN")}`, icon: TrendingDown, color: "text-destructive", bg: "bg-destructive/10" },
          { label: "Pending Approval", value: pendingCount, icon: Clock, color: "text-warning", bg: "bg-warning/10" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
              <div><p className="text-xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search employee..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-2">
        {isLoading ? (
          <TableSkeleton rows={4} columns={2} />
        ) : filtered.length === 0 ? (
          <Card><CardContent className="p-0"><EmptyState icon={Wallet} title="No loans found" description="Create a loan or advance for an employee." /></CardContent></Card>
        ) : filtered.map((l: any) => (
          <Card key={l.id} onClick={() => setSelectedLoan(l)} className="cursor-pointer active:bg-muted/50">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{l.hr_employees?.first_name} {l.hr_employees?.last_name}</div>
                  <div className="text-xs text-muted-foreground capitalize">{l.loan_type?.replace(/_/g, " ")} · {l.tenure_months} mo</div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${statusColor(l.status)}`}>{l.status}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div><div className="text-[10px] text-muted-foreground">Amount</div><div className="font-medium tabular-nums">₹{Number(l.amount).toLocaleString("en-IN")}</div></div>
                <div><div className="text-[10px] text-muted-foreground">EMI</div><div className="tabular-nums">₹{Number(l.emi_amount).toLocaleString("en-IN")}</div></div>
                <div><div className="text-[10px] text-muted-foreground">Outstanding</div><div className="font-semibold text-destructive tabular-nums">₹{Number(l.outstanding_balance).toLocaleString("en-IN")}</div></div>
              </div>
              {l.status === "pending" && (
                <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="outline" className="flex-1 h-10 text-success" onClick={() => approveMutation.mutate({ id: l.id, action: "approved" })}>
                    <CheckCircle className="h-4 w-4 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 h-10 text-destructive" onClick={() => approveMutation.mutate({ id: l.id, action: "rejected" })}>
                    <XCircle className="h-4 w-4 mr-1" /> Reject
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desktop table */}
      <Card className="hidden md:block">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                {["Employee", "Type", "Amount", "EMI", "Outstanding", "Tenure", "Start EMI", "Status", "Actions"].map((h) => (
                  <th key={h} className={`px-4 py-3 text-[11px] uppercase tracking-wide text-muted-foreground font-medium whitespace-nowrap ${["Amount","EMI","Outstanding"].includes(h) ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="p-0"><TableSkeleton rows={5} columns={9} /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9}><EmptyState icon={Wallet} title="No loans found" description="Create a loan or advance for an employee." /></td></tr>
              ) : (
                filtered.map((l: any) => (
                  <tr key={l.id} className="border-b hover:bg-muted/20 cursor-pointer" onClick={() => setSelectedLoan(l)}>
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{l.hr_employees?.first_name} {l.hr_employees?.last_name}</td>
                    <td className="px-4 py-3 capitalize">{l.loan_type?.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 font-medium text-right tabular-nums">₹{Number(l.amount).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-right tabular-nums">₹{Number(l.emi_amount).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 font-semibold text-destructive text-right tabular-nums">₹{Number(l.outstanding_balance).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3">{l.tenure_months} mo</td>
                    <td className="px-4 py-3 text-muted-foreground">{l.start_emi_date}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(l.status)}`}>{l.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {l.status === "pending" && (
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-success" onClick={() => approveMutation.mutate({ id: l.id, action: "approved" })}>
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => approveMutation.mutate({ id: l.id, action: "rejected" })}>
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Loan / Advance</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Employee *</Label>
              <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>{employees.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.badge_id})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Loan Type</Label>
                <Select value={form.loan_type} onValueChange={(v) => setForm({ ...form, loan_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="salary_advance">Salary Advance</SelectItem>
                    <SelectItem value="personal_loan">Personal Loan</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tenure (months)</Label>
                <Input type="number" value={form.tenure_months} onChange={(e) => setForm({ ...form, tenure_months: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Amount (₹) *</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
              <div><Label>EMI Amount (₹) *</Label><Input type="number" value={form.emi_amount} onChange={(e) => setForm({ ...form, emi_amount: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Interest Rate (%)</Label><Input type="number" value={form.interest_rate} onChange={(e) => setForm({ ...form, interest_rate: e.target.value })} /></div>
              <div><Label>Start EMI Date *</Label><Input type="date" value={form.start_emi_date} onChange={(e) => setForm({ ...form, start_emi_date: e.target.value })} /></div>
            </div>
            <div><Label>Reason</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Purpose of loan/advance..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="bg-[#E8604C] hover:bg-[#d4553f]">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Loan Detail Dialog */}
      <Dialog open={!!selectedLoan} onOpenChange={() => setSelectedLoan(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-[#E8604C]" />
              Loan Details — {selectedLoan?.hr_employees?.first_name} {selectedLoan?.hr_employees?.last_name}
            </DialogTitle>
          </DialogHeader>
          {selectedLoan && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-muted-foreground">Type</p><p className="font-medium capitalize">{selectedLoan.loan_type?.replace(/_/g, " ")}</p></div>
                <div><p className="text-muted-foreground">Status</p><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(selectedLoan.status)}`}>{selectedLoan.status}</span></div>
                <div><p className="text-muted-foreground">Amount</p><p className="font-bold">₹{Number(selectedLoan.amount).toLocaleString("en-IN")}</p></div>
                <div><p className="text-muted-foreground">Outstanding</p><p className="font-bold text-destructive">₹{Number(selectedLoan.outstanding_balance).toLocaleString("en-IN")}</p></div>
                <div><p className="text-muted-foreground">EMI</p><p className="font-medium">₹{Number(selectedLoan.emi_amount).toLocaleString("en-IN")}/mo</p></div>
                <div><p className="text-muted-foreground">Tenure</p><p className="font-medium">{selectedLoan.tenure_months} months</p></div>
                <div><p className="text-muted-foreground">Disbursed</p><p className="font-medium">{selectedLoan.disbursement_date || "—"}</p></div>
                <div><p className="text-muted-foreground">EMI Start</p><p className="font-medium">{selectedLoan.start_emi_date}</p></div>
              </div>
              {selectedLoan.reason && <div className="text-sm"><p className="text-muted-foreground">Reason</p><p>{selectedLoan.reason}</p></div>}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold">Recovery schedule</h4>
                  <span className="text-xs text-muted-foreground">
                    Recovered ₹{repayments.filter((r: any) => r.status === "paid").reduce((s: number, r: any) => s + Number(r.amount || 0), 0).toLocaleString("en-IN")} of ₹{Number(selectedLoan.amount).toLocaleString("en-IN")}
                  </span>
                </div>
                {repayments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No installments scheduled yet — approve the loan to generate the plan.</p>
                ) : (
                  <div className="border rounded-md overflow-hidden max-h-56 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 border-b sticky top-0">
                        <tr>
                          {["#", "Period", "Amount", "Status", "Balance after"].map((h) => (
                            <th key={h} className="px-2 py-1.5 text-left font-medium text-muted-foreground uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {repayments.map((r: any) => (
                          <tr key={r.id} className="border-b last:border-0">
                            <td className="px-2 py-1.5 text-muted-foreground">{r.installment_no ?? "—"}</td>
                            <td className="px-2 py-1.5">{r.period_month || r.repayment_date}</td>
                            <td className="px-2 py-1.5 tabular-nums">₹{Number(r.amount).toLocaleString("en-IN")}</td>
                            <td className="px-2 py-1.5">
                              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                                r.status === "paid" ? "bg-success/10 text-success"
                                : r.status === "failed" ? "bg-destructive/10 text-destructive"
                                : r.status === "pushed" ? "bg-info/10 text-info"
                                : "bg-muted text-muted-foreground"}`}>
                                {r.repayment_type === "manual" ? "manual · " : ""}{r.status || "scheduled"}
                              </span>
                              {r.failure_reason && <span className="block text-[10px] text-destructive">{r.failure_reason}</span>}
                            </td>
                            <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                              {r.balance_after != null ? `₹${Number(r.balance_after).toLocaleString("en-IN")}` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {["active", "approved", "paused"].includes(selectedLoan.status) && (
                <div className="border-t pt-4 space-y-3">
                  <h4 className="text-sm font-semibold">Record repayment received outside payroll</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div><Label className="text-xs">Amount (₹)</Label><Input type="number" value={manual.amount} onChange={(e) => setManual({ ...manual, amount: e.target.value })} /></div>
                    <div><Label className="text-xs">Date</Label><Input type="date" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} /></div>
                    <div><Label className="text-xs">Note</Label><Input value={manual.notes} onChange={(e) => setManual({ ...manual, notes: e.target.value })} placeholder="Cash / bank ref" /></div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => manualRepay.mutate()} disabled={manualRepay.isPending}>Record repayment</Button>
                    <Button size="sm" variant="outline" onClick={() => togglePause.mutate(selectedLoan.status !== "paused")} disabled={togglePause.isPending}>
                      {selectedLoan.status === "paused" ? "Resume recovery" : "Pause recovery"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setCloseConfirm("settled")}>Foreclose (settled)</Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setCloseConfirm("written_off")}>Write off</Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Paused loans stop being pushed to RazorpayX. Manual repayments rebuild the remaining installments automatically.
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>

      </Dialog>

      <AlertDialog open={!!closeConfirm} onOpenChange={(o) => !o && setCloseConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{closeConfirm === "written_off" ? "Write off this loan?" : "Foreclose this loan?"}</AlertDialogTitle>
            <AlertDialogDescription>
              All unpaid installments are cancelled and the outstanding balance is set to zero, so nothing further is pushed to RazorpayX. Installments already pushed for a running payroll month stay in effect.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={closeConfirm === "written_off" ? "bg-destructive text-destructive-foreground" : ""}
              onClick={() => closeConfirm && closeLoan.mutate(closeConfirm)}
              disabled={closeLoan.isPending}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>

  );
}
