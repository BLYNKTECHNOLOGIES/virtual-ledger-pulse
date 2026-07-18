import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Download, ExternalLink, RefreshCw, FileText, AlertCircle } from "lucide-react";

interface Props {
  hrEmployeeId: string;
  razorpayEmployeeId?: string | null;
}

const IN_MONTH = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
};
const INR = (n: any) =>
  n == null || n === "" ? "—" : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** Recursively pick numeric leaves from source_payload, ignoring known meta keys. */
function flattenBreakdown(obj: any, prefix = ""): Array<{ key: string; value: number }> {
  if (!obj || typeof obj !== "object") return [];
  const skip = new Set([
    "employee-id","employee_id","employeeId","payslip-id","payslip_id","id",
    "pdf-url","pdf_url","download-url","url","period","month","year",
  ]);
  const out: Array<{ key: string; value: number }> = [];
  for (const [k, v] of Object.entries(obj)) {
    if (skip.has(k)) continue;
    const label = prefix ? `${prefix} → ${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out.push(...flattenBreakdown(v, label));
    } else if (typeof v === "number" || (typeof v === "string" && v !== "" && !isNaN(Number(v)))) {
      const num = Number(v);
      if (Number.isFinite(num) && num !== 0) out.push({ key: label, value: num });
    }
  }
  return out;
}

export function RazorpayPayslipsSection({ hrEmployeeId, razorpayEmployeeId }: Props) {
  const qc = useQueryClient();
  const [openRow, setOpenRow] = useState<any | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["rzp_payslips_emp", hrEmployeeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_razorpay_payslip_records")
        .select("*")
        .eq("hr_employee_id", hrEmployeeId)
        .order("period_month", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!hrEmployeeId,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      // Sweep the last 24 months.
      const now = new Date();
      const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const past = new Date(now.getFullYear(), now.getMonth() - 23, 1);
      const from = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, "0")}`;

      const { data, error } = await supabase.functions.invoke("razorpay-payroll-proxy", {
        body: { action: "import_payslip_history_range", period_from: from, period_to: to, pull_from_razorpay: true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      const t = data?.totals || {};
      if (data?.envelope_ready === false) {
        toast.warning("Payslip envelope not verified in RazorpayX Sync. Reflected any existing shadow rows only.");
      } else {
        toast.success(`Synced from RazorpayX — ${t.reflected || 0} payslips (${t.withPdf || 0} PDFs).`);
      }
      qc.invalidateQueries({ queryKey: ["rzp_payslips_emp", hrEmployeeId] });
    },
    onError: (e: any) => toast.error(e?.message || "Failed to sync payslips"),
  });

  if (!razorpayEmployeeId) {
    return (
      <div className="border border-border rounded-lg p-4 bg-muted/30 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          This employee is not linked to a RazorpayX record. Once linked in the Razorpay Sync page, payslip history will appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-base font-semibold text-foreground">RazorpayX Payslip History</h3>
          <p className="text-xs text-muted-foreground">
            Computed and issued by RazorpayX · Linked ID: {razorpayEmployeeId}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Auto-synced daily from RazorpayX.
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-4">Loading…</p>
      ) : !rows || rows.length === 0 ? (
        <div className="border border-border rounded-lg p-6 text-center bg-muted/20">
          <FileText className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-foreground font-medium">No RazorpayX payslips yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Payslips will appear here automatically once RazorpayX finalizes the run.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {rows.map((r: any) => (
              <button
                key={r.id}
                onClick={() => setOpenRow(r)}
                className="w-full text-left border border-border rounded-lg p-3 bg-card hover:bg-muted/40 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">{IN_MONTH(r.period_month)}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">RazorpayX</p>
                  </div>
                  {r.pdf_url && <FileText className="w-4 h-4 text-primary shrink-0" />}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                  <span className="text-muted-foreground">Gross</span>
                  <span className="text-right text-foreground">{INR(r.gross_earnings)}</span>
                  <span className="text-muted-foreground">Deductions</span>
                  <span className="text-right text-destructive">{INR(r.total_deductions)}</span>
                  <span className="text-muted-foreground">Net Pay</span>
                  <span className="text-right font-semibold text-foreground">{INR(r.net_pay)}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block border border-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left py-2.5 px-3 text-xs font-semibold text-muted-foreground">Month</th>
                  <th className="text-right py-2.5 px-3 text-xs font-semibold text-muted-foreground">Gross</th>
                  <th className="text-right py-2.5 px-3 text-xs font-semibold text-muted-foreground">Deductions</th>
                  <th className="text-right py-2.5 px-3 text-xs font-semibold text-muted-foreground">TDS</th>
                  <th className="text-right py-2.5 px-3 text-xs font-semibold text-muted-foreground">Net Pay</th>
                  <th className="text-center py-2.5 px-3 text-xs font-semibold text-muted-foreground">PDF</th>
                  <th className="text-center py-2.5 px-3 text-xs font-semibold text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr
                    key={r.id}
                    className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                    onClick={() => setOpenRow(r)}
                  >
                    <td className="py-2.5 px-3 text-foreground font-medium">{IN_MONTH(r.period_month)}</td>
                    <td className="py-2.5 px-3 text-right text-foreground">{INR(r.gross_earnings)}</td>
                    <td className="py-2.5 px-3 text-right text-destructive">{INR(r.total_deductions)}</td>
                    <td className="py-2.5 px-3 text-right text-muted-foreground">{INR(r.tds_amount)}</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-foreground">{INR(r.net_pay)}</td>
                    <td className="py-2.5 px-3 text-center">
                      {r.pdf_url ? <FileText className="w-4 h-4 text-primary inline" /> : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="text-xs text-primary">View</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!openRow} onOpenChange={(o) => !o && setOpenRow(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Payslip · {openRow && IN_MONTH(openRow.period_month)}
            </DialogTitle>
          </DialogHeader>
          {openRow && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="border border-border rounded p-3 bg-muted/30">
                  <p className="text-[10px] uppercase text-muted-foreground">Gross</p>
                  <p className="text-sm font-semibold">{INR(openRow.gross_earnings)}</p>
                </div>
                <div className="border border-border rounded p-3 bg-muted/30">
                  <p className="text-[10px] uppercase text-muted-foreground">Deductions</p>
                  <p className="text-sm font-semibold text-destructive">{INR(openRow.total_deductions)}</p>
                </div>
                <div className="border border-border rounded p-3 bg-muted/30">
                  <p className="text-[10px] uppercase text-muted-foreground">TDS</p>
                  <p className="text-sm font-semibold">{INR(openRow.tds_amount)}</p>
                </div>
                <div className="border border-primary/40 rounded p-3 bg-primary/5">
                  <p className="text-[10px] uppercase text-muted-foreground">Net Pay</p>
                  <p className="text-sm font-bold text-primary">{INR(openRow.net_pay)}</p>
                </div>
              </div>

              {/* Breakdown from source_payload */}
              {openRow.source_payload && (
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2">Component Breakdown</h4>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <tbody>
                        {flattenBreakdown(openRow.source_payload).map((line, i) => (
                          <tr key={i} className="border-b border-border/40 last:border-0">
                            <td className="py-2 px-3 text-muted-foreground capitalize">{line.key.replace(/[-_]/g, " ")}</td>
                            <td className="py-2 px-3 text-right font-medium text-foreground">{INR(line.value)}</td>
                          </tr>
                        ))}
                        {flattenBreakdown(openRow.source_payload).length === 0 && (
                          <tr>
                            <td className="py-3 px-3 text-center text-muted-foreground text-xs" colSpan={2}>
                              RazorpayX did not return a component breakdown for this payslip.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border">
                {openRow.razorpay_payslip_id && (
                  <p>RazorpayX Payslip ID: <span className="font-mono text-foreground">{openRow.razorpay_payslip_id}</span></p>
                )}
                {openRow.variance != null && Math.abs(Number(openRow.variance)) >= 0.5 && (
                  <p className="text-warning">
                    Variance vs internal run: {INR(openRow.variance)} (expected {INR(openRow.expected_net)})
                  </p>
                )}
                {openRow.pulled_at && <p>Fetched {new Date(openRow.pulled_at).toLocaleString("en-IN")}</p>}
              </div>

              {/* PDF actions */}
              {openRow.pdf_url ? (
                <div className="flex gap-2 flex-wrap">
                  <Button asChild size="sm">
                    <a href={openRow.pdf_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4 mr-2" /> Open RazorpayX PDF
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <a href={openRow.pdf_url} download>
                      <Download className="w-4 h-4 mr-2" /> Download
                    </a>
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  No PDF URL returned by RazorpayX for this period.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
