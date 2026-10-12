// ATS reports: the report query, date ranges, display helpers and the Excel download.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { todayIST } from "./format";

/** Filters as kept in the URL. job: "" (all) | job id | "general"; source: "" (all) | source id. Dates are IST. */
export interface ReportParams { from: string; to: string; job: string; source: string }

export interface AtsReport {
  range: { from: string; to: string; bucket: "week" | "month"; time_zone: string };
  generated_at: string;
  idle_days: number;
  summary: {
    applications: number; reviewed: number; reached_interview: number; hired: number; rejected: number; withdrawn: number;
    open: number; median_days_to_hire: number | null; median_hours_to_review: number | null; hires_in_period: number;
  };
  funnel: { stage_id: string; code: string; name: string; kind: string; sort_order: number; reached: number }[];
  sources: {
    source_id: string | null; name: string; applications: number; reviewed: number; reached_interview: number;
    hired: number; rejected: number;
  }[];
  jobs: { job_id: string | null; title: string; applications: number; reached_interview: number; hired: number; median_days_to_hire: number | null }[];
  reasons: { reason_id: string | null; label: string; status: "rejected" | "withdrawn"; count: number }[];
  interviews: {
    total: number; upcoming: number; awaiting_update: number; completed: number; no_show: number; cancelled: number;
    feedback_missing: number; by_mode: { in_person: number; video: number; phone: number };
  };
  waiting: {
    stage_id: string; name: string; kind: string; sort_order: number; open: number; on_hold: number;
    median_days: number | null; over_idle: number;
  }[];
  trend: { bucket: string; applications: number; hires: number }[];
  team: {
    user_id: string; name: string | null; moved: number; rejected: number; hired: number; notes: number;
    emails_sent: number; interviews_scheduled: number;
  }[];
}

export const reportKeys = {
  all: ["ats", "report"] as const,
  report: (p: ReportParams) => ["ats", "report", p.from, p.to, p.job, p.source] as const,
};

export const useAtsReport = (p: ReportParams) =>
  useQuery({
    queryKey: reportKeys.report(p),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ats_report", {
        p: { from: p.from, to: p.to, job_id: p.job || null, source_id: p.source || null } as any,
      });
      if (error) throw error;
      return data as unknown as AtsReport;
    },
  });

// ---------------------------------------------------------------- date ranges (IST, "YYYY-MM-DD")

export const RANGE_PRESETS = [
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "6m", label: "Last 6 months" },
  { value: "12m", label: "Last 12 months" },
  { value: "month", label: "This month" },
  { value: "lastmonth", label: "Last month" },
  { value: "custom", label: "Custom dates" },
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number]["value"];
export const MAX_RANGE_DAYS = 731;

const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
export const isYmd = (s: unknown): s is string =>
  typeof s === "string" && ymdRe.test(s) && !isNaN(new Date(`${s}T00:00:00Z`).getTime()) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** A date plus n days ("2026-10-12", -29 → "2026-09-13"). */
export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Days from one date to another (inclusive of both ends minus one: same day → 0). */
export const daysBetween = (from: string, to: string) =>
  Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);

/** The from/to dates of a preset, ending today (IST). "custom" returns the last 30 days as a starting point. */
export function presetRange(preset: RangePreset, today: string = todayIST()): { from: string; to: string } {
  switch (preset) {
    case "90d": return { from: addDays(today, -89), to: today };
    case "6m": return { from: addDays(today, -181), to: today };
    case "12m": return { from: addDays(today, -364), to: today };
    case "month": return { from: `${today.slice(0, 8)}01`, to: today };
    case "lastmonth": {
      const firstThis = `${today.slice(0, 8)}01`;
      const lastPrev = addDays(firstThis, -1);
      return { from: `${lastPrev.slice(0, 8)}01`, to: lastPrev };
    }
    default: return { from: addDays(today, -29), to: today };
  }
}

