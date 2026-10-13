import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type AtsAppRow = Tables<"ats_application_overview">;
export type AtsCandidate = Tables<"ats_candidates">;
export type AtsApplication = Tables<"ats_applications">;
export type AtsFile = Tables<"ats_files">;
export type AtsNote = Tables<"ats_notes">;
export type AtsRating = Tables<"ats_ratings">;
export type AtsEventRow = Tables<"ats_events">;

export const candKeys = {
  all: ["ats", "cand"] as const,
  list: (f: CandidateFilters, page: number) => ["ats", "cand", "list", f, page] as const,
  nav: (f: CandidateFilters) => ["ats", "cand", "nav", f] as const,
  generalCount: (status: string) => ["ats", "cand", "general-count", status] as const,
  candidate: (id: string) => ["ats", "cand", "one", id] as const,
  apps: (id: string) => ["ats", "cand", "apps", id] as const,
  files: (id: string) => ["ats", "cand", "files", id] as const,
  notes: (id: string) => ["ats", "cand", "notes", id] as const,
  ratings: (appId: string) => ["ats", "cand", "ratings", appId] as const,
  events: (id: string) => ["ats", "cand", "events", id] as const,
  recent: ["ats", "cand", "recent"] as const,
  any: ["ats", "cand", "any"] as const,
};

export interface CandidateFilters {
  job?: string; // uuid | "general"
  status: "active" | "hired" | "rejected" | "withdrawn" | "all";
  stage?: string;
  source?: string;
  shift?: string;
  applied: "7d" | "30d" | "90d" | "all";
  unreviewed?: boolean;
  idle?: boolean;
  q?: string;
  sort: "newest" | "oldest" | "activity" | "rating" | "name";
}

export const PAGE_SIZE = 50;

export function parseFilters(sp: URLSearchParams): CandidateFilters {
  const st = sp.get("status");
  const ap = sp.get("applied");
  const so = sp.get("sort");
  return {
    job: sp.get("job") || undefined,
    status: (["active", "hired", "rejected", "withdrawn", "all"].includes(st ?? "") ? st : "active") as CandidateFilters["status"],
    stage: sp.get("stage") || undefined,
    source: sp.get("source") || undefined,
    shift: sp.get("shift")?.trim().slice(0, 60) || undefined,
    applied: (["7d", "30d", "90d", "all"].includes(ap ?? "") ? ap : "all") as CandidateFilters["applied"],
    unreviewed: sp.get("unreviewed") === "1",
    idle: sp.get("idle") === "1",
    q: sp.get("q")?.trim() || undefined,
    sort: (["newest", "oldest", "activity", "rating", "name"].includes(so ?? "") ? so : "newest") as CandidateFilters["sort"],
  };
}

export const hasActiveFilters = (f: CandidateFilters) =>
  !!(f.job || f.status !== "active" || f.stage || f.source || f.shift || f.applied !== "all" || f.unreviewed || f.idle || f.q);

/** Strip characters that would break the PostgREST `or` filter grammar. */
const safeQ = (q: string) => q.replace(/[,()*%\\]/g, " ").trim();

