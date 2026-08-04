/**
 * Monthly payroll breakdown — employee-by-employee drill-down for one pay period.
 *
 * Opened by clicking a point/month on the Payroll Cost Trend chart. Read-only:
 * every figure comes from hr_payslips_v (the reconciled RazorpayX payslip
 * mirror + imported Salary Register), never from a recomputation.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUpDown, Download, Search } from "lucide-react";
import * as XLSX from "xlsx";

const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;
const abs = (n: any) => Math.abs(Number(n || 0));
const num = (n: any) => Number(n || 0);

type Col = { key: string; label: string; get: (r: any) => number; group: "earning" | "deduction" | "employer" | "summary" };

const COLUMNS: Col[] = [
  { key: "gross", label: "Gross", get: (r) => num(r.gross), group: "summary" },
  { key: "regular_gross", label: "Regular Gross", get: (r) => num(r.regular_gross), group: "summary" },
  { key: "basic", label: "Basic", get: (r) => num(r.basic), group: "earning" },
  { key: "hra", label: "HRA", get: (r) => num(r.hra), group: "earning" },
  { key: "special_allowance", label: "Special Allow.", get: (r) => num(r.special_allowance), group: "earning" },
  { key: "lta", label: "LTA", get: (r) => num(r.lta), group: "earning" },
  { key: "dearness_allowance", label: "DA", get: (r) => num(r.dearness_allowance), group: "earning" },
  { key: "overtime", label: "Overtime", get: (r) => num(r.overtime), group: "earning" },
  { key: "performance_incentive", label: "Incentive", get: (r) => num(r.performance_incentive), group: "earning" },
  { key: "one_time_payments", label: "One-time Pay", get: (r) => num(r.one_time_payments), group: "earning" },
  { key: "pf_amount", label: "PF (EE)", get: (r) => abs(r.pf_amount), group: "deduction" },
  { key: "esi_amount", label: "ESI (EE)", get: (r) => abs(r.esi_amount), group: "deduction" },
  { key: "professional_tax", label: "PT", get: (r) => abs(r.professional_tax), group: "deduction" },
  { key: "tds_amount", label: "TDS", get: (r) => abs(r.tds_amount), group: "deduction" },
  { key: "lwf_ee", label: "LWF (EE)", get: (r) => abs(r.lwf_ee), group: "deduction" },
  { key: "loan_emi", label: "Loan EMI", get: (r) => abs(r.loan_emi), group: "deduction" },
  { key: "advance_salary", label: "Advance", get: (r) => abs(r.advance_salary), group: "deduction" },
  { key: "one_time_recovery", label: "One-time Recovery", get: (r) => abs(r.one_time_recovery), group: "deduction" },
  { key: "total_deductions", label: "Total Deductions", get: (r) => abs(r.total_deductions), group: "summary" },
  { key: "employer_pf", label: "PF (ER)", get: (r) => num(r.employer_pf), group: "employer" },
  { key: "employer_esi", label: "ESI (ER)", get: (r) => num(r.employer_esi), group: "employer" },
  { key: "employer_contrib", label: "Employer Cost", get: (r) => num(r.employer_contrib), group: "employer" },
  { key: "net", label: "Net Pay", get: (r) => num(r.net), group: "summary" },
];

const DEFAULT_COLS = [
  "gross", "basic", "hra", "special_allowance", "one_time_payments",
  "pf_amount", "esi_amount", "professional_tax", "tds_amount", "loan_emi",
  "total_deductions", "employer_contrib", "net",
];

interface Props {
  monthKey: string | null; // "YYYY-MM"
  monthLabel: string;
  onClose: () => void;
  empName: (id: string) => string;
  deptOf: (id: string) => string;
  empBadge: (id: string) => string;
}

export function MonthlyPayrollBreakdownDialog({ monthKey, monthLabel, onClose, empName, deptOf, empBadge }: Props) {
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<string>("net");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [visible, setVisible] = useState<string[]>(DEFAULT_COLS);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["payroll_month_breakdown", monthKey],
    enabled: !!monthKey,
    queryFn: async () => await fetchAllPaginated<any>(() => (supabase as any)
      .from("hr_payslips_v")
      .select("*")
      .gte("period_month", `${monthKey}-01`)
      .lt("period_month", `${monthKey}-01`.replace(/^(\d{4})-(\d{2})/, (_m, y, mo) => {
        const d = new Date(Number(y), Number(mo), 1); // first day of next month
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      }))),
  });

  const enriched = useMemo(() => rows.map((r: any) => ({
    ...r,
    _name: empName(r.employee_id),
    _badge: empBadge(r.employee_id),
    _dept: r.reg_department || deptOf(r.employee_id),
    _designation: r.reg_designation || "—",
  })), [rows, empName, deptOf, empBadge]);

  const depts = useMemo(
    () => Array.from(new Set(enriched.map((r: any) => r._dept))).sort(),
    [enriched],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = enriched.filter((r: any) => {
      if (q && !(`${r._name} ${r._badge} ${r._designation}`.toLowerCase().includes(q))) return false;
      if (dept !== "all" && r._dept !== dept) return false;
      if (sourceFilter === "register" && !r.has_register) return false;
      if (sourceFilter === "dashboard" && r.has_register) return false;
      if (statusFilter === "left" && !r.has_left) return false;
      if (statusFilter === "active" && r.has_left) return false;
      if (statusFilter === "zero_net" && num(r.net) > 0) return false;
      if (statusFilter === "has_recovery" && abs(r.loan_emi) + abs(r.advance_salary) + abs(r.one_time_recovery) === 0) return false;
      return true;
    });
    const col = COLUMNS.find((c) => c.key === sortKey);
    list = [...list].sort((a, b) => {
      if (sortKey === "name") return sortDir === "asc" ? a._name.localeCompare(b._name) : b._name.localeCompare(a._name);
      const av = col ? col.get(a) : 0, bv = col ? col.get(b) : 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return list;
  }, [enriched, search, dept, sourceFilter, statusFilter, sortKey, sortDir]);

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    COLUMNS.forEach((c) => { t[c.key] = filtered.reduce((s, r) => s + c.get(r), 0); });
    return t;
  }, [filtered]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const exportXlsx = () => {
    const cols = COLUMNS.filter((c) => visible.includes(c.key));
    const data = filtered.map((r: any) => {
      const o: Record<string, any> = {
        "Employee": r._name, "Badge": r._badge, "Department": r._dept, "Designation": r._designation,
        "Working Days": num(r.working_days), "Source": r.has_register ? "Register CSV" : "Dashboard only",
      };
      cols.forEach((c) => { o[c.label] = c.get(r); });
      return o;
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Payroll Breakdown");
    XLSX.writeFile(wb, `payroll-breakdown-${monthKey}.xlsx`);
  };

  const shownCols = COLUMNS.filter((c) => visible.includes(c.key));

  return (
    <Dialog open={!!monthKey} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[96vw] w-[96vw] max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">Payroll breakdown · {monthLabel}</DialogTitle>
          <DialogDescription className="text-xs">
            Employee-by-employee figures from the reconciled payslip mirror (hr_payslips_v). Read-only.
          </DialogDescription>
        </DialogHeader>

        {/* KPI strip — reflects the current filters */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
          {[
            { l: "Employees", v: String(filtered.length) },
            { l: "Gross", v: inr(totals.gross) },
            { l: "Deductions", v: inr(totals.total_deductions) },
            { l: "Net Paid", v: inr(totals.net) },
            { l: "Employer Cost", v: inr(totals.employer_contrib) },
            { l: "CTC Outflow", v: inr(totals.gross + totals.employer_contrib) },
          ].map((k) => (
            <div key={k.l} className="rounded-lg border border-border p-2.5">
              <p className="text-sm font-bold tabular-nums text-foreground">{k.v}</p>
              <p className="text-[10px] text-muted-foreground">{k.l}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee, badge, designation"
              className="h-9 pl-8 text-foreground" />
          </div>
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="h-9 w-[180px] text-foreground"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent className="max-h-[300px]">
              <SelectItem value="all">All departments</SelectItem>
              {depts.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="h-9 w-[170px] text-foreground"><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any source</SelectItem>
              <SelectItem value="register">Register CSV only</SelectItem>
              <SelectItem value="dashboard">Dashboard only</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[180px] text-foreground"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All employees</SelectItem>
              <SelectItem value="active">Active only</SelectItem>
              <SelectItem value="left">Exited (F&F) only</SelectItem>
              <SelectItem value="zero_net">Zero / negative net</SelectItem>
              <SelectItem value="has_recovery">With recoveries</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-9" onClick={exportXlsx}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export
          </Button>
        </div>

        {/* Column picker */}
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 rounded-lg border border-border p-2">
          {COLUMNS.map((c) => (
            <label key={c.key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
              <Checkbox
                checked={visible.includes(c.key)}
                onCheckedChange={(v) => setVisible((prev) => (v ? [...prev, c.key] : prev.filter((k) => k !== c.key)))}
              />
              {c.label}
            </label>
          ))}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto rounded-lg border border-border">
          {isLoading ? (
            <div className="p-4 space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No payslip rows match these filters for {monthLabel}.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/95 backdrop-blur z-10">
                <tr>
                  <th className="text-left p-2 font-medium">
                    <button className="inline-flex items-center gap-1" onClick={() => toggleSort("name")}>
                      Employee <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-left p-2 font-medium">Department</th>
                  <th className="text-right p-2 font-medium">Days</th>
                  {shownCols.map((c) => (
                    <th key={c.key} className="text-right p-2 font-medium whitespace-nowrap">
                      <button className="inline-flex items-center gap-1" onClick={() => toggleSort(c.key)}>
                        {c.label} <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                  ))}
                  <th className="text-left p-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r: any) => (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/40">
                    <td className="p-2">
                      <span className="font-medium text-foreground">{r._name}</span>
                      <span className="block text-[10px] text-muted-foreground">{r._badge} · {r._designation}</span>
                    </td>
                    <td className="p-2 text-muted-foreground">{r._dept}</td>
                    <td className="p-2 text-right tabular-nums text-muted-foreground">{r.working_days ?? "—"}</td>
                    {shownCols.map((c) => (
                      <td key={c.key} className="p-2 text-right tabular-nums text-foreground whitespace-nowrap">
                        {c.get(r) ? inr(c.get(r)) : <span className="text-muted-foreground">—</span>}
                      </td>
                    ))}
                    <td className="p-2">
                      <Badge variant={r.has_register ? "secondary" : "outline"} className="text-[10px]">
                        {r.has_register ? "Register CSV" : "Dashboard only"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-muted/95 backdrop-blur">
                <tr className="border-t border-border font-semibold">
                  <td className="p-2">Total ({filtered.length})</td>
                  <td className="p-2" />
                  <td className="p-2" />
                  {shownCols.map((c) => (
                    <td key={c.key} className="p-2 text-right tabular-nums whitespace-nowrap">{inr(totals[c.key])}</td>
                  ))}
                  <td className="p-2" />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default MonthlyPayrollBreakdownDialog;
