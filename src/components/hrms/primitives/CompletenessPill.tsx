import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export type CompletenessState = "missing" | "partial" | "done";

const STATE: Record<CompletenessState, { dot: string; text: string; label: string }> = {
  missing: {
    dot: "bg-destructive/70",
    text: "text-muted-foreground",
    label: "Missing",
  },
  partial: {
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-300",
    label: "Partial",
  },
  done: {
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-300",
    label: "Done",
  },
};

interface CompletenessPillProps {
  label: string;
  state: CompletenessState;
  onClick?: () => void;
  className?: string;
}

/**
 * CompletenessPill — tri-state chip for employee onboarding completeness.
 * Tap to jump to the corresponding section.
 */
export function CompletenessPill({
  label,
  state,
  onClick,
  className,
}: CompletenessPillProps) {
  const s = STATE[state];
  const Tag: any = onClick ? "button" : "span";
  return (
    <Tag
      onClick={onClick}
      title={`${label}: ${s.label}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-2 py-0.5 text-[11px] font-medium",
        s.text,
        onClick && "hover:border-primary/40 hover:bg-accent/40 transition-colors",
        className
      )}
    >
      {state === "done" ? (
        <Check className="h-3 w-3" strokeWidth={3} />
      ) : (
        <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      )}
      <span>{label}</span>
    </Tag>
  );
}
