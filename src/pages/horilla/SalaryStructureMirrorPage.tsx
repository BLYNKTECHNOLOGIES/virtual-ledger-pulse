import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Info, Lock, Pencil, Save, X, ExternalLink, Plus, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

/**
 * Salary Structure Mirror — HRMS image of the RazorpayX "Default Salary Structure"
 * plus the "Bonus Setup" card.
 *
 * Doctrine: RazorpayX is the payroll authority; the API exposes NO endpoint to
 * push default structures or bonus catalogues. Edit on RazorpayX first, then
 * mirror here so CTC projections, drift alerts and onboarding previews stay
 * accurate. Statutory contributions (PF/ESI) are applied AFTER the bifurcation.
 */

type Component = {
  key: string;
  label: string;
  value: number;
  mode: "percentage" | "fixed";
  taxable: "yes" | "no" | "partially";
};

type Bonus = { key: string; label: string; enabled: boolean };

type Settings = {
  id: string;
  use_xpayroll_default_structure: boolean;
  default_structure_components: Component[];
  bonus_types: Bonus[];
  compliance_settings_updated_at: string | null;
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `custom_${Date.now()}`;

export default function SalaryStructureMirrorPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [useDefault, setUseDefault] = useState(false);
  const [components, setComponents] = useState<Component[]>([]);
  const [bonuses, setBonuses] = useState<Bonus[]>([]);
  const [newBonus, setNewBonus] = useState("");

  const { data: settings, isLoading } = useQuery({
    queryKey: ["hr_razorpay_settings_structure"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_razorpay_settings")
        .select("id, use_xpayroll_default_structure, default_structure_components, bonus_types, compliance_settings_updated_at")
        .eq("is_singleton", true)
        .maybeSingle();
      if (error) throw error;
      return data as Settings;
    },
  });

  useEffect(() => {
    if (settings && !editing) {
      setUseDefault(!!settings.use_xpayroll_default_structure);
      setComponents(Array.isArray(settings.default_structure_components) ? settings.default_structure_components : []);
      setBonuses(Array.isArray(settings.bonus_types) ? settings.bonus_types : []);
    }
  }, [settings, editing]);

  const totalPct = useMemo(
    () => components.filter(c => c.mode === "percentage").reduce((s, c) => s + (Number(c.value) || 0), 0),
    [components]
  );

  const dirty = useMemo(() => {
    if (!settings) return false;
    return (
      useDefault !== settings.use_xpayroll_default_structure ||
      JSON.stringify(components) !== JSON.stringify(settings.default_structure_components) ||
      JSON.stringify(bonuses) !== JSON.stringify(settings.bonus_types)
    );
  }, [useDefault, components, bonuses, settings]);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const payload: any = {
      use_xpayroll_default_structure: useDefault,
      default_structure_components: components,
      bonus_types: bonuses,
      compliance_settings_updated_at: new Date().toISOString(),
      compliance_settings_updated_by: user?.id ?? null,
    };
    const { error } = await (supabase as any).from("hr_razorpay_settings").update(payload).eq("id", settings.id);
    setSaving(false);
    if (error) { toast.error(error.message || "Failed to save"); return; }
    toast.success("Structure mirror updated");
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["hr_razorpay_settings_structure"] });
    qc.invalidateQueries({ queryKey: ["hr_razorpay_settings_compliance_public"] });
  };

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!settings) return <div className="p-6 text-sm text-destructive">No Razorpay settings row found.</div>;

  const readOnly = !editing;
  const lastUpdated = settings.compliance_settings_updated_at
    ? formatDistanceToNow(new Date(settings.compliance_settings_updated_at), { addSuffix: true })
    : "never";

  const setComp = (i: number, patch: Partial<Component>) =>
    setComponents(cs => cs.map((c, idx) => idx === i ? { ...c, ...patch } : c));

  const addComp = () => setComponents(cs => [...cs, { key: `custom_${cs.length + 1}`, label: "New Component", value: 0, mode: "percentage", taxable: "yes" }]);
  const removeComp = (i: number) => setComponents(cs => cs.filter((_, idx) => idx !== i));

  const toggleBonus = (i: number, v: boolean) => setBonuses(bs => bs.map((b, idx) => idx === i ? { ...b, enabled: v } : b));
  const addBonus = () => {
    const t = newBonus.trim();
    if (!t) return;
    if (bonuses.some(b => b.label.toLowerCase() === t.toLowerCase())) { toast.error("Bonus already exists"); return; }
    setBonuses(bs => [...bs, { key: slug(t), label: t, enabled: true }]);
    setNewBonus("");
  };
  const removeBonus = (i: number) => setBonuses(bs => bs.filter((_, idx) => idx !== i));

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Default Salary Structure & Bonuses</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Mirror of RazorpayX default salary structure and bonus catalogue. Last mirrored {lastUpdated}.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <a href="https://x.razorpay.com/payroll/settings" target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open on RazorpayX
            </a>
          </Button>
          {readOnly ? (
            <Button size="sm" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit mirror</Button>
          ) : (
            <>
              <Button size="sm" variant="outline" disabled={saving} onClick={() => setEditing(false)}>
                <X className="h-3.5 w-3.5 mr-1" /> Cancel
              </Button>
              <Button size="sm" disabled={saving || !dirty} onClick={save}>
                <Save className="h-3.5 w-3.5 mr-1" /> {saving ? "Saving…" : "Save mirror"}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex gap-2 items-start">
        <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Statutory is applied after bifurcation.</span>{" "}
          Employer PF/ESI (if enabled in Compliance Settings) is calculated on the components below, so
          the final take-home ratio may differ slightly from the entered percentages. Fixed amounts are
          per <em>monthly</em> pay. If component sum ≠ monthly gross, RazorpayX adjusts LTA → HRA →
          Special Allowance → Basic (LTA highest priority, Basic lowest). Enter <span className="font-mono">0</span> to remove a component.
        </p>
      </div>

      {readOnly && (
        <div className="rounded-lg border border-muted-foreground/20 bg-muted/40 px-3 py-2 flex gap-2 items-center text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          Read-only. Click <span className="font-medium text-foreground mx-1">Edit mirror</span> to change values.
        </div>
      )}

      <Card>
        <CardHeader className="py-3 px-4 bg-muted/40">
          <CardTitle className="text-sm">Default Salary Structure</CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3 py-1">
            <div>
              <p className="text-sm text-foreground">Use XPayroll's default salary structure</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">When ON, RazorpayX applies its own defaults and ignores the components below.</p>
            </div>
            <Switch checked={useDefault} onCheckedChange={setUseDefault} disabled={readOnly} />
          </div>

          <div className="rounded-md border overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted/40 text-[11px] font-medium text-muted-foreground uppercase">
              <div className="col-span-4 sm:col-span-4">Component</div>
              <div className="col-span-3 sm:col-span-2 text-right">Value</div>
              <div className="col-span-3 sm:col-span-3">Type</div>
              <div className="col-span-2 sm:col-span-2">Taxable</div>
              <div className="hidden sm:block sm:col-span-1" />
            </div>
            {components.map((c, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 px-3 py-2 border-t items-center text-sm">
                <div className="col-span-4 sm:col-span-4">
                  {readOnly ? (
                    <span className="text-foreground">{c.label}</span>
                  ) : (
                    <Input value={c.label} onChange={e => setComp(i, { label: e.target.value, key: c.key.startsWith("custom_") ? slug(e.target.value) : c.key })} className="h-8" />
                  )}
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <Input
                    type="number" inputMode="decimal" step="0.01"
                    value={c.value}
                    onChange={e => setComp(i, { value: parseFloat(e.target.value) || 0 })}
                    disabled={readOnly}
                    className="h-8 text-right"
                  />
                </div>
                <div className="col-span-3 sm:col-span-3">
                  {readOnly ? (
                    <span className="text-muted-foreground">{c.mode === "percentage" ? "Percentage" : "Fixed"}</span>
                  ) : (
                    <Select value={c.mode} onValueChange={(v: any) => setComp(i, { mode: v })}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage</SelectItem>
                        <SelectItem value="fixed">Fixed</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="col-span-2 sm:col-span-2">
                  {readOnly ? (
                    <span className={c.taxable === "partially" ? "text-primary" : "text-muted-foreground"}>
                      {c.taxable === "yes" ? "Yes" : c.taxable === "no" ? "No" : "Partially"}
                    </span>
                  ) : (
                    <Select value={c.taxable} onValueChange={(v: any) => setComp(i, { taxable: v })}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                        <SelectItem value="partially">Partially</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="hidden sm:flex sm:col-span-1 justify-end">
                  {!readOnly && (
                    <Button size="icon" variant="ghost" onClick={() => removeComp(i)} className="h-7 w-7 text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className={`${Math.abs(totalPct - 100) < 0.01 ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400"}`}>
              Percentage components sum to <span className="font-mono">{totalPct.toFixed(2)}%</span>
              {Math.abs(totalPct - 100) >= 0.01 && " (Razorpay will adjust via LTA → HRA → Special → Basic)"}
            </span>
            {!readOnly && (
              <Button size="sm" variant="outline" onClick={addComp}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add component
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3 px-4 bg-muted/40">
          <CardTitle className="text-sm">Bonus Setup</CardTitle>
          <p className="text-[11px] text-muted-foreground mt-1">Enable or disable bonus types available for one-time payments.</p>
        </CardHeader>
        <CardContent className="p-4 space-y-2">
          <div className="rounded-md border overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted/40 text-[11px] font-medium text-muted-foreground uppercase">
              <div className="col-span-9">Bonus Type</div>
              <div className="col-span-2 text-center">Enabled</div>
              <div className="col-span-1" />
            </div>
            {bonuses.map((b, i) => (
              <div key={b.key} className="grid grid-cols-12 gap-2 px-3 py-2 border-t items-center text-sm">
                <div className="col-span-9 text-foreground">{b.label}</div>
                <div className="col-span-2 flex justify-center">
                  <Switch checked={b.enabled} onCheckedChange={v => toggleBonus(i, v)} disabled={readOnly} />
                </div>
                <div className="col-span-1 flex justify-end">
                  {!readOnly && !["joining","retention","work_anniversary","end_of_year","retirement","profit_sharing","diwali","sign_on"].includes(b.key) && (
                    <Button size="icon" variant="ghost" onClick={() => removeBonus(i)} className="h-7 w-7 text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {!readOnly && (
            <div className="flex gap-2">
              <Input placeholder="New type" value={newBonus} onChange={e => setNewBonus(e.target.value)} className="h-9" />
              <Button size="sm" onClick={addBonus}><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-1">
        <Badge variant="outline" className="text-[10px]">MIRROR</Badge>
        These values do not push to RazorpayX (the API has no org-settings endpoint) — they only drive HRMS-side CTC previews, structure drift and onboarding hints.
      </div>
    </div>
  );
}
