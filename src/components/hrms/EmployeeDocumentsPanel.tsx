import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { smartUpload } from "@/lib/resumable-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, Plus, ExternalLink, CheckCircle, Trash2 } from "lucide-react";

const DOC_TYPES = [
  { value: "aadhaar", label: "Aadhaar Card" },
  { value: "pan_card", label: "PAN Card" },
  { value: "offer_letter", label: "Offer Letter" },
  { value: "experience_letter", label: "Experience Letter" },
  { value: "education", label: "Educational Certificate" },
  { value: "address_proof", label: "Address Proof" },
  { value: "nda", label: "NDA" },
  { value: "other", label: "Other" },
];

export function EmployeeDocumentsPanel({ employeeId }: { employeeId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ document_type: "", document_name: "", notes: "" });

  const queryKey = ["hr_employee_documents", employeeId];

  const { data: docs = [], isLoading } = useQuery({
    queryKey,
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_employee_documents")
        .select("*")
        .eq("employee_id", employeeId)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const reset = () => {
    setForm({ document_type: "", document_name: "", notes: "" });
    setFile(null);
  };

  const addDoc = async () => {
    if (!form.document_type) return toast.error("Select a document type");
    if (!file) return toast.error("Choose a file to upload");
    setUploading(true);
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
      const path = `employees/${employeeId}/${form.document_type}/${Date.now()}_${safe}`;
      const uploaded = await smartUpload({
        bucket: "employee-documents",
        path,
        file,
        contentType: file.type || undefined,
      });
      const { data: urlD } = supabase.storage.from("employee-documents").getPublicUrl(uploaded);
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("hr_employee_documents").insert({
        employee_id: employeeId,
        document_type: form.document_type,
        document_name: form.document_name?.trim() || file.name,
        file_url: urlD?.publicUrl || "",
        notes: form.notes || null,
        uploaded_by: auth?.user?.email || null,
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey });
      setOpen(false);
      reset();
      toast.success("Document uploaded");
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const verifyMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("hr_employee_documents")
        .update({ is_verified: true, verified_at: new Date().toISOString(), verified_by: "HR Admin" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey }); toast.success("Document verified"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("hr_employee_documents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey }); toast.success("Document removed"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-sm font-semibold text-foreground">Uploaded Documents</h4>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Document
        </Button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="text-xs text-muted-foreground">No documents uploaded yet.</p>
      ) : (
        <div className="space-y-2">
          {docs.map((d: any) => (
            <div key={d.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">{d.document_name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {DOC_TYPES.find(t => t.value === d.document_type)?.label || d.document_type}
                    {d.uploaded_at ? ` · ${new Date(d.uploaded_at).toLocaleDateString()}` : ""}
                    {d.is_verified ? " · Verified" : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {d.file_url && (
                  <Button size="sm" variant="ghost" asChild>
                    <a href={d.file_url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a>
                  </Button>
                )}
                {!d.is_verified && (
                  <Button size="sm" variant="ghost" onClick={() => verifyMutation.mutate(d.id)}>
                    <CheckCircle className="h-4 w-4" />
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(d.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Document</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Document Type</Label>
              <Select value={form.document_type} onValueChange={(v) => setForm(f => ({ ...f, document_type: v }))}>
                <SelectTrigger className="text-foreground"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Document Name (optional)</Label>
              <Input
                className="text-foreground"
                value={form.document_name}
                placeholder="Defaults to file name"
                onChange={(e) => setForm(f => ({ ...f, document_name: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">File</Label>
              <Input type="file" className="text-foreground" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                className="text-foreground"
                value={form.notes}
                onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={uploading}>Cancel</Button>
            <Button onClick={addDoc} disabled={uploading}>{uploading ? "Uploading…" : "Upload"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default EmployeeDocumentsPanel;
