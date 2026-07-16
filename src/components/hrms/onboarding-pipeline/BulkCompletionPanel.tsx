import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Zap, Landmark, Briefcase, Wallet, ExternalLink, Loader2 } from "lucide-react";

/**
 * Bulk Completion Panel
 * -----------------------------------------------------------
 * A back-office fast lane for HR to fill data on many draft
 * employees (typically after a Razorpay re-import) without
 * walking through the 5-stage wizard for each one.
 *
 * Constraint: bulk actions FILL data only. Activation still
 * happens in Stage-5 of the wizard so the payability warning
 * and audit remain untouched.
 */

type Row = {
  onboarding_id: string;
  employee_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  status: string;
  total_salary: number | null;
  has_bank: boolean;
  has_salary: boolean;
  has_doj: boolean;
  has_designation: boolean;
};

export function BulkCompletionPanel() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set()); // employee_ids
  const [dialog, setDialog] = useState<null | "salary" | "workinfo" | "bank">(null);
  const [bankTarget, setBankTarget] = useState<Row | null>(null);

  // ── DATA ──────────────────────────────────────────────────
  const { data: rows = [], isLoading } = useQuery<Row[]>({
    queryKey: ["bulk-completion-rows"],
    queryFn: async () => {
      // Only surface incomplete drafts (activation excluded).
      const { data: onb, error } = await supabase
        .from("hr_employee_onboarding")
        .select("id, first_name, last_name, email, status, employee_id")
        .not("status", "in", "(completed,cancelled)")
        .not("employee_id", "is", null);
      if (error) throw error;
      const empIds = (onb || []).map((r: any) => r.employee_id).filter(Boolean);
      if (empIds.length === 0) return [];

      const [{ data: comp }, { data: emps }] = await Promise.all([
        supabase
          .from("hr_employee_completeness" as any)
          .select("employee_id, has_bank, has_salary, has_doj, has_designation")
          .in("employee_id", empIds),
        supabase
          .from("hr_employees")
          .select("id, total_salary")
          .in("id", empIds),
      ]);
      const cMap: Record<string, any> = {};
      (comp || []).forEach((c: any) => (cMap[c.employee_id] = c));
      const eMap: Record<string, any> = {};
      (emps || []).forEach((e: any) => (eMap[e.id] = e));

      const out: Row[] = (onb || []).map((r: any) => {
        const c = cMap[r.employee_id] || {};
        return {
          onboarding_id: r.id,
          employee_id: r.employee_id,
          first_name: r.first_name,
          last_name: r.last_name,
          email: r.email,
          status: r.status,
          total_salary: eMap[r.employee_id]?.total_salary ?? null,
          has_bank: !!c.has_bank,
          has_salary: !!c.has_salary,
          has_doj: !!c.has_doj,
          has_designation: !!c.has_designation,
        };
      });
      // Only rows with at least one gap
      return out.filter(r => !(r.has_bank && r.has_salary && r.has_doj && r.has_designation));
    },
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["salary_templates_min"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("hr_salary_structure_templates")
        .select("id, name")
        .order("name");
      return data || [];
    },
  });

  const { data: positions = [] } = useQuery({
    queryKey: ["positions_min"],
    queryFn: async () => {
      const { data } = await supabase
        .from("positions")
        .select("id, title")
        .eq("is_active", true)
        .order("title");
      return data || [];
    },
  });

  // ── SELECTION ─────────────────────────────────────────────
  const allIds = useMemo(() => rows.map(r => r.employee_id!).filter(Boolean), [rows]);
  const allSelected = allIds.length > 0 && selected.size === allIds.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(allIds));
  const toggleOne = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["bulk-completion-rows"] });
    qc.invalidateQueries({ queryKey: ["onboarding-pipeline-records"] });
    qc.invalidateQueries({ queryKey: ["onboarding-completeness"] });
  };

  // ── RENDER ────────────────────────────────────────────────
  const pill = (label: string, ok: boolean) => (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded ${
        ok ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
      }`}
    >
      {ok ? "✓" : "○"} {label}
    </span>
  );

  const selectedRows = rows.filter(r => selected.has(r.employee_id!));

  return (
    <Card>
      <CardHeader className="py-3 px-4 flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4 text-warning" /> Bulk Completion
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Fast lane for filling Salary / DOJ / Designation / Bank on many draft
            employees at once. Bulk actions fill data only — activation still
            happens in the wizard.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/hr/payroll/salary-structure">
            <ExternalLink className="h-3.5 w-3.5 mr-1" /> Manage Templates
          </Link>
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 text-center text-xs text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            🎉 No incomplete drafts. Everyone linked to onboarding has bank, salary,
            DOJ and designation on file.
          </div>
        ) : (
          <>
            {/* Action bar */}
            <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 bg-muted/30">
              <Badge variant="secondary" className="text-xs">
                {selected.size} selected / {rows.length} incomplete
              </Badge>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selected.size === 0 || templates.length === 0}
                  onClick={() => setDialog("salary")}
                  title={templates.length === 0 ? "Create a salary template first" : ""}
                >
                  <Wallet className="h-3.5 w-3.5 mr-1" /> Assign Salary
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selected.size === 0}
                  onClick={() => setDialog("workinfo")}
                >
                  <Briefcase className="h-3.5 w-3.5 mr-1" /> Set DOJ / Designation
                </Button>
              </div>
            </div>

            {templates.length === 0 && (
              <div className="px-3 py-2 text-[11px] text-warning bg-warning/5 border-b">
                No salary templates exist yet. Create one from{" "}
                <Link to="/hr/payroll/salary-structure" className="underline">
                  Salary Structure → Templates
                </Link>{" "}
                before running bulk assign.
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="p-2 w-8">
                      <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                    </th>
                    <th className="text-left p-2">Name</th>
                    <th className="text-left p-2 hidden sm:table-cell">Email</th>
                    <th className="text-left p-2">Checklist</th>
                    <th className="text-right p-2">Bank</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const isChecked = selected.has(r.employee_id!);
                    return (
                      <tr key={r.onboarding_id} className="border-b hover:bg-muted/20">
                        <td className="p-2">
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => toggleOne(r.employee_id!)}
                          />
                        </td>
                        <td className="p-2 font-medium">
                          {`${r.first_name || ""} ${r.last_name || ""}`.trim() || "—"}
                        </td>
                        <td className="p-2 text-muted-foreground hidden sm:table-cell">
                          {r.email || "—"}
                        </td>
                        <td className="p-2">
                          <div className="flex flex-wrap gap-1">
                            {pill("Bank", r.has_bank)}
                            {pill("Salary", r.has_salary)}
                            {pill("DOJ", r.has_doj)}
                            {pill("Desig.", r.has_designation)}
                          </div>
                        </td>
                        <td className="p-2 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() => setBankTarget(r)}
                          >
                            <Landmark className="h-3.5 w-3.5 mr-1" />
                            {r.has_bank ? "Edit" : "Add"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>

      {dialog === "salary" && (
        <BulkSalaryDialog
          rows={selectedRows}
          templates={templates}
          onClose={() => setDialog(null)}
          onDone={() => { setDialog(null); setSelected(new Set()); invalidate(); }}
        />
      )}
      {dialog === "workinfo" && (
        <BulkWorkInfoDialog
          rows={selectedRows}
          positions={positions}
          onClose={() => setDialog(null)}
          onDone={() => { setDialog(null); setSelected(new Set()); invalidate(); }}
        />
      )}
      {bankTarget && (
        <BankQuickDialog
          row={bankTarget}
          nextRow={rows.find(r => !r.has_bank && r.employee_id !== bankTarget.employee_id) || null}
          onClose={() => setBankTarget(null)}
          onDone={() => { setBankTarget(null); invalidate(); }}
          onSaveAndNext={(next) => { setBankTarget(next); invalidate(); }}
        />
      )}
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════
// Bulk Salary Assign
// ══════════════════════════════════════════════════════════════
function BulkSalaryDialog({
  rows, templates, onClose, onDone,
}: {
  rows: Row[]; templates: any[]; onClose: () => void; onDone: () => void;
}) {
  const [templateId, setTemplateId] = useState("");
  const [ctc, setCtc] = useState<Record<string, string>>(
    Object.fromEntries(rows.map(r => [r.employee_id!, r.total_salary?.toString() || ""]))
  );
  const [applyAll, setApplyAll] = useState("");
  const [running, setRunning] = useState(false);

  const setAll = () => {
    if (!applyAll || Number(applyAll) <= 0) return;
    setCtc(Object.fromEntries(rows.map(r => [r.employee_id!, applyAll])));
  };

  const run = async () => {
    if (!templateId) { toast.error("Pick a template"); return; }
    for (const r of rows) {
      const v = Number(ctc[r.employee_id!]);
      if (!v || v <= 0) { toast.error(`CTC missing for ${r.first_name}`); return; }
    }
    setRunning(true);
    let ok = 0, fail = 0;
    for (const r of rows) {
      try {
        const total = Number(ctc[r.employee_id!]);
        const { error: uErr } = await supabase
          .from("hr_employees")
          .update({ total_salary: total })
          .eq("id", r.employee_id!);
        if (uErr) throw uErr;
        const { error: rErr } = await supabase.rpc("apply_salary_template", {
          p_employee_id: r.employee_id!,
          p_template_id: templateId,
        });
        if (rErr) throw rErr;
        // Mirror onto onboarding row so wizard stays in sync
        await supabase
          .from("hr_employee_onboarding")
          .update({ ctc: total, salary_template_id: templateId })
          .eq("id", r.onboarding_id);
        ok++;
      } catch (e: any) {
        console.error("Bulk salary fail", r, e);
        fail++;
      }
    }
    setRunning(false);
    toast[fail ? "warning" : "success"](`Applied to ${ok}${fail ? ` (${fail} failed)` : ""}`);
    onDone();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Assign Salary Structure</DialogTitle>
          <DialogDescription>
            Applies the selected template to each employee using their CTC.
            Basic pay defaults to 50% of CTC. No employees are activated.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
                <SelectContent>
                  {templates.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Apply CTC to all (optional)</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="e.g. 600000"
                  value={applyAll}
                  onChange={e => setApplyAll(e.target.value)}
                />
                <Button variant="outline" size="sm" onClick={setAll}>Fill</Button>
              </div>
            </div>
          </div>

          <div className="border rounded max-h-[300px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                <tr>
                  <th className="text-left p-2">Employee</th>
                  <th className="text-right p-2 w-40">Annual CTC (₹)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.employee_id} className="border-t">
                    <td className="p-2">{`${r.first_name || ""} ${r.last_name || ""}`.trim()}</td>
                    <td className="p-2 text-right">
                      <Input
                        type="number"
                        className="h-8 text-right"
                        value={ctc[r.employee_id!] || ""}
                        onChange={e =>
                          setCtc(prev => ({ ...prev, [r.employee_id!]: e.target.value }))
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={running}>Cancel</Button>
          <Button onClick={run} disabled={running || !templateId}>
            {running && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Apply to {rows.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════
// Bulk Work Info (DOJ + Designation)
// ══════════════════════════════════════════════════════════════
function BulkWorkInfoDialog({
  rows, positions, onClose, onDone,
}: {
  rows: Row[]; positions: any[]; onClose: () => void; onDone: () => void;
}) {
  const [defaultDoj, setDefaultDoj] = useState("");
  const [defaultPos, setDefaultPos] = useState("");
  const [perRow, setPerRow] = useState<Record<string, { doj: string; pos: string }>>(
    Object.fromEntries(rows.map(r => [r.employee_id!, { doj: "", pos: "" }]))
  );
  const [running, setRunning] = useState(false);

  const fillAll = () => {
    setPerRow(Object.fromEntries(rows.map(r => [r.employee_id!, {
      doj: defaultDoj || perRow[r.employee_id!]?.doj || "",
      pos: defaultPos || perRow[r.employee_id!]?.pos || "",
    }])));
  };

  const run = async () => {
    setRunning(true);
    let ok = 0, fail = 0;
    for (const r of rows) {
      try {
        const v = perRow[r.employee_id!] || { doj: "", pos: "" };
        const doj = v.doj || defaultDoj || null;
        const pos = v.pos || defaultPos || null;
        if (!doj && !pos) continue; // nothing to write for this row

        const { data: existing } = await supabase
          .from("hr_employee_work_info")
          .select("id")
          .eq("employee_id", r.employee_id!)
          .maybeSingle();

        const patch: any = {};
        if (doj) patch.joining_date = doj;
        if (pos) patch.job_position_id = pos;

        if (existing?.id) {
          const { error } = await supabase
            .from("hr_employee_work_info")
            .update(patch)
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("hr_employee_work_info")
            .insert({ employee_id: r.employee_id!, ...patch });
          if (error) throw error;
        }

        // Mirror onto onboarding so wizard stays in sync
        const oPatch: any = {};
        if (doj) oPatch.date_of_joining = doj;
        if (pos) oPatch.position_id = pos;
        await supabase
          .from("hr_employee_onboarding")
          .update(oPatch)
          .eq("id", r.onboarding_id);
        ok++;
      } catch (e: any) {
        console.error("Bulk workinfo fail", r, e);
        fail++;
      }
    }
    setRunning(false);
    toast[fail ? "warning" : "success"](`Updated ${ok}${fail ? ` (${fail} failed)` : ""}`);
    onDone();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Set DOJ &amp; Designation</DialogTitle>
          <DialogDescription>
            Set a default for all rows then override per employee where needed.
            Blank fields are skipped for that employee.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid sm:grid-cols-3 gap-3 items-end">
            <div>
              <Label>Default DOJ</Label>
              <Input type="date" value={defaultDoj} onChange={e => setDefaultDoj(e.target.value)} />
            </div>
            <div>
              <Label>Default Designation</Label>
              <Select value={defaultPos} onValueChange={setDefaultPos}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {positions.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={fillAll}>Apply defaults to all</Button>
          </div>

          <div className="border rounded max-h-[320px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                <tr>
                  <th className="text-left p-2">Employee</th>
                  <th className="text-left p-2 w-36">DOJ</th>
                  <th className="text-left p-2 w-52">Designation</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const v = perRow[r.employee_id!] || { doj: "", pos: "" };
                  return (
                    <tr key={r.employee_id} className="border-t">
                      <td className="p-2">{`${r.first_name || ""} ${r.last_name || ""}`.trim()}</td>
                      <td className="p-2">
                        <Input
                          type="date"
                          className="h-8"
                          value={v.doj}
                          onChange={e =>
                            setPerRow(prev => ({ ...prev, [r.employee_id!]: { ...v, doj: e.target.value } }))
                          }
                        />
                      </td>
                      <td className="p-2">
                        <Select
                          value={v.pos}
                          onValueChange={p =>
                            setPerRow(prev => ({ ...prev, [r.employee_id!]: { ...v, pos: p } }))
                          }
                        >
                          <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            {positions.map((p: any) => (
                              <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={running}>Cancel</Button>
          <Button onClick={run} disabled={running}>
            {running && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Save {rows.length} employees
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════
// Per-employee Bank quick dialog (no full wizard needed)
// ══════════════════════════════════════════════════════════════
function BankQuickDialog({
  row, onClose, onDone,
}: { row: Row; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ account_number: "", ifsc_code: "", bank_name: "", branch: "" });
  const [saving, setSaving] = useState(false);

  useQuery({
    queryKey: ["bank_quick", row.employee_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("hr_employee_bank_details")
        .select("*")
        .eq("employee_id", row.employee_id!)
        .maybeSingle();
      if (data) {
        setForm({
          account_number: data.account_number || "",
          ifsc_code: data.ifsc_code || "",
          bank_name: data.bank_name || "",
          branch: data.branch || "",
        });
      }
      return data;
    },
    enabled: !!row.employee_id,
  });

  const save = async () => {
    if (!form.account_number.trim()) { toast.error("Account number required"); return; }
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from("hr_employee_bank_details")
        .select("id")
        .eq("employee_id", row.employee_id!)
        .maybeSingle();
      if (existing?.id) {
        const { error } = await supabase
          .from("hr_employee_bank_details")
          .update(form)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("hr_employee_bank_details")
          .insert({ employee_id: row.employee_id!, ...form });
        if (error) throw error;
      }
      toast.success("Bank details saved");
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bank Details — {`${row.first_name || ""} ${row.last_name || ""}`.trim()}</DialogTitle>
          <DialogDescription className="text-xs">
            Fills the employee bank row directly. Activation still happens in the wizard.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Account Number *</Label>
            <Input value={form.account_number} onChange={e => setForm(p => ({ ...p, account_number: e.target.value }))} />
          </div>
          <div>
            <Label>IFSC</Label>
            <Input value={form.ifsc_code} onChange={e => setForm(p => ({ ...p, ifsc_code: e.target.value.toUpperCase() }))} />
          </div>
          <div>
            <Label>Bank Name</Label>
            <Input value={form.bank_name} onChange={e => setForm(p => ({ ...p, bank_name: e.target.value }))} />
          </div>
          <div className="col-span-2">
            <Label>Branch</Label>
            <Input value={form.branch} onChange={e => setForm(p => ({ ...p, branch: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
