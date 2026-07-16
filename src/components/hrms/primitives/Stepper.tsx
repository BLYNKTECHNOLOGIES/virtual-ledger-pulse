import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export type StepState = "done" | "active" | "upcoming";

interface Step {
  key: string;
  label: string;
  state: StepState;
}

interface StepperProps {
  steps: Step[];
  onSelect?: (key: string) => void;
  className?: string;
}

/**
 * Stepper — horizontal linear stepper used in wizards and staged flows
 * (e.g. Salary Revision, Biometric fetch → ack → cleanup).
 */
export function Stepper({ steps, onSelect, className }: StepperProps) {
  return (
    <div className={cn("flex items-center gap-0 overflow-x-auto no-scrollbar", className)}>
      {steps.map((s, i) => {
        const isDone = s.state === "done";
        const isActive = s.state === "active";
        return (
          <div key={s.key} className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => onSelect?.(s.key)}
              disabled={!onSelect}
              className={cn(
                "flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                isDone && "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                isActive && "border-primary bg-primary/10 text-primary",
                !isDone && !isActive && "border-border bg-muted text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                  isDone && "bg-emerald-500 text-white",
                  isActive && "bg-primary text-primary-foreground",
                  !isDone && !isActive && "bg-background text-muted-foreground border border-border"
                )}
              >
                {isDone ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
              </span>
              <span className="whitespace-nowrap">{s.label}</span>
            </button>
            {i < steps.length - 1 && (
              <div
                aria-hidden
                className={cn("h-0.5 w-4 sm:w-6 mx-0.5", isDone ? "bg-emerald-500" : "bg-border")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
