import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";

export interface BalanceSheetLine {
  section: string;
  line_key: string;
  line_label: string;
  amount: number;
  confidence: string;
  note: string | null;
  sort_order: number;
}

export interface IntegrityFinding {
  severity: string;
  code: string;
  title: string;
  detail: string | null;
  impact_amount: number | null;
  affected_count: number | null;
}

export interface BalanceSheetMeta {
  entityName: string;
  gstin?: string | null;
  pan?: string | null;
  asOf: string; // yyyy-MM-dd
  generatedAt: string;
}

const SECTION_TITLES: Record<string, string> = {
  ASSETS: "Assets",
  LIABILITIES: "Liabilities",
  EQUITY: "Equity (derived from ledger flows)",
  CHECK: "Reconciliation check",
};

export const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

function grouped(lines: BalanceSheetLine[]) {
  return (["ASSETS", "LIABILITIES", "EQUITY", "CHECK"] as const).map((s) => ({
    section: s,
    title: SECTION_TITLES[s],
    rows: lines.filter((l) => l.section === s).sort((a, b) => a.sort_order - b.sort_order),
  }));
}

export function exportBalanceSheetPdf(
  lines: BalanceSheetLine[],
  findings: IntegrityFinding[],
  meta: BalanceSheetMeta,
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(meta.entityName, 40, 48);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Statement of Financial Position (ledger-supported)", 40, 66);
  doc.text(`As at ${meta.asOf}`, 40, 82);
  const idBits = [meta.gstin ? `GSTIN: ${meta.gstin}` : null, meta.pan ? `PAN: ${meta.pan}` : null]
    .filter(Boolean)
    .join("   ");
  if (idBits) doc.text(idBits, 40, 98);
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(`Generated ${meta.generatedAt}`, pageWidth - 40, 48, { align: "right" });
  doc.setTextColor(0);

  let y = idBits ? 116 : 100;

  for (const g of grouped(lines)) {
    if (!g.rows.length) continue;
    autoTable(doc, {
      startY: y,
      head: [[g.title, "Amount (INR)", "Basis"]],
      body: g.rows.map((r) => [
        r.line_label + (r.note ? `\n${r.note}` : ""),
        inr(Number(r.amount)),
        r.confidence,
      ]),
      styles: { fontSize: 8, cellPadding: 4, valign: "middle" },
      headStyles: { fillColor: [37, 47, 63], textColor: 255, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 330 },
        1: { halign: "right", cellWidth: 110 },
        2: { cellWidth: 70 },
      },
      didParseCell: (data) => {
        const row = g.rows[data.row.index];
        if (data.section === "body" && row && /^total_/.test(row.line_key)) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [242, 244, 247];
        }
      },
      margin: { left: 40, right: 40 },
    });
    y = (doc as any).lastAutoTable.finalY + 18;
  }

  if (findings.length) {
    autoTable(doc, {
      startY: y,
      head: [["Data-integrity findings", "Severity", "Impact (INR)", "Count"]],
      body: findings.map((f) => [
        f.title + (f.detail ? `\n${f.detail}` : ""),
        f.severity,
        f.impact_amount == null ? "-" : inr(Number(f.impact_amount)),
        f.affected_count == null ? "-" : String(f.affected_count),
      ]),
      styles: { fontSize: 7.5, cellPadding: 4 },
      headStyles: { fillColor: [120, 53, 15], textColor: 255 },
      columnStyles: { 0: { cellWidth: 330 }, 2: { halign: "right" }, 3: { halign: "right" } },
      margin: { left: 40, right: 40 },
    });
    y = (doc as any).lastAutoTable.finalY + 14;
  }

  doc.setFontSize(7.5);
  doc.setTextColor(110);
  const disclaimer =
    "Prepared from bank ledger data recorded in the ERP. Crypto inventory, fixed assets, capital accounts, borrowings and statutory dues are not maintained as ledgers and are therefore not presented. No balancing or plug entries have been made: any difference is shown in the reconciliation check.";
  doc.text(doc.splitTextToSize(disclaimer, pageWidth - 80), 40, Math.min(y, doc.internal.pageSize.getHeight() - 50));

  doc.save(`Balance-Sheet_${meta.entityName.replace(/[^\w]+/g, "-")}_${meta.asOf}.pdf`);
}

export async function exportBalanceSheetXlsx(
  lines: BalanceSheetLine[],
  findings: IntegrityFinding[],
  meta: BalanceSheetMeta,
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Blynk ERP";
  const ws = wb.addWorksheet("Balance Sheet");
  ws.columns = [
    { key: "label", width: 58 },
    { key: "amount", width: 20 },
    { key: "basis", width: 14 },
    { key: "note", width: 70 },
  ];

  const title = ws.addRow([meta.entityName]);
  title.font = { bold: true, size: 14, name: "Arial" };
  ws.addRow(["Statement of Financial Position (ledger-supported)"]).font = { name: "Arial", size: 10 };
  ws.addRow([`As at ${meta.asOf}`]).font = { name: "Arial", size: 10 };
  if (meta.gstin || meta.pan) ws.addRow([`GSTIN: ${meta.gstin || "-"}    PAN: ${meta.pan || "-"}`]);
  ws.addRow([`Generated ${meta.generatedAt}`]).font = { name: "Arial", size: 9, color: { argb: "FF808080" } };
  ws.addRow([]);

  for (const g of grouped(lines)) {
    if (!g.rows.length) continue;
    const head = ws.addRow([g.title, "Amount (INR)", "Basis", "Note"]);
    head.font = { bold: true, name: "Arial", color: { argb: "FFFFFFFF" } };
    head.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF252F3F" } };
    });
    for (const r of g.rows) {
      const row = ws.addRow({
        label: r.line_label,
        amount: Number(r.amount),
        basis: r.confidence,
        note: r.note || "",
      });
      row.font = { name: "Arial", bold: /^total_/.test(r.line_key) };
      row.getCell("amount").numFmt = '#,##0.00;(#,##0.00);"-"';
    }
    ws.addRow([]);
  }

  if (findings.length) {
    const fs = wb.addWorksheet("Data Integrity");
    fs.columns = [
      { key: "severity", width: 12 },
      { key: "title", width: 46 },
      { key: "detail", width: 80 },
      { key: "impact", width: 18 },
      { key: "count", width: 10 },
    ];
    const h = fs.addRow(["Severity", "Finding", "Detail", "Impact (INR)", "Count"]);
    h.font = { bold: true, name: "Arial", color: { argb: "FFFFFFFF" } };
    h.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF7C2D12" } };
    });
    for (const f of findings) {
      const r = fs.addRow({
        severity: f.severity,
        title: f.title,
        detail: f.detail || "",
        impact: f.impact_amount == null ? null : Number(f.impact_amount),
        count: f.affected_count ?? null,
      });
      r.font = { name: "Arial" };
      r.getCell("impact").numFmt = '#,##0.00;(#,##0.00);"-"';
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Balance-Sheet_${meta.entityName.replace(/[^\w]+/g, "-")}_${meta.asOf}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
