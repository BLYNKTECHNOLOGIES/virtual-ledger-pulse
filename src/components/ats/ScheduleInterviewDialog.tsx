import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { atsKeys, useAtsSettings, useAtsStages, useEmployeesLookup } from "@/lib/ats/api";
import { candKeys } from "@/lib/ats/candidates";
import { interviewErrorMessage } from "@/lib/ats/errors";
import { todayIST } from "@/lib/ats/format";
import { MailError, mailErrorMessage, notifyInterview, useEmailTemplates, useMailStatus, type AtsEmailTemplate } from "@/lib/ats/mail";
import {
  DURATIONS, IV_MODES, ROUND_SUGGESTIONS, activePanel, durationText, findConflicts, interviewValues, istInputs, istToIso,
  ivClock, ivDateText, ivKeys, minutesBetween, saveInterview, scheduleTemplates, useEmployeeContacts, useIvTargetInfo, useMyEmployee,
  type InterviewRow, type IvMode, type IvTarget, type SaveInterviewResult,
} from "@/lib/ats/interviews";
import { MultiSelect } from "./AtsBits";
import { FormSection, Req } from "./AtsUi";
import { InterviewEmailFields, emailLeftovers, pickTemplate, summarizeNotify } from "./InterviewBits";
import { useResumeFileName } from "./useResumeFileName";

