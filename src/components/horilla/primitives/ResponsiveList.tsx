import * as React from "react";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * ResponsiveList — a single primitive that picks its rendering mode from the
 * device, NOT from a user toggle.
 *
 * - Desktop (>= 768px): renders a proper `<table>` with `columns` as headers
 *   and `renderRow(item)` as each `<tr>` body.
 * - Mobile (< 768px): renders a vertical stack of cards via `renderCard(item)`.
 *
 * Both variants share the same data, empty state, and loading skeleton so
 * pages don't have to maintain two branches.
 */
export interface ResponsiveListColumn {
  key: string;
  label: React.ReactNode;
  className?: string;
}

export interface ResponsiveListProps<T> {
  items: T[];
  columns: ResponsiveListColumn[];
  /** Row renderer for the desktop `<table>` — return the `<tr>` contents (typically `<td>`s). */
  renderRow: (item: T, index: number) => React.ReactNode;
  /** Card renderer for phones — return the full card node. */
  renderCard: (item: T, index: number) => React.ReactNode;
  keyFor: (item: T, index: number) => string;
  isLoading?: boolean;
  emptyState?: React.ReactNode;
  /** Optional key applied to the desktop `<table>` (e.g. `min-w-[720px]`). */
  tableMinWidth?: string;
  /** Optional className applied to the outer wrapper. */
  className?: string;
  /** Optional className applied to the mobile card stack. */
  mobileClassName?: string;
}

export function ResponsiveList<T>({
  items,
  columns,
  renderRow,
  renderCard,
  keyFor,
  isLoading,
  emptyState,
  tableMinWidth = "min-w-[720px]",
  className,
  mobileClassName,
}: ResponsiveListProps<T>) {
  const isMobile = useIsMobile();

  if (isLoading) {
    return (
      <div className={className}>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-14 rounded-lg bg-muted/40 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className={className}>
        {emptyState ?? (
          <div className="text-center text-sm text-muted-foreground py-12">
            No records to display.
          </div>
        )}
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className={className}>
        <div className={mobileClassName ?? "flex flex-col gap-2"}>
          {items.map((item, i) => (
            <React.Fragment key={keyFor(item, i)}>
              {renderCard(item, i)}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="hrms-scroll-table bg-card rounded-xl border border-border overflow-x-auto">
        <table className={`w-full text-sm ${tableMinWidth}`}>
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`text-left font-medium px-3 py-2 ${col.className ?? ""}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr
                key={keyFor(item, i)}
                className="border-t border-border hover:bg-muted/30 transition-colors"
              >
                {renderRow(item, i)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
