import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, Braces, Check, FileLock2, ShieldAlert, Upload } from "lucide-react";
import RichTextEditor from "./RichTextEditor";
import { parsePlaceholders, mergeMappings, type PlaceholderMapping } from "@/lib/docTemplate";
import { parseDocxToResult } from "@/lib/docxPlaceholders";



const CATEGORIES = [
  { value: "relieving", label: "Relieving cum Experience Letter" },
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

/**
 * Full-page letter template editor. Lives on its own route so the A4 canvas and
 * the variable panel both get real room — the old modal cramped both.
 */
export function TemplateEditorForm({
  template,
  onDone,
}: {
  template: TemplateRecord | null;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState({
    name: "", category: "custom", description: "",
    requires_approval: false, reference_pattern: "BLYNK/{TYPE}/{FY}/{SEQ:4}",
  });
  const [html, setHtml] = useState("<p></p>");
  const [mappings, setMappings] = useState<PlaceholderMapping[]>([]);
  const [changeNote, setChangeNote] = useState("");
  /** "native" = editable HTML canvas, "docx" = locked Word file kept as-is. */
  const [lane, setLane] = useState<"native" | "docx">("native");
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState<string | null>(null);
  /** Plain text of the locked .docx — used only to discover its placeholders. */
  const [docxText, setDocxText] = useState("");


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
    enabled: !!template?.current_version_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_doc_template_versions").select("*").eq("id", template!.current_version_id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
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
      setLane("native");
      setSourcePath(null); setSourceName(null); setDocxText("");
    }
  }, [template]);

  useEffect(() => {
    if (version) {
      setHtml(version.content_html || "<p></p>");
      setMappings((version.placeholder_map as PlaceholderMapping[]) || []);
      const isDocx = version.lane === "docx" && !!version.source_file_path;
      setLane(isDocx ? "docx" : "native");
      setSourcePath(version.source_file_path || null);
      setSourceName(version.source_file_name || null);
      if (isDocx) loadLockedText(version.source_file_path);
      else setDocxText("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  /** Re-read the stored .docx so its placeholders can be listed for mapping. */
  const loadLockedText = async (path: string) => {
    try {
      const { data, error } = await supabase.storage.from("hr-doc-templates").download(path);
      if (error || !data) throw error || new Error("Stored Word file is missing");
      const { extractDocxText } = await import("@/lib/docxTemplate");
      setDocxText(extractDocxText(await data.arrayBuffer()));
    } catch (e: any) {
      toast.error(e?.message || "Could not read the stored Word template");
    }
  };

  const importEditable = async (file: File) => {
    try {
      setImporting(true);
      const { convertDocxToHtml } = await import("@/lib/docxImport");
      const buffer = await file.arrayBuffer();
      let body = "";
      try {
        body = convertDocxToHtml(buffer).trim();
      } catch (primaryErr) {
        const mammoth = await import("mammoth/mammoth.browser");
        const result = await (mammoth as any).convertToHtml({ arrayBuffer: buffer });
        body = (result?.value || "").trim();
        if (!body) throw primaryErr;
      }
      if (!body) throw new Error("That document had no readable text.");
      setLane("native");
      setSourcePath(null); setSourceName(null); setDocxText("");
      setHtml(body);
      toast.success("Imported — review the formatting before saving");
    } catch (err: any) {
      toast.error(err?.message || "Could not read that .docx file");
    } finally {
      setImporting(false);
    }
  };

  const importLocked = async (file: File) => {
    try {
      setImporting(true);
      const buffer = await file.arrayBuffer();
      const { extractDocxText, parseDocxPlaceholders, validateDocxTemplate } = await import("@/lib/docxTemplate");
      const text = extractDocxText(buffer);
      const found = parseDocxPlaceholders(text);

      // Validate with the real merge engine now — not at issue time.
      const check = validateDocxTemplate(buffer);
      if (check.errors.length) {
        toast.error(`This Word file cannot be merged: ${check.errors[0]}`);
        return;
      }
      for (const w of check.warnings.slice(0, 3)) toast.warning(w);

      const path = `sources/${crypto.randomUUID()}.docx`;
      const { error } = await supabase.storage.from("hr-doc-templates").upload(path, file, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: false,
      });
      if (error) throw error;
      setLane("docx");
      setSourcePath(path);
      setSourceName(file.name);
      setDocxText(text);
      setHtml("");
      toast.success(
        found.length
          ? `Stored as-is — ${found.length} variable${found.length === 1 ? "" : "s"} detected` +
              (check.imageTokens.length ? ` (${check.imageTokens.length} signature slot${check.imageTokens.length === 1 ? "" : "s"})` : "")
          : "Stored as-is — no {{VARIABLES}} found in this document"
      );
    } catch (err: any) {
      toast.error(err?.message || "Could not store that .docx file");
    } finally {
      setImporting(false);
    }
  };

  const parsed = useMemo(
    () => (lane === "docx" ? parseDocxToResult(docxText) : parsePlaceholders(html, true)),
    [lane, docxText, html]
  );


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
        lane,

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
          lane,
          content_html: lane === "docx" ? null : html,
          source_file_path: lane === "docx" ? sourcePath : null,
          source_file_name: lane === "docx" ? sourceName : null,

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
      onDone();
    } catch (e: any) {
      toast.error(e?.message || "Could not save template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
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

          <div className="rounded-lg border border-dashed border-border px-3 py-2 space-y-2">
            <p className="text-[11px] text-muted-foreground">
              Import a Word letter two ways — <strong>locked</strong> keeps your .docx exactly as authored
              (perfect formatting, edited in Word) and HRMS only fills its <code>{"{{VARIABLES}}"}</code>;
              <strong> editable</strong> brings the text into the canvas below.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="shrink-0">
                <input type="file" accept=".docx" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importLocked(f); }} />
                <span className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90">
                  <FileLock2 className="h-3.5 w-3.5" /> {importing ? "Importing…" : "Import .docx (locked)"}
                </span>
              </label>
              <label className="shrink-0">
                <input type="file" accept=".docx" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importEditable(f); }} />
                <span className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium hover:bg-muted">
                  <Upload className="h-3.5 w-3.5" /> Import .docx (editable)
                </span>
              </label>
            </div>
          </div>

          {lane === "docx" ? (
            <div className="rounded-lg border border-border p-4 space-y-2">
              <p className="text-sm font-medium text-foreground flex items-center gap-2">
                <FileLock2 className="h-4 w-4" /> Locked Word template
              </p>
              <p className="text-xs text-muted-foreground">
                <span className="font-mono">{sourceName || "—"}</span> is stored exactly as uploaded. At issue
                time HRMS replaces its <code>{"{{VARIABLES}}"}</code> inside the real Word file, so the letter
                is identical to your document. To change wording, edit it in Word and import it again.
              </p>
              <p className="text-xs text-muted-foreground">
                {parsed.placeholders.length} variable{parsed.placeholders.length === 1 ? "" : "s"} found — map
                them in the panel on the right.
              </p>
              <Button type="button" size="sm" variant="outline" className="h-8"
                onClick={() => { setLane("native"); setSourcePath(null); setSourceName(null); setDocxText(""); }}>
                Switch to editable canvas
              </Button>
            </div>
          ) : (
            <RichTextEditor value={html} onChange={setHtml} onInsertVariable={insertVariable} />
          )}

        </div>

        <div className="space-y-3 min-w-0 xl:sticky xl:top-4 xl:self-start xl:max-h-[calc(100vh-8rem)] xl:overflow-auto xl:pr-1">
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
                    onValueChange={(v) => {
                      // Kind is stored explicitly — never inferred from how the token is spelled.
                      const dt = fieldByKey.get(v)?.data_type;
                      const kind = dt === "signature" ? "signature" : dt === "image" ? "seal" : "text";
                      setMappings((prev) =>
                        prev.map((x) => (x.token === m.token ? { ...x, field_key: v, kind } : x))
                      );
                    }}
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

      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-background/95 py-3 backdrop-blur">
        <Button variant="outline" onClick={onDone} disabled={saving}>Cancel</Button>
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save new version"}</Button>
      </div>
    </div>
  );
}

export default TemplateEditorForm;
