import { supabase } from "@/integrations/supabase/client";

/**
 * HRMS Request Registry
 * ---------------------
 * Single place that knows about every kind of request that lands in HRMS.
 * The unified Requests inbox (/hrms/requests) reads ONLY through this registry,
 * so adding a future request type (e.g. asset request, document request) means
 * adding one adapter here — no page changes.
 *
 * Ground truth stays in each source table (hr_leave_requests,
 * hr_attendance_regularization_requests, ...), so the dedicated pages and this
 * inbox are always in sync by construction — no mirror table, no copies.
 */

export type RequestStage =
  | "awaiting_manager"
  | "awaiting_hr"
  | "awaiting_payroll"
  | "approved"
  | "rejected"
  | "cancelled"
  | "other";

export interface UnifiedRequest {
  /** `${type}:${id}` — unique across sources */
  key: string;
  id: string;
  type: string;
  typeLabel: string;
  employeeId: string | null;
  employeeName: string;
  badgeId: string | null;
  /** Human summary of what is being asked (leave type + dates, attendance date, ...) */
  subject: string;
  detail: string | null;
  /** ISO date the request concerns (start date / attendance date) */
  periodFrom: string | null;
  periodTo: string | null;
  rawStatus: string;
  stage: RequestStage;
  statusLabel: string;
  createdAt: string;
  updatedAt: string | null;
  /** Deep link to the dedicated page that owns approve/reject actions */
  sourcePath: string;
  sourceLabel: string;
  raw: any;
}

export const STAGE_LABEL: Record<RequestStage, string> = {
  awaiting_manager: "Awaiting manager",
  awaiting_hr: "Awaiting HR",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  other: "In progress",
};

const employeeName = (e: any) =>
  `${e?.first_name || ""} ${e?.last_name || ""}`.trim() || "Unknown employee";

/* ------------------------------ Leave ------------------------------ */

function leaveStage(status: string): RequestStage {
  switch (status) {
    case "requested":
    case "pending":
      return "awaiting_manager";
    case "manager_approved":
      return "awaiting_hr";
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "cancelled":
    case "withdrawn":
      return "cancelled";
    default:
      return "other";
  }
}

async function fetchLeave(): Promise<UnifiedRequest[]> {
  const { data, error } = await (supabase as any)
    .from("hr_leave_requests")
    .select(
      "*, hr_employees!hr_leave_requests_employee_id_fkey(badge_id, first_name, last_name, email), hr_leave_types!hr_leave_requests_leave_type_id_fkey(name, color)",
    )
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;

  return ((data as any[]) || []).map((r) => {
    const stage = leaveStage(r.status);
    const days = r.is_half_day ? 0.5 : Number(r.total_days || 0);
    return {
      key: `leave:${r.id}`,
      id: r.id,
      type: "leave",
      typeLabel: "Leave",
      employeeId: r.employee_id,
      employeeName: employeeName(r.hr_employees),
      badgeId: r.hr_employees?.badge_id || null,
      subject: `${r.hr_leave_types?.name || "Leave (type pending)"} · ${days} day${days === 1 ? "" : "s"}`,
      detail: r.reason || null,
      periodFrom: r.start_date || null,
      periodTo: r.end_date || null,
      rawStatus: r.status,
      stage,
      statusLabel: STAGE_LABEL[stage],
      createdAt: r.created_at,
      updatedAt: r.updated_at || null,
      sourcePath: "/hrms/leave/requests",
      sourceLabel: "Leave Requests",
      raw: r,
    } as UnifiedRequest;
  });
}

/* ------------------------ Regularization ------------------------ */

function regStage(r: any): RequestStage {
  switch (r.status) {
    case "pending":
      return "awaiting_hr";
    case "manager_review":
      return "awaiting_manager";
    case "manager_reviewed":
      return "awaiting_hr";
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "cancelled":
      return "cancelled";
    default:
      return "other";
  }
}

async function fetchRegularization(): Promise<UnifiedRequest[]> {
  const { data, error } = await (supabase as any)
    .from("hr_attendance_regularization_requests")
    .select(
      "*, hr_employees!hr_attendance_regularization_requests_employee_id_fkey(badge_id, first_name, last_name, email)",
    )
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;

  return ((data as any[]) || []).map((r) => {
    const stage = regStage(r);
    const times = [r.requested_check_in, r.requested_check_out]
      .filter(Boolean)
      .map((t: string) => String(t).slice(11, 16))
      .join(" → ");
    return {
      key: `regularization:${r.id}`,
      id: r.id,
      type: "regularization",
      typeLabel: "Attendance regularization",
      employeeId: r.employee_id,
      employeeName: employeeName(r.hr_employees),
      badgeId: r.hr_employees?.badge_id || null,
      subject: `Attendance ${r.attendance_date}${times ? ` · ${times}` : ""}`,
      detail: r.reason || null,
      periodFrom: r.attendance_date || null,
      periodTo: r.attendance_date || null,
      rawStatus: r.status,
      stage,
      statusLabel: STAGE_LABEL[stage],
      createdAt: r.created_at,
      updatedAt: r.updated_at || null,
      sourcePath: "/hrms/attendance/regularization",
      sourceLabel: "Regularization Requests",
      raw: r,
    } as UnifiedRequest;
  });
}

/* ------------------------------ Registry ------------------------------ */

export interface RequestSource {
  type: string;
  label: string;
  fetch: () => Promise<UnifiedRequest[]>;
}

export const REQUEST_SOURCES: RequestSource[] = [
  { type: "leave", label: "Leave", fetch: fetchLeave },
  { type: "regularization", label: "Attendance regularization", fetch: fetchRegularization },
];

export async function fetchAllRequests(): Promise<UnifiedRequest[]> {
  const results = await Promise.all(
    REQUEST_SOURCES.map((s) => s.fetch().catch(() => [] as UnifiedRequest[])),
  );
  return results
    .flat()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Maps an HR notification (type + link) onto the unified inbox.
 * Returns `null` when the notification isn't request-related.
 */
export function requestDeepLinkFromNotification(n: any): string | null {
  const type: string = String(n?.notification_type || n?.type || "");
  const link: string = String(n?.link || "");

  let kind: string | null = null;
  if (type.includes("regulariz")) kind = "regularization";
  else if (type.includes("leave")) kind = "leave";
  if (!kind) return null;

  // Pull any request id the emitter attached (leaveId / requestId / id).
  let id: string | null = null;
  const qs = link.split("?")[1];
  if (qs) {
    const params = new URLSearchParams(qs);
    id = params.get("leaveId") || params.get("requestId") || params.get("id");
  }

  return `/hrms/requests?type=${kind}${id ? `&id=${id}` : ""}`;
}
