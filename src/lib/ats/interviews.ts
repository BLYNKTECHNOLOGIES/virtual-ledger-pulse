import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { AtsEmailTemplate } from "./mail";
import { fmtRelative, todayIST } from "./format";

export type AtsInterview = Tables<"ats_interviews">;
export type AtsPanelMember = Tables<"ats_interview_panel">;
export type InterviewRow = AtsInterview & { ats_interview_panel: AtsPanelMember[] };
export type IvMode = "in_person" | "video" | "phone";

/** Who an interview is with. Built from a candidate-page row now, and from an Interviews-list row later. */
export interface IvTarget {
  applicationId: string; candidateId: string; fullName: string; email: string | null; phone: string | null;
  refNo: string | null; jobTitle: string | null; // job title, else the "applied for" text, else null
}

export const ivKeys = {
  all: ["ats", "iv"] as const,
  app: (appId: string) => ["ats", "iv", "app", appId] as const,
  target: (appId: string) => ["ats", "iv", "target", appId] as const,
  contacts: (ids: string) => ["ats", "iv", "contacts", ids] as const,
  emails: (interviewId: string) => ["ats", "iv", "emails", interviewId] as const,
  me: ["ats", "iv", "me-employee"] as const,
};

export const COMPANY_NAME = "Blynk Virtual Technologies";
export const IV_MODES = [
  { value: "in_person", label: "In person" }, { value: "video", label: "Video call" }, { value: "phone", label: "Phone call" },
] as const;
export const modeLabel = (m: string) => IV_MODES.find((x) => x.value === m)?.label ?? "Interview";
export const RECOMMENDATIONS = [
  { value: "strong_yes", label: "Strong yes" }, { value: "yes", label: "Yes" },
  { value: "no", label: "No" }, { value: "strong_no", label: "Strong no" },
] as const;
export const recLabel = (r?: string | null) => RECOMMENDATIONS.find((x) => x.value === r)?.label ?? null;
export const ROUND_SUGGESTIONS = ["HR round", "Technical round", "Manager round", "Final round"];
export const DURATIONS = [15, 30, 45, 60, 90, 120];

const TZ = "Asia/Kolkata";
const partsOf = (d: Date) => Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
}).formatToParts(d).map((p) => [p.type, p.value])) as Record<string, string>;

/** "Wednesday, 21 October 2026" (the same text the server puts in emails). */
export const ivDateText = (d: Date) => { const p = partsOf(d); return `${p.weekday}, ${p.day} ${p.month} ${p.year}`; };
/** "11:30 AM IST" */
export const ivTimeText = (d: Date) => { const p = partsOf(d); return `${p.hour}:${p.minute} ${String(p.dayPeriod ?? "").toUpperCase()} IST`; };
/** "11:30 AM" */
export const ivClock = (d: Date) => ivTimeText(d).replace(/ IST$/, "");
/** "30 minutes", "1 hour", "1 hour 30 minutes", "2 hours" */
export function durationText(m: number): string {
  if (m < 60) return `${m} minutes`;
  const h = Math.floor(m / 60), rest = m % 60;
  const hours = `${h} ${h === 1 ? "hour" : "hours"}`;
  return rest ? `${hours} ${rest} minutes` : hours;
}
/** Date and time inputs (IST) for a moment. */
export function istInputs(v: string | Date): { date: string; time: string } {
  const d = new Date(v);
  return {
    date: new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d),
    time: new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d),
  };
}
/** IST date ("YYYY-MM-DD") and time ("HH:MM") inputs to an ISO string. */
export const istToIso = (date: string, time: string) => `${date}T${time}:00+05:30`;
export const minutesBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
/** "Today", "Tomorrow" or "Wed 21 Oct" */
export function ivDayLabel(v: string): string {
  const day = istInputs(v).date;
  const today = todayIST();
  const tomorrow = istInputs(new Date(new Date(`${today}T12:00:00+05:30`).getTime() + 86_400_000)).date;
  if (day === today) return "Today";
  if (day === tomorrow) return "Tomorrow";
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(new Date(v)).replace(",", "");
}
/** "in 5 min", "in 3 h", "in 2 days"; past moments use fmtRelative. */
export function fmtUntil(v: string): string {
  const m = Math.round((new Date(v).getTime() - Date.now()) / 60000);
  if (m <= 0) return fmtRelative(v);
  if (m < 60) return `in ${m} ${m === 1 ? "minute" : "minutes"}`;
  if (m < 24 * 60) return `in ${Math.round(m / 60)} ${Math.round(m / 60) === 1 ? "hour" : "hours"}`;
  const d = Math.round(m / 1440);
  return `in ${d} ${d === 1 ? "day" : "days"}`;
}
/** "Wed 21 Oct 2026 · 11:30 AM – 12:00 PM IST" */
export function ivWhen(iv: Pick<AtsInterview, "starts_at" | "ends_at">): string {
  const s = new Date(iv.starts_at), e = new Date(iv.ends_at);
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(s).replace(",", "");
  return `${day} · ${ivClock(s)} – ${ivClock(e)} IST`;
}

