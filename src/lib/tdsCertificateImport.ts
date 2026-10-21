import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { parseCertPath, parseCertText } from "./tdsCertificates";

const BUCKET = "tds-certificates";
let pdfjsPromise: Promise<any> | null = null;
async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs: any = await import("pdfjs-dist");
      const workerMod: any = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  const out: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const c = await (await doc.getPage(n)).getTextContent();
    for (const i of c.items as any[]) if (typeof i.str === "string" && i.str.trim()) out.push(i.str);
  }
  await doc.destroy();
  return out.join(" | ");
}

function withTimeout<T>(p: PromiseLike<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((res, rej) => {
    const t = setTimeout(() => rej(new Error(`${what} timed out — upload the ZIP again to retry`)), ms);
    Promise.resolve(p).then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}

export interface ImportResult {
  saved: number;
  skipped: { file: string; reason: string }[];
  pans: string[];
  /** Certificates skipped because the same PAN + quarter was already uploaded. */
  alreadyUploaded: number;
}

export async function importTdsZip(
  file: File,
  userId: string | undefined,
  onProgress: (done: number, total: number) => void,
): Promise<ImportResult> {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((e) => !e.dir && /\.pdf$/i.test(e.name) && !e.name.includes("__MACOSX"));
  const result: ImportResult = { saved: 0, skipped: [], pans: [], alreadyUploaded: 0 };
  // Certificates already saved for the same PAN + quarter are skipped, never re-uploaded.
  const existing = new Set<string>();
  const keyOf = (m: { formCode: string; deducteePan: string; deductorPan: string; quarter: string; taxYear: string }) =>
    `${m.formCode}|${m.deducteePan}|${m.deductorPan}|${m.quarter}|${m.taxYear}`;
  const periods = new Map<string, { quarter: string; taxYear: string }>();
  for (const e of entries) { const m = parseCertPath(e.name); if (m) periods.set(`${m.quarter}|${m.taxYear}`, { quarter: m.quarter, taxYear: m.taxYear }); }
  for (const { quarter, taxYear } of periods.values()) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("client_tds_certificates" as any)
        .select("form_code,deductee_pan,deductor_pan,quarter,tax_year").eq("quarter", quarter).eq("tax_year", taxYear).range(from, from + 999);
      if (error) throw error;
      for (const r of (data || []) as any[]) existing.add(`${r.form_code}|${r.deductee_pan}|${r.deductor_pan}|${r.quarter}|${r.tax_year}`);
      if (!data || data.length < 1000) break;
    }
  }
  let done = 0;
  const queue = [...entries];
  const worker = async () => {
    while (queue.length) {
      const e = queue.shift()!;
      const name = e.name.split("/").pop()!;
      try {
        const meta = parseCertPath(e.name);
        if (!meta) throw new Error("File name does not follow FORM_PAN_Qn_YYYY-YY.pdf");
        if (meta.deductorPan && existing.has(keyOf({ ...meta, deductorPan: meta.deductorPan }))) { result.alreadyUploaded++; continue; }
        const bytes = await e.async("uint8array");
        let parsed = { certificateNo: null as string | null, deductorPan: null as string | null, amountPaid: null as number | null, tdsAmount: null as number | null };
        try { parsed = parseCertText(await withTimeout(pdfText(bytes), 20000, "Reading PDF")); } catch { /* keep file-name data */ }
        const deductorPan = meta.deductorPan || parsed.deductorPan;
        if (!deductorPan) throw new Error("Deductor PAN not found in folder or certificate");
        const key = keyOf({ ...meta, deductorPan });
        if (existing.has(key)) { result.alreadyUploaded++; continue; }
        existing.add(key);
        // Deductor PAN is part of the path so two companies' certificates never share a file.
        const path = `${meta.taxYear}/${meta.quarter}/${deductorPan}/${meta.formCode}_${meta.deducteePan}_${meta.quarter}_${meta.taxYear}.pdf`;
        const { error: upErr } = await withTimeout(supabase.storage.from(BUCKET)
          .upload(path, new Blob([bytes as BlobPart], { type: "application/pdf" }), { upsert: true, contentType: "application/pdf" }), 45000, "File upload");
        if (upErr) throw upErr;
        const { error } = await withTimeout(supabase.from("client_tds_certificates" as any).upsert({
          deductee_pan: meta.deducteePan, deductor_pan: deductorPan, form_code: meta.formCode,
          quarter: meta.quarter, tax_year: meta.taxYear, certificate_no: parsed.certificateNo,
          amount_paid: parsed.amountPaid, tds_amount: parsed.tdsAmount,
          storage_path: path, file_name: name, uploaded_by: userId ?? null, uploaded_at: new Date().toISOString(),
        }, { onConflict: "deductee_pan,deductor_pan,form_code,quarter,tax_year" }) as PromiseLike<{ error: any }>, 30000, "Saving certificate");
        if (error) throw error;
        result.saved++; result.pans.push(meta.deducteePan);
      } catch (err: any) {
        result.skipped.push({ file: name, reason: err?.message || "failed" });
      } finally {
        onProgress(++done, entries.length);
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return result;
}

export async function downloadCertificate(path: string, fileName: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 120, { download: fileName });
  if (error || !data?.signedUrl) throw error || new Error("Could not open certificate");
  const a = document.createElement("a");
  a.href = data.signedUrl; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
}
