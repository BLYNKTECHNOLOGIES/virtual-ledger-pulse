import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { valueTypeScale } from "@/lib/formatCompactCurrency";

interface StatTileProps {
  /** Small uppercase label */
  label: string;
  /** Headline (compact) value */
  value: string;
  /** Exact value shown under the headline and in the tooltip */
  exactValue?: string;
  /** Small context line at the bottom (e.g. "9 conversions") */
  hint?: ReactNode;
  /** Icon element rendered inside the tinted chip */
  icon?: ReactNode;
  /** Tailwind classes for the icon chip, e.g. "bg-success/10 text-success" */
  iconClassName?: string;
  /** Renders hover affordance when the tile is clickable */
  interactive?: boolean;
  className?: string;
}

export function StatTile({
  label,
  value,
  exactValue,
  hint,
  icon,
  iconClassName = "bg-muted text-muted-foreground",
  interactive = false,
  className,
}: StatTileProps) {
  const headline = (
    <p
      className={cn(
        "font-semibold mt-2 text-foreground tabular-nums leading-tight",
        valueTypeScale(value)
      )}
    >
      {value}
    </p>
  );

  return (
    <Card
      className={cn(
        "h-full bg-card border border-border shadow-none transition-colors",
        interactive && "group hover:border-foreground/20",
        className
      )}
    >
      <CardContent className="p-5 h-full">
        <div className="flex h-full items-start justify-between gap-3">
          <div className="flex-1 min-w-0 flex flex-col">
            <p className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
              {label}
            </p>

            {exactValue ? (
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="w-fit cursor-default">{headline}</span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <span className="tabular-nums">{exactValue}</span>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              headline
            )}

            {exactValue && (
              <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5 truncate">
                {exactValue}
              </p>
            )}

            {hint && (
              <div
                className={cn(
                  "flex items-center gap-1.5 mt-auto pt-3 text-[11px] font-medium text-muted-foreground",
                  interactive && "transition-colors group-hover:text-foreground"
                )}
              >
                {hint}
              </div>
            )}
          </div>

          <div className={cn("p-2 rounded-lg shrink-0", iconClassName)}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}
