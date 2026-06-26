import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface FilterChipProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Optional label shown before the value, e.g. "Status:". */
  label?: string
  /** The active filter value. */
  value: React.ReactNode
  /** Called when the chip's remove button is clicked. */
  onRemove?: () => void
}

/**
 * FilterChip — a removable pill representing an active filter.
 * Use a row of these above tables so users see and clear filters fast.
 */
export const FilterChip = React.forwardRef<HTMLDivElement, FilterChipProps>(
  ({ label, value, onRemove, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-accent/60 py-1 pl-3 pr-1.5 text-xs font-medium text-accent-foreground animate-fade-in-up",
        className
      )}
      {...props}
    >
      {label && <span className="text-muted-foreground">{label}</span>}
      <span>{value}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label ?? ""} filter`}
          className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
)
FilterChip.displayName = "FilterChip"
