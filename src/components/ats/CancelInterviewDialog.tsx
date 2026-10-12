import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { atsKeys } from "@/lib/ats/api";
import { candKeys } from "@/lib/ats/candidates";
import { interviewErrorMessage } from "@/lib/ats/errors";
import { MailError, mailErrorMessage, notifyInterview, useEmailTemplates, useMailStatus } from "@/lib/ats/mail";
import {
  cancelInterview, cancelTemplates, interviewValues, ivKeys, ivWhen, minutesBetween, useInterviewEmails,
  type InterviewRow, type IvMode, type IvTarget,
} from "@/lib/ats/interviews";
import { InterviewEmailFields, emailLeftovers, pickTemplate, summarizeNotify } from "./InterviewBits";

export function CancelInterviewDialog({ open, onOpenChange, iv, target }: { open: boolean; onOpenChange: (o: boolean) => void; iv: InterviewRow; target: IvTarget }) {
  const qc = useQueryClient();
  const mail = useMailStatus();
  const mailOn = !!mail.data?.enabled;
  const emails = useInterviewEmails(open ? iv.id : null);
  const templates = useEmailTemplates();
  const list = useMemo(() => cancelTemplates(templates.data ?? []), [templates.data]);
  const first = target.fullName.trim().split(/\s+/)[0] || "the candidate";
  const hasPanelInvites = (iv.ats_interview_panel ?? []).some((m) => m.invite_status === "sent" && !m.cancel_sent_at);

  const [reason, setReason] = useState("");
  const [cand, setCand] = useState(false);
  const [panel, setPanel] = useState(true);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const clientId = useRef(crypto.randomUUID());
  const inited = useRef(false);

  useEffect(() => {
    if (!open) { inited.current = false; return; }
    if (inited.current || emails.isLoading) return;
    inited.current = true;
    clientId.current = crypto.randomUUID();
    setReason(""); setCancelled(false); setErr(null);
    setCand(!!target.email && (emails.data ?? []).some((m) => m.status === "sent"));
    setPanel(true);
    const t = pickTemplate(list, "interview-cancelled");
    setTemplateId(t?.id ?? null); setSubject(t?.subject ?? ""); setBody(t?.body ?? "");
  }, [open, emails.isLoading, emails.data, list, target.email]);

  const vals = interviewValues({
    fullName: target.fullName, refNo: target.refNo, jobTitle: target.jobTitle, phone: target.phone,
    title: iv.title, mode: iv.mode as IvMode, startsAt: iv.starts_at, minutes: minutesBetween(iv.starts_at, iv.ends_at),
    location: iv.location, meetingUrl: iv.meeting_url, candidateNote: iv.candidate_note,
  });
  const wantCand = mailOn && cand && !!target.email;
  const wantPanel = mailOn && hasPanelInvites && panel;
  const valid = reason.length <= 500 && (!wantCand || (subject.trim().length >= 1 && subject.trim().length <= 200
    && body.trim().length >= 1 && body.length <= 20000 && emailLeftovers(subject, body, vals).length === 0));

  const refresh = () => { for (const k of [ivKeys.all, candKeys.all, ["ats", "mail"], atsKeys.overview, atsKeys.jobSummary]) qc.invalidateQueries({ queryKey: k }); };

  const notify = async () => {
    try {
      const r = await notifyInterview({
        interviewId: iv.id, action: "cancel",
        candidate: wantCand ? { id: clientId.current, subject, body, templateCode: list.find((t) => t.id === templateId)?.code ?? null } : null,
        notifyPanel: wantPanel,
      });
      summarizeNotify(r, { base: "Interview cancelled", firstName: first, action: "cancel", names: new Map((iv.ats_interview_panel ?? []).map((m) => [m.id, m.name])) });
      refresh();
      onOpenChange(false);
    } catch (e) {
      setErr(`Interview cancelled. Emails not sent: ${mailErrorMessage(e instanceof MailError ? e.code : "network", e instanceof MailError ? e.field : undefined)}`);
      refresh();
    }
  };

  const confirm = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      if (!cancelled) {
        try {
          await cancelInterview(iv.id, reason.trim() || null);
        } catch (e) {
          toast.error(interviewErrorMessage(e));
          return;
        }
        setCancelled(true);
      }
      if (wantCand || wantPanel) await notify();
      else { toast.success("Interview cancelled"); refresh(); onOpenChange(false); }
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }} title="Cancel interview?" contentClassName="max-w-2xl"
      description={`${iv.title} with ${target.fullName} on ${ivWhen(iv)}`}
      footer={err ? <>
        <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Close</Button>
        <Button disabled={busy} onClick={confirm}>{busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}Try again</Button>
      </> : <>
        <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Keep it</Button>
        <Button variant="destructive" disabled={!valid || busy} onClick={confirm}>{busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}Cancel interview</Button>
      </>}>
      <fieldset disabled={busy || cancelled} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="iv-cancel-reason">Reason (optional)</Label>
          <Textarea id="iv-cancel-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className="text-foreground" />
          <p className="text-xs text-muted-foreground">Interviewers see this in their cancellation; the candidate doesn't.</p>
        </div>
        {mailOn && <>
          <div className="space-y-1">
            <label className={cn("flex items-center gap-2 text-sm", target.email ? "text-foreground" : "text-muted-foreground")}>
              <Checkbox checked={wantCand} disabled={!target.email} onCheckedChange={(v) => setCand(v === true)} /> Email {first} that it's cancelled
            </label>
            {!target.email && <p className="pl-6 text-xs text-muted-foreground">No email address. Add one with Edit profile.</p>}
          </div>
          {wantCand && (
            <InterviewEmailFields templates={list} templateId={templateId}
              onTemplateChange={(t) => { setTemplateId(t.id); setSubject(t.subject); setBody(t.body); }}
              subject={subject} onSubjectChange={setSubject} body={body} onBodyChange={setBody} vals={vals} />
          )}
          {hasPanelInvites && (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox checked={panel} onCheckedChange={(v) => setPanel(v === true)} /> Cancel the interviewers' calendar invites
            </label>
          )}
        </>}
      </fieldset>
      {err && <p className="mt-3 rounded-md border border-warning/50 bg-warning/10 p-2 text-sm text-foreground">{err}</p>}
    </ResponsiveDialog>
  );
}
