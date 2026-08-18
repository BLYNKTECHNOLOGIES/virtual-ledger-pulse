import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Link2, Mail, Copy, RefreshCw, CheckCircle2 } from "lucide-react";

const APP_URL = "https://erp.blynkex.com";

export function CandidateInviteCard({ onboardingId, email }: { onboardingId?: string; email?: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [to, setTo] = useState(email || "");

  const { data: invite } = useQuery({
    queryKey: ["onboarding_invite", onboardingId],
    enabled: !!onboardingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_onboarding_invites")
        .select("id, token, status, expires_at, submitted_at, emailed_at")
        .eq("onboarding_id", onboardingId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (!onboardingId) {
    return (
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Candidate self-service form
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Save this onboarding draft first — the invite link is generated per candidate.
        </CardContent>
      </Card>
    );
  }

  const link = invite ? `${APP_URL}/onboarding/apply/${invite.token}` : "";

  const call = async (action: "issue" | "send", reissue = false) => {
    setBusy(action);
    const { data, error } = await supabase.functions.invoke("onboarding-invite", {
      body: { action, onboardingId, reissue, recipientEmail: to || undefined },
    });
    setBusy(null);
    const res = data as any;
    if (error || res?.error) {
      toast.error(res?.error || "Could not generate the invite link");
      return;
    }
    qc.invalidateQueries({ queryKey: ["onboarding_invite", onboardingId] });
    toast.success(action === "send" ? `Invite emailed to ${res.sentTo}` : "Invite link ready");
  };

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="h-4 w-4" /> Candidate self-service form
          {invite?.status === "submitted" && (
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Submitted</Badge>
          )}
          {invite && invite.status !== "submitted" && (
            <Badge variant="outline" className="capitalize">{invite.status}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Send the candidate a login-free link to fill their personal, statutory and bank details and upload
          documents. Their answers stay in review until HR accepts them.
        </p>

        {link && (
          <div className="flex items-center gap-2">
            <Input readOnly value={link} className="text-xs" />
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copied"); }}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="candidate@email.com"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="sm:max-w-xs"
          />
          <div className="flex gap-2">
            {!invite && (
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => call("issue")}>
                <Link2 className="h-3.5 w-3.5 mr-1.5" /> Generate link
              </Button>
            )}
            <Button size="sm" disabled={busy !== null} onClick={() => call("send")}>
              <Mail className="h-3.5 w-3.5 mr-1.5" /> {busy === "send" ? "Sending…" : "Email link"}
            </Button>
            {invite && (
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => call("issue", true)}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Re-issue
              </Button>
            )}
          </div>
        </div>

        {invite?.submitted_at && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm text-emerald-700">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Candidate submitted on {new Date(invite.submitted_at).toLocaleString("en-IN")}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={async () => {
                setBusy("reimport");
                const { data, error } = await supabase.functions.invoke("onboarding-invite", {
                  body: { action: "reimport", onboardingId },
                });
                setBusy(null);
                const res = data as any;
                if (error || res?.error) { toast.error(res?.error || "Could not import the submission"); return; }
                qc.invalidateQueries({ queryKey: ["onboarding_record", onboardingId] });
                qc.invalidateQueries();
                toast.success("Candidate details imported into this onboarding");
              }}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              {busy === "reimport" ? "Importing…" : "Import into onboarding"}
            </Button>
          </div>
        )}

      </CardContent>
    </Card>
  );
}
