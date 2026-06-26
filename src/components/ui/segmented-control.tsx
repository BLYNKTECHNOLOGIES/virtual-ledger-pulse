import * as React from "react"
import { cn } from "@/lib/utils"

export interface SegmentedOption<T extends string = string> {
  label: React.ReactNode
  value: T
  icon?: React.ReactNode
}

interface SegmentedControlProps<T extends string = string> {
  options: SegmentedOption<T>[]
  value: T
  onValueChange: (value: T) => void
  size?: "sm" | "default"
  className?: string
  "aria-label"?: string
}

/**
 * SegmentedControl — inline toggle group for mutually-exclusive choices.
 * A faster, more visible alternative to a dropdown for 2-4 options
 * (e.g. Buy/Sell, All/Pending/Approved, density, time windows).
 */
export function SegmentedControl<T extends string = string>({
  options,
  value,
  onValueChange,
  size = "default",
  className,
  ...rest
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={rest["aria-label"]}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5",
        className
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(opt.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
