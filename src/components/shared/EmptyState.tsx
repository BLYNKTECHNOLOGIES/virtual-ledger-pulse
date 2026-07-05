import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * EmptyState — shared ERP empty/no-data placeholder.
 * Centered muted-icon pattern with concise copy and an optional CTA.
 * Presentation only.
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
      <div className="h-12 w-12 rounded-lg bg-muted text-muted-foreground flex items-center justify-center">
        <Icon className="h-6 w-6" />
      </div>
      <p className="text-sm font-medium text-foreground mt-3">{title}</p>
      {description && (
        <p className="text-sm text-muted-foreground mt-1 max-w-sm text-center">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export default EmptyState;
