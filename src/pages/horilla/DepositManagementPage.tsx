import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, Wallet, Eye, Edit2, CheckCircle, Clock, ArrowUpDown, BadgeIndianRupee, Shield } from "lucide-react";

export default function DepositManagementPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showTransactions, setShowTransactions] = useState<string | null>(null);
  const [editingDeposit, setEditingDeposit] = useState<any>(null);
  const [form, setForm] = useState({
    employee_id: "",
    total_deposit_amount: "",
    deduction_mode: "fixed_installment",
    deduction_value: "",
    deduction_start_month: format(new Date(), "yyyy-MM"),
  });

  // Fetch deposits with employee info
  const { data: deposits = [], isLoading } = useQuery({
    queryKey: ["hr_employee_deposits"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_employee_deposits")
        .select("*, hr_employees!hr_employee_deposits_employee_id_fkey(id, badge_id, first_name, last_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch employees
  const { data: employees = [] } = useQuery({
    queryKey: ["hr_employees_active_deposit"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_employees").select("id, badge_id, first_name, last_name, total_salary").eq("is_active", true).order("first_name");
      return data || [];
    },
  });

  // Fetch transactions for selected deposit
  const { data: transactions = [] } = useQuery({
    queryKey: ["hr_deposit_transactions", showTransactions],
    queryFn: async () => {
      if (!showTransactions) return [];
      const { data, error } = await (supabase as any)
        .from("hr_deposit_transactions")
        .select("*")
        .eq("deposit_id", showTransactions)
        .order("transaction_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!showTransactions,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("hr_employee_deposits").insert({
        employee_id: form.employee_id,
        total_deposit_amount: Number(form.total_deposit_amount),
        deduction_mode: form.deduction_mode,
        deduction_value: Number(form.deduction_value),
        deduction_start_month: form.deduction_start_month,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_employee_deposits"] });
      setShowAdd(false);
      setForm({ employee_id: "", total_deposit_amount: "", deduction_mode: "fixed_installment", deduction_value: "", deduction_start_month: format(new Date(), "yyyy-MM") });
      toast.success("Deposit configuration added");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("hr_employee_deposits").update({
        total_deposit_amount: Number(form.total_deposit_amount),
        deduction_mode: form.deduction_mode,
        deduction_value: Number(form.deduction_value),
        deduction_start_month: form.deduction_start_month,
        updated_at: new Date().toISOString(),
      }).eq("id", editingDeposit.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_employee_deposits"] });
      setShowEdit(false);
      setEditingDeposit(null);
      toast.success("Deposit updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const settleMutation = useMutation({
    mutationFn: async (deposit: any) => {
      // Insert ff_refund transaction
      await (supabase as any).from("hr_deposit_transactions").insert({
        employee_id: deposit.employee_id,
        deposit_id: deposit.id,
        transaction_type: "ff_refund",
        amount: -Number(deposit.current_balance),
        balance_after: 0,
        description: "F&F Settlement - Deposit Refunded",
        transaction_date: new Date().toISOString().slice(0, 10),
      });
      // Mark deposit as settled
      const { error } = await (supabase as any).from("hr_employee_deposits").update({
        is_settled: true,
        settled_at: new Date().toISOString(),
        current_balance: 0,
        settlement_notes: "Full & Final settlement",
        updated_at: new Date().toISOString(),
      }).eq("id", deposit.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_employee_deposits"] });
      toast.success("Deposit settled (F&F)");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (d: any) => {
    setEditingDeposit(d);
    setForm({
      employee_id: d.employee_id,
      total_deposit_amount: String(d.total_deposit_amount),
      deduction_mode: d.deduction_mode,
      deduction_value: String(d.deduction_value),
      deduction_start_month: d.deduction_start_month || "",
    });
    setShowEdit(true);
  };

  const totalDeposits = deposits.reduce((s: number, d: any) => s + Number(d.total_deposit_amount || 0), 0);
  const totalCollected = deposits.reduce((s: number, d: any) => s + Number(d.collected_amount || 0), 0);
  const totalBalance = deposits.reduce((s: number, d: any) => s + Number(d.current_balance || 0), 0);
  const fullyCollected = deposits.filter((d: any) => d.is_fully_collected).length;

  const modeLabel = (mode: string) => {
    switch (mode) {
      case "one_time": return "One-Time";
      case "percentage": return "% of Salary";
      case "fixed_installment": return "Fixed/Month";
      default: return mode;
    }
  };

  const txTypeColor = (type: string) => {
    switch (type) {
      case "collection": return "bg-green-100 text-green-700";
      case "penalty_deduction": return "bg-red-100 text-red-700";
      case "replenishment": return "bg-blue-100 text-blue-700";
      case "ff_refund": return "bg-purple-100 text-purple-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  const txTypeLabel = (type: string) => {
    switch (type) {
      case "collection": return "Collection";
      case "penalty_deduction": return "Penalty Deduction";
      case "replenishment": return "Replenishment";
      case "ff_refund": return "F&F Refund";
      default: return type;
    }
  };

  const DepositForm = ({ isEdit }: { isEdit: boolean }) => (
    <div className="space-y-4">
      {!isEdit && (
        <div>
          <Label>Employee</Label>
          <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
            <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
            <SelectContent>
              {employees.map((e: any) => (
                <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.badge_id})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div>
        <Label>Total Deposit Amount (₹)</Label>
        <Input type="number" min="0" value={form.total_deposit_amount} onChange={(e) => setForm({ ...form, total_deposit_amount: e.target.value })} placeholder="e.g. 15000" />
      </div>
      <div>
        <Label>Deduction Mode</Label>
        <Select value={form.deduction_mode} onValueChange={(v) => setForm({ ...form, deduction_mode: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="one_time">One-Time (Full deduction at once)</SelectItem>
            <SelectItem value="percentage">Percentage of Monthly Salary</SelectItem>
            <SelectItem value="fixed_installment">Fixed Amount per Month</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>{form.deduction_mode === "percentage" ? "Percentage (%)" : "Amount (₹)"}</Label>
        <Input type="number" min="0" step={form.deduction_mode === "percentage" ? "1" : "100"} value={form.deduction_value} onChange={(e) => setForm({ ...form, deduction_value: e.target.value })} placeholder={form.deduction_mode === "percentage" ? "e.g. 50" : "e.g. 5000"} />
        {form.deduction_mode === "percentage" && <p className="text-xs text-muted-foreground mt-1">% of gross salary deducted each month</p>}
        {form.deduction_mode === "one_time" && <p className="text-xs text-muted-foreground mt-1">Full amount deducted in the first payroll</p>}
      </div>
      <div>
        <Label>Deduction Start Month</Label>
        <Input type="month" value={form.deduction_start_month} onChange={(e) => setForm({ ...form, deduction_start_month: e.target.value })} />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Deposit Management</h1>
          <p className="text-sm text-muted-foreground">Track employee security deposits, collections, and settlements</p>
        </div>
        <Button onClick={() => { setForm({ employee_id: "", total_deposit_amount: "", deduction_mode: "fixed_installment", deduction_value: "", deduction_start_month: format(new Date(), "yyyy-MM") }); setShowAdd(true); }} className="bg-[#E8604C] hover:bg-[#d4553f]">
          <Plus className="h-4 w-4 mr-1" /> Add Deposit
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Deposits", value: `₹${totalDeposits.toLocaleString()}`, icon: Wallet, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Collected", value: `₹${totalCollected.toLocaleString()}`, icon: BadgeIndianRupee, color: "text-green-600", bg: "bg-green-50" },
          { label: "Current Balance", value: `₹${totalBalance.toLocaleString()}`, icon: Shield, color: "text-purple-600", bg: "bg-purple-50" },
          { label: "Fully Collected", value: `${fullyCollected}/${deposits.length}`, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
              <div><p className="text-xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Deposits Table */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Employee Deposits</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Total Deposit</TableHead>
                <TableHead>Collected</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : deposits.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No deposits configured</TableCell></TableRow>
              ) : (
                deposits.map((d: any) => {
                  const progress = d.total_deposit_amount > 0 ? Math.round((d.collected_amount / d.total_deposit_amount) * 100) : 0;
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">
                        {d.hr_employees?.first_name} {d.hr_employees?.last_name}
                        <span className="text-xs text-muted-foreground ml-1">({d.hr_employees?.badge_id})</span>
                      </TableCell>
                      <TableCell className="font-medium">₹{Number(d.total_deposit_amount).toLocaleString()}</TableCell>
                      <TableCell className="text-green-600">₹{Number(d.collected_amount).toLocaleString()}</TableCell>
                      <TableCell className="text-purple-600 font-medium">₹{Number(d.current_balance).toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={progress} className="h-2 w-20" />
                          <span className="text-xs text-muted-foreground">{progress}%</span>
                        </div>
                      </TableCell>
                      <TableCell><span className="text-xs">{modeLabel(d.deduction_mode)}</span></TableCell>
                      <TableCell className="text-sm">
                        {d.deduction_mode === "percentage" ? `${d.deduction_value}%` : `₹${Number(d.deduction_value).toLocaleString()}`}
                      </TableCell>
                      <TableCell>
                        {d.is_settled ? (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">Settled</span>
                        ) : d.is_fully_collected ? (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">Fully Collected</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">Collecting</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-7" onClick={() => setShowTransactions(d.id)} title="View Transactions">
                            <Eye className="h-3 w-3" />
                          </Button>
                          {!d.is_settled && (
                            <>
                              <Button size="sm" variant="ghost" className="h-7" onClick={() => openEdit(d)} title="Edit">
                                <Edit2 className="h-3 w-3" />
                              </Button>
                              {d.is_fully_collected && d.current_balance > 0 && (
                                <Button size="sm" variant="ghost" className="h-7 text-purple-600" onClick={() => settleMutation.mutate(d)} title="F&F Settle">
                                  <CheckCircle className="h-3 w-3" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Employee Deposit</DialogTitle>
            <DialogDescription>Configure deposit amount and deduction schedule for an employee</DialogDescription>
          </DialogHeader>
          <DepositForm isEdit={false} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={!form.employee_id || !form.total_deposit_amount || !form.deduction_value} className="bg-[#E8604C] hover:bg-[#d4553f]">
              Add Deposit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Deposit Configuration</DialogTitle>
            <DialogDescription>Update deposit amount or deduction schedule</DialogDescription>
          </DialogHeader>
          <DepositForm isEdit={true} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button onClick={() => editMutation.mutate()} disabled={!form.total_deposit_amount || !form.deduction_value} className="bg-[#E8604C] hover:bg-[#d4553f]">
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transactions Dialog */}
      <Dialog open={!!showTransactions} onOpenChange={(open) => !open && setShowTransactions(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Deposit Transactions</DialogTitle>
            <DialogDescription>All movements for this deposit</DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Balance After</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No transactions yet</TableCell></TableRow>
                ) : (
                  transactions.map((t: any) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-sm">{t.transaction_date}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${txTypeColor(t.transaction_type)}`}>
                          {txTypeLabel(t.transaction_type)}
                        </span>
                      </TableCell>
                      <TableCell className={`font-medium ${Number(t.amount) >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {Number(t.amount) >= 0 ? "+" : ""}₹{Math.abs(Number(t.amount)).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-sm">₹{Number(t.balance_after).toLocaleString()}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{t.description || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
