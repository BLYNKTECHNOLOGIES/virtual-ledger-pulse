import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { toast } from "sonner";
import { Braces, Copy, Pencil, Plus, Search, ShieldAlert } from "lucide-react";
import { normaliseToken } from "@/lib/docTemplate";
import { RESOLVER_SOURCES } from "@/lib/docResolvers";

const GROUPS: Array<{ value: string; label: string }> = [
  { value: "employee", label: "Person" },
  { value: "employment", label: "Employment" },
  { value: "salary", label: "Salary" },
  { value: "terms", label: "Terms" },
  { value: "company", label: "Company" },
  { value: "signatory", label: "Signatory" },
  { value: "system", label: "System" },
  { value: "custom", label: "Custom" },
];

const TYPES = [
  { value: "text", label: "Text" },
  { value: "date", label: "Date" },
  { value: "currency", label: "Amount (INR)" },
];

type Row = {
  id: string;
  field_key: string;
  label: string;
  field_group: string;
  data_type: string;
  formatter: string | null;
  resolver_id: string | null;
  description: string | null;
  is_sensitive: boolean;
  default_value: string | null;
  sort_order: number;
  is_active: boolean;
  aliases: string[] | null;
};

type Draft = {
  id: string | null;
  field_key: string;
  label: string;
  data_type: string;
  default_value: string;
  aliases: string;
  description: string;
  is_sensitive: boolean;
};

const wordToken = (key: string) => `{{${key.toUpperCase()}}}`;

/**
 * The shared variable dictionary. Every template — Word or canvas — names its
 * variables from this list (or an alias), so a variable is filled the same way
 * in every letter: from the onboarding form for candidates and from the
 * employee record for employees. Sources are fixed in code; HR edits labels,
 * aliases, defaults, and adds custom variables that are asked while generating.
 */
