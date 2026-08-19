import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Building2, Upload, Save, Loader2, FileWarning } from "lucide-react";
import {
  COMPANY_IDENTITY_BUCKET, fetchCompanyIdentity, signCompanyFile,
  type CompanyIdentity,
} from "@/lib/companyIdentity";

/**
 * One row, one truth: the company's legal identity plus the universal A4
 * letterhead that every generated letter is printed on. The shaded band at the
 * top and bottom of the preview is the printed header/footer — letter content
 * can never enter it.
 */
export function CompanyIdentityTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<CompanyIdentity>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: identity, isLoading } = useQuery({
    queryKey: ["hr_company_identity"],
    queryFn: fetchCompanyIdentity,
  });

  useEffect(() => {
    if (identity) setForm(identity);
  }, [identity]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!identity) return setPreviewUrl(null);
      const url = identity.letterhead_path
        ? await signCompanyFile(identity.letterhead_path)
        : identity.letterhead_url;
      if (!cancelled) setPreviewUrl(url || null);
    })();
    return () => { cancelled = true; };
  }, [identity]);

  const set = (k: keyof CompanyIdentity, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const margins = useMemo(
    () => ({
      top: Number(form.letterhead_margin_top_mm ?? 35),
      bottom: Number(form.letterhead_margin_bottom_mm ?? 30),
      left: Number(form.letterhead_margin_left_mm ?? 19),
      right: Number(form.letterhead_margin_right_mm ?? 19),
    }),
    [form]
  );

  const save = async () => {
    if (!identity) return;
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("hr_company_identity").update({
      legal_name: form.legal_name || "",
      trade_name: form.trade_name || "",
      cin: form.cin || "",
      gstin: form.gstin || "",
      pan: form.pan || "",
      registered_address: form.registered_address || "",
      corporate_address: form.corporate_address || "",
      phone: form.phone || "",
      email: form.email || "",
      website: form.website || "",
      letterhead_margin_top_mm: margins.top,
      letterhead_margin_bottom_mm: margins.bottom,
      letterhead_margin_left_mm: margins.left,
      letterhead_margin_right_mm: margins.right,
      updated_by: auth?.user?.id || null,
    }).eq("id", identity.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["hr_company_identity"] });
    qc.invalidateQueries({ queryKey: ["hr_company_letterhead"] });
    toast.success("Company identity saved");
  };

  const uploadLetterhead = async (file: File) => {
    if (!identity) return;
    if (!/^image\/(png|jpeg|jpg|webp)$/.test(file.type)) {
      return toast.error("Upload the letterhead as a full A4 page image (PNG or JPG)");
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `letterhead/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(COMPANY_IDENTITY_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { error } = await (supabase as any).from("hr_company_identity")
        .update({ letterhead_path: path }).eq("id", identity.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["hr_company_identity"] });
      qc.invalidateQueries({ queryKey: ["hr_company_letterhead"] });
      toast.success("Letterhead updated");
    } catch (e: any) {
      toast.error(e?.message || "Could not upload the letterhead");
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading…</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardContent className="p-4 space-y-4">
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Legal identity
          </p>
          <p className="text-[11px] text-muted-foreground -mt-2">
            Used by HR letters and invoices alike. Change it once, everywhere follows.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Registered legal name" value={form.legal_name} onChange={(v) => set("legal_name", v)} />
            <Field label="Trade / brand name" value={form.trade_name} onChange={(v) => set("trade_name", v)} />
            <Field label="CIN" value={form.cin} onChange={(v) => set("cin", v)} />
            <Field label="GSTIN" value={form.gstin} onChange={(v) => set("gstin", v)} />
            <Field label="PAN" value={form.pan} onChange={(v) => set("pan", v)} />
            <Field label="Phone" value={form.phone} onChange={(v) => set("phone", v)} />
            <Field label="Email" value={form.email} onChange={(v) => set("email", v)} />
            <Field label="Website" value={form.website} onChange={(v) => set("website", v)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Registered office address</Label>
              <Textarea rows={3} className="text-foreground" value={form.registered_address || ""}
                onChange={(e) => set("registered_address", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Corporate / working address</Label>
              <Textarea rows={3} className="text-foreground" value={form.corporate_address || ""}
                onChange={(e) => set("corporate_address", e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Letterhead safe area (mm)</p>
            <p className="text-[11px] text-muted-foreground -mt-1">
              Space reserved on every page so the printed header and footer are never written over.
            </p>
            <div className="grid grid-cols-4 gap-2">
              <NumField label="Top" value={margins.top} onChange={(v) => set("letterhead_margin_top_mm", v)} />
              <NumField label="Bottom" value={margins.bottom} onChange={(v) => set("letterhead_margin_bottom_mm", v)} />
              <NumField label="Left" value={margins.left} onChange={(v) => set("letterhead_margin_left_mm", v)} />
              <NumField label="Right" value={margins.right} onChange={(v) => set("letterhead_margin_right_mm", v)} />
            </div>
          </div>

          <Button onClick={save} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-medium text-foreground">Universal letterhead (A4)</p>
          <p className="text-[11px] text-muted-foreground -mt-1">
            Every letter prints on this page. Replace it with a full A4 page image (210 × 297 mm) if the
            branding changes.
          </p>

          <div className="relative w-full overflow-hidden rounded border border-border bg-white"
            style={{ aspectRatio: "210 / 297" }}>
            {previewUrl ? (
              <img src={previewUrl} alt="Company letterhead" className="absolute inset-0 h-full w-full object-fill" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
                <FileWarning className="h-5 w-5" />
                <span className="text-[11px]">No letterhead uploaded</span>
              </div>
            )}
            {/* Safe area: content lives strictly inside this outline. */}
            <div
              className="absolute border-2 border-dashed border-primary/60 bg-primary/5"
              style={{
                top: `${(margins.top / 297) * 100}%`,
                bottom: `${(margins.bottom / 297) * 100}%`,
                left: `${(margins.left / 210) * 100}%`,
                right: `${(margins.right / 210) * 100}%`,
              }}
            />
          </div>

          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLetterhead(f); e.target.value = ""; }} />
          <Button variant="outline" className="w-full gap-1.5" disabled={uploading}
            onClick={() => fileRef.current?.click()}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Replace letterhead
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value?: string | null; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input className="h-9 text-foreground" value={value || ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px]">{label}</Label>
      <Input type="number" min={0} max={80} step={1} className="h-9 text-foreground"
        value={String(value)} onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </div>
  );
}

export default CompanyIdentityTab;
