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
import { Loader2 } from "lucide-react";

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

export function BulkPayrollInputDialog({ open, onOpenChange, kind, period, employees, onDone }: Props) {
  const table = kind === "addition" ? "hr_payroll_input_additions" : "hr_payroll_input_deductions";
  const [mode, setMode] = useState<"select" | "paste">("select");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [additionType, setAdditionType] = useState("bonus");
  const [taxable, setTaxable] = useState(true);
  const [paste, setPaste] = useState("");
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

  // badge_id -> map row, for the paste path
  const byBadge = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of employees) {
      const b = String(r.hr_employees?.badge_id ?? "").trim().toLowerCase();
      if (b) m.set(b, r);
    }
    return m;
  }, [employees]);

  function buildRows(): { rows: any[]; skipped: string[] } {
    const skipped: string[] = [];
    const base = (empRow: any, amt: number, lbl: string) => {
      const row: any = {
        hr_employee_id: empRow.hr_employee_id,
        razorpay_employee_id: empRow.razorpay_employee_id,
        period_month: period,
        label: lbl,
        amount: amt,
      };
      if (kind === "addition") { row.addition_type = additionType; row.taxable = taxable; }
      return row;
    };

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
    setPicked({}); setLabel(""); setAmount(""); setPaste("");
    onDone();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk stage {kind}s · {period}</DialogTitle>
          <DialogDescription>
            Stage the same {kind} for many employees at once, or paste per-employee amounts. Rows are staged only — push to RazorpayX from the list.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
          <TabsList className="w-full">
            <TabsTrigger value="select" className="flex-1">Pick employees</TabsTrigger>
            <TabsTrigger value="paste" className="flex-1">Paste amounts</TabsTrigger>
          </TabsList>

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
            <Label className="text-xs">Label{mode === "paste" ? " (fallback)" : ""}</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={kind === "addition" ? "Performance bonus" : "Advance recovery"} />
          </div>
          {mode === "select" && (
            <div>
              <Label className="text-xs">Amount (₹) — same for all</Label>
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            </div>
          )}
          {kind === "addition" && (
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={additionType} onValueChange={setAdditionType}>
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
            Stage {mode === "select" && pickedCount ? `${pickedCount} row${pickedCount === 1 ? "" : "s"}` : "rows"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
