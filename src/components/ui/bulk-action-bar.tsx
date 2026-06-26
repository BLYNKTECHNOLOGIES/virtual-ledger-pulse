import * as React from "react"
import { cn } from "@/lib/utils"

interface BulkActionBarProps {
  /** Number of selected items. The bar shows when this is > 0. */
  count: number
  /** Action buttons / controls rendered on the right. */
  children: React.ReactNode
  /** Singular noun for the count label, defaults to "item". */
  itemNoun?: string
  /** Called when the user clears the selection. */
  onClear?: () => void
  className?: string
}

/**
 * BulkActionBar — a floating bar that slides up when rows are selected,
 * showing the selection count and contextual bulk actions. Replaces a
 * static button so bulk operations feel intentional and discoverable.
 */
export function BulkActionBar({
  count,
  children,
  itemNoun = "item",
  onClear,
  className,
}: BulkActionBarProps) {
  if (count <= 0) return null
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-4 z-50 mx-auto flex w-[calc(100%-2rem)] max-w-2xl items-center justify-between gap-4 rounded-xl border border-border bg-popover/95 px-4 py-3 shadow-lg backdrop-blur-sm animate-fade-in-up",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-2 text-xs font-semibold text-primary-foreground tabular-nums">
          {count}
        </span>
        <span className="text-sm text-foreground">
          {itemNoun}
          {count === 1 ? "" : "s"} selected
        </span>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}
