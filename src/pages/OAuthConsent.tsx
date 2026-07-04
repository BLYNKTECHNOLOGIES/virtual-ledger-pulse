import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// The supabase.auth.oauth namespace is beta; declare a minimal typed wrapper.
type OAuthDetails = {
  client?: { name?: string };
  redirect_url?: string;
  redirect_to?: string;
};
type OAuthResult = { data: OAuthDetails | null; error: { message: string } | null };
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
  approveAuthorization: (id: string) => Promise<OAuthResult>;
  denyAuthorization: (id: string) => Promise<OAuthResult>;
};
const oauth = (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<OAuthDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) return setError("Missing authorization_id");
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/login?next=" + encodeURIComponent(next);
        return;
      }
      const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) return setError(error.message);
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    const { data, error } = approve
      ? await oauth.approveAuthorization(authorizationId)
      : await oauth.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      return setError("No redirect returned by the authorization server.");
    }
    window.location.href = target;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-semibold text-center">
            Connect to Blynkex ERP
          </CardTitle>
          <CardDescription className="text-center">
            Authorize an application to access the ERP as you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <p className="text-sm text-destructive text-center">
              Could not load this authorization request: {error}
            </p>
          )}
          {!error && !details && (
            <p className="text-sm text-muted-foreground text-center">Loading…</p>
          )}
          {!error && details && (
            <>
              <p className="text-sm text-center">
                Allow{" "}
                <span className="font-medium">{details.client?.name ?? "this application"}</span>{" "}
                to use the ERP with your permissions? It can only access what your account is
                allowed to see.
              </p>
              <div className="flex justify-between gap-3 border-t pt-4">
                <Button variant="outline" disabled={busy} onClick={() => decide(false)}>
                  Deny
                </Button>
                <Button disabled={busy} onClick={() => decide(true)}>
                  Approve
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
