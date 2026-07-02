import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        // Soft status tints — reuse existing semantic tokens, no new palette.
        success:
          "border-transparent bg-success/10 text-success",
        warning:
          "border-transparent bg-warning/10 text-warning",
        info:
          "border-transparent bg-info/10 text-info",
        muted:
          "border-transparent bg-muted text-muted-foreground",
        "destructive-soft":
          "border-transparent bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const dotColor: Record<string, string> = {
  default: "bg-primary-foreground/70",
  secondary: "bg-secondary-foreground/60",
  destructive: "bg-destructive-foreground/70",
  outline: "bg-foreground/50",
  success: "bg-success",
  warning: "bg-warning",
  info: "bg-info",
  muted: "bg-muted-foreground/60",
  "destructive-soft": "bg-destructive",
}

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  /** Show a leading status dot for quick scannability. */
  dot?: boolean
}

function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            dotColor[variant ?? "default"]
          )}
        />
      )}
      {children}
    </div>
  )
}

export { Badge, badgeVariants }
