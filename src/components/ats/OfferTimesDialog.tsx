import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { useAtsSettings, useAtsStages, useEmployeesLookup } from "@/lib/ats/api";
import { candKeys } from "@/lib/ats/candidates";
import { interviewErrorMessage, atsErrorMessage } from "@/lib/ats/errors";
import { todayIST } from "@/lib/ats/format";
import {
  DURATIONS, IV_MODES, ROUND_SUGGESTIONS, activePanel, durationText, istInputs, istToIso, ivKeys, minutesBetween,
  useIvTargetInfo, useMyEmployee, type InterviewRow, type IvMode, type IvTarget,
} from "@/lib/ats/interviews";
import {
  mailErrorMessage, renderTemplate, sendCandidateEmail, useEmailTemplates, useMailStatus, useMailThread, useWhatsAppTemplates, MailError,
} from "@/lib/ats/mail";
import { convKeys } from "@/lib/ats/conversations";
import {
  createSlotOffer, fillSlots, slotKeys, slotListText, type CreatedSlotOffer, type SlotOffer,
} from "@/lib/ats/selfSchedule";
import { MultiSelect } from "./AtsBits";
import { FormSection, Req } from "./AtsUi";
import { WhatsAppDialog } from "./WhatsAppMenu";

const URL_RE = /^https:\/\/[^\s<>"]+$/;
const DAY = 86_400_000;
const addDaysIST = (date: string, n: number) => istInputs(new Date(new Date(`${date}T12:00:00+05:30`).getTime() + n * DAY)).date;
const HOURS_TEXT: Record<number, string> = { 24: "24 hours", 48: "2 days", 72: "3 days", 168: "7 days" };

type Row = { date: string; time: string };

export function waPhoneOf(phone: string | null | undefined): string | null {
  let d = String(phone ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

export function OfferTimesDialog({ open, onOpenChange, target, moveInterview, prefill }: {
  open: boolean; onOpenChange: (o: boolean) => void; target: IvTarget; moveInterview?: InterviewRow | null;
  /** "Create a new link": same settings and the offered times still at least 2 h away. */
  prefill?: SlotOffer | null;
}) {
  const qc = useQueryClient();
  const settings = useAtsSettings();
  const stages = useAtsStages();
  const info = useIvTargetInfo(target.applicationId);
  const employees = useEmployeesLookup();
  const me = useMyEmployee();
  const mail = useMailStatus();
  const templates = useEmailTemplates();
  const waTemplates = useWhatsAppTemplates();
  const thread = useMailThread(open ? target.candidateId : undefined);
  const first = target.fullName.trim().split(/\s+/)[0] || "the candidate";
  const waPhone = waPhoneOf(target.phone);
  const today = todayIST();

  const [title, setTitle] = useState("Interview");
  const [minutes, setMinutes] = useState(30);
  const [mode, setMode] = useState<IvMode>("video");
  const [location, setLocation] = useState("");
  const [url, setUrl] = useState("");
  const [panel, setPanel] = useState<string[]>([]);
  const [candNote, setCandNote] = useState("");
  const [moveStage, setMoveStage] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedSlotOffer | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [waText, setWaText] = useState<string | null>(null);
  const initFor = useRef<string | null>(null);
  const sendId = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    if (!open) { initFor.current = null; return; }
    if (!settings.data && settings.isLoading) return;
    const key = `${moveInterview?.id ?? "new"}:${prefill?.id ?? ""}`;
    if (initFor.current === key) return;
    initFor.current = key;
    const s = settings.data;
    const src = moveInterview ?? null;
    setTitle(prefill?.title ?? src?.title ?? "Interview");
    setMinutes(prefill?.duration_minutes ?? (src ? minutesBetween(src.starts_at, src.ends_at) : s?.interview_minutes ?? 30));
    setMode((prefill?.mode ?? (src?.mode as IvMode) ?? (s?.interview_address ? "in_person" : "video")) as IvMode);
    setLocation(prefill?.location ?? src?.location ?? s?.interview_address ?? "");
    setUrl(prefill?.meeting_url ?? src?.meeting_url ?? "");
    setPanel(prefill?.panel ?? (src ? activePanel(src).map((m) => m.employee_id).filter((x): x is string => !!x) : []));
    setCandNote(prefill?.candidate_note ?? src?.candidate_note ?? "");
    setMoveStage(prefill?.move_stage ?? true);
    const keep = (prefill?.slots ?? []).filter((t) => new Date(t).getTime() >= Date.now() + 2 * 3_600_000).map((t) => istInputs(t));
    setRows(keep.length ? keep : [{ date: addDaysIST(today, 1), time: "11:00" }]);
    setCreated(null); setSubject(""); setBody(""); setWaText(null);
    sendId.current = crypto.randomUUID();
  }, [open, settings.data, settings.isLoading, moveInterview, prefill, today]);

  const durationOpts = useMemo(() => [...new Set<number>([...DURATIONS, settings.data?.interview_minutes ?? 30, minutes])].filter((n) => n >= 10 && n <= 480).sort((a, b) => a - b), [settings.data?.interview_minutes, minutes]);
  const options = useMemo(() => (employees.data ?? []).map((e) => ({ id: e.id, label: e.label })), [employees.data]);
  const ivStage = useMemo(() => (stages.data ?? []).filter((s) => s.is_active && s.kind === "interview").sort((a, b) => a.sort_order - b.sort_order)[0], [stages.data]);
  const showStage = !moveInterview && !!ivStage && !!info.data && (info.data.status === "active" || info.data.status === "on_hold") && (info.data.stage_order ?? 0) < ivStage.sort_order;

  const isos = rows.map((r) => (r.date && r.time ? new Date(istToIso(r.date, r.time)).toISOString() : ""));
  const rowErr = (i: number) => {
    const iso = isos[i];
    if (!iso) return "Pick a date and time.";
    const ms = new Date(iso).getTime();
    if (ms < Date.now() + 2 * 3_600_000) return "At least 2 hours from now.";
    if (ms > Date.now() + 30 * DAY) return "Within the next 30 days.";
    if (isos.indexOf(iso) !== i) return "Same time twice.";
    return null;
  };
  const timesOk = rows.length >= 1 && rows.length <= 8 && rows.every((_, i) => !rowErr(i));
  const valid = title.trim().length > 0 && timesOk && panel.length <= 8
    && (mode !== "in_person" || (location.trim().length >= 1 && location.trim().length <= 300))
    && (mode !== "video" || (URL_RE.test(url.trim()) && url.trim().length <= 500));

  const quick = (label: string, dayOffset: number, time: string) => ({ label, row: { date: addDaysIST(today, dayOffset), time } });
  const quickChips = [quick("Tomorrow 11:00 AM", 1, "11:00"), quick("Tomorrow 3:00 PM", 1, "15:00"), quick("Day after 11:00 AM", 2, "11:00")];
  const addRow = (r: Row) => setRows((cur) => (cur.length >= 8 ? cur : [...cur, r]));

  const fill = async (tplId: string, link: string, slots: string[]) => {
    const r = await renderTemplate(tplId, target.applicationId, target.candidateId);
    const list = slotListText(slots);
    return { subject: fillSlots(r.subject ?? "", link, list), body: fillSlots(r.body ?? "", link, list) };
  };

  const create = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const r = await createSlotOffer({
        application_id: target.applicationId, move_interview_id: moveInterview?.id ?? null, title: title.trim(), mode,
        location: mode === "in_person" ? location.trim() || null : null, meeting_url: mode === "video" ? url.trim() || null : null,
        duration_minutes: minutes, panel, candidate_note: candNote.trim() || null,
        move_to_interview_stage: showStage && moveStage, slots: isos,
      });
      setCreated(r);
      qc.invalidateQueries({ queryKey: slotKeys.offers(target.applicationId) });
      qc.invalidateQueries({ queryKey: candKeys.events(target.candidateId) });
      const tpl = (templates.data ?? []).find((t) => t.code === "interview-pick-a-slot");
      if (tpl) {
        try { const f = await fill(tpl.id, r.link, r.slots); setSubject(f.subject); setBody(f.body); }
        catch (e) { toast.error(atsErrorMessage(e)); }
      }
    } catch (e) {
      toast.error(interviewErrorMessage(e));
    } finally { setBusy(false); }
  };

  const latest = useMemo(() => {
    const t = thread.data ?? [];
    const app = t.filter((m) => m.application_id === target.applicationId);
    return app[app.length - 1] ?? t[t.length - 1] ?? null;
  }, [thread.data, target.applicationId]);

  const [emailSent, setEmailSent] = useState(false);
  useEffect(() => { setEmailSent(false); }, [created]);
  const sendEmail = async () => {
    if (!created || sending || emailSent) return;
    setSending(true);
    try {
      const r = await sendCandidateEmail({
        id: sendId.current, candidateId: target.candidateId, applicationId: target.applicationId,
        subject: subject.trim(), body, purpose: "interview", templateCode: "interview-pick-a-slot",
        replyToId: latest?.id ?? null, fileIds: [],
      });
      if (r.status === "failed") toast.error(mailErrorMessage(r.error));
      else { toast.success("Email sent"); setEmailSent(true); }
      sendId.current = crypto.randomUUID();
      qc.invalidateQueries({ queryKey: ["ats", "mail"] });
      qc.invalidateQueries({ queryKey: convKeys.all });
    } catch (e) {
      toast.error(e instanceof MailError ? mailErrorMessage(e.code, e.field) : mailErrorMessage(null));
    } finally { setSending(false); }
  };

  const openWa = async () => {
    if (!created) return;
    const tpl = (waTemplates.data ?? []).find((t) => t.code === "wa-pick-a-slot");
    if (!tpl) { setWaText(created.link); return; }
    try { setWaText((await fill(tpl.id, created.link, created.slots)).body); } catch (e) { toast.error(atsErrorMessage(e)); }
  };

  const copyLink = () => created && navigator.clipboard.writeText(created.link).then(() => toast.success("Copied"), () => toast.error("Couldn't copy"));
  const close = () => { onOpenChange(false); qc.invalidateQueries({ queryKey: ivKeys.all }); };
  const hoursText = HOURS_TEXT[(settings.data as any)?.self_schedule_hours ?? 48] ?? "2 days";
  const mailOn = !!mail.data?.enabled;

  const footer = created ? (
    <div className="flex w-full flex-wrap justify-end gap-2">
      <Button variant="outline" onClick={copyLink}>Copy link</Button>
      {waPhone && <Button variant="outline" onClick={() => void openWa()}>Send on WhatsApp</Button>}
      <Button disabled={emailSent || !mailOn || !target.email || sending || !subject.trim() || !body.trim()} onClick={sendEmail}>
        {sending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{emailSent ? "Sent ✓" : "Send email"}
      </Button>
      <Button variant="outline" onClick={close}>Done</Button>
    </div>
  ) : (
    <div className="flex w-full justify-end gap-2">
      <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
      <Button disabled={!valid || busy} onClick={create}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Create link</Button>
    </div>
  );

  return (
    <>
      <ResponsiveDialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())} footer={footer}
        title={created ? "Send the link" : moveInterview ? `Let ${first} pick a new time` : `Let ${first} pick a time`}>
        {created ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ot-subj">Subject</Label>
              <Input id="ot-subj" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} className="text-foreground" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ot-body">Message</Label>
              <Textarea id="ot-body" rows={10} maxLength={10000} value={body} onChange={(e) => setBody(e.target.value)} className="text-foreground" />
            </div>
            {!mailOn ? <p className="text-xs text-muted-foreground">Candidate email is off. Copy the link or use WhatsApp.</p>
              : !target.email && <p className="text-xs text-muted-foreground">No email address on file.</p>}
            <p className="text-xs text-muted-foreground">The link works for {hoursText} or until a time is picked. Creating a new link turns this one off.</p>
          </div>
        ) : (
          <fieldset disabled={busy} className="space-y-5 pb-1 [&_h3]:mt-0">
            <div className="space-y-1.5">
              <FormSection title="Round" />
              <Label htmlFor="ot-title">Round title<Req /></Label>
              <Input id="ot-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} className="text-foreground" />
              <div className="flex flex-wrap gap-1.5">
                {ROUND_SUGGESTIONS.map((r) => <Button key={r} type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setTitle(r)}>{r}</Button>)}
              </div>
            </div>

            <div className="space-y-1.5">
              <FormSection title="Times to offer" />
              <p className="text-xs text-muted-foreground">Up to 8 times, in IST. Each at least 2 hours from now and within 30 days.</p>
              <ul className="space-y-2">
                {rows.map((r, i) => {
                  const err = rowErr(i);
                  return (
                    <li key={i} className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Input type="date" aria-label={`Date ${i + 1}`} value={r.date} min={today} max={addDaysIST(today, 30)}
                          onChange={(e) => setRows((cur) => cur.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} className="text-foreground" />
                        <Input type="time" aria-label={`Time ${i + 1}`} step={300} value={r.time}
                          onChange={(e) => setRows((cur) => cur.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))} className="w-32 text-foreground" />
                        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="Remove this time" disabled={rows.length <= 1}
                          onClick={() => setRows((cur) => cur.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
                      </div>
                      {err && <p className="text-xs text-destructive">{err}</p>}
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={rows.length >= 8}
                  onClick={() => addRow({ date: rows[rows.length - 1]?.date ?? addDaysIST(today, 1), time: "15:00" })}><Plus className="h-3.5 w-3.5" /> Add another time</Button>
                {quickChips.map((q) => (
                  <Button key={q.label} type="button" size="sm" variant="ghost" className="h-7 text-xs" disabled={rows.length >= 8} onClick={() => addRow(q.row)}>{q.label}</Button>
                ))}
              </div>
              <div className="space-y-1 pt-1">
                <Label>Length</Label>
                <Select value={String(minutes)} onValueChange={(v) => setMinutes(Number(v))}>
                  <SelectTrigger aria-label="Length" className="w-48 text-foreground"><SelectValue /></SelectTrigger>
                  <SelectContent>{durationOpts.map((d) => <SelectItem key={d} value={String(d)}>{durationText(d)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <FormSection title="Where" />
              <div className="inline-flex rounded-md border border-border p-0.5" role="radiogroup" aria-label="Mode">
                {IV_MODES.map((m) => (
                  <button key={m.value} type="button" role="radio" aria-checked={mode === m.value} onClick={() => setMode(m.value)}
                    className={cn("rounded px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      mode === m.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{m.label}</button>
                ))}
              </div>
              {mode === "in_person" && (
                <div className="space-y-1">
                  <Label htmlFor="ot-addr" className="text-xs">Address<Req /></Label>
                  <Textarea id="ot-addr" rows={2} maxLength={300} value={location} onChange={(e) => setLocation(e.target.value)} className="text-foreground" />
                </div>
              )}
              {mode === "video" && (
                <div className="space-y-1">
                  <Label htmlFor="ot-url" className="text-xs">Meeting link<Req /></Label>
                  <Input id="ot-url" maxLength={500} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" className="text-foreground" />
                  {url.trim() && !URL_RE.test(url.trim()) && <p className="text-xs text-destructive">Add a meeting link that starts with https://</p>}
                </div>
              )}
              {mode === "phone" && <p className="text-sm text-muted-foreground">{first} will be called on their registered number.</p>}
            </div>

            <div className="space-y-1.5">
              <FormSection title="Who" />
              <div className="flex items-center justify-between gap-2">
                <Label>Interviewers <span className="font-normal text-muted-foreground">(optional)</span></Label>
                {me.data && !panel.includes(me.data.id) && (
                  <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setPanel([...panel, me.data!.id])}>Add me</Button>
                )}
              </div>
              <MultiSelect options={options} value={panel} onChange={(v: string[]) => setPanel(v.slice(0, 8))} placeholder="Choose interviewers" />
              <p className="text-xs text-muted-foreground">Times that clash with their interviews (or yours, when nobody is chosen) are hidden from the candidate.</p>
            </div>

            <div className="space-y-1.5">
              <FormSection title="Notes" />
              <Label htmlFor="ot-note">Note for the candidate <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea id="ot-note" rows={2} maxLength={1000} value={candNote} onChange={(e) => setCandNote(e.target.value)} className="text-foreground" />
            </div>

            {showStage && (
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox checked={moveStage} onCheckedChange={(v) => setMoveStage(v === true)} /> Move to {ivStage!.name} when a time is picked
              </label>
            )}
          </fieldset>
        )}
      </ResponsiveDialog>
      {waText !== null && waPhone && created && (
        <WhatsAppDialog open onOpenChange={(o) => !o && setWaText(null)} candidateId={target.candidateId} applicationId={target.applicationId}
          firstName={first} waPhone={waPhone} initialText={waText} templateCode="wa-pick-a-slot" />
      )}
    </>
  );
}
