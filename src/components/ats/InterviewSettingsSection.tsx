import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { atsKeys, useAtsSettings } from "@/lib/ats/api";
import { atsErrorMessage } from "@/lib/ats/errors";
import { fmtDateTime } from "@/lib/ats/format";
import { useMailStatus } from "@/lib/ats/mail";
import { DURATIONS, durationText } from "@/lib/ats/interviews";
import { QueryError, RowsSkeleton, SectionCard } from "./AtsBits";

const REMINDERS = [{ v: 0, l: "Off" }, { v: 2, l: "2 hours before" }, { v: 24, l: "1 day before" }];

export function InterviewSettingsSection() {
  const qc = useQueryClient();
  const settings = useAtsSettings();
  const mail = useMailStatus();
  const [address, setAddress] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [hours, setHours] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!settings.data) return;
    setAddress(settings.data.interview_address ?? "");
    setMinutes(settings.data.interview_minutes ?? 30);
    setHours(settings.data.interview_reminder_hours ?? 0);
  }, [settings.data]);

  if (settings.isLoading) return <RowsSkeleton rows={3} />;
  if (settings.isError) return <QueryError error={settings.error} onRetry={() => settings.refetch()} />;

  const doSave = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.from("ats_settings")
        .update({ interview_address: address.trim() || null, interview_minutes: minutes, interview_reminder_hours: hours }).eq("id", true);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: atsKeys.settings });
      toast.success("Interview settings saved");
    } catch (e) {
      toast.error(atsErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const save = () => {
    if ((settings.data?.interview_reminder_hours ?? 0) === 0 && hours > 0) setConfirmOpen(true);
    else doSave();
  };
  const durOpts = [...new Set([...DURATIONS, minutes])].sort((a, b) => a - b);

  return (
    <SectionCard title="Interviews">
      <div className="grid max-w-xl grid-cols-1 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="ats-iv-addr">Office address for in-person interviews</Label>
          <Textarea id="ats-iv-addr" rows={2} maxLength={300} value={address} onChange={(e) => setAddress(e.target.value)} className="text-foreground" />
          <p className="text-xs text-muted-foreground">Filled in automatically when you schedule an in-person interview.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Default interview length</Label>
          <Select value={String(minutes)} onValueChange={(v) => setMinutes(Number(v))}>
            <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>{durOpts.map((d) => <SelectItem key={d} value={String(d)}>{durationText(d)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Reminder email to candidates</Label>
          <Select value={String(hours)} onValueChange={(v) => setHours(Number(v))}>
            <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>{REMINDERS.map((r) => <SelectItem key={r.v} value={String(r.v)}>{r.l}</SelectItem>)}</SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Sent automatically from the HR mailbox using the 'Interview reminder' template. Not sent if the candidate declined the invite, or if the interview was booked after the reminder time had already passed.</p>
          {hours > 0 && !mail.data?.enabled && <p className="text-xs text-muted-foreground">Candidate email is off, so reminders won't be sent until it's turned on.</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={busy || address.length > 300}>Save</Button>
          {settings.data?.updated_by_name && (
            <span className="text-xs text-muted-foreground">Last updated by {settings.data.updated_by_name} on {fmtDateTime(settings.data.updated_at)}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          The emails use the 'Interview scheduled', 'Interview rescheduled', 'Interview cancelled' and 'Interview reminder' templates in{" "}
          <Link to="?tab=email" className="text-primary underline-offset-2 hover:underline">ATS → Settings → Email</Link>.
        </p>
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn on interview reminders?</AlertDialogTitle>
            <AlertDialogDescription>Every candidate with a scheduled interview will get a reminder {hours === 2 ? "2 hours" : "1 day"} before it.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmOpen(false); doSave(); }}>Turn on</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  );
}
