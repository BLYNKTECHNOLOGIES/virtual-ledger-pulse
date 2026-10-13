import { toast } from "sonner";

/**
 * Excel export for the finance pages. Each sheet is a list of plain rows
 * (numbers stay numeric so they can be summed in Excel).
 */
export interface SheetSpec {
  name: string;
  rows: Record<string, string | number | null | undefined>[];
}


export async function downloadWorkbook(fileName: string, sheets: SheetSpec[]) {
  try {
    await writeWorkbook(fileName, sheets);
  } catch (err: any) {
    console.error("[export] failed", err);
    toast.error(`Export failed: ${err?.message || "please try again"}`);
  }
}

async function writeWorkbook(fileName: string, sheets: SheetSpec[]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const rows = s.rows.length ? s.rows : [{ Note: "No rows for the selected period" }];
    const ws = XLSX.utils.json_to_sheet(rows);
    const headers = Object.keys(rows[0] || {});
    ws["!cols"] = headers.map((h) => ({
      wch: Math.min(48, Math.max(h.length, ...rows.slice(0, 200).map((r) => String(r[h] ?? "").length)) + 2),
    }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`);
}
