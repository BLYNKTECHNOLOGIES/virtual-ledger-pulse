import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Download, Lightbulb } from "lucide-react";

export type EvidenceTone = "default" | "good" | "warn" | "bad" | "muted";

export type EvidenceCell = { value: string; tone?: EvidenceTone };

export type EvidenceRow = {
  key: string;
  /** First column — the date (or label) the exception was raised on. */
  label: string;
  sublabel?: string;
  cells: EvidenceCell[];
};

export type EvidencePayload = {
  /** Exception heading, e.g. "Days over 14 net hours". */
  exception: string;
  employeeName: string;
  employeeMeta?: string;
  /** Why this is flagged. */
  why: string;
  /** The rule that produced the flag, in plain arithmetic. */
  rule: string;
  stats: { label: string; value: string; hint?: string; tone?: EvidenceTone }[];
  columns: string[];
  rows: EvidenceRow[];
  /** What the reviewer should do about it. */
  actions: string[];
  emptyText?: string;
};

const toneClass: Record<EvidenceTone, string> = {
  default: "text-foreground",
  good: "text-success",
  warn: "text-warning",
  bad: "text-destructive",
  muted: "text-muted-foreground",
};

export function ExceptionEvidenceDialog({
  payload,
  onOpenChange,
}: {
  payload: EvidencePayload | null;
  onOpenChange: (open: boolean) => void;
}) {
  const exportCsv = () => {
    if (!payload) return;
    const head = ["Day", "Detail", ...payload.columns];
    const lines = [head, ...payload.rows.map((r) => [r.label, r.sublabel || "", ...r.cells.map((c) => c.value)])]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([lines], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${payload.employeeName}-${payload.exception}`.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={!!payload} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 gap-0">
        {payload && (
          <>
            <DialogHeader className="px-5 pt-5 pb-3 border-b">
              <DialogTitle className="text-base font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                <span className="truncate">{payload.employeeName}</span>
                <Badge variant="outline" className="font-normal text-[10px]">
                  {payload.rows.length} day{payload.rows.length === 1 ? "" : "s"}
                </Badge>
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                {payload.exception}
                {payload.employeeMeta ? ` · ${payload.employeeMeta}` : ""}
              </p>
            </DialogHeader>

            <ScrollArea className="max-h-[70vh]">
              <div className="p-5 space-y-4">
                <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                  <p className="text-[13px] leading-relaxed text-foreground">{payload.why}</p>
                  <p className="text-[11px] font-mono text-muted-foreground">{payload.rule}</p>
                </div>

                {payload.stats.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {payload.stats.map((s) => (
                      <div key={s.label} className="rounded-lg border bg-card p-2.5">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
                        <p className={`text-sm font-semibold tabular-nums ${toneClass[s.tone || "default"]}`}>{s.value}</p>
                        {s.hint && <p className="text-[10px] text-muted-foreground mt-0.5">{s.hint}</p>}
                      </div>
                    ))}
                  </div>
                )}

                <div className="rounded-lg border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 border-b">
                        <tr>
                          <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Day
                          </th>
                          {payload.columns.map((c) => (
                            <th
                              key={c}
                              className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap"
                            >
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {payload.rows.length === 0 && (
                          <tr>
                            <td
                              colSpan={payload.columns.length + 1}
                              className="px-3 py-6 text-center text-xs text-muted-foreground"
                            >
                              {payload.emptyText || "No underlying rows found."}
                            </td>
                          </tr>
                        )}
                        {payload.rows.map((r) => (
                          <tr key={r.key} className="border-b last:border-0 hover:bg-muted/40">
                            <td className="px-3 py-2 whitespace-nowrap">
                              <span className="font-medium">{r.label}</span>
                              {r.sublabel && (
                                <span className="block text-[11px] text-muted-foreground">{r.sublabel}</span>
                              )}
                            </td>
                            {r.cells.map((c, i) => (
                              <td
                                key={i}
                                className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${toneClass[c.tone || "default"]}`}
                              >
                                {c.value}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {payload.actions.length > 0 && (
                  <div className="rounded-lg border border-info/30 bg-info/5 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-info flex items-center gap-1.5">
                      <Lightbulb className="h-3.5 w-3.5" /> How to clear this
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {payload.actions.map((a) => (
                        <li key={a} className="text-[12px] text-muted-foreground pl-3 border-l-2 border-info/30">
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex justify-end">
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={exportCsv}>
                    <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
                  </Button>
                </div>
              </div>
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default ExceptionEvidenceDialog;
