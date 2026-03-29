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
      // Call server-side payroll engine RPC (GAP-V5-03)
      const { data: result, error } = await (supabase as any)
        .rpc("fn_generate_payroll", { p_payroll_run_id: run.id });
      if (error) throw error;

      qc.invalidateQueries({ queryKey: ["hr_payroll_runs"] });
      qc.invalidateQueries({ queryKey: ["hr_payslips"] });
      toast.success(`Generated ${result?.payslip_count || 0} payslips (server-side)`);
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
