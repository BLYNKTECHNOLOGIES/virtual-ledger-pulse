import { Fragment, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, CheckCircle2, ChevronRight } from "lucide-react";
import { REQUEST_STAGES, WF_WORDS, requestStage, type ChainStepKey, type GapParts } from "@/lib/hrms/workforceChain";
import { HowItWorksSheet } from "./HowItWorks";
import { cn } from "@/lib/utils";

export type WorkforceTabKey = "overview" | "desks" | "lines" | "hiring" | "forecast";

/** The Workforce Planning pages, in the order the work flows: desks set the lines, short lines raise requests, the forecast looks ahead. */
const TABS: { key: WorkforceTabKey; label: string; to: string; step?: ChainStepKey }[] = [
  { key: "overview", label: "Overview", to: "/hrms/workforce-planning" },
  { key: "desks", label: "Desks", to: "/hrms/workforce-planning/capacity-seats", step: "desks" },
  { key: "lines", label: "Staffing plan", to: "/hrms/workforce-planning/staffing-plan", step: "lines" },
  { key: "hiring", label: "Hiring requests", to: "/hrms/workforce-planning/hiring-requirements", step: "hiring" },
  { key: "forecast", label: "Forecast", to: "/hrms/workforce-planning/forecast", step: "forecast" },
];

/**
 * One quiet row of page tabs on every Workforce Planning page. The arrows between Desks › Staffing plan ›
 * Hiring requests › Forecast show the order the numbers flow in; "How it works" explains it in one place.
 */
export function WorkforceTabs({ current, className }: { current: WorkforceTabKey; className?: string }) {
  const [explain, setExplain] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);
  // Narrow screens scroll the tabs sideways: bring the current page's tab into view (without moving the page).
  useEffect(() => {
    const nav = navRef.current;
    const on = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !on || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollLeft = Math.max(0, on.offsetLeft - nav.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2);
  }, [current]);
  const step = TABS.find((t) => t.key === current)?.step;
  const openHelp = () => setExplain(true);
  return (
    <div className={cn("flex items-end gap-2 border-b border-border", className)}>
      <nav ref={navRef} aria-label="Workforce planning pages" className="-mb-px flex min-w-0 flex-1 items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t, i) => {
          const on = t.key === current;
          return (
            <Fragment key={t.key}>
              {i === 1 && <span aria-hidden className="mx-1.5 h-4 w-px shrink-0 bg-border" />}
              {i > 1 && <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />}
              <Link to={t.to} aria-current={on ? "page" : undefined}
                className={cn("shrink-0 whitespace-nowrap border-b-2 px-2.5 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  on ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                {t.label}
              </Link>
            </Fragment>
          );
        })}
        {/* Phones: the help link scrolls with the tabs. */}
        <span role="button" tabIndex={0} onClick={openHelp} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openHelp(); } }}
          className="ml-3 inline-flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-sm py-2.5 pr-1 text-sm text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden">
          <BookOpen className="h-3.5 w-3.5" aria-hidden /> How it works
        </span>
      </nav>
      <span role="button" tabIndex={0} onClick={openHelp} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openHelp(); } }}
        className="mb-2 hidden shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex">
        <BookOpen className="h-3.5 w-3.5" aria-hidden /> How it works
      </span>
      <HowItWorksSheet open={explain} onOpenChange={setExplain} current={step} />
    </div>
  );
}

interface StatusProps {
  parts: GapParts;
  /** Lines with fewer people on roll than they require. */
  shortLines: number;
  /** The same lines at the end of the forecast horizon (approved hiring, trainees and known exits). */
  forecast?: { closing: number; required: number; lineGap: number; endLabel: string } | null;
  /** The forecast's events couldn't load (say so instead of leaving the space empty). */
  forecastError?: boolean;
  leaving?: number | null;
  /** Earliest date someone in training is ready, for the "on the way" hint. */
  nextReady?: string | null;
  filtered?: boolean;
  className?: string;
}

/**
 * The answer to "are we staffed?" in one card: how many people short, and one bar that splits the required
 * places into filled, on the way, in hiring and not requested yet (the four always add up to Required).
 */
