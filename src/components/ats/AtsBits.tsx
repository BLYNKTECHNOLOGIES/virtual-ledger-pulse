import { useState, type KeyboardEvent, type ReactNode } from "react";
import { CheckCircle2, Circle, PauseCircle, XCircle, X, Check, ChevronsUpDown, ChevronRight } from "lucide-react";
import { StatusPill, type StatusTone } from "./AtsUi";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/ErrorState";

const JOB_STATUS: Record<string, { label: string; icon: typeof Circle; tone: StatusTone }> = {
  open: { label: "Open", icon: CheckCircle2, tone: "success" },
  draft: { label: "Draft", icon: Circle, tone: "neutral" },
  paused: { label: "Paused", icon: PauseCircle, tone: "warning" },
  closed: { label: "Closed", icon: XCircle, tone: "neutral" },
};

export function JobStatusBadge({ status }: { status: string }) {
  const s = JOB_STATUS[status] ?? { label: "Unknown", icon: Circle, tone: "neutral" as const };
  return <StatusPill tone={s.tone} icon={s.icon}>{s.label}</StatusPill>;
}

export function BarList({ rows, emptyText, onRowClick }: { rows: { key: string; label: string; count: number; barClassName?: string }[]; emptyText: string; onRowClick?: (key: string) => void }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (!rows.length || rows.every((r) => r.count === 0)) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key}>
          {(() => {
            const inner = (
              <>
                <span className="truncate text-muted-foreground" title={r.label}>{r.label}</span>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all motion-reduce:transition-none", r.barClassName ?? "bg-primary")} style={{ width: `${(r.count / max) * 100}%` }} />
                </div>
                <span className="text-right font-semibold tabular-nums text-foreground">{r.count}</span>
              </>
            );
            const cls = "grid w-full grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)_2.5rem] items-center gap-3 text-sm";
            return onRowClick ? (
              <Button variant="ghost" onClick={() => onRowClick(r.key)} className={`${cls} -mx-2 h-auto w-[calc(100%+1rem)] grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)_2.5rem_0.875rem] rounded-lg px-2 py-1.5 text-left font-normal hover:bg-muted/50`}>{inner}<ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /></Button>
            ) : <div className={cls}>{inner}</div>;
          })()}
        </li>
      ))}
    </ul>
  );
}

export function SectionCard({ title, description, children, action, className }: { title: ReactNode; description?: ReactNode; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-4 sm:p-5", className)}>
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="min-w-0"><h2 className="font-display text-[15px] font-semibold leading-6 text-foreground">{title}</h2>
        {description && <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function RowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
    </div>
  );
}

export function QueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return <ErrorState title="Couldn't load this" description="Please try again." error={error} onRetry={onRetry} />;
}

export function ChipInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim();
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t]);
    setDraft("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
    else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
  };
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring">
      {value.map((v) => (
        <Badge key={v} variant="secondary" className="gap-1">
          {v}
          <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))} className="rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={add}
        placeholder={value.length ? "" : placeholder}
        className="min-w-[8rem] flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

export function MultiSelect({ options, value, onChange, placeholder }: { options: { id: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [q, setQ] = useState("");
  const selected = options.filter((o) => value.includes(o.id));
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="h-auto min-h-10 w-full justify-between font-normal text-foreground">
          <span className="truncate text-left">{selected.length ? selected.map((s) => s.label).join(", ") : <span className="text-muted-foreground">{placeholder}</span>}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-2" align="start">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="mb-2 h-8 text-foreground" />
        <div className="max-h-56 overflow-y-auto">
          {shown.length === 0 && <p className="p-2 text-sm text-muted-foreground">Nothing found.</p>}
          {shown.map((o) => {
            const on = value.includes(o.id);
            return (
              <button
                type="button"
                key={o.id}
                onClick={() => onChange(on ? value.filter((x) => x !== o.id) : [...value, o.id])}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              >
                <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border border-primary", on && "bg-primary text-primary-foreground")}>
                  {on && <Check className="h-3 w-3" />}
                </span>
                <span className="truncate">{o.label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
