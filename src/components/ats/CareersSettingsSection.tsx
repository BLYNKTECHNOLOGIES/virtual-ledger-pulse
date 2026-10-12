import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { atsKeys, useAtsSettings, useAtsSources, useIsHrAdmin } from "@/lib/ats/api";
import { atsErrorMessage } from "@/lib/ats/errors";
import { fmtDateTime } from "@/lib/ats/format";
import { QueryError, RowsSkeleton, SectionCard } from "./AtsBits";
import { MetricCell, MetricStrip, StatusPill } from "./AtsUi";

interface Status {
  has_key: boolean; key_preview: string | null; key_created_at: string | null; key_created_by_name: string | null;
  last_seen_at: string | null; last_error: string | null; last_error_at: string | null;
  received_total: number; received_7d: number; unmatched_active: number; last_received_at: string | null;
}

const statusKey = ["ats", "integration-status"] as const;

function careersErrorText(t: string): string {
  if (t === "Rejected a request with a wrong key") return "The website is using an old connection key. Put the current key on the website.";
  if (t === "not_configured") return "The website isn't sending a connection key yet.";
  if (t === "resume_fetch_failed") return "A resume couldn't be copied from the website. The website will try again.";
  if (t === "internal_create") return "An application couldn't be saved. Check that the website is sending complete applications.";
  if (t.startsWith("internal_")) return "Something went wrong while receiving an application.";
  return t;
}

function connection(s: Status): { label: string; tone: "muted" | "ok" | "warn" } {
  if (!s.has_key) return { label: "Not set up", tone: "muted" };
  const seen = s.last_seen_at ? new Date(s.last_seen_at).getTime() : 0;
  const err = s.last_error_at ? new Date(s.last_error_at).getTime() : 0;
  if (err && err > seen) return { label: "Needs attention", tone: "warn" };
  if (!seen) return { label: "Waiting for first application", tone: "muted" };
  if (Date.now() - seen <= 7 * 86400_000) return { label: "Connected", tone: "ok" };
  return { label: "No applications in the last 7 days", tone: "muted" };
}

export function CareersSettingsSection() {
  const qc = useQueryClient();
  const settings = useAtsSettings();
  const sources = useAtsSources();
  const status = useQuery({
    queryKey: statusKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ats_integration_status");
      if (error) throw error;
      return data as unknown as Status | null;
    },
  });
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => { if (settings.data) setUrl((settings.data as any).careers_base_url ?? ""); }, [settings.data]);

  const urlErr = !/^https:\/\/\S+$/.test(url.trim()) ? "The link must start with https:// and contain no spaces." : null;
  const saveUrl = async () => {
    if (urlErr || saving) return;
    setSaving(true);
    const { error } = await supabase.from("ats_settings").update({ careers_base_url: url.trim().replace(/\/+$/, "") } as any).eq("id", true);
    setSaving(false);
    if (error) return toast.error(atsErrorMessage(error));
    toast.success("Careers link saved");
    qc.invalidateQueries({ queryKey: atsKeys.settings });
  };

  const rotate = async () => {
    if (rotating) return;
    setRotating(true);
    const { data, error } = await supabase.rpc("ats_rotate_intake_key");
    setRotating(false);
    if (error) return toast.error(atsErrorMessage(error));
    setKey(data as unknown as string);
    qc.invalidateQueries({ queryKey: statusKey });
  };

  const isAdmin = useIsHrAdmin();
  const careersSource = (sources.data ?? []).find((s) => s.code === "careers");
  const s = status.data;
  const c = s ? connection(s) : null;

  return (
    <div className="space-y-4">
      <SectionCard title="Careers page link">
        <form className="grid max-w-xl gap-2" onSubmit={(e) => { e.preventDefault(); saveUrl(); }}>
          <Label htmlFor="ats-careers-url">Public careers page address</Label>
          <Input id="ats-careers-url" value={url} onChange={(e) => setUrl(e.target.value)} className="text-foreground" placeholder="https://blynkex.com/careers" />
          {url && urlErr && <p className="text-xs text-destructive">{urlErr}</p>}
          <div><Button type="submit" disabled={!!urlErr || saving || url.trim() === (settings.data as any)?.careers_base_url}>Save</Button></div>
        </form>
      </SectionCard>

      <SectionCard title="Website connection" action={c && (
        <StatusPill tone={c.tone === "ok" ? "success" : c.tone === "warn" ? "destructive" : "neutral"}>{c.label}</StatusPill>
      )}>
        {status.isLoading ? <RowsSkeleton rows={3} /> : status.isError ? <QueryError error={status.error} onRetry={() => status.refetch()} /> : !s ? (
          <p className="text-sm text-muted-foreground">You don't have access to the connection details.</p>
        ) : (
          <div className="space-y-4">
            {c?.label === "Needs attention" && s.last_error && (
              <p className="rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm text-foreground">{careersErrorText(s.last_error)} · {fmtDateTime(s.last_error_at)}</p>
            )}
            <MetricStrip className="sm:grid-cols-4 xl:grid-cols-4">
              <MetricCell label="Received in total" value={s.received_total} />
              <MetricCell label="Last 7 days" value={s.received_7d} />
              <MetricCell label="Last received" value={<span className="text-sm font-medium">{fmtDateTime(s.last_received_at)}</span>} />
              <MetricCell label="Unsorted, no matching job" value={s.unmatched_active > 0 && careersSource
                ? <Link className="text-primary hover:underline" to={`/hrms/ats/candidates?job=general&source=${careersSource.id}`}>{s.unmatched_active}</Link>
                : s.unmatched_active} />
            </MetricStrip>
            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
              {isAdmin ? (
                <div className="space-y-1">
                  <Button variant="outline" className="gap-1.5" disabled={rotating} onClick={() => (s.has_key ? setConfirm(true) : rotate())}>
                    {rotating ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} {s.has_key ? "Replace connection key" : "Generate connection key"}
                  </Button>
                  {s.has_key && <p className="max-w-md text-xs text-muted-foreground">After replacing it, put the new key on the website. Until then, new applications wait on the website and arrive once the new key is in place.</p>}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Only HR admins can generate the connection key.</span>
              )}
              {s.has_key && (
                <span className="text-xs text-muted-foreground">Current key ends in <span className="t-mono">…{s.key_preview}</span>{s.key_created_by_name ? ` · by ${s.key_created_by_name}` : ""} · {fmtDateTime(s.key_created_at)}</span>
              )}
            </div>
          </div>
        )}
      </SectionCard>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace the connection key?</AlertDialogTitle>
            <AlertDialogDescription>The website stops sending applications until the new key is added there. Continue?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirm(false); rotate(); }}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ResponsiveDialog open={!!key} onOpenChange={() => { /* closes only with the Close button */ }} title="Connection key"
        description="This key is shown only once."
        footer={<Button onClick={() => setKey(null)}>Close</Button>}>
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
            <code className="t-mono min-w-0 flex-1 break-all text-sm text-foreground">{key}</code>
            <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => { if (key) navigator.clipboard.writeText(key).then(() => toast.success("Copied"), () => toast.error("Couldn't copy")); }}>
              <Copy className="h-4 w-4" /> Copy
            </Button>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-foreground">
            <li>In Lovable, open the Blynk Website project, then Cloud, then Secrets.</li>
            <li>Add or replace the secret <span className="t-mono">ATS_INTAKE_KEY</span> with this value.</li>
            <li>Close this window. The key can't be shown again.</li>
          </ol>
        </div>
      </ResponsiveDialog>
    </div>
  );
}
