import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Wallet, Search, CheckCircle, XCircle, Clock, IndianRupee, TrendingDown } from "lucide-react";
import { format } from "date-fns";

export default function LoansPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState({
    employee_id: "", loan_type: "salary_advance", amount: "", emi_amount: "",
    tenure_months: "1", interest_rate: "0", start_emi_date: "", reason: "", notes: "",
  });
  const [selectedLoan, setSelectedLoan] = useState<any>(null);

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
      const { data } = await (supabase as any).from("hr_employees").select("id, badge_id, first_name, last_name").eq("is_active", true).order("first_name");
      return data || [];
    },
  });

  const { data: repayments = [] } = useQuery({
    queryKey: ["hr_loan_repayments", selectedLoan?.id],
    queryFn: async () => {
      if (!selectedLoan?.id) return [];
      const { data } = await (supabase as any).from("hr_loan_repayments").select("*").eq("loan_id", selectedLoan.id).order("repayment_date", { ascending: false });
      return data || [];
    },
    enabled: !!selectedLoan?.id,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const amount = Number(form.amount);
      const emiAmount = Number(form.emi_amount);
      if (!form.employee_id || !amount || !emiAmount || !form.start_emi_date) throw new Error("Fill all required fields");
      const { error } = await (supabase as any).from("hr_loans").insert({
        employee_id: form.employee_id,
        loan_type: form.loan_type,
        amount,
        outstanding_balance: amount,
        emi_amount: emiAmount,
        tenure_months: Number(form.tenure_months) || 1,
        interest_rate: Number(form.interest_rate) || 0,
        start_emi_date: form.start_emi_date,
        disbursement_date: new Date().toISOString().slice(0, 10),
        reason: form.reason || null,
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_loans"] });
      setShowCreate(false);
      setForm({ employee_id: "", loan_type: "salary_advance", amount: "", emi_amount: "", tenure_months: "1", interest_rate: "0", start_emi_date: "", reason: "", notes: "" });
      toast.success("Loan/advance created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "approved" | "rejected" }) => {
      const update: any = { status: action === "approved" ? "active" : "rejected", [`${action === "approved" ? "approved" : "rejection_reason"}_at`]: new Date().toISOString() };
      if (action === "approved") update.approved_at = new Date().toISOString();
      const { error } = await (supabase as any).from("hr_loans").update({ status: action === "approved" ? "active" : "rejected" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_loans"] });
      toast.success("Loan status updated");
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
      case "pending": return "bg-amber-100 text-amber-700";
      case "active": return "bg-green-100 text-green-700";
      case "closed": return "bg-muted text-muted-foreground";
      case "rejected": return "bg-red-100 text-red-700";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Loans & Advances</h1>
          <p className="text-sm text-muted-foreground">Manage employee salary advances and loan EMI deductions</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-[#E8604C] hover:bg-[#d4553f]">
          <Plus className="h-4 w-4 mr-2" /> New Loan/Advance
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Loans", value: loans.length, icon: Wallet, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Total Disbursed", value: `₹${totalDisbursed.toLocaleString("en-IN")}`, icon: IndianRupee, color: "text-green-600", bg: "bg-green-50" },
          { label: "Outstanding", value: `₹${totalOutstanding.toLocaleString("en-IN")}`, icon: TrendingDown, color: "text-red-600", bg: "bg-red-50" },
          { label: "Pending Approval", value: pendingCount, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
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
          <Input placeholder="Search employee..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                {["Employee", "Type", "Amount", "EMI", "Outstanding", "Tenure", "Start EMI", "Status", "Actions"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">No loans found</td></tr>
              ) : (
                filtered.map((l: any) => (
                  <tr key={l.id} className="border-b hover:bg-muted/20 cursor-pointer" onClick={() => setSelectedLoan(l)}>
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{l.hr_employees?.first_name} {l.hr_employees?.last_name}</td>
                    <td className="px-4 py-3 capitalize">{l.loan_type?.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 font-medium">₹{Number(l.amount).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3">₹{Number(l.emi_amount).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 font-semibold text-red-600">₹{Number(l.outstanding_balance).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3">{l.tenure_months} mo</td>
                    <td className="px-4 py-3 text-muted-foreground">{l.start_emi_date}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(l.status)}`}>{l.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {l.status === "pending" && (
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-600" onClick={() => approveMutation.mutate({ id: l.id, action: "approved" })}>
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" onClick={() => approveMutation.mutate({ id: l.id, action: "rejected" })}>
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
        <DialogContent className="max-w-lg">
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
                <div><p className="text-muted-foreground">Outstanding</p><p className="font-bold text-red-600">₹{Number(selectedLoan.outstanding_balance).toLocaleString("en-IN")}</p></div>
                <div><p className="text-muted-foreground">EMI</p><p className="font-medium">₹{Number(selectedLoan.emi_amount).toLocaleString("en-IN")}/mo</p></div>
                <div><p className="text-muted-foreground">Tenure</p><p className="font-medium">{selectedLoan.tenure_months} months</p></div>
                <div><p className="text-muted-foreground">Disbursed</p><p className="font-medium">{selectedLoan.disbursement_date}</p></div>
                <div><p className="text-muted-foreground">EMI Start</p><p className="font-medium">{selectedLoan.start_emi_date}</p></div>
              </div>
              {selectedLoan.reason && <div className="text-sm"><p className="text-muted-foreground">Reason</p><p>{selectedLoan.reason}</p></div>}

              <div>
                <h4 className="text-sm font-semibold mb-2">Repayment History</h4>
                {repayments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No repayments recorded yet.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {repayments.map((r: any) => (
                      <div key={r.id} className="flex items-center justify-between text-xs border-b border-border/50 pb-2">
                        <div>
                          <p className="font-medium">{r.repayment_date}</p>
                          <p className="text-muted-foreground capitalize">{r.repayment_type?.replace(/_/g, " ")}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-green-600">₹{Number(r.amount).toLocaleString("en-IN")}</p>
                          <p className="text-muted-foreground">Bal: ₹{Number(r.balance_after).toLocaleString("en-IN")}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
