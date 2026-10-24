import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Link2, Mail, Copy, RefreshCw, CheckCircle2, Loader2, Send, AlertTriangle } from "lucide-react";
import { PrejoiningReview } from './PrejoiningReview';
import { SendOnboardingFormDialog } from './SendOnboardingFormDialog';
import { checkOfferFreshness, type OfferFreshness } from "@/lib/hrms/offerFreshness";

/** Why the offer the form would send is not the right one, in words (null: it is). */
function outdatedOffer(f: OfferFreshness | undefined | null): { text: string; next: string } | null {
  if (!f?.offer) return null;
  const parts: string[] = [];
  if (f.packageOffer) parts.push(`The form still carries offer ${f.packageOffer.reference_no || "an older offer"}, but ${f.offer.reference_no} is the current offer`);
  if (f.changes.length) parts.push(`${f.packageOffer ? "and it" : `Offer ${f.offer.reference_no}`} no longer matches this record (${f.labels.join(", ")})`);
  if (!parts.length) return null;
  return {
    text: `${parts.join(" ")}.`,
    next: (f.changes.length ? "issue the revised offer with the form" : `send ${f.offer.reference_no} with the form`)
      + (f.packageOffer ? ` (or revoke ${f.offer.reference_no} in Documents → Issued to keep ${f.packageOffer.reference_no || "the earlier offer"})` : ""),
  };
}

const APP_URL = "https://erp.blynkex.com";

export function CandidateInviteCard({ onboardingId, beforeOpen, packageEnabled, recordVersion }: {
  onboardingId?: string;
  /** Save any pending Stage 1 edits first, so the dialog starts from the saved record. */
  beforeOpen?: () => Promise<void>;
  /** The form carries a joining package (with the issued offer). */
  packageEnabled?: boolean;
  /** The record's updated_at — the offer check re-runs when the record changes. */
  recordVersion?: string | null;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: invite } = useQuery({
    queryKey: ["onboarding_invite", onboardingId],
    enabled: !!onboardingId,
    queryFn: async () => {
      if (!onboardingId) return null;
      const { data, error } = await supabase
        .from("hr_onboarding_invites")
        .select("id, token, status, expires_at, submitted_at, emailed_at")
        .eq("onboarding_id", onboardingId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  /** Does the offer the form carries still say what the record says (Stage 1 and 2 may have changed since)? */
  const { data: freshness } = useQuery({
    queryKey: ["onboarding_package_summary", onboardingId, recordVersion || null],
    enabled: !!onboardingId && !!packageEnabled,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
    queryFn: () => checkOfferFreshness(onboardingId!),
  });
  const outdated = packageEnabled ? outdatedOffer(freshness) : null;

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

  const reissue = async () => {
    setBusy("issue");
    const { data, error } = await supabase.functions.invoke("onboarding-invite", {
      body: { action: "issue", onboardingId, reissue: true },
    });
    setBusy(null);
    const res = data as any;
    if (error || res?.error) {
      toast.error(res?.error || "Could not create a new link");
      return;
    }
    qc.invalidateQueries({ queryKey: ["onboarding_invite", onboardingId] });
    toast.success("New link ready — the old link no longer works");
  };

  /**
   * The same link and offer, emailed again — nothing on the record or the offer changes.
   * An offer that no longer matches the record is never re-sent: the send dialog opens instead.
   */
  const resend = async () => {
    setBusy("send");
    let openInstead = false;
    try {
      try {
        await beforeOpen?.();
      } catch (e: any) {
        toast.error(`Your Stage 1 changes could not be saved: ${e?.message || "unknown error"}. Fix them, then send.`);
        return;
      }
      if (packageEnabled) {
        const why = outdatedOffer(await checkOfferFreshness(onboardingId));
        if (why) {
          toast.warning(`${why.text} Check the details, then ${why.next}.`);
          openInstead = true;
          return;
        }
      }
      const { data, error } = await supabase.functions.invoke("onboarding-invite", { body: { action: "send", onboardingId } });
      let res = data as any;
      if (error && (error as any)?.context?.json) {
        try { res = await (error as any).context.json(); } catch { /* ignore */ }
      }
      if (error || res?.error) {
        toast.error(res?.error || "Could not email the link");
        return;
      }
      qc.invalidateQueries({ queryKey: ["onboarding_invite", onboardingId] });
      toast.success(`Link emailed again to ${res.sentTo}${res.offerAttached ? " with the offer attached" : ""}`);
    } catch (e: any) {
      toast.error(e?.message || "Could not check the offer before sending");
    } finally {
      setBusy(null);
      if (openInstead) setDialogOpen(true);
    }
  };

  const openDialog = async () => {
    setBusy("prepare");
    try {
      await beforeOpen?.();
    } catch (e: any) {
      // The dialog reads the saved record — never open it on details that did not save.
      toast.error(`Your Stage 1 changes could not be saved: ${e?.message || "unknown error"}. Fix them, then send.`);
      return;
    } finally {
      setBusy(null);
    }
    setDialogOpen(true);
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
          documents — with their offer letter and E2 declaration attached. The details you enter while sending
          are saved to this onboarding record.
        </p>

        {link && (
          <div className="flex items-center gap-2">
            <Input readOnly value={link} className="text-xs" />
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copied"); }}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        {invite?.emailed_at && (
          <p className="text-xs text-muted-foreground">
            Last emailed {new Date(invite.emailed_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} · link valid until{" "}
            {new Date(invite.expires_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })}
          </p>
        )}

        {outdated && (
          <p role="status" className="text-xs text-amber-700 dark:text-amber-400 flex gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
            <span className="break-words">
              {outdated.text} Use “Update and send again…” to {outdated.next}.
            </span>
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy !== null} onClick={openDialog}>
            {busy === "prepare" ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Mail className="h-3.5 w-3.5 mr-1.5" />}
            {invite ? "Update and send again…" : "Send onboarding form…"}
          </Button>
          {invite && (
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={resend} title="Email the same link and offer again">
              <Send className="h-3.5 w-3.5 mr-1.5" /> {busy === "send" ? "Sending…" : "Resend email"}
            </Button>
          )}
          {invite && (
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={reissue} title="Replace the link — the old one stops working">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> {busy === "issue" ? "Creating…" : "New link"}
            </Button>
          )}
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
                try {
                  await beforeOpen?.();
                } catch (e: any) {
                  setBusy(null);
                  toast.error(`Your Stage 1 changes could not be saved: ${e?.message || "unknown error"}. Fix them, then import.`);
                  return;
                }
                const { data, error } = await supabase.functions.invoke("onboarding-invite", {
                  body: { action: "reimport", onboardingId },
                });
                setBusy(null);
                const res = data as any;
                if (error || res?.error) { toast.error(res?.error || "Could not import the submission"); return; }
                qc.invalidateQueries({ queryKey: ["onboarding-record", onboardingId] });
                qc.invalidateQueries();
                toast.success("Candidate details imported into this onboarding");
              }}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              {busy === "reimport" ? "Importing…" : "Import into onboarding"}
            </Button>
          </div>
        )}

        <PrejoiningReview id={onboardingId}/>
      </CardContent>
      <SendOnboardingFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onboardingId={onboardingId}
        submitted={invite?.status === "submitted"}
      />
    </Card>
  );
}
