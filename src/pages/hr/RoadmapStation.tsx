import { Check, Lock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type StationStatus = "done" | "active" | "ready" | "locked";

const TONE: Record<
  StationStatus,
  { medallion: string; ring: string; title: string; pill: string; label: string; card: string }
> = {
  done: {
    medallion: "bg-emerald-500 text-white",
    ring: "ring-emerald-500/25",
    title: "text-foreground",
    pill: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    label: "Completed",
    card: "border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.04] to-transparent",
  },
  active: {
    medallion: "bg-primary text-primary-foreground",
    ring: "ring-primary/25",
    title: "text-foreground",
    pill: "bg-primary/10 text-primary border-primary/30",
    label: "In progress",
    card: "border-primary/30 bg-gradient-to-br from-primary/[0.06] to-transparent shadow-[0_0_0_1px_hsl(var(--primary)/0.15),0_8px_24px_-12px_hsl(var(--primary)/0.35)]",
  },
  ready: {
    medallion: "bg-background text-foreground border border-border",
    ring: "ring-border",
    title: "text-foreground",
    pill: "bg-muted text-muted-foreground border-border",
    label: "Ready",
    card: "border-border bg-card/50",
  },
  locked: {
    medallion: "bg-muted text-muted-foreground",
    ring: "ring-border/40",
    title: "text-muted-foreground",
    pill: "bg-muted/60 text-muted-foreground border-border",
    label: "Locked",
    card: "border-dashed border-border/60 bg-transparent",
  },
};

interface StationProps {
  letter: string;
  title: string;
  subtitle?: string;
  status: StationStatus;
}

/**
 * Station — refined header placed before each roadmap step card.
 * Presents a medallion, plain-English title, and status pill inside
 * a soft tonal container that echoes the step's state.
 */
export function Station({ letter, title, subtitle, status }: StationProps) {
  const t = TONE[status];
  return (
    <div id={`station-${letter}`} className="scroll-mt-24 pt-1">
      <div
        className={cn(
          "relative flex items-start gap-3 sm:gap-4 rounded-xl border px-3 sm:px-4 py-3 transition-colors",
          t.card
        )}
      >
        <div
          className={cn(
            "flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full shadow-sm ring-4 ring-background shrink-0",
            t.medallion,
            t.ring
          )}
          aria-hidden
        >
          {status === "done" ? (
            <Check className="h-5 w-5" strokeWidth={3} />
          ) : status === "locked" ? (
            <Lock className="h-4 w-4" />
          ) : (
            <span className="text-base sm:text-lg font-bold tracking-tight">{letter}</span>
          )}
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80">
              Step {letter}
            </p>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                t.pill
              )}
            >
              {status === "active" && <Sparkles className="h-3 w-3" />}
              {t.label}
            </span>
          </div>
          <h3 className={cn("text-[15px] sm:text-base font-semibold tracking-tight leading-snug mt-0.5", t.title)}>
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs sm:text-[13px] text-muted-foreground mt-1 leading-relaxed">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}
