import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

// Quiz staff RPCs are not in the generated types yet; one typed wrapper keeps call sites honest.
export async function quizRpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

export const pretty = (value?: string | null) =>
  value ? value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—";

/** A running attempt carries no decision yet (QZ7a). */
export const decisionLabel = (decision?: string | null) => (decision ? pretty(decision) : "In progress");

export const fmtIst = (value?: string | null, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }) =>
  value ? new Intl.DateTimeFormat("en-IN", { ...opts, timeZone: "Asia/Kolkata" }).format(new Date(value)) + " IST" : "—";

export const fmtTime = (value?: string | null) =>
  value ? new Intl.DateTimeFormat("en-IN", { timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value)) : "—";

/** "2026-10-15T09:30" typed as IST → ISO. */
export const istLocalToIso = (local: string) => (local ? new Date(`${local}:00+05:30`).toISOString() : "");
/** ISO → "YYYY-MM-DDTHH:mm" in IST for <input type="datetime-local">. */
export const isoToIstLocal = (iso?: string | null) =>
  iso ? new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 16) : "";

export const clock = (seconds: number | null) => {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Attempt status as staff say it: "testing" rather than in_progress. */
export const statusLabel = (status?: string | null) => {
  switch (status) {
    case "in_progress": return "Testing";
    case "auto_submitted": return "Submitted (auto)";
    default: return pretty(status);
  }
};

export const statusVariant = (status?: string | null) => {
  if (["live", "submitted", "auto_submitted", "shortlisted", "approved"].includes(status ?? "")) return "success" as const;
  if (["in_progress", "pending_evaluation", "needs_review", "hold", "draft"].includes(status ?? "")) return "warning" as const;
  if (["invalidated", "rejected", "retired", "closed", "abandoned"].includes(status ?? "")) return "destructive-soft" as const;
  return "muted" as const;
};

export const PROCTOR_LABEL: Record<string, string> = {
  fullscreen_exit: "Left full screen",
  tab_hidden: "Switched tab or window",
  window_blur: "Window lost focus",
  paste_blocked: "Tried to paste",
  copy_blocked: "Tried to copy",
  shortcut_blocked: "Blocked shortcut",
  burst_input: "Unusual typing burst",
  resume: "Resumed on another PC",
  second_session: "Second window opened",
};

export function useInvalidateQuiz() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["cbt"] });
}

// ---------- action dialogs (Quiz managers; every action is audited server-side) ----------

export function ResumeCodeDialog({ attemptId, open, onOpenChange }: { attemptId: string | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const invalidate = useInvalidateQuiz();
  const [issued, setIssued] = useState<{ code: string; expires_at: string } | null>(null);
  const issue = useMutation({
    mutationFn: () => quizRpc<{ code: string; expires_at: string }>("cbt_issue_resume_code", { p_attempt_id: attemptId }),
    onSuccess: (res) => { setIssued(res); void invalidate(); },
    onError: (e: Error) => toast({ title: "Code not issued", description: e.message, variant: "destructive" }),
  });
  const close = (o: boolean) => { if (!o) setIssued(null); onOpenChange(o); };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Resume code</DialogTitle>
          <DialogDescription>
            For a person whose PC disconnected. On any PC they open the test, choose "I got disconnected", and enter this code with their mobile number. Their old window locks.
          </DialogDescription>
        </DialogHeader>
        {issued ? (
          <div className="space-y-2 text-center">
            <p className="font-mono text-4xl font-semibold tracking-[0.3em] text-foreground">{issued.code}</p>
            <p className="text-sm text-muted-foreground">Read it out now — it is shown only once. Valid until {fmtTime(issued.expires_at)} IST, single use.</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Issuing a new code cancels any earlier unused code for this test. Codes last 30 minutes.</p>
        )}
        <DialogFooter>
          {issued ? <Button onClick={() => close(false)}>Done</Button> : (
            <>
              <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
              <Button loading={issue.isPending} onClick={() => issue.mutate()}>Issue code</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddTimeDialog({ attemptId, open, onOpenChange }: { attemptId: string | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const invalidate = useInvalidateQuiz();
  const [minutes, setMinutes] = useState("2");
  const [reason, setReason] = useState("");
  const add = useMutation({
    mutationFn: () => quizRpc<{ section_code: string; applies_on_start: boolean }>("cbt_add_section_time", {
      p_attempt_id: attemptId, p_seconds: Math.round(Number(minutes) * 60), p_reason: reason.trim(),
    }),
    onSuccess: (res) => {
      toast({ title: "Time added", description: res.applies_on_start ? `Applies when section ${res.section_code} starts.` : `Section ${res.section_code} deadline moved.` });
      setReason(""); onOpenChange(false); void invalidate();
    },
    onError: (e: Error) => toast({ title: "Time not added", description: e.message, variant: "destructive" }),
  });
  const valid = Number(minutes) > 0 && Number(minutes) <= 60 && reason.trim().length > 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add time</DialogTitle>
          <DialogDescription>Extends the section running now (or the next one, if they are between sections).</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            {["1", "2", "5"].map((m) => (
              <Button key={m} type="button" size="sm" variant={minutes === m ? "default" : "outline"} onClick={() => setMinutes(m)}>+{m} min</Button>
            ))}
          </div>
          <div><Label htmlFor="add-min">Minutes</Label><Input id="add-min" inputMode="decimal" className="text-foreground" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></div>
          <div><Label htmlFor="add-reason">Reason</Label><Textarea id="add-reason" className="text-foreground" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. PC restarted" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!valid} loading={add.isPending} onClick={() => add.mutate()}>Add time</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReasonDialog({
  open, onOpenChange, title, description, confirmLabel, destructive, onConfirm, pending, extra,
}: {
  extra?: ReactNode;
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string; confirmLabel: string;
  destructive?: boolean; onConfirm: (reason: string) => void; pending?: boolean;
}) {
  const [reason, setReason] = useState("");
  // Each opening starts blank, so a reason typed for one person never carries to the next.
  useEffect(() => { if (open) setReason(""); }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setReason(""); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        {extra}
        <div><Label htmlFor="reason-text">Reason (required)</Label><Textarea id="reason-text" className="text-foreground" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant={destructive ? "destructive" : "default"} disabled={!reason.trim()} loading={pending} onClick={() => onConfirm(reason.trim())}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const { toast } = useToast();
  return (
    <Button variant="outline" size="sm" onClick={() => { void navigator.clipboard?.writeText(text); toast({ title: "Copied" }); }}>
      <Copy className="h-4 w-4" />{label}
    </Button>
  );
}
