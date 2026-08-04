import { Link } from "react-router-dom";
import { FileSpreadsheet, ArrowRight, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/PageHeader";

type RegisterEntry = {
  key: string;
  name: string;
  description: string;
  path?: string;
  status: "available" | "coming_soon";
};

const REGISTERS: RegisterEntry[] = [
  {
    key: "salary",
    name: "Salary Register",
    description:
      "RazorpayX-format register projected from HRMS data — tally earnings, statutory deductions and net pay mid-month, before payroll is processed.",
    path: "/hrms/reports/salary-register-projection",
    status: "available",
  },
  {
    key: "attendance",
    name: "Attendance Register",
    description: "Day-wise present/absent, late and overtime rollup per employee for a selected period.",
    status: "coming_soon",
  },
  {
    key: "statutory",
    name: "Statutory Register (PF / ESI / PT)",
    description: "Contribution-wise register for monthly statutory filings and challan reconciliation.",
    status: "coming_soon",
  },
  {
    key: "loans",
    name: "Loans & Recoveries Register",
    description: "Outstanding EMIs, security deposits and error recoveries with RazorpayX push status.",
    status: "coming_soon",
  },
];

export default function RegistersPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Registers"
        description="Period-wise registers generated from HRMS data. Open a register to view, filter and export it."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {REGISTERS.map((r) => {
          const inner = (
            <CardContent className="p-4 flex flex-col gap-2 h-full">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-1.5 rounded-lg bg-primary/10 shrink-0">
                    <FileSpreadsheet className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-sm font-semibold text-foreground truncate">{r.name}</p>
                </div>
                {r.status === "available" ? (
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">{r.description}</p>
              <div className="mt-auto pt-2">
                <Badge variant={r.status === "available" ? "secondary" : "outline"} className="text-[10px]">
                  {r.status === "available" ? "Available" : "Coming soon"}
                </Badge>
              </div>
            </CardContent>
          );

          return r.path ? (
            <Link key={r.key} to={r.path} className="block">
              <Card className="h-full transition-colors hover:border-primary/50">{inner}</Card>
            </Link>
          ) : (
            <Card key={r.key} className="h-full opacity-70">
              {inner}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
