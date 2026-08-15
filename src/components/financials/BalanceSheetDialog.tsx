import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, Download, FileSpreadsheet, Info } from "lucide-react";
import {
  exportBalanceSheetPdf,
  exportBalanceSheetXlsx,
  inr,
  type BalanceSheetLine,
  type IntegrityFinding,
} from "@/lib/exportBalanceSheet";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface EntityRow {
  subsidiary_id: string;
  legal_name: string;
  gst_number: string | null;
  pan_number: string | null;
}

const basisTone: Record<string, string> = {
  reconciled: "text-success",
  source: "text-foreground",
  classified: "text-foreground",
  derived: "text-muted-foreground",
  review: "text-warning",
  unresolved: "text-destructive",
};

export function BalanceSheetDialog({ open, onOpenChange }: Props) {
  const [entityId, setEntityId] = useState<string>("");
  const [asOf, setAsOf] = useState<string>(() => format(new Date(), "yyyy-MM-dd"));

  const { data: entities, isLoading: entitiesLoading } = useQuery({
    queryKey: ["fin-entity-master"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fin_entity_master_v" as any)
        .select("subsidiary_id, legal_name, gst_number, pan_number")
        .order("legal_name");
      if (error) throw error;
      return (data || []) as unknown as EntityRow[];
    },
  });

  const entity = entities?.find((e) => e.subsidiary_id === entityId);

  const { data, isFetching, error } = useQuery({
    queryKey: ["fin-balance-sheet", entityId, asOf],
    enabled: open && !!entityId && !!asOf,
    queryFn: async () => {
      const [sheet, integrity] = await Promise.all([
        supabase.rpc("fin_entity_balance_sheet" as any, {
          p_subsidiary_id: entityId,
          p_as_of: asOf,
        }),
        supabase.rpc("fin_entity_integrity" as any, {
          p_subsidiary_id: entityId,
          p_as_of: asOf,
        }),
      ]);
      if (sheet.error) throw sheet.error;
      if (integrity.error) throw integrity.error;
      return {
        lines: ((sheet.data || []) as unknown as BalanceSheetLine[]).sort(
          (a, b) => a.sort_order - b.sort_order,
        ),
        findings: (integrity.data || []) as unknown as IntegrityFinding[],
      };
    },
  });

  const lines = data?.lines || [];
  const findings = data?.findings || [];
  const meta = {
    entityName: entity?.legal_name?.trim() || "",
    gstin: entity?.gst_number,
    pan: entity?.pan_number,
    asOf,
    generatedAt: format(new Date(), "dd MMM yyyy, HH:mm"),
  };

  const renderSection = (section: string, title: string) => {
    const rows = lines.filter((l) => l.section === section);
    if (!rows.length) return null;
    return (
      <div key={section} className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-2.5">
          <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        </div>
        <div className="divide-y divide-border/60">
          {rows.map((r) => {
            const isTotal = r.line_key.startsWith("total_");
            return (
              <div
                key={r.line_key}
                className={`flex items-start justify-between gap-4 px-4 py-2.5 ${
                  isTotal ? "bg-muted/40" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm ${isTotal ? "font-semibold text-foreground" : "text-foreground"}`}
                    >
                      {r.line_label}
                    </span>
                    {r.note && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs">{r.note}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                  <span className={`text-[11px] uppercase tracking-wide ${basisTone[r.confidence] || "text-muted-foreground"}`}>
                    {r.confidence}
                  </span>
                </div>
                <span
                  className={`shrink-0 tabular-nums text-sm ${
                    isTotal ? "font-semibold text-foreground" : "text-foreground"
                  }`}
                >
                  ₹{inr(Number(r.amount))}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Balance Sheet</DialogTitle>
          <DialogDescription>
            Company-wise statement of financial position built from the bank ledger. Unsupported
            areas are disclosed, never estimated.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">Company</Label>
            <Select value={entityId} onValueChange={setEntityId} disabled={entitiesLoading}>
              <SelectTrigger className="text-foreground">
                <SelectValue placeholder={entitiesLoading ? "Loading…" : "Select a company"} />
              </SelectTrigger>
              <SelectContent>
                {(entities || []).map((e) => (
                  <SelectItem key={e.subsidiary_id} value={e.subsidiary_id}>
                    {e.legal_name?.trim()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">As at</Label>
            <Input
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
              className="text-foreground"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!lines.length}
              onClick={() => exportBalanceSheetPdf(lines, findings, meta)}
            >
              <Download className="mr-1.5 h-4 w-4" />
              PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!lines.length}
              onClick={() => exportBalanceSheetXlsx(lines, findings, meta)}
            >
              <FileSpreadsheet className="mr-1.5 h-4 w-4" />
              Excel
            </Button>
          </div>
        </div>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          {!entityId && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Select a company and reporting date to generate the statement.
            </p>
          )}

          {error && (
            <p className="text-sm text-destructive">
              {(error as Error).message || "Could not generate the balance sheet."}
            </p>
          )}

          {entityId && isFetching && (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          )}

          {entityId && !isFetching && lines.length > 0 && (
            <>
              {renderSection("ASSETS", "Assets")}
              {renderSection("LIABILITIES", "Liabilities")}
              {renderSection("EQUITY", "Equity (derived from ledger flows)")}
              {renderSection("CHECK", "Reconciliation check")}

              {findings.length > 0 && (
                <div className="rounded-lg border border-warning/40 bg-warning/5">
                  <div className="flex items-center gap-2 border-b border-warning/30 px-4 py-2.5">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    <h4 className="text-sm font-semibold text-foreground">
                      Data-integrity findings
                    </h4>
                  </div>
                  <div className="divide-y divide-warning/20">
                    {findings.map((f, i) => (
                      <div key={`${f.code}-${i}`} className="px-4 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-foreground">{f.title}</span>
                          <Badge
                            variant={f.severity === "critical" ? "destructive" : "secondary"}
                            className="shrink-0 text-[10px] uppercase"
                          >
                            {f.severity}
                          </Badge>
                        </div>
                        {f.detail && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{f.detail}</p>
                        )}
                        {(f.impact_amount != null || f.affected_count) && (
                          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                            {f.impact_amount != null && <>Impact ₹{inr(Number(f.impact_amount))} </>}
                            {f.affected_count ? <>· {f.affected_count} record(s)</> : null}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Prepared from bank ledger data recorded in the ERP. Crypto inventory, fixed assets,
                capital accounts, borrowings and statutory dues are not maintained as ledgers and are
                therefore not presented. No balancing or plug entries are made — any difference is
                reported in the reconciliation check.
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
