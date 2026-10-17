import { cn } from "@/lib/utils";

export interface BreakdownRow {
  key: string;
  label: string;
  sub?: string;
  required: number;
  current: number;
  /** Σ line shortfalls (a surplus on one line never covers another). */
  short: number;
  over: number;
  /** false = shown but not usable as a filter (e.g. lines with no department). */
  selectable?: boolean;
}

/** On roll against required, one bar per shift or department; shortfalls are per-line sums. */
export function StaffingBreakdown({ title, description, rows, onSelect, className }: {
  title: string; description?: string; rows: BreakdownRow[]; onSelect?: (key: string) => void; className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-4", className)} aria-label={title}>
      <h2 className="font-display text-[15px] font-semibold text-foreground">{title}</h2>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No lines in this view.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {rows.map((r) => {
            const max = Math.max(r.required, r.current, 1);
            const filled = Math.min(r.current, r.required);
            const content = (
              <>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-foreground" title={r.label}>
                    {r.label}{r.sub && <span className="ml-1.5 text-xs text-muted-foreground">{r.sub}</span>}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-semibold text-foreground">{r.current}</span>
                    <span className="text-muted-foreground"> / {r.required}</span>
                    {r.short > 0 && <span className="ml-2 text-xs font-medium text-destructive">short {r.short}</span>}
                    {r.over > 0 && <span className="ml-2 text-xs font-medium text-warning">over {r.over}</span>}
                    {r.short === 0 && r.over === 0 && <span className="ml-2 text-xs font-medium text-success">met</span>}
                  </span>
                </div>
                <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full bg-primary" style={{ width: `${(filled / max) * 100}%` }} />
                  {r.current > r.required && <div className="h-full bg-warning" style={{ width: `${((r.current - r.required) / max) * 100}%` }} />}
                </div>
              </>
            );
            return (
              <li key={r.key}>
                {onSelect && r.selectable !== false ? (
                  <button type="button" onClick={() => onSelect(r.key)}
                    className="-mx-2 block w-[calc(100%+1rem)] rounded-md px-2 py-1 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {content}
                  </button>
                ) : content}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
