/**
 * Excel (.xlsx) flavour of the bulk compensation template.
 *
 * Same columns and same validation rules as the CSV template, but the file the
 * user downloads is guided: dropdowns for every choice column, date validation
 * for date columns, numeric validation for amounts, locked reference columns,
 * frozen header and an Instructions sheet.
 */
import ExcelJS from "exceljs";
import {
  MODE_COLUMNS,
  MODE_LABEL,
  parseCsv,
  type BulkMode,
  type EmployeeLite,
} from "@/lib/hrms/bulkCompensationCsv";

const SHEET = "Template";

const LIST_OPTIONS: Record<string, string[]> = {
  revision_type: ["increment", "promotion", "correction", "demotion"],
  addition_kind: ["bonus", "arrears", "reimbursement", "other"],
  taxable: ["yes", "no"],
  type: [
    "bonus",
    "performance_incentive",
    "retention_bonus",
    "special_allowance",
    "ad_hoc",
    "one_time_correction",
  ],
  pf: ["yes", "no"],
  esi: ["yes", "no"],
  pt: ["yes", "no"],
};

const DATE_COLS = ["effective_from", "paid_on"];
const NUMBER_COLS = ["amount", "new_total_ctc", "new_basic"];

const COL_HELP: Record<string, string> = {
  new_total_ctc: "New annual CTC — number only, greater than 0",
  new_basic: "Optional. New basic — number only",
  revision_type: "Pick one. Reason is mandatory for promotion / demotion",
  effective_from: "Pick a date. A future date is stored as SCHEDULED",
  reason: "Free text",
  amount: "Number greater than 0",
  label: "Shown on the payslip",
  period_month: "Pick the payroll month (current or future)",
  addition_kind: "Pick one",
  taxable: "yes or no",
  notes: "Free text, optional",
  type: "Pick one",
  paid_on: "Pick the date the payment was made",
  pf: "yes / no — leave blank to keep the current value",
  esi: "yes / no — leave blank to keep the current value",
  pt: "yes / no — leave blank to keep the current value",
};

function nextMonths(count = 15): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < count; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

