import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { PenLine, Plus, Trash2, Upload, ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";

const BUCKET = "hr-doc-signatures";

function SignaturePreview({ path }: { path: string | null }) {
  const { data: url } = useQuery({
    queryKey: ["hr_doc_signature_url", path],
    enabled: !!path,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path!, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
  });
  if (!path) return <div className="h-12 w-32 rounded border border-dashed border-border" />;
  return url ? (
    <img src={url} alt="Signature" className="h-12 w-32 object-contain bg-background rounded border border-border" />
  ) : (
    <div className="h-12 w-32 rounded border border-border animate-pulse bg-muted" />
  );
}

export function SignatoriesTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ display_name: "", designation: "", is_active: true });
  const [sigFile, setSigFile] = useState<File | null>(null);
  const [sealFile, setSealFile] = useState<File | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["hr_doc_signatories"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_doc_signatories").select("*").order("display_name");
      if (error) throw error;
      return data || [];
    },
  });

  const upload = async (file: File, kind: string) => {
    const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-100);
    const path = `${kind}/${Date.now()}_${safe}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || undefined, upsert: false,
    });
    if (error) throw error;
    return path;
  };

  const save = async () => {
    if (!form.display_name.trim()) return toast.error("Signatory name is required");
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const signature_path = sigFile ? await upload(sigFile, "signatures") : null;
      const seal_path = sealFile ? await upload(sealFile, "seals") : null;
      const { error } = await (supabase as any).from("hr_doc_signatories").insert({
        display_name: form.display_name.trim(),
        designation: form.designation || null,
        is_active: form.is_active,
        signature_path,
        seal_path,
        created_by: auth?.user?.id || null,
      });
      if (error) throw error;
      await (supabase as any).from("hr_doc_audit_log").insert({
        entity_type: "signatory", action: "signatory_created",
        actor_id: auth?.user?.id || null, actor_name: auth?.user?.email || null,
        details: { name: form.display_name },
      });
      qc.invalidateQueries({ queryKey: ["hr_doc_signatories"] });
      setOpen(false);
      setForm({ display_name: "", designation: "", is_active: true });
      setSigFile(null); setSealFile(null);
      toast.success("Signatory added");
    } catch (e: any) {
      toast.error(e?.message || "Could not save signatory");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (row: any) => {
    const { error } = await (supabase as any)
      .from("hr_doc_signatories").update({ is_active: !row.is_active }).eq("id", row.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["hr_doc_signatories"] });
  };

  const remove = async (row: any) => {
    const { error } = await (supabase as any).from("hr_doc_signatories").delete().eq("id", row.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["hr_doc_signatories"] });
    toast.success("Signatory removed");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" />
          Signature images live in a private bucket and are only ever served through short-lived signed links.
        </p>
        <Button className="h-9" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add signatory
        </Button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={PenLine} title="No signatories yet"
          description="Register who signs company letters, with their signature image."
          action={<Button className="h-9" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />Add signatory</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map((r: any) => (
            <Card key={r.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{r.display_name}</h3>
                    <p className="text-[11px] text-muted-foreground">{r.designation || "—"}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{r.is_active ? "active" : "inactive"}</Badge>
                </div>
                <SignaturePreview path={r.signature_path} />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch checked={r.is_active} onCheckedChange={() => toggleActive(r)} />
                    <span className="text-[11px] text-muted-foreground">Usable</span>
                  </div>
                  <Button size="sm" variant="ghost" className="text-destructive h-8 w-8 p-0" onClick={() => remove(r)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-sm font-semibold">Add signatory</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input className="h-9 mt-1 text-foreground" value={form.display_name}
                onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Designation</Label>
              <Input className="h-9 mt-1 text-foreground" value={form.designation}
                placeholder="HR Manager" onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><Upload className="h-3.5 w-3.5" /> Signature image (transparent PNG)</Label>
              <Input type="file" accept="image/*" className="mt-1 text-foreground"
                onChange={(e) => setSigFile(e.target.files?.[0] || null)} />
            </div>
            <div>
              <Label className="text-xs">Company seal (optional)</Label>
              <Input type="file" accept="image/*" className="mt-1 text-foreground"
                onChange={(e) => setSealFile(e.target.files?.[0] || null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SignatoriesTab;
