import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, ShieldAlert, Search, Lock } from "lucide-react";

interface EnvelopeShape {
  ok?: boolean;
  http_status?: number;
  top_level_keys?: string[];
  array_key?: string | null;
  array_length?: number | null;
  scalar_keys?: string[];
  element_field_names?: string[] | null;
}

interface ValidateResult {
  ok: boolean;
  base_url_used?: string | null;
  http_status?: number;
  sample_employee_count?: number | null;
  error_body_snippet?: string | null;
}

interface Settings {
  base_url: string;
  bulk_sync_unlocked: boolean;
  last_creds_validated_at: string | null;
  last_import_at: string | null;
}

export default function RazorpaySyncPage() {
  const { hasPermission, isLoading: permLoading } = usePermissions();
  const canAccess = hasPermission("hrms_razorpay_sync");

  const [settings, setSettings] = useState<Settings | null>(null);
  const [validating, setValidating] = useState(false);
  const [introspecting, setIntrospecting] = useState(false);
  const [validateResult, setValidateResult] = useState<ValidateResult | null>(null);
  const [envelope, setEnvelope] = useState<EnvelopeShape | null>(null);

  useEffect(() => {
    if (!canAccess) return;
    supabase
      .from("hr_razorpay_settings")
      .select("base_url,bulk_sync_unlocked,last_creds_validated_at,last_import_at")
      .maybeSingle()
      .then(({ data }) => setSettings(data as Settings | null));
  }, [canAccess]);

  const runAction = async (
    action: "validate_creds" | "introspect_envelope",
  ) => {
    const setBusy = action === "validate_creds" ? setValidating : setIntrospecting;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("razorpay-payroll-proxy", {
        body: { action },
      });
      if (error) throw error;
      if (action === "validate_creds") {
        setValidateResult(data as ValidateResult);
        if (data?.ok) {
          toast({ title: "Credentials valid", description: `Razorpay responded ${data.http_status}.` });
        } else {
          toast({ title: "Validation failed", description: data?.error_body_snippet ?? "See details below.", variant: "destructive" });
        }
      } else {
        setEnvelope(data as EnvelopeShape);
        toast({ title: "Envelope introspected", description: `Array key: ${data?.array_key ?? "n/a"}` });
      }
    } catch (e: any) {
      toast({ title: "Request failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (permLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <Alert variant="destructive" className="m-6">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Access denied</AlertTitle>
        <AlertDescription>
          You need the <code>hrms_razorpay_sync</code> permission to view Razorpay Sync tools.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">RazorpayX Payroll Sync</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Phase 1a — credential validation and envelope introspection. Import flow lands next once the response shape is locked.
        </p>
      </div>

      {settings && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="h-4 w-4" /> Integration status
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground text-xs uppercase">Base URL</div>
              <div className="font-mono text-xs">{settings.base_url}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs uppercase">Bulk sync</div>
              <Badge variant={settings.bulk_sync_unlocked ? "default" : "secondary"}>
                {settings.bulk_sync_unlocked ? "Unlocked" : "Locked (pilot gate)"}
              </Badge>
            </div>
            <div>
              <div className="text-muted-foreground text-xs uppercase">Last creds validated</div>
              <div>{settings.last_creds_validated_at ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs uppercase">Last import</div>
              <div>{settings.last_import_at ?? "—"}</div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Step 1 — Validate credentials
          </CardTitle>
          <CardDescription>
            Sends an authenticated read-only GET to the Razorpay Payroll employees list (page=1, count=1).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={() => runAction("validate_creds")} disabled={validating}>
            {validating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Validate credentials
          </Button>
          {validateResult && (
            <div className="rounded-md border p-3 text-sm space-y-1">
              <div>
                <span className="text-muted-foreground">Status:</span>{" "}
                <Badge variant={validateResult.ok ? "default" : "destructive"}>
                  {validateResult.ok ? "OK" : "Failed"}
                </Badge>{" "}
                <span className="font-mono text-xs">HTTP {validateResult.http_status}</span>
              </div>
              {validateResult.base_url_used && (
                <div>
                  <span className="text-muted-foreground">Base URL:</span>{" "}
                  <span className="font-mono text-xs">{validateResult.base_url_used}</span>
                </div>
              )}
              {validateResult.sample_employee_count != null && (
                <div>
                  <span className="text-muted-foreground">Sample rows returned:</span> {validateResult.sample_employee_count}
                </div>
              )}
              {validateResult.error_body_snippet && (
                <div className="text-destructive text-xs mt-2 whitespace-pre-wrap break-all">
                  {validateResult.error_body_snippet}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" /> Step 2 — Introspect response envelope
          </CardTitle>
          <CardDescription>
            Discovers the response shape (array key, pagination fields, element field NAMES only — no values) so the importer can be locked to it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={() => runAction("introspect_envelope")} disabled={introspecting} variant="secondary">
            {introspecting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Introspect envelope
          </Button>
          {envelope && (
            <div className="rounded-md border p-3 text-sm space-y-2">
              <div><span className="text-muted-foreground">HTTP:</span> {envelope.http_status}</div>
              <div><span className="text-muted-foreground">Top-level keys:</span> <span className="font-mono text-xs">{envelope.top_level_keys?.join(", ") || "—"}</span></div>
              <div><span className="text-muted-foreground">Array key:</span> <span className="font-mono text-xs">{envelope.array_key ?? "—"}</span> (len {envelope.array_length ?? 0})</div>
              <div><span className="text-muted-foreground">Scalar keys:</span> <span className="font-mono text-xs">{envelope.scalar_keys?.join(", ") || "—"}</span></div>
              <div>
                <div className="text-muted-foreground">Element field names:</div>
                <div className="font-mono text-xs break-all">
                  {envelope.element_field_names?.length ? envelope.element_field_names.join(", ") : "—"}
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                No employee values are stored or logged. Field names only.
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Alert>
        <AlertTitle>Import flow gated</AlertTitle>
        <AlertDescription>
          The paginated import (with match ladder, dry-run preview, and confirm-to-write) is deployed only after the envelope
          above is locked. Bulk sync stays disabled until the first pilot employee is manually verified on Razorpay.
        </AlertDescription>
      </Alert>
    </div>
  );
}
