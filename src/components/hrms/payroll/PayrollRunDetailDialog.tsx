import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { Download, Users, FileText } from "lucide-react";

const inr = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  periodMonth: string | null; // YYYY-MM-DD (first of month)
  title?: string;
}

export function PayrollRunDetailDialog({ open, onOpenChange, periodMonth, title }: Props) {
  const [search, setSearch] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["hr_payroll_run_detail", periodMonth],
    enabled: open && !!periodMonth,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_razorpay_payslip_records")
        .select("*")
        .eq("period_month", periodMonth)
        .order("employee_name_snapshot", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const num = (r: any, ...keys: string[]) => {
    for (const k of keys) {
      const v = Number(r[k]);
      if (!Number.isNaN(v) && v !== 0) return v;
    }
    return 0;
  };

  const totals = useMemo(() => {
    const t = { emps: rows.length, gross: 0, basic: 0, hra: 0, sa: 0, other: 0, pf: 0, esi: 0, pt: 0, tds: 0, loan: 0, advance: 0, ded: 0, net: 0, pfEr: 0, esiEr: 0 };
    for (const r of rows as any[]) {
      const gross = num(r, "gross_earnings", "reg_gross_salary");
      const basic = Number(r.reg_basic) || 0;
      const hra = Number(r.reg_hra) || 0;
      const sa = Number(r.reg_sa) || 0;
      t.gross += gross;
      t.basic += basic;
      t.hra += hra;
      t.sa += sa;
      t.other += Math.max(0, gross - basic - hra - sa);
      t.pf += num(r, "pf_amount", "reg_pf_ee");
      t.esi += num(r, "esi_amount", "reg_esi_ee");
      t.pt += num(r, "professional_tax", "reg_pt");
      t.tds += num(r, "tds_amount", "reg_tds");
      t.loan += Number(r.reg_loan_emi) || 0;
      t.advance += Number(r.reg_advance_salary) || 0;
      t.ded += num(r, "total_deductions");
      t.net += num(r, "net_pay", "reg_net_pay");
      t.pfEr += num(r, "reg_employer_pf_contr", "reg_pf_er");
      t.esiEr += num(r, "reg_employer_esi_contr", "reg_esi_er");
    }
    return t;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows as any[];
    return (rows as any[]).filter((r) =>
      `${r.employee_name_snapshot || ""} ${r.reg_department || ""} ${r.reg_designation || ""}`.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const exportCsv = () => {
    const head = ["Employee", "Department", "Designation", "Basic", "HRA", "Special", "Gross", "PF", "ESI", "PT", "TDS", "Loan EMI", "Advance", "Total Deductions", "Net Pay"];
    const lines = [head.join(",")];
    for (const r of filtered) {
      lines.push([
        `"${(r.employee_name_snapshot || "").replace(/"/g, "'")}"`,
        `"${r.reg_department || ""}"`,
        `"${r.reg_designation || ""}"`,
        Number(r.reg_basic) || 0,
        Number(r.reg_hra) || 0,
        Number(r.reg_sa) || 0,
        num(r, "gross_earnings", "reg_gross_salary"),
        num(r, "pf_amount", "reg_pf_ee"),
        num(r, "esi_amount", "reg_esi_ee"),
        num(r, "professional_tax", "reg_pt"),
        num(r, "tds_amount", "reg_tds"),
        Number(r.reg_loan_emi) || 0,
        Number(r.reg_advance_salary) || 0,
        num(r, "total_deductions"),
        num(r, "net_pay", "reg_net_pay"),
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `payroll_${periodMonth}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const summaryTiles = [
    { label: "Employees", value: totals.emps },
    { label: "Gross", value: inr(totals.gross) },
    { label: "Deductions", value: inr(totals.ded) },
    { label: "Net Pay", value: inr(totals.net) },
  ];

  const componentRows = [
    { label: "Basic", value: totals.basic },
    { label: "HRA", value: totals.hra },
    { label: "Special Allowance", value: totals.sa },
    { label: "Other Earnings", value: totals.other },
  ];
  const deductionRows = [
    { label: "PF (employee)", value: totals.pf },
    { label: "ESI (employee)", value: totals.esi },
    { label: "Professional Tax", value: totals.pt },
    { label: "TDS", value: totals.tds },
    { label: "Loan EMI", value: totals.loan },
    { label: "Advance recovery", value: totals.advance },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title || "Payroll breakdown"}</DialogTitle>
          <DialogDescription>
            Employee-wise breakdown mirrored from RazorpayX for {periodMonth}. Read-only.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {summaryTiles.map((t) => (
            <Card key={t.label}>
              <CardContent className="p-3">
                <p className="text-lg font-semibold tabular-nums">{t.value}</p>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-3 space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Earnings mix</p>
              {componentRows.map((c) => (
                <div key={c.label} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{c.label}</span>
                  <span className="tabular-nums">{inr(c.value)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deductions & employer cost</p>
              {deductionRows.map((c) => (
                <div key={c.label} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{c.label}</span>
                  <span className="tabular-nums">{inr(c.value)}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm border-t pt-1.5">
                <span className="text-muted-foreground">Employer PF / ESI</span>
                <span className="tabular-nums">{inr(totals.pfEr)} / {inr(totals.esiEr)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center gap-2">
          <Input placeholder="Search employee, department…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9" />
          <Button size="sm" variant="outline" className="h-9" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>

        {isLoading ? (
          <TableSkeleton rows={6} columns={6} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Users} title="No payslip records" description="No records imported for this period yet." />
        ) : (
          <div className="overflow-x-auto border rounded-md">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  {["Employee", "Basic", "HRA", "Gross", "PF", "ESI", "PT", "TDS", "Deductions", "Net", ""].map((h, i) => (
                    <th key={h + i} className={`px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap ${i === 0 || h === "" ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r: any) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-3 py-2">
                      <p className="font-medium">{r.employee_name_snapshot || "—"}</p>
                      <p className="text-[11px] text-muted-foreground">{[r.reg_designation, r.reg_department].filter(Boolean).join(" · ")}</p>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{inr(r.reg_basic)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{inr(r.reg_hra)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-success">{inr(num(r, "gross_earnings", "reg_gross_salary"))}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{inr(num(r, "pf_amount", "reg_pf_ee"))}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{inr(num(r, "esi_amount", "reg_esi_ee"))}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{inr(num(r, "professional_tax", "reg_pt"))}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{inr(num(r, "tds_amount", "reg_tds"))}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-destructive">{inr(num(r, "total_deductions"))}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{inr(num(r, "net_pay", "reg_net_pay"))}</td>
                    <td className="px-3 py-2 text-right">
                      {r.pdf_url && (
                        <a href={r.pdf_url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 text-xs">
                          <FileText className="h-3.5 w-3.5" /> PDF
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
