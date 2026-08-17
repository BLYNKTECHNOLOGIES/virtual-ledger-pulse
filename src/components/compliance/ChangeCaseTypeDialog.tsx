import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getCurrentUserIdAsync } from "@/lib/system-action-logger";

export const CASE_TYPE_LABELS: Record<string, string> = {
  ACCOUNT_NOT_WORKING: "Account Not Working",
  WRONG_PAYMENT_INITIATED: "Wrong Payment Initiated",
  PAYMENT_NOT_CREDITED: "Payment Not Credited to Beneficiary",
  SETTLEMENT_NOT_RECEIVED: "Settlement Not Received",
  LIEN_RECEIVED: "Lien Received",
  BALANCE_DISCREPANCY: "Balance Discrepancy",
};

type FieldKind = "text" | "textarea" | "number" | "date" | "datetime" | "file";

interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  placeholder?: string;
}

/** Same field sets the Create Case form asks for, per case type. */
export const CASE_TYPE_FIELDS: Record<string, FieldSpec[]> = {
  ACCOUNT_NOT_WORKING: [
    { key: "error_message", label: "Error Message / Issue Description", kind: "textarea", required: true, placeholder: "Describe the error or issue in detail" },
    { key: "screenshots", label: "Screenshots (Optional)", kind: "file" },
  ],
  WRONG_PAYMENT_INITIATED: [
    { key: "wrong_beneficiary_account", label: "Wrong Beneficiary Account Number", kind: "text", required: true },
    { key: "wrong_beneficiary_name", label: "Wrong Beneficiary Name", kind: "text", required: true },
    { key: "transaction_datetime", label: "Date & Time of Transaction", kind: "datetime", required: true },
    { key: "amount_transferred", label: "Amount Transferred", kind: "number", required: true },
    { key: "remarks", label: "Remarks", kind: "textarea" },
  ],
  PAYMENT_NOT_CREDITED: [
    { key: "beneficiary_name", label: "Beneficiary Name", kind: "text", required: true },
    { key: "beneficiary_account_number", label: "Beneficiary Account Number", kind: "text", required: true },
    { key: "bank_ifsc_code", label: "Bank IFSC Code", kind: "text", required: true },
    { key: "transaction_datetime", label: "Transaction Date & Time", kind: "datetime", required: true },
    { key: "proof_of_debit", label: "Proof of Debit (Screenshot / Bank Entry)", kind: "file" },
  ],
  SETTLEMENT_NOT_RECEIVED: [
    { key: "settlement_reference_id", label: "Settlement Reference ID", kind: "text" },
    { key: "expected_settlement_amount", label: "Expected Settlement Amount", kind: "number", required: true },
    { key: "settlement_date", label: "Settlement Date (Expected)", kind: "date", required: true },
    { key: "pending_since", label: "Pending Since (Duration)", kind: "text", required: true, placeholder: "e.g., 15 days, 2 weeks" },
    { key: "supporting_proof", label: "Supporting Proof / Settlement Advice", kind: "file" },
  ],
  LIEN_RECEIVED: [
    { key: "amount_lien_marked", label: "Amount Lien Marked", kind: "number", required: true },
    { key: "date_lien_marked", label: "Date Lien Marked", kind: "date", required: true },
    { key: "bank_reason", label: "Reason Provided by Bank", kind: "textarea" },
    { key: "supporting_document", label: "Supporting Document (Bank Notice if available)", kind: "file" },
    { key: "remarks", label: "Remarks", kind: "textarea" },
  ],
  BALANCE_DISCREPANCY: [
    { key: "date_of_discrepancy", label: "Date of Discrepancy", kind: "date", required: true },
    { key: "reported_balance", label: "Reported Balance (from bank statement)", kind: "number", required: true },
    { key: "expected_balance", label: "Expected Balance (system calculation)", kind: "number", required: true },
    { key: "difference_amount", label: "Difference Amount", kind: "number", required: true },
    { key: "statement_proof", label: "Screenshot / Statement Proof", kind: "file" },
    { key: "remarks", label: "Remarks", kind: "textarea" },
  ],
};

const MULTI_FILE_COLUMNS = new Set(["screenshots"]);

function isBlank(value: unknown) {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "string") return value.trim() === "";
  if (typeof value === "number") return value === 0;
  return false;
}

interface ChangeCaseTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bankCase: Record<string, any> | null;
  newType: string | null;
}

