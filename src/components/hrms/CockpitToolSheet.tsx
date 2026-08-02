import { Suspense, lazy } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

// Every payroll sub-tool now lives INSIDE the cockpit instead of the sidebar.
const PayrollInputsPage = lazy(() => import("@/pages/hr/PayrollInputsPage"));
const AttendancePeriodLockPage = lazy(() => import("@/pages/horilla/AttendancePeriodLockPage"));
const AttendanceStaleSessionsPage = lazy(() => import("@/pages/horilla/AttendanceStaleSessionsPage"));
const PayslipHistoryImportPage = lazy(() => import("@/pages/hr/PayslipHistoryImportPage"));
const SalaryRegisterImportPage = lazy(() => import("@/pages/hr/SalaryRegisterImportPage"));
const ShadowPayrollPage = lazy(() => import("@/pages/hr/ShadowPayrollPage"));
const DataHealthPage = lazy(() => import("@/pages/horilla/DataHealthPage"));
const SystemPulsePage = lazy(() => import("@/pages/hr/SystemPulsePage"));
const RazorpaySyncPage = lazy(() => import("@/pages/hr/RazorpaySyncPage"));

export type CockpitToolKey =
  | "inputs"
  | "period_locks"
  | "stale_sessions"
  | "payslip_import"
  | "salary_register"
  | "shadow"
  | "data_health"
  | "system_pulse"
  | "razorpay_sync";

const TOOLS: Record<CockpitToolKey, { title: string; Component: React.LazyExoticComponent<any> }> = {
  inputs: { title: "Payroll Inputs — Additions / Deductions", Component: PayrollInputsPage },
  period_locks: { title: "Attendance Period Locks", Component: AttendancePeriodLockPage },
  stale_sessions: { title: "Stale Attendance Sessions", Component: AttendanceStaleSessionsPage },
  payslip_import: { title: "Import Payslips", Component: PayslipHistoryImportPage },
  salary_register: { title: "Import Salary Register (CSV)", Component: SalaryRegisterImportPage },
  shadow: { title: "Shadow Payroll Calculation", Component: ShadowPayrollPage },
  data_health: { title: "Data Health & Drift", Component: DataHealthPage },
  system_pulse: { title: "System Pulse", Component: SystemPulsePage },
  razorpay_sync: { title: "RazorpayX Diagnostics", Component: RazorpaySyncPage },
};

export const COCKPIT_TOOL_TITLES = Object.fromEntries(
  Object.entries(TOOLS).map(([k, v]) => [k, v.title]),
) as Record<CockpitToolKey, string>;

export function CockpitToolSheet({
  tool,
  onClose,
}: {
  tool: CockpitToolKey | null;
  onClose: () => void;
}) {
  const entry = tool ? TOOLS[tool] : null;

  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-none w-[100vw] h-[100dvh] sm:w-[96vw] sm:h-[94dvh] sm:max-w-[1400px] p-0 gap-0 overflow-hidden flex flex-col"
      >
        <div className="flex items-center gap-2 border-b px-4 py-2.5 shrink-0">
          <DialogTitle className="text-sm font-semibold truncate">{entry?.title}</DialogTitle>
          <Button variant="ghost" size="sm" className="ml-auto gap-1.5" onClick={onClose}>
            <X className="h-4 w-4" /> Back to cockpit
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {entry && (
            <Suspense
              fallback={<div className="p-6 text-sm text-muted-foreground">Loading tool…</div>}
            >
              <entry.Component />
            </Suspense>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
