import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Clock, KeyRound, RotateCcw, ShieldAlert, Undo2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  AddTimeDialog, PROCTOR_LABEL, ReasonDialog, ResumeCodeDialog, fmtIst, fmtTime, pretty, quizRpc,
  statusLabel, statusVariant, useInvalidateQuiz, clock,
} from "./quizShared";

type Section = {
  id: string; order_index: number; section_code: string; section_type: string; title: string; status: string;
  started_at: string | null; deadline_at: string | null; submitted_at: string | null;
  raw_score: number | null; max_score: number | null; normalized_score: number | null; gate_passed: boolean | null;
  gate_min_score: number | string | null; gate_min_net_wpm?: number | string | null; gate_min_accuracy?: number | string | null; weight: number | string | null; duration_seconds: number | null;
  metrics: Record<string, any> | null; extra_seconds: number;
  items_total: number; items_correct: number; items_wrong: number; items_skipped: number;
  written: { prompt: string | null; answer: string | null; grade: number | null; comments: string | null }[] | null;
};
type Detail = {
  server_now: string;
  attempt: { id: string; public_ref: string; status: string; auto_submit_reason: string | null; created_at: string; started_at: string | null;
    submitted_at: string | null; last_seen: string | null; total_score: number | null; decision: string | null; decision_reason: string | null;
    decision_source: string; warning_count: number; is_sandbox: boolean };
  person: { full_name: string | null; mobile: string | null; email: string | null; city: string | null; qualification: string | null; experience_years: number | null; anonymized: boolean };
  drive: { name: string; code: string; mode: string };
  test: { name: string; code: string; shortlist_cutoff: number; hold_cutoff: number };
  sections: Section[];
  events: { type: string; at: string; meta: Record<string, any> | null }[];
  audit: { action: string; at: string; reason: string | null; actor: string | null }[];
};

const timeUsed = (s: Section) => {
  if (!s.started_at) return "—";
  const end = s.submitted_at ?? new Date().toISOString();
  return clock((new Date(end).getTime() - new Date(s.started_at).getTime()) / 1000);
};

function Measured({ s }: { s: Section }) {
  const m = s.metrics ?? {};
  const pair = (label: string, value: unknown) => (
    <span><span className="text-muted-foreground">{label} </span><span className="font-medium tabular-nums text-foreground">{String(value ?? "—")}</span></span>
  );
  switch (s.section_type) {
    case "typing":
      return <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">{pair("Net WPM", m.net_wpm)}{pair("Gross WPM", m.gross_wpm)}{pair("Accuracy", m.accuracy != null ? `${m.accuracy}%` : "—")}{pair("Words", m.words_committed)}{pair("Keystrokes", m.keystrokes)}{pair("Corrections", m.backspaces)}</div>;
    case "data_entry":
      return <div className="text-xs">{pair("Fields right", m.possible_weight != null ? `${m.earned_weight ?? 0} of ${m.possible_weight}` : "—")}</div>;
    case "mental_maths":
      return <div className="text-xs">{pair("Right", m.total != null ? `${m.correct ?? 0} of ${m.total}` : "—")}</div>;
    case "memory_recall":
      return <div className="flex flex-wrap gap-x-4 text-xs">{pair("Sequences right", m.total_sequences != null ? `${m.correct_sequences ?? 0} of ${m.total_sequences}` : "—")}{pair("Characters right", m.possible_items != null ? `${m.correct_items ?? 0} of ${m.possible_items}` : "—")}</div>;
    case "written":
      return (
        <div className="space-y-2">
          {(s.written ?? []).map((w, i) => (
            <div key={i} className="rounded-md border border-border bg-muted/30 p-2 text-xs">
              <p className="font-medium text-foreground">{w.prompt ?? "Written answer"}</p>
              <p className="mt-1 whitespace-pre-wrap text-foreground">{w.answer?.trim() || "No answer submitted"}</p>
              <p className="mt-1 text-muted-foreground">{w.grade == null ? "Waiting for grading" : `Grade ${w.grade}/20${w.comments ? ` · ${w.comments}` : ""}`}</p>
            </div>
          ))}
        </div>
      );
    default:
      return <div className="flex flex-wrap gap-x-4 text-xs">{pair("Right", s.items_correct)}{pair("Wrong", s.items_wrong)}{pair("Skipped", s.items_skipped)}</div>;
  }
}

