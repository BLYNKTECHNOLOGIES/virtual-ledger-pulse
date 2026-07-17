import { LucideIcon, Inbox, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  icon?: LucideIcon;
  title: string;
  /** Plain-English reason this screen is empty — NOT jargon. */
  reason: string;
  /** Optional single next action. If omitted, no CTA is shown. */
  nextAction?: { label: string; onClick: () => void };
  /** Optional secondary link (e.g. docs, "learn more"). */
  secondary?: { label: string; onClick: () => void };
}

/**
 * Standard empty-state for HRMS "works-but-no-data" screens.
 * Prevents the "is this broken?" moment for non-technical HR managers.
 *
 * Rule of thumb: if a module is fully wired but the table has 0 rows,
 * render this instead of a bare table. Reason must be plain English —
 * "No candidates yet — post a job to start receiving applications",
 * not "hr_candidates: 0 rows".
 */
export function HrmsEmptyState({ icon: Icon = Inbox, title, reason, nextAction, secondary }: Props) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-12 flex flex-col items-center text-center gap-3">
        <div className="p-3 rounded-full bg-muted/40">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">{reason}</p>
        </div>
        <div className="flex items-center gap-2 pt-1">
          {nextAction && (
            <Button size="sm" onClick={nextAction.onClick} className="gap-1">
              {nextAction.label} <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
          {secondary && (
            <Button size="sm" variant="ghost" onClick={secondary.onClick}>
              {secondary.label}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
