import { useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CHAIN_STEPS, WF_RULES, WF_WORDS, type ChainStepKey } from "@/lib/hrms/workforceChain";
import { cn } from "@/lib/utils";

/** "How it works": the chain, the words for every number and the rules the system applies, in one place. */
export function HowItWorksButton({ current, className }: { current?: ChainStepKey; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" className={className} onClick={() => setOpen(true)}>
        <BookOpen className="h-4 w-4" /> How it works
      </Button>
      <HowItWorksSheet open={open} onOpenChange={setOpen} current={current} />
    </>
  );
}

export function HowItWorksSheet({ open, onOpenChange, current }: { open: boolean; onOpenChange: (o: boolean) => void; current?: ChainStepKey }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl"
        onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement | null)?.focus?.(); }} tabIndex={-1}>
        <SheetHeader className="space-y-1 border-b border-border px-5 py-4 text-left">
          <SheetTitle className="pr-6 text-lg leading-tight">How workforce planning works</SheetTitle>
          <SheetDescription className="text-sm">From a designation to a person on roll, in six linked steps. Every number on these pages comes from this chain.</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-5 py-4">
          <section aria-label="The six steps" className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">The six steps</h3>
            <ol className="space-y-0">
              {CHAIN_STEPS.map((s, i) => {
                const on = s.key === current;
                return (
                  <li key={s.key} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3">
                    <span className="flex flex-col items-center">
                      <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                        on ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary")}>{s.n}</span>
                      {i < CHAIN_STEPS.length - 1 && <span aria-hidden className="w-px flex-1 bg-border" />}
                    </span>
                    <div className={cn("min-w-0 pb-4", on && "rounded-lg")}>
                      <p className="flex flex-wrap items-baseline gap-x-2 pt-1">
                        <Link to={s.to} onClick={() => onOpenChange(false)}
                          className="rounded-sm text-sm font-semibold text-foreground underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          {s.label}
                        </Link>
                        <span className="text-[11px] text-muted-foreground">{s.where}</span>
                        {on && <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-semibold text-primary">You are here</span>}
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground">{s.what}</p>
                      <p className="mt-1 text-xs font-medium text-primary">→ {s.feeds}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              The chain closes the loop: a person who joins counts on roll on their line, the line's gap shrinks, and its hiring request fills by itself.
            </p>
          </section>

          <section aria-label="The numbers" className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">The numbers</h3>
            <p className="rounded-lg border border-border px-3 py-2 text-sm text-foreground">
              Required − on roll = <b>short</b> &nbsp;·&nbsp; short − on the way = <b>still to find</b> &nbsp;·&nbsp; still to find = <b>in hiring</b> + <b>not requested yet</b>
            </p>
            <dl className="divide-y divide-border rounded-lg border border-border">
              {Object.values(WF_WORDS).map((w) => (
                <div key={w.term} className="grid gap-x-3 px-3 py-2 sm:grid-cols-[8rem_minmax(0,1fr)]">
                  <dt className="text-sm font-medium text-foreground">{w.term}</dt>
                  <dd className="text-sm text-muted-foreground">{w.text}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-label="What the system does for you" className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What the system does for you</h3>
            <ul className="space-y-2">
              {WF_RULES.map((r) => (
                <li key={r.title} className="rounded-lg border border-border px-3 py-2">
                  <p className="text-sm font-medium text-foreground">{r.title}</p>
                  <p className="text-sm text-muted-foreground">{r.text}</p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Words used" className="space-y-1.5 pb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Other words</h3>
            <p className="text-sm text-muted-foreground"><b className="font-medium text-foreground">Designation</b> — a job title such as Operations Associate (stored as a position).</p>
            <p className="text-sm text-muted-foreground"><b className="font-medium text-foreground">Staffing line</b> — one designation (or a few sharing one target) in one shift.</p>
            <p className="text-sm text-muted-foreground"><b className="font-medium text-foreground">Desk group</b> — desks used by one or more designations; training seats are separate.</p>
            <p className="text-sm text-muted-foreground"><b className="font-medium text-foreground">Hiring request</b> — a request to hire for a line, raised automatically from its gap or by hand.</p>
            <p className="text-sm text-muted-foreground">Click any designation's name to follow it through every step.</p>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
