import { useState } from "react";
import { X, ChevronRight, Sparkles, Trophy, PartyPopper } from "lucide-react";
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

const CONFETTI = [
  { left: "8%", delay: "0s", dur: "5s", cls: "bg-amber-400" },
  { left: "18%", delay: "1.2s", dur: "6s", cls: "bg-primary" },
  { left: "31%", delay: "2.4s", dur: "5.5s", cls: "bg-amber-300" },
  { left: "44%", delay: "0.6s", dur: "6.5s", cls: "bg-primary/70" },
  { left: "57%", delay: "3s", dur: "5s", cls: "bg-amber-400" },
  { left: "69%", delay: "1.8s", dur: "6s", cls: "bg-amber-500" },
  { left: "81%", delay: "0.3s", dur: "5.5s", cls: "bg-primary" },
  { left: "92%", delay: "2.1s", dur: "6.2s", cls: "bg-amber-300" },
];

export function EmployeeOfTheMonthBanner() {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(() => !isDismissed());

  if (!visible) return null;

  return (
    <>
      <div className="relative z-30 w-full overflow-hidden border-b border-amber-500/40 bg-[linear-gradient(110deg,hsl(var(--primary)/0.18)_0%,hsl(38_92%_60%/0.28)_38%,hsl(45_95%_70%/0.35)_58%,hsl(var(--primary)/0.18)_100%)]">
        <style>{`
          @keyframes eom-shimmer { 0% { transform: translateX(-120%); } 100% { transform: translateX(520%); } }
          @keyframes eom-pulse-glow { 0%,100% { opacity:.45; transform:scale(1);} 50% { opacity:.95; transform:scale(1.08);} }
          @keyframes eom-sparkle { 0%,100% { opacity:.15; transform:scale(.7);} 50% { opacity:1; transform:scale(1.25);} }
          @keyframes eom-float { 0%,100% { transform:translateY(0);} 50% { transform:translateY(-5px);} }
          @keyframes eom-confetti { 0% { transform:translateY(-16px) rotate(0deg); opacity:0;} 12% { opacity:.9;} 88% { opacity:.9;} 100% { transform:translateY(150px) rotate(420deg); opacity:0;} }
          @keyframes eom-rotate { to { transform: rotate(360deg); } }
        `}</style>

        {/* ambient glows */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-16 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-amber-400/25 blur-3xl" />
          <div className="absolute left-1/3 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-primary/15 blur-3xl" />
          <div className="absolute right-0 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-amber-300/20 blur-3xl" />
        </div>

        {/* confetti */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {CONFETTI.map((c, i) => (
            <span
              key={i}
              className={`absolute top-0 h-2 w-1 rounded-[1px] ${c.cls}`}
              style={{ left: c.left, animation: `eom-confetti ${c.dur} linear infinite`, animationDelay: c.delay }}
            />
          ))}
        </div>

        {/* gold top line + shimmer */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-amber-500/0 via-amber-500 to-amber-500/0">
          <div
            className="h-full w-1/4 bg-gradient-to-r from-transparent via-white/90 to-transparent"
            style={{ animation: "eom-shimmer 3.5s ease-in-out infinite" }}
          />
        </div>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group relative flex w-full items-center gap-4 px-4 py-4 pr-12 text-left md:gap-7 md:px-8 md:py-5"
        >
          {/* badge */}
          <div className="relative shrink-0" style={{ animation: "eom-float 4s ease-in-out infinite" }}>
            <div
              className="absolute -inset-2 rounded-full bg-amber-400/50 blur-xl"
              style={{ animation: "eom-pulse-glow 2.6s ease-in-out infinite" }}
            />
            {/* rotating conic ring */}
            <div
              className="absolute -inset-1 rounded-full opacity-70 [background:conic-gradient(from_0deg,hsl(45_95%_60%),hsl(var(--primary)),hsl(45_95%_60%),hsl(38_92%_50%),hsl(45_95%_60%))]"
              style={{ animation: "eom-rotate 8s linear infinite" }}
            />
            <div className="relative h-20 w-20 overflow-hidden rounded-full border-2 border-amber-100/90 bg-white shadow-[0_8px_30px_-6px_hsl(38_92%_45%/0.6)] transition-transform duration-300 group-hover:scale-105 md:h-28 md:w-28">
              <img
                src={badgeAsset.url}
                alt="Employee of the Month July 2026 — Sabeel Khan"
                className="h-full w-full scale-105 object-contain"
              />
            </div>
            <Sparkles
              className="absolute -right-2 -top-1 h-5 w-5 fill-amber-300 text-amber-500 drop-shadow"
              style={{ animation: "eom-sparkle 2.2s ease-in-out infinite" }}
            />
            <Sparkles
              className="absolute -left-2 bottom-2 h-4 w-4 fill-amber-200 text-amber-400"
              style={{ animation: "eom-sparkle 2.8s ease-in-out infinite .6s" }}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-400/25 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-amber-800 shadow-sm dark:text-amber-200 md:text-[11px]">
                <Trophy className="h-3.5 w-3.5" />
                Employee of the Month
              </span>
              <span className="rounded-full bg-background/60 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300 md:text-xs">
                July 2026
              </span>
            </div>

            <div className="mt-1.5 flex items-center gap-2">
              <PartyPopper className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 md:h-6 md:w-6" />
              <span className="bg-[linear-gradient(92deg,hsl(38_92%_38%),hsl(45_95%_52%),hsl(var(--primary)),hsl(38_92%_38%))] bg-clip-text text-2xl font-extrabold tracking-tight text-transparent drop-shadow-sm md:text-4xl">
                Sabeel Khan
              </span>
            </div>

            <div className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-900/70 dark:text-amber-100/70 md:text-sm">
              <span>Congratulations! Celebrating outstanding performance and dedication</span>
              <ChevronRight className="h-4 w-4 text-amber-600 transition-transform group-hover:translate-x-1" />
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
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-amber-900/60 transition-colors hover:bg-amber-400/25 hover:text-foreground dark:text-amber-100/60 md:right-4"
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
