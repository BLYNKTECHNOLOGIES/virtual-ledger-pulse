import { cn } from "@/lib/utils";
import type { StationStatus } from "./RoadmapStation";

interface Step {
  letter: string;
  title: string;
  status: StationStatus;
}

interface Props {
  steps: Step[];
}

const DOT: Record<StationStatus, string> = {
  done:   "bg-emerald-500 text-white ring-emerald-200 dark:ring-emerald-500/30",
  active: "bg-primary text-primary-foreground ring-primary/30",
  ready:  "bg-background text-foreground ring-border border border-border",
  locked: "bg-muted text-muted-foreground ring-border/40",
};

export function RoadmapJourneyNav({ steps }: Props) {
  const completed = steps.filter((s) => s.status === "done").length;
  const currentIdx = steps.findIndex((s) => s.status === "active");
  const currentLabel = currentIdx >= 0 ? steps[currentIdx].title : steps[completed]?.title ?? "All done";
  const currentNum = currentIdx >= 0 ? currentIdx + 1 : Math.min(completed + 1, steps.length);
  const pct = Math.round((completed / steps.length) * 100);

  const scrollTo = (letter: string) => {
    document.getElementById(`station-${letter}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="sticky top-0 z-20 -mx-6 px-6 py-3 bg-background/80 backdrop-blur border-b border-border">
      <div className="flex items-center justify-between mb-2 gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Payroll sync journey</p>
          <p className="text-sm font-semibold truncate">
            Step {currentNum} of {steps.length} · <span className="text-primary">{currentLabel}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="h-1.5 w-16 sm:w-24 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">{pct}%</span>
        </div>
      </div>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5">
        {steps.map((s) => (
          <button
            key={s.letter}
            type="button"
            onClick={() => scrollTo(s.letter)}
            title={`${s.letter} · ${s.title}`}
            className={cn(
              "flex-shrink-0 h-8 w-8 rounded-full text-xs font-bold ring-2 ring-offset-1 ring-offset-background transition-all active:scale-95",
              DOT[s.status],
              s.status === "active" && "scale-110"
            )}
          >
            {s.status === "done" ? "✓" : s.letter}
          </button>
        ))}
      </div>
    </div>
  );
}
