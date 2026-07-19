import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FileCheck, Upload, Paperclip, ExternalLink, Loader2, X } from "lucide-react";
import { smartUpload } from "@/lib/resumable-upload";

interface Stage4Props {
  data: any;
  onboardingData?: any;
  onSave?: (data: any) => Promise<void>;
  onComplete: (data: any) => Promise<void>;
  onBack: () => void;
  readOnly?: boolean;
}

const SIGNED_DOCS = [
  { key: "signed_nda", label: "Signed NDA", required: true },
  { key: "signed_employee_handbook", label: "Signed Employee Handbook Acknowledgement", required: true },
  { key: "signed_job_contract", label: "Signed Job Contract", required: true },
  { key: "umang_form", label: "Umang Registration / Non-Voluntary Form", required: false },
];

export function Stage4OfferPolicy({ data, onboardingData, onSave, onComplete, onBack, readOnly }: Stage4Props) {
  const [docs, setDocs] = useState<Record<string, { received: boolean; file_url?: string; file_name?: string }>>({});
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  useEffect(() => {
    const existing = (data?.offer_policy_documents && typeof data.offer_policy_documents === "object") ? data.offer_policy_documents : {};
    const init: Record<string, { received: boolean; file_url?: string; file_name?: string }> = {};
    SIGNED_DOCS.forEach(f => {
      init[f.key] = {
        received: existing[f.key]?.received || false,
        file_url: existing[f.key]?.file_url || "",
        file_name: existing[f.key]?.file_name || "",
      };
    });
    setDocs(init);
  }, [data]);

  const persistDocs = async (nextDocs: typeof docs) => {
    if (!onboardingData?.id) return;
    const allReq = SIGNED_DOCS.filter(f => f.required).every(f => nextDocs[f.key]?.received);
    try {
      await supabase
        .from("hr_employee_onboarding")
        .update({
          offer_policy_documents: nextDocs,
          offer_policy_status: allReq ? "completed" : "pending",
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", onboardingData.id);
    } catch (e) {
      console.warn("Auto-save Stage 4 documents failed:", e);
    }
  };

  const handleUpload = async (key: string, file: File) => {
    if (!file) return;
    setUploadingKey(key);
    try {
      const empId = onboardingData?.id || onboardingData?.employee_id || "onboarding";
      const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
      const path = `onboarding/${empId}/offer_policy/${key}/${Date.now()}_${safe}`;
      const uploaded = await smartUpload({ bucket: "employee-documents", path, file, contentType: file.type || undefined });
      const { data: urlD } = supabase.storage.from("employee-documents").getPublicUrl(uploaded);
      const next = {
        ...docs,
        [key]: { received: true, file_url: urlD?.publicUrl || "", file_name: file.name },
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

  const toggleDoc = (key: string) => {
    setDocs(prev => {
      const next = { ...prev, [key]: { ...prev[key], received: !prev[key].received } };
      persistDocs(next);
      return next;
    });
  };

  const allRequiredReceived = SIGNED_DOCS.filter(f => f.required).every(f => docs[f.key]?.received);

  const getPayload = () => ({
    offer_policy_documents: docs,
    offer_policy_status: allRequiredReceived ? "completed" : "pending",
  });

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-base flex items-center gap-2">
          <FileCheck className="h-4 w-4" /> Stage 4: Offer & Policy Templates
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Upload the signed copies received from the employee.
        </p>

        <div className="space-y-3">
          {SIGNED_DOCS.map(f => {
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
                </div>
                {!readOnly && (
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
                          <><Upload className="h-3 w-3" /> Upload signed file</>
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

        <div className="flex items-center gap-2">
          <Badge variant={allRequiredReceived ? "default" : "destructive"}>
            {allRequiredReceived ? "All required signed documents received" : "Pending signed documents"}
          </Badge>
        </div>

        {!readOnly && (
          <div className="flex gap-2 pt-2 flex-wrap">
            <Button variant="outline" onClick={onBack}>← Back</Button>
            {onSave && (
              <Button variant="outline" onClick={() => onSave(getPayload())}>Save Draft</Button>
            )}
            <Button onClick={() => onComplete(getPayload())} disabled={!allRequiredReceived}>
              Complete & Next →
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