export interface IvFillInput {
  fullName: string; refNo: string | null; jobTitle: string | null; phone: string | null;
  title: string; mode: IvMode; startsAt: string; minutes: number;
  location: string | null; meetingUrl: string | null; candidateNote: string | null;
}
/** The values the server uses for the placeholders. */
export function interviewValues(v: IvFillInput): Record<string, string> {
  const start = new Date(v.startsAt);
  return {
    first_name: v.fullName.trim().split(/\s+/)[0] ?? "",
    full_name: v.fullName.trim(),
    job_title: v.jobTitle?.trim() || "a role",
    company_name: COMPANY_NAME,
    ref_no: v.refNo ?? "",
    interview_title: v.title.trim() || "Interview",
    interview_date: ivDateText(start),
    interview_time: ivTimeText(start),
    interview_duration: durationText(v.minutes),
    interview_mode: modeLabel(v.mode),
    interview_where: v.mode === "in_person" ? `Venue: ${v.location ?? ""}`
      : v.mode === "video" ? `Video call: ${v.meetingUrl ?? ""}`
      : `Phone call: we will call you on ${v.phone?.trim() || "the number you shared with us"}`,
    interview_note: v.candidateNote?.trim() ?? "",
  };
}
/** Fills placeholders the way the server does. Unknown ones are left in place. */
export function fillInterviewText(subject: string, body: string, vals: Record<string, string>) {
  const fill = (s: string) => s.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in vals ? vals[k] : m));
  const b = fill(body).replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { subject: fill(subject).replace(/\s+/g, " ").trim(), body: b };
}
/**
 * Server placeholder values (ats_template_values for the application) with the interview_* keys from the form,
 * because the interview may not be saved yet. Falls back to the local values while the server values load.
 */
export function withServerValues(local: Record<string, string>, server?: Record<string, string> | null) {
  if (!server) return local;
  const ivOnly = Object.fromEntries(Object.entries(local).filter(([k]) => k.startsWith("interview_")));
  return { ...local, ...server, ...ivOnly };
}
export const leftoverPlaceholders = (s: string) => Array.from(new Set(s.match(/\{\{\s*[\w.]+\s*\}\}/g) ?? []));

export type IvState = "upcoming" | "now" | "awaiting" | "completed" | "no_show" | "cancelled";
export function ivState(iv: Pick<AtsInterview, "status" | "starts_at" | "ends_at">, now = Date.now()): IvState {
  if (iv.status === "cancelled" || iv.status === "completed" || iv.status === "no_show") return iv.status;
  const s = new Date(iv.starts_at).getTime(), e = new Date(iv.ends_at).getTime();
  return now >= e ? "awaiting" : now >= s ? "now" : "upcoming";
}
export const activePanel = (iv: InterviewRow) => (iv.ats_interview_panel ?? []).filter((m) => !m.removed_at);
export const missingFeedback = (iv: InterviewRow) => activePanel(iv).filter((m) => !m.feedback_at);
export type InviteState = "sent" | "outdated" | "failed" | "no_email" | "none";
export function inviteState(m: AtsPanelMember, iv: Pick<AtsInterview, "revision">): InviteState {
  if (m.invite_status === "sent") return m.invited_revision === iv.revision ? "sent" : "outdated";
  if (m.invite_status === "failed") return "failed";
  if (m.invite_status === "no_email" || !m.email) return "no_email";
  return "none";
}
/** Who "Send invitations" would reach: active members without the latest invite, and removed members to cancel. */
export function pendingInvites(iv: InterviewRow) {
  const all = iv.ats_interview_panel ?? [];
  return {
    invite: all.filter((m) => !m.removed_at && !!m.email && inviteState(m, iv) !== "sent"),
    cancel: all.filter((m) => !!m.removed_at && m.invite_status === "sent" && !m.cancel_sent_at),
  };
}

const NOT_FOR_SCHEDULING = ["interview-invitation", "interview-reminder", "interview-cancelled", "interview-confirmed"];
const NOT_FOR_CANCELLING = ["interview-invitation", "interview-reminder", "interview-scheduled", "interview-rescheduled", "interview-confirmed"];
/** Templates offered when scheduling or changing an interview (built-in ones first). */
export const scheduleTemplates = (all: AtsEmailTemplate[]) =>
  all.filter((t) => t.purpose === "interview" && !NOT_FOR_SCHEDULING.includes(t.code));