export function StaffingStatusCard({ parts: g, shortLines, forecast, forecastError, leaving, nextReady, filtered, className }: StatusProps) {
  const total = Math.max(1, g.required);
  const wayTip = [g.training ? `${g.training} in training${nextReady ? `, ready ${nextReady}` : ""}` : null, g.joining ? `${g.joining} hired and joining` : null]
    .filter(Boolean).join(" · ");
  const segs = [
    { key: "filled", label: "filled", value: g.filling, cls: "bg-success", tip: "People on roll in a place their line requires." },
    { key: "way", label: "on the way", value: g.onTheWay, cls: "bg-success/40", tip: wayTip || WF_WORDS.onTheWay.text },
    { key: "hiring", label: "in hiring", value: g.inHiring, cls: "bg-primary", tip: WF_WORDS.inHiring.text },
    { key: "not", label: "not requested yet", value: g.notRequested, cls: "bg-warning", tip: WF_WORDS.notRequested.text },
  ];
  const shown = segs.filter((s) => s.value > 0 || s.key === "filled");
  return (
    <section aria-label="Staffing today" className={cn("rounded-xl border border-border bg-card p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          {g.short > 0 ? (
            <p className="font-display text-[28px] font-semibold leading-8 text-foreground">
              <span className="tabular-nums text-destructive">{g.short}</span> {g.short === 1 ? "person" : "people"} short
            </p>
          ) : (
            <p className="flex items-center gap-2 font-display text-[28px] font-semibold leading-8 text-foreground">
              <CheckCircle2 className="h-6 w-6 text-success" aria-hidden /> Fully staffed
            </p>
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            {g.filling} of {g.required} places filled{g.lines ? ` · ${shortLines} of ${g.lines} line${g.lines === 1 ? "" : "s"} short` : ""}{filtered ? " · filtered" : ""}
          </p>
        </div>
        {!forecast && forecastError && (
          <Link to="/hrms/workforce-planning/forecast" className="rounded-lg px-1 text-xs text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            The forecast couldn't load. Open the Forecast
          </Link>
        )}
        {forecast && (
          <Link to="/hrms/workforce-planning/forecast"
            className="group rounded-lg px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="block text-xs text-muted-foreground">By {forecast.endLabel}</span>
            <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground group-hover:text-primary">
              {forecast.lineGap > 0 ? `${forecast.lineGap} short with the hiring approved now` : "On track with the hiring approved now"}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </span>
            {leaving ? <span className="block text-xs text-muted-foreground">{leaving} leaving on notice</span> : null}
          </Link>
        )}
      </div>

      <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-muted" role="img"
        aria-label={`Of ${g.required} required: ${g.filling} filled, ${g.onTheWay} on the way, ${g.inHiring} in hiring, ${g.notRequested} not requested yet`}>
        {segs.filter((s) => s.value > 0).map((s) => (
          <span key={s.key} className={cn("h-full first:rounded-l-full last:rounded-r-full", s.cls)} style={{ width: `${(s.value / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
        {shown.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1.5" title={s.tip}>
            <span aria-hidden className={cn("h-2.5 w-2.5 shrink-0 rounded-full", s.cls)} />
            <span className="font-semibold tabular-nums text-foreground">{s.value}</span>
            <span className="text-muted-foreground">{s.label}</span>
          </li>
        ))}
        {g.stillToFind > 0 && g.notRequested === 0 && <li className="text-xs font-medium text-success">Everything still to find is requested</li>}
      </ul>
      {(g.extra > 0 || g.heldBack > 0 || g.onTheWayExtra > 0 || g.overRequested > 0) && (
        <p className="mt-3 text-xs text-muted-foreground">
          {[
            g.extra > 0 ? `${g.extra} more ${g.extra === 1 ? "person is" : "people are"} on roll on lines that are already full; they don't fill other lines.` : null,
            g.onTheWayExtra > 0 ? `${g.onTheWayExtra} more in training or joining than their lines still need (not counted).` : null,
            g.overRequested > 0 ? `${g.overRequested} requested above what their lines still need (over-requested).` : null,
            g.heldBack > 0 ? `${g.heldBack} held back after HR declined part of an automatic request.` : null,
          ].filter(Boolean).join(" ")}
        </p>
      )}
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
