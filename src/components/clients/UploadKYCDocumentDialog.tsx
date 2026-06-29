import { useState } from "react";
import { useFileDropzone } from "@/hooks/useFileDropzone";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Upload, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { smartUpload } from "@/lib/resumable-upload";
import { useQueryClient } from "@tanstack/react-query";

interface UploadKYCDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName?: string;
}

const DOC_TYPES: { value: string; label: string; folder: string }[] = [
  { value: "aadhaar", label: "Aadhaar Card", folder: "aadhaar" },
  { value: "pan", label: "PAN Card", folder: "pan" },
  { value: "usdt_usage_proof", label: "USDT Usage Proof", folder: "usdt_usage" },
  { value: "trade_history_screenshot", label: "Trade History Screenshot", folder: "trade_history" },
  { value: "vkyc_video", label: "vKYC Video", folder: "vkyc" },
  { value: "bank_statement", label: "Bank Statement", folder: "bank_statement" },
  { value: "source_of_fund", label: "Source of Fund", folder: "source_of_fund" },
  { value: "other", label: "Other Document", folder: "other" },
];


function KycFileDropArea({ files, setFiles, disabled }: { files: File[]; setFiles: (f: File[]) => void; disabled: boolean }) {
  const { isDragActive, dropzoneProps } = useFileDropzone({
    onFiles: (dropped) => setFiles(Array.from(dropped)),
    disabled,
    multiple: true,
  });
  return (
    <div>
      <Label htmlFor="kyc-file">Files *</Label>
      <div
        {...dropzoneProps}
        className={cn(
          "mt-1 rounded-md border border-dashed border-muted-foreground/40 transition-colors",
          isDragActive && "border-primary bg-primary/10"
        )}
      >
        <Input
          id="kyc-file"
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.mp4,.mov,.webm"
          disabled={disabled}
          onChange={(e) => setFiles(Array.from(e.target.files || []))}
          className="cursor-pointer"
        />
      </div>
      {files.length > 0 && (
        <p className="text-xs text-muted-foreground mt-1">{files.length} file(s) selected</p>
      )}
    </div>
  );
}

export function UploadKYCDocumentDialog({ open, onOpenChange, clientId, clientName }: UploadKYCDocumentDialogProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [docType, setDocType] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const reset = () => {
    setDocType("");
    setFiles([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docType) {
      toast({ title: "Select document type", variant: "destructive" });
      return;
    }
    if (!files.length) {
      toast({ title: "Select at least one file", variant: "destructive" });
      return;
    }

    const meta = DOC_TYPES.find((d) => d.value === docType)!;
    setUploading(true);
    let success = 0;
    let failed = 0;
    let lastError = "";

    for (const file of files) {
      try {
        const filePath = `${clientId}/${meta.folder}/${Date.now()}_${file.name}`;
        // Resumable upload for large files (e.g. lengthy vKYC videos); falls back
        // to standard upload for small files. Avoids the 30s fetch timeout and
        // single-request size cap that made long videos fail.
        const uploadedPath = await smartUpload({
          bucket: "kyc-documents",
          path: filePath,
          file,
          contentType: file.type || undefined,
          onProgress: (p) => setProgress(p),
        });
        const { data: urlD } = supabase.storage.from("kyc-documents").getPublicUrl(uploadedPath);
        const { error: insErr } = await supabase.from("client_kyc_documents").insert({
          client_id: clientId,
          document_type: docType,
          file_url: urlD?.publicUrl || "",
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type || null,
        });
        if (insErr) throw insErr;
        success++;
      } catch (err: any) {
        console.error("Upload failed", err);
        lastError = err?.message || err?.error_description || "Could not upload documents.";
        failed++;
      }
    }
    setProgress(0);

    setUploading(false);
    if (success > 0) {
      toast({
        title: "Upload complete",
        description: `${success} file(s) uploaded${failed ? `, ${failed} failed` : ""} for ${clientName || "client"}.`,
      });
      qc.invalidateQueries({ queryKey: ["client_kyc_documents", clientId] });
      qc.invalidateQueries({ queryKey: ["client_kyc_documents_dialog", clientId] });
      reset();
      onOpenChange(false);
    } else {
      toast({ title: "Upload failed", description: lastError || "Could not upload documents.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!uploading) { onOpenChange(o); if (!o) reset(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload KYC Document</DialogTitle>
          <DialogDescription>
            Add documents received later for {clientName || "this client"}. Files are stored against the client's KYC record.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Document Type *</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger className="text-foreground">
                <SelectValue placeholder="Select document type" />
              </SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((d) => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <KycFileDropArea files={files} setFiles={setFiles} disabled={uploading} />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
              Cancel
            </Button>
            <Button type="submit" disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              {uploading ? (progress > 0 && progress < 100 ? `Uploading ${progress}%` : "Uploading...") : "Upload"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
