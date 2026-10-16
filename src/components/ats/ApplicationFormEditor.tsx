import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Save, Trash2, LayoutTemplate } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  type ApplicationForm, type FieldMode, type FormQuestion, QUESTION_TYPES, STANDARD_FIELDS,
  deleteFormTemplate, effectiveForm, listFormTemplates, newQuestionId, saveFormTemplate,
} from "@/lib/ats/forms";

const MODE_LABEL: Record<FieldMode, string> = { required: "Required", optional: "Optional", hidden: "Hidden" };
const CHOICE = (t: string) => t === "single_choice" || t === "multi_choice";

export function ApplicationFormEditor({ value, onChange, multiShift }: { value: ApplicationForm; onChange: (f: ApplicationForm) => void; multiShift: boolean }) {
  const qc = useQueryClient();
  const templates = useQuery({ queryKey: ["ats_form_templates"], queryFn: listFormTemplates });
  const [tplName, setTplName] = useState("");
  const f = value;
  const setField = (k: keyof ApplicationForm["fields"], m: FieldMode) => {
    const fields = { ...f.fields, [k]: m };
    if (fields.phone === "hidden" && fields.email === "hidden") return toast.error("Keep at least phone or email so you can reach the candidate.");
    onChange({ ...f, fields });
  };
  const setQ = (i: number, patch: Partial<FormQuestion>) => onChange({ ...f, questions: f.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  const move = (i: number, d: number) => {
    const qs = [...f.questions]; const j = i + d; if (j < 0 || j >= qs.length) return;
    [qs[i], qs[j]] = [qs[j], qs[i]]; onChange({ ...f, questions: qs });
  };
  const addQ = () => onChange({ ...f, questions: [...f.questions, { id: newQuestionId(), label: "", type: "short_text", required: false }] });

  const saveTpl = async () => {
    try { await saveFormTemplate(tplName, effectiveForm(f)); setTplName(""); qc.invalidateQueries({ queryKey: ["ats_form_templates"] }); toast.success("Template saved"); }
    catch (e: any) { toast.error(e.message ?? "Could not save template"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[180px] flex-1 space-y-1.5">
          <Label>Start from template</Label>
          <Select value="" onValueChange={(id) => { const t = templates.data?.find((x) => x.id === id); if (t) { onChange(effectiveForm(t.form)); toast.success(`Loaded "${t.name}"`); } }}>
            <SelectTrigger className="text-foreground"><SelectValue placeholder={templates.data?.length ? "Choose a template" : "No templates yet"} /></SelectTrigger>
            <SelectContent>{(templates.data ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Template name" className="w-44 text-foreground" maxLength={80} />
        <Button type="button" variant="outline" disabled={!tplName.trim()} onClick={saveTpl} className="gap-1.5"><Save className="h-4 w-4" /> Save as template</Button>
        {(templates.data?.length ?? 0) > 0 && (
          <Select value="" onValueChange={async (id) => { try { await deleteFormTemplate(id); qc.invalidateQueries({ queryKey: ["ats_form_templates"] }); toast.success("Template deleted"); } catch (e: any) { toast.error(e.message); } }}>
            <SelectTrigger className="w-40 text-foreground"><SelectValue placeholder="Delete template" /></SelectTrigger>
            <SelectContent>{templates.data!.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>
      <p className="text-xs text-muted-foreground"><LayoutTemplate className="mr-1 inline h-3.5 w-3.5" />A template is copied into this job. Changing the template later does not change jobs already posted.</p>

      <div className="space-y-2">
        <Label>Standard fields</Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"><span>Full name</span><span className="text-xs text-muted-foreground">Always required</span></div>
          {STANDARD_FIELDS.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-sm">
              <span>{s.label}</span>
              <Select value={f.fields[s.key]} onValueChange={(m) => setField(s.key, m as FieldMode)}>
                <SelectTrigger className="h-8 w-28 text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent>{(["required", "optional", "hidden"] as FieldMode[]).map((m) => <SelectItem key={m} value={m}>{MODE_LABEL[m]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          ))}
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"><span>Shift preference</span><span className="text-xs text-muted-foreground">{multiShift ? "Required (more than one shift)" : "Not asked (one shift)"}</span></div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between"><Label>Custom questions</Label>
          <Button type="button" size="sm" variant="outline" onClick={addQ} disabled={f.questions.length >= 30} className="gap-1.5"><Plus className="h-4 w-4" /> Add question</Button></div>
        {f.questions.length === 0 && <p className="text-xs text-muted-foreground">No extra questions. Add one to ask candidates something specific to this job.</p>}
        {f.questions.map((q, i) => (
          <div key={q.id} className="space-y-2 rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input value={q.label} onChange={(e) => setQ(i, { label: e.target.value })} placeholder="Question shown to the candidate" className="min-w-[200px] flex-1 text-foreground" maxLength={300} aria-label="Question" />
              <Select value={q.type} onValueChange={(t) => setQ(i, { type: t as FormQuestion["type"], options: CHOICE(t) ? q.options ?? [] : undefined, knockout: [] })}>
                <SelectTrigger className="w-40 text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent>{QUESTION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
              <label className="flex items-center gap-2 text-sm"><Switch checked={q.required} onCheckedChange={(v) => setQ(i, { required: v })} /> Required</label>
              <Button type="button" size="icon" variant="ghost" aria-label="Move up" onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
              <Button type="button" size="icon" variant="ghost" aria-label="Move down" onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
              <Button type="button" size="icon" variant="ghost" aria-label="Remove question" className="text-destructive" onClick={() => onChange({ ...f, questions: f.questions.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
            </div>
            <Input value={q.help ?? ""} onChange={(e) => setQ(i, { help: e.target.value })} placeholder="Help text (optional)" className="text-foreground" maxLength={500} />
            {CHOICE(q.type) && (
              <Input value={(q.options ?? []).join(", ")} onChange={(e) => setQ(i, { options: e.target.value.split(",").map((x) => x.trimStart()) })} placeholder="Options, separated by commas" className="text-foreground" />
            )}
            {q.type === "number" && (
              <div className="flex gap-2">
                <Input type="number" value={q.min ?? ""} onChange={(e) => setQ(i, { min: e.target.value === "" ? null : Number(e.target.value) })} placeholder="Min" className="w-28 text-foreground" />
                <Input type="number" value={q.max ?? ""} onChange={(e) => setQ(i, { max: e.target.value === "" ? null : Number(e.target.value) })} placeholder="Max" className="w-28 text-foreground" />
              </div>
            )}
            {(q.type === "yes_no" || CHOICE(q.type)) && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Flag as "Not a fit" when the answer is:</span>
                {(q.type === "yes_no" ? ["Yes", "No"] : (q.options ?? []).map((o) => o.trim()).filter(Boolean)).map((o) => {
                  const on = q.knockout?.includes(o);
                  return <Button key={o} type="button" size="sm" variant={on ? "default" : "outline"} className="h-7"
                    onClick={() => setQ(i, { knockout: on ? q.knockout!.filter((k) => k !== o) : [...(q.knockout ?? []), o] })}>{o}</Button>;
                })}
                <span>(only a flag for HR; never rejects or emails)</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
