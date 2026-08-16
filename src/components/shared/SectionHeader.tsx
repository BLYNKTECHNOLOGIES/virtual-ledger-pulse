import { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
}

/**
 * SectionHeader — shared ERP section title primitive.
 * Icon + 17px/600 title + optional 12px helper, actions right-aligned.
 * Presentation only.
 */
export function SectionHeader({ title, description, icon: Icon, actions, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon className="h-[18px] w-[18px] text-muted-foreground shrink-0" />}
          <h2 className="t-section text-foreground truncate">{title}</h2>
        </div>
        {description && <p className="t-secondary mt-1">{description}</p>}
      </div>
      {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export default SectionHeader;
