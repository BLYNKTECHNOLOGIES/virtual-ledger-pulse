import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { atsKeys, useAtsJobs } from "@/lib/ats/api";
import { atsErrorMessage } from "@/lib/ats/errors";
import { candKeys, type AtsAppRow } from "@/lib/ats/candidates";

export function ChangeJobDialog({ open, onOpenChange, app }: { open: boolean; onOpenChange: (o: boolean) => void; app: AtsAppRow }) {
  const qc = useQueryClient();
  const jobs = useAtsJobs();
  const options = useMemo(() => (jobs.data ?? []).filter((j) => (j.status === "open" || j.status === "paused") && j.id !== app.job_id), [jobs.data, app.job_id]);
  const [target, setTarget] = useState("");
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setTarget(""); setRemember(!app.job_id); } }, [open, app.job_id]);
  const job = options.find((j) => j.id === target);
  const pos = app.position_text?.trim() ?? "";
  const canRemember = !!job && !!pos;

  const save = async () => {
    if (!target || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("ats_applications").update({ job_id: target === "general" ? null : target }).eq("id", app.application_id!);
      if (error) throw error;
      if (remember && canRemember) {
        const aliases = job!.aliases ?? [];
        const known = [job!.title, ...aliases].some((a) => a.trim().toLowerCase() === pos.toLowerCase());
        if (!known) {
          const r = await supabase.from("ats_jobs").update({ aliases: [...aliases, pos] }).eq("id", job!.id);
          if (r.error) toast.warning("Job changed, but the other name couldn't be saved.");
        }
      }
      toast.success("Job changed");
      qc.invalidateQueries({ queryKey: candKeys.all });
      qc.invalidateQueries({ queryKey: atsKeys.jobs });
      qc.invalidateQueries({ queryKey: atsKeys.jobSummary });
      qc.invalidateQueries({ queryKey: atsKeys.overview });
      onOpenChange(false);
    } catch (e) {
      toast.error(atsErrorMessage(e));
    } finally { setBusy(false); }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)} title="Change job"
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button><Button onClick={save} disabled={!target || busy}>Change job</Button></>}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Move this application to</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger className="text-foreground"><SelectValue placeholder="Choose a job" /></SelectTrigger>
            <SelectContent>
              {app.job_id && <SelectItem value="general">General</SelectItem>}
              {options.map((j) => <SelectItem key={j.id} value={j.id}>{j.title}{j.status === "paused" ? " (paused)" : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {canRemember && (
          <label className="flex items-start gap-2 text-sm text-foreground">
            <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} className="mt-0.5" />
            <span>Remember “{pos}” as another name for {job!.title}</span>
          </label>
        )}
      </div>
    </ResponsiveDialog>
  );
}