export function VariablesTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const [showRetired, setShowRetired] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["hr_doc_field_catalog", "all"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_doc_field_catalog").select("*").order("sort_order").order("field_key");
      if (error) throw error;
      return (data || []) as Row[];
    },
  });

  const filtered = useMemo(() => {
    const q = normaliseToken(search);
    const text = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showRetired && !r.is_active) return false;
      if (group !== "all" && r.field_group !== group) return false;
      if (!text) return true;
      return (
        r.field_key.includes(q) ||
        (r.aliases || []).some((a) => a.includes(q)) ||
        r.label.toLowerCase().includes(text)
      );
    });
  }, [rows, search, group, showRetired]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${text}`);
    } catch {
      toast.error("Could not copy");
    }
  };

  const openEdit = (r: Row) =>
    setDraft({
      id: r.id,
      field_key: r.field_key,
      label: r.label,
      data_type: r.data_type,
      default_value: r.default_value || "",
      aliases: (r.aliases || []).join(", "),
      description: r.description || "",
      is_sensitive: r.is_sensitive,
    });

  const openNew = () =>
    setDraft({ id: null, field_key: "", label: "", data_type: "text", default_value: "", aliases: "", description: "", is_sensitive: false });

  /** Aliases are normalised and may never collide with another variable's key or alias. */
  const validate = (d: Draft): { key: string; aliases: string[] } | string => {
    const key = d.id ? d.field_key : normaliseToken(d.field_key);
    if (!key) return "Give the variable a name";
    if (!/^[a-z][a-z0-9_]*$/.test(key)) return "Use letters, numbers and underscores, starting with a letter";
    if (!d.label.trim()) return "Give the variable a label";
    const aliases = [...new Set(d.aliases.split(/[,\n]/).map((a) => normaliseToken(a)).filter((a) => a && a !== key))];
    const others = rows.filter((r) => r.id !== d.id);
    if (!d.id && others.some((r) => r.field_key === key || (r.aliases || []).includes(key))) {
      return `"${key}" is already a variable or an alias`;
    }
    for (const a of aliases) {
      const clash = others.find((r) => r.field_key === a || (r.aliases || []).includes(a));
      if (clash) return `"${a}" already belongs to ${clash.label} (${clash.field_key})`;
    }
    return { key, aliases };
  };

  const save = async () => {
    if (!draft) return;
    const checked = validate(draft);
    if (typeof checked === "string") return toast.error(checked);
    setSaving(true);
    try {
      const common = {
        label: draft.label.trim(),
        aliases: checked.aliases,
        default_value: draft.default_value.trim() || null,
        description: draft.description.trim() || null,
      };
      if (draft.id) {
        const { error } = await (supabase as any).from("hr_doc_field_catalog").update(common).eq("id", draft.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("hr_doc_field_catalog").insert({
          ...common,
          field_key: checked.key,
          field_group: "custom",
          data_type: draft.data_type,
          formatter: draft.data_type === "date" ? "DD MMM YYYY" : null,
          resolver_id: null,
          is_sensitive: draft.is_sensitive,
          sort_order: 200,
          is_active: true,
        });
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["hr_doc_field_catalog"] });
      toast.success(draft.id ? "Variable updated" : `Added ${wordToken(checked.key)}`);
      setDraft(null);
    } catch (e: any) {
      toast.error(e?.message || "Could not save the variable");
    } finally {
      setSaving(false);
    }
  };

  /** Only custom variables (no source in the system) can be retired; templates keep their mapping. */
  const toggleRetired = async (r: Row) => {
    const { error } = await (supabase as any).from("hr_doc_field_catalog").update({ is_active: !r.is_active }).eq("id", r.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["hr_doc_field_catalog"] });
    toast.success(r.is_active ? "Variable retired" : "Variable restored");
  };

  const sourceOf = (r: Row) =>
    r.resolver_id && RESOLVER_SOURCES[r.resolver_id]
      ? RESOLVER_SOURCES[r.resolver_id]
      : r.resolver_id
        ? r.resolver_id
        : r.default_value
          ? "Default below, editable while generating"
          : "Asked while generating";

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-1.5">
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            <Braces className="h-4 w-4" /> One variable list for every template
          </p>
          <p className="text-xs text-muted-foreground">
            Write a variable in a Word template as <code>{"{{VARIABLE}}"}</code> (or in the canvas as <code>{"{variable}"}</code>),
            using its name or any alias. It maps itself when the template is imported and is filled the same way in every
            letter — from the onboarding form for candidates, from the employee record for employees. Salary figures come
            from the CTC with the standard structure, so they are never asked separately.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search name, alias or label…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={group} onValueChange={setGroup}>
          <SelectTrigger className="h-9 w-[160px] text-foreground"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All groups</SelectItem>
            {GROUPS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={showRetired} onCheckedChange={setShowRetired} /> Show retired
        </label>
        <Button className="h-9" onClick={openNew}><Plus className="h-4 w-4 mr-1.5" /> New variable</Button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Braces} title="No variables match" description="Try another name, alias or group." />
      ) : (
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {filtered.map((r) => (
              <div key={r.id} className={`grid gap-2 p-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_auto] md:items-start ${r.is_active ? "" : "opacity-60"}`}>
                <div className="min-w-0 space-y-1">
                  <button type="button" onClick={() => copy(wordToken(r.field_key))} className="inline-flex items-center gap-1.5 text-left" title="Copy for Word">
                    <code className="text-xs font-semibold text-foreground break-all">{wordToken(r.field_key)}</code>
                    <Copy className="h-3 w-3 text-muted-foreground shrink-0" />
                  </button>
                  <p className="text-xs text-foreground">{r.label}</p>
                  {(r.aliases || []).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {(r.aliases || []).map((a) => (
                        <button key={a} type="button" onClick={() => copy(wordToken(a))} title="Copy alias for Word">
                          <Badge variant="outline" className="text-[10px] font-mono">{a.toUpperCase()}</Badge>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="text-[11px] text-muted-foreground">
                    <span className="text-foreground">Filled from:</span> {sourceOf(r)}
                  </p>
                  {r.default_value && (
                    <p className="text-[11px] text-muted-foreground"><span className="text-foreground">Default:</span> {r.default_value}</p>
                  )}
                  {r.description && <p className="text-[11px] text-muted-foreground">{r.description}</p>}
                </div>
                <div className="flex items-center gap-1.5 md:justify-end">
                  <Badge variant="outline" className="text-[10px] capitalize">{GROUPS.find((g) => g.value === r.field_group)?.label || r.field_group}</Badge>
                  {r.is_sensitive && (
                    <Badge variant="outline" className="text-[10px] gap-1 text-amber-500 border-amber-500/40">
                      <ShieldAlert className="h-3 w-3" /> sensitive
                    </Badge>
                  )}
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Edit" onClick={() => openEdit(r)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {r.field_group === "custom" && !r.resolver_id && (
                    <Button size="sm" variant="ghost" className="h-8 px-2 text-[11px]" onClick={() => toggleRetired(r)}>
                      {r.is_active ? "Retire" : "Restore"}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? `Edit ${wordToken(draft.field_key)}` : "New variable"}</DialogTitle>
            <DialogDescription>
              {draft?.id
                ? "Where the value comes from is fixed by the system. Change the label, the aliases templates may use, or a default."
                : "A custom variable has no source in the system, so it is asked while generating unless you give it a default."}
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              {!draft.id && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Name</Label>
                    <Input className="h-9 mt-1 text-foreground font-mono" value={draft.field_key} placeholder="joining_bonus"
                      onChange={(e) => setDraft({ ...draft, field_key: e.target.value })} />
                    <p className="text-[10px] text-muted-foreground mt-1">In Word: {wordToken(normaliseToken(draft.field_key) || "name")}</p>
                  </div>
                  <div>
                    <Label className="text-xs">Type</Label>
                    <Select value={draft.data_type} onValueChange={(v) => setDraft({ ...draft, data_type: v })}>
                      <SelectTrigger className="h-9 mt-1 text-foreground"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              <div>
                <Label className="text-xs">Label</Label>
                <Input className="h-9 mt-1 text-foreground" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Aliases (comma separated)</Label>
                <Input className="h-9 mt-1 text-foreground font-mono" value={draft.aliases} placeholder="candidate_name, full_name"
                  onChange={(e) => setDraft({ ...draft, aliases: e.target.value })} />
                <p className="text-[10px] text-muted-foreground mt-1">Other spellings templates may use for this same variable.</p>
              </div>
              <div>
                <Label className="text-xs">Default value</Label>
                <Input className="h-9 mt-1 text-foreground" value={draft.default_value}
                  onChange={(e) => setDraft({ ...draft, default_value: e.target.value })} />
                <p className="text-[10px] text-muted-foreground mt-1">Used when the record has no value; still editable before issuing where the letter allows.</p>
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea className="mt-1 text-foreground text-xs" rows={2} value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
              {!draft.id && (
                <label className="flex items-center gap-2 text-xs text-foreground">
                  <Switch checked={draft.is_sensitive} onCheckedChange={(v) => setDraft({ ...draft, is_sensitive: v })} />
                  Sensitive (salary, PAN) — templates using it are visible to HR staff only
                </label>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default VariablesTab;
