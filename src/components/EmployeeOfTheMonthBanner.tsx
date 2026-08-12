import { useState } from "react";
import { X, ChevronRight, Sparkles, Star } from "lucide-react";
import badgeAsset from "@/assets/sabeel-khan-eom-badge.png.asset.json";
import posterAsset from "@/assets/sabeel-khan-eom-poster.jpeg.asset.json";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/** Bump this key whenever a new Employee of the Month is announced. */
const EOM_KEY = "eom-banner:2026-07";
const DISMISS_HOURS = 24;

function isDismissed() {
  try {
    const raw = localStorage.getItem(EOM_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < DISMISS_HOURS * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

const SPARKS = [
  { cls: "top-4 left-[20%] h-1 w-1 bg-foreground/70", delay: "0s" },
  { cls: "bottom-6 left-[45%] h-1.5 w-1.5 bg-primary/80", delay: "2s" },
  { cls: "top-8 right-[28%] h-1 w-1 bg-primary/60", delay: "4s" },
  { cls: "bottom-8 right-[12%] h-1 w-1 bg-foreground/50", delay: "1.2s" },
];

export function EmployeeOfTheMonthBanner() {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(() => !isDismissed());

  if (!visible) return null;

  return (
    <>
      <div className="relative z-30 w-full px-3 pt-3 md:px-6">
        <style>{`
          @keyframes eom-mesh { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
          @keyframes eom-spark { 0%,100%{transform:translateY(0) scale(1);opacity:.25} 50%{transform:translateY(-14px) scale(1.25);opacity:.7} }
          .eom-mesh { background-size:200% 200%; animation: eom-mesh 12s ease infinite; }
          .eom-spark { animation: eom-spark 6s ease-in-out infinite; }
        `}</style>

        <div className="group relative flex items-center overflow-hidden rounded-2xl border border-border/60 bg-card/50 px-4 py-4 shadow-2xl backdrop-blur-2xl transition-all duration-500 hover:border-border md:px-8">
          {/* ambient layers */}
          <div className="eom-mesh pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/25 via-accent/15 to-primary/20 opacity-70" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.18),transparent_60%)]" />
          {SPARKS.map((s, i) => (
            <span
              key={i}
              className={`eom-spark pointer-events-none absolute rounded-full blur-[1px] ${s.cls}`}
              style={{ animationDelay: s.delay }}
            />
          ))}

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="relative z-10 flex w-full items-center gap-4 pr-10 text-left md:gap-8"
          >
            {/* portrait */}
            <div className="relative shrink-0">
              <div className="absolute -inset-1.5 rounded-full bg-gradient-to-tr from-primary to-accent opacity-20 blur-md transition-opacity duration-700 group-hover:opacity-45" />
              <div className="relative h-16 w-16 rounded-full bg-gradient-to-tr from-primary/50 via-accent/50 to-primary/40 p-1 md:h-20 md:w-20">
                <div className="h-full w-full overflow-hidden rounded-full bg-muted ring-1 ring-border">
                  <img
                    src={badgeAsset.url}
                    alt="Employee of the Month July 2026 — Sabeel Khan"
                    className="h-full w-full scale-105 object-contain"
                  />
                </div>
              </div>
              <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-primary shadow-xl">
                <Sparkles className="h-4 w-4" />
              </div>
            </div>

            {/* content */}
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2 md:gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/25 bg-primary/10 px-2.5 py-0.5">
                  <Star className="h-3 w-3 fill-primary text-primary" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                    Employee of the Month
                  </span>
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  July 2026
                </span>
              </div>

              <div className="flex flex-col gap-1 transition-transform duration-500 group-hover:translate-x-1 md:flex-row md:items-baseline md:gap-3">
                <h2 className="truncate text-xl font-bold tracking-tight text-foreground md:text-2xl">
                  Sabeel Khan
                </h2>
                <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground md:text-sm">
                  <span className="truncate">
                    Congratulations! Celebrating outstanding performance and dedication
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-primary/70" />
                </p>
              </div>
            </div>
          </button>

          <button
            type="button"
            aria-label="Dismiss announcement"
            onClick={() => {
              try {
                localStorage.setItem(EOM_KEY, String(Date.now()));
              } catch {
                /* ignore */
              }
              setVisible(false);
            }}
            className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-lg bg-foreground/5 p-2 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground md:right-5"
          >
            <X className="h-4 w-4 md:h-5 md:w-5" />
          </button>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md overflow-hidden p-0">
          <img
            src={badgeAsset.url}
            alt="Employee of the Month July 2026 — Sabeel Khan"
            className="h-auto w-full"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
