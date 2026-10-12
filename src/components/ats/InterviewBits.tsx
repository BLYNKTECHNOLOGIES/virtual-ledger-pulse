import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ChevronDown, Circle, Copy, MailX, MapPin, Phone, RefreshCw, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { fmtDateTime, todayIST } from "@/lib/ats/format";
import { mailErrorMessage, type AtsEmailTemplate, type NotifyResult } from "@/lib/ats/mail";
import {
  activePanel, fillInterviewText, inviteState, istInputs, ivState, leftoverPlaceholders,
  type AtsInterview, type InterviewRow,
} from "@/lib/ats/interviews";

export function Tip({ text, children }: { text: ReactNode; children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function InterviewStatusBadge({ iv }: { iv: Pick<AtsInterview, "status" | "starts_at" | "ends_at"> }) {
  const st = ivState(iv);
  const isToday = istInputs(iv.starts_at).date === todayIST();
  const base = "whitespace-nowrap font-medium";
  switch (st) {
    case "upcoming":
      return (
        <span className="inline-flex items-center gap-1">
          <Badge variant="outline" className={cn(base, "border-primary/50 text-primary")}>Scheduled</Badge>
          {isToday && <Badge variant="secondary" className={base}>Today</Badge>}
        </span>
      );
    case "now": return <Badge className={cn(base, "bg-success text-success-foreground hover:bg-success")}>Now</Badge>;
    case "awaiting": return <Badge variant="outline" className={cn(base, "border-warning/60 bg-warning/10 text-warning")}>How did it go?</Badge>;
    case "completed": return <Badge variant="outline" className={cn(base, "border-success/50 bg-success/10 text-success")}>Completed</Badge>;
    case "no_show": return <Badge variant="outline" className={cn(base, "border-warning/60 bg-warning/10 text-warning")}>Did not attend</Badge>;
    default: return <Badge variant="outline" className={cn(base, "text-muted-foreground")}>Cancelled</Badge>;
  }
}

export function PanelChips({ iv, mailOn }: { iv: InterviewRow; mailOn: boolean }) {
  const members = activePanel(iv);
  if (!members.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {members.map((m) => {
        const s = inviteState(m, iv);
        let icon: ReactNode = null;
        let tip = "";
        if (s === "sent") { icon = <CheckCircle2 className="h-3 w-3 text-success" />; tip = `Calendar invite sent ${fmtDateTime(m.invited_at)}`; }
        else if (s === "outdated") { icon = <RefreshCw className="h-3 w-3 text-warning" />; tip = "Has an older invite. Use Send invitations to update it."; }
        else if (s === "failed") { icon = <AlertTriangle className="h-3 w-3 text-destructive" />; tip = `Invite not sent: ${mailErrorMessage(m.invite_error)}`; }
        else if (s === "no_email") { icon = <MailX className="h-3 w-3 text-muted-foreground" />; tip = "No work email, so no calendar invite"; }
        else if (mailOn) { icon = <Circle className="h-3 w-3 text-muted-foreground" />; tip = "No calendar invite sent yet"; }
        const chip = (
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-foreground">
            {m.name}{icon}
          </span>
        );
        return icon ? <Tip key={m.id} text={tip}><span tabIndex={0} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{chip}</span></Tip> : <span key={m.id}>{chip}</span>;
      })}
    </div>
  );
}

export function ResponseChip({ iv }: { iv: Pick<AtsInterview, "candidate_response" | "candidate_response_at"> }) {
  const r = iv.candidate_response;
  if (!r) return null;
  const [label, cls] = r === "accepted" ? ["Candidate accepted", "border-success/50 bg-success/10 text-success"]
    : r === "declined" ? ["Candidate declined", "border-destructive/50 bg-destructive/10 text-destructive"]
    : ["Candidate said maybe", "border-warning/60 bg-warning/10 text-warning"];
  return (
    <Tip text={fmtDateTime(iv.candidate_response_at)}>
      <Badge variant="outline" tabIndex={0} className={cn("font-medium", cls)}>{label}</Badge>
    </Tip>
  );
}

export function WhereLine({ iv, phone }: { iv: Pick<AtsInterview, "mode" | "location" | "meeting_url">; phone: string | null }) {
  if (iv.mode === "in_person") {
    return (
      <p className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
        <MapPin className="h-3.5 w-3.5 shrink-0" /><span className="truncate" title={iv.location ?? ""}>{iv.location}</span>
      </p>
    );
  }
  if (iv.mode === "video") {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Video className="h-3.5 w-3.5 shrink-0" /> Video call
        {iv.meeting_url && <>
          <a href={iv.meeting_url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-2 hover:underline">Join</a>
          <Button type="button" size="icon" variant="ghost" className="h-6 w-6" aria-label="Copy meeting link"
            onClick={() => navigator.clipboard.writeText(iv.meeting_url!).then(() => toast.success("Copied"), () => toast.error("Couldn't copy"))}>
            <Copy className="h-3 w-3" />
          </Button>
        </>}
      </p>
    );
  }
  return (
    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Phone className="h-3.5 w-3.5 shrink-0" /> Phone call · {phone?.trim() || "no number on file"}
    </p>
  );
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** One toast for an ats-interview-notify result. */
export function summarizeNotify(r: NotifyResult, opts: { base: string; firstName: string; action: "invite" | "update" | "cancel"; names: Map<string, string> }) {
  let text = opts.base;
  let warn = false;
  const c = r.candidate as any;
  if (c) {
    if (c.status === "sent") text += ` · ${opts.firstName} emailed`;
    else if (c.status === "queued" || c.status === "sending") text += ` · email to ${opts.firstName} is on its way`;
    else if (c.status === "skipped" && c.error === "no_email") { text += ` · ${opts.firstName} has no email address`; warn = true; }
    else if (c.status === "skipped") { text += ` · email to ${opts.firstName} not sent: ${mailErrorMessage(c.error)}`; warn = true; }
    else if (c.status === "failed") { text += ` · email to ${opts.firstName} not sent: ${mailErrorMessage(c.error, c.field)}`; warn = true; }
  }
  const panel = r.panel ?? [];
  const ok = panel.filter((p) => p.status === (opts.action === "cancel" ? "cancelled" : "sent")).length;
  if (ok) text += opts.action === "cancel" ? ` · ${plural(ok, "calendar invite")} cancelled` : ` · ${plural(ok, "calendar invite")} sent`;
  const problems: string[] = [];
  for (const p of panel) {
    const name = opts.names.get(p.panel_id) ?? "Interviewer";
    if (p.status === "failed") problems.push(`${name}: ${mailErrorMessage(p.error)}`);
    else if (p.status === "no_email") problems.push(`${name}: no work email`);
    else if (p.status === "skipped") problems.push(`${name}: not sent yet, use Send invitations`);
  }
  if (problems.length) warn = true;
  const description = problems.length ? problems.join("\n") : undefined;
  if (warn) toast.warning(text, { description });
  else toast.success(text, { description });
}

export interface InterviewEmailFieldsProps {
  templates: AtsEmailTemplate[];
  templateId: string | null;
  onTemplateChange: (t: AtsEmailTemplate) => void;
  subject: string;
  onSubjectChange: (v: string) => void;
  body: string;
  onBodyChange: (v: string) => void;
  vals: Record<string, string>;
  disabled?: boolean;
}

/** Leftover placeholders after filling (the parent blocks submit when non-empty). */
export const emailLeftovers = (subject: string, body: string, vals: Record<string, string>) => {
  const f = fillInterviewText(subject, body, vals);
  return leftoverPlaceholders(`${f.subject}\n${f.body}`);
};

export function InterviewEmailFields(p: InterviewEmailFieldsProps) {
  const [preview, setPreview] = useState(false);
  const filled = fillInterviewText(p.subject, p.body, p.vals);
  const left = leftoverPlaceholders(`${filled.subject}\n${filled.body}`);
  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
      {p.templates.length > 0 && (
        <div className="space-y-1.5">
          <Label>Template</Label>
          <Select value={p.templateId ?? undefined} disabled={p.disabled}
            onValueChange={(id) => { const t = p.templates.find((x) => x.id === id); if (t) p.onTemplateChange(t); }}>
            <SelectTrigger className="text-foreground"><SelectValue placeholder="Choose a template" /></SelectTrigger>
            <SelectContent>{p.templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label>Subject</Label>
        <Input value={p.subject} maxLength={200} disabled={p.disabled} onChange={(e) => p.onSubjectChange(e.target.value)} className="text-foreground" />
      </div>
      <div className="space-y-1.5">
        <Label>Message</Label>
        <Textarea rows={8} value={p.body} maxLength={20000} disabled={p.disabled} onChange={(e) => p.onBodyChange(e.target.value)} className="text-foreground" />
        <p className="text-xs text-muted-foreground">
          Placeholders like {"{{interview_date}}"} are filled in when the email is sent. A calendar invite is attached automatically. Your HR signature is added automatically.
        </p>
      </div>
      {left.map((x) => <p key={x} className="text-xs text-destructive">Unknown placeholder {x}. Remove it before sending.</p>)}
      <div>
        <button type="button" onClick={() => setPreview((v) => !v)} aria-expanded={preview}
          className="inline-flex items-center gap-1 rounded text-xs font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", preview && "rotate-180")} /> Preview
        </button>
        {preview && (
          <div className="mt-2 rounded-md border border-border bg-background p-3 text-sm">
            <p className="font-medium text-foreground">{filled.subject || "(no subject)"}</p>
            <p className="mt-2 whitespace-pre-wrap text-foreground">{filled.body || "(empty)"}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Email-section helpers shared by the dialogs. */
export function pickTemplate(list: AtsEmailTemplate[], code: string) {
  return list.find((t) => t.code === code) ?? list[0] ?? null;
}
