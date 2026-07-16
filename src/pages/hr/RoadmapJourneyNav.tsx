import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import type { StationStatus } from "./RoadmapStation";

interface Step {
  letter: string;
  title: string;
  status: StationStatus;
}

interface Props {
  steps: Step[];
  /**
   * Optional letter after which to draw a visual rail break with labels.
   * Used to separate one-time setup (A–E) from the monthly cycle (F–J).
   */
  railBreakAfter?: string;
  leftRailLabel?: string;
  rightRailLabel?: string;
}

const DOT: Record<StationStatus, string> = {
  done: "bg-emerald-500 text-white border-emerald-500",
  active: "bg-primary text-primary-foreground border-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.18)]",
  ready: "bg-background text-foreground border-border",
  locked: "bg-muted text-muted-foreground border-border/60",
};

export function RoadmapJourneyNav({ steps }: Props) {
  const completed = steps.filter((s) => s.status === "done").length;
  const currentIdx = steps.findIndex((s) => s.status === "active");
  const currentLabel =
    currentIdx >= 0 ? steps[currentIdx].title : steps[completed]?.title ?? "All steps complete";
  const currentNum = currentIdx >= 0 ? currentIdx + 1 : Math.min(completed + 1, steps.length);
  const pct = Math.round((completed / steps.length) * 100);

  const scrollTo = (letter: string) => {
    document.getElementById(`station-${letter}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="sticky top-0 z-20 -mx-6 px-4 sm:px-6 py-3 bg-background/85 backdrop-blur-md border-b border-border">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Payroll sync journey
          </p>
          <p className="text-sm font-semibold truncate text-foreground">
            <span className="tabular-nums text-muted-foreground">
              {currentNum}/{steps.length}
            </span>{" "}
            · <span className="text-primary">{currentLabel}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="h-1.5 w-20 sm:w-28 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[11px] font-semibold tabular-nums text-muted-foreground w-9 text-right">
            {pct}%
          </span>
        </div>
      </div>

      {/* Rail with connecting track */}
      <div className="relative overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
        <div className="relative flex items-center gap-0 min-w-max">
          {steps.map((s, i) => {
            const nextDone = steps[i + 1]?.status === "done" || s.status === "done";
            return (
              <div key={s.letter} className="flex items-center">
                <button
                  type="button"
                  onClick={() => scrollTo(s.letter)}
                  title={`${s.letter} · ${s.title}`}
                  aria-label={`Step ${s.letter}: ${s.title}`}
                  className={cn(
                    "relative z-[1] flex-shrink-0 h-8 w-8 rounded-full text-[11px] font-bold border-2 transition-all active:scale-95",
                    DOT[s.status],
                    s.status === "active" && "scale-110"
                  )}
                >
                  {s.status === "done" ? (
                    <Check className="h-3.5 w-3.5 mx-auto" strokeWidth={3} />
                  ) : (
                    s.letter
                  )}
                </button>
                {i < steps.length - 1 && (
                  <div
                    aria-hidden
                    className={cn(
                      "h-0.5 w-6 sm:w-8",
                      nextDone ? "bg-emerald-500" : "bg-border"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
