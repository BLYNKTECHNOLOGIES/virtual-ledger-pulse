import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { cn } from "@/lib/utils";
import { INTENT_META, istIso, istYmd, type IntentTone, type ReplyIntent } from "@/lib/ats/conversations";

const TONE: Record<IntentTone, { pill: string; icon: string }> = {
  primary: { pill: "bg-primary/10 ring-primary/25", icon: "text-primary" },
  success: { pill: "bg-success/10 ring-success/25", icon: "text-success" },
  warning: { pill: "bg-warning/10 ring-warning/30", icon: "text-warning" },
  destructive: { pill: "bg-destructive/10 ring-destructive/25", icon: "text-destructive" },
  info: { pill: "bg-info/10 ring-info/25", icon: "text-info" },
  neutral: { pill: "bg-muted ring-border", icon: "text-muted-foreground" },
};

/** Reply-intent chip (label · icon · tone from INTENT_META). */
export function IntentChip({ intent, size = "md", menu, className, title }: { intent: ReplyIntent; size?: "sm" | "md"; menu?: boolean; className?: string; title?: string }) {
  const m = INTENT_META[intent];
  const t = TONE[m.tone];
  return (
    <span title={title ?? m.hint} className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full font-medium text-foreground ring-1 ring-inset",
      size === "sm" ? "h-5 px-2 text-[11px]" : "h-6 px-2.5 text-xs", t.pill, className)}>
      <m.icon className={cn(size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5", "shrink-0", t.icon)} aria-hidden />
      {m.label}
      {menu && <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />}
    </span>
  );
}

/** "Pick date and time…" — IST date + time, returns an ISO timestamp in the future. */
export function PickTimeDialog({ open, onOpenChange, title, confirmLabel = "Save", onPick }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; confirmLabel?: string; onPick: (iso: string) => void;
}) {
  const [date, setDate] = useState(() => istYmd(new Date(), 1));
  const [time, setTime] = useState("10:00");
  const iso = date && time ? istIso(date, time) : null;
  const future = !!iso && new Date(iso).getTime() > Date.now();
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={title}
      footer={<>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button disabled={!future} onClick={() => { if (iso) { onPick(iso); onOpenChange(false); } }}>{confirmLabel}</Button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="pick-date">Date</Label><Input id="pick-date" type="date" value={date} min={istYmd(new Date())} onChange={(e) => setDate(e.target.value)} className="text-foreground" /></div>
        <div className="space-y-1"><Label htmlFor="pick-time">Time (IST)</Label><Input id="pick-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="text-foreground" /></div>
      </div>
      {!future && <p className="mt-2 text-xs text-destructive">Pick a time in the future.</p>}
    </ResponsiveDialog>
  );
}
