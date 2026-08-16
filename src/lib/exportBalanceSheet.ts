import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";

export interface BalanceSheetLine {
  section: string;
  line_key: string;
  line_label: string;
  amount: number | null;
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

export type BalanceSheetMode = "MANAGEMENT" | "VERIFICATION";

export interface BalanceSheetMeta {
  entityName: string;
  gstin?: string | null;
  pan?: string | null;
  asOf: string; // yyyy-MM-dd
  generatedAt: string;
  firmComposition?: string | null;
  valuationBasis?: string;
  isDraft?: boolean;
  failedChecks?: string[];
  checksum?: string;
  cryptoNote?: string[] | null;
  mode?: BalanceSheetMode;
}

const SECTION_TITLES: Record<string, string> = {
  ASSETS: "Assets",
  LIABILITIES: "Liabilities",
  EQUITY: "Equity (derived from ledger flows)",
  CHECK: "Reconciliation check",
};

export const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

/** A null amount means the figure does not exist in the ERP at all — never render it as zero. */
export const NOT_AVAILABLE = "NOT AVAILABLE";
export const amountText = (amount: number | null | undefined) =>
  amount === null || amount === undefined ? NOT_AVAILABLE : inr(Number(amount));

/**
 * Registration identifiers are only meaningful at their statutory length.
 * Anything shorter (placeholders such as "D") is not an identifier — print NOT AVAILABLE.
 */
export const statutoryId = (value: string | null | undefined, requiredLength: number) => {
  const v = (value || "").trim().toUpperCase();
  return v.length === requiredLength ? v : NOT_AVAILABLE;
};
export const gstinText = (v: string | null | undefined) => statutoryId(v, 15);
export const panText = (v: string | null | undefined) => statutoryId(v, 10);


/** Deterministic checksum over the presented figures, so a printed copy can be tied back. */
export function balanceSheetChecksum(lines: BalanceSheetLine[], meta: { entityName: string; asOf: string }) {
  const payload =
    meta.entityName +
    "|" +
    meta.asOf +
    "|" +
    lines
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((l) => `${l.line_key}:${l.amount === null || l.amount === undefined ? "NA" : Number(l.amount).toFixed(2)}`)
      .join(",");

  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < payload.length; i++) {
    const c = payload.charCodeAt(i);
    h1 = (h1 ^ c) >>> 0;
    h1 = Math.imul(h1, 16777619) >>> 0;
    h2 = (Math.imul(h2 ^ c, 2246822519) + i) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).toUpperCase();
}

/** MCA Schedule III note (G.S.R. 207(E)) — mandatory for companies holding crypto. */
export function cryptoDisclosureNote(inventoryAmount: number, basis: string): string[] {
  return [
    "Note - Details of Crypto Currency or Virtual Currency (Schedule III, G.S.R. 207(E) dated 24 March 2021):",
    "(a) Profit or loss on transactions involving crypto currency or virtual currency: NOT SEPARATELY AVAILABLE. Trading results are recorded as bank flows and are included in the accumulated trading result above.",
    `(b) Amount of currency held as at the reporting date: INR ${inr(inventoryAmount)} (valuation basis: ${basis}), covering only wallets mapped to this company.`,
    "(c) Deposits or advances from any person for the purpose of trading or investing in crypto currency or virtual currency: NOT AVAILABLE. No such ledger is maintained in the system.",
  ];
}

function grouped(lines: BalanceSheetLine[]) {
  return (["ASSETS", "LIABILITIES", "EQUITY", "CHECK"] as const).map((s) => ({
    section: s,
    title: SECTION_TITLES[s],
    rows: lines.filter((l) => l.section === s).sort((a, b) => a.sort_order - b.sort_order),
  }));
}

