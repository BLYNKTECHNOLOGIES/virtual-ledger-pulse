import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, DownloadCloud, AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { HorillaLayout } from "@/components/hrms/HorillaLayout";

type PerMonth = {
  period_month: string;
  pulled: number;
  reflected: number;
  withPdf: number;
  missingMap: number;
  error: string | null;
};

type ImportResult = {
  ok: boolean;
  envelope_ready: boolean;
  months: number;
  totals: {
    pulled: number;
    reflected: number;
    withPdf: number;
    missingMap: number;
    pullFailures: number;
  };
  per_month: PerMonth[];
  note: string;
};

function monthDefault(offset: number) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function PayslipHistoryImportPage() {
  const [from, setFrom] = useState(monthDefault(11));
  const [to, setTo] = useState(monthDefault(1));
  const [pullFromRazorpay, setPullFromRazorpay] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function runImport() {
    if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) {
      toast({ title: "Invalid range", description: "Use YYYY-MM for both months.", variant: "destructive" });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("razorpay-payroll-proxy", {
        body: {
          action: "import_payslip_history_range",
          payload: { period_from: from, period_to: to, pull_from_razorpay: pullFromRazorpay },
        },
      });
      if (error) throw error;
      setResult(data as ImportResult);
      toast({
        title: "Import finished",
        description: `Reflected ${data?.totals?.reflected ?? 0} payslip rows across ${data?.months ?? 0} month(s).`,
      });
    } catch (e: any) {
      toast({ title: "Import failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <HorillaLayout>
      <div className="max-w-5xl mx-auto space-y-4 p-4">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold">Payslip History Import (RazorpayX)</h1>
            <p className="text-sm text-muted-foreground">
              Pull past monthly payslips from RazorpayX into each employee's ERP payslip history.
            </p>
          </div>
        </div>

        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>What this imports</AlertTitle>
          <AlertDescription className="text-sm space-y-1">
            <div>• Summary numbers per month: <b>Gross</b>, <b>Total Deductions</b>, <b>Net Pay</b>, <b>TDS</b>.</div>
            <div>• A link to the original RazorpayX <b>PDF payslip</b>, when the API returns one.</div>
            <div className="text-muted-foreground">
              Component-level breakdown (Basic / HRA / PF / etc.) is <b>not</b> exposed by the RazorpayX
              payslip API — those live only inside the PDF. For component-level history use a CSV export
              from the RazorpayX dashboard (separate flow).
            </div>
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Range</CardTitle>
            <CardDescription>Pick a start and end month (YYYY-MM). Max 36 months per run.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="from">From (YYYY-MM)</Label>
                <Input id="from" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="2024-04" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="to">To (YYYY-MM)</Label>
                <Input id="to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="2025-03" />
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={pullFromRazorpay}
                onChange={(e) => setPullFromRazorpay(e.target.checked)}
              />
              <span>
                Pull fresh data from RazorpayX before reflecting into ERP history.
                <span className="text-muted-foreground">
                  {" "}Uncheck to only reflect data already cached in the shadow table.
                </span>
              </span>
            </label>
            <Button onClick={runImport} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <DownloadCloud className="h-4 w-4 mr-2" />}
              Import payslip history
            </Button>
          </CardContent>
        </Card>

        {result && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Result
              </CardTitle>
              <CardDescription>{result.note}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant={result.envelope_ready ? "default" : "destructive"}>
                  RazorpayX envelope: {result.envelope_ready ? "verified" : "not verified"}
                </Badge>
                <Badge variant="secondary">Months: {result.months}</Badge>
                <Badge variant="secondary">Pulled: {result.totals.pulled}</Badge>
                <Badge variant="secondary">Reflected: {result.totals.reflected}</Badge>
                <Badge variant="secondary">With PDF: {result.totals.withPdf}</Badge>
                {result.totals.missingMap > 0 && (
                  <Badge variant="destructive">Unmapped: {result.totals.missingMap}</Badge>
                )}
                {result.totals.pullFailures > 0 && (
                  <Badge variant="destructive">Pull failures: {result.totals.pullFailures}</Badge>
                )}
              </div>

              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="px-3 py-2">Month</th>
                      <th className="px-3 py-2 text-right">Pulled</th>
                      <th className="px-3 py-2 text-right">Reflected</th>
                      <th className="px-3 py-2 text-right">With PDF</th>
                      <th className="px-3 py-2 text-right">Unmapped</th>
                      <th className="px-3 py-2">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.per_month.map((m) => (
                      <tr key={m.period_month} className="border-t">
                        <td className="px-3 py-2 font-mono">{m.period_month}</td>
                        <td className="px-3 py-2 text-right">{m.pulled}</td>
                        <td className="px-3 py-2 text-right">{m.reflected}</td>
                        <td className="px-3 py-2 text-right">{m.withPdf}</td>
                        <td className="px-3 py-2 text-right">{m.missingMap}</td>
                        <td className="px-3 py-2 text-muted-foreground">{m.error ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!result.envelope_ready && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Envelope not verified</AlertTitle>
                  <AlertDescription className="text-sm">
                    Go to <b>Payroll → RazorpayX Sync → Phase 9 (Payslips & Tax Docs)</b>, probe the payslip
                    endpoint with a known period, and mark the returned envelope as verified. Then re-run this
                    import — historical months will populate automatically.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </HorillaLayout>
  );
}
