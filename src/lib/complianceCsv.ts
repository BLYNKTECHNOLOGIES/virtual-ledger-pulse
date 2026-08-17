// Shared CSV export for compliance lists.

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.join(" | ") : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T extends object>(
  rows: T[],
  columns: { key: keyof T | string; label: string; value?: (row: T) => unknown }[],
): string {
  const head = columns.map((c) => cell(c.label)).join(",");
  const body = rows
    .map((r) => columns.map((c) => cell(c.value ? c.value(r) : (r as Record<string, unknown>)[c.key as string])).join(","))
    .join("\n");
  return `${head}\n${body}`;
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportRowsToCsv<T extends object>(
  filename: string,
  rows: T[],
  columns: { key: keyof T | string; label: string; value?: (row: T) => unknown }[],
) {
  downloadCsv(`${filename}-${new Date().toISOString().slice(0, 10)}`, toCsv(rows, columns));
}
