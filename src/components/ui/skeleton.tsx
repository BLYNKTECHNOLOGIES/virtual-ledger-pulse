import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("skeleton-shimmer rounded-md bg-muted", className)}
      {...props}
    />
  )
}

/**
 * TableSkeleton — content-shaped placeholder for data tables.
 * Renders header + N rows of M columns so loading states feel
 * instant instead of showing a blank panel or spinner.
 */
function TableSkeleton({
  rows = 6,
  columns = 5,
  className,
}: {
  rows?: number
  columns?: number
  className?: string
}) {
  return (
    <div className={cn("w-full overflow-hidden rounded-lg border border-border", className)}>
      <div className="flex gap-4 border-b border-border bg-muted/50 px-4 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-3">
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton
                key={c}
                className="h-4 flex-1"
                style={{ animationDelay: `${(r * columns + c) * 35}ms` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** CardSkeleton — placeholder for metric/summary cards. */
function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border p-6", className)}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4 rounded" />
      </div>
      <Skeleton className="mt-4 h-8 w-32" />
      <Skeleton className="mt-2 h-3 w-20" />
    </div>
  )
}

export { Skeleton, TableSkeleton, CardSkeleton }
