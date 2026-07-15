import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, ShieldAlert, Lock, Play, ListChecks, CheckCircle2, DownloadCloud, AlertTriangle } from "lucide-react";

interface Settings {
  base_url: string;
  bulk_sync_unlocked: boolean;
  last_creds_validated_at: string | null;
  last_import_at: string | null;
}
interface FetchOneResponse {
  ok: boolean;
  http_status?: number;
  error?: string;
  employee_id?: number;
  preview?: { name: string; title: string; department: string; is_active: boolean };
  field_names?: string[];
  match?: { hr_employee_id: string | null; matched_by: "pan" | "phone" | "email" | null; action: "match" | "create_draft" };
}
interface DryRunRow {
  employee_id: number | null;
  status: "hit" | "miss" | "stopped";
  http_status?: number;
  name?: string; title?: string; department?: string; is_active?: boolean;
  matched_by?: "pan" | "phone" | "email" | null;
  action_planned?: "match" | "create_draft";
  hr_employee_id?: string | null;
  applied?: boolean; created?: boolean;
  note?: string;
}
interface DryRunResponse {
  ok: boolean;
  summary: { total: number; hits: number; matches: number; creates: number; misses: number; stopped: boolean };
  rows: DryRunRow[];
}

export default function RazorpaySyncPage() {
  const { hasPermission, isLoading: permLoading } = usePermissions();
  const canAccess = hasPermission("hrms_razorpay_sync");

  const [settings, setSettings] = useState<Settings | null>(null);

  // Step 1: validation
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState(false);

  // Step 2: pilot
  const [pilotId, setPilotId] = useState("1");
  const [fetching, setFetching] = useState(false);
  const [applyingPilot, setApplyingPilot] = useState(false);
  const [pilotPreview, setPilotPreview] = useState<FetchOneResponse | null>(null);
  const [pilotApplied, setPilotApplied] = useState<{ hr_employee_id: string; created: boolean; matched_by: string | null; employee_id: number } | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  // Step 3: bulk import
  const [startId, setStartId] = useState("1");
  const [maxId, setMaxId] = useState("100");
  const [dryRunning, setDryRunning] = useState(false);
  const [applyingBulk, setApplyingBulk] = useState(false);
  const [dryRun, setDryRun] = useState<DryRunResponse | null>(null);
  const [applied, setApplied] = useState<DryRunResponse | null>(null);

  const reloadSettings = async () => {
    const { data } = await supabase
      .from("hr_razorpay_settings")
      .select("base_url,bulk_sync_unlocked,last_creds_validated_at,last_import_at")
      .maybeSingle();
    setSettings(data as Settings | null);
  };

  useEffect(() => { if (canAccess) reloadSettings(); }, [canAccess]);

  const invoke = async <T,>(body: object): Promise<T> => {
    const { data, error } = await supabase.functions.invoke("razorpay-payroll-proxy", { body });
    if (error) throw error;
    return data as T;
  };

  const runValidate = async () => {
    setValidating(true);
    try {
      const d = await invoke<{ ok: boolean; http_status: number; error_body_snippet?: string }>({
        action: "validate_creds", employee_id: Number(pilotId) || 1,
      });
      setValidated(!!d.ok);
      toast({
        title: d.ok ? "Credentials valid" : "Validation failed",
        description: d.ok ? `HTTP ${d.http_status}` : (d.error_body_snippet ?? "See console"),
        variant: d.ok ? "default" : "destructive",
      });
      await reloadSettings();
    } catch (e: any) {
      toast({ title: "Request failed", description: e?.message, variant: "destructive" });
    } finally { setValidating(false); }
  };

  const runFetchOne = async () => {
    setFetching(true); setPilotPreview(null);
    try {
      const d = await invoke<FetchOneResponse>({ action: "fetch_one", employee_id: Number(pilotId) });
      setPilotPreview(d);
      if (!d.ok) toast({ title: "Fetch failed", description: d.error, variant: "destructive" });
    } catch (e: any) {
      toast({ title: "Request failed", description: e?.message, variant: "destructive" });
    } finally { setFetching(false); }
  };

  const runApplyPilot = async () => {
    setApplyingPilot(true);
    try {
      const d = await invoke<{ ok: boolean; hr_employee_id: string; created: boolean; matched_by: string | null }>({
        action: "apply_one", employee_id: Number(pilotId),
      });
      if (d.ok) setPilotApplied({ ...d, employee_id: Number(pilotId) });
      toast({
        title: d.ok ? "Pilot applied — please verify" : "Apply failed",
        description: d.ok ? `${d.created ? "Created draft" : "Matched"} (${d.matched_by ?? "new"}). Bulk sync stays LOCKED until you unlock.` : undefined,
        variant: d.ok ? "default" : "destructive",
      });
      await reloadSettings();
    } catch (e: any) {
      toast({ title: "Request failed", description: e?.message, variant: "destructive" });
    } finally { setApplyingPilot(false); }
  };

  const runUnlockBulk = async () => {
    if (!confirm("Confirm this Razorpay employee has been verified on the Razorpay dashboard AND in HRMS. Unlock bulk sync?")) return;
    setUnlocking(true);
    try {
      const d = await invoke<{ ok: boolean; error?: string }>({ action: "unlock_bulk" });
      toast({
        title: d.ok ? "Bulk sync unlocked" : "Unlock failed",
        description: d.ok ? "You can now run apply_range." : d.error,
        variant: d.ok ? "default" : "destructive",
      });
      await reloadSettings();
    } catch (e: any) {
      toast({ title: "Request failed", description: e?.message, variant: "destructive" });
    } finally { setUnlocking(false); }
  };

  // Chunk large ranges into smaller batches to avoid the 30s client-side
  // fetch timeout (see src/integrations/supabase/client.ts). Each chunk stays
  // well under the timeout while the overall run can cover 100s of IDs.
  const CHUNK_SIZE = 20;
  const runChunked = async (
    action: "dry_run_range" | "apply_range",
    from: number,
    to: number,
  ): Promise<DryRunResponse> => {
    const agg: DryRunResponse = {
      ok: true,
      summary: { total: 0, hits: 0, matches: 0, creates: 0, misses: 0, stopped: false },
      rows: [],
    };
    let consecutiveMisses = 0;
    for (let s = from; s <= to; s += CHUNK_SIZE) {
      const e = Math.min(s + CHUNK_SIZE - 1, to);
      const d = await invoke<DryRunResponse>({ action, start_id: s, max_id: e });
      agg.rows.push(...d.rows);
      agg.summary.total += d.summary.total;
      agg.summary.hits += d.summary.hits;
      agg.summary.matches += d.summary.matches;
      agg.summary.creates += d.summary.creates;
      agg.summary.misses += d.summary.misses;
      // Emulate server-side consecutive-miss stop across chunks.
      for (const r of d.rows) {
        if (r.status === "miss") consecutiveMisses++;
        else if (r.status === "hit") consecutiveMisses = 0;
      }
      if (d.summary.stopped || consecutiveMisses >= 30) {
        agg.summary.stopped = true;
        break;
      }
    }
    return agg;
  };

  const runDryRun = async () => {
    setDryRunning(true); setDryRun(null); setApplied(null);
    try {
      const d = await runChunked("dry_run_range", Number(startId), Number(maxId));
      setDryRun(d);
      toast({ title: "Dry-run complete", description: `${d.summary.hits} hits · ${d.summary.matches} matches · ${d.summary.creates} new drafts` });
    } catch (e: any) {
      toast({ title: "Dry-run failed", description: e?.message, variant: "destructive" });
    } finally { setDryRunning(false); }
  };

  const runApplyBulk = async () => {
    if (!confirm(`Apply import for employees ${startId}..${maxId}?\n\nThis will create draft rows for unmatched employees.`)) return;
    setApplyingBulk(true);
    try {
      const d = await runChunked("apply_range", Number(startId), Number(maxId));
      setApplied(d);
      toast({ title: "Import applied", description: `${d.summary.hits} employees written.` });
      await reloadSettings();
    } catch (e: any) {
      toast({ title: "Apply failed", description: e?.message, variant: "destructive" });
    } finally { setApplyingBulk(false); }
  };

  if (permLoading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!canAccess) {
    return (
      <Alert variant="destructive" className="m-6">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Access denied</AlertTitle>
        <AlertDescription>You need the <code>hrms_razorpay_sync</code> permission.</AlertDescription>
      </Alert>
    );
  }

  const canPilot = validated || !!settings?.last_creds_validated_at;
  const canBulk = !!settings?.bulk_sync_unlocked;
  const rowsToShow = applied?.rows ?? dryRun?.rows ?? [];

  return (
    <div className="space-y-6 p-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">RazorpayX Payroll Sync</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Phase 1a — pilot-gated import from Opfin. One employee first, then bulk range with dry-run preview.
        </p>
      </div>

      <Alert>
        <AlertTitle>API scope</AlertTitle>
        <AlertDescription className="text-xs">
          RazorpayX Payroll (Opfin) has no bulk list endpoint — only <code>people/view</code> by <code>employee-id</code>.
          The importer walks IDs sequentially with a max-id cap and stops after 30 consecutive misses.
          Bank / work-info fields are logged as field-names only; only <code>first_name, last_name, email, phone, dob, pan_number</code> are written to <code>hr_employees</code>.
          Unmatched Razorpay employees are created as <b>draft</b> (<code>is_active=false</code>).
        </AlertDescription>
      </Alert>

      {settings && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Lock className="h-4 w-4" /> Integration status</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground text-xs uppercase">Bulk sync</div>
              <Badge variant={settings.bulk_sync_unlocked ? "default" : "secondary"}>
                {settings.bulk_sync_unlocked ? "Unlocked" : "Locked (pilot required)"}
              </Badge>
            </div>
            <div>
              <div className="text-muted-foreground text-xs uppercase">Creds validated</div>
              <div className="text-xs">{settings.last_creds_validated_at ? new Date(settings.last_creds_validated_at).toLocaleString() : "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs uppercase">Last import</div>
              <div className="text-xs">{settings.last_import_at ? new Date(settings.last_import_at).toLocaleString() : "—"}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 1 — Validate */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Step 1 — Validate credentials</CardTitle>
          <CardDescription>Confirms <code>auth.id</code> / <code>auth.key</code> against a single <code>people/view</code>.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={runValidate} disabled={validating}>
            {validating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Validate credentials
          </Button>
        </CardContent>
      </Card>

      {/* STEP 2 — Pilot */}
      <Card className={canPilot ? "" : "opacity-50 pointer-events-none"}>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Play className="h-4 w-4" /> Step 2 — Pilot (one employee)</CardTitle>
          <CardDescription>Fetch a single Razorpay employee-id, preview the match, then apply. Unlocks bulk import.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs text-muted-foreground">Razorpay employee-id:</label>
            <input type="number" min={1} value={pilotId} onChange={(e) => setPilotId(e.target.value)}
              className="h-8 w-24 rounded border bg-background px-2 text-sm text-foreground" />
            <Button size="sm" variant="secondary" onClick={runFetchOne} disabled={fetching}>
              {fetching && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Fetch & preview
            </Button>
            <Button size="sm" onClick={runApplyPilot} disabled={applyingPilot || !pilotPreview?.ok}>
              {applyingPilot && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Apply pilot
            </Button>
          </div>
          {pilotPreview && pilotPreview.ok && (
            <div className="rounded-md border p-3 text-sm space-y-1">
              <div><span className="text-muted-foreground">Name:</span> {pilotPreview.preview?.name} · <span className="text-muted-foreground">Title:</span> {pilotPreview.preview?.title} · <span className="text-muted-foreground">Dept:</span> {pilotPreview.preview?.department}</div>
              <div>
                <span className="text-muted-foreground">Match:</span>{" "}
                {pilotPreview.match?.action === "match"
                  ? <Badge>Matched by {pilotPreview.match.matched_by}</Badge>
                  : <Badge variant="secondary">Will create draft</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">Fields returned: {pilotPreview.field_names?.join(", ")}</div>
            </div>
          )}
          {pilotPreview && !pilotPreview.ok && (
            <div className="text-destructive text-xs">Not found or error: {pilotPreview.error}</div>
          )}
        </CardContent>
      </Card>

      {/* PILOT CONFIRMATION — human gate */}
      {pilotApplied && !canBulk && (
        <Card className="border-amber-500/60 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <CheckCircle2 className="h-4 w-4" /> Pilot imported — verify before unlocking bulk
            </CardTitle>
            <CardDescription>
              Razorpay employee-id <code>{pilotApplied.employee_id}</code> → HR employee <code className="text-[11px]">{pilotApplied.hr_employee_id}</code>
              {" "}({pilotApplied.created ? "created as draft" : `matched by ${pilotApplied.matched_by ?? "n/a"}`}).
              Verify this employee on the <b>Razorpay dashboard</b> and in <b>HRMS</b>, then unlock bulk sync.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" onClick={runUnlockBulk} disabled={unlocking}>
              {unlocking && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Lock className="h-4 w-4 mr-2" /> Unlock bulk sync
            </Button>
          </CardContent>
        </Card>
      )}

      {/* STEP 3 — Bulk */}
      <Card className={canPilot ? "" : "opacity-50 pointer-events-none"}>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><ListChecks className="h-4 w-4" /> Step 3 — Bulk import (range)</CardTitle>
          <CardDescription>
            Walk <code>start-id</code> → <code>max-id</code>, dry-run first (available pre-pilot), then apply (requires unlock). Stops after 30 consecutive misses; hard cap 1000 IDs per run.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs text-muted-foreground">From:</label>
            <input type="number" min={1} value={startId} onChange={(e) => setStartId(e.target.value)}
              className="h-8 w-24 rounded border bg-background px-2 text-sm text-foreground" />
            <label className="text-xs text-muted-foreground">To:</label>
            <input type="number" min={1} value={maxId} onChange={(e) => setMaxId(e.target.value)}
              className="h-8 w-24 rounded border bg-background px-2 text-sm text-foreground" />
            <Button size="sm" variant="secondary" onClick={runDryRun} disabled={dryRunning}>
              {dryRunning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Dry-run preview
            </Button>
            <Button size="sm" onClick={runApplyBulk} disabled={applyingBulk || !dryRun?.ok || !canBulk} title={!canBulk ? "Unlock bulk sync after pilot verification" : undefined}>
              {applyingBulk && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <CheckCircle2 className="h-4 w-4 mr-2" /> Apply import {!canBulk && "(locked)"}
            </Button>
          </div>


          {(dryRun || applied) && (
            <div className="text-xs text-muted-foreground">
              {applied ? "Applied · " : "Dry-run · "}
              hits: {(applied ?? dryRun)!.summary.hits} ·
              matches: {(applied ?? dryRun)!.summary.matches} ·
              new drafts: {(applied ?? dryRun)!.summary.creates} ·
              misses: {(applied ?? dryRun)!.summary.misses}
              {(applied ?? dryRun)!.summary.stopped && " · stopped early"}
            </div>
          )}

          {rowsToShow.length > 0 && (
            <div className="rounded-md border overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left">
                    <th className="p-2">ID</th><th className="p-2">Status</th><th className="p-2">Name</th>
                    <th className="p-2">Title</th><th className="p-2">Dept</th>
                    <th className="p-2">Match</th><th className="p-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsToShow.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2 font-mono">{r.employee_id ?? "—"}</td>
                      <td className="p-2">
                        {r.status === "hit" && <Badge variant="default" className="text-[10px]">hit</Badge>}
                        {r.status === "miss" && <Badge variant="outline" className="text-[10px]">miss {r.http_status}</Badge>}
                        {r.status === "stopped" && <Badge variant="secondary" className="text-[10px]">stopped</Badge>}
                      </td>
                      <td className="p-2">{r.name ?? r.note ?? "—"}</td>
                      <td className="p-2">{r.title ?? "—"}</td>
                      <td className="p-2">{r.department ?? "—"}</td>
                      <td className="p-2">{r.matched_by ?? "—"}</td>
                      <td className="p-2">
                        {r.action_planned === "match" && <span className="text-emerald-600">Match</span>}
                        {r.action_planned === "create_draft" && <span className="text-amber-600">Create draft</span>}
                        {r.applied && <span className="ml-1 text-muted-foreground">✓ written</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
