import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getActivityLabel } from "@/lib/hrms/statusVocabulary";
import type { StationStatus } from "./RoadmapStation";
import {
  ArrowRight, CalendarClock, CheckCircle2, Sparkles, Clock,
  Users, ShieldCheck, KeyRound, Landmark, ReceiptText,
  SendHorizonal, Calculator, Wallet, FileDown, BookCheck,
} from "lucide-react";

type Step = { letter: string; title: string; status: StationStatus };

interface Props {
  steps: Step[];
  onJumpToStation: (letter: string) => void;
}

// Plain-English copy per station — the "Today's Focus" narrative.
const COPY: Record<string, {
  headline: string;
  helper: string;
  cta: string;
  icon: React.ComponentType<{ className?: string }>;
  rail: "setup" | "monthly";
}> = {
  A: { headline: "Refresh employee details from RazorpayX", helper: "One-time · pulls the latest info without overwriting anything HR has entered.", cta: "Start refresh", icon: Users, rail: "setup" },
  B: { headline: "Check what your RazorpayX account can do", helper: "One-time · quick read-only test of allowed actions.", cta: "Run check", icon: ShieldCheck, rail: "setup" },
  C: { headline: "Update employee name & contact on RazorpayX", helper: "One-time · preview, try one, then send all.", cta: "Open Step C", icon: KeyRound, rail: "setup" },
  D: { headline: "Update bank & PAN on RazorpayX", helper: "One-time · masked numbers, needs your confirmation each time.", cta: "Open Step D", icon: Landmark, rail: "setup" },
  E: { headline: "Update salary break-up on RazorpayX", helper: "One-time · set structure name, try one, then everyone.", cta: "Open Step E", icon: ReceiptText, rail: "setup" },
  F: { headline: "Send this month's attendance & unpaid leaves", helper: "Monthly · HRMS totals working days, present days and LOP, then sends them for salary calculation.", cta: "Send attendance", icon: SendHorizonal, rail: "monthly" },
  G: { headline: "Run this month's salary", helper: "Monthly · calculate → practice run → try one → run for everyone.", cta: "Open payroll run", icon: Calculator, rail: "monthly" },
  H: { headline: "Check that salaries were paid", helper: "Monthly · read-only compare of RazorpayX payouts vs HRMS records.", cta: "Verify payouts", icon: Wallet, rail: "monthly" },
  I: { headline: "Download payslips & tax papers", helper: "Monthly · payslips, Form 16 and TDS statements from RazorpayX.", cta: "Open downloads", icon: FileDown, rail: "monthly" },
  J: { headline: "Match with accounting books", helper: "Monthly · compare salary expense with ledger and bank statement.", cta: "Reconcile", icon: BookCheck, rail: "monthly" },
};

type Activity = { at: string; action: string; label: string };

