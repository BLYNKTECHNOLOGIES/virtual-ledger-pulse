import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Lock, Pencil, Plus, RefreshCw, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { atsErrorMessage } from "@/lib/ats/errors";
import { fmtDate, fmtDateTime, fmtRelative } from "@/lib/ats/format";
import {
  PURPOSES, checkCandidateMail, checkResultText, fillSample, mailErrorMessage, mailKeys, purposeLabel,
  useEmailTemplates, useMailStatus, type AtsEmailTemplate,
} from "@/lib/ats/mail";
import { INTERVIEW_PLACEHOLDERS } from "@/lib/ats/mail";
import { useAtsSettings } from "@/lib/ats/api";
import { QueryError, RowsSkeleton, SectionCard } from "./AtsBits";

const LOOKBACK = [
  { v: 0, l: "Start from now" }, { v: 7, l: "7 days" }, { v: 30, l: "30 days" }, { v: 60, l: "60 days" }, { v: 90, l: "90 days" },
];

/** Shared "Check now" runner: disabled while running and for 30 s after a click. */
export function useCheckNow() {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [cool, setCool] = useState(false);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const run = async () => {
    if (running || cool) return;
    setRunning(true);
    setCool(true);
    timer.current = window.setTimeout(() => setCool(false), 30_000);
    try {
      const r = await checkCandidateMail();
      const t = checkResultText(r);
      t.ok ? toast.success(t.text) : toast.error(t.text);
    } catch (e: any) {
      toast.error(mailErrorMessage(e?.code));
    } finally {
      setRunning(false);
      qc.invalidateQueries({ queryKey: ["ats", "mail"] });
      qc.invalidateQueries({ queryKey: ["ats", "cand"] });
    }
  };
  return { run, running, disabled: running || cool };
}

export function EmailSettingsSection() {
  return (
    <div className="space-y-4">
      <MailCard />
      <TemplatesCard />
    </div>
  );
}

