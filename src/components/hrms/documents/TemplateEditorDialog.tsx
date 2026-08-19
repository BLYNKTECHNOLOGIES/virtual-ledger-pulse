import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, Braces, Check, ShieldAlert } from "lucide-react";
import RichTextEditor from "./RichTextEditor";
import { parsePlaceholders, mergeMappings, type PlaceholderMapping } from "@/lib/docTemplate";

const CATEGORIES = [
  { value: "relieving", label: "Relieving Letter" },
  { value: "experience", label: "Experience Letter" },
  { value: "appointment", label: "Appointment Letter" },
  { value: "appraisal", label: "Appraisal Letter" },
  { value: "warning", label: "Warning / Disciplinary" },
  { value: "custom", label: "Custom" },
];

export interface TemplateRecord {
  id: string;
  name: string;
  category: string;
  description: string | null;
  contains_sensitive: boolean;
  requires_approval: boolean;
  reference_pattern: string | null;
  status: string;
  current_version_id: string | null;
}

export function TemplateEditorDialog({
  open, onOpenChange, template,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  template: TemplateRecord | null;
}) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", category: "custom", description: "",
    requires_approval: false, reference_pattern: "BLYNK/{TYPE}/{FY}/{SEQ:4}",
  });
  const [html, setHtml] = useState("<p></p>");
  const [mappings, setMappings] = useState<PlaceholderMapping[]>([]);
  const [changeNote, setChangeNote] = useState("");

  const { data: fields = [] } = useQuery({
    queryKey: ["hr_doc_field_catalog"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_doc_field_catalog").select("*").eq("is_active", true).order("sort_order");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: signatories = [] } = useQuery({
    queryKey: ["hr_doc_signatories", "active"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_doc_signatories").select("id, display_name, designation").eq("is_active", true).order("display_name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: version } = useQuery({
    queryKey: ["hr_doc_template_version", template?.current_version_id],
    enabled: open && !!template?.current_version_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_doc_template_versions").select("*").eq("id", template!.current_version_id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!open) return;
    setChangeNote("");
    if (template) {
      setForm({
        name: template.name,
        category: template.category,
        description: template.description || "",
        requires_approval: template.requires_approval,
        reference_pattern: template.reference_pattern || "BLYNK/{TYPE}/{FY}/{SEQ:4}",
      });
    } else {
      setForm({ name: "", category: "custom", description: "", requires_approval: false, reference_pattern: "BLYNK/{TYPE}/{FY}/{SEQ:4}" });
      setHtml("<p></p>");
      setMappings([]);
    }
  }, [open, template]);

  useEffect(() => {
    if (version) {
      setHtml(version.content_html || "<p></p>");
      setMappings((version.placeholder_map as PlaceholderMapping[]) || []);
    }
  }, [version]);

  const parsed = useMemo(() => parsePlaceholders(html, true), [html]);

  useEffect(() => {
    setMappings((prev) => mergeMappings(parsed.placeholders, prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed.placeholders.map((p) => p.token).join("|")]);

  const fieldByKey = useMemo(
    () => new Map<string, any>(fields.map((f: any) => [f.field_key, f])),
    [fields]
  );
  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const f of fields as any[]) (g[f.field_group] ||= []).push(f);
    return g;
  }, [fields]);

  const containsSensitive = mappings.some((m) => m.field_key && fieldByKey.get(m.field_key)?.is_sensitive);
  const unmapped = mappings.filter((m) => !m.field_key).length;

  const insertVariable = () => {
    document.execCommand("insertText", false, "{}");
    toast.info("Type the field name inside the braces, then map it below.");
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Give the template a name");
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const actor = auth?.user?.id || null;
      let templateId = template?.id;

      const payload = {
        name: form.name.trim(),
        category: form.category,
        description: form.description || null,
        lane: "native",
        contains_sensitive: containsSensitive,
        requires_approval: form.requires_approval,
        reference_pattern: form.reference_pattern || null,
      };

      if (templateId) {
        const { error } = await (supabase as any).from("hr_doc_templates").update(payload).eq("id", templateId);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any)
          .from("hr_doc_templates")
          .insert({ ...payload, status: "active", created_by: actor, created_by_name: auth?.user?.email || null })
          .select("id").single();
        if (error) throw error;
        templateId = data.id;
      }

      const { data: last } = await (supabase as any)
        .from("hr_doc_template_versions").select("version_no")
        .eq("template_id", templateId).order("version_no", { ascending: false }).limit(1).maybeSingle();
      const nextVersion = (last?.version_no || 0) + 1;

      const { data: ver, error: verErr } = await (supabase as any)
        .from("hr_doc_template_versions").insert({
          template_id: templateId,
          version_no: nextVersion,
          lane: "native",
          content_html: html,
          placeholder_map: mappings,
          unparsed_tokens: parsed.unparsed,
          change_note: changeNote || null,
          created_by: actor,
          created_by_name: auth?.user?.email || null,
        }).select("id").single();
      if (verErr) throw verErr;

      const { error: linkErr } = await (supabase as any)
        .from("hr_doc_templates").update({ current_version_id: ver.id }).eq("id", templateId);
      if (linkErr) throw linkErr;

      await (supabase as any).from("hr_doc_audit_log").insert({
        entity_type: "template",
        entity_id: templateId,
        action: template ? "template_edited" : "template_created",
        actor_id: actor,
        actor_name: auth?.user?.email || null,
        details: { version_no: nextVersion, placeholders: mappings.length },
      });

      qc.invalidateQueries({ queryKey: ["hr_doc_templates"] });
      qc.invalidateQueries({ queryKey: ["hr_doc_template_version"] });
      toast.success(`Saved as version ${nextVersion}`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Could not save template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            {template ? `Edit template — ${template.name}` : "New template"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3 min-w-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Template name</Label>
                <Input className="h-9 mt-1 text-foreground" value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Relieving cum Experience Letter" />
              </div>
              <div>
                <Label className="text-xs">Letter type</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger className="h-9 mt-1 text-foreground"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border px-3 py-2">
              <p className="text-[11px] text-muted-foreground">
                Have a Word letterhead? Import it — the text and its <code>{"{variables}"}</code> come into the editor.
              </p>
              <label className="shrink-0">
                <input
                  type="file"
                  accept=".docx"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    try {
                      setImporting(true);
                      const mammoth = await import("mammoth/mammoth.browser");
                      const buffer = await file.arrayBuffer();
                      const result = await (mammoth as any).convertToHtml({ arrayBuffer: buffer });
                      const body = (result?.value || "").trim();
                      if (!body) throw new Error("That document had no readable text.");
                      setHtml(body);
                      toast.success("Imported — review the formatting before saving");
                    } catch (err: any) {
                      toast.error(err?.message || "Could not read that .docx file");
                    } finally {
                      setImporting(false);
                    }
                  }}
                />
                <span className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium hover:bg-muted">
                  <Upload className="h-3.5 w-3.5" /> {importing ? "Importing…" : "Import .docx"}
                </span>
              </label>
            </div>

            <RichTextEditor value={html} onChange={setHtml} onInsertVariable={insertVariable} />
          </div>

          <div className="space-y-3 min-w-0 overflow-auto max-h-[70vh] pr-1">
            <div className="rounded-lg border border-border p-3 space-y-2">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Braces className="h-3.5 w-3.5" /> Variables detected ({parsed.placeholders.length})
              </p>
              <p className="text-[11px] text-muted-foreground">
                Write <code>{"{field}"}</code> anywhere in the letter. Use <code>{"{{"}</code> for a literal brace.
                Numbered tokens like <code>{"{sign1}"}</code> and <code>{"{sign2}"}</code> map independently.
              </p>

              {parsed.placeholders.length === 0 && (
                <p className="text-[11px] text-muted-foreground">No variables yet.</p>
              )}

              {mappings.map((m) => {
                const meta = parsed.placeholders.find((p) => p.token === m.token);
                const field = m.field_key ? fieldByKey.get(m.field_key) : null;
                const isSignature = field?.data_type === "signature" || field?.data_type === "image";
                return (
                  <div key={m.token} className="rounded-md border border-border p-2 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <code className="text-[11px] text-foreground">{`{${m.token}}`}</code>
                      <span className="text-[10px] text-muted-foreground">
                        {meta?.count && meta.count > 1 ? `${meta.count}×` : ""}
                        {m.field_key ? <Check className="inline h-3 w-3 text-emerald-500 ml-1" /> : null}
                      </span>
                    </div>
                    <Select
                      value={m.field_key || ""}
                      onValueChange={(v) =>
                        setMappings((prev) => prev.map((x) => (x.token === m.token ? { ...x, field_key: v } : x)))
                      }
                    >
                      <SelectTrigger className="h-8 text-xs text-foreground">
                        <SelectValue placeholder="Which field is this?" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {Object.entries(grouped).map(([group, list]) => (
                          <div key={group}>
                            <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">{group}</p>
                            {list.map((f: any) => (
                              <SelectItem key={f.field_key} value={f.field_key} className="text-xs">
                                {f.label}{f.is_sensitive ? " · sensitive" : ""}
                              </SelectItem>
                            ))}
                          </div>
                        ))}
                      </SelectContent>
                    </Select>
                    {isSignature && (
                      <Select
                        value={m.signatory_id || ""}
                        onValueChange={(v) =>
                          setMappings((prev) => prev.map((x) => (x.token === m.token ? { ...x, signatory_id: v } : x)))
                        }
                      >
                        <SelectTrigger className="h-8 text-xs text-foreground">
                          <SelectValue placeholder="Which signatory?" />
                        </SelectTrigger>
                        <SelectContent>
                          {signatories.map((s: any) => (
                            <SelectItem key={s.id} value={s.id} className="text-xs">
                              {s.display_name}{s.designation ? ` — ${s.designation}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                );
              })}

              {unmapped > 0 && (
                <p className="text-[11px] text-amber-500 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> {unmapped} variable(s) still unmapped
                </p>
              )}
              {parsed.unparsed.length > 0 && (
                <div className="text-[11px] text-destructive space-y-1">
                  <p className="flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Unparseable braces:</p>
                  {parsed.unparsed.map((u) => <code key={u} className="block">{u}</code>)}
                </div>
              )}
              {containsSensitive && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <ShieldAlert className="h-3 w-3" /> Contains salary / sensitive fields
                </Badge>
              )}
            </div>

            <div className="rounded-lg border border-border p-3 space-y-3">
              <div>
                <Label className="text-xs">Reference number pattern</Label>
                <Input className="h-8 mt-1 text-foreground text-xs" value={form.reference_pattern}
                  onChange={(e) => setForm((f) => ({ ...f, reference_pattern: e.target.value }))} />
                <p className="text-[10px] text-muted-foreground mt-1">Tokens: {"{TYPE} {FY} {YYYY} {MM} {SEQ:4}"}</p>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">Require approval before issuing</Label>
                <Switch checked={form.requires_approval}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, requires_approval: v }))} />
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Textarea className="mt-1 text-foreground text-xs" rows={2} value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Change note (saved with this version)</Label>
                <Input className="h-8 mt-1 text-foreground text-xs" value={changeNote}
                  onChange={(e) => setChangeNote(e.target.value)} placeholder="What changed?" />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save new version"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default TemplateEditorDialog;