export function ChangeCaseTypeDialog({ open, onOpenChange, bankCase, newType }: ChangeCaseTypeDialogProps) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, any>>({});
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [reason, setReason] = useState("");

  // Only ask for fields the new type needs that the case doesn't already carry.
  const missingFields = useMemo(() => {
    if (!bankCase || !newType) return [];
    return (CASE_TYPE_FIELDS[newType] || []).filter((f) => isBlank(bankCase[f.key]));
  }, [bankCase, newType]);

  useEffect(() => {
    if (open) {
      setValues({});
      setFiles({});
      setReason("");
    }
  }, [open, newType]);

  const uploadFiles = async (list: File[]) => {
    const urls: string[] = [];
    for (const file of list) {
      const ext = file.name.split(".").pop();
      const path = `case-documents/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("investigation-documents").upload(path, file);
      if (error) {
        toast.error(`Failed to upload ${file.name}`);
        continue;
      }
      urls.push(supabase.storage.from("investigation-documents").getPublicUrl(path).data.publicUrl);
    }
    return urls;
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!bankCase || !newType) return;

      const payload: Record<string, any> = { case_type: newType };
      const captured: string[] = [];

      for (const field of missingFields) {
        if (field.kind === "file") {
          const list = files[field.key] || [];
          if (list.length === 0) continue;
          const urls = await uploadFiles(list);
          if (urls.length === 0) continue;
          payload[field.key] = MULTI_FILE_COLUMNS.has(field.key) ? urls : urls[0];
          captured.push(`${field.label}: ${urls.length} file(s)`);
          continue;
        }
        const raw = values[field.key];
        if (isBlank(raw)) continue;
        payload[field.key] = field.kind === "number" ? Number(raw) : raw;
        captured.push(`${field.label}: ${payload[field.key]}`);
      }

      const { error } = await supabase.from("bank_cases").update(payload).eq("id", bankCase.id);
      if (error) throw error;

      const userId = await getCurrentUserIdAsync();
      const lines = [
        `Case type changed from ${CASE_TYPE_LABELS[bankCase.case_type] || bankCase.case_type} to ${CASE_TYPE_LABELS[newType] || newType}`,
        `Reason: ${reason.trim()}`,
        ...(captured.length ? ["Additional details captured —", ...captured.map((c) => `• ${c}`)] : []),
      ];

      const { error: logError } = await supabase.from("compliance_case_updates").insert({
        bank_case_id: bankCase.id,
        update_type: "CASE_TYPE_CHANGED",
        update_text: lines.join("\n"),
        created_by: userId || null,
      });
      if (logError) throw logError;
    },
    onSuccess: () => {
      toast.success("Case type updated and details recorded");
      queryClient.invalidateQueries({ queryKey: ["bank_cases"] });
      queryClient.invalidateQueries({ queryKey: ["case_timeline"] });
      onOpenChange(false);
    },
    onError: (error) => {
      console.error("Case type change failed:", error);
      toast.error("Failed to change case type");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error("Please provide a reason for the change");
      return;
    }
    const missingRequired = missingFields.filter(
      (f) => f.required && (f.kind === "file" ? (files[f.key] || []).length === 0 : isBlank(values[f.key])),
    );
    if (missingRequired.length > 0) {
      toast.error(`Please fill: ${missingRequired.map((f) => f.label).join(", ")}`);
      return;
    }
    mutation.mutate();
  };

  if (!bankCase || !newType) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Change Case Type</DialogTitle>
          <DialogDescription>
            {bankCase.case_number} · {CASE_TYPE_LABELS[bankCase.case_type] || bankCase.case_type} →{" "}
            {CASE_TYPE_LABELS[newType] || newType}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {missingFields.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This case already carries every detail the new type requires. Confirm the change below.
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                The new case type needs details that weren't captured when this case was created.
              </p>
              {missingFields.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={field.key}>
                    {field.label}
                    {field.required ? " *" : ""}
                  </Label>
                  {field.kind === "textarea" ? (
                    <Textarea
                      id={field.key}
                      rows={3}
                      className="text-foreground"
                      placeholder={field.placeholder}
                      value={values[field.key] ?? ""}
                      onChange={(e) => setValues((p) => ({ ...p, [field.key]: e.target.value }))}
                    />
                  ) : field.kind === "file" ? (
                    <Input
                      id={field.key}
                      type="file"
                      multiple={MULTI_FILE_COLUMNS.has(field.key)}
                      accept="image/*,.pdf"
                      className="text-foreground"
                      onChange={(e) => setFiles((p) => ({ ...p, [field.key]: Array.from(e.target.files || []) }))}
                    />
                  ) : (
                    <Input
                      id={field.key}
                      type={
                        field.kind === "number"
                          ? "number"
                          : field.kind === "date"
                            ? "date"
                            : field.kind === "datetime"
                              ? "datetime-local"
                              : "text"
                      }
                      className="text-foreground"
                      placeholder={field.placeholder}
                      value={values[field.key] ?? ""}
                      onChange={(e) => setValues((p) => ({ ...p, [field.key]: e.target.value }))}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="change_reason">Reason for change *</Label>
            <Textarea
              id="change_reason"
              rows={2}
              className="text-foreground"
              placeholder="Why is this case being reclassified?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving..." : "Confirm Change"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
