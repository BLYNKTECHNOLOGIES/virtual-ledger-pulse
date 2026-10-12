import type { AtsAppRow } from "./candidates";

const TZ_MS = 330 * 60_000;
/** A Date whose UTC fields equal the IST wall clock, so Excel shows IST. */
const istDate = (v?: string | null) => (v ? new Date(new Date(v).getTime() + TZ_MS) : null);
const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
const statusLabel: Record<string, string> = { active: "Active", on_hold: "On hold", rejected: "Rejected", withdrawn: "Withdrawn", hired: "Hired" };

export interface ExportCol { header: string; width: number; fmt?: string; get: (r: AtsAppRow & Record<string, any>) => unknown }

export const EXPORT_COLUMNS: ExportCol[] = [
  { header: "Ref", width: 10, get: (r) => r.ref_no },
  { header: "Name", width: 24, get: (r) => r.full_name },
  { header: "Email", width: 28, get: (r) => r.email },
  { header: "Phone", width: 15, get: (r) => r.phone },
  { header: "City", width: 14, get: (r) => r.city },
  { header: "Job", width: 26, get: (r) => r.job_title ?? "General" },
  { header: "Applied for (as typed)", width: 26, get: (r) => r.position_text },
  { header: "Stage", width: 13, get: (r) => r.stage_name },
  { header: "Status", width: 11, get: (r) => statusLabel[r.status ?? ""] ?? r.status },
  { header: "Reason", width: 26, get: (r) => r.reject_reason_label },
  { header: "Source", width: 16, get: (r) => r.source_name },
  { header: "Source detail", width: 22, get: (r) => r.source_detail },
  { header: "Applied (IST)", width: 18, fmt: "dd-mmm-yyyy hh:mm", get: (r) => istDate(r.applied_at) },
  { header: "Days in stage", width: 13, fmt: "0", get: (r) => num(r.days_in_stage) },
  { header: "Rating", width: 8, fmt: "0.0", get: (r) => (r.rating_count ? num(r.rating_avg) : null) },
  { header: "Experience (yrs)", width: 15, fmt: "0.0", get: (r) => num(r.total_experience_years) },
  { header: "Current CTC / month", width: 18, fmt: "#,##0", get: (r) => num(r.current_ctc_monthly) },
  { header: "Expected CTC / month", width: 19, fmt: "#,##0", get: (r) => num(r.expected_ctc_monthly) },
  { header: "Notice (days)", width: 12, fmt: "0", get: (r) => num(r.notice_period_days) },
  { header: "Skills", width: 36, get: (r) => (r.skills ?? []).join(", ") },
  { header: "Last activity (IST)", width: 18, fmt: "dd-mmm-yyyy hh:mm", get: (r) => istDate(r.last_activity_at ?? r.updated_at) },
];

/** Builds and downloads the workbook in the browser. Current CTC is looked up separately (not in the overview view). */
export async function downloadCandidatesXlsx(rows: (AtsAppRow & Record<string, any>)[]) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Candidates", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = EXPORT_COLUMNS.map((c) => ({ header: c.header, width: c.width, style: c.fmt ? { numFmt: c.fmt } : undefined }));
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(EXPORT_COLUMNS.map((c) => c.get(r) ?? null));
  const buf = await wb.xlsx.writeBuffer();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url; a.download = `ATS candidates ${today}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
