import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { candKeys, useMyUserId } from "@/lib/ats/candidates";
import { interviewErrorMessage } from "@/lib/ats/errors";
import { fmtDateTime } from "@/lib/ats/format";
import { RECOMMENDATIONS, activePanel, ivKeys, saveInterviewFeedback, type InterviewRow } from "@/lib/ats/interviews";

export function InterviewFeedbackDialog({ open, onOpenChange, iv }: { open: boolean; onOpenChange: (o: boolean) => void; iv: InterviewRow }) {
  const qc = useQueryClient();
  const me = useMyUserId();
  const members = activePanel(iv);
  const [panelId, setPanelId] = useState<string>("");
  const [rec, setRec] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !members.length) return;
    const pick = members.find((m) => m.user_id && m.user_id === me.data) ?? members.find((m) => !m.feedback_at) ?? members[0];
    setPanelId(pick.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, me.data, iv.id]);

  const cur = members.find((m) => m.id === panelId);
  useEffect(() => {
    if (!cur) return;
    setRec(cur.recommendation ?? null); setScore(cur.score ?? null); setText(cur.feedback ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.id, cur?.feedback_at]);

  const save = async (clear: boolean) => {
    if (!cur || busy) return;
    setBusy(true);
    try {
      await saveInterviewFeedback(cur.id, clear ? null : rec, clear ? null : score, clear ? null : (text.trim() || null));
      toast.success(clear ? "Feedback cleared" : "Feedback saved");
      qc.invalidateQueries({ queryKey: ivKeys.all });
      qc.invalidateQueries({ queryKey: candKeys.events(iv.candidate_id) });
      if (clear) { setRec(null); setScore(null); setText(""); }
    } catch (e) {
      toast.error(interviewErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!members.length) {
    return (
      <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={`Feedback: ${iv.title}`} footer={<Button onClick={() => onOpenChange(false)}>Close</Button>}>
        <p className="text-sm text-muted-foreground">No interviewers were added to this interview, so there's no one to record feedback for. Add a note on the candidate instead.</p>
      </ResponsiveDialog>
    );
  }

  const empty = !rec && !score && !text.trim();
  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }} title={`Feedback: ${iv.title}`}
      footer={<>
        {cur?.feedback_at && <Button variant="ghost" disabled={busy} onClick={() => save(true)} className="text-destructive hover:text-destructive">Clear feedback</Button>}
        <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Close</Button>
        <Button disabled={busy || empty || text.length > 5000} onClick={() => save(false)}>Save</Button>
      </>}>
      <fieldset disabled={busy} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Interviewer</Label>
          <Select value={panelId} onValueChange={setPanelId}>
            <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}{m.feedback_at ? " (saved)" : ""}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Recommendation</Label>
          <div className="flex flex-wrap gap-1.5">
            {RECOMMENDATIONS.map((r) => {
              const on = rec === r.value;
              const yes = r.value.endsWith("yes");
              return (
                <button key={r.value} type="button" aria-pressed={on} onClick={() => setRec(on ? null : r.value)}
                  className={cn("rounded-md border px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    on ? (yes ? "border-success bg-success/15 text-success" : "border-destructive bg-destructive/15 text-destructive")
                      : (yes ? "border-border text-foreground hover:border-success/60" : "border-border text-foreground hover:border-destructive/60"))}>
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Score <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <button key={i} type="button" aria-label={`${i} of 5`} aria-pressed={score === i} onClick={() => setScore(score === i ? null : i)}
                className="rounded p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Star className={cn("h-5 w-5", score != null && i <= score ? "fill-warning text-warning" : "text-muted-foreground/40")} />
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="iv-fb">Feedback</Label>
          <Textarea id="iv-fb" rows={5} maxLength={5000} value={text} onChange={(e) => setText(e.target.value)}
            placeholder="What went well, any concerns, salary or notice discussed…" className="text-foreground" />
        </div>
        {cur?.feedback_at && <p className="text-xs text-muted-foreground">Last saved by {cur.feedback_by_name ?? "—"} on {fmtDateTime(cur.feedback_at)}</p>}
      </fieldset>
    </ResponsiveDialog>
  );
}
