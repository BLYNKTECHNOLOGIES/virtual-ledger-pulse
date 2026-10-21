/**
 * TDS certificate (Form 131 / 16A) ZIP import.
 * Folder:  <form>_<deductorPAN>_<Qn>_<YYYY-YY>/
 * File:    <form>_<deducteePAN>_<Qn>_<YYYY-YY>.pdf
 * The certificate is matched to clients by deductee PAN, grouped by quarter.
 */
export interface CertFileMeta {
  formCode: string;
  deducteePan: string;
  deductorPan: string | null;
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  taxYear: string;
}

const FILE_RE = /^(\d{2,3}[A-Z]?)_([A-Z]{5}[0-9]{4}[A-Z])_(Q[1-4])_(\d{4}-\d{2})\.pdf$/i;
const FOLDER_RE = /(?:^|\/)(\d{2,3}[A-Z]?)_([A-Z]{5}[0-9]{4}[A-Z])_(Q[1-4])_(\d{4}-\d{2})\/[^/]+$/i;

export function parseCertPath(path: string): CertFileMeta | null {
  const name = path.split("/").pop() || "";
  const m = name.match(FILE_RE);
  if (!m) return null;
  const f = path.match(FOLDER_RE);
  return {
    formCode: m[1].toUpperCase(),
    deducteePan: m[2].toUpperCase(),
    deductorPan: f ? f[2].toUpperCase() : null,
    quarter: m[3].toUpperCase() as CertFileMeta["quarter"],
    taxYear: m[4],
  };
}

const rupees = (s: string) => Number(s.replace(/[₹,\s]/g, ""));

/** Reads values from the certificate's text items joined with " | ". */
export function parseCertText(text: string) {
  const cert = text.match(/Certificate Number:\s*([A-Z0-9]{8,20})/i)?.[1] ?? null;
  const deductor = text.match(/BLYNK[^|]*\|\s*([A-Z]{5}[0-9]{4}[A-Z])/)?.[1] ?? null;
  const paidM = text.match(/Total\s*\|\s*(₹[0-9,.]+)/);
  const amountPaid = paidM ? rupees(paidM[1]) : null;
  let tds = 0, found = false;
  for (const m of text.matchAll(/\bQ[1-4]\s*\|\s*\d{6,}\s*\|\s*(₹[0-9,.]+)/g)) {
    tds += rupees(m[1]); found = true;
  }
  return {
    certificateNo: cert,
    deductorPan: deductor,
    amountPaid: amountPaid != null && Number.isFinite(amountPaid) ? amountPaid : null,
    tdsAmount: found ? Math.round(tds * 100) / 100 : null,
  };
}

export const normalizePan = (p?: string | null) => (p || "").trim().toUpperCase();
