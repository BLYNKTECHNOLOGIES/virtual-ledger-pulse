import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { EmployeeCombobox } from "./EmployeeCombobox";
import { additionTypeCode } from "@/lib/hrms/additionType";


type Kind = "addition" | "deduction";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: Kind;
  period: string;
  /** rows of hr_razorpay_employee_map joined with hr_employees */
  employees: any[];
  onDone: () => void;
}

const fullName = (e: any) => `${e?.first_name || ""} ${e?.last_name || ""}`.trim();

// RazorpayX "Bonus" additions are restricted to these two labels by policy.
const BONUS_LABELS = ["Performance bonus", "Overtime"];

type RowDraft = { key: string; hr_employee_id: string; label: string; amount: string; addition_type: string; taxable: boolean };

const newDraft = (defaults?: Partial<RowDraft>): RowDraft => ({
  key: Math.random().toString(36).slice(2),
  hr_employee_id: "",
  label: "",
  amount: "",
  addition_type: "bonus",
  taxable: true,
  ...defaults,
});

export function BulkPayrollInputDialog({ open, onOpenChange, kind, period, employees, onDone }: Props) {
  const table = kind === "addition" ? "hr_payroll_input_additions" : "hr_payroll_input_deductions";
  const [mode, setMode] = useState<"rows" | "select" | "paste">("rows");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [additionType, setAdditionType] = useState("bonus");
  const [taxable, setTaxable] = useState(true);
  const [paste, setPaste] = useState("");
  const [drafts, setDrafts] = useState<RowDraft[]>([newDraft()]);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = employees.filter((r) => r.hr_employees);
    if (!q) return list;
    return list.filter((r) => {
      const e = r.hr_employees;
      return `${fullName(e)} ${e.badge_id || ""}`.toLowerCase().includes(q);
    });
  }, [employees, search]);

  const pickedCount = Object.values(picked).filter(Boolean).length;

  const empById = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of employees) if (r.hr_employees) m.set(r.hr_employee_id, r);
    return m;
  }, [employees]);

  // badge_id -> map row, for the paste path
  const byBadge = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of employees) {
      const b = String(r.hr_employees?.badge_id ?? "").trim().toLowerCase();
      if (b) m.set(b, r);
    }
    return m;
  }, [employees]);

  const draftsTotal = useMemo(
    () => drafts.reduce((s, d) => s + (Number.isFinite(parseFloat(d.amount)) ? parseFloat(d.amount) : 0), 0),
    [drafts],
  );

  function patchDraft(key: string, patch: Partial<RowDraft>) {
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function buildRows(): { rows: any[]; skipped: string[] } {
    const skipped: string[] = [];
    const base = (empRow: any, amt: number, lbl: string, type?: string, tax?: boolean) => {
      const row: any = {
        hr_employee_id: empRow.hr_employee_id,
        razorpay_employee_id: empRow.razorpay_employee_id,
        period_month: period,
        label: lbl,
        amount: amt,
      };
      if (kind === "addition") { row.addition_type = additionTypeCode(type ?? additionType); row.taxable = tax ?? taxable; }
      return row;
    };

    // rows mode: one line per employee, each with its own amount
    if (mode === "rows") {
      const rows: any[] = [];
      const seen = new Set<string>();
      drafts.forEach((d, i) => {
        const empRow = empById.get(d.hr_employee_id);
        const lbl = (d.label.trim() || label.trim());
        const amt = parseFloat(String(d.amount).replace(/[₹,\s]/g, ""));
        if (!empRow && !d.label && !d.amount) return; // untouched blank row
        if (!empRow) { skipped.push(`Row ${i + 1} — no employee picked`); return; }
        if (!lbl) { skipped.push(`Row ${i + 1} — label missing`); return; }
        if (!Number.isFinite(amt) || amt <= 0) { skipped.push(`Row ${i + 1} — amount must be > 0`); return; }
        // RazorpayX keys modifications by label per employee/month — the same
        // label twice would collapse into one entry on the run.
        const dupKey = `${d.hr_employee_id}::${lbl.toLowerCase()}`;
        if (seen.has(dupKey)) { skipped.push(`Row ${i + 1} — duplicate label "${lbl}" for the same employee`); return; }
        seen.add(dupKey);
        rows.push(base(empRow, amt, lbl, d.addition_type, d.taxable));
      });
      if (!rows.length) throw new Error("Add at least one complete row (employee + label + amount)");
      return { rows, skipped };
    }

    if (mode === "select") {
      const lbl = label.trim();
      const amt = parseFloat(amount);
      if (!lbl) throw new Error("Label is required");
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("Amount must be > 0");
      const rows = employees.filter((r) => picked[r.hr_employee_id]).map((r) => base(r, amt, lbl));
      if (!rows.length) throw new Error("Pick at least one employee");
      return { rows, skipped };
    }

    // paste mode: "badge_id, amount[, label]" per line (comma or tab separated)
    const lines = paste.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) throw new Error("Paste at least one line");
    const rows: any[] = [];
    for (const line of lines) {
      const parts = line.split(/[,\t]/).map((p) => p.trim());
      const badge = (parts[0] || "").toLowerCase();
      const amt = parseFloat((parts[1] || "").replace(/[₹,\s]/g, ""));
      const lbl = parts[2] || label.trim();
      const empRow = byBadge.get(badge);
      if (!empRow) { skipped.push(`${line} — badge not mapped`); continue; }
      if (!Number.isFinite(amt) || amt <= 0) { skipped.push(`${line} — bad amount`); continue; }
      if (!lbl) { skipped.push(`${line} — no label`); continue; }
      rows.push(base(empRow, amt, lbl));
    }
    if (!rows.length) throw new Error("No valid lines — check badge IDs and amounts");
    return { rows, skipped };
  }


  async function submit() {
    let built: { rows: any[]; skipped: string[] };
    try {
      built = buildRows();
    } catch (e: any) {
      toast.error(e.message);
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any).from(table).insert(built.rows);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(
      `Staged ${built.rows.length} ${kind}${built.rows.length === 1 ? "" : "s"} for ${period}` +
      (built.skipped.length ? ` · ${built.skipped.length} line(s) skipped` : ""),
    );
    if (built.skipped.length) console.warn("Bulk payroll input skipped lines:", built.skipped);
    setPicked({}); setLabel(""); setAmount(""); setPaste(""); setDrafts([newDraft()]);
    onDone();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[97vw] md:max-w-[1400px] w-[97vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk stage {kind}s · {period}</DialogTitle>
          <DialogDescription>
            Add one row per employee with its own amount, apply the same {kind} to many employees, or paste amounts. Rows are staged only — push to RazorpayX from the list.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
          <TabsList className="w-full">
            <TabsTrigger value="rows" className="flex-1">Row by row</TabsTrigger>
            <TabsTrigger value="select" className="flex-1">Same amount</TabsTrigger>
            <TabsTrigger value="paste" className="flex-1">Paste amounts</TabsTrigger>
          </TabsList>

          <TabsContent value="rows" className="space-y-2 mt-3">
            <div className="space-y-2">
              {drafts.map((d, i) => (
                <div key={d.key} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-12 md:col-span-4">
                    <EmployeeCombobox
                      value={d.hr_employee_id}
                      onChange={(v) => patchDraft(d.key, { hr_employee_id: v })}
                      options={employees.filter((r) => r.hr_employees).map((r) => ({
                        value: r.hr_employee_id,
                        label: `${fullName(r.hr_employees)}${r.hr_employees.badge_id ? ` · ${r.hr_employees.badge_id}` : ""}`,
                        keywords: String(r.hr_employees.badge_id ?? ""),
                      }))}
                    />
                  </div>

                  <div className="col-span-6 md:col-span-3">
                    {kind === "addition" && d.addition_type === "bonus" ? (
                      <Select value={BONUS_LABELS.includes(d.label) ? d.label : ""} onValueChange={(v) => patchDraft(d.key, { label: v })}>
                        <SelectTrigger className="h-9 text-foreground"><SelectValue placeholder="Select bonus label" /></SelectTrigger>
                        <SelectContent>
                          {BONUS_LABELS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input className="h-9" value={d.label} onChange={(e) => patchDraft(d.key, { label: e.target.value })} placeholder={label.trim() || (kind === "addition" ? "Performance bonus" : "Advance recovery")} />
                    )}
                  </div>
                  <div className="col-span-6 md:col-span-2">
                    <Input className="h-9 tabular-nums" inputMode="decimal" value={d.amount} onChange={(e) => patchDraft(d.key, { amount: e.target.value })} placeholder="Amount ₹" />
                  </div>
                  {kind === "addition" ? (
                    <div className="col-span-9 md:col-span-2">
                      <Select value={d.addition_type} onValueChange={(v) => patchDraft(d.key, { addition_type: v, ...(v === "bonus" && !BONUS_LABELS.includes(d.label) ? { label: "" } : {}) })}>
                        <SelectTrigger className="h-9 text-foreground"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bonus">Bonus</SelectItem>
                          <SelectItem value="arrears">Arrears</SelectItem>
                          <SelectItem value="reimbursement">Reimbursement</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : <div className="hidden md:block md:col-span-2" />}
                  <div className="col-span-3 md:col-span-1 flex justify-end">
                    <Button
                      size="icon" variant="ghost" className="h-8 w-8 text-destructive"
                      aria-label={`Remove row ${i + 1}`}
                      onClick={() => setDrafts((ds) => (ds.length > 1 ? ds.filter((x) => x.key !== d.key) : [newDraft()]))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-1">
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-8" onClick={() => setDrafts((ds) => [...ds, newDraft({ label: label.trim(), addition_type: additionType, taxable })])}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add row
                </Button>
                <Button
                  size="sm" variant="ghost" className="h-8"
                  onClick={() => {
                    const used = new Set(drafts.map((d) => d.hr_employee_id).filter(Boolean));
                    const rest = employees.filter((r) => r.hr_employees && !used.has(r.hr_employee_id));
                    if (!rest.length) { toast.message("Every mapped employee already has a row"); return; }
                    setDrafts((ds) => [
                      ...ds.filter((d) => d.hr_employee_id || d.label || d.amount),
                      ...rest.map((r) => newDraft({ hr_employee_id: r.hr_employee_id, label: label.trim(), addition_type: additionType, taxable })),
                    ]);
                  }}
                >
                  Add all employees
                </Button>
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {drafts.filter((d) => d.hr_employee_id && parseFloat(d.amount) > 0).length} row(s) · total ₹{draftsTotal.toLocaleString("en-IN")}
              </div>
            </div>
            {kind === "addition" && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                <Checkbox checked={taxable} onCheckedChange={(c) => { setTaxable(!!c); setDrafts((ds) => ds.map((d) => ({ ...d, taxable: !!c }))); }} /> Taxable (applies to all rows)
              </label>
            )}
          </TabsContent>


          <TabsContent value="select" className="space-y-3 mt-3">
            <div className="flex items-center gap-2">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or badge…" className="h-8" />
              <Button size="sm" variant="outline" className="h-8 whitespace-nowrap" onClick={() => {
                const next = { ...picked };
                filtered.forEach((r) => { next[r.hr_employee_id] = true; });
                setPicked(next);
              }}>Select all</Button>
              <Button size="sm" variant="ghost" className="h-8 whitespace-nowrap" onClick={() => setPicked({})}>Clear</Button>
            </div>
            <ScrollArea className="h-56 rounded-md border">
              <div className="p-2 space-y-1">
                {filtered.map((r) => {
                  const e = r.hr_employees;
                  return (
                    <label key={r.hr_employee_id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/50 cursor-pointer text-sm">
                      <Checkbox
                        checked={!!picked[r.hr_employee_id]}
                        onCheckedChange={(c) => setPicked((p) => ({ ...p, [r.hr_employee_id]: !!c }))}
                      />
                      <span className="truncate">{fullName(e)}{e.badge_id ? ` · ${e.badge_id}` : ""}</span>
                    </label>
                  );
                })}
                {filtered.length === 0 && <div className="p-4 text-center text-sm text-muted-foreground">No mapped employees match.</div>}
              </div>
            </ScrollArea>
            <div className="text-xs text-muted-foreground">{pickedCount} selected</div>
          </TabsContent>

          <TabsContent value="paste" className="space-y-2 mt-3">
            <Label className="text-xs">One line per employee — <code>badge_id, amount</code> (optional third column overrides the label)</Label>
            <Textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={8}
              className="font-mono text-xs"
              placeholder={"BVT001, 5000\nBVT002, 2500, Attendance bonus"}
            />
            <div className="text-xs text-muted-foreground">Unmapped badges and bad amounts are skipped and reported.</div>
          </TabsContent>
        </Tabs>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-1">
          <div className="md:col-span-1">
            <Label className="text-xs">Label{mode === "select" ? "" : " (default for blank rows)"}</Label>
            {kind === "addition" && additionType === "bonus" && mode !== "rows" ? (
              <Select value={BONUS_LABELS.includes(label) ? label : ""} onValueChange={setLabel}>
                <SelectTrigger className="text-foreground"><SelectValue placeholder="Select bonus label" /></SelectTrigger>
                <SelectContent>
                  {BONUS_LABELS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={kind === "addition" ? "Performance bonus" : "Advance recovery"} />
            )}
          </div>
          {mode === "select" && (
            <div>
              <Label className="text-xs">Amount (₹) — same for all</Label>
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            </div>
          )}
          {kind === "addition" && mode !== "rows" && (
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={additionType} onValueChange={(v) => { setAdditionType(v); if (v === "bonus" && !BONUS_LABELS.includes(label)) setLabel(""); }}>
                <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bonus">Bonus</SelectItem>
                  <SelectItem value="arrears">Arrears</SelectItem>
                  <SelectItem value="reimbursement">Reimbursement</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <label className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                <Checkbox checked={taxable} onCheckedChange={(c) => setTaxable(!!c)} /> Taxable
              </label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
            Stage {mode === "rows"
              ? `${drafts.filter((d) => d.hr_employee_id && parseFloat(d.amount) > 0).length || ""} row${drafts.filter((d) => d.hr_employee_id && parseFloat(d.amount) > 0).length === 1 ? "" : "s"}`.trim()
              : mode === "select" && pickedCount ? `${pickedCount} row${pickedCount === 1 ? "" : "s"}` : "rows"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