function MailCard() {
  const qc = useQueryClient();
  const st = useMailStatus();
  const check = useCheckNow();
  const [mailbox, setMailbox] = useState<string>("");
  const [days, setDays] = useState<number>(30);
  const [confirm, setConfirm] = useState<null | "on" | "off">(null);
  const [saving, setSaving] = useState(false);
  const [ackConfirm, setAckConfirm] = useState(false);

  const s = st.data;
  useEffect(() => {
    if (!s) return;
    setMailbox(s.mailbox_id ?? s.mailboxes[0]?.id ?? "");
    setDays(s.backfill_days ?? 30);
  }, [s?.mailbox_id, s?.backfill_days, s?.mailboxes?.length]);

  if (st.isLoading) return <SectionCard title="Candidate email"><RowsSkeleton rows={4} /></SectionCard>;
  if (st.isError) return <SectionCard title="Candidate email"><QueryError error={st.error} onRetry={() => st.refetch()} /></SectionCard>;
  if (!s) return <SectionCard title="Candidate email"><p className="text-sm text-muted-foreground">You don't have access to do this.</p></SectionCard>;

  const sync = s.sync;
  const attention = !!(sync?.last_error_at && (!sync.last_ok_at || sync.last_error_at > sync.last_ok_at));
  const chosen = s.mailboxes.find((m) => m.id === mailbox);
  const started = !!sync?.started_at;
  const stats = (sync?.last_stats ?? {}) as Record<string, any>;

  const save = async (patch: Record<string, unknown>) => {
    setSaving(true);
    const { error } = await supabase.from("ats_settings").update(patch as any).eq("id", true);
    setSaving(false);
    if (error) { toast.error(atsErrorMessage(error)); return false; }
    qc.invalidateQueries({ queryKey: mailKeys.status });
    return true;
  };

  const turnOn = async () => {
    setConfirm(null);
    if (!(await save({ mail_enabled: true, mail_mailbox_id: mailbox, mail_backfill_days: days }))) return;
    toast.success("Candidate email turned on");
    check.run();
  };
  const turnOff = async () => {
    setConfirm(null);
    if (await save({ mail_enabled: false })) toast.success("Candidate email turned off");
  };

  return (
    <SectionCard
      title={<span className="flex items-center gap-2">Candidate email
        {!s.enabled ? <Badge variant="secondary">Off</Badge> : attention ? <Badge variant="destructive">Needs attention</Badge> : <Badge className="bg-success/15 text-success hover:bg-success/15">On</Badge>}
      </span>}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Send emails to candidates from the HR mailbox and see their replies on the candidate's page. New replies are picked up every 5 minutes.</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Mailbox</Label>
            <Select value={mailbox} onValueChange={(v) => { setMailbox(v); if (s.enabled) save({ mail_mailbox_id: v }); }} disabled={saving || !s.mailboxes.length}>
              <SelectTrigger className="text-foreground"><SelectValue placeholder="No active mailbox" /></SelectTrigger>
              <SelectContent>{s.mailboxes.map((m) => <SelectItem key={m.id} value={m.id}>{m.label ?? m.from_name ?? "Mailbox"} · {m.from_address}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Pick up candidate emails from the last…</Label>
            <Select value={String(days)} onValueChange={(v) => { setDays(Number(v)); if (s.enabled) save({ mail_backfill_days: Number(v) }); }} disabled={saving || started}>
              <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent>{LOOKBACK.map((o) => <SelectItem key={o.v} value={String(o.v)}>{o.l}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{started ? `Reading started on ${fmtDate(sync!.started_at)}` : "Used once, when email is first turned on."}</p>
          </div>
        </div>

        {chosen && !chosen.can_receive && (
          <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">Receiving is off for this mailbox in the HR mailbox settings, so replies won't be picked up. Sending still works.</p>
        )}

        <div className="flex items-center gap-3">
          <Switch id="ats-mail-on" checked={s.enabled} disabled={saving || (!s.enabled && !mailbox)}
            onCheckedChange={(v) => setConfirm(v ? "on" : "off")} />
          <Label htmlFor="ats-mail-on">Turn on candidate email</Label>
        </div>

        {s.enabled && (
          <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <TooltipProvider><Tooltip><TooltipTrigger asChild>
                <span className="text-foreground">Last checked {sync?.last_run_at ? fmtRelative(sync.last_run_at) : "never"}</span>
              </TooltipTrigger><TooltipContent>{sync?.last_run_at ? `${fmtDateTime(sync.last_run_at)}${stats.source ? ` · ${stats.source}` : ""}` : "Not checked yet"}</TooltipContent></Tooltip></TooltipProvider>
              <Button size="sm" variant="outline" className="gap-1.5" disabled={check.disabled} onClick={check.run}>
                {check.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check now
              </Button>
            </div>
            {sync?.last_stats && Object.keys(stats).length > 0 && (
              <p className="text-muted-foreground">{Number(stats.stored ?? 0)} new candidate {Number(stats.stored ?? 0) === 1 ? "email" : "emails"} · {Number(stats.attachments_saved ?? 0)} files saved · {Number(stats.bounces ?? 0)} bounced</p>
            )}
            {Number(stats.pending ?? 0) > 0 && <p className="text-muted-foreground">{stats.pending} still to read</p>}
            {attention && <p className="text-destructive">{mailErrorMessage(sync!.last_error)} · {fmtDateTime(sync!.last_error_at)}</p>}
            <p className="text-muted-foreground">{s.unread} unread candidate {Number(s.unread) === 1 ? "reply" : "replies"}</p>
          </div>
        )}

        <div className="space-y-3 border-t border-border pt-3">
          <div className="flex items-start gap-3">
            <Switch id="ats-rej-default" checked={s.reject_default} disabled={saving}
              onCheckedChange={async (v) => { if (await save({ mail_reject_default: v })) toast.success("Saved"); }} />
            <Label htmlFor="ats-rej-default" className="leading-5">Tick 'Email the candidate' by default when rejecting</Label>
          </div>
          <div className="flex items-start gap-3">
            <Switch id="ats-ack" checked={s.ack_enabled} disabled={saving || !s.enabled}
              onCheckedChange={(v) => (v ? setAckConfirm(true) : save({ mail_ack_enabled: false }).then((ok) => ok && toast.success("Automatic acknowledgements turned off")))} />
            <div className="space-y-1">
              <Label htmlFor="ats-ack" className="leading-5">Send 'Application received' to careers-page applicants</Label>
              <p className="text-xs text-muted-foreground">Sent automatically within about 5 minutes of applying, from {chosen?.from_address ?? "the HR mailbox"}, using the 'Application received' template. Applications that reach the ATS more than a day after they were made (for example, older ones synced from the website) don't get one.</p>
              <p className="text-xs text-muted-foreground">
                {s.queued} waiting to be sent · <Link to="/hrms/ats/inbox?view=undelivered" className="text-primary hover:underline">{s.failed_7d} not delivered in the last 7 days</Link>
              </p>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">Only emails from a candidate's address, or replies to emails sent from the ATS, are copied. PDF, Word and image attachments up to 10 MB are saved to the candidate's files.</p>
      </div>

      <AlertDialog open={ackConfirm} onOpenChange={setAckConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn on automatic acknowledgements?</AlertDialogTitle>
            <AlertDialogDescription>Every new careers-page applicant with an email address will get the 'Application received' email.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { setAckConfirm(false); if (await save({ mail_ack_enabled: true })) toast.success("Automatic acknowledgements turned on"); }}>Turn on</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "on" ? "Turn on candidate email?" : "Turn off candidate email?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "on"
                ? `Emails you write in the ATS are sent from ${chosen?.from_address ?? "the HR mailbox"}. Every 5 minutes the ATS reads new mail in that mailbox and copies emails from candidates, and replies to ATS emails, onto their profiles. Other mail is left alone and nothing in the mailbox is changed.`
                : "Sending from the ATS stops and replies are no longer picked up. Emails already on candidate profiles stay."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirm === "on" ? turnOn : turnOff}>{confirm === "on" ? "Turn on" : "Turn off"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  );
}

function TemplatesCard() {
  const qc = useQueryClient();
  const tpl = useEmailTemplates({ includeInactive: true });
  const ms = useMailStatus();
  const ackOn = !!(ms.data?.enabled && ms.data?.ack_enabled);
  const atsSettings = useAtsSettings();
  const reminderOn = !!(ms.data?.enabled && (atsSettings.data?.interview_reminder_hours ?? 0) > 0);
  const [edit, setEdit] = useState<AtsEmailTemplate | "new" | null>(null);
  const [del, setDel] = useState<AtsEmailTemplate | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: mailKeys.templates });

  const toggle = async (t: AtsEmailTemplate, v: boolean) => {
    const { error } = await supabase.from("ats_email_templates").update({ is_active: v }).eq("id", t.id);
    if (error) toast.error(atsErrorMessage(error)); else refresh();
  };
  const remove = async () => {
    const t = del!;
    setDel(null);
    const { error } = await supabase.from("ats_email_templates").delete().eq("id", t.id);
    if (error) toast.error(atsErrorMessage(error)); else { toast.success("Template deleted"); refresh(); }
  };
  const maxSort = Math.max(0, ...(tpl.data ?? []).map((t) => t.sort_order));

  return (
    <SectionCard title="Email templates" action={<Button size="sm" className="gap-1.5" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> New template</Button>}>
      {tpl.isLoading ? <RowsSkeleton rows={4} /> : tpl.isError ? <QueryError error={tpl.error} onRetry={() => tpl.refetch()} /> : (
        <ul className="divide-y divide-border">
          {(tpl.data ?? []).map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{t.name}</span>
                  <Badge variant="secondary" className="font-normal">{purposeLabel(t.purpose)}</Badge>
                  {t.code === "acknowledgement" && ackOn && <Badge variant="outline" className="font-normal">Used automatically</Badge>}
                  {t.code === "interview-reminder" && reminderOn && <Badge variant="outline" className="font-normal">Used automatically</Badge>}
                  {["interview-scheduled", "interview-rescheduled", "interview-cancelled"].includes(t.code) && <Badge variant="outline" className="font-normal">Used when scheduling</Badge>}
                </div>
                <p className="truncate text-xs text-muted-foreground">{t.subject}</p>
              </div>
              <Switch checked={t.is_active} onCheckedChange={(v) => toggle(t, v)} aria-label="Active" />
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Edit" onClick={() => setEdit(t)}><Pencil className="h-4 w-4" /></Button>
              {t.is_system ? (
                <TooltipProvider><Tooltip><TooltipTrigger asChild><span className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground"><Lock className="h-4 w-4" /></span></TooltipTrigger><TooltipContent>Built-in</TooltipContent></Tooltip></TooltipProvider>
              ) : (
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" aria-label="Delete" onClick={() => setDel(t)}><Trash2 className="h-4 w-4" /></Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <TemplateDialog value={edit} nextSort={maxSort + 10} onClose={() => setEdit(null)} onSaved={refresh} />
      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete "{del?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This template will be removed. Emails already sent are not affected.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={remove}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  );
}

const PLACEHOLDERS = ["first_name", "full_name", "job_title", "company_name", "ref_no"];

function TemplateDialog({ value, nextSort, onClose, onSaved }: { value: AtsEmailTemplate | "new" | null; nextSort: number; onClose: () => void; onSaved: () => void }) {
  const t = value && value !== "new" ? value : null;
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("general");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!value) return;
    setName(t?.name ?? ""); setPurpose(t?.purpose ?? "general"); setSubject(t?.subject ?? ""); setBody(t?.body ?? "");
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const insert = (p: string) => {
    const el = bodyRef.current;
    const tok = `{{${p}}}`;
    const s = el?.selectionStart ?? body.length, e = el?.selectionEnd ?? body.length;
    const next = body.slice(0, s) + tok + body.slice(e);
    setBody(next.slice(0, 20000));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(s + tok.length, s + tok.length); });
  };
  const valid = name.trim().length >= 1 && name.trim().length <= 80 && subject.trim().length >= 1 && subject.trim().length <= 200 && body.trim().length >= 1;

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const row = { name: name.trim(), purpose, subject: subject.trim(), body };
    const { error } = t
      ? await supabase.from("ats_email_templates").update(row).eq("id", t.id)
      : await supabase.from("ats_email_templates").insert({ ...row, sort_order: nextSort, code: "" } as any);
    setBusy(false);
    if (error) return toast.error(atsErrorMessage(error));
    toast.success("Template saved");
    onSaved();
    onClose();
  };

  return (
    <ResponsiveDialog open={!!value} onOpenChange={(o) => !o && onClose()} title={t ? "Edit template" : "New template"}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!valid || busy} onClick={save}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="tpl-name">Name</Label><Input id="tpl-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className="text-foreground" /></div>
          <div className="space-y-1.5"><Label>Purpose</Label>
            <Select value={purpose} onValueChange={setPurpose} disabled={!!t?.is_system}>
              <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent>{PURPOSES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="tpl-subject">Subject</Label><Input id="tpl-subject" maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} className="text-foreground" /></div>
        <div className="space-y-1.5">
          <Label htmlFor="tpl-body">Body</Label>
          <div className="flex flex-wrap gap-1">
            {PLACEHOLDERS.map((p) => <Button key={p} type="button" size="sm" variant="outline" className="h-7 font-mono text-xs" onClick={() => insert(p)}>{`{{${p}}}`}</Button>)}
          </div>
          {purpose === "interview" && <>
            <p className="pt-1 text-xs font-medium text-muted-foreground">Interview details</p>
            <div className="flex flex-wrap gap-1">
              {INTERVIEW_PLACEHOLDERS.map((p) => <Button key={p} type="button" size="sm" variant="outline" className="h-7 font-mono text-xs" onClick={() => insert(p)}>{`{{${p}}}`}</Button>)}
            </div>
            <p className="text-xs text-muted-foreground">Interview details are filled in from the interview. Templates that use them are offered when you schedule, change or cancel an interview, not in the normal email composer.</p>
          </>}
          <Textarea id="tpl-body" ref={bodyRef} rows={12} maxLength={20000} value={body} onChange={(e) => setBody(e.target.value)} className="text-foreground" />
        </div>
        <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-xs font-medium text-muted-foreground">Preview</p>
          <p className="text-sm font-semibold text-foreground">{fillSample(subject) || "—"}</p>
          <p className="whitespace-pre-wrap text-sm text-foreground">{fillSample(body) || "—"}</p>
          <p className="text-xs text-muted-foreground">Your HR signature is added automatically when the email is sent.</p>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
