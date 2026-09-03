import { Suspense, lazy, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

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
const SalaryRevisionsPage = lazy(() => import("@/pages/horilla/SalaryRevisionsPage"));
const PayslipEmailDispatchPanel = lazy(() => import("@/components/hrms/PayslipEmailDispatchPanel"));
const SeparationsFnFPanel = lazy(() => import("@/components/hrms/SeparationsFnFPanel"));

export type CockpitToolKey =
  | "inputs"
  | "separations"
  | "salary_revisions"
  | "period_locks"
  | "stale_sessions"
  | "payslip_import"
  | "payslip_emails"
  | "salary_register"
  | "shadow"
  | "data_health"
  | "system_pulse"
  | "razorpay_sync";

const TOOLS: Record<CockpitToolKey, { title: string; Component: React.LazyExoticComponent<any> }> = {
  inputs: { title: "Payroll Inputs — Additions / Deductions", Component: PayrollInputsPage },
  separations: { title: "Separations & Full & Final — This Payroll Cycle", Component: SeparationsFnFPanel },
  salary_revisions: { title: "Salary Revisions — Compensation Changes", Component: SalaryRevisionsPage },
  period_locks: { title: "Attendance Period Locks", Component: AttendancePeriodLockPage },
  stale_sessions: { title: "Stale Attendance Sessions", Component: AttendanceStaleSessionsPage },
  payslip_import: { title: "Import Payslips", Component: PayslipHistoryImportPage },
  payslip_emails: { title: "Payslip Email Dispatch", Component: PayslipEmailDispatchPanel },
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
  month,
  onClose,
}: {
  tool: CockpitToolKey | null;
  month?: string;
  onClose: () => void;
}) {
  const entry = tool ? TOOLS[tool] : null;

  // Lock body scroll while the full-page tool is open, and allow Esc to close.
  useEffect(() => {
    if (!entry) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [entry, onClose]);

  if (!entry) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={entry.title}
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      <div className="flex items-center gap-3 border-b px-3 md:px-4 py-2.5 shrink-0 bg-background">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Payroll cockpit{month ? ` · ${new Date(month + "T00:00:00Z").toLocaleString("en-IN", { month: "long", year: "numeric" })}` : ""}
          </p>
          <h2 className="text-sm font-semibold truncate">{entry.title}</h2>
        </div>
        <Button variant="outline" size="sm" className="ml-auto gap-1.5 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" /> <span className="hidden sm:inline">Back to cockpit</span>
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain cockpit-tool-shell">
        <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading tool…</div>}>
          {tool === "separations" ? (
            (() => {
              const C = entry.Component as unknown as React.ComponentType<{ month?: string }>;
              return <C month={month} />;
            })()
          ) : tool === "payslip_emails" ? (
            <div className="p-3 md:p-6">
              {(() => {
                const C = entry.Component as unknown as React.ComponentType<{ month?: string }>;
                return <C month={month} />;
              })()}
            </div>
          ) : tool === "salary_revisions" ? (
            (() => {
              const C = entry.Component as unknown as React.ComponentType<{ month?: string }>;
              return <C month={month} />;
            })()
          ) : (
            <entry.Component />
          )}
        </Suspense>
      </div>

    </div>,
    document.body,
  );
}
