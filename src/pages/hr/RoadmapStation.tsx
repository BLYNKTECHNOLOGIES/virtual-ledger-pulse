import { Check, Lock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type StationStatus = "done" | "active" | "ready" | "locked";

const TONE: Record<StationStatus, { ring: string; bg: string; text: string; pill: string; label: string }> = {
  done:   { ring: "ring-emerald-500/30", bg: "bg-emerald-500 text-white", text: "text-emerald-600", pill: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30", label: "Completed" },
  active: { ring: "ring-primary/30",     bg: "bg-primary text-primary-foreground",     text: "text-primary",  pill: "bg-primary/10 text-primary border-primary/30",             label: "In progress" },
  ready:  { ring: "ring-border",         bg: "bg-background text-foreground border border-border",              text: "text-foreground", pill: "bg-muted text-muted-foreground border-border", label: "Ready" },
  locked: { ring: "ring-border/40",      bg: "bg-muted text-muted-foreground",              text: "text-muted-foreground", pill: "bg-muted/60 text-muted-foreground border-border", label: "Locked" },
};

interface StationProps {
  letter: string;
  title: string;
  subtitle?: string;
  status: StationStatus;
}

/**
 * StationHeader — sibling header placed before each roadmap step card.
 * Renders a medallion badge, plain-English title, and status pill.
 * Uses a scroll-anchor id (`station-{letter}`) so RoadmapJourneyNav can jump to it.
 */
export function Station({ letter, title, subtitle, status }: StationProps) {
  const t = TONE[status];
  return (
    <div id={`station-${letter}`} className="scroll-mt-24 flex items-center gap-3 pt-2">
      <div
        className={cn(
          "flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full shadow-sm ring-4 ring-background shrink-0",
          t.bg,
          t.ring
        )}
        aria-hidden
      >
        {status === "done" ? (
          <Check className="h-5 w-5" strokeWidth={3} />
        ) : status === "locked" ? (
          <Lock className="h-4 w-4" />
        ) : (
          <span className="text-base sm:text-lg font-bold">{letter}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className={cn("text-base sm:text-lg font-semibold tracking-tight", t.text)}>{title}</h3>
          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", t.pill)}>
            {status === "active" && <Sparkles className="h-3 w-3" />}
            {t.label}
          </span>
        </div>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}
