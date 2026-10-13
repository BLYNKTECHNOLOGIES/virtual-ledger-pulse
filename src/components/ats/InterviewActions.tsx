import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageCircle, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { atsKeys } from "@/lib/ats/api";
import { candKeys } from "@/lib/ats/candidates";
import { interviewErrorMessage } from "@/lib/ats/errors";
import {
  activePanel, durationText, interviewValues, ivDateText, ivKeys, ivState, ivTimeText, minutesBetween, missingFeedback,
  setInterviewStatus, type InterviewRow, type IvMode, type IvTarget,
} from "@/lib/ats/interviews";
import { ScheduleInterviewDialog } from "./ScheduleInterviewDialog";
import { WhatsAppDialog, fillWhatsAppForInterview, pickWhatsAppReminder } from "./WhatsAppMenu";
import { useWhatsAppTemplates } from "@/lib/ats/mail";
import { atsErrorMessage } from "@/lib/ats/errors";
import { NotifyInterviewDialog } from "./NotifyInterviewDialog";
import { CancelInterviewDialog } from "./CancelInterviewDialog";
import { InterviewFeedbackDialog } from "./InterviewFeedbackDialog";

type Dlg = null | { kind: "change" } | { kind: "again" } | { kind: "notify" | "cancel" | "feedback" };

