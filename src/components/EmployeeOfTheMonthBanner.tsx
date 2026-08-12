import { useState } from "react";
import { X, ChevronRight, Award, Sparkles, Star, Trophy } from "lucide-react";
import badgeAsset from "@/assets/sabeel-khan-eom-badge.png.asset.json";
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

export function EmployeeOfTheMonthBanner() {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(() => !isDismissed());

  if (!visible) return null;

  return (
    <>
      <div className="relative z-30 w-full overflow-hidden border-b border-amber-400/30 bg-gradient-to-r from-amber-100 via-primary/10 to-amber-100 dark:from-amber-950/60 dark:via-primary/20 dark:to-amber-950/60">
        {/* celebratory background elements */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-[10%] top-[10%] h-2 w-2 rounded-full bg-amber-400/60" style={{ animation: "eom-sparkle 2.5s ease-in-out infinite" }} />
          <div className="absolute left-[20%] bottom-[20%] h-1.5 w-1.5 rounded-full bg-primary/60" style={{ animation: "eom-sparkle 2s ease-in-out infinite 0.5s" }} />
          <div className="absolute left-[60%] top-[20%] h-2 w-2 rounded-full bg-amber-300/60" style={{ animation: "eom-sparkle 3s ease-in-out infinite 1s" }} />
          <div className="absolute right-[15%] top-[30%] h-1.5 w-1.5 rounded-full bg-primary/60" style={{ animation: "eom-sparkle 2.5s ease-in-out infinite 0.3s" }} />
          <div className="absolute right-[25%] bottom-[25%] h-2 w-2 rounded-full bg-amber-400/60" style={{ animation: "eom-sparkle 2s ease-in-out infinite 0.8s" }} />
          {/* soft radial glows */}
          <div className="absolute -left-10 top-1/2 h-56 w-56 -translate-y-1/2 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute left-1/4 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-amber-400/20 blur-3xl" />
          <div className="absolute right-1/4 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-amber-300/15 blur-3xl" />
        </div>

        {/* top gold shimmer line */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] overflow-hidden">
          <div
            className="h-full w-1/3 bg-gradient-to-r from-transparent via-amber-400 to-transparent"
            style={{ animation: "eom-shimmer 3s ease-in-out infinite" }}
          />
        </div>

        {/* bottom wave */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2 bg-gradient-to-r from-transparent via-amber-400/30 to-transparent" />

        <style>{`
          @keyframes eom-shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(400%); }
          }
          @keyframes eom-pulse-glow {
            0%, 100% { opacity: 0.5; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.05); }
          }
          @keyframes eom-sparkle {
            0%, 100% { opacity: 0.2; transform: scale(0.8); }
            50% { opacity: 1; transform: scale(1.2); }
          }
          @keyframes eom-float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-4px); }
          }
          @keyframes eom-confetti {
            0% { transform: translateY(-10px) rotate(0deg); opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { transform: translateY(120px) rotate(360deg); opacity: 0; }
          }
        `}</style>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative flex w-full items-center gap-4 px-4 py-3 text-left md:gap-6 md:px-8 md:py-4"
        >
          {/* badge with celebratory glow */}
          <div className="relative shrink-0" style={{ animation: "eom-float 4s ease-in-out infinite" }}>
            <div
              className="absolute inset-0 rounded-full bg-amber-400/40 blur-xl"
              style={{ animation: "eom-pulse-glow 2.5s ease-in-out infinite" }}
            />
            <div className="relative h-24 w-24 overflow-hidden rounded-full border-4 border-amber-200/80 bg-background shadow-2xl ring-4 ring-amber-400/20 dark:border-amber-400/40 dark:bg-amber-950 md:h-32 md:w-32">
              <img
                src={badgeAsset.url}
                alt="Employee of the Month July 2026 — Sabeel Khan"
                className="h-full w-full object-cover"
              />
            </div>
            {/* floating stars */}
            <Star className="absolute -left-2 top-2 h-4 w-4 fill-amber-400 text-amber-400" style={{ animation: "eom-sparkle 2s ease-in-out infinite" }} />
            <Sparkles className="absolute -right-1 bottom-4 h-5 w-5 text-amber-400" style={{ animation: "eom-sparkle 2.5s ease-in-out infinite 0.5s" }} />
            <Award className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-amber-400 p-1 text-amber-950 shadow-lg md:h-8 md:w-8" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 md:text-xs">
                <Trophy className="h-3 w-3" />
                Employee of the Month
              </span>
              <span className="text-[10px] font-semibold text-amber-600/80 dark:text-amber-400/80 md:text-xs">
                July 2026
              </span>
            </div>
            <div className="mt-1 bg-gradient-to-r from-amber-600 via-primary to-amber-600 bg-clip-text text-xl font-bold tracking-tight text-transparent md:text-3xl">
              Sabeel Khan
            </div>
            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground md:text-sm">
              <span>Celebrating excellence and outstanding contribution</span>
              <ChevronRight className="h-3.5 w-3.5 text-amber-500" />
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
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-muted-foreground transition-colors hover:bg-amber-400/20 hover:text-foreground md:right-4"
        >
          <X className="h-4 w-4" />
        </button>
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