const colLetter = (i: number) => {
  let n = i;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

function sortEmployees(employees: EmployeeLite[]) {
  return [...employees].sort((a, b) => {
    const act = Number(!!b.is_active) - Number(!!a.is_active);
    if (act) return act;
    const na = Number(String(a.badge_id ?? "").replace(/\D/g, "") || 1e9);
    const nb = Number(String(b.badge_id ?? "").replace(/\D/g, "") || 1e9);
    return na - nb;
  });
}

export async function buildTemplateWorkbook(mode: BulkMode, employees: EmployeeLite[]): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "HRMS";
  const ws = wb.addWorksheet(SHEET, { views: [{ state: "frozen", ySplit: 1, xSplit: 2 }] });
  const cols = ["badge_id", "employee_name", ...MODE_COLUMNS[mode]];

  ws.columns = cols.map((c) => ({
    header: c,
    key: c,
    width: c === "employee_name" ? 26 : c === "badge_id" ? 11 : Math.max(16, c.length + 6),
  }));

  const head = ws.getRow(1);
  head.font = { bold: true };
  head.height = 22;
  head.eachCell((cell, i) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF3F8" } };
    cell.alignment = { vertical: "middle" };
    const help = COL_HELP[cols[i - 1]];
    if (help) cell.note = help;
  });

  const rows = sortEmployees(employees);
  rows.forEach((e) => {
    const name = [e.first_name, e.last_name].filter(Boolean).join(" ");
    ws.addRow({ badge_id: String(e.badge_id ?? ""), employee_name: name + (e.is_active ? "" : " (Separated)") });
  });

  const first = 2;
  const last = rows.length + 1;
  const months = nextMonths();

  // Reference columns are locked; everything else stays editable.
  ws.protect?.("", { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true });
  for (let r = first; r <= last; r++) {
    const row = ws.getRow(r);
    row.eachCell({ includeEmpty: true }, (cell, c) => {
      cell.protection = { locked: c <= 2 };
    });
    if (r % 2 === 0) {
      for (let c = 1; c <= cols.length; c++) {
        ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFBFC" } };
      }
    }
  }

  const applyValidation = (colIndex: number, dv: any) => {
    for (let r = first; r <= last; r++) ws.getCell(r, colIndex).dataValidation = dv;
  };

  cols.forEach((col, idx) => {
    if (idx < 2) return;
    const colIndex = idx + 1;

    if (LIST_OPTIONS[col]) {
      applyValidation(colIndex, {
        type: "list",
        allowBlank: true,
        formulae: [`"${LIST_OPTIONS[col].join(",")}"`],
        showInputMessage: true,
        promptTitle: col,
        prompt: COL_HELP[col] || "Pick a value from the list",
        showErrorMessage: true,
        errorTitle: "Pick from the list",
        error: `Allowed values: ${LIST_OPTIONS[col].join(", ")}`,
      });
    } else if (col === "period_month") {
      applyValidation(colIndex, {
        type: "list",
        allowBlank: true,
        formulae: [`"${months.join(",")}"`],
        showInputMessage: true,
        promptTitle: "Payroll month",
        prompt: "Pick the month this applies to (current or future)",
        showErrorMessage: true,
        errorTitle: "Pick a month",
        error: "Pick a month from the list (YYYY-MM)",
      });
    } else if (DATE_COLS.includes(col)) {
      ws.getColumn(colIndex).numFmt = "yyyy-mm-dd";
      applyValidation(colIndex, {
        type: "date",
        operator: "between",
        allowBlank: true,
        formulae: [new Date(2020, 0, 1), new Date(2035, 11, 31)],
        showInputMessage: true,
        promptTitle: "Date",
        prompt: "Type a date — it is saved as YYYY-MM-DD",
        showErrorMessage: true,
        errorTitle: "Not a date",
        error: "Enter a valid date, e.g. 2026-08-31",
      });
    } else if (NUMBER_COLS.includes(col)) {
      ws.getColumn(colIndex).numFmt = "#,##0.00";
      applyValidation(colIndex, {
        type: "decimal",
        operator: "greaterThan",
        allowBlank: true,
        formulae: [0],
        showInputMessage: true,
        promptTitle: col,
        prompt: COL_HELP[col] || "Number greater than 0",
        showErrorMessage: true,
        errorTitle: "Invalid amount",
        error: "Enter a number greater than 0",
      });
    }
  });


  // Instructions sheet
  const info = wb.addWorksheet("Instructions");
  info.columns = [{ width: 22 }, { width: 90 }];
  const put = (a: string, b: string, bold = false) => {
    const r = info.addRow([a, b]);
    r.getCell(1).font = { bold: true };
    if (bold) r.getCell(2).font = { bold: true };
    r.getCell(2).alignment = { wrapText: true, vertical: "top" };
  };
  put(MODE_LABEL[mode], "Bulk template — fill only the rows you want to change.", true);
  put("Blank row", "A row where every value column is blank means NO CHANGE for that employee. It is skipped.");
  put("badge_id", "Match key. Do not edit or reorder — the name column is only for your reference.");
  MODE_COLUMNS[mode].forEach((c) => put(c, (COL_HELP[c] || "") + (LIST_OPTIONS[c] ? ` (${LIST_OPTIONS[c].join(" | ")})` : "")));
  put("Upload", "Save the file and upload it back on the same tab. Nothing is written until you confirm the review.");

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const two = (n: number) => String(n).padStart(2, "0");
const fmtDate = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;

function cellToString(v: any): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return fmtDate(v);
  if (typeof v === "object") {
    if ("text" in v) return String((v as any).text ?? "").trim();
    if ("result" in v) return cellToString((v as any).result);
    if ("richText" in v) return (v as any).richText.map((t: any) => t.text).join("").trim();
    return "";
  }
  return String(v).trim();
}

/** Reads .xlsx or .csv into the same { header, rows } shape the validator expects. */
export async function parseSpreadsheetFile(file: File): Promise<{ header: string[]; rows: string[][] }> {
  if (!/\.xlsx$/i.test(file.name)) return parseCsv(await file.text());

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.getWorksheet(SHEET) ?? wb.worksheets[0];
  if (!ws) throw new Error("The workbook has no sheets");

  const raw: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals: string[] = [];
    const n = Math.max(row.cellCount, row.actualCellCount);
    for (let c = 1; c <= n; c++) vals.push(cellToString(row.getCell(c).value));
    raw.push(vals);
  });

  const usable = raw.filter((r) => r.some((f) => f !== "") && !String(r[0] ?? "").startsWith("#"));
  const header = (usable.shift() ?? []).map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return { header, rows: usable };
}
