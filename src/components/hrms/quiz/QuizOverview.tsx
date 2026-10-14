import { useQuery } from "@tanstack/react-query";
import { Activity, CheckCircle2, ClipboardCheck, PenLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { fmtIst, pretty, quizRpc, statusVariant } from "./quizShared";
import { useGradingCounts } from "./QuizGrading";

type Overview = {
  live_drives: { id: string; name: string; code: string; ends_at: string; is_sandbox: boolean; testing: number }[];
  testing_now: number; submitted_today: number; awaiting_grading: number;
  week: { shortlisted: number; hold: number; rejected: number };
  latest: { id: string; public_ref: string; person: string | null; test: string | null; total_score: number | null; decision: string; decision_source: string; submitted_at: string; is_sandbox: boolean }[];
};

export function QuizOverview({ onOpenDrive, onOpenView }: { onOpenDrive: (id: string) => void; onOpenView: (view: string) => void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["cbt", "overview"],
    queryFn: () => quizRpc<Overview>("cbt_overview"),
    refetchInterval: 15_000,
  });
  const { data: grading } = useGradingCounts(true);
  const v = (n?: number) => (isLoading ? "—" : n ?? 0);
  const tiles = [
    { label: "Testing now", value: v(data?.testing_now), icon: Activity, tone: "text-info bg-info/10", go: "drives" },
    { label: "Submitted today", value: v(data?.submitted_today), icon: CheckCircle2, tone: "text-success bg-success/10", go: "results" },
    { label: "Written answers needing a check", value: v(grading ? grading.needs_check : data?.awaiting_grading), sub: grading ? `${grading.ai_pending} with the AI · ${grading.ai_graded} AI graded` : undefined, icon: PenLine, tone: "text-warning bg-warning/10", go: "grading" },
    { label: "Decisions this week", value: isLoading ? "—" : `${data?.week.shortlisted ?? 0} / ${data?.week.hold ?? 0} / ${data?.week.rejected ?? 0}`, sub: "shortlisted / hold / rejected", icon: ClipboardCheck, tone: "text-primary bg-primary/10", go: "results" },
  ];
  if (isError) return <p className="text-sm text-destructive">The overview could not be loaded.</p>;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <button key={t.label} className="text-left" onClick={() => onOpenView(t.go)}>
            <Card className="h-full transition-colors hover:border-primary/50"><CardContent className="flex items-center gap-3 p-4">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${t.tone}`}><t.icon className="h-5 w-5" /></span>
              <div className="min-w-0"><p className="text-2xl font-semibold tabular-nums">{t.value}</p><p className="text-xs text-muted-foreground">{t.label}</p>{t.sub && <p className="text-[11px] text-muted-foreground">{t.sub}</p>}</div>
            </CardContent></Card>
          </button>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="space-y-2 border-t border-border pt-4">
          <h2 className="font-semibold">Live drives</h2>
          {!data?.live_drives.length ? <p className="text-sm text-muted-foreground">No drive is live right now. Open Drives to make one live.</p> : data.live_drives.map((d) => (
            <button key={d.id} onClick={() => onOpenDrive(d.id)} className="flex w-full items-center justify-between gap-3 rounded-md border border-border p-3 text-left hover:border-primary/50">
              <div className="min-w-0"><p className="font-medium">{d.name}{d.is_sandbox && <Badge variant="muted" className="ml-2">Sandbox</Badge>}</p><p className="text-xs text-muted-foreground"><span className="font-mono">{d.code}</span> · closes {fmtIst(d.ends_at)}</p></div>
              <span className="text-sm tabular-nums">{d.testing} testing</span>
            </button>
          ))}
        </section>
        <section className="space-y-2 border-t border-border pt-4">
          <h2 className="font-semibold">Latest results</h2>
          {!data?.latest.length ? <p className="text-sm text-muted-foreground">Results appear here as people finish their tests.</p> : data.latest.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 border-b border-border/60 py-1.5 text-sm">
              <div className="min-w-0"><p className="truncate font-medium">{r.person ?? "Anonymized"}</p><p className="text-xs text-muted-foreground">{r.public_ref} · {r.test}{r.is_sandbox ? " · sandbox" : ""} · {fmtIst(r.submitted_at)}</p></div>
              <div className="flex shrink-0 items-center gap-2"><span className="tabular-nums">{r.total_score ?? "—"}</span><Badge variant={statusVariant(r.decision)}>{pretty(r.decision)}</Badge></div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
