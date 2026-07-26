import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { FlaskConical, ShieldAlert, TimerReset } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

/**
 * Sandbox Environment toggle.
 *
 * When ON the razorpay-payroll-proxy reads `sandbox_base_url` and routes all
 * outbound calls there instead of production. Auto-revoked by
 * `hr_razorpay_sandbox_auto_revoke()` (hourly cron) when the deadline passes.
 *
 * Bad-actor mitigation:
 *   - Requires explicit typed confirmation "ENABLE SANDBOX".
 *   - A sandbox window has a hard expiry (default 2 hours) that the DB job enforces.
 *   - Every flip is auditable via updated_at on hr_razorpay_settings.
 */
export function SandboxToggleCard() {
  const qc = useQueryClient();
  const [durationHrs, setDurationHrs] = useState(2);
  const [sandboxUrl, setSandboxUrl] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [enableOpen, setEnableOpen] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["razorpay_sandbox_settings"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_razorpay_settings")
        .select("sandbox_mode, sandbox_base_url, sandbox_revoke_after, updated_at")
        .eq("is_singleton", true)
        .maybeSingle();
      if (error) throw error;
      return data as {
        sandbox_mode: boolean | null;
        sandbox_base_url: string | null;
        sandbox_revoke_after: string | null;
        updated_at: string;
      } | null;
    },
    refetchInterval: 30_000,
  });

  const isOn = !!settings?.sandbox_mode;

  const enable = useMutation({
    mutationFn: async () => {
      if (!sandboxUrl.trim() || !/^https?:\/\//i.test(sandboxUrl)) {
        throw new Error("Enter a valid sandbox base URL (https://…)");
      }
      if (confirmText.trim() !== "ENABLE SANDBOX") {
        throw new Error("Type 'ENABLE SANDBOX' exactly to confirm");
      }
      const revokeAfter = new Date(Date.now() + durationHrs * 60 * 60 * 1000).toISOString();
      const { error } = await (supabase as any)
        .from("hr_razorpay_settings")
        .update({
          sandbox_mode: true,
          sandbox_base_url: sandboxUrl.trim().replace(/\/$/, ""),
          sandbox_revoke_after: revokeAfter,
        })
        .eq("is_singleton", true);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Sandbox routing active for ${durationHrs}h`);
      setEnableOpen(false);
      setConfirmText("");
      qc.invalidateQueries({ queryKey: ["razorpay_sandbox_settings"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const disable = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("hr_razorpay_settings")
        .update({ sandbox_mode: false, sandbox_revoke_after: null })
        .eq("is_singleton", true);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sandbox routing revoked");
      qc.invalidateQueries({ queryKey: ["razorpay_sandbox_settings"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card className={isOn ? "border-warning bg-warning/5" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className={`h-4 w-4 ${isOn ? "text-warning" : "text-muted-foreground"}`} />
          Sandbox Environment
          {isOn && (
            <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-warning/20 text-warning">
              LIVE
            </span>
          )}
        </CardTitle>
        <CardDescription className="text-xs">
          Route the RazorpayX proxy to a sandbox base URL for rehearsals. Auto-revoked on the deadline.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : isOn ? (
          <>
            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Proxy routed to sandbox</AlertTitle>
              <AlertDescription className="text-xs space-y-1">
                <div className="font-mono break-all">{settings?.sandbox_base_url}</div>
                {settings?.sandbox_revoke_after && (
                  <div className="flex items-center gap-1">
                    <TimerReset className="h-3 w-3" />
                    Auto-revoke in {formatDistanceToNow(new Date(settings.sandbox_revoke_after))}
                  </div>
                )}
              </AlertDescription>
            </Alert>
            <Button variant="destructive" size="sm" onClick={() => disable.mutate()} disabled={disable.isPending}>
              Revoke sandbox now
            </Button>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <Label className="text-xs">Sandbox base URL</Label>
                <Input
                  placeholder="https://payroll-sandbox.razorpay.com/api"
                  value={sandboxUrl}
                  onChange={(e) => setSandboxUrl(e.target.value)}
                  className="h-9"
                />
              </div>
              <div>
                <Label className="text-xs">Window (hours)</Label>
                <Input
                  type="number"
                  min={1}
                  max={24}
                  value={durationHrs}
                  onChange={(e) => setDurationHrs(Math.max(1, Math.min(24, Number(e.target.value) || 1)))}
                  className="h-9"
                />
              </div>
            </div>
            <AlertDialog open={enableOpen} onOpenChange={setEnableOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={!sandboxUrl}>
                  Enable sandbox routing…
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Enable sandbox routing?</AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2">
                    <div>All RazorpayX proxy calls will hit the sandbox URL for the next <b>{durationHrs}h</b>. No production writes will occur during that window.</div>
                    <div className="font-mono text-xs bg-muted p-2 rounded break-all">{sandboxUrl}</div>
                    <div>Type <b>ENABLE SANDBOX</b> below to confirm.</div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Input placeholder="ENABLE SANDBOX" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setConfirmText("")}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => { e.preventDefault(); enable.mutate(); }}
                    disabled={enable.isPending || confirmText.trim() !== "ENABLE SANDBOX"}
                  >
                    Enable
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </CardContent>
    </Card>
  );
}