/** Action buttons, ⋮ menu and the per-interview dialogs (shared by the candidate card and the Interviews tab). */
export function InterviewActions({ iv, target, mailOn, canSchedule, primary, onOpenFeedback, waPhone, onPickNewTime }: {
  iv: InterviewRow; target: IvTarget; mailOn: boolean; canSchedule: boolean; primary?: boolean;
  /** 10-digit phone; enables "WhatsApp reminder" on upcoming interviews. */
  waPhone?: string | null;
  /** Shown as "Let them pick a new time" on upcoming interviews (self-scheduling on). */
  onPickNewTime?: () => void;
  /** When given, the toast's "Add feedback" opens the dialog through the parent, so it still works after this row unmounts. */
  onOpenFeedback?: (iv: InterviewRow) => void;
}) {
  const qc = useQueryClient();
  const [dlg, setDlg] = useState<Dlg>(null);
  const [busy, setBusy] = useState(false);
  const st = ivState(iv);
  const members = activePanel(iv);
  const missing = missingFeedback(iv);
  const btn = primary ? "default" : "outline";
  const waTemplates = useWhatsAppTemplates();
  const waTpl = waPhone && st === "upcoming" && iv.status === "scheduled" ? pickWhatsAppReminder(waTemplates.data) : null;
  const [waText, setWaText] = useState<string | null>(null);
  const openWaReminder = async () => {
    if (!waTpl) return;
    try { setWaText(await fillWhatsAppForInterview(iv.id, waTpl.body ?? "")); } catch (e) { toast.error(atsErrorMessage(e)); }
  };

  const refresh = () => { for (const k of [ivKeys.all, candKeys.all, ["ats", "mail"], ["ats", "slot-offers"], atsKeys.overview, atsKeys.jobSummary]) qc.invalidateQueries({ queryKey: k }); };

  const setStatus = async (status: "completed" | "no_show" | "scheduled") => {
    if (busy) return;
    setBusy(true);
    try {
      await setInterviewStatus(iv.id, status);
      if (status === "completed") toast.success("Marked as completed", { action: { label: "Add feedback", onClick: () => (onOpenFeedback ? onOpenFeedback(iv) : setDlg({ kind: "feedback" })) } });
      else toast.success(status === "no_show" ? "Marked as did not attend" : "Marked as scheduled again");
      refresh();
    } catch (e) {
      toast.error(interviewErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const copyDetails = () => {
    const s = new Date(iv.starts_at);
    const v = interviewValues({
      fullName: target.fullName, refNo: target.refNo, jobTitle: target.jobTitle, phone: target.phone, title: iv.title,
      mode: iv.mode as IvMode, startsAt: iv.starts_at, minutes: minutesBetween(iv.starts_at, iv.ends_at),
      location: iv.location, meetingUrl: iv.meeting_url, candidateNote: iv.candidate_note,
    });
    const lines = [
      `Interview: ${iv.title} for ${v.job_title}`,
      `When: ${ivDateText(s)}, ${ivTimeText(s)} (${durationText(minutesBetween(iv.starts_at, iv.ends_at))})`,
      v.interview_where,
      ...(iv.candidate_note?.trim() ? [iv.candidate_note.trim()] : []),
    ];
    navigator.clipboard.writeText(lines.join("\n")).then(() => toast.success("Copied"), () => toast.error("Couldn't copy"));
  };

  const close = (o: boolean) => { if (!o) setDlg(null); };
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        {st === "upcoming" && <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => setDlg({ kind: "change" })}>Change</Button>}
        {(st === "now" || st === "awaiting") && <>
          <Button size="sm" variant={btn} className="h-7" disabled={busy} onClick={() => setStatus("completed")}>Completed</Button>
          <Button size="sm" variant={btn} className="h-7" disabled={busy} onClick={() => setStatus("no_show")}>Did not attend</Button>
        </>}
        {st === "completed" && (
          <Button size="sm" variant={btn} className="h-7" disabled={busy} onClick={() => setDlg({ kind: "feedback" })}>
            {members.length > 0 && missing.length === 0 ? "Edit feedback" : "Add feedback"}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Interview actions" disabled={busy}><MoreVertical className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(st === "now" || st === "awaiting") && <DropdownMenuItem onSelect={() => setDlg({ kind: "change" })}>Change</DropdownMenuItem>}
            {(st === "upcoming" || st === "now") && mailOn && <DropdownMenuItem onSelect={() => setDlg({ kind: "notify" })}>Send invitations…</DropdownMenuItem>}
            {(st === "completed" || st === "no_show") && <DropdownMenuItem onSelect={() => setStatus("scheduled")}>Undo: mark as scheduled</DropdownMenuItem>}
            {(st === "no_show" || st === "cancelled") && (canSchedule
              ? <DropdownMenuItem onSelect={() => setDlg({ kind: "again" })}>Schedule again</DropdownMenuItem>
              : <div title="Reopen this application to schedule an interview."><DropdownMenuItem disabled>Schedule again</DropdownMenuItem></div>)}
            {st !== "no_show" && st !== "cancelled" && <DropdownMenuItem onSelect={copyDetails}>Copy details</DropdownMenuItem>}
            {onPickNewTime && st === "upcoming" && <DropdownMenuItem onSelect={() => onPickNewTime()}>Let them pick a new time</DropdownMenuItem>}
            {waTpl && <DropdownMenuItem onSelect={() => void openWaReminder()}><MessageCircle className="mr-2 h-4 w-4" /> WhatsApp reminder</DropdownMenuItem>}
            {(st === "upcoming" || st === "now" || st === "awaiting") && <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDlg({ kind: "cancel" })}>Cancel interview…</DropdownMenuItem>
            </>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {(dlg?.kind === "change" || dlg?.kind === "again") && (
        <ScheduleInterviewDialog open onOpenChange={close} target={target}
          interview={dlg.kind === "change" ? iv : null} copyFrom={dlg.kind === "again" ? iv : null} />
      )}
      {dlg?.kind === "notify" && <NotifyInterviewDialog open onOpenChange={close} iv={iv} target={target} />}
      {dlg?.kind === "cancel" && <CancelInterviewDialog open onOpenChange={close} iv={iv} target={target} />}
      {dlg?.kind === "feedback" && <InterviewFeedbackDialog open onOpenChange={close} iv={iv} />}
      {waText !== null && waPhone && waTpl && (
        <WhatsAppDialog open onOpenChange={(o) => !o && setWaText(null)} candidateId={target.candidateId} applicationId={target.applicationId}
          firstName={target.fullName.trim().split(/\s+/)[0] || "the candidate"} waPhone={waPhone} initialText={waText} templateCode={waTpl.code} />
      )}
    </>
  );
}
