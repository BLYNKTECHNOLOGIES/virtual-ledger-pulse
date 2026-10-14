import { addDays, differenceInCalendarDays, format, isValid, parseISO } from "date-fns";

/** Parses a date or timestamp from the database; null when missing or invalid. */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = value.length <= 10 ? parseISO(value) : new Date(value);
  return isValid(d) ? d : null;
}

export function fmtDate(value: string | Date | null | undefined, pattern = "dd MMM yyyy"): string {
  const d = value instanceof Date ? value : parseDate(value);
  return d && isValid(d) ? format(d, pattern) : "—";
}

export function isoDate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function todayIso(): string {
  return isoDate(new Date());
}

/** Calendar date of a plan day (day 1 = start date). */
export function planDayDate(startDate: string, dayNo: number): Date | null {
  const s = parseDate(startDate);
  return s ? addDays(s, dayNo - 1) : null;
}

/** Which plan day today is (can be below 1 before the start or above the last day). */
export function planTodayDayNo(startDate: string): number | null {
  const s = parseDate(startDate);
  return s ? differenceInCalendarDays(new Date(), s) + 1 : null;
}

export function minutesLabel(min: number | null | undefined): string {
  const m = Math.max(0, Math.round(min ?? 0));
  if (!m) return "—";
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} min`;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function formatBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** 1.0 → 1.1, 2.9 → 2.10; anything else gets ".1" added. */
export function bumpVersion(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  const m = /^(\d+)\.(\d+)$/.exec(s);
  if (m) return `${m[1]}.${Number(m[2]) + 1}`;
  return s ? `${s}.1` : "1.0";
}

/** A test passes at or above the pass mark, unless a critical question was missed. */
export function isTestPassed(score: number | null | undefined, criticalOk: boolean | null | undefined, passMark: number): boolean | null {
  if (score === null || score === undefined || Number.isNaN(score)) return null;
  return score >= passMark && criticalOk !== false;
}

export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** CSV text (Excel-friendly: BOM, quoted cells, formula-looking cells defused). */
export function toCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  const cell = (v: string | number | boolean | null | undefined) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

export function downloadText(fileName: string, text: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export type EmbedKind = "youtube" | "vimeo" | "drive" | "video" | "pdf" | "image" | "office" | "file" | "iframe" | "unsafe";

/** Only web links, and the app's own temporary blob links, may be opened or embedded. */
export function isSafeMediaUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const u = url.trim();
  if (/^blob:/i.test(u)) return typeof window !== "undefined" && u.startsWith(`blob:${window.location.origin}/`);
  return isHttpUrl(u);
}


/**
 * How a file or link can be shown in class. Uploaded files and direct links to
 * video, PDF or images play in place; YouTube, Vimeo and Google Drive links are
 * embedded; anything else (Gamma, HeyGen share pages) is tried in a frame with an
 * "open in a new tab" fallback.
 */
export function classifyMedia(url: string, mime?: string | null): { kind: EmbedKind; src: string } {
  if (!isSafeMediaUrl(url)) return { kind: "unsafe", src: "" };
  const m = (mime ?? "").toLowerCase();
  const clean = url.split("#")[0];
  const path = clean.split("?")[0].toLowerCase();
  if (m.startsWith("video/") || /\.(mp4|webm|ogg|mov|m4v)$/.test(path)) return { kind: "video", src: url };
  if (m === "application/pdf" || path.endsWith(".pdf")) return { kind: "pdf", src: url };
  if (m.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/.test(path)) return { kind: "image", src: url };
  if (/\.(pptx?|docx?|xlsx?)$/.test(path) || m.includes("officedocument") || m.includes("ms-powerpoint") || m.includes("msword")) {
    return { kind: "office", src: url };
  }
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return { kind: "youtube", src: `https://www.youtube.com/embed/${u.pathname.slice(1)}` };
    if (host.endsWith("youtube.com")) {
      const id = u.searchParams.get("v") || (u.pathname.startsWith("/embed/") ? u.pathname.split("/")[2] : null) ||
        (u.pathname.startsWith("/shorts/") ? u.pathname.split("/")[2] : null);
      if (id) return { kind: "youtube", src: `https://www.youtube.com/embed/${id}` };
    }
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id && /^\d+$/.test(id)) return { kind: "vimeo", src: `https://player.vimeo.com/video/${id}` };
    }
    if (host === "drive.google.com") {
      const match = /\/file\/d\/([^/]+)/.exec(u.pathname);
      const id = match?.[1] ?? u.searchParams.get("id");
      if (id) return { kind: "drive", src: `https://drive.google.com/file/d/${id}/preview` };
    }
    if (host === "docs.google.com" && /\/(presentation|document|spreadsheets)\/d\//.test(u.pathname)) {
      return { kind: "drive", src: url.replace(/\/(edit|view)(\?.*)?$/, "/preview") };
    }
  } catch {
    /* not a URL — fall through */
  }
  // A joined file of any other type is only ever offered for download, never framed.
  if (/^blob:/i.test(url)) return { kind: "file", src: url };
  return { kind: "iframe", src: url };
}

export function isHttpUrl(value: string): boolean {
  const v = value.trim();
  if (!/^https?:\/\/[^/\s]/i.test(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** The link as the browser understands it (stored this way so the database check always agrees). */
export function normaliseUrl(value: string): string {
  return new URL(value.trim()).href;
}