function timeAgo(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const s = Math.max(1, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

/**
 * Nudge is derived from the focused step (not calendar day alone) so the
 * pill and the focus card speak with one voice. If the calendar timing is
 * clearly off for that step, we suppress the nudge instead of contradicting.
 */
function nudgeForStep(letter: string | undefined): { period: string; nudge: string | null } {
  const today = new Date();
  const day = today.getDate();
  const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const period = prev.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  if (!letter) return { period, nudge: null };

  switch (letter) {
    case "F": // Send attendance — early-month task
      return { period, nudge: day <= 7
        ? `Early ${today.toLocaleDateString(undefined, { month: "long" })} — a good time to send ${period} attendance.`
        : `${period} attendance is still pending — send it to unlock the salary run.` };
    case "G": // Run payroll
      return { period, nudge: `Ready to run ${period} salary. Calculate → practice → pilot → all.` };
    case "H": // Verify payouts
      return { period, nudge: `${period} salaries sent — verify the payouts landed correctly.` };
    case "I": // Download papers
      return { period, nudge: `Payslips and tax papers for ${period} are ready to download.` };
    case "J": // Reconcile
      return { period, nudge: `Match ${period} salary expense with your books.` };
    default:
      return { period, nudge: null };
  }
}

export function TodaysFocusHero({ steps, onJumpToStation }: Props) {
  const [recent, setRecent] = useState<Activity[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("hr_razorpay_sync_log")
        .select("action, created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      if (cancelled || !data) return;
      setRecent(
        (data as any[]).map((r) => ({
          at: r.created_at as string,
          action: r.action as string,
          label: getActivityLabel(r.action as string),
        }))
      );
    })();
    return () => { cancelled = true; };
  }, []);

  // Priority: blocked/attention states must outrank active/ready so a broken
  // pipeline never renders as "all caught up". "allDone" only fires when
  // every station is genuinely done — anything blocked keeps us honest.
  const blocked = steps.find((s) => s.status === "blocked" || s.status === "attention" || s.status === "error");
  const next = blocked
    ?? steps.find((s) => s.status === "active")
    ?? steps.find((s) => s.status === "ready");

  const allDone = !blocked && steps.length > 0 && steps.every((s) => s.status === "done");
  const { period, nudge } = nudgeForStep(next?.letter);

  if (allDone) {
    return (
      <Card className="border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 via-emerald-500/[0.04] to-transparent overflow-hidden">
        <CardContent className="py-5 px-5 flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400">
              All caught up
            </div>
            <div className="text-lg font-semibold mt-0.5">{period} payroll is complete</div>
            <div className="text-sm text-muted-foreground mt-0.5">
              Nothing needs your attention today. Check back next month or open Advanced view for auditing.
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const copy = next ? COPY[next.letter] : undefined;
  const Icon = copy?.icon ?? Sparkles;
  const isMonthly = copy?.rail === "monthly";

  return (
    <div className="space-y-3">
      {/* Hero */}
      <Card
        className={cn(
          "relative overflow-hidden border-2 shadow-lg",
          isMonthly
            ? "border-primary/40 bg-gradient-to-br from-primary/10 via-primary/[0.03] to-transparent"
            : "border-amber-500/40 bg-gradient-to-br from-amber-500/10 via-amber-500/[0.03] to-transparent"
        )}
      >
        {/* Subtle corner glow */}
        <div
          aria-hidden
          className={cn(
            "absolute -top-16 -right-16 h-40 w-40 rounded-full blur-3xl opacity-40",
            isMonthly ? "bg-primary" : "bg-amber-500"
          )}
        />
        <CardContent className="py-5 px-5 sm:py-6 sm:px-6 relative">
          <div className="flex items-start gap-4">
            <div
              className={cn(
                "h-12 w-12 sm:h-14 sm:w-14 rounded-xl flex items-center justify-center shrink-0",
                isMonthly ? "bg-primary/15 text-primary" : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
              )}
            >
              <Icon className="h-6 w-6 sm:h-7 sm:w-7" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-[0.16em]",
                    isMonthly ? "text-primary" : "text-amber-700 dark:text-amber-400"
                  )}
                >
                  {isMonthly ? "This month's task" : "Set up once"}
                </span>
                {next && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    Step {next.letter}
                  </span>
                )}
              </div>
              <div className="text-lg sm:text-xl font-bold mt-1 leading-tight">
                {copy?.headline ?? next?.title ?? "Nothing to do right now"}
              </div>
              <div className="text-xs sm:text-sm text-muted-foreground mt-1.5 leading-relaxed">
                {copy?.helper}
              </div>
              {isMonthly && nudge && (
                <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground bg-background/60 border border-border/60 rounded-full px-2 py-1">
                  <CalendarClock className="h-3 w-3" />
                  <span>{nudge}</span>
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            {next && (
              <Button
                size="lg"
                onClick={() => onJumpToStation(next.letter)}
                className={cn(
                  "font-semibold shadow-md",
                  isMonthly
                    ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                    : "bg-amber-600 hover:bg-amber-600/90 text-white dark:bg-amber-500 dark:hover:bg-amber-500/90"
                )}
              >
                {copy?.cta ?? "Continue"} <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}
            <span className="text-[11px] text-muted-foreground">
              or scroll down for the full journey
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Recent activity strip */}
      {recent.length > 0 && (
        <Card className="border-border/60">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Recent activity
              </div>
            </div>
            <ul className="space-y-1.5">
              {recent.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={cn(
                        "h-1.5 w-1.5 rounded-full shrink-0",
                        r.action === "apply_error" ? "bg-destructive" : "bg-emerald-500"
                      )}
                    />
                    <span className="truncate">{r.label}</span>
                  </div>
                  <span className="text-muted-foreground shrink-0 tabular-nums">{timeAgo(r.at)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
