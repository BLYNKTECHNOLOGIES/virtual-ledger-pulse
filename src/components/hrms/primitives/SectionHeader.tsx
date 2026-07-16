import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  helper?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  className?: string;
}

/**
 * SectionHeader — unified anatomy for HRMS surfaces.
 * Eyebrow (uppercase tracked) → title → helper line → optional actions.
 */
export function SectionHeader({
  eyebrow,
  title,
  helper,
  icon: Icon,
  actions,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-3 sm:gap-4", className)}>
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-1">
            {eyebrow}
          </p>
        )}
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-foreground truncate">
            {title}
          </h2>
        </div>
        {helper && (
          <p className="text-xs sm:text-[13px] text-muted-foreground mt-1 leading-relaxed">
            {helper}
          </p>
        )}
      </div>
      {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
    </div>
  );
}
