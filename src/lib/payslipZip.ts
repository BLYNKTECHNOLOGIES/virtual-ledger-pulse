import { unzip, type Unzipped } from "fflate";

export interface ParsedPayslipEntry {
  /** full path inside the archive */
  path: string;
  fileName: string;
  /** employee code from the containing folder, e.g. "70 - Shubham Singh" */
  folderCode: string | null;
  folderName: string | null;
  /** employee code parsed out of the file name */
  fileCode: string | null;
  /** period parsed out of the file name, normalised to YYYY-MM-01 */
  period: string | null;
  periodLabel: string | null;
  /** "Active Employees" / "Dismissed Employees" bucket */
  group: "active" | "dismissed" | "unknown";
  bytes: Uint8Array;
  /** employee code read from the PDF text layer, when readable */
  pdfCode?: string | null;
  pdfCodeVerified?: boolean;
  conflict?: string | null;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function toPeriod(label: string): string | null {
  const m = label.trim().match(/^([A-Za-z]{3})[a-z]*\.?[\s_]+(\d{4})$/);
  if (!m) return null;
  const mm = MONTHS[m[1].toLowerCase()];
  if (!mm) return null;
  return `${m[2]}-${mm}-01`;
}

/** Unzip a RazorpayX monthly payslip archive and describe every PDF found. */
export async function readPayslipArchive(file: File): Promise<ParsedPayslipEntry[]> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const files: Unzipped = await new Promise((resolve, reject) =>
    unzip(buf, (err, data) => (err ? reject(err) : resolve(data))),
  );

  const out: ParsedPayslipEntry[] = [];
  for (const [path, bytes] of Object.entries(files)) {
    if (!/\.pdf$/i.test(path)) continue;
    if (path.split("/").some((s) => s.startsWith("__MACOSX") || s.startsWith("."))) continue;
    if (!bytes || bytes.length === 0) continue;

    const segs = path.split("/").filter(Boolean);
    const fileName = segs[segs.length - 1];
    const parent = segs[segs.length - 2] ?? "";

    const folderMatch = parent.match(/^(\d+)\s*-\s*(.+)$/);
    const fileMatch = fileName.match(/^(.*?)-(\d+)-([A-Za-z]{3,}\.?[\s_]+\d{4})-Payslip\.pdf$/i);

    const groupSeg = segs.find((s) => /dismissed/i.test(s))
      ? "dismissed"
      : segs.find((s) => /active/i.test(s))
        ? "active"
        : "unknown";

    const periodLabel = fileMatch?.[3]?.trim() ?? null;

    out.push({
      path,
      fileName,
      folderCode: folderMatch?.[1] ?? null,
      folderName: folderMatch?.[2]?.trim() ?? null,
      fileCode: fileMatch?.[2] ?? null,
      period: periodLabel ? toPeriod(periodLabel) : null,
      periodLabel,
      group: groupSeg as ParsedPayslipEntry["group"],
      bytes,
    });
  }
  return out.sort((a, b) => Number(a.folderCode ?? 0) - Number(b.folderCode ?? 0));
}

let pdfjsPromise: Promise<any> | null = null;
async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs: any = await import("pdfjs-dist");
      const workerMod: any = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      const workerUrl = workerMod.default;

      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

/**
 * Read the "Employee Code <n>" value out of the PDF's text layer.
 * Returns null when the PDF has no readable text layer.
 */
export async function readEmployeeCodeFromPdf(bytes: Uint8Array): Promise<string | null> {
  try {
    const pdfjs = await getPdfjs();
    const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    const items: string[] = content.items.map((i: any) => (typeof i.str === "string" ? i.str : ""));
    const text = items.join("\n");
    await doc.destroy();

    const m = text.match(/Employee\s*Code\s*\n?\s*(\d+)/i);
    if (m) return m[1];
    // fallback: the token immediately after a standalone "Employee Code" item
    const idx = items.findIndex((s) => /employee\s*code/i.test(s));
    if (idx >= 0) {
      for (let i = idx + 1; i < Math.min(idx + 4, items.length); i++) {
        const t = items[i].trim();
        if (/^\d+$/.test(t)) return t;
      }
    }
    return null;
  } catch {
    return null;
  }
}
