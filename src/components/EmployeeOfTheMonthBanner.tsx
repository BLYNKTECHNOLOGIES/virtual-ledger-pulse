import { useState } from "react";
import { X, Trophy, Sparkles, Star } from "lucide-react";
import eomAsset from "@/assets/eom-july-2026.jpeg.asset.json";
import portraitAsset from "@/assets/sabeel-eom-portrait.png.asset.json";
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
  { left: "6%", delay: "0s", color: "bg-primary" },
  { left: "14%", delay: "0.6s", color: "bg-amber-400" },
  { left: "23%", delay: "1.2s", color: "bg-emerald-400" },
  { left: "34%", delay: "0.3s", color: "bg-primary" },
  { left: "46%", delay: "1.5s", color: "bg-amber-400" },
  { left: "58%", delay: "0.9s", color: "bg-sky-400" },
  { left: "69%", delay: "0.2s", color: "bg-emerald-400" },
  { left: "78%", delay: "1.1s", color: "bg-primary" },
  { left: "88%", delay: "0.5s", color: "bg-amber-400" },
  { left: "95%", delay: "1.4s", color: "bg-sky-400" },
];

export function EmployeeOfTheMonthBanner() {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(() => !isDismissed());

  if (!visible) return null;

  return (
    <>
      <div className="relative z-30 w-full overflow-hidden border-b border-primary/30 bg-gradient-to-r from-primary/20 via-primary/10 to-amber-400/15">
        {/* celebratory glow */}
        <div className="pointer-events-none absolute -left-24 top-1/2 h-56 w-56 -translate-y-1/2 rounded-full bg-primary/25 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 top-1/2 h-56 w-56 -translate-y-1/2 rounded-full bg-amber-400/20 blur-3xl" />

        {/* confetti */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {CONFETTI.map((c, i) => (
            <span
              key={i}
              className={`absolute top-0 h-2 w-1.5 rounded-[1px] opacity-70 ${c.color}`}
              style={{
                left: c.left,
                animation: `eom-fall 4.5s linear ${c.delay} infinite`,
              }}
            />
          ))}
        </div>

        <style>{`@keyframes eom-fall{0%{transform:translateY(-120%) rotate(0deg);opacity:0}15%{opacity:.8}100%{transform:translateY(340%) rotate(420deg);opacity:0}}`}</style>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative flex w-full items-center gap-4 px-4 py-4 text-left md:gap-6 md:px-8 md:py-6"
        >
          <div className="relative shrink-0">
            <div className="absolute -inset-1 rounded-full bg-gradient-to-tr from-primary via-sky-400 to-amber-300 opacity-80 blur-[2px]" />
            <img
              src={portraitAsset.url}
              alt="Employee of the Month July 2026 — Sabeel Khan"
              className="relative h-16 w-16 rounded-full border-2 border-background object-cover object-top shadow-lg md:h-24 md:w-24"
            />
            <Trophy className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-amber-400 p-1 text-amber-950 shadow md:h-7 md:w-7" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              <span className="truncate text-[10px] font-bold uppercase tracking-[0.2em] text-primary md:text-xs">
                Employee of the Month · July 2026
              </span>
            </div>
            <div className="mt-1 truncate text-xl font-extrabold tracking-tight text-foreground md:text-3xl">
              Sabeel Khan
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground md:text-sm">
              <span className="flex items-center gap-0.5 text-amber-500">
                {[0, 1, 2, 3, 4].map((s) => (
                  <Star key={s} className="h-3 w-3 fill-current md:h-3.5 md:w-3.5" />
                ))}
              </span>
              <span className="truncate">
                Congratulations on outstanding performance — tap to view the announcement
              </span>
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
          className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-primary/15 hover:text-foreground md:right-3 md:top-3"
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
