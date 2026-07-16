import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusPill, type PillTone } from "./StatusPill";
import { getStatus, type StatusTone } from "@/lib/hrms/statusVocabulary";

const TONE_MAP: Record<StatusTone, PillTone> = {
  emerald: "emerald",
  amber: "amber",
  destructive: "destructive",
  info: "info",
  primary: "primary",
  default: "default",
};

interface PayrollStatusBadgeProps {
  status: string | null | undefined;
  /** Optional extra text appended after the label (e.g. "· 22 present"). */
  suffix?: string;
  className?: string;
}

/**
 * PayrollStatusBadge (R2) — renders the plain-English label from the
 * canonical status vocabulary and surfaces the raw enum + explanation in a
 * tooltip so auditors still have access to the underlying code.
 */
export function PayrollStatusBadge({ status, suffix, className }: PayrollStatusBadgeProps) {
  const s = getStatus(status);
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <StatusPill tone={TONE_MAP[s.tone]} className={className}>
              {s.label}{suffix ? ` · ${suffix}` : ""}
            </StatusPill>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[260px] text-xs leading-relaxed">
          <div className="font-semibold mb-0.5">{s.label}</div>
          <div className="text-muted-foreground">{s.tooltip}</div>
          <div className="mt-1 pt-1 border-t border-border/60 font-mono text-[10px] text-muted-foreground/80">
            raw: {s.raw}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
