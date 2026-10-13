/**
 * Display helpers shared by the P&L, Financials and Statistics pages.
 * Presentation only — they never round the underlying figures.
 */
import { formatCompactINR, formatExactINR } from "@/lib/formatCompactCurrency";

export { formatCompactINR, formatExactINR };

/** ₹ with Indian grouping and up to 2 decimals (₹1,23,456.7). */
export function inr(amount: number, decimals = 2): string {
  const n = Number(amount) || 0;
  const sign = n < 0 ? "-" : "";
  return `${sign}₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: decimals })}`;
}

/** Signed rupee figure for statement lines: "+₹2,000" / "−₹2,000". */
export function signedInr(amount: number, decimals = 2): string {
  const n = Number(amount) || 0;
  if (n === 0) return "₹0";
  return `${n < 0 ? "−" : "+"}₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: decimals })}`;
}

/** Per-unit rate: ₹106.82 (always 2 decimals). */
export function rate(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !isFinite(Number(amount))) return "—";
  const n = Number(amount);
  return `${n < 0 ? "-" : ""}₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Quantity with grouping, e.g. 3,83,098.05 (Indian grouping for consistency with ₹). */
export function qty(value: number, decimals = 2): string {
  return (Number(value) || 0).toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function usdt(value: number, decimals = 2): string {
  return `${qty(value, decimals)} USDT`;
}

export function count(value: number): string {
  return (Number(value) || 0).toLocaleString("en-IN");
}

export function pct(value: number, decimals = 1): string {
  if (!isFinite(value)) return "—";
  return `${value.toFixed(decimals)}%`;
}

/** Signed change in percent ("+12.4%"); null when there is nothing to compare against. */
export function changePct(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** "Finance, Banking & Compliance > TDS" → { head: "Finance, Banking & Compliance", sub: "TDS" } */
export function splitCategory(category?: string | null): { head: string; sub: string | null } {
  const raw = String(category || "Other").trim();
  const i = raw.indexOf(">");
  if (i === -1) return { head: raw, sub: null };
  return { head: raw.slice(0, i).trim(), sub: raw.slice(i + 1).trim() || null };
}

// Acronyms stay upper-case when a label is title-cased (bank and company short forms).
const ACRONYMS = new Set(["IT", "LLP", "HUF", "POS", "UPI", "ASEC", "ICICI", "HDFC", "IDBI", "IDFC", "SBI", "PNB", "CSB", "IOB", "BOB", "BOM", "PSB", "AU", "KYC", "TDS", "GST", "CA", "SS", "MDR"]);
function titleWord(w: string): string {
  const letters = w.replace(/[^A-Za-z]/g, "");
  if (ACRONYMS.has(letters.toUpperCase()) || (letters.length > 0 && letters.length <= 2 && letters === letters.toUpperCase())) return w.toUpperCase();
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

/** Compact company name for chips and tables: "M/s VERTEX SHIFT IT SOLUTIONS" → "Vertex Shift IT Solutions". */
export function shortEntityName(name?: string | null): string {
  const raw = String(name || "").replace(/^m\/s\.?\s*/i, "").replace(/\s+(private|pvt\.?)\s+(limited|ltd\.?)\s*$/i, "").trim();
  if (!raw) return "Unassigned";
  return raw.split(/\s+/).map(titleWord).join(" ");
}

/** Title-case an ALL CAPS label without touching mixed-case text. */
export function tidyLabel(value?: string | null): string {
  const s = String(value || "").trim();
  if (!s) return "—";
  return s === s.toUpperCase() && /[A-Z]{3,}/.test(s) ? shortEntityName(s) : s;
}