/** Templates offered when cancelling an interview. */
export const cancelTemplates = (all: AtsEmailTemplate[]) =>
  all.filter((t) => t.purpose === "interview" && !NOT_FOR_CANCELLING.includes(t.code));

/* ---------- hooks ---------- */
export const useAppInterviews = (appId?: string | null) =>
  useQuery({
    queryKey: ivKeys.app(appId ?? ""),
    enabled: !!appId,
    queryFn: async () => {
      const { data, error } = await supabase.from("ats_interviews").select("*, ats_interview_panel(*)")
        .eq("application_id", appId!).order("starts_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as InterviewRow[];
    },
  });

export interface IvTargetInfo { status: string | null; stage_id: string | null; stage_order: number | null; stage_kind: string | null; has_resume: boolean | null }
export const useIvTargetInfo = (appId?: string | null) =>
  useQuery({
    queryKey: ivKeys.target(appId ?? ""),
    enabled: !!appId,
    queryFn: async () => {
      const { data, error } = await supabase.from("ats_application_overview")
        .select("status, stage_id, stage_order, stage_kind, has_resume").eq("application_id", appId!).maybeSingle();
      if (error) throw error;
      return (data ?? null) as IvTargetInfo | null;
    },
  });

export interface EmployeeContact { employee_id: string; name: string; email: string | null; user_id: string | null; is_active: boolean }
export const useEmployeeContacts = (ids: string[]) => {
  const key = [...ids].sort().join(",");
  return useQuery({
    queryKey: ivKeys.contacts(key),
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ats_employee_contacts", { p_ids: ids });
      if (error) throw error;
      return (data ?? []) as unknown as EmployeeContact[];
    },
  });
};

export const useMyEmployee = () =>
  useQuery({
    queryKey: ivKeys.me,
    staleTime: Infinity,
    queryFn: async () => {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid) return null;
      const { data, error } = await supabase.from("hr_employees").select("id, first_name, last_name")
        .eq("user_id", uid).eq("is_active", true).limit(1).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { id: data.id as string, label: [data.first_name, data.last_name].filter(Boolean).join(" ") || "Me" };
    },
  });

export interface InterviewEmail { id: string; status: string; calendar_revision: number | null; template_code: string | null; created_at: string }
export const useInterviewEmails = (interviewId?: string | null) =>
  useQuery({
    queryKey: ivKeys.emails(interviewId ?? ""),
    enabled: !!interviewId,
    queryFn: async () => {
      const { data, error } = await supabase.from("ats_messages").select("id,status,calendar_revision,template_code,created_at")
        .eq("interview_id", interviewId!).eq("direction", "outbound").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InterviewEmail[];
    },
  });

/* ---------- actions ---------- */
export interface SaveInterviewInput {
  id?: string | null; application_id: string; title: string; mode: IvMode; starts_at: string; duration_minutes: number;
  location: string | null; meeting_url: string | null; candidate_note: string | null; internal_note: string | null;
  panel: string[]; move_to_interview_stage: boolean;
}
export interface SaveInterviewResult {
  id: string; application_id: string; candidate_id: string; revision: number; status: string;
  time_changed: boolean; added: string[]; removed: string[]; stage_moved: boolean;
}
export async function saveInterview(p: SaveInterviewInput): Promise<SaveInterviewResult> {
  const { data, error } = await supabase.rpc("ats_save_interview", { p: p as any });
  if (error) throw error;
  return data as unknown as SaveInterviewResult;
}
export async function cancelInterview(id: string, reason: string | null) {
  const { data, error } = await supabase.rpc("ats_cancel_interview", { p_interview_id: id, p_reason: reason as any });
  if (error) throw error;
  return data as unknown as { id: string; revision: number; status: string };
}
export async function setInterviewStatus(id: string, status: "completed" | "no_show" | "scheduled") {
  const { data, error } = await supabase.rpc("ats_set_interview_status", { p_interview_id: id, p_status: status });
  if (error) throw error;
  return data as unknown as { id: string; status: string; revision: number };
}
export async function saveInterviewFeedback(panelId: string, recommendation: string | null, score: number | null, feedback: string | null) {
  const { data, error } = await supabase.rpc("ats_save_interview_feedback", {
    p_panel_id: panelId, p_recommendation: recommendation as any, p_score: score as any, p_feedback: feedback as any,
  });
  if (error) throw error;
  return data as unknown as { id: string; feedback_at: string | null };
}

