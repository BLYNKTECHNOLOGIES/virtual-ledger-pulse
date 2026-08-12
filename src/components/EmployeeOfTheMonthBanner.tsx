import { useState } from "react";
import { X, Trophy } from "lucide-react";
import eomAsset from "@/assets/eom-july-2026.jpeg.asset.json";
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
      <div className="relative z-30 flex items-center gap-3 border-b border-primary/20 bg-primary/10 px-3 py-1.5 md:px-4">
        <Trophy className="h-4 w-4 shrink-0 text-primary" />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <img
            src={eomAsset.url}
            alt="Employee of the Month July 2026 — Sabeel Khan"
            className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-primary/30"
          />
          <span className="truncate text-xs md:text-sm">
            <span className="font-semibold text-foreground">Employee of the Month — July 2026:</span>{" "}
            <span className="text-foreground">Sabeel Khan</span>
            <span className="ml-2 hidden text-muted-foreground sm:inline">Tap to view the announcement</span>
          </span>
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
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-primary/15 hover:text-foreground"
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