function applyFilters(qb: any, f: CandidateFilters, idleDays: number) {
  if (f.job === "general") qb = qb.is("job_id", null);
  else if (f.job) qb = qb.eq("job_id", f.job);
  if (f.status === "active") qb = qb.in("status", ["active", "on_hold"]);
  else if (f.status !== "all") qb = qb.eq("status", f.status);
  if (f.stage) qb = qb.eq("stage_id", f.stage);
  if (f.source) qb = qb.eq("source_id", f.source);
  if (f.shift) qb = qb.contains("preferred_shifts", [f.shift]);
  if (f.applied !== "all") {
    const days = { "7d": 7, "30d": 30, "90d": 90 }[f.applied];
    qb = qb.gte("applied_at", new Date(Date.now() - days * 86400_000).toISOString());
  }
  if (f.unreviewed) qb = qb.eq("status", "active").is("reviewed_at", null);
  if (f.idle) qb = qb.eq("status", "active").gte("days_in_stage", idleDays);
  if (f.q) {
    const s = safeQ(f.q);
    if (s) qb = qb.or(["full_name", "email", "phone", "ref_no"].map((c) => `${c}.ilike.*${s}*`).join(","));
  }
  switch (f.sort) {
    case "oldest": qb = qb.order("applied_at", { ascending: true }); break;
    case "activity": qb = qb.order("updated_at", { ascending: false }); break;
    case "rating": qb = qb.order("rating_avg", { ascending: false, nullsFirst: false }).order("applied_at", { ascending: false }); break;
    case "name": qb = qb.order("full_name", { ascending: true }); break;
    default: qb = qb.order("applied_at", { ascending: false });
  }
  return qb.order("application_id", { ascending: true });
}

export const useCandidateList = (f: CandidateFilters, page: number, idleDays: number, enabled = true) =>
  useQuery({
    queryKey: [...candKeys.list(f, page), idleDays],
    enabled,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      let qb = supabase.from("ats_application_overview").select("*", { count: "exact" });
      qb = applyFilters(qb, f, idleDays);
      const { data, error, count } = await qb.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as AtsAppRow[], count: count ?? 0 };
    },
  });

/** Status-filter count of general (no-job) applications for the rail. */
export const useGeneralCount = (status: CandidateFilters["status"]) =>
  useQuery({
    queryKey: candKeys.generalCount(status),
    queryFn: async () => {
      let qb = supabase.from("ats_applications").select("id", { count: "exact", head: true }).is("job_id", null);
      if (status === "active") qb = qb.in("status", ["active", "on_hold"]);
      else if (status !== "all") qb = qb.eq("status", status);
      const { count, error } = await qb;
      if (error) throw error;
      return count ?? 0;
    },
  });

