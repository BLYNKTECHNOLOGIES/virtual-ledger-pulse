import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtRelative } from "@/lib/ats/format";
import { HANDLED_LABEL, intentMeta, type ReplyIntent } from "@/lib/ats/conversations";
import type { Step } from "@/lib/ats/nextStep";
import { IntentChip } from "./ConversationBits";

interface Props {
  intent: string | null;
  preview: string;
  steps: Step[];
  handled?: { action: string | null; by: string | null; at: string } | null;
  busy?: boolean;
  onStep: (s: Step) => void;
  onUndo?: () => void;
  className?: string;
}

/** "What to do next" for the newest unanswered reply. Presentational: the caller wires actions. */
export function NextStepBar({ intent, preview, steps, handled, busy, onStep, onUndo, className }: Props) {
  if (handled) {
    return (
      <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground", className)}>
        <span>Done: {HANDLED_LABEL[handled.action ?? ""] ?? "Handled"}{handled.by ? ` · ${handled.by}` : ""}, {fmtRelative(handled.at)}</span>
        {onUndo && <Button variant="link" size="sm" className="h-auto p-0 text-xs" disabled={busy} onClick={onUndo}>Undo</Button>}
      </div>
    );
  }
  const meta = intentMeta(intent);
  return (
    <div className={cn("flex flex-wrap items-center gap-2 border-t border-border bg-muted/30 px-3 py-2", className)} aria-label="Next step">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {meta && <IntentChip intent={intent as ReplyIntent} size="sm" />}
        <span className="min-w-0 truncate text-xs text-muted-foreground" title={preview}>{preview}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {steps.map((s, i) => (
          <Button key={`${s.key}-${i}`} size="sm" variant={i === 0 ? "default" : "outline"} className="h-7 text-xs" disabled={busy} onClick={() => onStep(s)}>
            {busy && i === 0 && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}{s.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
