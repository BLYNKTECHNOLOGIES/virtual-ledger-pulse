import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw, Trash2, HandCoins } from "lucide-react";

const INR = (n: any) =>
  n == null || n === "" ? "—" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

async function invokeProxy(action: string, data: Record<string, unknown>) {
  const { data: res, error } = await supabase.functions.invoke("razorpay-payroll-proxy", {
    body: { action, data },
  });
  if (error) throw new Error(error.message || "Proxy call failed");
  if (res && typeof res === "object" && "ok" in res && !(res as any).ok) {
    throw new Error((res as any).error || "Razorpay rejected the request");
  }
  return res as any;
}

/** Full-org contractor payouts management. Rendered as a Station on the RazorpaySyncPage. */
export function ContractorPayoutsHub() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: rows, isLoading, refetch } = useQuery({
    queryKey: ["hr_rzp_contractor_payments"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_razorpay_contractor_payments")
        .select("*")
        .order("execute_on", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: contractors } = useQuery({
    queryKey: ["hr_contractor_employees"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_employee_work_info")
        .select("employee_id, employee_type, hr_employees:employee_id(id, first_name, last_name, email)")
        .ilike("employee_type", "%contract%");
      if (error) throw error;
      return (data || []).filter((r: any) => r.hr_employees?.email);
    },
  });

  const refreshFromRazorpay = async () => {
    setRefreshing("all");
    try {
      const res = await invokeProxy("contractor_payment_list", {});
      const list = res?.body?.data ?? res?.body?.["contractor-payments"] ?? res?.body ?? [];
      const items = Array.isArray(list) ? list : [];
      const countSnap = Number(res?.body?.count ?? items.length) || items.length;
      // Upsert into local cache. Best-effort employee mapping by email if provided.
      for (const it of items) {
        const email = it["employee-email"] ?? it.email ?? null;
        let empId: string | null = null;
        if (email) {
          const { data: emp } = await (supabase as any)
            .from("hr_employees").select("id").eq("email", email).maybeSingle();
          empId = emp?.id ?? null;
        }
        const paymentId = it["contractor-payment-id"] ?? it.id ?? null;
        if (!paymentId) continue;
        await (supabase as any).from("hr_razorpay_contractor_payments").upsert({
          razorpay_payment_id: Number(paymentId),
          hr_employee_id: empId,
          employee_email: email,
          amount: Number(it.amount ?? 0),
          tax: Number(it.tax ?? 0),
          purpose: it.purpose ?? it.description ?? null,
          execute_on: it["execute-on"] ?? it.executeOn ?? null,
          remarks: it.remarks ?? null,
          paid: Boolean(it.paid ?? false),
          status: it.status ?? (it.paid ? "paid" : "pending"),
          from_email: it.from ?? it["from-email"] ?? null,
          queued_on: it.created_at ?? it["created-at"] ?? null,
          razorpay_count_snapshot: countSnap,
          raw_payload: it,
          last_synced_at: new Date().toISOString(),
        }, { onConflict: "razorpay_payment_id" });
      }
      toast.success(`Refreshed ${items.length} pending payouts from RazorpayX`);
      qc.invalidateQueries({ queryKey: ["hr_rzp_contractor_payments"] });
    } catch (e: any) {
      toast.error(e.message || "Refresh failed");
    } finally {
      setRefreshing(null);
    }
  };


  const refreshOne = async (row: any) => {
    setRefreshing(row.id);
    try {
      const res = await invokeProxy("contractor_payment_status", {
        "contractor-payment-id": row.razorpay_payment_id,
      });
      const it = res?.body?.data ?? res?.body ?? {};
      await (supabase as any).from("hr_razorpay_contractor_payments")
        .update({
          paid: Boolean(it.paid ?? row.paid),
          status: it.status ?? row.status,
          from_email: it.from ?? it["from-email"] ?? row.from_email ?? null,
          queued_on: it.created_at ?? it["created-at"] ?? row.queued_on ?? null,
          raw_payload: it,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      toast.success("Status refreshed");
      qc.invalidateQueries({ queryKey: ["hr_rzp_contractor_payments"] });
    } catch (e: any) {
      toast.error(e.message || "Refresh failed");
    } finally {
      setRefreshing(null);
    }
  };

  const deleteOne = async (row: any) => {
    if (row.paid) return;
    setRefreshing(row.id);
    try {
      await invokeProxy("contractor_payment_delete", {
        "contractor-payment-id": row.razorpay_payment_id,
      });
      await (supabase as any).from("hr_razorpay_contractor_payments").delete().eq("id", row.id);
      toast.success("Payout deleted in RazorpayX");
      qc.invalidateQueries({ queryKey: ["hr_rzp_contractor_payments"] });
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    } finally {
      setRefreshing(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <HandCoins className="w-5 h-5 text-primary" />
          <div>
            <h3 className="text-base font-semibold text-foreground">Contractor payouts</h3>
            <p className="text-xs text-muted-foreground">
              Pending payouts queued in RazorpayX for contractor employees.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={refreshFromRazorpay} disabled={refreshing === "all"}>
            {refreshing === "all" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Refresh from RazorpayX
          </Button>
          <NewPayoutDialog
            open={creating}
            onOpenChange={setCreating}
            contractors={contractors || []}
            onCreated={() => { setCreating(false); refetch(); }}
          />
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-4">Loading…</p>
      ) : !rows || rows.length === 0 ? (
        <div className="border border-border rounded-lg p-6 text-center bg-muted/20">
          <p className="text-sm text-foreground font-medium">No contractor payouts synced yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Click "Refresh from RazorpayX" to pull the pending queue.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {rows.map((r: any) => (
              <div key={r.id} className="border border-border rounded-lg p-3 space-y-2 bg-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.employee_email || "—"}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{r.purpose || "—"}</p>
                  </div>
                  <Badge variant={r.paid ? "default" : "outline"} className={r.paid ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/40 text-[10px]" : "text-[10px]"}>
                    {r.status || (r.paid ? "paid" : "pending")}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><p className="text-[10px] uppercase text-muted-foreground">Amount</p><p className="font-medium">{INR(r.amount)}</p></div>
                  <div><p className="text-[10px] uppercase text-muted-foreground">Tax</p><p>{INR(r.tax)}</p></div>
                  <div><p className="text-[10px] uppercase text-muted-foreground">Execute on</p><p>{r.execute_on || "—"}</p></div>
                  <div><p className="text-[10px] uppercase text-muted-foreground">Queued</p><p>{r.queued_on ? new Date(r.queued_on).toLocaleDateString("en-IN") : "—"}</p></div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" className="min-h-11 flex-1" onClick={() => refreshOne(r)} disabled={refreshing === r.id}>
                    {refreshing === r.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                    Refresh
                  </Button>
                  {!r.paid && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" className="min-h-11 text-destructive">
                          <Trash2 className="w-3 h-3 mr-1" /> Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this payout?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Removes payout #{r.razorpay_payment_id} for {r.employee_email} from RazorpayX. Only unpaid payouts can be deleted.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteOne(r)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border text-xs text-muted-foreground uppercase">
                <th className="text-left py-2.5 px-3">Contractor</th>
                <th className="text-right py-2.5 px-3">Amount</th>
                <th className="text-right py-2.5 px-3">Tax</th>
                <th className="text-left py-2.5 px-3">Purpose</th>
                <th className="text-left py-2.5 px-3">Execute on</th>
                <th className="text-left py-2.5 px-3">Queued on</th>
                <th className="text-left py-2.5 px-3">From</th>
                <th className="text-center py-2.5 px-3">Status</th>
                <th className="text-center py-2.5 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30">
                  <td className="py-2.5 px-3 text-foreground">{r.employee_email || "—"}</td>
                  <td className="py-2.5 px-3 text-right font-medium">{INR(r.amount)}</td>
                  <td className="py-2.5 px-3 text-right text-muted-foreground">{INR(r.tax)}</td>
                  <td className="py-2.5 px-3 text-muted-foreground">{r.purpose || "—"}</td>
                  <td className="py-2.5 px-3 text-muted-foreground">{r.execute_on || "—"}</td>
                  <td className="py-2.5 px-3 text-muted-foreground">{r.queued_on ? new Date(r.queued_on).toLocaleDateString("en-IN") : "—"}</td>
                  <td className="py-2.5 px-3 text-muted-foreground truncate max-w-[160px]" title={r.from_email || ""}>{r.from_email || "—"}</td>
                  <td className="py-2.5 px-3 text-center">
                    <Badge variant={r.paid ? "default" : "outline"} className={r.paid ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/40" : ""}>
                      {r.status || (r.paid ? "paid" : "pending")}
                    </Badge>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <div className="flex gap-1 justify-center">
                      <Button size="icon" variant="ghost" onClick={() => refreshOne(r)} disabled={refreshing === r.id}>
                        {refreshing === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      </Button>
                      {!r.paid && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="text-destructive">
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this payout?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Removes payout #{r.razorpay_payment_id} for {r.employee_email} from RazorpayX. Only unpaid payouts can be deleted.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteOne(r)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>

      )}
    </div>
  );
}

function NewPayoutDialog({
  open, onOpenChange, contractors, onCreated,
}: { open: boolean; onOpenChange: (o: boolean) => void; contractors: any[]; onCreated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [employeeId, setEmployeeId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [tax, setTax] = useState("");
  const [purpose, setPurpose] = useState("");
  const [executeOn, setExecuteOn] = useState("");
  const [remarks, setRemarks] = useState("");

  const submit = async () => {
    if (!employeeId || !Number(amount) || !purpose || !executeOn) {
      toast.error("Employee, amount, purpose and execute date are required");
      return;
    }
    const emp = contractors.find((c) => String(c.hr_employees?.id) === employeeId);
    const email = emp?.hr_employees?.email;
    if (!email) { toast.error("Contractor email missing"); return; }
    setBusy(true);
    try {
      const res = await invokeProxy("contractor_payment_create", {
        email,
        amount: Number(amount),
        tax: Number(tax || 0),
        purpose,
        "execute-on": executeOn,
        remarks,
      });
      const paymentId = res?.body?.["contractor-payment-id"] ?? res?.body?.id;
      if (paymentId) {
        await (supabase as any).from("hr_razorpay_contractor_payments").insert({
          razorpay_payment_id: Number(paymentId),
          hr_employee_id: employeeId,
          employee_email: email,
          amount: Number(amount),
          tax: Number(tax || 0),
          purpose,
          execute_on: executeOn,
          remarks,
          paid: false,
          status: "pending",
          raw_payload: res?.body || {},
          last_synced_at: new Date().toISOString(),
        });
      }
      toast.success("Payout queued in RazorpayX");
      onCreated();
    } catch (e: any) {
      toast.error(e.message || "Create failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="w-4 h-4 mr-2" />New payout</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New contractor payout</DialogTitle>
          <DialogDescription>Queues a payout in RazorpayX. Employee must be classified as a contractor.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Contractor</Label>
            <select className="w-full border border-input rounded-md h-10 px-3 bg-background text-sm"
              value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Select contractor…</option>
              {contractors.map((c) => (
                <option key={c.hr_employees.id} value={c.hr_employees.id}>
                  {c.hr_employees.first_name} {c.hr_employees.last_name} · {c.hr_employees.email}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Amount (₹)</Label>
              <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">TDS Tax (₹)</Label>
              <Input type="number" inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Purpose</Label>
            <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. October 2026 retainer" />
          </div>
          <div>
            <Label className="text-xs">Execute on</Label>
            <Input type="date" value={executeOn} onChange={(e) => setExecuteOn(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Remarks</Label>
            <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create payout
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