function drawWatermark(doc: jsPDF) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.saveGraphicsState();
    (doc as any).setGState(new (doc as any).GState({ opacity: 0.12 }));

    doc.setTextColor(200, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(46);
    doc.text("DRAFT - FAILED VERIFICATION", pageWidth / 2, pageHeight / 2, {
      align: "center",
      angle: 32,
    });
    doc.restoreGraphicsState();
    doc.setTextColor(0);
  }
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
  if (meta.checksum) doc.text(`Checksum ${meta.checksum}`, pageWidth - 40, 60, { align: "right" });
  if (meta.valuationBasis)
    doc.text(`Inventory basis: ${meta.valuationBasis}`, pageWidth - 40, 72, { align: "right" });
  doc.setTextColor(0);

  let y = idBits ? 116 : 100;

  if (meta.isDraft) {
    autoTable(doc, {
      startY: y,
      head: [["DRAFT - FAILED VERIFICATION"]],
      body: [
        [
          "This statement did not pass all integrity checks and must not be used as a final financial statement. Failing checks: " +
            (meta.failedChecks?.length ? meta.failedChecks.join(", ") : "see data-integrity findings"),
        ],
      ],
      styles: { fontSize: 8.5, cellPadding: 6, textColor: [120, 0, 0] },
      headStyles: { fillColor: [190, 30, 30], textColor: 255, fontStyle: "bold" },
      margin: { left: 40, right: 40 },
    });
    y = (doc as any).lastAutoTable.finalY + 16;
  }

  for (const g of grouped(lines)) {
    if (!g.rows.length) continue;
    autoTable(doc, {
      startY: y,
      head: [[g.title, "Amount (INR)", "Basis"]],
      body: g.rows.map((r) => [
        r.line_label + (r.note ? `\n${r.note}` : ""),
        amountText(r.amount),
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

  if (meta.cryptoNote?.length) {
    autoTable(doc, {
      startY: y,
      head: [["Crypto currency disclosure"]],
      body: meta.cryptoNote.map((l) => [l]),
      styles: { fontSize: 7.5, cellPadding: 4 },
      headStyles: { fillColor: [37, 47, 63], textColor: 255 },
      margin: { left: 40, right: 40 },
    });
    y = (doc as any).lastAutoTable.finalY + 14;
  }

  doc.setFontSize(7.5);
  doc.setTextColor(110);
  const disclaimer =
    "Prepared from bank ledger data recorded in the ERP. Fixed assets, capital accounts, borrowings and statutory dues are not maintained as ledgers and are therefore not presented. Crypto inventory is presented only for wallets mapped to this company. No balancing or plug entries have been made: any difference is shown in the reconciliation check.";
  doc.text(doc.splitTextToSize(disclaimer, pageWidth - 80), 40, Math.min(y, doc.internal.pageSize.getHeight() - 50));

  if (meta.isDraft) drawWatermark(doc);

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
  if (meta.valuationBasis) ws.addRow([`Inventory valuation basis: ${meta.valuationBasis}`]);
  ws.addRow([`Generated ${meta.generatedAt}`]).font = { name: "Arial", size: 9, color: { argb: "FF808080" } };
  if (meta.checksum) ws.addRow([`Checksum ${meta.checksum}`]).font = { name: "Arial", size: 9 };
  if (meta.isDraft) {
    const w = ws.addRow([
      "DRAFT - FAILED VERIFICATION: " +
        (meta.failedChecks?.length ? meta.failedChecks.join(", ") : "see Data Integrity sheet"),
    ]);
    w.font = { bold: true, name: "Arial", color: { argb: "FFBE1E1E" } };
  }
  ws.addRow([]);

  for (const g of grouped(lines)) {
    if (!g.rows.length) continue;
    const head = ws.addRow([g.title, "Amount (INR)", "Basis", "Note"]);
    head.font = { bold: true, name: "Arial", color: { argb: "FFFFFFFF" } };
    head.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF252F3F" } };
    });
    for (const r of g.rows) {
      const isNa = r.amount === null || r.amount === undefined;
      const row = ws.addRow({
        label: r.line_label,
        amount: isNa ? NOT_AVAILABLE : Number(r.amount),
        basis: r.confidence,
        note: r.note || "",
      });
      row.font = { name: "Arial", bold: /^total_/.test(r.line_key) };
      if (!isNa) row.getCell("amount").numFmt = '#,##0.00;(#,##0.00);"-"';
    }

    ws.addRow([]);
  }

  if (meta.cryptoNote?.length) {
    const ns = wb.addWorksheet("Crypto Disclosure");
    ns.columns = [{ key: "line", width: 130 }];
    for (const l of meta.cryptoNote) ns.addRow({ line: l }).font = { name: "Arial" };
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
