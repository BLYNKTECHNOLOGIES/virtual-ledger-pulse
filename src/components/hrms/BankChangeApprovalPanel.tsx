import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { pushToRazorpay } from "@/lib/razorpayPushback";
import { cn } from "@/lib/utils";
import { AlertTriangle, FileText, Loader2, ShieldCheck } from "lucide-react";

const BUCKET = "employee-documents";

const RP_TONE: Record<string, string> = {
  verified: "bg-success/10 text-success border-success/30",
  pushing: "bg-warning/10 text-warning border-warning/30",
  failed: "bg-destructive/10 text-destructive border-destructive/30",
  not_linked: "bg-destructive/10 text-destructive border-destructive/30",
  not_started: "bg-muted text-muted-foreground border-border",
};

const RP_LABEL: Record<string, string> = {
  verified: "RazorpayX verified",
  pushing: "RazorpayX push in progress",
  failed: "RazorpayX not verified",
  not_linked: "Employee not linked to RazorpayX",
  not_started: "Not pushed yet",
};

/**
 * HR-side review of a bank change request.
 * A request becomes "approved" ONLY after the RazorpayX write is re-read and
 * verified — otherwise it lands in `razorpay_failed` so HR can retry.
 */
export function BankChangeApprovalPanel({ request }: { request: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState(request.hr_notes || "");
  const [busy, setBusy] = useState<null | "approve" | "reject">(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["hrms_unified_requests"] });
    queryClient.invalidateQueries({ queryKey: ["my_bank_change_requests"] });
    queryClient.invalidateQueries({ queryKey: ["hr_employee_bank_details"] });
  };

  const openProof = async (path: string) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
    if (error || !data?.signedUrl) {
      toast({ title: "Could not open document", description: error?.message, variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const approve = async () => {
    setBusy("approve");
    try {
      const { error } = await (supabase as any).rpc("hr_bank_change_apply", { _request_id: request.id });
      if (error) throw error;
      refresh();

      const res = await pushToRazorpay("bank", request.employee_id, {
        triggeredFrom: "bank_change_request_approval",
      });

      const { error: finErr } = await (supabase as any).rpc("hr_bank_change_finalize", {
        _request_id: request.id,
        _verified: !!res.ok,
        _error: res.ok ? null : res.error || (res.skipped ? "Employee is not linked to RazorpayX" : "RazorpayX did not confirm the new bank account"),
        _not_linked: !!res.skipped,
      });
      if (finErr) throw finErr;

      if (res.ok) {
        toast({ title: "Bank change approved", description: "RazorpayX confirmed the new account." });
      } else {
        toast({
          title: "Not approved yet",
          description: res.skipped
            ? "Employee is not linked to RazorpayX — link them, then retry."
            : "RazorpayX has not confirmed the new bank account. Request kept open for retry.",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({ title: "Approval failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const reject = async () => {
    if (!notes.trim()) {
      toast({ title: "Add a reason", description: "Tell the employee why the request is rejected.", variant: "destructive" });
      return;
    }
    setBusy("reject");
    try {
      const { error } = await (supabase as any).rpc("hr_bank_change_reject", {
        _request_id: request.id,
        _notes: notes.trim(),
      });
      if (error) throw error;
      toast({ title: "Request rejected" });
      refresh();
    } catch (e: any) {
      toast({ title: "Could not reject", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const decided = ["approved", "rejected", "cancelled"].includes(request.status);
  const proofs: string[] = Array.isArray(request.proof_urls) ? request.proof_urls : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <Detail label="Account holder" value={request.account_holder_name} />
        <Detail label="Bank" value={request.bank_name} />
        <Detail label="Account number" value={request.account_number} mono />
        <Detail label="IFSC" value={String(request.ifsc_code || "").toUpperCase()} mono />
        {request.branch && <Detail label="Branch" value={request.branch} />}
        {request.proof_type && <Detail label="Proof type" value={String(request.proof_type).replace(/_/g, " ")} />}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={cn(RP_TONE[request.razorpay_status] || RP_TONE.not_started)}>
          {request.razorpay_status === "verified" ? <ShieldCheck className="h-3 w-3 mr-1" /> : null}
          {request.razorpay_status === "failed" || request.razorpay_status === "not_linked" ? (
            <AlertTriangle className="h-3 w-3 mr-1" />
          ) : null}
          {RP_LABEL[request.razorpay_status] || request.razorpay_status}
        </Badge>
        {request.razorpay_attempts > 0 && (
          <span className="text-xs text-muted-foreground">{request.razorpay_attempts} push attempt(s)</span>
        )}
      </div>

      {request.razorpay_error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          {request.razorpay_error}
        </p>
      )}

      {proofs.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Verification documents</p>
          <div className="flex flex-wrap gap-2">
            {proofs.map((p) => (
              <Button key={p} size="sm" variant="outline" onClick={() => openProof(p)}>
                <FileText className="h-3.5 w-3.5 mr-1.5" />
                {p.split("/").pop()?.slice(0, 24) || "Document"}
              </Button>
            ))}
          </div>
        </div>
      )}

      {!decided && (
        <div className="space-y-3 border-t border-border pt-3">
          <div>
            <Label>HR note {request.status === "pending" ? "(required to reject)" : ""}</Label>
            <Textarea className="text-foreground" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button className="w-full sm:w-auto" onClick={approve} disabled={busy !== null}>
              {busy === "approve" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {request.status === "razorpay_failed" ? "Retry RazorpayX push" : "Approve & push to RazorpayX"}
            </Button>
            <Button variant="destructive" className="w-full sm:w-auto" onClick={reject} disabled={busy !== null}>
              {busy === "reject" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reject
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Approval is final only when RazorpayX re-read confirms the new account.
          </p>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-foreground", mono && "font-mono")}>{value || "—"}</p>
    </div>
  );
}