export const useAnyApplication = () =>
  useQuery({
    queryKey: candKeys.any,
    queryFn: async () => {
      const { count, error } = await supabase.from("ats_applications").select("id", { count: "exact", head: true });
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  });

export const useRecentApplications = () =>
  useQuery({
    queryKey: candKeys.recent,
    queryFn: async () => {
      const { data, error } = await supabase.from("ats_application_overview")
        .select("application_id,candidate_id,full_name,job_title,applied_at,status")
        .order("applied_at", { ascending: false }).limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

export const useCandidate = (id?: string) =>
  useQuery({
    queryKey: candKeys.candidate(id ?? ""),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("ats_candidates").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as AtsCandidate | null;
    },
  });

export const useCandidateApps = (id?: string) =>
  useQuery({
    queryKey: candKeys.apps(id ?? ""),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("ats_application_overview").select("*").eq("candidate_id", id!).order("applied_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AtsAppRow[];
    },
  });

export const useCandidateFiles = (id?: string) =>
  useQuery({
    queryKey: candKeys.files(id ?? ""),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("ats_files")
        .select("id,candidate_id,application_id,kind,file_name,storage_path,mime_type,size_bytes,is_primary,source,uploaded_by_name,created_at")
        .eq("candidate_id", id!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AtsFile[];
    },
  });

export const useCandidateNotes = (id?: string) =>
  useQuery({
    queryKey: candKeys.notes(id ?? ""),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("ats_notes").select("*").eq("candidate_id", id!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AtsNote[];
    },
  });

export const useAppRatings = (appId?: string) =>
  useQuery({
    queryKey: candKeys.ratings(appId ?? ""),
    enabled: !!appId,
    queryFn: async () => {
      const { data, error } = await supabase.from("ats_ratings").select("*").eq("application_id", appId!).order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AtsRating[];
    },
  });

export const useCandidateEvents = (id?: string) =>
  useQuery({
    queryKey: candKeys.events(id ?? ""),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("ats_events").select("*").eq("candidate_id", id!).order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as AtsEventRow[];
    },
  });

export const useMyUserId = () =>
  useQuery({
    queryKey: ["ats", "me"],
    staleTime: Infinity,
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
  });

/* ---------- list context for Prev/Next on the full page ---------- */
const NAV_KEY = "ats.candidate.nav";
export interface NavCtx { items: { candidateId: string; appId: string }[]; from: string }
export function saveNavCtx(ctx: NavCtx) {
  try { sessionStorage.setItem(NAV_KEY, JSON.stringify(ctx)); } catch { /* ignore */ }
}
export function loadNavCtx(): NavCtx | null {
  try { const v = sessionStorage.getItem(NAV_KEY); return v ? (JSON.parse(v) as NavCtx) : null; } catch { return null; }
}

export const candidateHref = (r: { candidate_id: string | null; application_id: string | null }) =>
  `/hrms/ats/candidates/${r.candidate_id}?app=${r.application_id}`;

/** Fetch rows matching filters in pages of 500 (for select-all / export / board). */
export async function fetchMatchingRows(
  f: CandidateFilters, idleDays: number, limit: number, onProgress?: (n: number, total: number) => void, select = "*",
): Promise<{ rows: AtsAppRow[]; total: number }> {
  const out: AtsAppRow[] = [];
  let total = 0;
  for (let from = 0; from < limit; from += 500) {
    let qb = supabase.from("ats_application_overview").select(select, { count: from === 0 ? "exact" : undefined });
    qb = applyFilters(qb, f, idleDays);
    const { data, error, count } = await qb.range(from, Math.min(limit, from + 500) - 1);
    if (error) throw error;
    if (from === 0) total = count ?? 0;
    out.push(...((data ?? []) as unknown as AtsAppRow[]));
    onProgress?.(out.length, Math.min(total, limit));
    if (!data || data.length < 500 || out.length >= total) break;
  }
  return { rows: out, total };
}

/** Board: active/on-hold (+ hired optional) applications for one job, up to 500. */
export const useBoardRows = (jobId: string | undefined, showHired: boolean) =>
  useQuery({
    queryKey: ["ats", "cand", "board", jobId ?? "", showHired],
    enabled: !!jobId,
    queryFn: async () => {
      const statuses = showHired ? ["active", "on_hold", "hired"] : ["active", "on_hold"];
      let qb = supabase.from("ats_application_overview").select("*", { count: "exact" }).in("status", statuses);
      qb = jobId === "general" ? qb.is("job_id", null) : qb.eq("job_id", jobId!);
      const { data, error, count } = await qb.order("stage_entered_at", { ascending: true }).order("application_id").range(0, 499);
      if (error) throw error;
      const headCount = async (status: string) => {
        let cq = supabase.from("ats_applications").select("id", { count: "exact", head: true }).eq("status", status);
        cq = jobId === "general" ? cq.is("job_id", null) : cq.eq("job_id", jobId!);
        const r = await cq;
        if (r.error) throw r.error;
        return r.count ?? 0;
      };
      const [rejected, withdrawn] = await Promise.all([headCount("rejected"), headCount("withdrawn")]);
      return { rows: (data ?? []) as AtsAppRow[], total: count ?? 0, rejected, withdrawn };
    },
  });

/** Distinct preferred shifts candidates picked for one job (for the shift filter). */
export const useJobPreferredShifts = (jobId?: string) =>
  useQuery({
    queryKey: ["ats", "cand", "job-shifts", jobId ?? ""],
    enabled: !!jobId && jobId !== "general",
    queryFn: async () => {
      const { data, error } = await (supabase.from("ats_applications") as any)
        .select("preferred_shifts").eq("job_id", jobId!).not("preferred_shifts", "is", null).limit(1000);
      if (error) throw error;
      const set = new Set<string>();
      for (const r of (data ?? []) as { preferred_shifts: string[] | null }[]) for (const s of r.preferred_shifts ?? []) set.add(s);
      return [...set].sort((a, b) => a.localeCompare(b));
    },
  });
