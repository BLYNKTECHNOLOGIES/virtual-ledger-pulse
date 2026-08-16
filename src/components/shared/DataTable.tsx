import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DataTableShellProps {
  children: ReactNode;
  className?: string;
  /** Caps the scroll height so the sticky header stays useful on long lists. */
  maxHeight?: string;
}

/**
 * DataTableShell — opt-in enterprise table wrapper.
 * Provides sticky headers, subtle row separators, hover rows and compact
 * density via the `.ds-table` design-system classes. Wrap a plain <table>
 * with `className="ds-table"` inside it. Presentation only.
 */
export function DataTableShell({ children, className, maxHeight }: DataTableShellProps) {
  return (
    <div
      className={cn("ds-table-wrap", className)}
      style={maxHeight ? { maxHeight } : undefined}
    >
      {children}
    </div>
  );
}

export default DataTableShell;
