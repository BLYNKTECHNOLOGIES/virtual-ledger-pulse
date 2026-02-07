
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusStyles: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  approved: "bg-emerald-100 text-emerald-700",
  hired: "bg-emerald-100 text-emerald-700",
  completed: "bg-emerald-100 text-emerald-700",
  resolved: "bg-emerald-100 text-emerald-700",
  paid: "bg-emerald-100 text-emerald-700",
  confirmed: "bg-emerald-100 text-emerald-700",
  healthy: "bg-emerald-100 text-emerald-700",

  pending: "bg-amber-100 text-amber-700",
  requested: "bg-amber-100 text-amber-700",
  review_ongoing: "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700",
  tracking: "bg-blue-100 text-blue-700",
  on_track: "bg-blue-100 text-blue-700",
  new: "bg-blue-100 text-blue-700",
  draft: "bg-gray-100 text-gray-600",
  not_started: "bg-gray-100 text-gray-600",

  inactive: "bg-red-100 text-red-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-red-100 text-red-700",
  canceled: "bg-red-100 text-red-700",
  terminated: "bg-red-100 text-red-700",
  behind: "bg-red-100 text-red-700",
  at_risk: "bg-orange-100 text-orange-700",
  on_hold: "bg-purple-100 text-purple-700",
  warning: "bg-yellow-100 text-yellow-700",
  suspension: "bg-orange-100 text-orange-700",
  dismissal: "bg-red-100 text-red-700",
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const key = status.toLowerCase().replace(/\s+/g, "_");
  const style = statusStyles[key] || "bg-gray-100 text-gray-600";
  const label = status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", style, className)}>
      {label}
    </span>
  );
}
