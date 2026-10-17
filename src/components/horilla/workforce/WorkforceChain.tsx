import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { CHAIN_STEPS, REQUEST_STAGES, WF_WORDS, requestStage, type ChainFigure, type ChainStepKey, type GapParts } from "@/lib/hrms/workforceChain";
import { cn } from "@/lib/utils";

/**
 * The planning chain at the top of every Organization and Workforce Planning page: where this page sits,
 * what it receives and what it hands on. Static (no data), so it never waits on a query.
 */
export function WorkforceChainBand({ current, className }: { current: ChainStepKey; className?: string }) {
  const i = CHAIN_STEPS.findIndex((s) => s.key === current);
  const step = CHAIN_STEPS[i];
  const prev = CHAIN_STEPS[i - 1];
  const next = CHAIN_STEPS[i + 1];
  return (
    <nav aria-label="Workforce planning steps" className={cn("rounded-xl border border-border bg-card", className)}>
      {/* Laptops and up: the whole chain, six equal steps (labels wrap instead of scrolling). */}
      <ol className="hidden grid-cols-[repeat(6,minmax(0,1fr))] gap-1 px-1.5 py-1.5 lg:grid">
        {CHAIN_STEPS.map((s, k) => {
          const on = s.key === current;
          return (
            <li key={s.key} className="flex min-w-0 items-center gap-0.5">
              <Link to={s.to} aria-current={on ? "step" : undefined}
                className={cn("flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs leading-tight transition-colors xl:px-2.5 xl:text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
                  on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{s.n}</span>
                <span className="min-w-0">{s.label}</span>
              </Link>
              {k < CHAIN_STEPS.length - 1 && <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground/50 xl:block" aria-hidden />}
            </li>
          );
        })}
      </ol>
      {/* Phones and tablets: this step, with the steps either side. */}
      <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center gap-1 px-1.5 py-1.5 lg:hidden">
        {prev ? (
          <Link to={prev.to} aria-label={`Previous step: ${prev.label}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Link>
        ) : <span aria-hidden />}
        <p className="text-center text-sm">
          <span className="text-xs text-muted-foreground">Step {step.n} of {CHAIN_STEPS.length} · </span>
          <span className="font-semibold text-primary">{step.label}</span>
        </p>
        {next ? (
          <Link to={next.to} aria-label={`Next step: ${next.label}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : <span aria-hidden />}
      </div>
      <p className="border-t border-border px-3.5 py-2 text-xs leading-5 text-muted-foreground">
        {prev && <>Comes from <span className="font-medium text-foreground">{prev.label}</span>. </>}
        {step.what}{" "}
        <span className="font-medium text-foreground">{step.feeds}</span>
      </p>
    </nav>
  );
}

const FLAG_TONE: Record<string, string> = {
  danger: "bg-destructive/10 text-destructive ring-destructive/25",
  warning: "bg-warning/10 text-amber-700 ring-warning/30 dark:text-amber-400",
  ok: "bg-success/10 text-emerald-700 ring-success/25 dark:text-emerald-400",
};

/** Overview: the six steps with today's number each, and what each hands to the next. */
export function WorkforceChainMap({ figures }: { figures: ChainFigure[] }) {
  return (
    <section aria-label="The planning chain">
      <ol className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-[repeat(3,minmax(0,1fr))] xl:grid-cols-[repeat(6,minmax(0,1fr))]">
        {figures.map((f, k) => {
          const s = CHAIN_STEPS.find((x) => x.key === f.key)!;
          return (
            <li key={f.key} className="relative flex min-w-0 bg-card">
              <Link to={s.to}
                className="group flex min-w-0 flex-1 flex-col px-3.5 py-3 transition-colors hover:bg-muted/40 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <span className="flex items-center gap-1.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold tabular-nums text-primary">{s.n}</span>
                  <span className="truncate text-xs font-semibold text-foreground group-hover:text-primary">{s.label}</span>
                </span>
                <span className="mt-2 font-display text-[24px] font-semibold leading-7 tabular-nums text-foreground">
                  {f.value ?? <Skeleton className="h-7 w-12" />}
                </span>
                <span className="text-xs text-muted-foreground">{f.unit}</span>
                {f.detail && <span className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{f.detail}</span>}
                {f.flag && (
                  <span className={cn("mt-2 inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", FLAG_TONE[f.flag.tone])}>{f.flag.text}</span>
                )}
                {f.handoff && <span className="mt-auto pt-2 text-[11px] font-medium leading-4 text-primary">→ {f.handoff}</span>}
              </Link>
              {k < figures.length - 1 && (
                <span aria-hidden className="pointer-events-none absolute -right-2.5 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground xl:flex">
                  <ChevronRight className="h-3 w-3" />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

interface Bar { label: string; sub?: string; value: number; from: number; to: number; cls: string; indent?: boolean; word: keyof typeof WF_WORDS }

/** How the gap adds up, as a waterfall: required − on roll = short − on the way = still to find = in hiring + not requested yet. */
export function GapWaterfall({ parts, onExplain, nextReady, className }: { parts: GapParts; onExplain?: () => void; nextReady?: string | null; className?: string }) {
  const g = parts;
  const max = Math.max(1, g.required, g.onRoll);
  const pct = (n: number) => `${(Math.max(0, n) / max) * 100}%`;
  const base = g.filling;
  const findFrom = base + g.onTheWay;
  const bars: Bar[] = [
    { label: "Required", value: g.required, from: 0, to: g.required, cls: "bg-muted-foreground/35", word: "required" },
    { label: "On roll", value: g.onRoll, from: 0, to: g.filling, cls: "bg-success",
      sub: g.extra ? `${g.extra} extra on ${g.extra === 1 ? "a full line" : "full lines"}` : undefined, word: "onRoll" },
    { label: "Short", value: g.short, from: base, to: g.required, cls: "bg-destructive/30", word: "short" },
    { label: "On the way", value: g.onTheWay, from: base, to: findFrom, cls: "bg-sky-500",
      sub: g.onTheWay ? [g.training ? `${g.training} in training${nextReady ? `, ready ${nextReady}` : ""}` : null, g.joining ? `${g.joining} joining` : null].filter(Boolean).join(" · ") : undefined, word: "onTheWay" },
    { label: "Still to find", value: g.stillToFind, from: findFrom, to: g.required, cls: "bg-destructive", word: "stillToFind" },
    { label: "In hiring", value: g.inHiring, from: findFrom, to: findFrom + g.inHiring, cls: "bg-primary", indent: true, word: "inHiring" },
    { label: "Not requested yet", value: g.notRequested, from: findFrom + g.inHiring, to: g.required, cls: "bg-warning", indent: true, word: "notRequested" },
  ];
  return (
    <section aria-label="The gap, step by step" className={cn("rounded-xl border border-border bg-card", className)}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-3">
        <h2 className="font-display text-[15px] font-semibold text-foreground">The gap, step by step</h2>
        {onExplain && (
          <span role="button" tabIndex={0} onClick={onExplain} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onExplain(); } }}
            className="cursor-pointer rounded-sm text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            What the words mean
          </span>
        )}
      </header>
      <ul className="space-y-2.5 px-4 py-3">
        {bars.map((b) => (
          <li key={b.label} className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_2.25rem] items-center gap-x-3" title={WF_WORDS[b.word].text}>
            <span className={cn("min-w-0", b.indent && "pl-3")}>
              <span className={cn("block text-sm leading-5", b.indent ? "text-muted-foreground" : "font-medium text-foreground")}>{b.indent ? "↳ " : ""}{b.label}</span>
              {b.sub && <span className="block text-[11px] leading-4 text-muted-foreground">{b.sub}</span>}
            </span>
            <span className="relative h-4 overflow-hidden rounded bg-muted/50" aria-hidden>
              {b.to > b.from && <span className={cn("absolute inset-y-0 rounded", b.cls)} style={{ left: pct(b.from), width: pct(b.to - b.from) }} />}
              {b.word === "onRoll" && g.extra > 0 && (
                <span className="absolute inset-y-0 rounded bg-warning/80" style={{ left: pct(g.filling), width: pct(g.extra) }} />
              )}
            </span>
            <span className={cn("text-right text-sm font-semibold tabular-nums", b.word === "stillToFind" && b.value > 0 ? "text-destructive" : b.word === "notRequested" && b.value > 0 ? "text-warning" : "text-foreground")}>{b.value}</span>
          </li>
        ))}
      </ul>
      <div className="space-y-1 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
        <p>
          {g.required} required − {g.filling} filled by people on roll = <span className="font-medium text-foreground">{g.short} short</span>
          {g.onTheWay ? <> − {g.onTheWay} on the way = <span className="font-medium text-foreground">{g.stillToFind} still to find</span></> : null}.
          {" "}Every line is counted on its own: an extra person on one line never fills another line's gap.
        </p>
        {g.onTheWayExtra > 0 && <p>{g.onTheWayExtra} more in training or joining than their lines still need (not counted).</p>}
        {g.overRequested > 0 && <p>{g.overRequested} requested above what their lines still need (over-requested).</p>}
        {g.heldBack > 0 && <p>{g.heldBack} held back after HR declined part of an automatic request.</p>}
      </div>
    </section>
  );
}

/** The four stages a hiring request moves through, with this one's place (statuses change only through approval actions). */
export function RequestStages({ status, className }: { status: string; className?: string }) {
  const s = requestStage(status);
  if (s.side) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        {s.side === "draft" ? "Draft — not sent for approval yet, so it covers nothing."
          : `${s.side === "rejected" ? "Rejected" : "Cancelled"} — off the hiring path. Reopen it as a draft to use it again.`}
      </p>
    );
  }
  return (
    <ol aria-label="Request stages" className={cn("grid grid-cols-[repeat(4,minmax(0,1fr))] gap-1.5", className)}>
      {REQUEST_STAGES.map((label, i) => (
        <li key={label} aria-current={i === s.index ? "step" : undefined} className="min-w-0">
          <span aria-hidden className={cn("block h-1.5 rounded-full", i <= s.index ? "bg-primary" : "bg-muted")} />
          <span className={cn("mt-1 block text-[11px] leading-tight", i === s.index ? "font-semibold text-foreground" : "text-muted-foreground")}>{label}</span>
        </li>
      ))}
    </ol>
  );
}

/** Loading placeholder for the chain map. */
export function WorkforceChainMapSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-[repeat(3,minmax(0,1fr))] xl:grid-cols-[repeat(6,minmax(0,1fr))]">
      {CHAIN_STEPS.map((s) => (
        <div key={s.key} className="bg-card px-3.5 py-3"><Skeleton className="h-4 w-24" /><Skeleton className="mt-3 h-7 w-14" /><Skeleton className="mt-2 h-3 w-28" /></div>
      ))}
    </div>
  );
}
