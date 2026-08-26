import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useFileDropzone } from "@/hooks/useFileDropzone";
import { cn } from "@/lib/utils";
import { Landmark, Upload, X, FileText, Loader2, ShieldCheck, Clock, AlertTriangle } from "lucide-react";

export const BANK_CHANGE_STATUS_META: Record<
  string,
  { label: string; className: string; hint: string }
> = {
  pending: {
    label: "Awaiting HR verification",
    className: "bg-primary/10 text-primary border-primary/30",
    hint: "HR is verifying your documents.",
  },
  pending_razorpay: {
    label: "Awaiting payroll confirmation",
    className: "bg-warning/10 text-warning border-warning/30",
    hint: "HR approved it — waiting for the payroll system to confirm the new account.",
  },
  razorpay_failed: {
    label: "Payroll update failed",
    className: "bg-destructive/10 text-destructive border-destructive/30",
    hint: "The payroll system has not accepted the new account yet. HR is retrying.",
  },
  approved: {
    label: "Updated & confirmed",
    className: "bg-success/10 text-success border-success/30",
    hint: "Your salary account is updated and confirmed in the payroll system.",
  },
  rejected: {
    label: "Rejected",
    className: "bg-destructive/10 text-destructive border-destructive/30",
    hint: "HR rejected this request.",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-muted text-muted-foreground border-border",
    hint: "You cancelled this request.",
  },
};

const PROOF_TYPES = [
  { value: "cancelled_cheque", label: "Cancelled cheque" },
  { value: "passbook", label: "Bank passbook (first page)" },
  { value: "statement", label: "Bank statement" },
];

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const BUCKET = "employee-documents";

interface Props {
  employeeId: string;
  userId: string | undefined;
  defaultHolderName?: string;
}

