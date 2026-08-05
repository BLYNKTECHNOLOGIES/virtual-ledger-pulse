import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, Info } from "lucide-react";

export type DrillTone = "default" | "good" | "warn" | "bad";

export type DrillStat = { label: string; value: string; hint?: string; tone?: DrillTone };

export type DrillCell = { value: string; tone?: DrillTone };

export type DrillRow = {
  id: string;
  dept?: string;
  cells: DrillCell[];
  /** Sort key, descending. */
  rank?: number;
};

export type DrillPayload = {
  title: string;
  subtitle?: string;
  /** Plain-English explanation of how this point was inferred from raw data. */
  narrative: string;
  /** The arithmetic behind the plotted number, shown verbatim. */
  formula?: { expression: string; result: string };
  stats: DrillStat[];
  /** Column headers after the Employee column. */
  columns: string[];
  rows: DrillRow[];
  emptyText?: string;
  /** Extra caveats — coverage gaps, suspect data, exclusions. */
  notes?: string[];
};

const toneClass: Record<DrillTone, string> = {
  default: "text-foreground",
  good: "text-success",
  warn: "text-warning",
  bad: "text-destructive",
};

export function AttendanceDrilldownDialog({
  payload,
  onOpenChange,
  renderPerson,
  nameOf,
}: {
  payload: DrillPayload | null;
  onOpenChange: (open: boolean) => void;
  renderPerson: (id: string) => React.ReactNode;
  nameOf: (id: string) => string;
}) {
  const exportCsv = () => {
    if (!payload) return;
    const head = ["Employee", "Department", ...payload.columns];
    const lines = [head, ...payload.rows.map((r) => [nameOf(r.id), r.dept || "", ...r.cells.map((c) => c.value)])]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([lines], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${payload.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={!!payload} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col gap-0 p-0">
        {payload && (
          <>
            <DialogHeader className="px-6 pt-6 pb-4 border-b space-y-1">
              <DialogTitle className="text-base font-semibold text-foreground">{payload.title}</DialogTitle>
              {payload.subtitle && <p className="text-xs text-muted-foreground">{payload.subtitle}</p>}
            </DialogHeader>

            <ScrollArea className="flex-1 min-h-0">
              <div className="px-6 py-5 space-y-5">
                {/* How this point was inferred */}
                <div className="rounded-lg border bg-muted/30 p-3.5">
                  <p className="flex items-start gap-2 text-[13px] leading-relaxed text-foreground">
                    <Info className="h-4 w-4 mt-0.5 shrink-0 text-info" />
                    <span>{payload.narrative}</span>
                  </p>
                  {payload.formula && (
                    <div className="mt-3 ml-6 rounded-md border bg-background px-3 py-2 font-mono text-[12px] tabular-nums text-foreground">
                      {payload.formula.expression}
                      <span className="text-muted-foreground"> = </span>
                      <span className="font-semibold">{payload.formula.result}</span>
                    </div>
                  )}
                  {payload.notes && payload.notes.length > 0 && (
                    <ul className="mt-3 ml-6 space-y-1">
                      {payload.notes.map((n) => (
                        <li key={n} className="text-[11px] text-muted-foreground leading-relaxed">
                          • {n}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Stats */}
                {payload.stats.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {payload.stats.map((s) => (
                      <div key={s.label} className="rounded-lg border p-3">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{s.label}</p>
                        <p className={`mt-1 text-xl font-semibold tabular-nums leading-none ${toneClass[s.tone || "default"]}`}>{s.value}</p>
                        {s.hint && <p className="mt-1 text-[11px] text-muted-foreground leading-snug">{s.hint}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {/* People behind the number */}
                <div className="rounded-lg border overflow-hidden">
                  <div className="flex items-center justify-between gap-3 bg-muted/40 px-4 py-2 border-b">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Who makes up this number
                      {payload.rows.length > 0 && <span className="ml-1.5 normal-case">({payload.rows.length})</span>}
                    </p>
                    {payload.rows.length > 0 && (
                      <Button variant="ghost" size="sm" className="h-6 gap-1.5 text-[11px]" onClick={exportCsv}>
                        <Download className="h-3 w-3" /> CSV
                      </Button>
                    )}
                  </div>
                  {payload.rows.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">{payload.emptyText || "No employees behind this point."}</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b bg-background">
                          <tr>
                            <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              Employee
                            </th>
                            <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              Department
                            </th>
                            {payload.columns.map((c) => (
                              <th
                                key={c}
                                className="px-4 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap"
                              >
                                {c}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {payload.rows.map((r) => (
                            <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                              <td className="px-4 py-2 font-medium max-w-[240px]">{renderPerson(r.id)}</td>
                              <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{r.dept || "Unassigned"}</td>
                              {r.cells.map((c, i) => (
                                <td
                                  key={i}
                                  className={`px-4 py-2 text-right tabular-nums whitespace-nowrap ${toneClass[c.tone || "default"]}`}
                                >
                                  {c.value}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DrillBadge() {
  return (
    <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal text-muted-foreground border-border">
      click to expand
    </Badge>
  );
}

export default AttendanceDrilldownDialog;
