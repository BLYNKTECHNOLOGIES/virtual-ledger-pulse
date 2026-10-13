import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { atsKeys } from "@/lib/ats/api";
import { candKeys } from "@/lib/ats/candidates";
import { useResumeFileName } from "./useResumeFileName";
import { fmtDate } from "@/lib/ats/format";
import { MailError, mailErrorMessage, notifyInterview, useEmailTemplates } from "@/lib/ats/mail";
import {
  interviewValues, ivKeys, minutesBetween, pendingInvites, scheduleTemplates, useInterviewEmails, useIvTargetInfo,
  type InterviewRow, type IvMode, type IvTarget,
} from "@/lib/ats/interviews";
import { InterviewEmailFields, emailLeftovers, pickTemplate, summarizeNotify } from "./InterviewBits";

export function NotifyInterviewDialog({ open, onOpenChange, iv, target }: { open: boolean; onOpenChange: (o: boolean) => void; iv: InterviewRow; target: IvTarget }) {
  const qc = useQueryClient();
  const emails = useInterviewEmails(open ? iv.id : null);
  const templates = useEmailTemplates();
  const info = useIvTargetInfo(target.applicationId);
  const resumeName = useResumeFileName(target.candidateId, open).data ?? null;
  const list = useMemo(() => scheduleTemplates(templates.data ?? []), [templates.data]);
  const first = target.fullName.trim().split(/\s+/)[0] || "the candidate";
  const pending = pendingInvites(iv);
  const panelEmpty = !pending.invite.length && !pending.cancel.length;
  const sentEmails = (emails.data ?? []).filter((m) => m.status === "sent");
  const latest = sentEmails.find((m) => m.calendar_revision === iv.revision);

  const [cand, setCand] = useState(false);
  const [panel, setPanel] = useState(false);
  const [resume, setResume] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const clientId = useRef(crypto.randomUUID());
  const inited = useRef(false);

  useEffect(() => {
    if (!open) { inited.current = false; return; }
    if (inited.current || emails.isLoading || templates.isLoading) return;
    inited.current = true;
    clientId.current = crypto.randomUUID();
    setCand(!latest && !!target.email);
    setPanel(!panelEmpty);
    setResume(!!info.data?.has_resume);
    const t = pickTemplate(list, sentEmails.length ? "interview-rescheduled" : "interview-scheduled");
    setTemplateId(t?.id ?? null); setSubject(t?.subject ?? ""); setBody(t?.body ?? "");
    setErr(null);
  }, [open, emails.isLoading, list, latest, panelEmpty, sentEmails.length, target.email, info.data]);

  const vals = interviewValues({
    fullName: target.fullName, refNo: target.refNo, jobTitle: target.jobTitle, phone: target.phone,
    title: iv.title, mode: iv.mode as IvMode, startsAt: iv.starts_at, minutes: minutesBetween(iv.starts_at, iv.ends_at),
    location: iv.location, meetingUrl: iv.meeting_url, candidateNote: iv.candidate_note,
  });
  const wantCand = cand && !!target.email;
  const wantPanel = panel && !panelEmpty;
  const valid = (wantCand || wantPanel) && (!wantCand || (subject.trim().length >= 1 && subject.trim().length <= 200
    && body.trim().length >= 1 && body.length <= 20000 && emailLeftovers(subject, body, vals).length === 0));

  const send = async () => {
    if (!valid || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await notifyInterview({
        interviewId: iv.id, action: "update",
        candidate: wantCand ? { id: clientId.current, subject, body, templateCode: list.find((t) => t.id === templateId)?.code ?? null } : null,
        notifyPanel: wantPanel, attachResume: wantPanel && resume,
      });
      summarizeNotify(r, { base: "Invitations sent", firstName: first, action: "update", names: new Map((iv.ats_interview_panel ?? []).map((m) => [m.id, m.name])) });
      for (const k of [ivKeys.all, candKeys.all, ["ats", "mail"], atsKeys.overview, atsKeys.jobSummary]) qc.invalidateQueries({ queryKey: k });
      onOpenChange(false);
    } catch (e) {
      setErr(`Emails not sent: ${mailErrorMessage(e instanceof MailError ? e.code : "network", e instanceof MailError ? e.field : undefined)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }} title="Send invitations" contentClassName="max-w-2xl"
      footer={<>
        <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>{err ? "Close" : "Cancel"}</Button>
        <Button disabled={!valid || busy} onClick={send}>{busy ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Sending…</> : err ? "Try again" : "Send"}</Button>
      </>}>
      <fieldset disabled={busy} className="space-y-4">
        <div className="space-y-1">
          <label className={cn("flex items-center gap-2 text-sm", target.email ? "text-foreground" : "text-muted-foreground")}>
            <Checkbox checked={wantCand} disabled={!target.email} onCheckedChange={(v) => setCand(v === true)} /> Email {first} the interview details
          </label>
          {!target.email && <p className="pl-6 text-xs text-muted-foreground">No email address. Add one with Edit profile.</p>}
          {latest && <p className="pl-6 text-xs text-muted-foreground">{first} already has the latest details (sent {fmtDate(latest.created_at)}).</p>}
        </div>
        {wantCand && (
          <InterviewEmailFields templates={list} templateId={templateId}
            onTemplateChange={(t) => { setTemplateId(t.id); setSubject(t.subject); setBody(t.body); }}
            subject={subject} onSubjectChange={setSubject} body={body} onBodyChange={setBody} vals={vals} />
        )}
        <div className="space-y-1">
          <label className={cn("flex items-center gap-2 text-sm", panelEmpty ? "text-muted-foreground" : "text-foreground")}>
            <Checkbox checked={wantPanel} disabled={panelEmpty} onCheckedChange={(v) => setPanel(v === true)} /> Send calendar invites to interviewers who don't have the latest one
          </label>
          {panelEmpty ? <p className="pl-6 text-xs text-muted-foreground">All interviewers have the latest invite.</p> : (
            <div className="space-y-0.5 pl-6 text-xs text-muted-foreground">
              {pending.invite.length > 0 && <p>Invite: {pending.invite.map((m) => m.name).join(", ")}</p>}
              {pending.cancel.length > 0 && <p>Cancellation: {pending.cancel.map((m) => m.name).join(", ")}</p>}
            </div>
          )}
          {wantPanel && pending.invite.length > 0 && (
            <label className={cn("flex items-center gap-2 pl-6 text-sm", info.data?.has_resume ? "text-foreground" : "text-muted-foreground")}>
              <Checkbox checked={resume && !!info.data?.has_resume} disabled={!info.data?.has_resume} onCheckedChange={(v) => setResume(v === true)} />
              {info.data?.has_resume ? <span className="min-w-0 truncate" title={resumeName ?? undefined}>{"Attach resume"}{resumeName ? ` (${resumeName})` : ""}</span> : "No resume on file"}
            </label>
          )}
        </div>
      </fieldset>
      {err && <p className="mt-3 rounded-md border border-warning/50 bg-warning/10 p-2 text-sm text-foreground">{err}</p>}
    </ResponsiveDialog>
  );
}
