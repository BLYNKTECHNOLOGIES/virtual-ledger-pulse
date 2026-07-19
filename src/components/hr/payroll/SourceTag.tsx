import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ExternalLink, ShieldCheck, FileSpreadsheet, Calculator, AlertTriangle } from "lucide-react";

/**
 * Payroll Doctrine 2026-07-19: RazorpayX is the primary payroll authority.
 * HRMS is a faithful IMAGE — feeder of inputs, mirror of outputs.
 *
 * Every payroll figure rendered in the HRMS MUST carry a source tag so
 * viewers can tell — at a glance — what they're looking at:
 *
 *   razorpay        — pulled from a RazorpayX API response (executed run)
 *   register_csv    — pulled from the monthly Salary Register CSV (statutory splits)
 *   dashboard_only  — visible on the RazorpayX dashboard; API does not expose it
 *   local_estimate  — computed inside HRMS; advisory only, not a payout figure
 *
 * Never render a "local_estimate" number in a payout-facing context without
 * this tag. Any local number that masquerades as Razorpay's is a doctrine breach.
 */
export type PayrollSource = "razorpay" | "register_csv" | "dashboard_only" | "local_estimate";

const CONFIG: Record<PayrollSource, {
  label: string;
  short: string;
  className: string;
  icon: React.ComponentType<{ className?: string }>;
  tooltip: string;
}> = {
  razorpay: {
    label: "From RazorpayX",
    short: "Razorpay",
    className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/40 dark:text-emerald-400",
    icon: ShieldCheck,
    tooltip: "Pulled directly from the RazorpayX API for an executed payroll run. This is authoritative.",
  },
  register_csv: {
    label: "Salary Register",
    short: "Register",
    className: "bg-blue-500/10 text-blue-600 border-blue-500/40 dark:text-blue-400",
    icon: FileSpreadsheet,
    tooltip: "Ingested from the monthly Salary Register CSV downloaded from the RazorpayX dashboard. Statutory splits (PF/ESI/PT/TDS) come from here — the API does not expose them.",
  },
  dashboard_only: {
    label: "Dashboard only",
    short: "Dashboard",
    className: "bg-amber-500/10 text-amber-600 border-amber-500/40 dark:text-amber-400",
    icon: ExternalLink,
    tooltip: "This detail is visible on the RazorpayX dashboard but not exposed by the API. Open the dashboard link below to view the full breakdown.",
  },
  local_estimate: {
    label: "Local estimate",
    short: "Estimate",
    className: "bg-muted text-muted-foreground border-border",
    icon: Calculator,
    tooltip: "Computed inside HRMS. Advisory only — not a payout figure. RazorpayX is the payroll authority; use the Razorpay-tagged number when making decisions.",
  },
};

export function SourceTag({
  source,
  compact = false,
  className = "",
}: {
  source: PayrollSource;
  compact?: boolean;
  className?: string;
}) {
  const c = CONFIG[source];
  const Icon = c.icon;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`${c.className} ${className} inline-flex items-center gap-1 font-normal text-[10px] leading-none px-1.5 py-0.5`}>
            <Icon className="w-3 h-3" />
            {compact ? c.short : c.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {c.tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Honest link to the RazorpayX dashboard when we're showing an aggregate that we can't decompose. */
export function DashboardLink({
  href = "https://x.razorpay.com/payroll",
  children = "View full detail on RazorpayX dashboard",
}: { href?: string; children?: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
    >
      <ExternalLink className="w-3 h-3" />
      {children}
    </a>
  );
}

/** Freshness stamp for the new primary alarm: when was this employee/period last mirrored from RazorpayX. */
export function FreshnessStamp({ lastPulledAt }: { lastPulledAt: string | Date | null | undefined }) {
  if (!lastPulledAt) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-amber-600">
        <AlertTriangle className="w-3 h-3" />
        Never mirrored from RazorpayX
      </span>
    );
  }
  const t = typeof lastPulledAt === "string" ? new Date(lastPulledAt) : lastPulledAt;
  const hours = (Date.now() - t.getTime()) / 3_600_000;
  const stale = hours > 48;
  return (
    <span className={`text-[11px] ${stale ? "text-amber-600" : "text-muted-foreground"}`}>
      Mirrored {hours < 1 ? "just now" : hours < 24 ? `${Math.round(hours)}h ago` : `${Math.round(hours / 24)}d ago`}
      {stale && " • stale"}
    </span>
  );
}
