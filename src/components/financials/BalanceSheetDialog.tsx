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
import { AlertTriangle, Download, FileSpreadsheet, Info, ShieldAlert } from "lucide-react";
import {
  exportBalanceSheetPdf,
  exportBalanceSheetXlsx,
  NOT_AVAILABLE,

  balanceSheetChecksum,
  cryptoDisclosureNote,
  gstinText,
  panText,
  inr,
  type BalanceSheetLine,
  type BalanceSheetMode,
  type IntegrityFinding,
} from "@/lib/exportBalanceSheet";

import { WalletEntityMappingPanel } from "./balance-sheet/WalletEntityMappingPanel";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface EntityRow {
  subsidiary_id: string;
  legal_name: string;
  gst_number: string | null;
  pan_number: string | null;
  firm_composition: string | null;
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
  const [valuationBasis, setValuationBasis] = useState<string>("COST");
  const [mode, setMode] = useState<BalanceSheetMode>("MANAGEMENT");
  const [showMapping, setShowMapping] = useState(false);
  const isManagement = mode === "MANAGEMENT";

  const { data: entities, isLoading: entitiesLoading } = useQuery({
    queryKey: ["fin-entity-master"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fin_entity_master_v" as any)
        .select("subsidiary_id, legal_name, gst_number, pan_number, firm_composition")
        .order("legal_name");
      if (error) throw error;
      return (data || []) as unknown as EntityRow[];
    },
  });

  const entity = entities?.find((e) => e.subsidiary_id === entityId);

  const { data, isFetching, error } = useQuery({
    queryKey: ["fin-balance-sheet", entityId, asOf, valuationBasis, mode],
    enabled: open && !!entityId && !!asOf,
    queryFn: async () => {
      // Bring the cached crypto order feed up to date before deriving inventory.
      await supabase.rpc("fin_crypto_refresh" as any);

      const [sheet, integrity] = await Promise.all([
        supabase.rpc("fin_entity_balance_sheet" as any, {
          p_subsidiary_id: entityId,
          p_as_of: asOf,
          p_valuation_basis: valuationBasis,
          p_mode: mode,
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

  const failedChecks = findings.filter((f) => f.severity === "critical").map((f) => f.title);
  const balanceCheck = lines.find((l) => l.line_key === "balance_check");
  const balanceOff = Math.abs(Number(balanceCheck?.amount || 0)) > 0.01;
  if (balanceOff) failedChecks.push("Assets do not equal liabilities plus equity");
  const isDraft = failedChecks.length > 0;

  const visibleLines = isManagement ? lines.filter((l) => l.section !== "CHECK") : lines;

  const inventoryLine = lines.find((l) => l.line_key === "inventory");
  const isCompany = (entity?.firm_composition || "").toUpperCase() === "PRIVATE_LIMITED";
  const cryptoNote = isCompany
    ? cryptoDisclosureNote(Number(inventoryLine?.amount || 0), valuationBasis)
    : null;

  const meta = {
    entityName: entity?.legal_name?.trim() || "",
    gstin: entity?.gst_number,
    pan: entity?.pan_number,
    asOf,
    generatedAt: format(new Date(), "dd MMM yyyy, HH:mm"),
    firmComposition: entity?.firm_composition,
    valuationBasis,
    isDraft,
    failedChecks,
    checksum: lines.length
      ? balanceSheetChecksum(lines, { entityName: entity?.legal_name?.trim() || "", asOf })
      : undefined,
    cryptoNote,
    mode,
  };


  const logGeneration = async (formatKind: "PDF" | "XLSX") => {
    try {
      const { data: userRes } = await supabase.auth.getUser();
      await supabase.from("fin_balance_sheet_generation_log" as any).insert({
        subsidiary_id: entityId,
        period_start: asOf,
        period_end: asOf,
        valuation_basis: valuationBasis,
        is_draft: isDraft,
        failed_checks: failedChecks,
        checksum: meta.checksum ?? null,
        totals: {
          total_assets: Number(lines.find((l) => l.line_key === "total_assets")?.amount || 0),
          total_liabilities: Number(
            lines.find((l) => l.line_key === "total_liabilities")?.amount || 0,
          ),
          total_equity: Number(lines.find((l) => l.line_key === "total_equity")?.amount || 0),
        },
        export_format: formatKind,
        generated_by: userRes?.user?.id ?? null,
      } as any);
    } catch {
      /* logging must never block the export */
    }
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
                    r.amount === null || r.amount === undefined
                      ? "text-[11px] uppercase tracking-wide text-muted-foreground"
                      : isTotal
                        ? "font-semibold text-foreground"
                        : "text-foreground"
                  }`}
                >
                  {r.amount === null || r.amount === undefined
                    ? NOT_AVAILABLE
                    : `₹${inr(Number(r.amount))}`}
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
              onClick={() => {
                exportBalanceSheetPdf(lines, findings, meta);
                logGeneration("PDF");
              }}
            >
              <Download className="mr-1.5 h-4 w-4" />
              PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!lines.length}
              onClick={() => {
                exportBalanceSheetXlsx(lines, findings, meta);
                logGeneration("XLSX");
              }}
            >
              <FileSpreadsheet className="mr-1.5 h-4 w-4" />
              Excel
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Crypto inventory valuation basis</Label>
            <Select value={valuationBasis} onValueChange={setValuationBasis}>
              <SelectTrigger className="w-[280px] text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="COST">Cost (weighted average purchase)</SelectItem>
                <SelectItem value="MARKET">Market (latest available price)</SelectItem>
                <SelectItem value="LCOM">Lower of cost or market</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowMapping((v) => !v)}>
            {showMapping ? "Hide" : "Manage"} wallet mapping
          </Button>
        </div>

        {showMapping && (
          <WalletEntityMappingPanel
            entities={(entities || []).map((e) => ({
              subsidiary_id: e.subsidiary_id,
              legal_name: e.legal_name,
            }))}
          />
        )}

        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          {!entityId && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Select a company and reporting date to generate the statement.
            </p>
          )}

          {isDraft && !!lines.length && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="text-xs text-destructive">
                <p className="font-semibold">DRAFT — FAILED VERIFICATION</p>
                <p className="mt-0.5">
                  {failedChecks.join("; ")}. Exports carry the same watermark and must not be used as
                  final financial statements.
                </p>
              </div>
            </div>
          )}

          {cryptoNote && !!lines.length && (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5">
              <p className="text-xs font-semibold text-foreground">Crypto currency disclosure</p>
              <ul className="mt-1 space-y-1 text-[11px] text-muted-foreground">
                {cryptoNote.slice(1).map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
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
