import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  PLACEHOLDER_GROUPS, PURPOSES, checkCandidateMail, checkResultText, fillSample, mailErrorMessage, mailKeys, purposeLabel,
  sampleValuesFrom, sendTestEmail, templateProblems, templateValues, useEmailTemplates, useMailStatus, type AtsEmailTemplate,
} from "@/lib/ats/mail";
import { INTERVIEW_PLACEHOLDERS } from "@/lib/ats/mail";
import { SLOT_SAMPLE, SLOT_TEMPLATE_CODES } from "@/lib/ats/selfSchedule";
import { useAtsSettings, useCanManageAtsSettings } from "@/lib/ats/api";
import { LastChecked, SubjectSentAs } from "./MailBits";
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
      <EmailDetailsCard />
      <TemplatesCard />
    </div>
  );
}

/** Emails the reader could not file (ats_mail_issues), each with Dismiss. */
function MailIssuesList() {
  const qc = useQueryClient();
  const issues = useQuery({
    queryKey: ["ats", "mail", "issues"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ats_mail_issues").select("id, from_address, subject, received_at, created_at")
        .is("dismissed_at", null).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
  const dismiss = async (id: string) => {
    const { data: u } = await supabase.auth.getUser();
    const { data: name } = u.user ? await supabase.rpc("ats_actor_name", { p_uid: u.user.id }) : { data: null };
    const { error } = await supabase.from("ats_mail_issues")
      .update({ dismissed_at: new Date().toISOString(), dismissed_by_name: (name as string | null) ?? u.user?.email ?? null }).eq("id", id);
    if (error) return toast.error(atsErrorMessage(error));
    qc.invalidateQueries({ queryKey: ["ats", "mail"] });
  };
  if (issues.isLoading) return <RowsSkeleton rows={2} />;
  if (issues.isError) return <QueryError error={issues.error} onRetry={() => issues.refetch()} />;
  return (
    <ul className="divide-y divide-border rounded-md border border-border bg-background">
      {(issues.data ?? []).map((i) => (
        <li key={i.id} className="flex flex-wrap items-center gap-2 px-2 py-1.5 text-xs">
          <span className="min-w-0 flex-1 break-words text-foreground">{i.from_address ?? "Unknown sender"} · {i.subject || "(no subject)"} · {fmtDateTime(i.received_at ?? i.created_at)}</span>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => dismiss(i.id)}>Dismiss</Button>
        </li>
      ))}
    </ul>
  );
}

function MailCard() {
  const ro = useCanManageAtsSettings().data !== true;
  const qc = useQueryClient();
  const st = useMailStatus();
  const check = useCheckNow();
  const [mailbox, setMailbox] = useState<string>("");
  const [days, setDays] = useState<number>(30);
  const [confirm, setConfirm] = useState<null | "on" | "off">(null);
  const [saving, setSaving] = useState(false);
  const [ackConfirm, setAckConfirm] = useState(false);
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  const [showIssues, setShowIssues] = useState(false);

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
            <Select value={mailbox} onValueChange={(v) => { if (s.enabled) { if (v !== mailbox) setSwitchTo(v); } else setMailbox(v); }} disabled={ro || saving || !s.mailboxes.length}>
              <SelectTrigger className="text-foreground"><SelectValue placeholder="No active mailbox" /></SelectTrigger>
              <SelectContent>{s.mailboxes.map((m) => <SelectItem key={m.id} value={m.id}>{m.label ?? m.from_name ?? "Mailbox"} · {m.from_address}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Pick up candidate emails from the last…</Label>
            <Select value={String(days)} onValueChange={(v) => { setDays(Number(v)); if (s.enabled) save({ mail_backfill_days: Number(v) }); }} disabled={ro || saving || started}>
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
          <Switch id="ats-mail-on" checked={s.enabled} disabled={ro || saving || (!s.enabled && !mailbox)}
            onCheckedChange={(v) => setConfirm(v ? "on" : "off")} />
          <Label htmlFor="ats-mail-on">Turn on candidate email</Label>
        </div>

        {s.enabled && (
          <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <LastChecked sync={sync} className="text-foreground" />
              <Button size="sm" variant="outline" className="gap-1.5" disabled={check.disabled} onClick={check.run}>
                {check.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Check now
              </Button>
            </div>
            <p className="text-muted-foreground">Last 24 hours: {Number(s.received_24h ?? 0)} replies filed · {Number(s.sent_24h ?? 0)} emails sent · {Number(s.failed_30d ?? 0)} not delivered in 30 days</p>
            {Number(s.issues ?? 0) > 0 && (
              <div className="space-y-1">
                <p className="text-warning">
                  {s.issues} {s.issues === 1 ? "email" : "emails"} couldn't be filed. Open them in the HR mailbox.{" "}
                  <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => setShowIssues((v) => !v)}>{showIssues ? "Hide" : "Show"}</button>
                </p>
                {showIssues && <MailIssuesList />}
              </div>
            )}
            {Number(stats.pending ?? 0) > 0 && <p className="text-muted-foreground">{stats.pending} still to read</p>}
            {attention && <p className="text-destructive">{mailErrorMessage(sync!.last_error)} · {fmtDateTime(sync!.last_error_at)}</p>}
            <p className="text-muted-foreground">{s.unread} unread candidate {Number(s.unread) === 1 ? "reply" : "replies"}</p>
          </div>
        )}

        <div className="space-y-3 border-t border-border pt-3">
          <div className="flex items-start gap-3">
            <Switch id="ats-rej-default" checked={s.reject_default} disabled={ro || saving}
              onCheckedChange={async (v) => { if (await save({ mail_reject_default: v })) toast.success("Saved"); }} />
            <Label htmlFor="ats-rej-default" className="leading-5">Tick 'Email the candidate' by default when rejecting</Label>
          </div>
          <div className="flex items-start gap-3">
            <Switch id="ats-ack" checked={s.ack_enabled} disabled={ro || saving || !s.enabled}
              onCheckedChange={(v) => (v ? setAckConfirm(true) : save({ mail_ack_enabled: false }).then((ok) => ok && toast.success("Automatic acknowledgements turned off")))} />
            <div className="space-y-1">
              <Label htmlFor="ats-ack" className="leading-5">Send 'Application received' to careers-page applicants</Label>
              <p className="text-xs text-muted-foreground">Sent automatically within about 5 minutes of applying, from {chosen?.from_address ?? "the HR mailbox"}, using the 'Application received' template. Applications that reach the ATS more than a day after they were made (for example, older ones synced from the website) don't get one.</p>
              <p className="text-xs text-muted-foreground">
                {s.queued} waiting to be sent · <Link to="/hrms/ats/inbox?view=undelivered" className="text-primary hover:underline">{Number(s.failed_30d ?? 0)} not delivered in the last 30 days</Link>
              </p>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">Only emails from a candidate's address, or replies to emails sent from the ATS, are copied. PDF, Word and image attachments up to 10 MB are saved to the candidate's files.</p>
      </div>

      <AlertDialog open={!!switchTo} onOpenChange={(o) => { if (!o) setSwitchTo(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch candidate email to {s.mailboxes.find((m) => m.id === switchTo)?.label ?? s.mailboxes.find((m) => m.id === switchTo)?.from_address}?</AlertDialogTitle>
            <AlertDialogDescription>
              New emails will be sent from {s.mailboxes.find((m) => m.id === switchTo)?.from_address} and replies will be read from that mailbox. Replies to emails sent earlier from {chosen?.from_address} will not be picked up after the switch.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { const v = switchTo!; setSwitchTo(null); if (await save({ mail_mailbox_id: v })) setMailbox(v); }}>Switch mailbox</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

/** Company name and HR phone used for {{company_name}} / {{hr_phone}}; office address is read-only here. */
function EmailDetailsCard() {
  const ro = useCanManageAtsSettings().data !== true;
  const qc = useQueryClient();
  const st = useAtsSettings();
  const s = st.data as (Record<string, any> | null | undefined);
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!s) return;
    setCompany(s.company_display_name ?? ""); setPhone(s.hr_contact_phone ?? "");
  }, [s?.company_display_name, s?.hr_contact_phone]); // eslint-disable-line react-hooks/exhaustive-deps

  if (st.isLoading) return <SectionCard title="Details used in emails"><RowsSkeleton rows={3} /></SectionCard>;
  if (st.isError) return <SectionCard title="Details used in emails"><QueryError error={st.error} onRetry={() => st.refetch()} /></SectionCard>;

  const c = company.trim(), ph = phone.trim();
  const phoneOk = !ph || /^[0-9+() -]{6,20}$/.test(ph);
  const valid = c.length >= 1 && c.length <= 120 && phoneOk;
  const dirty = c !== (s?.company_display_name ?? "") || ph !== (s?.hr_contact_phone ?? "");
  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const { error } = await supabase.from("ats_settings").update({ company_display_name: c, hr_contact_phone: ph || null } as any).eq("id", true);
    setBusy(false);
    if (error) return toast.error(atsErrorMessage(error));
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["ats", "settings"] });
    qc.invalidateQueries({ queryKey: ["ats", "tpl-values"] });
  };
  return (
    <SectionCard title="Details used in emails">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ats-company">Company name in emails <span className="text-destructive">*</span></Label>
            <Input id="ats-company" maxLength={120} value={company} disabled={ro || busy} onChange={(e) => setCompany(e.target.value)} className="text-foreground" />
            <p className="text-xs text-muted-foreground">Used for {"{{company_name}}"}. Your signature is set separately.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ats-hr-phone">HR phone for candidates</Label>
            <Input id="ats-hr-phone" maxLength={20} inputMode="tel" value={phone} disabled={ro || busy} onChange={(e) => setPhone(e.target.value)} className="text-foreground" />
            <p className={phoneOk ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>
              {phoneOk ? "Used for {{hr_phone}}." : "Use 6–20 digits, spaces, +, - or brackets."}
            </p>
          </div>
        </div>
        <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <p className="text-xs font-medium text-muted-foreground">Office address — {"{{office_address}}"}</p>
          <p className="whitespace-pre-wrap text-foreground">{s?.interview_address?.trim() || "Not set"}</p>
          <Link to="/hrms/ats/settings?tab=interviews" className="text-xs text-primary underline-offset-2 hover:underline">Change in Interviews settings</Link>
        </div>
        <div className="flex justify-end">
          <Button size="sm" disabled={ro || !valid || !dirty || busy} onClick={save}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save</Button>
        </div>
      </div>
    </SectionCard>
  );
}

const REQUIRED_CODES = ["interview-scheduled", "interview-rescheduled", "interview-cancelled"];
const ASK_BEFORE_OFF = ["acknowledgement", "interview-reminder"];
const chan = (t: AtsEmailTemplate) => ((t as any).channel ?? "email") as "email" | "whatsapp";

function TemplatesCard() {
  const ro = useCanManageAtsSettings().data !== true;
  const qc = useQueryClient();
  const tpl = useEmailTemplates({ includeInactive: true, channel: "all" });
  const ms = useMailStatus();
  const ackOn = !!(ms.data?.enabled && ms.data?.ack_enabled);
  const atsSettings = useAtsSettings();
  const reminderOn = !!(ms.data?.enabled && (atsSettings.data?.interview_reminder_hours ?? 0) > 0);
  const [edit, setEdit] = useState<AtsEmailTemplate | "new" | null>(null);
  const [del, setDel] = useState<AtsEmailTemplate | null>(null);
  const [offAsk, setOffAsk] = useState<AtsEmailTemplate | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: mailKeys.templates });

  const toggle = async (t: AtsEmailTemplate, v: boolean) => {
    const { error } = await supabase.from("ats_email_templates").update({ is_active: v }).eq("id", t.id);
    if (error) toast.error(atsErrorMessage(error)); else refresh();
  };
  const onSwitch = (t: AtsEmailTemplate, v: boolean) => {
    if (!v && t.is_system && ASK_BEFORE_OFF.includes(t.code)) setOffAsk(t); else toggle(t, v);
  };
  const remove = async () => {
    const t = del!;
    setDel(null);
    const { error } = await supabase.from("ats_email_templates").delete().eq("id", t.id);
    if (error) toast.error(atsErrorMessage(error)); else { toast.success("Template deleted"); refresh(); }
  };
  const maxSort = Math.max(0, ...(tpl.data ?? []).map((t) => t.sort_order));

  const row = (t: AtsEmailTemplate) => {
    const required = t.is_system && REQUIRED_CODES.includes(t.code);
    return (
      <li key={t.id} className="flex flex-wrap items-center gap-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{t.name}</span>
            <Badge variant="secondary" className="font-normal">{purposeLabel(t.purpose)}</Badge>
            {(t as any).quick_reply && <Badge variant="outline" className="font-normal">Quick reply</Badge>}
            {t.code === "acknowledgement" && ackOn && <Badge variant="outline" className="font-normal">Used automatically</Badge>}
            {t.code === "interview-reminder" && reminderOn && <Badge variant="outline" className="font-normal">Used automatically</Badge>}
            {REQUIRED_CODES.includes(t.code) && <Badge variant="outline" className="font-normal">Used when scheduling</Badge>}
          </div>
          {chan(t) === "email" && <p className="truncate text-xs text-muted-foreground">{t.subject}</p>}
          {t.updated_by_name && <p className="text-xs text-muted-foreground">Edited by {t.updated_by_name}, {fmtDate(t.updated_at)}</p>}
        </div>
        {required ? (
          <TooltipProvider><Tooltip><TooltipTrigger asChild>
            <span tabIndex={0}><Switch checked={t.is_active} disabled aria-label="Active" /></span>
          </TooltipTrigger><TooltipContent>Needed for interview emails. You can edit the text.</TooltipContent></Tooltip></TooltipProvider>
        ) : (
          <Switch checked={t.is_active} onCheckedChange={(v) => onSwitch(t, v)} disabled={ro} aria-label="Active" />
        )}
        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Edit" disabled={ro} onClick={() => setEdit(t)}><Pencil className="h-4 w-4" /></Button>
        {t.is_system ? (
          <TooltipProvider><Tooltip><TooltipTrigger asChild><span className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground"><Lock className="h-4 w-4" /></span></TooltipTrigger><TooltipContent>Built-in</TooltipContent></Tooltip></TooltipProvider>
        ) : (
          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" aria-label="Delete" disabled={ro} onClick={() => setDel(t)}><Trash2 className="h-4 w-4" /></Button>
        )}
      </li>
    );
  };
  const groups: { key: "email" | "whatsapp"; title: string }[] = [{ key: "email", title: "Email templates" }, { key: "whatsapp", title: "WhatsApp templates" }];

  return (
    <SectionCard title="Templates" action={<Button size="sm" className="gap-1.5" disabled={ro} onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> New template</Button>}>
      {tpl.isLoading ? <RowsSkeleton rows={4} /> : tpl.isError ? <QueryError error={tpl.error} onRetry={() => tpl.refetch()} /> : (
        <div className="space-y-5">
          {groups.map((g) => {
            const list = (tpl.data ?? []).filter((t) => chan(t) === g.key);
            return (
              <section key={g.key} aria-label={g.title}>
                <h3 className="border-b border-border pb-1.5 text-sm font-semibold text-foreground">{g.title}</h3>
                {list.length ? <ul className="divide-y divide-border">{list.map(row)}</ul>
                  : <p className="py-3 text-sm text-muted-foreground">No templates yet.</p>}
              </section>
            );
          })}
        </div>
      )}
      <TemplateDialog value={edit} nextSort={maxSort + 10} onClose={() => setEdit(null)} onSaved={refresh} />
      <AlertDialog open={!!offAsk} onOpenChange={(o) => !o && setOffAsk(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Turn off '{offAsk?.name}'?</AlertDialogTitle>
            <AlertDialogDescription>Automatic '{offAsk?.name}' emails will stop until you turn it back on.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const t = offAsk!; setOffAsk(null); toggle(t, false); }}>Turn off</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

/** "Preview with" a real candidate: their latest application, and their next scheduled interview for interview templates. */
function useCandidatePreviewValues(candidateId: string | null, interview: boolean) {
  return useQuery({
    queryKey: ["ats", "tpl-values", "cand", candidateId ?? "", interview],
    enabled: !!candidateId,
    queryFn: async () => {
      const { data: apps, error } = await supabase.from("ats_applications").select("id")
        .eq("candidate_id", candidateId!).order("applied_at", { ascending: false }).limit(1);
      if (error) throw error;
      const appId = apps?.[0]?.id ?? null;
      if (interview) {
        const { data: ivs } = await supabase.from("ats_interviews").select("id")
          .eq("candidate_id", candidateId!).eq("status", "scheduled").gt("starts_at", new Date().toISOString())
          .order("starts_at").limit(1);
        if (ivs?.[0]?.id) return { values: await templateValues({ interviewId: ivs[0].id }), sampleInterview: false };
      }
      const v = await templateValues(appId ? { applicationId: appId } : { candidateId });
      return { values: v, sampleInterview: interview };
    },
  });
}

function CandidatePicker({ onPick }: { onPick: (c: { id: string; label: string }) => void }) {
  const [q, setQ] = useState("");
  const term = q.trim().replace(/[%,()]/g, "");
  const res = useQuery({
    queryKey: ["ats", "tpl-cand-search", term],
    enabled: term.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.from("ats_candidates").select("id, full_name, ref_no")
        .is("merged_into_id", null).is("anonymized_at", null)
        .or(`full_name.ilike.%${term}%,ref_no.ilike.%${term}%`).order("full_name").limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div className="space-y-1">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or BX number" className="h-8 text-foreground" aria-label="Search candidates" />
      {term.length >= 2 && (
        <ul className="max-h-40 overflow-y-auto rounded-md border border-border bg-background text-sm">
          {res.isLoading ? <li className="px-2 py-1.5 text-muted-foreground">Searching…</li>
            : (res.data ?? []).length === 0 ? <li className="px-2 py-1.5 text-muted-foreground">No candidates found</li>
            : (res.data ?? []).map((c) => (
              <li key={c.id}><button type="button" className="w-full px-2 py-1.5 text-left hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                onClick={() => { onPick({ id: c.id, label: `${c.full_name}${c.ref_no ? ` · ${c.ref_no}` : ""}` }); setQ(""); }}>
                <span className="text-foreground">{c.full_name}</span>{c.ref_no && <span className="text-muted-foreground"> · {c.ref_no}</span>}
              </button></li>
            ))}
        </ul>
      )}
    </div>
  );
}

function TemplateDialog({ value, nextSort, onClose, onSaved }: { value: AtsEmailTemplate | "new" | null; nextSort: number; onClose: () => void; onSaved: () => void }) {
  const ro = useCanManageAtsSettings().data !== true;
  const t = value && value !== "new" ? value : null;
  const ms = useMailStatus();
  const settings = useAtsSettings();
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("general");
  const [channel, setChannel] = useState<"email" | "whatsapp">("email");
  const [quick, setQuick] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [restoreAsk, setRestoreAsk] = useState(false);
  const [previewCand, setPreviewCand] = useState<{ id: string; label: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const lastField = useRef<"subject" | "body">("body");
  useEffect(() => {
    if (!value) return;
    setName(t?.name ?? ""); setPurpose(t?.purpose ?? "general"); setSubject(t?.subject ?? ""); setBody(t?.body ?? "");
    setChannel(t ? chan(t) : "email"); setQuick(!!(t as any)?.quick_reply);
    setPreviewCand(null); setPicking(false); lastField.current = "body";
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const wa = channel === "whatsapp";
  const isIv = purpose === "interview";
  const candVals = useCandidatePreviewValues(previewCand?.id ?? null, isIv);
  const samples = sampleValuesFrom(settings.data as any);
  // The two pick-a-time templates may also use {{slot_link}} / {{slot_list}} (filled by the app when the link is made).
  const isSlotTpl = !!t && SLOT_TEMPLATE_CODES.includes(t.code);
  const basePreview = previewCand && candVals.data
    ? (candVals.data.sampleInterview
      ? { ...Object.fromEntries(INTERVIEW_PLACEHOLDERS.map((k) => [k, samples[k]])), ...candVals.data.values }
      : candVals.data.values)
    : samples;
  const previewVals = isSlotTpl ? { ...basePreview, ...SLOT_SAMPLE } : basePreview;

  const insert = (p: string) => {
    const tok = `{{${p}}}`;
    const target = wa ? "body" : lastField.current;
    if (target === "subject") {
      const el = subjectRef.current;
      const s = el?.selectionStart ?? subject.length, e = el?.selectionEnd ?? subject.length;
      setSubject((subject.slice(0, s) + tok + subject.slice(e)).slice(0, 200));
      requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(s + tok.length, s + tok.length); });
    } else {
      const el = bodyRef.current;
      const s = el?.selectionStart ?? body.length, e = el?.selectionEnd ?? body.length;
      setBody((body.slice(0, s) + tok + body.slice(e)).slice(0, 20000));
      requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(s + tok.length, s + tok.length); });
    }
  };
  const effSubject = wa ? name.trim() : subject;
  const stripSlots = (x: string) => (isSlotTpl ? x.replace(/\{\{\s*slot_(link|list)\s*\}\}/g, "") : x);
  const problems = templateProblems(stripSlots(effSubject), stripSlots(body), purpose);
  const valid = name.trim().length >= 1 && name.trim().length <= 80 && effSubject.trim().length >= 1 && effSubject.trim().length <= 200
    && body.trim().length >= 1 && problems.length === 0;
  const defSubject = (t as any)?.default_subject as string | null | undefined;
  const defBody = (t as any)?.default_body as string | null | undefined;
  const canRestore = !!t?.is_system && !!defBody && (subject !== (defSubject ?? subject) || body !== defBody);

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const row: Record<string, unknown> = { name: name.trim(), purpose, subject: effSubject.trim(), body, quick_reply: quick };
    if (!t) row.channel = channel;
    const { error } = t
      ? await supabase.from("ats_email_templates").update(row as any).eq("id", t.id)
      : await supabase.from("ats_email_templates").insert({ ...row, sort_order: nextSort, code: "" } as any);
    setBusy(false);
    if (error) return toast.error(atsErrorMessage(error));
    toast.success("Template saved");
    onSaved();
    onClose();
  };

  const prevSubject = fillSample(effSubject, previewVals);
  const prevBody = fillSample(body, previewVals);
  const sendTest = async () => {
    if (testing) return;
    setTesting(true);
    try {
      const r = await sendTestEmail(prevSubject, prevBody);
      if (r.status === "sent") toast.success(`Test sent to ${r.to}`); else toast.error(mailErrorMessage(r.error));
    } catch (e: any) {
      toast.error(mailErrorMessage(e?.code, e?.field));
    } finally { setTesting(false); }
  };

  return (
    <ResponsiveDialog open={!!value} onOpenChange={(o) => !o && onClose()} title={t ? "Edit template" : "New template"}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={ro || !valid || busy} onClick={save}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5"><Label htmlFor="tpl-name">Name</Label><Input id="tpl-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className="text-foreground" /></div>
          <div className="space-y-1.5"><Label>Channel</Label>
            {t ? <p className="flex h-10 items-center text-sm text-foreground">{wa ? "WhatsApp" : "Email"}</p> : (
              <Select value={channel} onValueChange={(v) => setChannel(v as "email" | "whatsapp")}>
                <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="email">Email</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem></SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5"><Label>Purpose</Label>
            <Select value={purpose} onValueChange={setPurpose} disabled={!!t?.is_system}>
              <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent>{PURPOSES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        {wa ? (
          <p className="text-xs text-muted-foreground">WhatsApp messages are sent from your own WhatsApp; no signature is added.</p>
        ) : (
          <div className="space-y-1.5"><Label htmlFor="tpl-subject">Subject</Label>
            <Input id="tpl-subject" ref={subjectRef} maxLength={200} value={subject} onFocus={() => { lastField.current = "subject"; }}
              onChange={(e) => setSubject(e.target.value)} className="text-foreground" /><SubjectSentAs subject={subject} /></div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="tpl-body">Message</Label>
          <div className="space-y-1.5">
            {PLACEHOLDER_GROUPS.filter((g) => !g.interview || isIv).map((g) => (
              <div key={g.label} className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{g.label}</p>
                <div className="flex flex-wrap gap-1">
                  {g.keys.map((p) => <Button key={p} type="button" size="sm" variant="outline" className="h-7 font-mono text-xs"
                    onMouseDown={(e) => e.preventDefault()} onClick={() => insert(p)}>{`{{${p}}}`}</Button>)}
                </div>
              </div>
            ))}
            {isSlotTpl && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Pick-a-time link</p>
                <div className="flex flex-wrap gap-1">
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onMouseDown={(e) => e.preventDefault()} onClick={() => insert("slot_link")}>Pick-a-time link</Button>
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onMouseDown={(e) => e.preventDefault()} onClick={() => insert("slot_list")}>List of times</Button>
                </div>
              </div>
            )}
            {isIv && <p className="text-xs text-muted-foreground">Interview details are filled in from the interview. Templates that use them are offered when you schedule, change or cancel an interview, not in the normal email composer.</p>}
          </div>
          <Textarea id="tpl-body" ref={bodyRef} rows={12} maxLength={20000} value={body} onFocus={() => { lastField.current = "body"; }}
            onChange={(e) => setBody(e.target.value)} className="text-foreground" />
        </div>
        {problems.length > 0 && (
          <div className="space-y-0.5" role="status" aria-live="polite">
            {problems.map((p) => <p key={p} className="text-xs text-destructive">{p}</p>)}
          </div>
        )}
        <div className="flex items-start gap-3">
          <Switch id="tpl-quick" checked={quick} onCheckedChange={setQuick} />
          <div className="space-y-0.5">
            <Label htmlFor="tpl-quick" className="leading-5">Use as a quick reply</Label>
            <p className="text-xs text-muted-foreground">Shown as a one-click reply when writing to a candidate.</p>
          </div>
        </div>
        {canRestore && (
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setRestoreAsk(true)}>
            <RefreshCw className="h-4 w-4" /> Restore default text
          </Button>
        )}
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">Preview</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Preview with:</span>
              <Select value={previewCand ? "cand" : "sample"} onValueChange={(v) => { if (v === "sample") { setPreviewCand(null); setPicking(false); } else setPicking(true); }}>
                <SelectTrigger className="h-8 w-auto min-w-[9rem] text-foreground"><SelectValue>{previewCand ? previewCand.label : "Sample values"}</SelectValue></SelectTrigger>
                <SelectContent><SelectItem value="sample">Sample values</SelectItem><SelectItem value="cand">A candidate…</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          {picking && <CandidatePicker onPick={(c) => { setPreviewCand(c); setPicking(false); }} />}
          {previewCand && candVals.isLoading && <p className="text-xs text-muted-foreground">Loading {previewCand.label}…</p>}
          {previewCand && candVals.isError && <p className="text-xs text-destructive">{atsErrorMessage(candVals.error)}</p>}
          {previewCand && candVals.data?.sampleInterview && <p className="text-xs text-muted-foreground">No upcoming interview for this candidate, so sample interview details are shown.</p>}
          {!wa && <p className="text-sm font-semibold text-foreground">{prevSubject || "—"}</p>}
          <p className="whitespace-pre-wrap text-sm text-foreground">{prevBody || "—"}</p>
          {!wa && <p className="text-xs text-muted-foreground">+ your HR signature</p>}
          {!wa && (
            <div className="flex justify-end">
              <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={!ms.data?.enabled || testing || !valid}
                title={!ms.data?.enabled ? "Turn on candidate email to send a test." : undefined} onClick={sendTest}>
                {testing && <Loader2 className="h-4 w-4 animate-spin" />} Send me a test
              </Button>
            </div>
          )}
        </div>
      </div>
      <AlertDialog open={restoreAsk} onOpenChange={setRestoreAsk}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Restore the default text?</AlertDialogTitle>
            <AlertDialogDescription>The subject and message are replaced with the text this template came with. Nothing is saved until you press Save.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setRestoreAsk(false); if (defSubject) setSubject(defSubject); setBody(defBody ?? body); }}>Restore</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ResponsiveDialog>
  );
}
