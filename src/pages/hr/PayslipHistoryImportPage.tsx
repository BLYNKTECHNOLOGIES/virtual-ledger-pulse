import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, DownloadCloud, AlertTriangle, CheckCircle2, FileText, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";


type PerMonth = {
  period_month: string;
  pulled: number;
  reflected: number;
  withPdf: number;
  missingMap: number;
  error: string | null;
  run_status?: string | null;
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
    skippedNoRun?: number;
    skippedUnfinalised?: number;
  };
  per_month: PerMonth[];
  note: string;
};

type DiscoverPerMonth = {
  period_month: string;
  http_status: number;
  executed: boolean;
  existing_status: string | null;
  seeded: boolean;
  action: string;
  signals: Record<string, unknown>;
};

type DiscoverResult = {
  ok: boolean;
  pilot: { email_domain: string | null; rp_id: string | null; hr_id: string | null; reason: string };
  months: number;
  summary: { executed: number; seeded: number; already_bulk_applied: number; not_executed: number };
  per_month: DiscoverPerMonth[];
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
  const [pilotRpId, setPilotRpId] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [importing, setImporting] = useState(false);
  const [discovery, setDiscovery] = useState<DiscoverResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  function validRange(): boolean {
    if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) {
      toast({ title: "Invalid range", description: "Use YYYY-MM for both months.", variant: "destructive" });
      return false;
    }
    return true;
  }

  async function runDiscovery() {
    if (!validRange()) return;
    setDiscovering(true);
    setDiscovery(null);
    try {
      const { data, error } = await supabase.functions.invoke("razorpay-payroll-proxy", {
        body: {
          action: "discover_and_seed_runs",
          payload: {
            period_from: from,
            period_to: to,
            ...(pilotRpId.trim() ? { pilot_razorpay_employee_id: pilotRpId.trim() } : {}),
          },
        },
      });
      if (error) throw error;
      setDiscovery(data as DiscoverResult);
      const s = (data as DiscoverResult).summary;
      toast({
        title: "Discovery complete",
        description: `${s.executed} executed month(s) found · ${s.seeded} seeded · ${s.already_bulk_applied} already ready · ${s.not_executed} skipped.`,
      });
    } catch (e: any) {
      toast({ title: "Discovery failed", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setDiscovering(false);
    }
  }

  async function runImport() {
    if (!validRange()) return;
    setImporting(true);
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
      setImporting(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4 p-4">
      <div className="flex items-center gap-3">
        <FileText className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Payslip History Import (RazorpayX)</h1>
          <p className="text-sm text-muted-foreground">
            Pull past monthly payroll records from RazorpayX into each employee's ERP payroll history.
          </p>
        </div>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>How this works</AlertTitle>
        <AlertDescription className="text-sm space-y-1">
          <div><b>Step 1 — Discover.</b> Probes one pilot employee per month against <code>payroll:view-payroll</code> and detects which months were actually executed on RazorpayX (real deductions/statutory/net &lt; gross). Executed months are seeded as <code>bulk_applied</code> so the import gate opens.</div>
          <div><b>Step 2 — Import.</b> Pulls per-employee summary numbers (Gross, Total Deductions, Net, TDS, PF, ESI, PT) only for seeded months.</div>
          <div className="text-muted-foreground">Payslip PDFs are dashboard-only — the Opfin API exposes no PDF/download endpoint.</div>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Range &amp; pilot</CardTitle>
          <CardDescription>Pick a start and end month (YYYY-MM). Max 36 months per run. Leave pilot blank to auto-pick.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="from">From (YYYY-MM)</Label>
              <Input id="from" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="2024-04" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to">To (YYYY-MM)</Label>
              <Input id="to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="2025-03" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pilot">Pilot RazorpayX employee-id (optional)</Label>
              <Input id="pilot" value={pilotRpId} onChange={(e) => setPilotRpId(e.target.value)} placeholder="auto" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={runDiscovery} disabled={discovering} variant="secondary">
              {discovering ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
              Step 1 — Discover executed months
            </Button>
            <Button onClick={runImport} disabled={importing}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <DownloadCloud className="h-4 w-4 mr-2" />}
              Step 2 — Import payslip history
            </Button>
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
        </CardContent>
      </Card>

      {discovery && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="h-4 w-4 text-primary" />
              Discovery — executed run detection
            </CardTitle>
            <CardDescription>
              Pilot rpId <b>{discovery.pilot.rp_id ?? "auto"}</b> ({discovery.pilot.reason}). {discovery.note}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="secondary">Months probed: {discovery.months}</Badge>
              <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30" variant="outline">Executed: {discovery.summary.executed}</Badge>
              <Badge variant="outline">Seeded: {discovery.summary.seeded}</Badge>
              <Badge variant="outline">Already ready: {discovery.summary.already_bulk_applied}</Badge>
              <Badge variant="secondary">Not executed: {discovery.summary.not_executed}</Badge>
            </div>
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="px-3 py-2">Month</th>
                    <th className="px-3 py-2">HTTP</th>
                    <th className="px-3 py-2">Executed?</th>
                    <th className="px-3 py-2">Existing run</th>
                    <th className="px-3 py-2">Action</th>
                    <th className="px-3 py-2 text-right">Gross</th>
                    <th className="px-3 py-2 text-right">Net</th>
                    <th className="px-3 py-2 text-right">Deductions</th>
                  </tr>
                </thead>
                <tbody>
                  {discovery.per_month.map((m) => {
                    const s = m.signals as any;
                    return (
                      <tr key={m.period_month} className="border-t">
                        <td className="px-3 py-2 font-mono">{m.period_month}</td>
                        <td className="px-3 py-2">{m.http_status}</td>
                        <td className="px-3 py-2">
                          {m.executed
                            ? <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30" variant="outline">yes</Badge>
                            : <Badge variant="outline">no</Badge>}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{m.existing_status ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{m.action}</td>
                        <td className="px-3 py-2 text-right">{s?.gross ?? "—"}</td>
                        <td className="px-3 py-2 text-right">{s?.net ?? "—"}</td>
                        <td className="px-3 py-2 text-right">{s?.deductions ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Import result
            </CardTitle>
            <CardDescription>{result.note}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="secondary">Source: payroll:view-payroll</Badge>
              <Badge variant="secondary">Months: {result.months}</Badge>
              <Badge variant="secondary">Pulled: {result.totals.pulled}</Badge>
              <Badge variant="secondary">Reflected: {result.totals.reflected}</Badge>
              <Badge variant="secondary">PDF: dashboard only</Badge>
              {typeof result.totals.skippedNoRun === "number" && result.totals.skippedNoRun > 0 && (
                <Badge variant="outline">Skipped (no run): {result.totals.skippedNoRun}</Badge>
              )}
              {result.totals.missingMap > 0 && (
                <Badge variant="destructive">Unmapped: {result.totals.missingMap}</Badge>
              )}
              {result.totals.pullFailures > 0 && (
                <Badge variant="destructive">Pull failures: {result.totals.pullFailures}</Badge>
              )}
            </div>

            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="px-3 py-2">Month</th>
                    <th className="px-3 py-2">Run status</th>
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
                      <td className="px-3 py-2 text-muted-foreground">{m.run_status ?? "—"}</td>
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

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>PDF limitation</AlertTitle>
              <AlertDescription className="text-sm">
                RazorpayX Opfin has no payslip PDF/download endpoint in the official collection. This import stores the payroll numbers the API exposes; original payslip documents must be viewed from the Razorpay dashboard.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

