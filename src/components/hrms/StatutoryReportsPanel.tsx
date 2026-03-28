import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download, Building2 } from "lucide-react";
import { toast } from "sonner";
import {
  generateECRFile,
  generateESIStatement,
  generatePFSummary,
  downloadTextFile,
  type EmployeeStatutoryData,
} from "@/lib/hrms/statutoryReports";

export function StatutoryReportsPanel() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return {
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString("en-IN", { month: "long", year: "numeric" }),
    };
  });

  // Get payslips for the selected month
  const { data: payslips = [], isLoading } = useQuery({
    queryKey: ["statutory_payslips", selectedMonth],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_payslips")
        .select("*, hr_employees!hr_payslips_employee_id_fkey(badge_id, first_name, last_name, uan_number, pf_number, esi_number, pan_number)")
        .like("pay_period_start", `${selectedMonth}%`);
      if (error) throw error;
      return data || [];
    },
  });

  const buildStatutoryData = (): EmployeeStatutoryData[] => {
    return payslips.map((ps: any) => {
      const emp = ps.hr_employees || {};
      const breakdown = ps.earnings_breakdown || {};
      const basicKey = Object.keys(breakdown).find(
        (k) => k.toLowerCase().includes("basic")
      );
      const basicSalary = basicKey ? Number(breakdown[basicKey]) : Number(ps.total_earnings) * 0.4;

      return {
        badge_id: emp.badge_id || "",
        first_name: emp.first_name || "",
        last_name: emp.last_name || "",
        uan_number: emp.uan_number,
        pf_number: emp.pf_number,
        esi_number: emp.esi_number,
        pan_number: emp.pan_number,
        gross_salary: Number(ps.total_earnings) || 0,
        basic_salary: basicSalary,
        pf_employee: 0,
        pf_employer: 0,
        esi_employee: 0,
        esi_employer: 0,
        days_worked: 30,
      };
    });
  };

  const handleDownloadECR = () => {
    const data = buildStatutoryData();
    if (data.length === 0) {
      toast.error("No payslip data for selected month");
      return;
    }
    const content = generateECRFile(data, selectedMonth);
    if (!content.trim()) {
      toast.error("No employees with UAN/PF numbers found");
      return;
    }
    downloadTextFile(content, `ECR_${selectedMonth}.txt`);
    toast.success("ECR file downloaded");
  };

  const handleDownloadESI = () => {
    const data = buildStatutoryData();
    if (data.length === 0) {
      toast.error("No payslip data for selected month");
      return;
    }
    const content = generateESIStatement(data, selectedMonth);
    if (content.split("\n").length <= 1) {
      toast.error("No employees eligible for ESI found");
      return;
    }
    downloadTextFile(content, `ESI_Statement_${selectedMonth}.txt`);
    toast.success("ESI statement downloaded");
  };

  const pfSummary = payslips.length > 0 ? generatePFSummary(buildStatutoryData()) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Building2 className="h-4 w-4" /> Statutory Reports
        </h3>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-48 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {pfSummary && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground">PF Summary — {payslips.length} employees</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">EPF (Employee)</p>
                <p className="font-semibold">₹{pfSummary.totalEPFEmployee.toLocaleString("en-IN")}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">EPF (Employer)</p>
                <p className="font-semibold">₹{pfSummary.totalEPFEmployer.toLocaleString("en-IN")}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">EPS (Employer)</p>
                <p className="font-semibold">₹{pfSummary.totalEPSEmployer.toLocaleString("en-IN")}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">EDLI</p>
                <p className="font-semibold">₹{pfSummary.totalEDLI.toLocaleString("en-IN")}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Admin Charges</p>
                <p className="font-semibold">₹{pfSummary.totalAdminCharges.toLocaleString("en-IN")}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Grand Total</p>
                <p className="font-bold text-primary">₹{pfSummary.grandTotal.toLocaleString("en-IN")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={handleDownloadECR}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">EPF ECR File</p>
              <p className="text-xs text-muted-foreground">Electronic Challan cum Return</p>
            </div>
            <Download className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={handleDownloadESI}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <FileText className="h-5 w-5 text-green-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">ESI Contribution Statement</p>
              <p className="text-xs text-muted-foreground">IP-wise monthly statement</p>
            </div>
            <Download className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