const URL_RE = /^https:\/\/[^\s<>"]+$/;
const DAY = 86_400_000;

function addDaysIST(date: string, n: number) {
  return istInputs(new Date(new Date(`${date}T12:00:00+05:30`).getTime() + n * DAY)).date;
}
function nextWorkingDay() {
  let d = addDaysIST(todayIST(), 1);
  for (let i = 0; i < 7; i++) {
    if (new Date(`${d}T12:00:00+05:30`).getUTCDay() !== 0) return d;
    d = addDaysIST(d, 1);
  }
  return d;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  target: IvTarget;
  interview?: InterviewRow | null;
  copyFrom?: InterviewRow | null;
}

export function ScheduleInterviewDialog({ open, onOpenChange, target, interview, copyFrom }: Props) {
  const qc = useQueryClient();
  const settings = useAtsSettings();
  const mail = useMailStatus();
  const info = useIvTargetInfo(target.applicationId);
  const resumeName = useResumeFileName(target.candidateId, open).data ?? null;
  const templates = useEmailTemplates();
  const employees = useEmployeesLookup();
  const me = useMyEmployee();
  const stages = useAtsStages();
  const editing = !!interview;
  const first = target.fullName.trim().split(/\s+/)[0] || "the candidate";
  const mailOn = !!mail.data?.enabled;

  const [title, setTitle] = useState("Interview");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("11:00");
  const [minutes, setMinutes] = useState(30);
  const [mode, setMode] = useState<IvMode>("video");
  const [location, setLocation] = useState("");
  const [url, setUrl] = useState("");
  const [panel, setPanel] = useState<string[]>([]);
  const [panelErr, setPanelErr] = useState(false);
  const [candNote, setCandNote] = useState("");
  const [intNote, setIntNote] = useState("");
  const [moveStage, setMoveStage] = useState(true);
  const [emailCand, setEmailCand] = useState(false);
  const [emailCandTouched, setEmailCandTouched] = useState(false);
  const [sendPanel, setSendPanel] = useState(true);
  const [attachResume, setAttachResume] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [phase, setPhase] = useState<"idle" | "saving" | "sending">("idle");
  const [saved, setSaved] = useState<SaveInterviewResult | null>(null);
  const [notifyErr, setNotifyErr] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const clientId = useRef<string>(crypto.randomUUID());
  const initFor = useRef<string | null>(null);

  const schedTemplates = useMemo(() => scheduleTemplates(templates.data ?? []), [templates.data]);

  // Reset the form each time the dialog opens (once settings are known).
  useEffect(() => {
    if (!open) { initFor.current = null; return; }
    if (!settings.data && settings.isLoading) return;
    const key = `${interview?.id ?? "new"}:${copyFrom?.id ?? ""}`;
    if (initFor.current === key) return;
    initFor.current = key;
    const s = settings.data;
    const src = interview ?? copyFrom ?? null;
    clientId.current = crypto.randomUUID();
    setTitle(src?.title ?? "Interview");
    if (interview) {
      const i = istInputs(interview.starts_at);
      setDate(i.date); setTime(i.time); setMinutes(minutesBetween(interview.starts_at, interview.ends_at));
    } else {
      setDate(nextWorkingDay()); setTime("11:00"); setMinutes(s?.interview_minutes ?? 30);
    }
    setMode(((src?.mode as IvMode) ?? (s?.interview_address ? "in_person" : "video")));
    setLocation(src?.location ?? s?.interview_address ?? "");
    setUrl(src?.meeting_url ?? "");
    setPanel(src ? activePanel(src).map((m) => m.employee_id).filter((x): x is string => !!x) : []);
    setPanelErr(false);
    setCandNote(src?.candidate_note ?? "");
    setIntNote(src?.internal_note ?? "");
    setMoveStage(true);
    setEmailCand(!interview && !!target.email);
    setEmailCandTouched(false);
    setSendPanel(true);
    setAttachResume(false);
    setTemplateId(null); setSubject(""); setBody("");
    setPhase("idle"); setSaved(null); setNotifyErr(null); setConflicts([]);
  }, [open, settings.data, settings.isLoading, interview, copyFrom, target.email]);

  // Default template once templates are loaded.
  useEffect(() => {
    if (!open || templateId || !schedTemplates.length) return;
    const t = pickTemplate(schedTemplates, editing ? "interview-rescheduled" : "interview-scheduled");
    if (t) { setTemplateId(t.id); setSubject(t.subject); setBody(t.body); }
  }, [open, templateId, schedTemplates, editing]);

  useEffect(() => { if (open && info.data) setAttachResume(!!info.data.has_resume); }, [open, info.data]);

  const startsAt = date && time ? istToIso(date, time) : "";
  const startMs = startsAt ? new Date(startsAt).getTime() : NaN;
  const endMs = startMs + minutes * 60_000;
  const isPast = !isNaN(startMs) && startMs < Date.now();
  const endFuture = !isNaN(endMs) && endMs > Date.now();

  // Edit: tick "email about the change" only when something the candidate sees changed.
  const candidateChanged = useMemo(() => {
    if (!interview || !startsAt) return false;
    const loc = mode === "in_person" ? location.trim() || null : null;
    const link = mode === "video" ? url.trim() || null : null;
    return new Date(interview.starts_at).getTime() !== startMs
      || minutesBetween(interview.starts_at, interview.ends_at) !== minutes
      || interview.mode !== mode || (interview.location ?? null) !== loc || (interview.meeting_url ?? null) !== link
      || (interview.candidate_note ?? "") !== candNote.trim();
  }, [interview, startsAt, startMs, minutes, mode, location, url, candNote]);
  useEffect(() => {
    if (editing && !emailCandTouched) setEmailCand(candidateChanged && !!target.email);
  }, [editing, emailCandTouched, candidateChanged, target.email]);

  // Clash check (debounced, future only).
  useEffect(() => {
    if (!open || isNaN(startMs) || startMs < Date.now()) { setConflicts([]); return; }
    const t = setTimeout(() => {
      findConflicts({
        startsAt: new Date(startMs).toISOString(), endsAt: new Date(endMs).toISOString(),
        candidateId: target.candidateId, employeeIds: panel, excludeId: interview?.id ?? null,
      }).then(setConflicts, () => setConflicts([]));
    }, 400);
    return () => clearTimeout(t);
  }, [open, startMs, endMs, panel, target.candidateId, interview?.id]);

  const contacts = useEmployeeContacts(panel);
  const noEmailNames = (contacts.data ?? []).filter((c) => !c.email).map((c) => c.name);

  // Options: active employees plus current members who are no longer in the lookup.
  const options = useMemo(() => {
    const base = (employees.data ?? []).map((e) => ({ id: e.id, label: e.label }));
    const src = interview ?? copyFrom;
    if (src) for (const m of activePanel(src)) {
      if (m.employee_id && !base.some((b) => b.id === m.employee_id)) base.push({ id: m.employee_id, label: `${m.name} (inactive)` });
    }
    return base;
  }, [employees.data, interview, copyFrom]);

  const removedMembers = interview ? activePanel(interview).filter((m) => !m.employee_id || !panel.includes(m.employee_id)) : [];

  const durationOpts = useMemo(() => {
    const set = new Set<number>([...DURATIONS, settings.data?.interview_minutes ?? 30, minutes]);
    return [...set].filter((n) => n >= 10 && n <= 480).sort((a, b) => a - b);
  }, [settings.data?.interview_minutes, minutes]);

  const ivStage = useMemo(() =>
    (stages.data ?? []).filter((s) => s.is_active && s.kind === "interview").sort((a, b) => a.sort_order - b.sort_order)[0],
  [stages.data]);
  const showStage = !editing && !!ivStage && !!info.data && (info.data.status === "active" || info.data.status === "on_hold")
    && (info.data.stage_order ?? 0) < ivStage.sort_order;

  const vals = interviewValues({
    fullName: target.fullName, refNo: target.refNo, jobTitle: target.jobTitle, phone: target.phone,
    title, mode, startsAt: startsAt || new Date().toISOString(), minutes,
    location: mode === "in_person" ? location.trim() : null, meetingUrl: mode === "video" ? url.trim() : null, candidateNote: candNote,
  });

  const showEmails = mailOn && endFuture;
  const showPanelBox = panel.length > 0 || removedMembers.length > 0;
  const wantCand = showEmails && emailCand && !!target.email;
  const wantPanel = showEmails && showPanelBox && sendPanel;

  const valid = title.trim().length >= 1 && title.trim().length <= 80 && !!date && !!time
    && minutes >= 10 && minutes <= 480
    && (mode !== "in_person" || (location.trim().length >= 1 && location.trim().length <= 300))
    && (mode !== "video" || (URL_RE.test(url.trim()) && url.trim().length <= 500))
    && panel.length <= 8 && candNote.length <= 1000 && intNote.length <= 2000
    && (!wantCand || (subject.trim().length >= 1 && subject.trim().length <= 200 && body.trim().length >= 1 && body.length <= 20000
      && emailLeftovers(subject, body, vals).length === 0));

  const invalidReason = !title.trim() || title.trim().length > 80 ? "Add a round title."
    : !date || !time ? "Pick a date and time."
    : minutes < 10 || minutes > 480 ? "Choose a length."
    : mode === "in_person" && (location.trim().length < 1 || location.trim().length > 300) ? "Add the address."
    : mode === "video" && (!URL_RE.test(url.trim()) || url.trim().length > 500) ? "Add the meeting link."
    : panel.length > 8 ? "Choose up to 8 interviewers."
    : candNote.length > 1000 || intNote.length > 2000 ? "Shorten the notes."
    : "Finish the email to the candidate.";

  const refresh = () => {
    for (const k of [ivKeys.all, candKeys.all, ["ats", "mail"], atsKeys.overview, atsKeys.jobSummary]) qc.invalidateQueries({ queryKey: k });
  };

  const baseText = (r: SaveInterviewResult) => {
    let t = editing ? "Interview updated" : "Interview scheduled";
    if (r.stage_moved && ivStage) t += ` · moved to ${ivStage.name}`;
    return t;
  };

  /** Step 2: send the emails (also used by Try again, with the same clientId). */
  const sendEmails = async (r: SaveInterviewResult) => {
    setPhase("sending");
    setNotifyErr(null);
    try {
      const res = await notifyInterview({
        interviewId: r.id,
        action: editing ? "update" : "invite",
        candidate: wantCand ? { id: clientId.current, subject, body, templateCode: schedTemplates.find((t) => t.id === templateId)?.code ?? null } : null,
        notifyPanel: wantPanel,
        attachResume: wantPanel && attachResume,
      });
      const names = new Map<string, string>();
      const { data: rows } = await supabase.from("ats_interview_panel").select("id,name").eq("interview_id", r.id);
      for (const m of rows ?? []) names.set(m.id, m.name);
      summarizeNotify(res, { base: baseText(r), firstName: first, action: editing ? "update" : "invite", names });
      refresh();
      onOpenChange(false);
    } catch (e) {
      const code = e instanceof MailError ? e.code : "network";
      setNotifyErr(`Interview saved. Emails not sent: ${mailErrorMessage(code, e instanceof MailError ? e.field : undefined)}`);
      refresh();
    } finally {
      setPhase("idle");
    }
  };

  const submit = async () => {
    if (!valid || phase !== "idle") return;
    if (saved) { await sendEmails(saved); return; }
    setPhase("saving");
    let r: SaveInterviewResult;
    try {
      r = await saveInterview({
        id: interview?.id ?? null,
        application_id: target.applicationId,
        title: title.trim(),
        mode,
        starts_at: istToIso(date, time),
        duration_minutes: minutes,
        location: mode === "in_person" ? location.trim() || null : null,
        meeting_url: mode === "video" ? url.trim() || null : null,
        candidate_note: candNote.trim() || null,
        internal_note: intNote.trim() || null,
        panel,
        move_to_interview_stage: showStage && moveStage,
      });
    } catch (e) {
      toast.error(interviewErrorMessage(e));
      setPhase("idle");
      return;
    }
    setSaved(r);
    const needEmails = mailOn && endFuture && (wantCand || (sendPanel && (panel.length > 0 || (r.removed?.length ?? 0) > 0)));
    if (!needEmails) {
      toast.success(baseText(r));
      refresh();
      setPhase("idle");
      onOpenChange(false);
      return;
    }
    await sendEmails(r);
  };

  const togglePanel = (v: string[]) => {
    if (v.length > 8) { setPanelErr(true); return; }
    setPanelErr(false);
    setPanel(v);
  };

  const busy = phase !== "idle";
  const footer = notifyErr ? (
    <>
      <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Close</Button>
      <Button onClick={() => saved && sendEmails(saved)} disabled={busy}>{busy ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Sending emails…</> : "Try again"}</Button>
    </>
  ) : (
    <>
      <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
      <Button onClick={submit} disabled={!valid || busy}>
        {phase === "saving" ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving…</>
          : phase === "sending" ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Sending emails…</>
          : editing ? "Save changes" : "Schedule interview"}
      </Button>
    </>
  );

  const today = todayIST();
  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }} contentClassName="max-w-2xl"
      title={editing ? "Change interview" : `Schedule interview with ${first}`} footer={footer}>
      <fieldset disabled={busy || !!saved} className="space-y-5 pb-1 [&_h3]:mt-0">
        {/* Round */}
        <div className="space-y-1.5">
          <FormSection title="Round" />
          <Label htmlFor="iv-title">Round title<Req /></Label>
          <Input id="iv-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} className="text-foreground" />
          <div className="flex flex-wrap gap-1.5">
            {ROUND_SUGGESTIONS.map((r) => <Button key={r} type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setTitle(r)}>{r}</Button>)}
          </div>
        </div>

        {/* When */}
        <div className="space-y-1.5">
          <FormSection title="When" />
          <Label>Date, time and length<Req /></Label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Input type="date" aria-label="Date" value={date} min={addDaysIST(today, -30)} max={addDaysIST(today, 365)} onChange={(e) => setDate(e.target.value)} className="text-foreground" />
            <Input type="time" aria-label="Start time" step={300} value={time} onChange={(e) => setTime(e.target.value)} className="text-foreground" />
            <Select value={String(minutes)} onValueChange={(v) => setMinutes(Number(v))}>
              <SelectTrigger aria-label="Length" className="text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent>{durationOpts.map((d) => <SelectItem key={d} value={String(d)}>{durationText(d)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {!isNaN(endMs) && <p className="text-xs text-muted-foreground">Ends {ivClock(new Date(endMs))} IST · {ivDateText(new Date(startMs))}</p>}
          {isPast && !endFuture && <p className="text-xs text-warning">This time has passed. The interview will be recorded and no emails will be sent.</p>}
        </div>

        {/* How */}
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
              <Label htmlFor="iv-addr" className="text-xs">Address<Req /></Label>
              <Textarea id="iv-addr" rows={2} maxLength={300} value={location} onChange={(e) => setLocation(e.target.value)} className="text-foreground" />
              <p className="text-xs text-muted-foreground">The default office address is set in ATS → Settings → Interviews.</p>
            </div>
          )}
          {mode === "video" && (
            <div className="space-y-1">
              <Label htmlFor="iv-url" className="text-xs">Meeting link<Req /></Label>
              <Input id="iv-url" maxLength={500} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" className="text-foreground" />
              {url.trim() && !URL_RE.test(url.trim())
                ? <p className="text-xs text-destructive">Add a meeting link that starts with https://</p>
                : <p className="text-xs text-muted-foreground">Paste the Google Meet, Zoom or Teams link.</p>}
            </div>
          )}
          {mode === "phone" && (target.phone?.trim()
            ? <p className="text-sm text-muted-foreground">{first} will be called on {target.phone}</p>
            : <p className="text-sm text-warning">No phone number on file. Add one with Edit profile.</p>)}
        </div>

        {/* Interviewers */}
        <div className="space-y-1.5">
          <FormSection title="Who" />
          <div className="flex items-center justify-between gap-2">
            <Label>Interviewers <span className="font-normal text-muted-foreground">(optional)</span></Label>
            {me.data && !panel.includes(me.data.id) && (
              <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => togglePanel([...panel, me.data!.id])}>Add me</Button>
            )}
          </div>
          <MultiSelect options={options} value={panel} onChange={togglePanel} placeholder="Choose interviewers" />
          {panelErr && <p className="text-xs text-destructive">Choose up to 8 interviewers.</p>}
          {noEmailNames.length > 0 && (
            <p className="text-xs text-muted-foreground">{noEmailNames.join(", ")} {noEmailNames.length === 1 ? "has" : "have"} no work email, so they won't get a calendar invite.</p>
          )}
        </div>

        {conflicts.length > 0 && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
            <p className="flex items-center gap-1.5 font-medium text-foreground"><AlertTriangle className="h-4 w-4 text-warning" aria-hidden />Clashes</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-foreground">{conflicts.slice(0, 5).map((c, i) => <li key={i}>{c}</li>)}</ul>
          </div>
        )}

        {/* Notes */}
        <div className="space-y-1.5">
          <FormSection title="Notes" />
          <Label htmlFor="iv-cnote">Note for {first} <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Textarea id="iv-cnote" rows={2} maxLength={1000} value={candNote} onChange={(e) => setCandNote(e.target.value)}
            placeholder="For example: please bring a printed resume and an ID proof." className="text-foreground" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="iv-inote">Note for interviewers <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Textarea id="iv-inote" rows={2} maxLength={2000} value={intNote} onChange={(e) => setIntNote(e.target.value)} className="text-foreground" />
          <p className="text-xs text-muted-foreground">Not shown to the candidate.</p>
        </div>

        {showStage && (
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox checked={moveStage} onCheckedChange={(v) => setMoveStage(v === true)} /> Move to {ivStage!.name}
          </label>
        )}

        {/* Emails */}
        {!mailOn ? (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            Candidate email is off, so no emails or calendar invites are sent. You can send them from the interview later, once email is on.{" "}
            <Link to="/hrms/ats/settings?tab=email" className="font-medium text-primary underline-offset-2 hover:underline">Email settings</Link>
          </div>
        ) : showEmails ? (
          <div className="space-y-3">
            <FormSection title="Email" />
            <div className="space-y-1">
              <label className={cn("flex items-center gap-2 text-sm", target.email ? "text-foreground" : "text-muted-foreground")}>
                <Checkbox checked={emailCand && !!target.email} disabled={!target.email}
                  onCheckedChange={(v) => { setEmailCand(v === true); setEmailCandTouched(true); }} />
                {editing ? `Email ${first} about the change` : `Email ${first} the invitation`}
              </label>
              {!target.email && <p className="pl-6 text-xs text-muted-foreground">No email address. Add one with Edit profile.</p>}
            </div>
            {wantCand && (
              <InterviewEmailFields templates={schedTemplates} templateId={templateId}
                onTemplateChange={(t: AtsEmailTemplate) => { setTemplateId(t.id); setSubject(t.subject); setBody(t.body); }}
                subject={subject} onSubjectChange={setSubject} body={body} onBodyChange={setBody} vals={vals} />
            )}
            {showPanelBox && (
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox checked={sendPanel} onCheckedChange={(v) => setSendPanel(v === true)} /> Send calendar invites to the interviewers
                </label>
                {editing && <p className="pl-6 text-xs text-muted-foreground">Interviewers who already have the latest invite won't get another one. Anyone you removed gets a cancellation.</p>}
                {sendPanel && (
                  <label className={cn("flex items-center gap-2 pl-6 text-sm", info.data?.has_resume ? "text-foreground" : "text-muted-foreground")}>
                    <Checkbox checked={attachResume && !!info.data?.has_resume} disabled={!info.data?.has_resume} onCheckedChange={(v) => setAttachResume(v === true)} />
                    {info.data?.has_resume ? <span className="min-w-0 truncate" title={resumeName ?? undefined}>{"Attach resume"}{resumeName ? ` (${resumeName})` : ""}</span> : "No resume on file"}
                  </label>
                )}
              </div>
            )}
          </div>
        ) : null}
      </fieldset>
      {!valid && !busy && !notifyErr && <p className="mt-3 text-xs text-muted-foreground">{invalidReason}</p>}
      {notifyErr && <p className="mt-3 rounded-md border border-warning/50 bg-warning/10 p-2 text-sm text-foreground">{notifyErr}</p>}
    </ResponsiveDialog>
  );
}
