import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FileText, Mail, Upload, Paperclip, ExternalLink, Loader2, X } from "lucide-react";
import { smartUpload } from "@/lib/resumable-upload";

interface Stage3Props {
  data: any;
  onboardingData: any;
  onSave: (data: any, options?: { silent?: boolean }) => Promise<void>;
  onComplete: (data: any) => Promise<void>;
  onBack: () => void;
  readOnly?: boolean;
}

// `noValue: true` means the doc has NO textual/numeric field — file upload only.
// `noFile: true` means the doc is a number/text input only — no file upload.
const DOC_FIELDS: Array<{ key: string; label: string; required: boolean; noValue?: boolean; noFile?: boolean }> = [
  { key: "pan", label: "PAN Card", required: true },
  { key: "aadhaar", label: "Aadhaar Card", required: true },
  { key: "passport_photo", label: "Passport Photo", required: true },
  { key: "bank_details", label: "Bank Details (Cheque/Passbook)", required: true },
  { key: "educational_certificate", label: "Educational Certificate", required: true },
  { key: "experience_letter", label: "Previous Experience Letter", required: false },
  { key: "uan", label: "UAN (optional)", required: false },
  { key: "esic", label: "ESIC (optional)", required: false },
  { key: "pf_account_number", label: "PF Account Number (optional)", required: false, noFile: true },
];

