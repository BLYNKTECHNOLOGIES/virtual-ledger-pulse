import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * PageHeader — shared ERP page title primitive.
 * Normalizes the heading scale (single h1 scale) and action layout across
 * every main ERP page. Presentation only.
 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4", className)}>
      <div className="min-w-0 max-w-full">
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1 max-w-prose">{description}</p>
        )}
      </div>
      {actions && <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:flex-wrap">{actions}</div>}
    </div>
  );
}

export default PageHeader;
