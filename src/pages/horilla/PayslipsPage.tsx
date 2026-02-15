import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Search, Eye, CheckCircle, Wallet, Download } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function generatePayslipPDF(detail: any) {
  const doc = new jsPDF();
  const empName = `${detail.hr_employees?.first_name || ""} ${detail.hr_employees?.last_name || ""}`.trim();
  const badgeId = detail.hr_employees?.badge_id || "";
  const runTitle = detail.hr_payroll_runs?.title || "";
  const period = `${detail.hr_payroll_runs?.pay_period_start || ""} to ${detail.hr_payroll_runs?.pay_period_end || ""}`;

  // Header
  doc.setFillColor(232, 96, 76); // #E8604C
  doc.rect(0, 0, 210, 36, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("PAYSLIP", 14, 18);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(runTitle, 14, 28);
  doc.text(period, 210 - 14, 28, { align: "right" });

  // Employee info
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(empName, 14, 48);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(`Badge: ${badgeId}`, 14, 54);
  doc.text(`Working Days: ${detail.present_days || 0} / ${detail.working_days || 0}`, 14, 60);
  if (detail.overtime_hours > 0) doc.text(`Overtime: ${detail.overtime_hours}h`, 100, 60);

  let y = 70;

  // Earnings table
  const earningsRows = Object.entries(detail.earnings_breakdown || {}).map(([name, amt]) => [name, `₹${Number(amt).toLocaleString("en-IN")}`]);
  if (earningsRows.length > 0) {
    earningsRows.push(["Total Earnings", `₹${(detail.total_earnings || 0).toLocaleString("en-IN")}`]);
    autoTable(doc, {
      startY: y,
      head: [["Earnings", "Amount"]],
      body: earningsRows,
      theme: "grid",
      headStyles: { fillColor: [34, 139, 34], textColor: 255, fontStyle: "bold", fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 1: { halign: "right" } },
      didParseCell: (data) => {
        if (data.section === "body" && data.row.index === earningsRows.length - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [240, 255, 240];
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Deductions table
  const deductionRows = Object.entries(detail.deductions_breakdown || {}).map(([name, amt]) => [name, `₹${Number(amt).toLocaleString("en-IN")}`]);
  if (deductionRows.length > 0) {
    deductionRows.push(["Total Deductions", `₹${(detail.total_deductions || 0).toLocaleString("en-IN")}`]);
    autoTable(doc, {
      startY: y,
      head: [["Deductions", "Amount"]],
      body: deductionRows,
      theme: "grid",
      headStyles: { fillColor: [220, 53, 69], textColor: 255, fontStyle: "bold", fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 1: { halign: "right" } },
      didParseCell: (data) => {
        if (data.section === "body" && data.row.index === deductionRows.length - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [255, 240, 240];
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // Net salary box
  doc.setFillColor(232, 96, 76);
  doc.roundedRect(14, y, 182, 18, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Net Salary", 20, y + 12);
  doc.text(`₹${(detail.net_salary || 0).toLocaleString("en-IN")}`, 190, y + 12, { align: "right" });

  // Payment status
  if (detail.status === "paid") {
    y += 26;
    doc.setTextColor(34, 139, 34);
    doc.setFontSize(9);
    doc.text(`✓ Paid${detail.payment_date ? ` on ${detail.payment_date}` : ""}${detail.payment_reference ? ` | Ref: ${detail.payment_reference}` : ""}`, 14, y);
  }

  // Footer
  doc.setTextColor(180, 180, 180);
  doc.setFontSize(7);
  doc.text("This is a computer-generated payslip and does not require a signature.", 105, 285, { align: "center" });

  doc.save(`Payslip_${empName.replace(/\s+/g, "_")}_${detail.hr_payroll_runs?.pay_period_end || "unknown"}.pdf`);
}

export default function PayslipsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [runFilter, setRunFilter] = useState("all");
  const [detail, setDetail] = useState<any>(null);

  const { data: runs = [] } = useQuery({
    queryKey: ["hr_payroll_runs_list"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_payroll_runs").select("id, title").order("run_date", { ascending: false });
      return data || [];
    },
  });

  const { data: payslips = [], isLoading } = useQuery({
    queryKey: ["hr_payslips", runFilter],
    queryFn: async () => {
      let query = (supabase as any).from("hr_payslips")
        .select("*, hr_employees!hr_payslips_employee_id_fkey(badge_id, first_name, last_name), hr_payroll_runs!hr_payslips_payroll_run_id_fkey(title, pay_period_start, pay_period_end)")
        .order("created_at", { ascending: false });
      if (runFilter !== "all") query = query.eq("payroll_run_id", runFilter);
      const { data, error } = await query;
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async ({ id, ref }: { id: string; ref: string }) => {
      const { error } = await (supabase as any).from("hr_payslips").update({
        status: "paid",
        payment_date: new Date().toISOString().split("T")[0],
        payment_reference: ref || null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_payslips"] });
      toast.success("Marked as paid");
      setDetail(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [payRef, setPayRef] = useState("");

  const filtered = payslips.filter((p: any) => {
    const q = search.toLowerCase();
    const fullName = `${p.hr_employees?.first_name || ""} ${p.hr_employees?.last_name || ""}`.toLowerCase();
    return fullName.includes(q) || p.hr_employees?.badge_id?.toLowerCase().includes(q);
  });

  const statusColor = (s: string) => {
    if (s === "paid") return "bg-green-100 text-green-700";
    if (s === "pending") return "bg-yellow-100 text-yellow-700";
    return "bg-gray-100 text-gray-700";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payslips</h1>
        <p className="text-sm text-gray-500">View individual employee payslips with earnings/deductions breakdown</p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search employee..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={runFilter} onValueChange={setRunFilter}>
          <SelectTrigger className="w-56"><SelectValue placeholder="All Payroll Runs" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Payroll Runs</SelectItem>
            {runs.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {["Employee", "Badge ID", "Payroll Run", "Gross", "Deductions", "Net Salary", "Days", "Status", "Actions"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="text-center py-8 text-gray-400">Loading...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-gray-400">No payslips found. Generate payslips from a payroll run first.</td></tr>
              ) : (
                filtered.map((p: any) => (
                  <tr key={p.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{p.hr_employees?.first_name} {p.hr_employees?.last_name}</td>
                    <td className="px-4 py-3 text-gray-500">{p.hr_employees?.badge_id}</td>
                    <td className="px-4 py-3 text-xs">{p.hr_payroll_runs?.title}</td>
                    <td className="px-4 py-3 text-green-700 font-medium">₹{p.gross_salary?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-red-600">₹{p.total_deductions?.toLocaleString()}</td>
                    <td className="px-4 py-3 font-semibold">₹{p.net_salary?.toLocaleString()}</td>
                    <td className="px-4 py-3">{p.present_days || 0}/{p.working_days || 0}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(p.status || "draft")}`}>{p.status || "draft"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => { setDetail(p); setPayRef(""); }}>
                        <Eye className="h-3.5 w-3.5 mr-1" /> View
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Payslip Detail Dialog */}
      <Dialog open={!!detail} onOpenChange={() => setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-[#E8604C]" />
              Payslip — {detail?.hr_employees?.first_name} {detail?.hr_employees?.last_name}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">Payroll Run</span><span className="font-medium">{detail.hr_payroll_runs?.title}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Period</span><span>{detail.hr_payroll_runs?.pay_period_start} — {detail.hr_payroll_runs?.pay_period_end}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Working Days</span><span>{detail.present_days}/{detail.working_days}</span></div>
                {detail.overtime_hours > 0 && <div className="flex justify-between"><span className="text-gray-500">Overtime</span><span>{detail.overtime_hours}h</span></div>}
              </div>

              {/* Earnings */}
              <div>
                <p className="text-xs font-semibold text-green-700 mb-2">EARNINGS</p>
                <div className="space-y-1">
                  {detail.earnings_breakdown && Object.entries(detail.earnings_breakdown).map(([name, amount]) => (
                    <div key={name} className="flex justify-between text-sm bg-green-50 px-3 py-1.5 rounded">
                      <span>{name}</span>
                      <span className="font-medium">₹{Number(amount).toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-bold border-t pt-1.5 mt-1">
                    <span>Total Earnings</span>
                    <span className="text-green-700">₹{detail.total_earnings?.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Deductions */}
              <div>
                <p className="text-xs font-semibold text-red-600 mb-2">DEDUCTIONS</p>
                <div className="space-y-1">
                  {detail.deductions_breakdown && Object.entries(detail.deductions_breakdown).map(([name, amount]) => (
                    <div key={name} className="flex justify-between text-sm bg-red-50 px-3 py-1.5 rounded">
                      <span>{name}</span>
                      <span className="font-medium">₹{Number(amount).toLocaleString()}</span>
                    </div>
                  ))}
                  {(!detail.deductions_breakdown || Object.keys(detail.deductions_breakdown).length === 0) && (
                    <p className="text-xs text-gray-400">No deductions</p>
                  )}
                  <div className="flex justify-between text-sm font-bold border-t pt-1.5 mt-1">
                    <span>Total Deductions</span>
                    <span className="text-red-600">₹{detail.total_deductions?.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Net */}
              <div className="bg-[#E8604C]/5 border border-[#E8604C]/20 rounded-lg p-3 flex justify-between items-center">
                <span className="font-semibold text-gray-900">Net Salary</span>
                <span className="text-xl font-bold text-[#E8604C]">₹{detail.net_salary?.toLocaleString()}</span>
              </div>

              {/* Payment */}
              {detail.status === "paid" ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                  <div className="flex items-center gap-2 text-green-700 font-medium">
                    <CheckCircle className="h-4 w-4" /> Paid
                  </div>
                  {detail.payment_date && <p className="text-xs text-gray-500 mt-1">Date: {detail.payment_date}</p>}
                  {detail.payment_reference && <p className="text-xs text-gray-500">Ref: {detail.payment_reference}</p>}
                </div>
              ) : (
                <div className="space-y-2">
                  <div><Label>Payment Reference (optional)</Label><Input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="e.g. NEFT ref number" /></div>
                  <Button
                    className="w-full bg-green-600 hover:bg-green-700"
                    onClick={() => markPaidMutation.mutate({ id: detail.id, ref: payRef })}
                    disabled={markPaidMutation.isPending}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" /> Mark as Paid
                  </Button>
                </div>
              )}

              <Button
                variant="outline"
                className="w-full"
                onClick={() => generatePayslipPDF(detail)}
              >
                <Download className="h-4 w-4 mr-2" /> Download PDF
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