/** Scheduled interviews that overlap the time, as sentences. */
export async function findConflicts(a: { startsAt: string; endsAt: string; candidateId: string; employeeIds: string[]; excludeId?: string | null }): Promise<string[]> {
  let q = supabase.from("ats_interviews")
    .select("id,title,starts_at,ends_at,candidate_id,ats_candidates(full_name),ats_interview_panel(employee_id,name,removed_at)")
    .eq("status", "scheduled").lt("starts_at", a.endsAt).gt("ends_at", a.startsAt).limit(50);
  if (a.excludeId) q = q.neq("id", a.excludeId);
  const { data, error } = await q;
  if (error) throw error;
  const out: string[] = [];
  for (const r of (data ?? []) as any[]) {
    const span = `${ivClock(new Date(r.starts_at))}–${ivClock(new Date(r.ends_at))}`;
    if (r.candidate_id === a.candidateId) out.push(`This candidate already has "${r.title}" at ${span}.`);
    const who = r.ats_candidates?.full_name ?? "another candidate";
    for (const m of (r.ats_interview_panel ?? []) as any[]) {
      if (!m.removed_at && m.employee_id && a.employeeIds.includes(m.employee_id)) out.push(`${m.name} is interviewing ${who} at ${span}.`);
    }
  }
  return out;
}

/* ---------- Interviews tab ---------- */
export type IvView = "upcoming" | "today" | "action" | "past" | "cancelled";
export type InterviewListRow = InterviewRow & {
  ats_candidates: { full_name: string | null; ref_no: string | null; email: string | null; phone: string | null } | null;
  ats_applications: { id: string; status: string; position_text: string | null; ats_jobs: { id: string; title: string } | null } | null;
};
const LIST_SELECT = "*, ats_interview_panel(*), ats_candidates(full_name,ref_no,email,phone), ats_applications(id,status,position_text,ats_jobs(id,title))";
const todayRange = () => {
  const start = new Date(istToIso(todayIST(), "00:00"));
  return { start: start.toISOString(), end: new Date(start.getTime() + 86_400_000).toISOString() };
};
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

export const useInterviewList = (view: IvView) =>
  useQuery({
    queryKey: ["ats", "iv", "list", view],
    refetchInterval: 60_000,
    queryFn: async () => {
      const now = new Date().toISOString();
      let q = supabase.from("ats_interviews").select(LIST_SELECT);
      if (view === "upcoming") q = q.eq("status", "scheduled").gte("ends_at", now).order("starts_at", { ascending: true });
      else if (view === "today") { const t = todayRange(); q = q.gte("starts_at", t.start).lt("starts_at", t.end).neq("status", "cancelled").order("starts_at", { ascending: true }); }
      else if (view === "action") q = q.or(`and(status.eq.scheduled,ends_at.lt.${now}),and(status.eq.completed,starts_at.gte.${daysAgo(60)})`).order("starts_at", { ascending: false });
      else if (view === "past") q = q.in("status", ["completed", "no_show"]).gte("starts_at", daysAgo(90)).order("starts_at", { ascending: false });
      else q = q.eq("status", "cancelled").gte("starts_at", daysAgo(90)).order("starts_at", { ascending: false });
      const { data, error } = await q.limit(500);
      if (error) throw error;
      let rows = (data ?? []) as unknown as InterviewListRow[];
      if (view === "action") {
        const t = Date.now();
        rows = rows.filter((r) => (r.status === "scheduled" && new Date(r.ends_at).getTime() < t) || (r.status === "completed" && missingFeedback(r).length > 0));
      }
      return rows;
    },
  });

export const useInterviewCounts = () =>
  useQuery({
    queryKey: ["ats", "iv", "counts"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const now = new Date().toISOString();
      const t = todayRange();
      const [a, b, c] = await Promise.all([
        supabase.from("ats_interviews").select("id", { count: "exact", head: true }).gte("starts_at", t.start).lt("starts_at", t.end).neq("status", "cancelled"),
        supabase.from("ats_interviews").select("id", { count: "exact", head: true }).eq("status", "scheduled").lt("ends_at", now),
        supabase.from("ats_interviews").select("id, ats_interview_panel(removed_at,feedback_at)").eq("status", "completed").gte("starts_at", daysAgo(60)).limit(500),
      ]);
      for (const r of [a, b, c]) if (r.error) throw r.error;
      const missing = ((c.data ?? []) as any[]).filter((r) => (r.ats_interview_panel ?? []).some((m: any) => !m.removed_at && !m.feedback_at)).length;
      return { today: a.count ?? 0, action: (b.count ?? 0) + missing };
    },
  });

/** IvTarget for an Interviews-tab row. */
export const listRowTarget = (r: InterviewListRow): IvTarget => ({
  applicationId: r.application_id, candidateId: r.candidate_id,
  fullName: r.ats_candidates?.full_name ?? "", email: r.ats_candidates?.email ?? null, phone: r.ats_candidates?.phone ?? null,
  refNo: r.ats_candidates?.ref_no ?? null,
  jobTitle: r.ats_applications?.ats_jobs?.title ?? r.ats_applications?.position_text ?? null,
});