/** The preset a from/to pair matches (for highlighting the picker), or "custom". */
export function matchPreset(from: string, to: string, today: string = todayIST()): RangePreset {
  for (const p of RANGE_PRESETS) {
    if (p.value === "custom") continue;
    const r = presetRange(p.value, today);
    if (r.from === from && r.to === to) return p.value;
  }
  return "custom";
}

/** Report filters from the URL (?from=&to=&job=&source=), falling back to the last 30 days. */
export function paramsFromSearch(sp: URLSearchParams, today: string = todayIST()): ReportParams {
  let from = sp.get("from") ?? "";
  let to = sp.get("to") ?? "";
  if (!isYmd(from) || !isYmd(to) || to < from || daysBetween(from, to) > MAX_RANGE_DAYS) ({ from, to } = presetRange("30d", today));
  return { from, to, job: sp.get("job") ?? "", source: sp.get("source") ?? "" };
}

// ---------------------------------------------------------------- display helpers

/** "42%" of a part of a whole, or "—" when the whole is 0. */
export const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");

/** "20 days", "1 day", "—". */
export const fmtDays = (v: number | null | undefined) => (v == null ? "—" : `${v} ${v === 1 ? "day" : "days"}`);

/** Hours under two days as hours ("7.5 h"), longer as days ("3.2 days"). */
export const fmtHours = (v: number | null | undefined) =>
  v == null ? "—" : v < 48 ? `${v} h` : fmtDays(Math.round((v / 24) * 10) / 10);

/** Chart label of a trend bucket: a week's Monday ("12 Oct") or a month ("Oct 2026"). */
export function bucketLabel(bucket: string, kind: "week" | "month"): string {
  const d = new Date(`${bucket}T00:00:00Z`);
  return kind === "week"
    ? d.toLocaleDateString("en-IN", { timeZone: "UTC", day: "numeric", month: "short" })
    : d.toLocaleDateString("en-IN", { timeZone: "UTC", month: "short", year: "numeric" });
}

/** Funnel stages with their share of all applications and of the stage before. */
export function funnelRows(r: Pick<AtsReport, "funnel" | "summary">) {
  const total = r.summary.applications;
  return r.funnel.map((f, i, all) => ({
    ...f,
    ofTotal: total > 0 ? f.reached / total : null,
    ofPrevious: i === 0 ? null : all[i - 1].reached > 0 ? f.reached / all[i - 1].reached : null,
  }));
}

// ---------------------------------------------------------------- Excel

type Col = { header: string; width: number; fmt?: string };