export function Stage3Documents({ data, onboardingData, onSave, onComplete, onBack, readOnly }: Stage3Props) {
  const [mode, setMode] = useState<"email" | "manual">("email");
  const [emailSending, setEmailSending] = useState(false);
  const [mailReceivedDate, setMailReceivedDate] = useState("");

  const [docs, setDocs] = useState<Record<string, { received: boolean; value: string; file_url?: string; file_name?: string }>>({});
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  useEffect(() => {
    const existing = (data?.documents && typeof data.documents === "object") ? data.documents : {};
    const init: Record<string, { received: boolean; value: string; file_url?: string; file_name?: string }> = {};
    DOC_FIELDS.forEach(f => {
      init[f.key] = {
        received: existing[f.key]?.received || false,
        value: existing[f.key]?.value || "",
        file_url: existing[f.key]?.file_url || "",
        file_name: existing[f.key]?.file_name || "",
      };
    });
    setDocs(init);
    setMailReceivedDate(data?.document_mail_received_at || "");
  }, [data]);


  const persistDocs = async (
    nextDocs: typeof docs,
    nextMailDate: string = mailReceivedDate,
  ) => {
    if (!onboardingData?.id) return;
    const allReq = DOC_FIELDS.filter(f => f.required).every(f => nextDocs[f.key]?.received);
    try {
      await supabase
        .from("hr_employee_onboarding")
        .update({
          documents: nextDocs,
          document_mail_received_at: nextMailDate || null,
          document_collection_status: allReq ? "completed" : "pending",
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", onboardingData.id);
    } catch (e) {
      console.warn("Auto-save Stage 3 documents failed:", e);
    }

  };

  const handleUpload = async (key: string, file: File) => {
    if (!file) return;
    setUploadingKey(key);
    try {
      const empId = onboardingData?.id || onboardingData?.employee_id || "onboarding";
      const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
      const path = `onboarding/${empId}/${key}/${Date.now()}_${safe}`;
      const uploaded = await smartUpload({ bucket: "employee-documents", path, file, contentType: file.type || undefined });
      const { data: urlD } = supabase.storage.from("employee-documents").getPublicUrl(uploaded);
      const next = {
        ...docs,
        [key]: { ...docs[key], received: true, file_url: urlD?.publicUrl || "", file_name: file.name },
      };
      setDocs(next);
      await persistDocs(next);
      toast.success(`${file.name} uploaded & saved`);
    } catch (err: any) {
      toast.error(err?.message || "Upload failed");
    } finally {
      setUploadingKey(null);
    }
  };

  const removeFile = (key: string) => {
    const next = { ...docs, [key]: { ...docs[key], file_url: "", file_name: "" } };
    setDocs(next);
    persistDocs(next);
  };

  const sendDocRequestEmail = async () => {
    if (!onboardingData?.email || !onboardingData?.first_name) {
      toast.error("Employee email and name are required (Stage 1)");
      return;
    }
    setEmailSending(true);
    try {
      const { error } = await supabase.functions.invoke("send-hr-email", {
        body: {
          recipientEmail: onboardingData.email,
          subject: `Document Submission Request - ${onboardingData.first_name} ${onboardingData.last_name || ""}`,
          templateName: "onboarding_document_request",
          htmlBody: `
            <h2>Document Submission Request</h2>
            <p>Dear ${onboardingData.first_name},</p>
            <p>Welcome! As part of your onboarding process, please submit the following documents at the earliest:</p>
            <ul>
              <li>PAN Card (front & back)</li>
              <li>Aadhaar Card (front & back)</li>
              <li>Passport-size Photo</li>
              <li>Bank Details (Cancelled cheque / Passbook first page)</li>
              <li>Educational Certificate(s) (degree/diploma)</li>
              <li>Previous Experience / Relieving Letter (if any)</li>
              <li>UAN Number (if existing)</li>
              <li>ESIC Number (if applicable)</li>
            </ul>
            <p>Please reply to this email with the scanned copies or clear photographs.</p>
            <p>Thank you,<br/>HR Department</p>
          `,
        },
      });
      if (error) throw error;
      toast.success("Document request email sent successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to send email");
    } finally {
      setEmailSending(false);
    }
  };

  const toggleDoc = (key: string) => {
    setDocs(prev => {
      const next = { ...prev, [key]: { ...prev[key], received: !prev[key].received } };
      persistDocs(next);
      return next;
    });
  };

  const updateDocValue = (key: string, value: string) => {
    const normalized = key === "pan" ? value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) : value;
    setDocs(prev => {
      const next = { ...prev, [key]: { ...prev[key], value: normalized } };
      persistDocs(next);
      return next;
    });
  };

  const panValue = docs.pan?.value || "";
  const panValid = /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panValue);

  const allRequiredReceived = DOC_FIELDS.filter(f => f.required).every(f => docs[f.key]?.received);

  const getPayload = () => ({
    documents: docs,
    document_mail_received_at: mailReceivedDate || null,
    document_collection_status: allRequiredReceived ? "completed" : "pending",
  });


  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" /> Stage 3: Document Collection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Mode toggle */}
        {!readOnly && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={mode === "email" ? "default" : "outline"}
              onClick={() => setMode("email")}
            >
              <Mail className="h-4 w-4 mr-1" /> Email Request
            </Button>
            <Button
              size="sm"
              variant={mode === "manual" ? "default" : "outline"}
              onClick={() => setMode("manual")}
            >
              <Upload className="h-4 w-4 mr-1" /> Manual Entry
            </Button>
          </div>
        )}

        {/* Email flow */}
        {mode === "email" && !readOnly && (
          <div className="rounded-lg border p-4 bg-muted/30 space-y-3">
            <p className="text-sm">
              Send an email to <strong>{onboardingData?.email || "—"}</strong> requesting documents.
            </p>
            <Button size="sm" onClick={sendDocRequestEmail} disabled={emailSending}>
              {emailSending ? "Sending..." : "Send Document Request Email"}
            </Button>
            {data?.document_email_sent_at && (
              <p className="text-xs text-muted-foreground">
                Last sent: {new Date(data.document_email_sent_at).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* Statutory context — PT is a company-wide fixed setting, not per-employee input. */}
        <div className="rounded border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Professional Tax (PT):</span> always <strong>Madhya Pradesh</strong> — applied automatically to every employee. No per-employee entry required.
        </div>



        {/* Document checklist */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Document Checklist</p>
          {DOC_FIELDS.map(f => {
            const d = docs[f.key];
            const isUploading = uploadingKey === f.key;
            return (
              <div key={f.key} className="p-3 rounded border space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <Switch
                    checked={d?.received || false}
                    onCheckedChange={() => toggleDoc(f.key)}
                    disabled={readOnly}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm">{f.label}</span>
                    {f.required && <Badge variant="outline" className="ml-2 text-xs">Required</Badge>}
                  </div>
                  {!readOnly && f.key !== "pan" && !f.noValue && (mode === "manual" || f.noFile) && (
                    <Input
                      placeholder={`${f.label} number`}
                      className="max-w-[220px] h-8"
                      value={d?.value || ""}
                      onChange={e => updateDocValue(f.key, e.target.value)}
                    />
                  )}
                </div>
                {f.key === "pan" && !readOnly && (
                  <div className="pl-1 space-y-1">
                    <Input
                      placeholder="PAN Number (e.g. ABCDE1234F)"
                      className="max-w-[240px] h-8 uppercase tracking-wider text-foreground"
                      value={panValue}
                      maxLength={10}
                      onChange={e => updateDocValue("pan", e.target.value)}
                    />
                    {panValue.length > 0 && !panValid && (
                      <p className="text-[11px] text-destructive">Invalid format. Expected: 5 letters + 4 digits + 1 letter.</p>
                    )}
                    {panValid && (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400">✓ Valid PAN</p>
                    )}
                  </div>
                )}
                {f.key === "pan" && readOnly && panValue && (
                  <p className="text-xs pl-1 font-mono">{panValue}</p>
                )}
                {!readOnly && !f.noFile && (
                  <div className="flex items-center gap-2 flex-wrap pl-1">
                    {d?.file_url ? (
                      <>
                        <a
                          href={d.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary underline flex items-center gap-1 max-w-[220px] truncate"
                        >
                          <Paperclip className="h-3 w-3 shrink-0" />
                          <span className="truncate">{d.file_name || "View file"}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => removeFile(f.key)}
                        >
                          <X className="h-3 w-3 mr-1" /> Remove
                        </Button>
                      </>
                    ) : (
                      <label className="inline-flex items-center gap-1 text-xs cursor-pointer text-muted-foreground hover:text-foreground border border-dashed rounded px-2 py-1">
                        {isUploading ? (
                          <><Loader2 className="h-3 w-3 animate-spin" /> Uploading...</>
                        ) : (
                          <><Upload className="h-3 w-3" /> Upload file</>
                        )}
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                          disabled={isUploading}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUpload(f.key, file);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}
                  </div>
                )}
                {readOnly && d?.file_url && (
                  <a
                    href={d.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary underline flex items-center gap-1 pl-1"
                  >
                    <Paperclip className="h-3 w-3" /> {d.file_name || "View file"}
                  </a>
                )}
              </div>
            );
          })}
        </div>

        {/* Mail received date */}
        <div className="max-w-xs">
          <Label>Mail Received Date (Optional)</Label>
          <Input
            type="date"
            value={mailReceivedDate}
            onChange={e => {
              const nextDate = e.target.value;
              setMailReceivedDate(nextDate);
              persistDocs(docs, nextDate);
            }}
            disabled={readOnly}
          />
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={allRequiredReceived ? "default" : "destructive"}>
            {allRequiredReceived ? "All required documents received" : "Pending documents"}
          </Badge>
        </div>

        {!readOnly && (
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onBack}>← Back</Button>
            <Button variant="outline" onClick={() => onSave(getPayload())}>Save Draft</Button>
            <Button onClick={() => onComplete(getPayload())} disabled={!allRequiredReceived}>
              Complete & Next →
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
