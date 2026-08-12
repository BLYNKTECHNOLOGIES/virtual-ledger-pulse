import { useState } from "react";
import { X, ChevronRight, Award } from "lucide-react";
import eomAsset from "@/assets/eom-july-2026.jpeg.asset.json";
import badgeAsset from "@/assets/sabeel-eom-badge.png.asset.json";
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
      <div className="relative z-30 w-full overflow-hidden border-b border-primary/25 bg-gradient-to-r from-primary/15 via-background to-amber-400/10">
        {/* soft radial glow behind the badge */}
        <div className="pointer-events-none absolute -left-10 top-1/2 h-48 w-48 -translate-y-1/2 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute left-1/3 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-amber-400/15 blur-3xl" />

        {/* top shimmer line */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] overflow-hidden">
          <div
            className="h-full w-1/3 bg-gradient-to-r from-transparent via-primary/60 to-transparent"
            style={{ animation: "eom-shimmer 3s ease-in-out infinite" }}
          />
        </div>

        <style>{`
          @keyframes eom-shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(400%); }
          }
          @keyframes eom-pulse-glow {
            0%, 100% { opacity: 0.6; }
            50% { opacity: 1; }
          }
        `}</style>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative flex w-full items-center gap-4 px-4 py-3 text-left md:gap-6 md:px-8 md:py-4"
        >
          {/* badge image */}
          <div className="relative shrink-0">
            <div
              className="absolute inset-0 rounded-2xl bg-primary/30 blur-md"
              style={{ animation: "eom-pulse-glow 2.5s ease-in-out infinite" }}
            />
            <img
              src={badgeAsset.url}
              alt="Employee of the Month July 2026 — Sabeel Khan"
              className="relative h-20 w-auto rounded-2xl border-2 border-background/80 bg-background shadow-xl md:h-28"
            />
            <Award className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-primary p-1 text-primary-foreground shadow-md md:h-7 md:w-7" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary md:text-xs">
                Employee of the Month
              </span>
              <span className="text-[10px] font-medium text-muted-foreground md:text-xs">
                July 2026
              </span>
            </div>
            <div className="mt-1 text-lg font-semibold tracking-tight text-foreground md:text-2xl">
              Sabeel Khan
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground md:text-sm">
              <span>Recognized for outstanding performance</span>
              <ChevronRight className="h-3.5 w-3.5 text-primary" />
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
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground md:right-4"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md overflow-hidden p-0">
          <img
            src={eomAsset.url}
            alt="Employee of the Month July 2026 — Sabeel Khan"
            className="h-auto w-full"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
