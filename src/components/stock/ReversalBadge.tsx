import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Undo2, RotateCcw } from "lucide-react";

/**
 * Badges shown next to wallet_transactions rows so the user can instantly tell
 * which entries are reversal pairs.
 *
 *  - "Reversed →"  amber pill on an ORIGINAL row that has been reversed
 *                  (transaction.is_reversed === true)
 *  - "Reverses ←"  grey pill on a REVERSAL row
 *                  (transaction.reverses_transaction_id != null)
 *
 * Hovering shows the reason parsed from the description after the em-dash.
 */
export function ReversalBadge({
  isReversed,
  reversesTransactionId,
  description,
}: {
  isReversed?: boolean | null;
  reversesTransactionId?: string | null;
  description?: string | null;
}) {
  // Parse "Reversal of <uuid> — <reason> [REV:xxxxxxxx]" → reason text
  const reason = (() => {
    if (!description) return null;
    const m = description.match(/—\s*(.+?)(?:\s*\[REV:[^\]]+\])?$/);
    return m ? m[1].trim() : description;
  })();

  if (reversesTransactionId) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className="ml-1 gap-1 bg-muted text-muted-foreground border-border text-[10px] py-0 px-1.5"
          >
            <Undo2 className="h-2.5 w-2.5" />
            Reverses ←
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-xs font-medium">This entry reverses an earlier one.</p>
          {reason && <p className="text-xs text-muted-foreground mt-1">Reason: {reason}</p>}
        </TooltipContent>
      </Tooltip>
    );
  }

  if (isReversed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className="ml-1 gap-1 bg-amber-50 text-amber-800 border-amber-200 text-[10px] py-0 px-1.5"
          >
            <RotateCcw className="h-2.5 w-2.5" />
            Reversed →
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-xs font-medium">This original entry has been reversed.</p>
          <p className="text-xs text-muted-foreground mt-1">
            A linked reversal row exists below in the ledger and offsets this amount.
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return null;
}
