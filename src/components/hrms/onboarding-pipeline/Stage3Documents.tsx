import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FileText, Mail, Upload } from "lucide-react";

interface Stage3Props {
  data: any;
  onboardingData: any;
  onSave: (data: any) => Promise<void>;
  onComplete: (data: any) => Promise<void>;
  onBack: () => void;
  readOnly?: boolean;
}

const DOC_FIELDS = [
  { key: "pan", label: "PAN Card", required: true },
  { key: "aadhaar", label: "Aadhaar Card", required: true },
  { key: "passport_photo", label: "Passport Photo", required: true },
  { key: "bank_details", label: "Bank Details (Cheque/Passbook)", required: true },
  { key: "uan", label: "UAN", required: false },
  { key: "esic", label: "ESIC", required: false },
];

export function Stage3Documents({ data, onboardingData, onSave, onComplete, onBack, readOnly }: Stage3Props) {
  const [mode, setMode] = useState<"email" | "manual">("email");
  const [emailSending, setEmailSending] = useState(false);
  const [mailReceivedDate, setMailReceivedDate] = useState("");

  const [docs, setDocs] = useState<Record<string, { received: boolean; value: string }>>({});

  useEffect(() => {
    const existing = (data?.documents && typeof data.documents === "object") ? data.documents : {};
    const init: Record<string, { received: boolean; value: string }> = {};
    DOC_FIELDS.forEach(f => {
      init[f.key] = { received: existing[f.key]?.received || false, value: existing[f.key]?.value || "" };
    });
    setDocs(init);
    setMailReceivedDate(data?.document_mail_received_at || "");
  }, [data]);

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
    setDocs(prev => ({ ...prev, [key]: { ...prev[key], received: !prev[key].received } }));
  };

  const updateDocValue = (key: string, value: string) => {
    setDocs(prev => ({ ...prev, [key]: { ...prev[key], value } }));
  };

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

        {/* Document checklist */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Document Checklist</p>
          {DOC_FIELDS.map(f => (
            <div key={f.key} className="flex items-center gap-3 p-2 rounded border">
              <Switch
                checked={docs[f.key]?.received || false}
                onCheckedChange={() => toggleDoc(f.key)}
                disabled={readOnly}
              />
              <div className="flex-1">
                <span className="text-sm">{f.label}</span>
                {f.required && <Badge variant="outline" className="ml-2 text-xs">Required</Badge>}
              </div>
              {mode === "manual" && !readOnly && (
                <Input
                  placeholder={`${f.label} number/details`}
                  className="max-w-[200px]"
                  value={docs[f.key]?.value || ""}
                  onChange={e => updateDocValue(f.key, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>

        {/* Mail received date */}
        <div className="max-w-xs">
          <Label>Mail Received Date (Optional)</Label>
          <Input
            type="date"
            value={mailReceivedDate}
            onChange={e => setMailReceivedDate(e.target.value)}
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
