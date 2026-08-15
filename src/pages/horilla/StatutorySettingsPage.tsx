import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { ResponsiveList } from "@/components/horilla/primitives/ResponsiveList";
import { ViewToggle } from "@/components/hrms/ViewToggle";
import { useViewMode } from "@/hooks/useViewMode";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, ShieldCheck, History, Users, Info, AlertTriangle, Download } from "lucide-react";

type Profile = {
  id: string;
  hr_employee_id: string;
  effective_from: string;
  pf_enabled: boolean;
  pf_wage_basis: "capped" | "actual";
  vpf_mode: "none" | "percent" | "fixed";
  vpf_value: number;
  esi_enabled: boolean;
  pt_enabled: boolean;
  uan: string | null;
  esic_number: string | null;
  reason: string | null;
  created_at: string;
};

const monthStart = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;

const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

export default function StatutorySettingsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "no_pf" | "vpf" | "esi_eligible" | "no_uan">("all");
  const [editing, setEditing] = useState<any | null>(null);
  const [historyFor, setHistoryFor] = useState<any | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState({ field: "pf" as "pf" | "esi" | "pt", value: true, effective_from: monthStart(), reason: "" });
  const [viewMode, setViewMode] = useViewMode("statutory-settings");

  const [form, setForm] = useState({
    pf_enabled: true,
    pf_wage_basis: "capped" as "capped" | "actual",
    vpf_mode: "none" as "none" | "percent" | "fixed",
    vpf_value: "0",
    esi_enabled: true,

    pt_enabled: false,
    uan: "",
    esic_number: "",
    effective_from: monthStart(),
    reason: "",
  });

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ["hr_employees_statutory"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_employees")
        .select("id, badge_id, first_name, last_name, basic_salary, total_salary, is_active")
        .eq("is_active", true)
        .order("first_name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["hr_employee_statutory_profiles"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_employee_statutory_profiles")
        .select("*")
        .order("effective_from", { ascending: false });
      if (error) throw error;
      return (data || []) as Profile[];
    },
  });

  // Active profile for the current month, per employee
  const activeByEmp = useMemo(() => {
    const today = monthStart();
    const map = new Map<string, Profile>();
    for (const p of profiles) {
      if (p.effective_from > today) continue;
      if (!map.has(p.hr_employee_id)) map.set(p.hr_employee_id, p); // list is desc ⇒ first = latest
    }
    return map;
  }, [profiles]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees
      .map((e: any) => ({ emp: e, p: activeByEmp.get(e.id) }))
      .filter(({ emp, p }: any) => {
        if (q) {
          const hay = `${emp.first_name} ${emp.last_name} ${emp.badge_id ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        const monthlyGross = Number(emp.total_salary || 0) / 12;
        if (filter === "no_pf") return !p?.pf_enabled;
        if (filter === "vpf") return (p?.vpf_mode ?? "none") !== "none";
        if (filter === "esi_eligible") return monthlyGross > 0 && monthlyGross <= 21000 && !p?.esi_enabled;
        if (filter === "no_uan") return !!p?.pf_enabled && !p?.uan;
        return true;
      });
  }, [employees, activeByEmp, search, filter]);

  const openEdit = (emp: any) => {
    const p = activeByEmp.get(emp.id);
    setForm({
      pf_enabled: p?.pf_enabled ?? true,
      pf_wage_basis: (p?.pf_wage_basis as any) ?? "capped",
      vpf_mode: (p?.vpf_mode as any) ?? "none",
      vpf_value: String(p?.vpf_value ?? 0),
      esi_enabled: p?.esi_enabled ?? true,

      pt_enabled: p?.pt_enabled ?? false,
      uan: p?.uan ?? "",
      esic_number: p?.esic_number ?? "",
      effective_from: monthStart(),
      reason: "",
    });
    setEditing(emp);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      if (!form.reason.trim()) throw new Error("A reason is required for every statutory change");
      const val = Number(form.vpf_value || 0);
      if (form.vpf_mode === "percent" && (val <= 0 || val > 88)) throw new Error("VPF percentage must be between 0 and 88");
      if (form.vpf_mode === "fixed" && val <= 0) throw new Error("VPF amount must be greater than zero");

      // Closed-month guard
      const { data: lock } = await (supabase as any)
        .from("hr_payroll_runs")
        .select("id,status,period_month")
        .eq("period_month", form.effective_from)
        .in("status", ["closed", "completed", "locked"])
        .maybeSingle();
      if (lock) throw new Error("That payroll month is already closed — pick a later effective month");

      const { data: res, error } = await (supabase as any).rpc("hr_apply_statutory_change", {
        p_employee: editing.id,
        p_effective_from: form.effective_from,
        p_pf_enabled: form.pf_enabled,
        p_pf_wage_basis: form.pf_wage_basis,
        p_vpf_mode: form.pf_enabled ? form.vpf_mode : "none",
        p_vpf_value: form.pf_enabled && form.vpf_mode !== "none" ? val : 0,
        p_esi_enabled: form.esi_enabled,
        p_pt_enabled: form.pt_enabled,
        p_uan: form.uan.trim() || null,
        p_esic_number: form.esic_number.trim() || null,
        p_reason: form.reason.trim(),
      });
      if (error) throw error;
      return Array.isArray(res) ? res[0] : res;

    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["hr_employee_statutory_profiles"] });
      qc.invalidateQueries({ queryKey: ["hr_employees_statutory"] });
      qc.invalidateQueries({ queryKey: ["hr_employees"] });
      setEditing(null);
      const fwd = Number(res?.forward_rows_updated ?? 0);
      toast.success(
        fwd > 0
          ? `Statutory settings saved — also applied to ${fwd} later month${fwd > 1 ? "s" : ""}`
          : "Statutory settings saved",
      );
    },
    onError: (e: any) => toast.error(e.message),
  });

  const bulkMutation = useMutation({
    mutationFn: async () => {
      if (!selected.length) throw new Error("Select at least one employee");
      if (!bulk.reason.trim()) throw new Error("A reason is required");
      let forward = 0;
      for (const id of selected) {
        const p = activeByEmp.get(id);
        const { data: res, error } = await (supabase as any).rpc("hr_apply_statutory_change", {
          p_employee: id,
          p_effective_from: bulk.effective_from,
          p_pf_enabled: bulk.field === "pf" ? bulk.value : (p?.pf_enabled ?? false),
          p_pf_wage_basis: p?.pf_wage_basis ?? "capped",
          p_vpf_mode: p?.vpf_mode ?? "none",
          p_vpf_value: p?.vpf_value ?? 0,
          p_esi_enabled: bulk.field === "esi" ? bulk.value : (p?.esi_enabled ?? false),
          p_pt_enabled: bulk.field === "pt" ? bulk.value : (p?.pt_enabled ?? false),
          p_uan: p?.uan ?? null,
          p_esic_number: p?.esic_number ?? null,
          p_reason: bulk.reason.trim(),
        });
        if (error) throw error;
        const row = Array.isArray(res) ? res[0] : res;
        forward += Number(row?.forward_rows_updated ?? 0);
      }
      return forward;
    },

    onSuccess: (forward: number) => {
      qc.invalidateQueries({ queryKey: ["hr_employee_statutory_profiles"] });
      qc.invalidateQueries({ queryKey: ["hr_employees_statutory"] });
      qc.invalidateQueries({ queryKey: ["hr_employees"] });
      setBulkOpen(false);
      setSelected([]);
      toast.success(
        forward > 0
          ? `Bulk statutory update applied — also carried into ${forward} later month row(s)`
          : "Bulk statutory update applied",
      );
    },

    onError: (e: any) => toast.error(e.message),
  });

  const toggleSelect = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const StatChip = ({ label, on, note }: { label: string; on: boolean; note?: string }) => (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs leading-none ${
        on
          ? "border-primary/30 bg-primary/10 text-foreground"
          : "border-border bg-muted/50 text-muted-foreground"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-primary" : "bg-muted-foreground/40"}`} />
      <span className="font-medium">{label}</span>
      {note && <span className="text-muted-foreground font-normal">{note}</span>}
    </span>
  );

  const renderBadges = (r: any) => {
    const { emp, p } = r;
    const monthlyGross = Number(emp.total_salary || 0) / 12;
    const esiIneligible = monthlyGross > 21000;
    const pfNote = p?.pf_enabled
      ? [
          p.pf_wage_basis === "actual" ? "actual" : "₹15k cap",
          p.vpf_mode && p.vpf_mode !== "none"
            ? `VPF ${p.vpf_mode === "percent" ? `${p.vpf_value}%` : inr(p.vpf_value)}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : undefined;

    const issues: string[] = [];
    if (p?.pf_enabled && !p?.uan) issues.push("UAN missing");
    if (p?.esi_enabled && !p?.esic_number) issues.push("ESIC number missing");
    if (esiIneligible && p?.esi_enabled) issues.push("Gross above ₹21,000 ceiling");

    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <StatChip label="PF" on={!!p?.pf_enabled} note={pfNote} />
        <StatChip
          label="ESI"
          on={!!p?.esi_enabled}
          note={!p?.esi_enabled && esiIneligible ? "over ceiling" : undefined}
        />
        <StatChip label="PT" on={!!p?.pt_enabled} />
        {issues.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              <ul className="text-xs space-y-0.5">
                {issues.map((i) => <li key={i}>{i}</li>)}
              </ul>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  };

  const stats = useMemo(() => {
    let pf = 0, esi = 0, pt = 0, flags = 0;
    for (const e of employees as any[]) {
      const p = activeByEmp.get(e.id);
      if (p?.pf_enabled) pf++;
      if (p?.esi_enabled) esi++;
      if (p?.pt_enabled) pt++;
      if ((p?.pf_enabled && !p?.uan) || (p?.esi_enabled && !p?.esic_number)) flags++;
    }
    return { total: employees.length, pf, esi, pt, flags };
  }, [employees, activeByEmp]);

  return (
    <TooltipProvider delayDuration={150}>
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="Statutory Settings" description="PF · ESI · PT enrolment" />
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="About statutory settings">
              <Info className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 text-xs text-muted-foreground z-50 bg-popover">
            CTC stays fixed — enrolling moves money inside the same CTC. VPF is an employee-side deduction
            only and must be mirrored manually in the RazorpayX dashboard.
          </PopoverContent>
        </Popover>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "Employees", value: stats.total },
          { label: "PF", value: `${stats.pf}/${stats.total}` },
          { label: "ESI", value: `${stats.esi}/${stats.total}` },
          { label: "Flagged", value: stats.flags, alert: stats.flags > 0 },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</div>
              <div className={`text-lg font-semibold ${s.alert ? "text-destructive" : ""}`}>{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8 text-foreground"
                placeholder="Search employee or ID"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
              <SelectTrigger className="w-full sm:w-[220px] text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[50vh] overflow-y-auto z-50 bg-popover">
                <SelectItem value="all">All employees</SelectItem>
                <SelectItem value="no_pf">Not enrolled in PF</SelectItem>
                <SelectItem value="esi_eligible">ESI-eligible, not enrolled</SelectItem>
                <SelectItem value="vpf">VPF active</SelectItem>
                <SelectItem value="no_uan">PF enrolled, UAN missing</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              disabled={!selected.length}
              onClick={() => setBulkOpen(true)}
              className="w-full sm:w-auto"
            >
              <Users className="h-4 w-4 mr-2" />
              Bulk ({selected.length})
            </Button>
          </div>
        </CardContent>
      </Card>



      {isLoading ? null : rows.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No employees match" description="Adjust the search or filter." />
      ) : (
        <ResponsiveList
          items={rows}
          isLoading={isLoading}
          keyFor={(r: any) => r.emp.id}
          tableMinWidth="min-w-[820px]"
          columns={[
            { key: "sel", label: "" },
            { key: "emp", label: "Employee" },
            { key: "ctc", label: "Monthly CTC" },
            { key: "status", label: "Statutory" },
            { key: "actions", label: "", className: "text-right" },
          ]}
          renderRow={(r: any) => (
            <>
              <td className="p-2">
                <Checkbox checked={selected.includes(r.emp.id)} onCheckedChange={() => toggleSelect(r.emp.id)} />
              </td>
              <td className="p-2">
                <div className="font-medium">{r.emp.first_name} {r.emp.last_name}</div>
                <div className="text-xs text-muted-foreground">
                  {r.emp.badge_id}{r.p?.effective_from ? ` · effective ${r.p.effective_from}` : " · no profile"}
                </div>
              </td>
              <td className="p-2 text-sm">{inr(Math.round(Number(r.emp.total_salary || 0) / 12))}</td>
              <td className="p-2">{renderBadges(r)}</td>
              <td className="p-2 text-right whitespace-nowrap">
                <Button size="sm" variant="outline" onClick={() => openEdit(r.emp)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => setHistoryFor(r.emp)}>
                  <History className="h-4 w-4" />
                </Button>
              </td>
            </>
          )}
          renderCard={(r: any) => (
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-card">
              <Checkbox
                checked={selected.includes(r.emp.id)}
                onCheckedChange={() => toggleSelect(r.emp.id)}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium truncate">{r.emp.first_name} {r.emp.last_name}</span>
                  <span className="text-xs text-muted-foreground">{r.emp.badge_id}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Monthly CTC {inr(Math.round(Number(r.emp.total_salary || 0) / 12))}
                  {r.p?.effective_from ? ` · effective ${r.p.effective_from}` : " · no profile"}
                </div>
                <div className="mt-2">{renderBadges(r)}</div>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <Button size="sm" variant="outline" onClick={() => openEdit(r.emp)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => setHistoryFor(r.emp)}>
                  <History className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        />
      )}


      {/* Edit dialog */}
      <ResponsiveDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing ? `Statutory — ${editing.first_name} ${editing.last_name}` : ""}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Provident Fund (PF)</Label>
            <Switch checked={form.pf_enabled} onCheckedChange={(v) => setForm({ ...form, pf_enabled: v })} />
          </div>

          {form.pf_enabled && (
            <>
              <div className="space-y-1.5">
                <Label>PF wage base</Label>
                <Select value={form.pf_wage_basis} onValueChange={(v) => setForm({ ...form, pf_wage_basis: v as any })}>
                  <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                  <SelectContent className="z-50 bg-popover">
                    <SelectItem value="capped">Capped at ₹15,000 (default)</SelectItem>
                    <SelectItem value="actual">Actual Basic (uncapped)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Voluntary PF (VPF)</Label>
                <div className="flex gap-2">
                  <Select value={form.vpf_mode} onValueChange={(v) => setForm({ ...form, vpf_mode: v as any })}>
                    <SelectTrigger className="w-[150px] text-foreground"><SelectValue /></SelectTrigger>
                    <SelectContent className="z-50 bg-popover">
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="percent">% of PF wages</SelectItem>
                      <SelectItem value="fixed">Fixed ₹ / month</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.vpf_mode !== "none" && (
                    <Input
                      className="text-foreground"
                      inputMode="decimal"
                      value={form.vpf_value}
                      onChange={(e) => setForm({ ...form, vpf_value: e.target.value })}
                      placeholder={form.vpf_mode === "percent" ? "e.g. 5" : "e.g. 2000"}
                    />
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>UAN</Label>
                <Input className="text-foreground" value={form.uan} onChange={(e) => setForm({ ...form, uan: e.target.value })} />
              </div>
            </>
          )}

          <div className="flex items-center justify-between">
            <Label>ESI</Label>
            <Switch checked={form.esi_enabled} onCheckedChange={(v) => setForm({ ...form, esi_enabled: v })} />
          </div>
          {form.esi_enabled && (
            <div className="space-y-1.5">
              <Label>ESIC number</Label>
              <Input className="text-foreground" value={form.esic_number} onChange={(e) => setForm({ ...form, esic_number: e.target.value })} />
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label>Professional Tax</Label>
            <Switch checked={form.pt_enabled} onCheckedChange={(v) => setForm({ ...form, pt_enabled: v })} />
          </div>

          <div className="space-y-1.5">
            <Label>Effective from (payroll month)</Label>
            <Input
              type="month"
              className="text-foreground"
              value={form.effective_from.slice(0, 7)}
              onChange={(e) => setForm({ ...form, effective_from: `${e.target.value}-01` })}
            />
          </div>


          <div className="space-y-1.5">
            <Label>Reason (required)</Label>
            <Input
              className={`text-foreground ${!form.reason.trim() ? "border-destructive/60" : ""}`}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </div>

          <Button
            className="w-full"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !form.reason.trim()}
          >
            {saveMutation.isPending ? "Saving…" : "Save statutory settings"}
          </Button>

        </div>
      </ResponsiveDialog>

      {/* Bulk dialog */}
      <ResponsiveDialog open={bulkOpen} onOpenChange={setBulkOpen} title={`Bulk update — ${selected.length} employees`}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Setting</Label>
            <Select value={bulk.field} onValueChange={(v) => setBulk({ ...bulk, field: v as any })}>
              <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent className="z-50 bg-popover">
                <SelectItem value="pf">Provident Fund</SelectItem>
                <SelectItem value="esi">ESI</SelectItem>
                <SelectItem value="pt">Professional Tax</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Label>Enrol</Label>
            <Switch checked={bulk.value} onCheckedChange={(v) => setBulk({ ...bulk, value: v })} />
          </div>
          <div className="space-y-1.5">
            <Label>Effective from</Label>
            <Input
              type="month"
              className="text-foreground"
              value={bulk.effective_from.slice(0, 7)}
              onChange={(e) => setBulk({ ...bulk, effective_from: `${e.target.value}-01` })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Reason (required)</Label>
            <Input
              className={`text-foreground ${!bulk.reason.trim() ? "border-destructive/60" : ""}`}
              value={bulk.reason}
              onChange={(e) => setBulk({ ...bulk, reason: e.target.value })}
            />
          </div>
          <Button
            className="w-full"
            onClick={() => bulkMutation.mutate()}
            disabled={bulkMutation.isPending || !bulk.reason.trim()}
          >
            {bulkMutation.isPending ? "Applying…" : "Apply to selected"}
          </Button>

        </div>
      </ResponsiveDialog>

      {/* History drawer */}
      <ResponsiveDialog
        open={!!historyFor}
        onOpenChange={(o) => !o && setHistoryFor(null)}
        title={historyFor ? `History — ${historyFor.first_name} ${historyFor.last_name}` : ""}
      >
        <div className="space-y-2">
          {profiles.filter((p) => p.hr_employee_id === historyFor?.id).map((p) => (
            <div key={p.id} className="rounded-md border p-2 text-sm">
              <div className="font-medium">From {p.effective_from}</div>
              <div className="text-xs text-muted-foreground">
                PF {p.pf_enabled ? `on (${p.pf_wage_basis === "actual" ? "actual Basic" : "capped"})` : "off"} ·
                {" "}VPF {p.vpf_mode === "none" ? "none" : p.vpf_mode === "percent" ? `${p.vpf_value}%` : inr(p.vpf_value)} ·
                {" "}ESI {p.esi_enabled ? "on" : "off"} · PT {p.pt_enabled ? "on" : "off"}
              </div>
              {p.reason && <div className="text-xs mt-1">{p.reason}</div>}
            </div>
          ))}
          {!profiles.some((p) => p.hr_employee_id === historyFor?.id) && (
            <p className="text-sm text-muted-foreground">No history yet.</p>
          )}
        </div>
      </ResponsiveDialog>
    </div>
    </TooltipProvider>
  );
}