export function BankChangeRequestCard({ employeeId, userId, defaultHolderName }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    account_holder_name: defaultHolderName || "",
    bank_name: "",
    account_number: "",
    confirm_account_number: "",
    ifsc_code: "",
    branch: "",
    proof_type: "cancelled_cheque",
    employee_note: "",
  });
  const [files, setFiles] = useState<File[]>([]);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["my_bank_change_requests", employeeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_bank_change_requests")
        .select("*")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!employeeId,
  });

  const openRequest = useMemo(
    () => requests.find((r: any) => ["pending", "pending_razorpay", "razorpay_failed"].includes(r.status)),
    [requests],
  );

  const addFiles = (incoming: File[]) => {
    const valid = incoming.filter((f) => f.size <= 10 * 1024 * 1024);
    if (valid.length !== incoming.length) {
      toast({ title: "Some files skipped", description: "Each file must be 10 MB or smaller.", variant: "destructive" });
    }
    setFiles((prev) => [...prev, ...valid].slice(0, 5));
  };

  const { isDragActive, dropzoneProps } = useFileDropzone({ onFiles: addFiles });

  const reset = () => {
    setForm({
      account_holder_name: defaultHolderName || "",
      bank_name: "",
      account_number: "",
      confirm_account_number: "",
      ifsc_code: "",
      branch: "",
      proof_type: "cancelled_cheque",
      employee_note: "",
    });
    setFiles([]);
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Not signed in");
      const acc = form.account_number.trim();
      const ifsc = form.ifsc_code.trim().toUpperCase();
      if (!form.account_holder_name.trim()) throw new Error("Account holder name is required");
      if (!form.bank_name.trim()) throw new Error("Bank name is required");
      if (!/^\d{6,20}$/.test(acc)) throw new Error("Account number must be 6–20 digits");
      if (acc !== form.confirm_account_number.trim()) throw new Error("Account numbers do not match");
      if (!IFSC_RE.test(ifsc)) throw new Error("IFSC looks invalid (e.g. HDFC0001234)");
      if (files.length === 0) throw new Error("Attach a cancelled cheque, passbook or statement for verification");

      const paths: string[] = [];
      for (const f of files) {
        const safe = f.name.replace(/[^\w.\-]+/g, "_");
        const path = `bank-change/${userId}/${Date.now()}_${safe}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, f, { upsert: false });
        if (error) throw new Error(`Upload failed for ${f.name}: ${error.message}`);
        paths.push(path);
      }

      const { error } = await (supabase as any).from("hr_bank_change_requests").insert({
        employee_id: employeeId,
        requested_by: userId,
        account_holder_name: form.account_holder_name.trim(),
        bank_name: form.bank_name.trim(),
        account_number: acc,
        ifsc_code: ifsc,
        branch: form.branch.trim() || null,
        proof_type: form.proof_type,
        proof_urls: paths,
        employee_note: form.employee_note.trim() || null,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Request submitted", description: "HR has been notified of your bank change request." });
      setOpen(false);
      reset();
      queryClient.invalidateQueries({ queryKey: ["my_bank_change_requests", employeeId] });
    },
    onError: (e: any) => toast({ title: "Could not submit", description: e.message, variant: "destructive" }),
  });

  const cancelRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("hr_bank_change_requests")
        .update({ status: "cancelled" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Request cancelled" });
      queryClient.invalidateQueries({ queryKey: ["my_bank_change_requests", employeeId] });
    },
    onError: (e: any) => toast({ title: "Could not cancel", description: e.message, variant: "destructive" }),
  });

  return (
    <Card className="border-border/60">
      <CardContent className="p-4 md:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Landmark className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-foreground">Salary bank account change</p>
              <p className="text-sm text-muted-foreground">
                Submit new account details with a cancelled cheque, passbook or statement. HR verifies and updates payroll.
              </p>
            </div>
          </div>
          <Button
            className="w-full sm:w-auto"
            onClick={() => setOpen(true)}
            disabled={!!openRequest}
          >
            Request bank change
          </Button>
        </div>

        {openRequest && (
          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <Clock className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">
              You already have a request in progress. You can raise a new one once this is closed.
            </span>
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading requests…</p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bank change requests yet.</p>
        ) : (
          <div className="space-y-2">
            {requests.map((r: any) => {
              const meta = BANK_CHANGE_STATUS_META[r.status] || BANK_CHANGE_STATUS_META.pending;
              return (
                <div key={r.id} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {r.bank_name} · ****{String(r.account_number).slice(-4)}
                    </p>
                    <Badge variant="outline" className={cn("whitespace-nowrap", meta.className)}>
                      {r.status === "approved" ? <ShieldCheck className="h-3 w-3 mr-1" /> : null}
                      {r.status === "razorpay_failed" ? <AlertTriangle className="h-3 w-3 mr-1" /> : null}
                      {meta.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{meta.hint}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground font-mono">
                    <span>IFSC {String(r.ifsc_code).toUpperCase()}</span>
                    <span>Raised {format(new Date(r.created_at), "dd MMM yyyy")}</span>
                    {r.razorpay_verified_at && (
                      <span>Payroll confirmed {format(new Date(r.razorpay_verified_at), "dd MMM yyyy")}</span>
                    )}
                  </div>
                  {r.hr_notes && <p className="text-xs text-foreground">HR note: {r.hr_notes}</p>}
                  {r.status === "pending" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => cancelRequest.mutate(r.id)}
                      disabled={cancelRequest.isPending}
                    >
                      Cancel request
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Request bank account change</DialogTitle>
            <DialogDescription>
              Your salary account is updated only after HR verifies your documents and payroll confirms the change.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label>Account holder name *</Label>
              <Input
                className="text-foreground"
                value={form.account_holder_name}
                onChange={(e) => setForm({ ...form, account_holder_name: e.target.value })}
                placeholder="As printed in the bank records"
              />
            </div>
            <div>
              <Label>Bank name *</Label>
              <Input
                className="text-foreground"
                value={form.bank_name}
                onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                placeholder="e.g. HDFC Bank"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Account number *</Label>
                <Input
                  className="text-foreground font-mono"
                  inputMode="numeric"
                  value={form.account_number}
                  onChange={(e) => setForm({ ...form, account_number: e.target.value.replace(/\D/g, "").slice(0, 20) })}
                />
              </div>
              <div>
                <Label>Confirm account number *</Label>
                <Input
                  className="text-foreground font-mono"
                  inputMode="numeric"
                  value={form.confirm_account_number}
                  onChange={(e) =>
                    setForm({ ...form, confirm_account_number: e.target.value.replace(/\D/g, "").slice(0, 20) })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>IFSC code *</Label>
                <Input
                  className="text-foreground font-mono uppercase"
                  value={form.ifsc_code}
                  onChange={(e) => setForm({ ...form, ifsc_code: e.target.value.toUpperCase().slice(0, 11) })}
                  placeholder="HDFC0001234"
                />
              </div>
              <div>
                <Label>Branch</Label>
                <Input
                  className="text-foreground"
                  value={form.branch}
                  onChange={(e) => setForm({ ...form, branch: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Proof document type *</Label>
              <Select value={form.proof_type} onValueChange={(v) => setForm({ ...form, proof_type: v })}>
                <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROOF_TYPES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Verification documents *</Label>
              <div
                {...dropzoneProps}
                onClick={() => fileInput.current?.click()}
                className={cn(
                  "mt-1 w-full rounded-lg border-2 border-dashed p-4 text-center cursor-pointer transition-colors",
                  isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
                )}
              >
                <Upload className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-sm text-foreground">Tap to choose or drop files</p>
                <p className="text-xs text-muted-foreground">PDF or image, up to 5 files, 10 MB each</p>
              </div>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => { addFiles(Array.from(e.target.files || [])); e.target.value = ""; }}
              />
              {files.length > 0 && (
                <div className="mt-2 space-y-1">
                  {files.map((f, i) => (
                    <div key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1">
                      <span className="flex items-center gap-2 min-w-0 text-xs text-foreground">
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{f.name}</span>
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label>Note to HR</Label>
              <Textarea
                className="text-foreground"
                rows={3}
                value={form.employee_note}
                onChange={(e) => setForm({ ...form, employee_note: e.target.value })}
                placeholder="Reason for the change (optional)"
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="w-full sm:w-auto" onClick={() => submit.mutate()} disabled={submit.isPending}>
              {submit.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
