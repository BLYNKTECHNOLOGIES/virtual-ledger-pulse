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
  { left: "10%", delay: "0s", dur: "5.5s", cls: "bg-primary/60" },
  { left: "22%", delay: "1.4s", dur: "6.2s", cls: "bg-primary-foreground/70" },
  { left: "36%", delay: "2.8s", dur: "5.8s", cls: "bg-secondary/50" },
  { left: "48%", delay: "0.7s", dur: "6.5s", cls: "bg-primary/50" },
  { left: "61%", delay: "3.2s", dur: "5.4s", cls: "bg-primary-foreground/60" },
  { left: "74%", delay: "1.9s", dur: "6.1s", cls: "bg-secondary/50" },
  { left: "86%", delay: "0.4s", dur: "5.9s", cls: "bg-primary/55" },
  { left: "95%", delay: "2.3s", dur: "6.4s", cls: "bg-primary-foreground/70" },
];

export function EmployeeOfTheMonthBanner() {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(() => !isDismissed());

  if (!visible) return null;

  return (
    <>
      <div className="relative z-30 w-full overflow-hidden border-b border-primary/20 bg-gradient-to-r from-primary/25 via-primary/8 to-secondary/15">
        <style>{`
          @keyframes eom-shimmer { 0% { transform: translateX(-120%); } 100% { transform: translateX(520%); } }
          @keyframes eom-pulse-glow { 0%,100% { opacity:.35; transform:scale(1);} 50% { opacity:.85; transform:scale(1.06);} }
          @keyframes eom-sparkle { 0%,100% { opacity:.15; transform:scale(.7);} 50% { opacity:1; transform:scale(1.25);} }
          @keyframes eom-confetti { 0% { transform:translateY(-16px) rotate(0deg); opacity:0;} 12% { opacity:.85;} 88% { opacity:.85;} 100% { transform:translateY(150px) rotate(420deg); opacity:0;} }
        `}</style>

        {/* ambient spotlight */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-8 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute right-1/4 top-1/2 h-56 w-56 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_25%_50%,hsl(var(--primary)/0.16),transparent_60%)]" />

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

        {/* top shimmer line */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent">
          <div
            className="h-full w-1/4 bg-gradient-to-r from-transparent via-primary-foreground/80 to-transparent"
            style={{ animation: "eom-shimmer 3.5s ease-in-out infinite" }}
          />
        </div>

        {/* bottom ribbon accent */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group relative flex w-full items-center gap-4 px-4 py-4 pr-12 text-left md:gap-6 md:px-8 md:py-5"
        >
          {/* badge */}
          <div className="relative shrink-0 animate-float-y">
            <div
              className="absolute -inset-2 rounded-full bg-primary/20 blur-xl"
              style={{ animation: "eom-pulse-glow 3s ease-in-out infinite" }}
            />
            <div className="relative h-20 w-20 overflow-hidden rounded-full bg-primary/10 ring-2 ring-primary/50 ring-offset-2 ring-offset-background shadow-xl transition-transform duration-300 group-hover:scale-105 md:h-24 md:w-24">
              <img
                src={badgeAsset.url}
                alt="Employee of the Month July 2026 — Sabeel Khan"
                className="h-full w-full scale-105 object-contain"
              />
            </div>
            <Sparkles
              className="absolute -right-2 -top-1 h-5 w-5 fill-primary text-primary drop-shadow"
              style={{ animation: "eom-sparkle 2.2s ease-in-out infinite" }}
            />
            <Sparkles
              className="absolute -left-2 bottom-2 h-4 w-4 fill-primary/60 text-primary/80"
              style={{ animation: "eom-sparkle 2.8s ease-in-out infinite .6s" }}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground md:text-[11px]">
                <Trophy className="h-3 w-3" />
                Employee of the Month
              </span>
              <span className="rounded-full bg-secondary/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground md:text-xs">
                July 2026
              </span>
            </div>

            <div className="mt-1.5 flex items-center gap-2">
              <PartyPopper className="h-5 w-5 shrink-0 text-primary md:h-6 md:w-6" />
              <span className="text-2xl font-extrabold tracking-tight text-foreground md:text-4xl" style={{ textShadow: "0 2px 14px hsl(var(--primary)/0.35)" }}>
                Sabeel Khan
              </span>
            </div>

            <div className="mt-1 flex items-center gap-1 text-xs font-medium text-muted-foreground md:text-sm">
              <span>Congratulations! Celebrating outstanding performance and dedication</span>
              <ChevronRight className="h-4 w-4 text-primary transition-transform group-hover:translate-x-1" />
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
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:right-4"
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