/** The whole report as an Excel workbook, one sheet per section, plus the filters used. */
export async function buildReportWorkbook(r: AtsReport, filters: { job: string; source: string }) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const sheet = (name: string, cols: Col[], rows: unknown[][], percentRows: string[] = []) => {
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = cols.map((c) => ({ header: c.header, width: c.width, style: c.fmt ? { numFmt: c.fmt } : undefined }));
    ws.getRow(1).font = { bold: true };
    for (const row of rows) {
      const added = ws.addRow(row.map((v) => (v === undefined ? null : v)));
      if (percentRows.includes(String(row[0]))) added.getCell(2).numFmt = "0%";
    }
  };
  const s = r.summary;
  const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
  sheet("Summary", [{ header: "Measure", width: 40 }, { header: "Value", width: 18 }], [
    ["Period (IST)", `${r.range.from} to ${r.range.to}`],
    ["Job", filters.job || "All jobs"],
    ["Source", filters.source || "All sources"],
    ["Applications (applied in the period)", s.applications],
    ["Reviewed", s.reviewed],
    ["Reached the interview stage", s.reached_interview],
    ["Hired", s.hired],
    ["Rejected", s.rejected],
    ["Withdrawn", s.withdrawn],
    ["Still open", s.open],
    ["Hire rate", ratio(s.hired, s.applications)],
    ["Median days to hire", s.median_days_to_hire],
    ["Median hours to first review", s.median_hours_to_review],
    ["Hires in the period (any application date)", s.hires_in_period],
    ["Generated", new Date(r.generated_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })],
  ], ["Hire rate"]);
  sheet("Funnel", [{ header: "Stage", width: 22 }, { header: "Reached", width: 10, fmt: "0" },
    { header: "% of applications", width: 18, fmt: "0%" }, { header: "% of previous stage", width: 20, fmt: "0%" }],
  funnelRows(r).map((f) => [f.name, f.reached, f.ofTotal, f.ofPrevious]));
  sheet("Sources", [{ header: "Source", width: 22 }, { header: "Applications", width: 13, fmt: "0" }, { header: "Reviewed", width: 10, fmt: "0" },
    { header: "Reached interview", width: 18, fmt: "0" }, { header: "Hired", width: 8, fmt: "0" }, { header: "Rejected", width: 10, fmt: "0" },
    { header: "Hire rate", width: 10, fmt: "0%" }],
  r.sources.map((x) => [x.name, x.applications, x.reviewed, x.reached_interview, x.hired, x.rejected, ratio(x.hired, x.applications)]));
  sheet("Jobs", [{ header: "Job", width: 30 }, { header: "Applications", width: 13, fmt: "0" }, { header: "Reached interview", width: 18, fmt: "0" },
    { header: "Hired", width: 8, fmt: "0" }, { header: "Median days to hire", width: 20, fmt: "0.0" }],
  r.jobs.map((x) => [x.title, x.applications, x.reached_interview, x.hired, x.median_days_to_hire]));
  sheet("Rejection reasons", [{ header: "Reason", width: 36 }, { header: "Type", width: 12 }, { header: "Applications", width: 13, fmt: "0" }],
    r.reasons.map((x) => [x.label, x.status === "withdrawn" ? "Withdrawn" : "Rejected", x.count]));
  const iv = r.interviews;
  sheet("Interviews", [{ header: "Measure", width: 34 }, { header: "Value", width: 12 }], [
    ["Interviews (not cancelled)", iv.total], ["Upcoming", iv.upcoming], ["Ended, waiting for an update", iv.awaiting_update],
    ["Completed", iv.completed], ["Did not attend", iv.no_show], ["Cancelled", iv.cancelled],
    ["No-show rate", ratio(iv.no_show, iv.completed + iv.no_show)], ["Completed, feedback missing", iv.feedback_missing],
    ["In person", iv.by_mode.in_person], ["Video", iv.by_mode.video], ["Phone", iv.by_mode.phone],
  ], ["No-show rate"]);
  sheet("Waiting now", [{ header: "Stage", width: 22 }, { header: "Open", width: 8, fmt: "0" }, { header: "On hold", width: 9, fmt: "0" },
    { header: "Median days in stage", width: 20, fmt: "0.0" }, { header: `Waiting over ${r.idle_days} days`, width: 22, fmt: "0" }],
  r.waiting.map((x) => [x.name, x.open, x.on_hold, x.median_days, x.over_idle]));
  sheet("Trend", [{ header: r.range.bucket === "week" ? "Week starting" : "Month", width: 16 }, { header: "Applications", width: 13, fmt: "0" },
    { header: "Hires", width: 8, fmt: "0" }],
  r.trend.map((x) => [x.bucket, x.applications, x.hires]));
  sheet("Team", [{ header: "Person", width: 24 }, { header: "Moved", width: 8, fmt: "0" }, { header: "Rejected", width: 10, fmt: "0" },
    { header: "Hired", width: 8, fmt: "0" }, { header: "Notes", width: 8, fmt: "0" }, { header: "Emails sent", width: 12, fmt: "0" },
    { header: "Interviews scheduled", width: 20, fmt: "0" }],
  r.team.map((x) => [x.name ?? "Unknown", x.moved, x.rejected, x.hired, x.notes, x.emails_sent, x.interviews_scheduled]));
  return wb;
}

export async function downloadReportXlsx(r: AtsReport, filters: { job: string; source: string }) {
  const wb = await buildReportWorkbook(r, filters);
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url; a.download = `ATS report ${r.range.from} to ${r.range.to}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