export function AttemptPanel({ attemptId, onClose, canManage }: { attemptId: string | null; onClose: () => void; canManage: boolean }) {
  const { toast } = useToast();
  const invalidate = useInvalidateQuiz();
  const [dialog, setDialog] = useState<null | "resume" | "time" | "invalidate" | "override">(null);
  const [overrideTo, setOverrideTo] = useState("shortlisted");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["cbt", "attempt-detail", attemptId],
    enabled: Boolean(attemptId),
    queryFn: () => quizRpc<Detail>("cbt_attempt_detail", { p_attempt_id: attemptId }),
    refetchInterval: (q) => (["registered", "in_progress"].includes((q.state.data as Detail | undefined)?.attempt.status ?? "") ? 10_000 : false),
  });

  const act = useMutation({
    mutationFn: async (v: { fn: string; args: Record<string, unknown>; ok: string }) => { await quizRpc(v.fn, v.args); return v.ok; },
    onSuccess: (ok) => { toast({ title: ok }); setDialog(null); void invalidate(); },
    onError: (e: Error) => toast({ title: "Not done", description: e.message, variant: "destructive" }),
  });

  const a = data?.attempt;
  const running = a && ["registered", "in_progress"].includes(a.status);
  const finished = a && !running;

  return (
    <Sheet open={Boolean(attemptId)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{data?.person.full_name ?? (isLoading ? "Loading…" : "Attempt")}</SheetTitle>
          <SheetDescription>{a ? `${a.public_ref} · ${data?.test.name} · ${data?.drive.name}${a.is_sandbox ? " · Sandbox" : ""}` : isError ? "Could not load this attempt." : ""}</SheetDescription>
        </SheetHeader>

        {data && a && (
          <div className="mt-5 space-y-6">
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div><p className="text-xs text-muted-foreground">Status</p><Badge variant={statusVariant(a.status)}>{statusLabel(a.status)}</Badge></div>
              <div><p className="text-xs text-muted-foreground">Total</p><p className="text-lg font-semibold tabular-nums">{a.total_score ?? "—"}</p></div>
              <div><p className="text-xs text-muted-foreground">Decision</p><Badge variant={statusVariant(a.decision ?? "in_progress")}>{decisionLabel(a.decision)}</Badge></div>
              <div><p className="text-xs text-muted-foreground">Set by</p><p className="text-sm font-medium">{a.decision_source === "manual" ? "HR override" : "Automatic"}</p></div>
              <p className="col-span-2 text-sm text-muted-foreground sm:col-span-4">{a.decision_reason ?? "No decision reason yet."}</p>
            </section>

            {canManage && (
              <div className="flex flex-wrap gap-2">
                {running && <Button size="sm" variant="outline" onClick={() => setDialog("resume")}><KeyRound className="h-4 w-4" />Resume code</Button>}
                {a.status === "in_progress" && <Button size="sm" variant="outline" onClick={() => setDialog("time")}><Clock className="h-4 w-4" />Add time</Button>}
                {finished && a.status !== "invalidated" && <Button size="sm" variant="outline" onClick={() => setDialog("override")}>Override decision</Button>}
                {finished && a.decision_source === "manual" && (
                  <Button size="sm" variant="outline" loading={act.isPending} onClick={() => act.mutate({ fn: "cbt_restore_auto_decision", args: { p_attempt_id: a.id }, ok: "Back to automatic decision" })}><Undo2 className="h-4 w-4" />Back to automatic</Button>
                )}
                {finished && <Button size="sm" variant="outline" loading={act.isPending} onClick={() => act.mutate({ fn: "cbt_rescore_attempt", args: { p_attempt_id: a.id }, ok: "Re-scored" })}><RotateCcw className="h-4 w-4" />Re-score</Button>}
                {a.status !== "invalidated" && <Button size="sm" variant="destructive" onClick={() => setDialog("invalidate")}><ShieldAlert className="h-4 w-4" />Invalidate</Button>}
              </div>
            )}

            <section className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {[
                ["Mobile", data.person.mobile], ["Email", data.person.email], ["City", data.person.city],
                ["Qualification", data.person.qualification], ["Experience", data.person.experience_years != null ? `${data.person.experience_years} yr` : null],
                ["Registered", fmtIst(a.created_at)], ["Started", fmtIst(a.started_at)], ["Submitted", fmtIst(a.submitted_at)],
                ["Last seen", fmtIst(a.last_seen)], ["Cut-offs", `Shortlist ${data.test.shortlist_cutoff} · Hold ${data.test.hold_cutoff}`],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between gap-3 border-b border-border/60 py-1"><span className="text-muted-foreground">{k}</span><span className="text-right font-medium">{v ?? "—"}</span></div>
              ))}
            </section>

            <section className="space-y-3">
              <h3 className="font-semibold">Sections</h3>
              {data.sections.map((s) => (
                <div key={s.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{s.order_index}. {s.title}</p>
                    <div className="flex items-center gap-2">
                      {s.gate_passed === false && <Badge variant="destructive-soft">Below pass mark</Badge>}
                      <Badge variant={statusVariant(s.status)}>{statusLabel(s.status)}</Badge>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Score <span className="font-medium tabular-nums text-foreground">{s.normalized_score ?? "—"}</span></span>
                    {s.section_type === "typing" ? (
                      <span>Pass mark {s.gate_min_net_wpm == null && s.gate_min_accuracy == null && s.gate_min_score == null ? "none"
                        : [s.gate_min_net_wpm != null ? `${s.gate_min_net_wpm} net WPM` : null, s.gate_min_accuracy != null ? `${s.gate_min_accuracy}% accuracy` : null, s.gate_min_score != null ? `score ${s.gate_min_score}` : null].filter(Boolean).join(" · ")}</span>
                    ) : <span>Pass mark {s.gate_min_score ?? "none"}</span>}
                    <span>Weight {s.weight ?? 0}</span>
                    <span>Time used {timeUsed(s)} of {clock(Number(s.duration_seconds ?? 0) + Number(s.extra_seconds ?? 0))}{s.extra_seconds ? ` (+${Math.round(s.extra_seconds / 60)} min added)` : ""}</span>
                  </div>
                  <div className="mt-2"><Measured s={s} /></div>
                </div>
              ))}
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold">Warnings <span className="text-sm font-normal text-muted-foreground">({a.warning_count})</span></h3>
              {!data.events.length ? <p className="text-sm text-muted-foreground">No events recorded.</p> : (
                <ol className="space-y-1 text-sm">
                  {data.events.map((e, i) => (
                    <li key={i} className="flex justify-between gap-3 border-b border-border/60 py-1"><span>{PROCTOR_LABEL[e.type] ?? pretty(e.type)}</span><span className="tabular-nums text-muted-foreground">{fmtTime(e.at)}</span></li>
                  ))}
                </ol>
              )}
            </section>

            {data.audit.length > 0 && (
              <section className="space-y-2">
                <h3 className="font-semibold">HR actions</h3>
                <ol className="space-y-1 text-sm">
                  {data.audit.map((l, i) => (
                    <li key={i} className="border-b border-border/60 py-1"><span className="font-medium">{pretty(l.action)}</span> <span className="text-muted-foreground">· {l.actor ?? "System"} · {fmtIst(l.at)}</span>{l.reason && <p className="text-xs text-muted-foreground">{l.reason}</p>}</li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        )}

        <ResumeCodeDialog attemptId={a?.id ?? null} open={dialog === "resume"} onOpenChange={(o) => setDialog(o ? "resume" : null)} />
        <AddTimeDialog attemptId={a?.id ?? null} open={dialog === "time"} onOpenChange={(o) => setDialog(o ? "time" : null)} />
        <ReasonDialog
          open={dialog === "invalidate"} onOpenChange={(o) => setDialog(o ? "invalidate" : null)}
          title="Invalidate this attempt" description="Ends the test now (if running) and sets the decision to Incomplete. This cannot be undone."
          confirmLabel="Invalidate" destructive pending={act.isPending}
          onConfirm={(reason) => a && act.mutate({ fn: "cbt_invalidate_attempt", args: { p_attempt_id: a.id, p_reason: reason }, ok: "Attempt invalidated" })}
        />
        <ReasonDialog
          open={dialog === "override"} onOpenChange={(o) => setDialog(o ? "override" : null)}
          title="Override decision" description="The automatic rules will not change an HR decision until you choose Back to automatic."
          confirmLabel="Save decision" pending={act.isPending}
          extra={
            <div>
              <p className="mb-1 text-sm font-medium">New decision</p>
              <Select value={overrideTo} onValueChange={setOverrideTo}>
                <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="shortlisted">Shortlist</SelectItem><SelectItem value="hold">Hold</SelectItem><SelectItem value="rejected">Reject</SelectItem></SelectContent>
              </Select>
            </div>
          }
          onConfirm={(reason) => a && act.mutate({ fn: "cbt_override_decision", args: { p_attempt_id: a.id, p_decision: overrideTo, p_reason: reason }, ok: "Decision saved" })}
        />
      </SheetContent>
    </Sheet>
  );
}
