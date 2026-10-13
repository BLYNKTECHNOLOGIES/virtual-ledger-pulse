import { StatusPill, type PillTone } from "@/components/hrms/primitives";

/** One label and colour per leave status, used on every leave screen. Display only. */
export const LEAVE_STATUS: Record<string, { label: string; tone: PillTone }> = {
  requested: { label: "Awaiting manager", tone: "amber" },
  manager_approved: { label: "Awaiting HR", tone: "info" },
  approved: { label: "Approved", tone: "emerald" },
  rejected: { label: "Rejected", tone: "destructive" },
  cancelled: { label: "Cancelled", tone: "default" },
};

export function leaveStatusLabel(status?: string | null): string {
  const s = status || "requested";
  return LEAVE_STATUS[s]?.label ?? s.replace(/_/g, " ");
}

export function LeaveStatusPill({ status }: { status?: string | null }) {
  return <StatusPill tone={LEAVE_STATUS[status || "requested"]?.tone ?? "default"}>{leaveStatusLabel(status)}</StatusPill>;
}
